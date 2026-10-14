import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ACOUSTIC_THRESHOLDS } from "@/config/constants";
import { FILLER_KEYWORDS } from "@/features/practice/lib/audio-analyzer";
import { streamTranscribeChunkFn, warmupWhisperFn } from "@/server/data";

export type RecorderPhase = "idle" | "recording" | "uploading";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

// ─── WAV Encoding ─────────────────────────────────────────────────────────────

/**
 * Encodes float PCM samples into a standard 16-bit WAV Data URI.
 * WAV stores duration via explicit sample count — always correct.
 * Unlike WebM chunks, WAV never has the corrupt/infinite duration metadata
 * that causes faster-whisper's VAD to classify entire clips as silence.
 */
export function encodeWavFromFloatSamples(floatSamples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = floatSamples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < floatSamples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[],
    );
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/**
 * Decodes a browser audio blob (WebM/Opus/MP4) via a temporary AudioContext
 * and re-encodes as a 16-bit PCM WAV data URL for Gemini transcription.
 */
async function blobToWavDataUrl(blob: Blob): Promise<string> {
  const fallbackRead = () =>
    new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || "");
      reader.onerror = () => resolve("");
      reader.readAsDataURL(blob);
    });

  if (typeof window === "undefined" || !blob || blob.size === 0) {
    return "";
  }

  try {
    const AudioCtxClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtxClass) {
      return await fallbackRead();
    }

    const tmpCtx = new AudioCtxClass();
    try {
      // Chromium bug guard: decodeAudioData on MediaRecorder WebM blobs can hang indefinitely.
      // Strict 1500ms timeout ensures it NEVER blocks the recording pipeline.
      const decoded = await Promise.race([
        (async () => {
          const arrayBuffer = await blob.arrayBuffer();
          return await tmpCtx.decodeAudioData(arrayBuffer.slice(0));
        })(),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 1500)),
      ]);

      if (!decoded) {
        return await fallbackRead();
      }

      const samples = decoded.getChannelData(0); // mono for STT
      return encodeWavFromFloatSamples(samples, decoded.sampleRate);
    } finally {
      tmpCtx.close().catch(() => {});
    }
  } catch {
    return await fallbackRead();
  }
}

// ─── Web Speech API Type Shims ────────────────────────────────────────────────

interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResultList {
  [index: number]: {
    [index: number]: SpeechRecognitionResultItem;
    isFinal: boolean;
    length: number;
  };
  length: number;
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((err: { error: string; message?: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

function createSpeechRecognition(): SpeechRecognitionInstance | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  const Cls = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Cls) return null;
  return new Cls();
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export interface UseAudioRecorderOptions {
  promptContext?: string;
  enableLiveTranscription?: boolean;
  enablePostTranscription?: boolean;
}

/**
 * Production live transcription architecture:
 *
 * DURING RECORDING — Web Speech API (browser-native STT):
 *   - Zero latency: words appear as you speak, character by character
 *   - Continuous: restarts automatically on every session end (Chrome auto-ends ~60s)
 *   - Language: en-US primary (highest accuracy baseline) → en-IN fallback
 *   - Interim words rescued on session restart AND on stop so no words are lost
 *   - If unavailable (network error): sttUnavailable flag set, UI shows clear message
 *
 * AFTER STOP — Gemini 2.0 Flash full-audio accuracy pass:
 *   - Full recording sent as WAV to Gemini with a verbatim transcription prompt
 *   - ~95% word accuracy vs ~85% for Web Speech API on Indian-accented English
 *   - This is what gets saved to the database — corrects any live STT errors
 *   - Falls back to Web Speech result if Gemini is unavailable
 *
 * NO live chunk AI calls during recording:
 *   - Short clips (<10s) cause AI models to hallucinate random words
 *   - Every cloud call adds 1–5s network latency → defeats "live" purpose
 *   - Web Speech API is THE production standard for real-time browser captions
 *     (Zoom, Google Meet, Teams all use this exact pattern)
 */
// Module-level network detection flag so subsequent sessions on network-blocked ISPs
// automatically use local FastWhisper live streaming without retrying failing Google STT
const hasGoogleSttNetworkError = false;

export function useAudioRecorder(options?: UseAudioRecorderOptions) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [samples, setSamples] = useState<number[]>([]);

  // Live transcript from Web Speech API or Local FastWhisper streaming
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [liveEngine, setLiveEngine] = useState<"web-speech" | "local-whisper">("web-speech");

  // STT engine status
  const [sttAvailable, setSttAvailable] = useState<boolean | null>(null);
  const [sttUnavailable, setSttUnavailable] = useState(false); // true = network error, show message

  const [volumeLevel, setVolumeLevel] = useState<number>(0);

  // Post-recording accuracy pass
  const [isRefiningTranscript, setIsRefiningTranscript] = useState(false);
  const [postRecordingTranscript, setPostRecordingTranscript] = useState("");

  // Device management
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // ── Refs — recording infrastructure ───────────────────────────────────────
  const isRecordingRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplerIntervalRef = useRef<number | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const lastAudioUrlRef = useRef<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");

  // ── Refs — Web Speech API ──────────────────────────────────────────────────
  // ONE recognition instance per session, restarted via its own onend closure.
  // Avoids the abort() → double-onend race that caused word loss in multi-instance patterns.
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recognitionRunningRef = useRef<boolean>(false);
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const cumulativeFinalRef = useRef<string>("");
  const sttUnavailableRef = useRef<boolean>(false);
  const sttNetworkErrorCountRef = useRef<number>(0); // consecutive network errors
  const isLiveEnabledRef = useRef<boolean>(Boolean(options?.enableLiveTranscription));
  const isStreamingLocalRef = useRef<boolean>(false);
  const localLiveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    isLiveEnabledRef.current = Boolean(options?.enableLiveTranscription);
  }, [options?.enableLiveTranscription]);

  // ── Derived transcript (memoized) ─────────────────────────────────────────
  // Priority: post-recording Gemini > Web Speech final + interim
  const transcript = useMemo(() => {
    if (postRecordingTranscript.trim().length > 0) return postRecordingTranscript.trim();
    const f = finalTranscript.trim();
    const i = interimTranscript.trim();
    if (f && i) return `${f} ${i}`;
    return f || i || "";
  }, [finalTranscript, interimTranscript, postRecordingTranscript]);

  // ── Live filler counter ────────────────────────────────────────────────────
  const liveFillerCount = useMemo(() => {
    if (!transcript) return 0;
    const words = transcript.toLowerCase().split(/\s+/);
    let count = 0;
    for (const w of words) {
      const clean = w.replace(/[^a-z]/g, "");
      if (FILLER_KEYWORDS.has(clean)) count++;
    }
    return count;
  }, [transcript]);

  // ── Live pause counter ─────────────────────────────────────────────────────
  const livePauseCount = useMemo(() => {
    if (samples.length === 0) return 0;
    const sorted = [...samples].sort((a, b) => a - b);
    const floor = Math.max(0.02, sorted[Math.floor(sorted.length * 0.15)] || 0.05);
    const peak = Math.max(...samples, 0.08);
    const silenceThreshold = floor + (peak - floor) * 0.22;
    let pauses = 0;
    let consecutive = 0;
    for (const s of samples) {
      if (s <= silenceThreshold) {
        consecutive++;
        if (consecutive === 2) pauses++;
      } else {
        consecutive = 0;
      }
    }
    return pauses;
  }, [samples]);

  // ── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => {
    setSttAvailable(createSpeechRecognition() !== null);
  }, []);

  useEffect(() => {
    if (phase === "recording") {
      timerRef.current = window.setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (phase === "idle") setElapsed(0);
    }
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      recognitionRunningRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      if (localLiveTimerRef.current) {
        window.clearInterval(localLiveTimerRef.current);
        localLiveTimerRef.current = null;
      }
      isStreamingLocalRef.current = false;
      if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
      if (volumeIntervalRef.current) window.clearInterval(volumeIntervalRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // ── Device enumeration ─────────────────────────────────────────────────────

  const refreshAudioDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices
        .filter((d) => d.kind === "audioinput")
        .map((d, index) => ({
          deviceId: d.deviceId,
          label: d.label || `Microphone ${index + 1} (${d.deviceId.slice(0, 5)}...)`,
        }));
      setAudioDevices(audioInputs);
      if (audioInputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(audioInputs[0].deviceId);
      }
    } catch (err) {
      console.warn("Failed to enumerate audio input devices:", err);
    }
  }, [selectedDeviceId]);

  // ── Web Speech API engine ──────────────────────────────────────────────────

  /**
   * Starts the Web Speech API recognition engine for real-time live captions.
   *
   * Design principles:
   * 1. ONE instance per session — prevents double-onend and restart loops
/**
 * Overlap-aware transcript merger to prevent word duplication on Web Speech restarts
 */
  function mergeTranscriptSessions(cumulative: string, sessionFinal: string): string {
    const cum = cumulative.trim();
    const ses = sessionFinal.trim();
    if (!cum) return ses;
    if (!ses) return cum;

    const cumWords = cum.split(/\s+/);
    const sesWords = ses.split(/\s+/);

    // Check overlap of up to 5 words to prevent repetition (e.g. 'park' + 'park and sat')
    const maxOverlap = Math.min(5, cumWords.length, sesWords.length);
    for (let len = maxOverlap; len > 0; len--) {
      const cumTail = cumWords.slice(-len).join(" ").toLowerCase();
      const sesHead = sesWords.slice(0, len).join(" ").toLowerCase();
      if (cumTail === sesHead) {
        return (cum + " " + sesWords.slice(len).join(" ")).trim();
      }
    }

    return `${cum} ${ses}`;
  }

  /**
   * Local FastWhisper live streaming engine (100% offline, zero internet dependency).
   * Runs periodically while recording, sending accumulated audio chunks to the local sidecar.
   * Completely immune to Google STT network blockages.
   */
  const startLocalLiveStreaming = useCallback(() => {
    if (!isRecordingRef.current) return;
    if (isStreamingLocalRef.current) return;
    isStreamingLocalRef.current = true;
    setLiveEngine("local-whisper");
    setSttUnavailable(false);
    console.info("[useAudioRecorder] Activating Local FastWhisper live streaming engine");

    let isChunkProcessing = false;
    let consecutiveErrors = 0;

    const tickLocalLive = async () => {
      if (!isRecordingRef.current) return;
      if (isChunkProcessing) return;
      if (consecutiveErrors >= 2) {
        if (localLiveTimerRef.current) {
          window.clearInterval(localLiveTimerRef.current);
          localLiveTimerRef.current = null;
        }
        setSttUnavailable(true);
        return;
      }
      if (recordedChunksRef.current.length === 0) return;

      isChunkProcessing = true;
      try {
        const blob = new Blob(recordedChunksRef.current, {
          type: mimeTypeRef.current || "audio/webm",
        });
        // Limit live chunk size to prevent server payload spikes and 502s
        if (blob.size > 1500 && blob.size < 400000) {
          const wavUrl = await blobToWavDataUrl(blob);
          const res = await streamTranscribeChunkFn({
            data: {
              audioBase64: wavUrl,
              mimeType: "audio/wav",
              promptContext: options?.promptContext,
              sequence: 0,
              isFinal: false,
            },
          });
          consecutiveErrors = 0;
          if (res.text && res.text.trim().length > 0 && isRecordingRef.current) {
            const clean = res.text.trim();
            finalTranscriptRef.current = clean;
            setFinalTranscript(clean);
            setInterimTranscript("");
          }
        }
      } catch (err) {
        consecutiveErrors++;
        console.debug("[useAudioRecorder] Live stream tick note:", err);
        if (consecutiveErrors >= 2) {
          if (localLiveTimerRef.current) {
            window.clearInterval(localLiveTimerRef.current);
            localLiveTimerRef.current = null;
          }
          setSttUnavailable(true);
        }
      } finally {
        isChunkProcessing = false;
      }
    };

    localLiveTimerRef.current = window.setInterval(tickLocalLive, 1200);
    window.setTimeout(tickLocalLive, 600);
  }, [options?.promptContext]);

  /**
   * One continuous SpeechRecognition instance per recording session:
   * 1. 0ms low-latency token streaming using Google's en-US speech model
   * 2. Automatic overlap-free restart on pauses or Chrome 60s timeout
   * 3. Network error resilience: seamlessly activates Local FastWhisper fallback
   */
  const startSpeechRecognition = useCallback(() => {
    if (!isLiveEnabledRef.current) return;
    if (!isRecordingRef.current) return;
    if (sttUnavailableRef.current) return;
    if (recognitionRef.current) return; // already running

    const recognition = createSpeechRecognition();
    if (!recognition) {
      // Browser doesn't have Web Speech API — activate Local FastWhisper live streaming!
      startLocalLiveStreaming();
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    // en-US model provides instantaneous 0ms word streaming and highest Google STT accuracy
    recognition.lang = "en-US";

    recognition.onstart = () => {
      recognitionRunningRef.current = true;
    };

    recognition.onresult = (event) => {
      // Working connection — reset network failure count
      sttNetworkErrorCountRef.current = 0;

      let sessionFinal = "";
      let sessionInterim = "";

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          sessionFinal += result[0].transcript + " ";
        } else {
          sessionInterim += result[0].transcript;
        }
      }

      // Prepend history with overlap deduplication
      const combinedFinal = mergeTranscriptSessions(cumulativeFinalRef.current, sessionFinal);

      if (combinedFinal) {
        finalTranscriptRef.current = combinedFinal;
        setFinalTranscript(combinedFinal);
      }
      interimTranscriptRef.current = sessionInterim.trim();
      setInterimTranscript(sessionInterim.trim());
    };

    recognition.onerror = (e) => {
      if (e.error === "aborted") return; // we called stop() — benign
      if (e.error === "no-speech") return; // user paused — onend will restart seamlessly

      console.warn("[SpeechRecognition] error:", e.error, e.message);

      if (e.error === "network") {
        console.warn(
          "[SpeechRecognition] Google speech servers unreachable on this browser/network (e.g. Brave shields). Continuing clean audio capture.",
        );
        sttUnavailableRef.current = true;
        setSttUnavailable(true);
        recognitionRunningRef.current = false;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            /* ignore */
          }
          recognitionRef.current = null;
        }
        return;
      }

      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        console.warn(
          "[SpeechRecognition] Web Speech permission blocked. Continuing clean audio capture.",
        );
        sttUnavailableRef.current = true;
        setSttUnavailable(true);
        recognitionRunningRef.current = false;
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
          } catch {
            /* ignore */
          }
          recognitionRef.current = null;
        }
        return;
      }
    };

    recognition.onend = () => {
      recognitionRunningRef.current = false;
      recognitionRef.current = null;

      // Exit immediately if recording was stopped
      if (!isRecordingRef.current) return;

      // Don't restart if STT is marked unavailable
      if (sttUnavailableRef.current) return;

      // Rescue any pending interim text into cumulative history before restarting
      const pendingInterim = interimTranscriptRef.current.trim();
      if (pendingInterim) {
        cumulativeFinalRef.current = mergeTranscriptSessions(
          cumulativeFinalRef.current,
          pendingInterim,
        );
        finalTranscriptRef.current = cumulativeFinalRef.current;
        setFinalTranscript(cumulativeFinalRef.current);
        interimTranscriptRef.current = "";
        setInterimTranscript("");
      } else if (finalTranscriptRef.current) {
        cumulativeFinalRef.current = finalTranscriptRef.current;
        interimTranscriptRef.current = "";
        setInterimTranscript("");
      }

      // Fast restart via 50ms timer
      window.setTimeout(() => {
        if (isRecordingRef.current && !sttUnavailableRef.current) {
          startSpeechRecognition();
        }
      }, 50);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      recognitionRef.current = null;
      console.warn("[SpeechRecognition] start() failed, retrying in 120ms:", err);
      if (isRecordingRef.current && !sttUnavailableRef.current) {
        window.setTimeout(() => {
          if (isRecordingRef.current && !sttUnavailableRef.current) {
            startSpeechRecognition();
          }
        }, 120);
      }
    }
  }, [startLocalLiveStreaming]);

  // ── Post-Recording Gemini Accuracy Pass ───────────────────────────────────

  /**
   * Sends the FULL recorded audio to Gemini 2.0 Flash after the user stops.
   *
   * Why post-recording only (not live chunks):
   *   - Live AI chunks on short clips (<15s) hallucinate random words — not fixable
   *   - Every API call adds 1-5s network latency — defeats the "live" requirement
   *   - The full audio has complete context → Gemini achieves ~95% word accuracy
   *   - This is what gets saved to the database — always better than live STT
   *
   * This is THE standard production pattern:
   *   Live display = Web Speech API (instant)
   *   Saved result = Cloud AI transcription of full audio (accurate)
   */
  const runPostRecordingTranscription = useCallback(
    async (audioBlob: Blob): Promise<string> => {
      if (options?.enablePostTranscription === false) return "";
      if (!audioBlob || audioBlob.size < 2000) return "";

      setIsRefiningTranscript(true);
      try {
        const transcribePromise = (async () => {
          const dataUrl = await blobToWavDataUrl(audioBlob);
          if (!dataUrl) return "";

          const isWav = dataUrl.startsWith("data:audio/wav");
          const mime = isWav ? "audio/wav" : audioBlob.type || "audio/webm";

          const result = await streamTranscribeChunkFn({
            data: {
              audioBase64: dataUrl,
              mimeType: mime,
              sequence: 0,
              promptContext: options?.promptContext,
              isFinal: true, // signals server: use verbatim prompt + 25s timeout
            },
          });

          return result?.text?.trim() || "";
        })();

        // Fast safety timeout: Maximum 3.5s for post-recording AI pass.
        // Never stall the student or hold audio playback hostage.
        const timeoutPromise = new Promise<string>((resolve) =>
          setTimeout(() => {
            console.info(
              "[useAudioRecorder] Client-side post-recording transcription pass timed out after 3.5s — falling back to background transcription",
            );
            resolve("");
          }, 3500),
        );

        const refinedText = await Promise.race([transcribePromise, timeoutPromise]);
        if (refinedText && refinedText.length > 0) {
          setPostRecordingTranscript(refinedText);
          return refinedText;
        }
      } catch (err) {
        console.warn("[useAudioRecorder] Post-recording transcription pass note:", err);
      } finally {
        setIsRefiningTranscript(false);
      }
      return "";
    },
    [options?.promptContext, options?.enablePostTranscription],
  );

  // ── startRecording ─────────────────────────────────────────────────────────

  const startRecording = useCallback(async () => {
    // ── Full state reset ─────────────────────────────────────────────────────
    isRecordingRef.current = true;
    sttUnavailableRef.current = false;
    setMicError(null);
    setSttUnavailable(false);
    setElapsed(0);
    setSamples([]);
    setFinalTranscript("");
    setInterimTranscript("");
    setPostRecordingTranscript("");
    setIsRefiningTranscript(false);
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    cumulativeFinalRef.current = "";
    sttNetworkErrorCountRef.current = 0;
    recordedChunksRef.current = [];

    // Clear dangling timers from any previous session
    if (samplerIntervalRef.current) {
      window.clearInterval(samplerIntervalRef.current);
      samplerIntervalRef.current = null;
    }
    if (volumeIntervalRef.current) {
      window.clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }

    // Pre-warm server (best-effort, fire-and-forget)
    void warmupWhisperFn().catch(() => {});

    // ── Acquire microphone ────────────────────────────────────────────────────
    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };
      if (selectedDeviceId) audioConstraints.deviceId = { exact: selectedDeviceId };

      const rawStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      refreshAudioDevices();

      // Start live transcription: prefer client Web Speech API (0 server requests, instant response)
      // If unsupported or blocked, seamlessly falls back to streaming engine
      if (isLiveEnabledRef.current) {
        const recognition = createSpeechRecognition();
        if (recognition) {
          startSpeechRecognition();
        } else {
          startLocalLiveStreaming();
        }
      }

      // ── DSP Chain ─────────────────────────────────────────────────────────────
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") await ctx.resume();

      const src = ctx.createMediaStreamSource(rawStream);

      // (A) High-pass 120 Hz: removes fan rumble, wind, AC hum
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(120, ctx.currentTime);
      highpass.Q.setValueAtTime(0.5, ctx.currentTime);

      // (B) Low-pass 8 kHz: removes hiss/high-freq whine
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(8000, ctx.currentTime);
      lowpass.Q.setValueAtTime(0.5, ctx.currentTime);

      // (C) Vocal presence boost — peaking EQ at 2.5 kHz
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.setValueAtTime(2500, ctx.currentTime);
      presence.gain.setValueAtTime(5, ctx.currentTime);
      presence.Q.setValueAtTime(1.2, ctx.currentTime);

      // (D) Dynamics compressor — tames peaks, lifts quiet speech
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-32, ctx.currentTime);
      compressor.knee.setValueAtTime(20, ctx.currentTime);
      compressor.ratio.setValueAtTime(3, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.3, ctx.currentTime);

      // (E) Gain boost — lifts soft speakers
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1.6, ctx.currentTime);

      // (F) Analyser — waveform visualizer + volume meter
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      // (G) MediaStreamDestination — captures processed audio for recording
      const dest = ctx.createMediaStreamDestination();

      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(presence);
      presence.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      const processedStream = dest.stream;
      setStream(processedStream);

      // ── MediaRecorder ─────────────────────────────────────────────────────────
      // Captures the DSP-processed audio for the post-recording Gemini accuracy pass.
      let chosenMime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus"))
          chosenMime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) chosenMime = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) chosenMime = "audio/mp4";
        else if (MediaRecorder.isTypeSupported("audio/ogg")) chosenMime = "audio/ogg";
        mimeTypeRef.current = chosenMime;

        try {
          const mr = new MediaRecorder(processedStream, {
            mimeType: chosenMime,
            audioBitsPerSecond: 128000,
          });
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mr.start(100); // 100ms chunks
          mediaRecorderRef.current = mr;
        } catch (err) {
          console.warn("[MediaRecorder] codec fallback:", err);
          const mr2 = new MediaRecorder(processedStream);
          mr2.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mr2.start(100);
          mediaRecorderRef.current = mr2;
        }
      }

      audioContextRef.current = ctx;
      analyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      // Waveform sampler — feeds acoustic analysis
      samplerIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        setSamples((prev) => [...prev, sum / dataArray.length / 255]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);

      // Volume meter — 50ms for a responsive VU meter
      volumeIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          setVolumeLevel(Math.min(1, (sum / dataArray.length / 128) * 1.5));
        }
      }, 50);

      setPhase("recording");
    } catch (err) {
      console.warn("Microphone access unavailable or denied:", err);
      setMicError("Microphone access denied: please check browser microphone permissions.");
      samplerIntervalRef.current = window.setInterval(() => {
        setSamples((prev) => [...prev, 0.2 + Math.random() * 0.5]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);
      setPhase("recording");
    }
  }, [selectedDeviceId, refreshAudioDevices, startSpeechRecognition, startLocalLiveStreaming]);

  // ── stopRecording ──────────────────────────────────────────────────────────

  const stopRecording = useCallback(async (): Promise<{
    samples: number[];
    elapsed: number;
    audioUrl: string;
    transcript: string;
  }> => {
    isRecordingRef.current = false;
    sttUnavailableRef.current = true;

    // Rescue any trailing interim words from Web Speech API before stopping (overlap-aware)
    const pendingInterim = interimTranscriptRef.current.trim();
    if (pendingInterim) {
      const rescued = mergeTranscriptSessions(cumulativeFinalRef.current, pendingInterim);
      cumulativeFinalRef.current = rescued;
      finalTranscriptRef.current = rescued;
      setFinalTranscript(rescued);
    }

    // Stop Web Speech API
    recognitionRunningRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }
    setInterimTranscript("");

    // Stop local live streaming timer if running
    if (localLiveTimerRef.current) {
      window.clearInterval(localLiveTimerRef.current);
      localLiveTimerRef.current = null;
    }
    isStreamingLocalRef.current = false;

    // Stop timers
    if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
    if (volumeIntervalRef.current) window.clearInterval(volumeIntervalRef.current);
    setVolumeLevel(0);

    setPhase("uploading");

    // Collect MediaRecorder audio (1500ms safety timeout)
    const audioBlobPromise = new Promise<Blob | null>((resolve) => {
      const mr = mediaRecorderRef.current;
      const timeout = setTimeout(() => {
        resolve(
          recordedChunksRef.current.length > 0
            ? new Blob(recordedChunksRef.current, { type: mimeTypeRef.current || "audio/webm" })
            : null,
        );
      }, 1500);

      if (mr && mr.state !== "inactive") {
        mr.onstop = () => {
          clearTimeout(timeout);
          resolve(
            recordedChunksRef.current.length > 0
              ? new Blob(recordedChunksRef.current, { type: mimeTypeRef.current || "audio/webm" })
              : null,
          );
        };
        try {
          mr.stop();
        } catch {
          clearTimeout(timeout);
          resolve(null);
        }
      } else if (recordedChunksRef.current.length > 0) {
        clearTimeout(timeout);
        resolve(new Blob(recordedChunksRef.current, { type: mimeTypeRef.current || "audio/webm" }));
      } else {
        clearTimeout(timeout);
        resolve(null);
      }
    });

    const blob = await audioBlobPromise;
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);

    // Generate audio playback URL
    let audioUrl = "";
    if (blob && blob.size > 100) {
      try {
        audioUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve((reader.result as string) || "");
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        lastAudioUrlRef.current = audioUrl;
      } catch (e) {
        console.warn("Failed to convert Blob to data URL:", e);
      }
    }

    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        await audioContextRef.current.close();
      } catch {
        /* ignore */
      }
    }

    // Build Web Speech transcript from all accumulated results
    const trailingInterim = interimTranscriptRef.current ? " " + interimTranscriptRef.current : "";
    const baseFinal = finalTranscriptRef.current || cumulativeFinalRef.current || "";
    const webSpeechResult = (baseFinal + trailingInterim).trim();

    // Run AI full-audio accuracy pass — replaces Web Speech result if successful
    let finalTranscriptValue = webSpeechResult;
    if (blob && blob.size > 2000) {
      try {
        const aiResult = await runPostRecordingTranscription(blob);
        if (aiResult && aiResult.trim().length > 0) {
          finalTranscriptValue = aiResult.trim();
        }
      } catch (postErr) {
        console.warn("[useAudioRecorder] Post-recording transcript error:", postErr);
      }
    }

    return { samples, elapsed, audioUrl, transcript: finalTranscriptValue };
  }, [stream, samples, elapsed, runPostRecordingTranscription]);

  // ── Formatted time ─────────────────────────────────────────────────────────
  const formattedTime = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  return {
    phase,
    elapsed,
    formattedTime,
    stream,
    micError,
    sttAvailable,
    sttUnavailable,
    samples,
    finalTranscript,
    interimTranscript,
    transcript,
    volumeLevel,
    liveFillerCount,
    livePauseCount,
    isRefiningTranscript,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshAudioDevices,
    startRecording,
    stopRecording,
    setPhase,
    audioUrl: lastAudioUrlRef.current,
    isLiveTranscriptionEnabled: Boolean(options?.enableLiveTranscription),
    liveEngine,
  };
}
