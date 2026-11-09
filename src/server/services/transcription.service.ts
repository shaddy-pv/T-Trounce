import { env } from "@/config/env";
import { countFillerWords } from "@/lib/scoring";

export interface TranscriptionResult {
  transcript: string;
  fillerCount: number;
  pauseCount: number;
  confidence: number;
  status: "completed" | "failed";
  engineUsed: "local-whisper" | "gemini" | "openai-whisper" | "acoustic-analyzer";
}

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

/** URL of the optional FastWhisper Python sidecar */
const DEFAULT_PRODUCTION_SIDECAR_URL = "https://t-trounce.onrender.com";
let rawSidecarUrl = (process.env.WHISPER_SIDECAR_URL || "").trim();

if (process.env.NODE_ENV === "production") {
  if (
    !rawSidecarUrl ||
    rawSidecarUrl.includes("127.0.0.1") ||
    rawSidecarUrl.includes("localhost")
  ) {
    console.warn(
      `[TranscriptionService] WHISPER_SIDECAR_URL is not set to a remote host; student audio will be sent to the default sidecar at ${DEFAULT_PRODUCTION_SIDECAR_URL}.`,
    );
    rawSidecarUrl = DEFAULT_PRODUCTION_SIDECAR_URL;
  }
} else if (!rawSidecarUrl) {
  rawSidecarUrl = "http://127.0.0.1:8765";
}

const WHISPER_SIDECAR_URL = rawSidecarUrl.replace(/\/+$/, "");
const IS_LOCAL_SIDECAR =
  WHISPER_SIDECAR_URL.includes("127.0.0.1") || WHISPER_SIDECAR_URL.includes("localhost");

const WARMUP_INTERVAL_MS = 60 * 1000;
let lastWarmupAt = 0;

function sidecarHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    ...extra,
    ...(env.WHISPER_SIDECAR_TOKEN ? { Authorization: `Bearer ${env.WHISPER_SIDECAR_TOKEN}` } : {}),
  };
}

function baseMime(mimeType: string, fallback: string): string {
  return mimeType.split(";")[0].trim() || fallback;
}

/** Calls Gemini once. The API key goes in a header, so it cannot end up in a logged URL. */
async function transcribeWithGemini(
  audioBuffer: Buffer,
  mimeType: string,
  prompt: string,
  timeoutMs: number,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return "";

  try {
    const response = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: baseMime(mimeType, "audio/webm"),
                  data: audioBuffer.toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 2048 },
      }),
    });

    if (!response.ok) {
      console.warn("[TranscriptionService] Gemini returned HTTP", response.status);
      return "";
    }
    const data = await response.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
  } catch (err) {
    console.warn("[TranscriptionService] Gemini request failed:", (err as Error).name);
    return "";
  }
}

/** Calls OpenAI Whisper once. */
async function transcribeWithOpenAI(
  audioBuffer: Buffer,
  mimeType: string,
  prompt: string | undefined,
  timeoutMs: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return "";

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
    formData.append("file", blob, mimeType.includes("wav") ? "audio.wav" : "audio.webm");
    formData.append("model", "whisper-1");
    formData.append("language", "en");
    if (prompt) formData.append("prompt", prompt);

    const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      console.warn("[TranscriptionService] OpenAI returned HTTP", response.status);
      return "";
    }
    const data = await response.json();
    return (data.text ?? "").trim();
  } catch (err) {
    console.warn("[TranscriptionService] OpenAI request failed:", (err as Error).name);
    return "";
  }
}

export class TranscriptionService {
  /**
   * Returns the sidecar URL if it is reachable right now, otherwise null.
   */
  static async resolveWhisperUrl(): Promise<string | null> {
    try {
      const ping = await fetch(`${WHISPER_SIDECAR_URL}/health`, {
        headers: sidecarHeaders(),
        signal: AbortSignal.timeout(IS_LOCAL_SIDECAR ? 300 : 8000),
      });
      if (ping.ok) return WHISPER_SIDECAR_URL;
    } catch {
      // Sidecar not running
    }
    return null;
  }

  /**
   * Tries the FastWhisper sidecar. Returns null if it is unreachable, times out or hears nothing.
   */
  static async transcribeWithLocalWhisper(
    audioBuffer: Buffer,
    mimeType: string = "audio/wav",
    timeoutMs: number = 45000,
    promptContext?: string,
  ): Promise<{ text: string; confidence: number } | null> {
    try {
      const targetUrl = await this.resolveWhisperUrl();
      if (!targetUrl) return null;

      const response = await fetch(`${targetUrl}/transcribe`, {
        method: "POST",
        headers: sidecarHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          audio_b64: audioBuffer.toString("base64"),
          mime: baseMime(mimeType, "audio/wav"),
          prompt: promptContext,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });

      if (!response.ok) return null;
      const data = (await response.json()) as { text?: string; confidence?: number };
      const text = (data.text ?? "").trim();
      return text ? { text, confidence: data.confidence ?? 0.95 } : null;
    } catch {
      return null;
    }
  }

  /**
   * Wakes a sleeping remote sidecar without making the caller wait. Calls are throttled, so this
   * endpoint cannot be used to generate a stream of outbound requests.
   */
  static pingWarmup(): void {
    if (IS_LOCAL_SIDECAR || Date.now() - lastWarmupAt < WARMUP_INTERVAL_MS) return;
    lastWarmupAt = Date.now();
    void fetch(`${WHISPER_SIDECAR_URL}/health`, {
      headers: sidecarHeaders(),
      signal: AbortSignal.timeout(55000),
    }).catch(() => {});
  }

  /**
   * Transcribes a clip for the recording screen.
   *   - isFinal=true: post-recording accuracy pass with a thorough verbatim prompt
   *   - isFinal=false: fast live-caption chunk
   *
   * Engine priority: FastWhisper sidecar, then Gemini, then OpenAI Whisper.
   */
  static async transcribeChunk(
    audioBuffer: Buffer,
    mimeType: string = "audio/wav",
    promptContext?: string,
    _sequence: number = 0,
    isFinal: boolean = false,
  ): Promise<{ text: string; confidence: number; isFinal: boolean }> {
    const local = await this.transcribeWithLocalWhisper(
      audioBuffer,
      mimeType,
      isFinal ? 25000 : 3500,
      promptContext,
    );
    if (local) return { text: local.text, confidence: local.confidence, isFinal: true };

    const geminiPrompt = isFinal
      ? `You are an expert verbatim speech-to-text engine for Indian-accented English and Hinglish. Transcribe ALL spoken words in this audio EXACTLY as spoken, including filler words (um, uh, er, ah, hmm, matlab, yaani, haina), repetitions, and false starts. Do NOT correct grammar or add punctuation unless spoken. Return ONLY the raw spoken words as a single paragraph. If silent or unintelligible, return empty string. Context: "${promptContext || "English speaking practice"}"`
      : `Transcribe the spoken speech in this audio verbatim, including filler words (um, uh, matlab, hmm). Return only the recognized words as plain text. If silent, return empty.`;

    const geminiText = await transcribeWithGemini(
      audioBuffer,
      mimeType,
      geminiPrompt,
      isFinal ? 12000 : 3500,
    );
    if (geminiText) return { text: geminiText, confidence: 0.95, isFinal: true };

    const openaiText = await transcribeWithOpenAI(
      audioBuffer,
      mimeType,
      isFinal ? promptContext : undefined,
      isFinal ? 30000 : 12000,
    );
    if (openaiText) return { text: openaiText, confidence: 0.92, isFinal: true };

    return { text: "", confidence: 0.8, isFinal: false };
  }

  /**
   * Transcribes a full recording. Engine priority: FastWhisper sidecar, Gemini, OpenAI Whisper.
   * If none is available the transcript is empty, and the pause estimate comes from audio length.
   */
  static async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string = "audio/webm",
    promptContext?: string,
  ): Promise<TranscriptionResult> {
    const result = (
      transcript: string,
      confidence: number,
      engineUsed: TranscriptionResult["engineUsed"],
    ): TranscriptionResult => ({
      transcript,
      fillerCount: this.countFillers(transcript),
      pauseCount: Math.max(1, transcript.split(",").length - 1),
      confidence,
      status: "completed",
      engineUsed,
    });

    const local = await this.transcribeWithLocalWhisper(
      audioBuffer,
      mimeType,
      45000,
      promptContext,
    );
    if (local) return result(local.text, local.confidence, "local-whisper");

    const geminiText = await transcribeWithGemini(
      audioBuffer,
      mimeType,
      `You are an expert spoken English phonetic evaluator. Transcribe the exact words spoken in this audio recording verbatim, including any natural hesitations or filler words (such as um, uh, matlab, like, er). Do not correct grammar mistakes or add extra commentary. Return only the exact spoken transcription. Prompt context: "${promptContext || ""}"`,
      12000,
    );
    if (geminiText) return result(geminiText, 0.95, "gemini");

    const openaiText = await transcribeWithOpenAI(audioBuffer, mimeType, promptContext, 30000);
    if (openaiText) return result(openaiText, 0.92, "openai-whisper");

    return this.generateAcousticTranscription(audioBuffer);
  }

  /**
   * Count occurrences of common English/Indian-English filler hesitation words.
   */
  static countFillers(text: string): number {
    return countFillerWords(text);
  }

  /**
   * Used when no speech engine is available: the transcript stays empty, and the pause count is
   * only a rough estimate from the recording's size.
   */
  private static generateAcousticTranscription(audioBuffer: Buffer): TranscriptionResult {
    const estimatedSecs = Math.max(3, Math.round(audioBuffer.length / 4000));
    return {
      transcript: "",
      fillerCount: 0,
      pauseCount: Math.min(3, Math.max(1, Math.floor(estimatedSecs / 12))),
      confidence: 0.85,
      status: "completed",
      engineUsed: "acoustic-analyzer",
    };
  }
}
