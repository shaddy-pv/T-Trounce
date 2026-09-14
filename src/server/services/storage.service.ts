import { GridFSBucket, ObjectId } from "mongodb";
import { getDb } from "../db/client";
import fs from "fs";
import path from "path";

export interface StoredAudioMeta {
  audioId: string;
  url: string;
  size: number;
  mimeType: string;
  filename: string;
  createdAt: Date;
}

export interface AudioStreamResponse {
  stream: NodeJS.ReadableStream | Buffer;
  contentType: string;
  contentLength: number;
  contentRange?: string;
  status: number;
  acceptRanges: string;
}

// Local persistent filesystem cache directory
const STORAGE_DIR = path.resolve(process.cwd(), ".storage", "audio");

async function ensureStorageDir() {
  try {
    await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
  } catch {
    // directory exists or created concurrently
  }
}

export class StorageService {
  /**
   * Save an audio recording (Buffer, Uint8Array, or base64 Data URI) to persistent storage + MongoDB GridFS.
   * Performs non-blocking asynchronous I/O to avoid freezing the Node.js event loop.
   */
  static async saveAudio(
    audioData: Buffer | Uint8Array | string,
    filename: string = "recording.webm",
    mimeType: string = "audio/webm",
  ): Promise<StoredAudioMeta> {
    let buffer: Buffer;

    if (typeof audioData === "string") {
      if (audioData.startsWith("data:")) {
        const matches = audioData.match(/^data:([^;]+);base64,(.+)$/);
        if (matches) {
          mimeType = matches[1] || mimeType;
          buffer = Buffer.from(matches[2], "base64");
        } else {
          const commaIdx = audioData.indexOf(",");
          const base64Str = commaIdx >= 0 ? audioData.slice(commaIdx + 1) : audioData;
          buffer = Buffer.from(base64Str, "base64");
        }
      } else {
        buffer = Buffer.from(audioData, "base64");
      }
    } else if (Buffer.isBuffer(audioData)) {
      buffer = audioData;
    } else {
      buffer = Buffer.from(audioData);
    }

    const audioId = `audio-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const sanitizedFilename = `${audioId}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    // 1. Asynchronously cache to persistent local disk (non-blocking)
    try {
      await ensureStorageDir();
      const localFilePath = path.join(STORAGE_DIR, `${audioId}.bin`);
      await fs.promises.writeFile(localFilePath, buffer);
    } catch (e) {
      console.warn("[StorageService] Local disk cache write note:", e);
    }

    // 2. Persist to MongoDB GridFS for resilience across container restarts
    try {
      const db = await getDb();
      if (db) {
        const bucket = new GridFSBucket(db, { bucketName: "audio_recordings" });
        const uploadStream = bucket.openUploadStream(sanitizedFilename, {
          metadata: {
            audioId,
            mimeType,
            originalFilename: filename,
            size: buffer.length,
            createdAt: new Date(),
          },
        });

        await new Promise<void>((resolve, reject) => {
          uploadStream.on("error", reject);
          uploadStream.on("finish", () => resolve());
          uploadStream.end(buffer);
        });
      }
    } catch (err) {
      console.warn("[StorageService] GridFS write note (local cache used):", err);
    }

    return {
      audioId,
      url: `/api/audio/${audioId}`,
      size: buffer.length,
      mimeType,
      filename: sanitizedFilename,
      createdAt: new Date(),
    };
  }

  /**
   * Fetch audio stream with full HTTP 206 Partial Content range support for scrubbing/seeking.
   */
  static async getAudioStream(
    audioId: string,
    rangeHeader?: string,
  ): Promise<AudioStreamResponse | null> {
    let buffer: Buffer | null = null;
    let mimeType = "audio/webm";

    // 1. Try local disk cache first with async non-blocking read for zero-latency streaming
    try {
      await ensureStorageDir();
      const localFilePath = path.join(STORAGE_DIR, `${audioId}.bin`);
      buffer = await fs.promises.readFile(localFilePath);
    } catch {
      // fallback to GridFS if not on local disk
    }

    // 2. Fallback to MongoDB GridFS if not in disk cache
    if (!buffer) {
      try {
        const db = await getDb();
        if (db) {
          const bucket = new GridFSBucket(db, { bucketName: "audio_recordings" });
          const files = await bucket.find({ "metadata.audioId": audioId }).toArray();
          if (files.length > 0) {
            const fileDoc = files[0];
            mimeType = (fileDoc.metadata?.mimeType as string) || mimeType;

            const downloadStream = bucket.openDownloadStream(fileDoc._id);
            const chunks: Buffer[] = [];
            buffer = await new Promise<Buffer>((resolve, reject) => {
              downloadStream.on("data", (c) => chunks.push(Buffer.from(c)));
              downloadStream.on("error", reject);
              downloadStream.on("end", () => resolve(Buffer.concat(chunks)));
            });

            // Asynchronously cache to disk for subsequent requests
            try {
              await ensureStorageDir();
              await fs.promises.writeFile(path.join(STORAGE_DIR, `${audioId}.bin`), buffer);
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        console.error("[StorageService.getAudioStream Error]", err);
      }
    }

    if (!buffer || buffer.length === 0) {
      return null;
    }

    const totalSize = buffer.length;

    // Handle HTTP Range Requests (RFC 7233)
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10) || 0;
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;

      if (start >= totalSize || end >= totalSize) {
        return {
          stream: Buffer.alloc(0),
          contentType: mimeType,
          contentLength: 0,
          contentRange: `bytes */${totalSize}`,
          status: 416, // Range Not Satisfiable
          acceptRanges: "bytes",
        };
      }

      const chunk = buffer.subarray(start, end + 1);
      return {
        stream: chunk,
        contentType: mimeType,
        contentLength: chunk.length,
        contentRange: `bytes ${start}-${end}/${totalSize}`,
        status: 206, // Partial Content
        acceptRanges: "bytes",
      };
    }

    // Standard 200 OK Response
    return {
      stream: buffer,
      contentType: mimeType,
      contentLength: totalSize,
      status: 200,
      acceptRanges: "bytes",
    };
  }

  /**
   * Get raw audio buffer for transcription processing.
   */
  static async getAudioBuffer(
    audioId: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const streamRes = await this.getAudioStream(audioId);
    if (!streamRes) return null;

    if (Buffer.isBuffer(streamRes.stream)) {
      return { buffer: streamRes.stream, mimeType: streamRes.contentType };
    }
    return null;
  }

  /**
   * Delete an audio recording from GridFS and local cache.
   */
  static async deleteAudio(audioId: string): Promise<boolean> {
    try {
      await ensureStorageDir();
      const localFilePath = path.join(STORAGE_DIR, `${audioId}.bin`);
      try {
        await fs.promises.unlink(localFilePath);
      } catch {
        // file may already have been removed
      }

      const db = await getDb();
      if (db) {
        const bucket = new GridFSBucket(db, { bucketName: "audio_recordings" });
        const files = await bucket.find({ "metadata.audioId": audioId }).toArray();
        for (const f of files) {
          await bucket.delete(f._id);
        }
      }
      return true;
    } catch (err) {
      console.error("[StorageService.deleteAudio Error]", err);
      return false;
    }
  }
}
