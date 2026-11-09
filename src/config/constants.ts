/**
 * Trounce acoustic and upload limits
 */
export const ACOUSTIC_THRESHOLDS = {
  silence: 0.15,
  hesitation: 0.35,
  sampleIntervalMs: 200,
  targetWaveformBars: 56,
  minDurationSec: 5,
  /** Recording stops automatically at this length so an abandoned session cannot grow forever. */
  maxDurationSec: 600,
} as const;

const MB = 1024 * 1024;

/**
 * Upload limits, in bytes.
 * 600s of Opus at 128 kbit/s is about 9.6 MB, or 12.8 MB once base64 encoded.
 */
export const UPLOAD_LIMITS = {
  /** Largest stored recording, as a base64 data URI. */
  maxAudioDataUriBytes: 24 * MB,
  /** Largest clip accepted for transcription, as base64. */
  maxTranscribeBase64Bytes: 24 * MB,
  /** Hard ceiling on any server-function request body. */
  maxRequestBytes: 32 * MB,
} as const;

/** Audio types we accept and will serve back. Everything else is rejected on upload. */
export const ALLOWED_AUDIO_MIME_TYPES = [
  "audio/webm",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mpeg",
  "audio/aac",
  "audio/x-m4a",
] as const;

/** Strips codec parameters: "audio/webm;codecs=opus" becomes "audio/webm". Null if not allowed. */
export function normalizeAudioMime(mime: string | null | undefined): string | null {
  const base = (mime ?? "").split(";")[0].trim().toLowerCase();
  return (ALLOWED_AUDIO_MIME_TYPES as readonly string[]).includes(base) ? base : null;
}
