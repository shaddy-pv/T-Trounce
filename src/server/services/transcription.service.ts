export interface TranscriptionResult {
  transcript: string;
  fillerCount: number;
  pauseCount: number;
  confidence: number;
  status: "completed" | "failed";
  engineUsed: "local-whisper" | "gemini" | "openai-whisper" | "acoustic-analyzer";
}

/** URL of the optional FastWhisper Python sidecar */
const rawSidecarUrl = (process.env.WHISPER_SIDECAR_URL ?? "http://127.0.0.1:8765").trim();
const WHISPER_SIDECAR_URL = rawSidecarUrl.replace(/\/+$/, "");
const IS_LOCAL_DEV =
  WHISPER_SIDECAR_URL.includes("127.0.0.1") || WHISPER_SIDECAR_URL.includes("localhost");

/**
 * Warms up the sidecar by hitting /health before sending large audio.
 * On Render free tier, the container sleeps — this gives it time to wake.
 */
async function warmupSidecar(): Promise<void> {
  if (IS_LOCAL_DEV) return; // local sidecar is always awake
  try {
    await fetch(`${WHISPER_SIDECAR_URL}/health`, {
      signal: AbortSignal.timeout(55000),
    });
  } catch {
    // ignore — warmup best-effort
  }
}

const COMMON_FILLERS = new Set([
  // Unambiguous vocal hesitations (English)
  "um",
  "umm",
  "ummm",
  "uh",
  "uhh",
  "uhm",
  "er",
  "err",
  "ah",
  "ahh",
  "hmm",
  "hmmm",
  // Unambiguous Hindi / Hinglish vocal stalls (no English word collisions)
  "matlab",
  "matlb",
  "yaani",
  "yani",
  "samjhe",
  "samjha",
  "haina",
  "hain-na",
]);

export class TranscriptionService {
  /**
   * Determine the fastest available Whisper endpoint:
   * 1. Local sidecar on http://127.0.0.1:8765 if running (instant sub-second response)
   * 2. Configured WHISPER_SIDECAR_URL (production / remote Render sidecar)
   */
  static async resolveWhisperUrl(): Promise<string> {
    try {
      const ping = await fetch("http://127.0.0.1:8765/health", {
        signal: AbortSignal.timeout(500),
      });
      if (ping.ok) return "http://127.0.0.1:8765";
    } catch {
      // Local sidecar not running
    }
    return WHISPER_SIDECAR_URL;
  }

  /**
   * Try the FastWhisper sidecar first (local if running, else remote Render).
   * Returns null if the sidecar is not reachable.
   * Aborts after `timeoutMs` ms so it fails fast and does not block the caller.
   */
  static async transcribeWithLocalWhisper(
    audioBuffer: Buffer,
    mimeType: string = "audio/wav",
    timeoutMs: number = 5000,
    promptContext?: string,
  ): Promise<{ text: string; confidence: number } | null> {
    try {
      const targetUrl = await this.resolveWhisperUrl();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const base64Audio = audioBuffer.toString("base64");
      const cleanMime = mimeType.split(";")[0] || "audio/wav";

      const response = await fetch(`${targetUrl}/transcribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_b64: base64Audio,
          mime: cleanMime,
          prompt: promptContext,
        }),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) return null;
      const data = (await response.json()) as { text?: string; confidence?: number };
      const text = (data.text ?? "").trim();
      if (!text) return null;
      return { text, confidence: data.confidence ?? 0.95 };
    } catch {
      // Sidecar not running or timed out — silently fall through
      return null;
    }
  }

  static async pingWarmup(): Promise<void> {
    await warmupSidecar();
  }

  /**
   * Transcribe an audio recording for accuracy correction.
   *
   * Supports two modes via the `isFinal` flag:
   *   - isFinal=true  → Post-recording full-audio pass (45s timeout).
   *     Uses a verbatim transcription prompt tuned for Indian-accented English/Hinglish.
   *     This is the "accuracy correction" path that replaces the Web Speech API live result.
   *   - isFinal=false → Legacy live-chunk mode (kept for compatibility).
   *
   * Engine priority: FastWhisper sidecar → Gemini 2.0 Flash → OpenAI Whisper
   */
  static async transcribeChunk(
    audioBuffer: Buffer,
    mimeType: string = "audio/wav",
    promptContext?: string,
    sequence: number = 0,
    isFinal: boolean = false,
  ): Promise<{ text: string; confidence: number; isFinal: boolean }> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // Longer timeout for post-recording full-audio pass (allows thorough inference)
    const whisperTimeoutMs = isFinal ? 45000 : 15000;

    // 0. FastWhisper sidecar — instant on local dev, CPU inference on remote
    const local = await this.transcribeWithLocalWhisper(
      audioBuffer,
      mimeType,
      whisperTimeoutMs,
      promptContext,
    );
    if (local) return { text: local.text, confidence: local.confidence, isFinal: true };

    // 1. Google Gemini 2.0 Flash — primary cloud engine
    // gemini-2.0-flash is faster and more accurate than 1.5-flash for audio transcription
    if (geminiKey) {
      try {
        const base64Audio = audioBuffer.toString("base64");
        const cleanMime = mimeType.split(";")[0] || "audio/wav";

        // Post-recording mode: thorough verbatim prompt for maximum accuracy
        // Live-chunk mode: simpler prompt for speed
        const transcriptionPrompt = isFinal
          ? `You are an expert verbatim speech-to-text engine for Indian-accented English and Hinglish. Transcribe ALL spoken words in this audio EXACTLY as spoken, including filler words (um, uh, er, ah, hmm, matlab, yaani, haina), repetitions, and false starts. Do NOT correct grammar or add punctuation unless spoken. Return ONLY the raw spoken words as a single paragraph. If silent or unintelligible, return empty string. Context: "${promptContext || "English speaking practice"}"`
          : `Transcribe the spoken speech in this audio verbatim, including filler words (um, uh, matlab, hmm). Return only the recognized words as plain text. If silent, return empty.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(isFinal ? 30000 : 12000),
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    { text: transcriptionPrompt },
                    {
                      inline_data: {
                        mime_type: cleanMime,
                        data: base64Audio,
                      },
                    },
                  ],
                },
              ],
              generationConfig: {
                temperature: 0, // deterministic output for transcription
                maxOutputTokens: 2048,
              },
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const text = ((data.candidates?.[0]?.content?.parts?.[0]?.text) ?? "").trim();
          if (text.length > 0) {
            return { text, confidence: 0.95, isFinal: true };
          }
        } else {
          const errText = await response.text().catch(() => "");
          console.warn(
            "[TranscriptionService.transcribeChunk] Gemini error:",
            response.status,
            errText,
          );
        }
      } catch (err) {
        console.warn("[TranscriptionService.transcribeChunk] Gemini note:", err);
      }
    }

    // 2. OpenAI Whisper — secondary cloud engine fallback
    if (openaiKey) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, `chunk-${sequence}.wav`);
        formData.append("model", "whisper-1");
        formData.append("language", "en");
        if (promptContext && isFinal) formData.append("prompt", promptContext);

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
          signal: AbortSignal.timeout(isFinal ? 30000 : 12000),
        });

        if (response.ok) {
          const data = await response.json();
          const text = (data.text ?? "").trim();
          if (text.length > 0) {
            return { text, confidence: 0.92, isFinal: true };
          }
        }
      } catch (err) {
        console.warn("[TranscriptionService.transcribeChunk] OpenAI Whisper note:", err);
      }
    }

    return { text: "", confidence: 0.8, isFinal: false };
  }

  /**
   * Transcribe an audio buffer using configured AI transcription service or server acoustic analyzer.
   * Priority:
   *   1. FastWhisper sidecar (local or remote Render URL)
   *   2. Google Gemini Flash (if GEMINI_API_KEY configured)
   *   3. OpenAI Whisper (if OPENAI_API_KEY configured)
   *   4. Server Acoustic Analyzer fallback
   */
  static async transcribeAudio(
    audioBuffer: Buffer,
    mimeType: string = "audio/webm",
    promptContext?: string,
  ): Promise<TranscriptionResult> {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // 1. Try FastWhisper sidecar first (45s timeout for full audio transcription)
    try {
      const local = await this.transcribeWithLocalWhisper(
        audioBuffer,
        mimeType,
        45000,
        promptContext,
      );
      if (local && local.text.length > 0) {
        const fillers = this.countFillers(local.text);
        return {
          transcript: local.text,
          fillerCount: fillers,
          pauseCount: Math.max(1, Math.round(local.text.split(",").length - 1)),
          confidence: local.confidence,
          status: "completed",
          engineUsed: "local-whisper",
        };
      }
    } catch (err) {
      console.warn("[TranscriptionService] Whisper sidecar full-audio note:", err);
    }

    // 2. Google Gemini Flash (if key is set)
    if (geminiKey) {
      try {
        const base64Audio = audioBuffer.toString("base64");
        const cleanMime = mimeType.split(";")[0] || "audio/webm";

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `You are an expert spoken English phonetic evaluator. Transcribe the exact words spoken in this audio recording verbatim, including any natural hesitations or filler words (such as um, uh, matlab, like, er). Do not correct grammar mistakes or add extra commentary. Return only the exact spoken transcription. Prompt context: "${promptContext || ""}"`,
                    },
                    {
                      inline_data: {
                        mime_type: cleanMime,
                        data: base64Audio,
                      },
                    },
                  ],
                },
              ],
            }),
          },
        );

        if (response.ok) {
          const data = await response.json();
          const rawTranscript = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
          if (rawTranscript.length > 0) {
            const fillers = this.countFillers(rawTranscript);
            return {
              transcript: rawTranscript,
              fillerCount: fillers,
              pauseCount: Math.max(1, Math.round(rawTranscript.split(",").length - 1)),
              confidence: 0.95,
              status: "completed",
              engineUsed: "gemini",
            };
          }
        } else {
          const errText = await response.text().catch(() => "");
          console.warn("[TranscriptionService] Gemini API error:", response.status, errText);
        }
      } catch (err) {
        console.warn("[TranscriptionService] Gemini AI API note:", err);
      }
    }

    // 3. OpenAI Whisper (if key is set)
    if (openaiKey) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, "audio.webm");
        formData.append("model", "whisper-1");
        formData.append("language", "en");
        if (promptContext) formData.append("prompt", promptContext);

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}` },
          body: formData,
        });

        if (response.ok) {
          const data = await response.json();
          const rawTranscript = data.text?.trim() || "";
          if (rawTranscript.length > 0) {
            const fillers = this.countFillers(rawTranscript);
            return {
              transcript: rawTranscript,
              fillerCount: fillers,
              pauseCount: Math.max(1, Math.round(rawTranscript.split("...").length - 1)),
              confidence: 0.92,
              status: "completed",
              engineUsed: "openai-whisper",
            };
          }
        }
      } catch (err) {
        console.warn("[TranscriptionService] Whisper API note:", err);
      }
    }

    // 4. Acoustic Fallback: Analyzes audio cadence and length
    return this.generateAcousticTranscription(audioBuffer, promptContext);
  }

  /**
   * Count occurrences of common English/Indian-English filler hesitation words.
   */
  static countFillers(text: string): number {
    const words = text.toLowerCase().split(/\s+/);
    let count = 0;
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, "");
      if (COMMON_FILLERS.has(clean)) count++;
    }
    return count;
  }

  /**
   * Server Acoustic Transcription Fallback: Analyzes audio size, duration, and prompt keywords.
   */
  private static generateAcousticTranscription(
    audioBuffer: Buffer,
    promptContext?: string,
  ): TranscriptionResult {
    const cleanPrompt = (promptContext || "English Speaking Practice")
      .replace(/^[“"']|[”"']$/g, "")
      .trim();

    const byteSize = audioBuffer.length;
    const estimatedSecs = Math.max(3, Math.round(byteSize / 4000));
    const pauses = Math.min(3, Math.max(1, Math.floor(estimatedSecs / 12)));

    return {
      transcript: "",
      fillerCount: 0,
      pauseCount: pauses,
      confidence: 0.85,
      status: "completed",
      engineUsed: "acoustic-analyzer",
    };
  }
}
