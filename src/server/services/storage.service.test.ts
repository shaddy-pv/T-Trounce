import { describe, it, expect } from "vitest";
import { StorageService } from "./storage.service";
import { TranscriptionService } from "./transcription.service";

describe("StorageService & Persistent Audio Upload", () => {
  it("stores audio binary buffer and returns streamable permanent URL", async () => {
    const mockAudioBytes = Buffer.from("RIFF_MOCK_AUDIO_DATA_FOR_TESTING");
    const stored = await StorageService.saveAudio(mockAudioBytes, "test.webm", "audio/webm");

    expect(stored.audioId).toBeDefined();
    expect(stored.url).toBe(`/api/audio/${stored.audioId}`);
    expect(stored.size).toBe(mockAudioBytes.length);
    expect(stored.mimeType).toBe("audio/webm");

    // Test streaming retrieval
    const streamRes = await StorageService.getAudioStream(stored.audioId);
    expect(streamRes).not.toBeNull();
    expect(streamRes?.status).toBe(200);
    expect(streamRes?.contentType).toBe("audio/webm");
    expect(streamRes?.contentLength).toBe(mockAudioBytes.length);
  });

  it("handles HTTP 206 Partial Content range requests for audio scrubbing", async () => {
    const mockAudioBytes = Buffer.from("01234567890123456789");
    const stored = await StorageService.saveAudio(mockAudioBytes, "range_test.webm", "audio/webm");

    // Request bytes 5-10
    const rangeRes = await StorageService.getAudioStream(stored.audioId, "bytes=5-10");
    expect(rangeRes).not.toBeNull();
    expect(rangeRes?.status).toBe(206);
    expect(rangeRes?.contentLength).toBe(6);
    expect(rangeRes?.contentRange).toBe(`bytes 5-10/${mockAudioBytes.length}`);
  });

  it("returns null for non-existent audio ID", async () => {
    const streamRes = await StorageService.getAudioStream("non_existent_audio_id_123");
    expect(streamRes).toBeNull();
  });
});

describe("TranscriptionService", () => {
  it("detects common filler words accurately", () => {
    const text = "Hello um I actually think that uh this speech is like very clear matlab.";
    const count = TranscriptionService.countFillers(text);
    // Fillers present: um, actually, uh, like, matlab = 5
    expect(count).toBe(5);
  });

  it("generates transcription and acoustic metrics from audio buffer", async () => {
    const mockBuffer = Buffer.from(new Uint8Array(40000));
    const result = await TranscriptionService.transcribeAudio(
      mockBuffer,
      "audio/webm",
      "Describe your hometown",
    );

    expect(result.status).toBe("completed");
    expect(result.transcript).toContain("Describe your hometown");
    expect(result.fillerCount).toBeGreaterThanOrEqual(1);
    expect(result.pauseCount).toBeGreaterThanOrEqual(1);
  });
});
