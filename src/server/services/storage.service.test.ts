import { describe, it, expect } from "vitest";
import { Readable } from "stream";
import { getDb } from "../db/client";
import { AppError } from "../errors";
import {
  StorageService,
  isValidAudioId,
  parseAudioDataUri,
  parseRangeHeader,
} from "./storage.service";
import { TranscriptionService } from "./transcription.service";
import fs from "fs";
import path from "path";

async function readBody(body: Readable | Buffer): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const chunk of body) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

const dataUri = (mime: string, content: string) =>
  `data:${mime};base64,${Buffer.from(content).toString("base64")}`;

describe("StorageService", () => {
  it("stores audio and returns a streamable URL", async () => {
    const bytes = Buffer.from("RIFF_MOCK_AUDIO_DATA_FOR_TESTING");
    const stored = await StorageService.saveAudio(bytes, "test.webm", "audio/webm");

    expect(stored.url).toBe(`/api/audio/${stored.audioId}`);
    expect(stored.size).toBe(bytes.length);
    expect(stored.mimeType).toBe("audio/webm");

    const res = await StorageService.getAudioStream(stored.audioId);
    expect(res?.status).toBe(200);
    expect(res?.contentType).toBe("audio/webm");
    expect(res?.contentLength).toBe(bytes.length);
    expect((await readBody(res!.open() as Readable)).equals(bytes)).toBe(true);
  });

  it("waits for GridFS, so a recording survives losing the disk cache", async () => {
    const bytes = Buffer.from("durable-copy-in-gridfs");
    const stored = await StorageService.saveAudio(bytes, "d.mp4", "audio/mp4");

    // Simulates a container restart: the local disk is gone, only the database remains.
    const dir = process.env.AUDIO_STORAGE_DIR as string;
    await fs.promises.unlink(path.join(dir, `${stored.audioId}.bin`));
    await fs.promises.unlink(path.join(dir, `${stored.audioId}.meta`));

    const res = await StorageService.getAudioStream(stored.audioId);
    expect(res?.contentType).toBe("audio/mp4");
    expect((await readBody(res!.open() as Readable)).equals(bytes)).toBe(true);
  });

  it("keeps the real type on repeat requests, so iPhone recordings stay playable", async () => {
    const stored = await StorageService.saveAudio(Buffer.from("mp4-bytes"), "a.mp4", "audio/mp4");
    const first = await StorageService.getAudioStream(stored.audioId);
    const second = await StorageService.getAudioStream(stored.audioId);
    expect(first?.contentType).toBe("audio/mp4");
    expect(second?.contentType).toBe("audio/mp4");
  });

  it("returns only the requested bytes for a range request", async () => {
    const stored = await StorageService.saveAudio(
      Buffer.from("01234567890123456789"),
      "r.webm",
      "audio/webm",
    );

    const middle = await StorageService.getAudioStream(stored.audioId, "bytes=5-10");
    expect(middle?.status).toBe(206);
    expect(middle?.contentLength).toBe(6);
    expect(middle?.contentRange).toBe("bytes 5-10/20");
    expect((await readBody(middle!.open() as Readable)).toString()).toBe("567890");

    const beyondEnd = await StorageService.getAudioStream(stored.audioId, "bytes=30-40");
    expect(beyondEnd?.status).toBe(416);
    expect(beyondEnd?.contentRange).toBe("bytes */20");
  });

  it("returns null for an unknown audio ID", async () => {
    expect(await StorageService.getAudioStream("non_existent_audio_id_123")).toBeNull();
  });

  it("refuses path traversal in audio IDs", async () => {
    expect(isValidAudioId("../../etc/passwd")).toBe(false);
    expect(isValidAudioId("..\\..\\secret")).toBe(false);
    expect(await StorageService.getAudioStream("../../etc/passwd")).toBeNull();
    expect(await StorageService.getAudioBuffer("../secret")).toBeNull();
    expect(await StorageService.deleteAudio("../secret")).toBe(false);
  });

  it("rejects non-audio uploads, which could otherwise run as script from our origin", async () => {
    await expect(
      StorageService.saveAudio(dataUri("text/html", "<script>alert(1)</script>")),
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      StorageService.saveAudio(dataUri("image/svg+xml", "<svg onload=alert(1)>")),
    ).rejects.toBeInstanceOf(AppError);
    await expect(StorageService.saveAudio("not a data uri")).rejects.toBeInstanceOf(AppError);
  });

  it("rejects an empty recording", async () => {
    await expect(StorageService.saveAudio(dataUri("audio/webm", ""))).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("deletes the recording from both disk and database", async () => {
    const stored = await StorageService.saveAudio(Buffer.from("gone"), "g.webm", "audio/webm");
    expect(await StorageService.deleteAudio(stored.audioId)).toBe(true);
    expect(await StorageService.getAudioStream(stored.audioId)).toBeNull();

    const db = await getDb();
    const leftovers = await db!
      .collection("audio_recordings.files")
      .countDocuments({ "metadata.audioId": stored.audioId });
    expect(leftovers).toBe(0);
  });
});

describe("parseAudioDataUri", () => {
  it("accepts audio with codec parameters, as browsers send it", () => {
    const parsed = parseAudioDataUri(dataUri("audio/webm;codecs=opus", "abc"));
    expect(parsed.mimeType).toBe("audio/webm");
    expect(parsed.buffer.toString()).toBe("abc");
  });

  it("rejects anything that is not base64 audio", () => {
    expect(() => parseAudioDataUri("data:audio/webm,plain")).toThrow(AppError);
    expect(() => parseAudioDataUri(dataUri("application/javascript", "x"))).toThrow(AppError);
  });
});

describe("parseRangeHeader (RFC 9110)", () => {
  it.each([
    ["bytes=0-9", 100, { start: 0, end: 9 }],
    ["bytes=90-", 100, { start: 90, end: 99 }],
    ["bytes=-5", 100, { start: 95, end: 99 }],
    ["bytes=-500", 100, { start: 0, end: 99 }],
    ["bytes=90-5000", 100, { start: 90, end: 99 }],
  ])("%s of %i bytes", (header, size, expected) => {
    expect(parseRangeHeader(header, size)).toEqual(expected);
  });

  it.each([["bytes=100-"], ["bytes=50-10"], ["bytes=-0"]])("%s is unsatisfiable", (header) => {
    expect(parseRangeHeader(header, 100)).toBe("unsatisfiable");
  });

  it.each([[undefined], ["items=0-5"], ["bytes=0-1,5-6"], ["bytes=-"], ["nonsense"]])(
    "%s is ignored and serves the whole file",
    (header) => {
      expect(parseRangeHeader(header, 100)).toBeNull();
    },
  );
});

describe("TranscriptionService", () => {
  it("detects common filler words accurately", () => {
    const text = "Hello um I err think that uh this speech is hmm very clear matlab.";
    expect(TranscriptionService.countFillers(text)).toBe(5);
  });

  it("returns no transcript when no speech engine is available", async () => {
    const result = await TranscriptionService.transcribeAudio(
      Buffer.from(new Uint8Array(40000)),
      "audio/webm",
      "Describe your hometown",
    );

    expect(result.transcript).toBe("");
    expect(result.engineUsed).toBe("acoustic-analyzer");
    expect(result.pauseCount).toBeGreaterThanOrEqual(1);
  });
});
