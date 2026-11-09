import { GridFSBucket } from "mongodb";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import type { Readable } from "stream";
import { normalizeAudioMime, UPLOAD_LIMITS } from "@/config/constants";
import { getDb } from "../db/client";
import { AppError, serviceUnavailable } from "../errors";

export interface StoredAudioMeta {
  audioId: string;
  url: string;
  size: number;
  mimeType: string;
  filename: string;
  createdAt: Date;
}

export interface AudioStreamResponse {
  /** Opens the response body. Lazy, so nothing is held open if the body is never read. */
  open: () => Readable | Buffer;
  contentType: string;
  contentLength: number;
  contentRange?: string;
  status: number;
  acceptRanges: string;
}

const BUCKET_NAME = "audio_recordings";
const DEFAULT_MIME = "audio/webm";

/** Local disk cache. MongoDB GridFS is the durable copy; this disk may not survive a restart. */
const STORAGE_DIR = path.resolve(
  process.env.AUDIO_STORAGE_DIR || path.join(process.cwd(), ".storage", "audio"),
);

/** Audio IDs become file names, so only safe characters are ever accepted. */
const AUDIO_ID_PATTERN = /^[A-Za-z0-9_-]{1,100}$/;

const audioPath = (audioId: string) => path.join(STORAGE_DIR, `${audioId}.bin`);
const metaPath = (audioId: string) => path.join(STORAGE_DIR, `${audioId}.meta`);

export function isValidAudioId(audioId: string): boolean {
  return AUDIO_ID_PATTERN.test(audioId);
}

/**
 * Parses a "data:audio/...;base64,..." URI. The declared type must be on the audio allow-list,
 * which stops a client from storing HTML or script that would later be served from our origin.
 */
export function parseAudioDataUri(dataUri: string): { buffer: Buffer; mimeType: string } {
  const comma = dataUri.indexOf(",");
  const header = comma > 0 ? dataUri.slice(0, comma) : "";
  if (!header.startsWith("data:") || !header.endsWith(";base64")) {
    throw new AppError("Unsupported audio data format.", 415);
  }

  const mimeType = normalizeAudioMime(header.slice("data:".length, -";base64".length));
  if (!mimeType) throw new AppError("Unsupported audio format.", 415);

  return { buffer: Buffer.from(dataUri.slice(comma + 1), "base64"), mimeType };
}

/**
 * Parses a single-range HTTP Range header (RFC 9110).
 * Returns null to serve the whole file, or "unsatisfiable" for a 416.
 */
export function parseRangeHeader(
  header: string | undefined,
  totalSize: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  // Other units and multi-range requests are ignored, which the RFC permits.
  if (!match || (match[1] === "" && match[2] === "")) return null;

  if (match[1] === "") {
    // Suffix form: "bytes=-500" means the last 500 bytes.
    const suffix = Number(match[2]);
    if (suffix === 0 || totalSize === 0) return "unsatisfiable";
    return { start: Math.max(0, totalSize - suffix), end: totalSize - 1 };
  }

  const start = Number(match[1]);
  const end = match[2] === "" ? totalSize - 1 : Math.min(Number(match[2]), totalSize - 1);
  if (start >= totalSize || start > end) return "unsatisfiable";
  return { start, end };
}

/** Best-effort type detection for cached files that predate the metadata file. */
function sniffAudioMime(head: Buffer): string {
  if (head.length >= 4 && head.readUInt32BE(0) === 0x1a45dfa3) return "audio/webm";
  if (head.length >= 8 && head.toString("latin1", 4, 8) === "ftyp") return "audio/mp4";
  if (head.toString("latin1", 0, 4) === "RIFF") return "audio/wav";
  if (head.toString("latin1", 0, 4) === "OggS") return "audio/ogg";
  if (head.toString("latin1", 0, 3) === "ID3") return "audio/mpeg";
  return DEFAULT_MIME;
}

async function writeToDisk(audioId: string, buffer: Buffer, mimeType: string): Promise<boolean> {
  try {
    await fs.promises.mkdir(STORAGE_DIR, { recursive: true });
    await fs.promises.writeFile(audioPath(audioId), buffer);
    await fs.promises.writeFile(metaPath(audioId), mimeType);
    return true;
  } catch (err) {
    console.warn("[StorageService] Could not write to disk cache:", (err as Error).message);
    return false;
  }
}

/**
 * Uploads to GridFS and waits for the result. Resolves false instead of throwing, and always has
 * an error listener: a stream error with no listener would crash the whole server process.
 */
async function uploadToGridFS(
  audioId: string,
  filename: string,
  buffer: Buffer,
  mimeType: string,
): Promise<boolean> {
  try {
    const db = await getDb();
    if (!db) return false;

    const bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
    await new Promise<void>((resolve, reject) => {
      const upload = bucket.openUploadStream(filename, {
        metadata: { audioId, mimeType, size: buffer.length, createdAt: new Date() },
      });
      upload.once("error", reject);
      upload.once("finish", () => resolve());
      upload.end(buffer);
    });
    return true;
  } catch (err) {
    console.warn("[StorageService] GridFS upload failed:", (err as Error).message);
    return false;
  }
}

async function downloadFromGridFS(
  audioId: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  try {
    const db = await getDb();
    if (!db) return null;

    const bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
    const [file] = await bucket.find({ "metadata.audioId": audioId }).limit(1).toArray();
    if (!file) return null;

    const chunks: Buffer[] = [];
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      const download = bucket.openDownloadStream(file._id);
      download.on("data", (chunk: Buffer) => chunks.push(chunk));
      download.once("error", reject);
      download.once("end", () => resolve(Buffer.concat(chunks)));
    });

    const storedMime = normalizeAudioMime(file.metadata?.mimeType as string | undefined);
    return { buffer, mimeType: storedMime ?? sniffAudioMime(buffer) };
  } catch (err) {
    console.error("[StorageService] GridFS download failed:", (err as Error).message);
    return null;
  }
}

async function readDiskMime(audioId: string, filePath: string): Promise<string> {
  try {
    const stored = normalizeAudioMime(await fs.promises.readFile(metaPath(audioId), "utf8"));
    if (stored) return stored;
  } catch {
    // Older cache entries have no metadata file; detect the type from the file itself.
  }

  const handle = await fs.promises.open(filePath, "r");
  try {
    const head = Buffer.alloc(16);
    await handle.read(head, 0, head.length, 0);
    return sniffAudioMime(head);
  } finally {
    await handle.close();
  }
}

type LocatedAudio =
  | { kind: "disk"; filePath: string; size: number; mimeType: string }
  | { kind: "memory"; buffer: Buffer; size: number; mimeType: string };

/** Finds a recording on disk, or fetches it from GridFS and caches it on disk. */
async function locateAudio(audioId: string): Promise<LocatedAudio | null> {
  if (!isValidAudioId(audioId)) return null;

  const filePath = audioPath(audioId);
  const size = await fs.promises.stat(filePath).then(
    (s) => s.size,
    () => 0,
  );
  if (size > 0) {
    return { kind: "disk", filePath, size, mimeType: await readDiskMime(audioId, filePath) };
  }

  const downloaded = await downloadFromGridFS(audioId);
  if (!downloaded || downloaded.buffer.length === 0) return null;

  const cached = await writeToDisk(audioId, downloaded.buffer, downloaded.mimeType);
  return cached
    ? { kind: "disk", filePath, size: downloaded.buffer.length, mimeType: downloaded.mimeType }
    : {
        kind: "memory",
        buffer: downloaded.buffer,
        size: downloaded.buffer.length,
        mimeType: downloaded.mimeType,
      };
}

export class StorageService {
  /**
   * Saves a recording to the disk cache and to GridFS, waiting for both to finish.
   * Succeeds if at least one copy was written and throws if neither was.
   */
  static async saveAudio(
    audioData: Buffer | Uint8Array | string,
    filename: string = "recording.webm",
    mimeType: string = DEFAULT_MIME,
  ): Promise<StoredAudioMeta> {
    let buffer: Buffer;
    let finalMime: string | null;

    if (typeof audioData === "string") {
      if (audioData.length > UPLOAD_LIMITS.maxAudioDataUriBytes) {
        throw new AppError("This recording is too large to upload.", 413);
      }
      const parsed = parseAudioDataUri(audioData);
      buffer = parsed.buffer;
      finalMime = parsed.mimeType;
    } else {
      buffer = Buffer.isBuffer(audioData) ? audioData : Buffer.from(audioData);
      finalMime = normalizeAudioMime(mimeType);
    }

    if (!finalMime) throw new AppError("Unsupported audio format.", 415);
    if (buffer.length === 0) throw new AppError("This recording is empty.", 400);

    const audioId = `audio-${Date.now()}-${randomUUID().slice(0, 12)}`;
    const sanitizedFilename = `${audioId}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

    const [onDisk, inDatabase] = await Promise.all([
      writeToDisk(audioId, buffer, finalMime),
      uploadToGridFS(audioId, sanitizedFilename, buffer, finalMime),
    ]);

    if (!onDisk && !inDatabase) {
      throw serviceUnavailable("Your recording could not be stored. Please try again.");
    }

    return {
      audioId,
      url: `/api/audio/${audioId}`,
      size: buffer.length,
      mimeType: finalMime,
      filename: sanitizedFilename,
      createdAt: new Date(),
    };
  }

  /**
   * Prepares a streamed response, with HTTP 206 range support for seeking.
   * Only the requested bytes are read, not the whole file.
   */
  static async getAudioStream(
    audioId: string,
    rangeHeader?: string,
  ): Promise<AudioStreamResponse | null> {
    const audio = await locateAudio(audioId);
    if (!audio) return null;

    const range = parseRangeHeader(rangeHeader, audio.size);

    if (range === "unsatisfiable") {
      return {
        open: () => Buffer.alloc(0),
        contentType: audio.mimeType,
        contentLength: 0,
        contentRange: `bytes */${audio.size}`,
        status: 416,
        acceptRanges: "bytes",
      };
    }

    const start = range?.start ?? 0;
    const end = range?.end ?? audio.size - 1;

    return {
      open: () =>
        audio.kind === "disk"
          ? fs.createReadStream(audio.filePath, { start, end })
          : audio.buffer.subarray(start, end + 1),
      contentType: audio.mimeType,
      contentLength: end - start + 1,
      contentRange: range ? `bytes ${start}-${end}/${audio.size}` : undefined,
      status: range ? 206 : 200,
      acceptRanges: "bytes",
    };
  }

  /** Reads a whole recording into memory, for transcription. */
  static async getAudioBuffer(
    audioId: string,
  ): Promise<{ buffer: Buffer; mimeType: string } | null> {
    const audio = await locateAudio(audioId);
    if (!audio) return null;
    const buffer =
      audio.kind === "disk" ? await fs.promises.readFile(audio.filePath) : audio.buffer;
    return { buffer, mimeType: audio.mimeType };
  }

  /** Deletes a recording from the disk cache and GridFS. */
  static async deleteAudio(audioId: string): Promise<boolean> {
    if (!isValidAudioId(audioId)) return false;

    await Promise.all(
      [audioPath(audioId), metaPath(audioId)].map((file) =>
        fs.promises.unlink(file).catch(() => {}),
      ),
    );

    try {
      const db = await getDb();
      if (db) {
        const bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
        const files = await bucket.find({ "metadata.audioId": audioId }).toArray();
        await Promise.all(files.map((file) => bucket.delete(file._id)));
      }
      return true;
    } catch (err) {
      console.error("[StorageService.deleteAudio] Failed:", (err as Error).message);
      return false;
    }
  }
}
