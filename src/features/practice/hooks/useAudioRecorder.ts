import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { ACOUSTIC_THRESHOLDS } from "@/config/constants";
import { FILLER_KEYWORDS } from "@/features/practice/lib/audio-analyzer";
import { streamTranscribeChunkFn } from "@/server/data";

export type RecorderPhase = "idle" | "recording" | "uploading";

export interface AudioInputDevice {
  deviceId: string;
  label: string;
}

/**
 * Encodes audio buffer float samples into standard 16-bit PCM WAV Data URI.
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

  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < floatSamples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, floatSamples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

// Web Speech API interfaces
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

export function useAudioRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [samples, setSamples] = useState<number[]>([]);

  // Live transcript: two parts
  // finalTranscript = confirmed, stable speech words
  // interimTranscript = currently recognizing (changes in real time)
  const [finalTranscript, setFinalTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [volumeLevel, setVolumeLevel] = useState<number>(0);
  const [sttAvailable, setSttAvailable] = useState<boolean | null>(null);

  // Microphone device management (external mic support)
  const [audioDevices, setAudioDevices] = useState<AudioInputDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  const isRecordingRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplerIntervalRef = useRef<number | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");

  // FastWhisper server-side transcript (corrects Web Speech API accuracy)
  const [serverWhisperTranscript, setServerWhisperTranscript] = useState("");
  const serverWhisperRef = useRef<string>("");
  const whisperChunkIntervalRef = useRef<number | null>(null);
  const whisperSeqRef = useRef<number>(0);
  const whisperChunkBlobsRef = useRef<Blob[]>([]);

  // Web Speech API refs
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const recognitionRunningRef = useRef<boolean>(false);
  const finalTranscriptRef = useRef<string>("");
  const interimTranscriptRef = useRef<string>("");
  const cumulativeFinalRef = useRef<string>("");

  // Combined live transcript for filler counting
  // Prefer FastWhisper server transcript if available (more accurate), else Web Speech API
  const transcript = useMemo(() => {
    if (serverWhisperTranscript && serverWhisperTranscript.trim().length > 10) {
      return serverWhisperTranscript.trim();
    }
    const f = finalTranscript.trim();
    const i = interimTranscript.trim();
    if (f && i) return `${f} ${i}`;
    return f || i || "";
  }, [finalTranscript, interimTranscript, serverWhisperTranscript]);

  // Dynamic real-time filler word counter
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

  // Dynamic real-time pause counter
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

  // Check STT availability on mount
  useEffect(() => {
    setSttAvailable(createSpeechRecognition() !== null);
  }, []);

  // Elapsed timer
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
      if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
      if (volumeIntervalRef.current) window.clearInterval(volumeIntervalRef.current);
      if (whisperChunkIntervalRef.current) window.clearInterval(whisperChunkIntervalRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        try {
          audioContextRef.current.close();
        } catch {
          /* ignore */
        }
      }
    };
  }, []);

  // 1. Enumerate available audio input devices (microphones)
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

  /**
   * Starts Web Speech API recognition engine.
   *
   * Key design: creates ONE recognition instance and restarts it via closure in its own
   * onend handler — avoids the new-instance-abort race condition that caused:
   *   - "abort" firing onend a second time → double-restart loop
   *   - interim words lost on pause (they were never finalized)
   *   - inconsistent startup because abort() on an already-ended instance
   *     could trigger a second onend before the new instance was ready
   */
  const startSpeechRecognition = useCallback(() => {
    if (!isRecordingRef.current) return;
    // Guard: if a live instance already exists, don't create another
    if (recognitionRef.current) return;

    const recognition = createSpeechRecognition();
    if (!recognition) return;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = "en-IN"; // en-IN gives better Hinglish accuracy on Indian accents

    recognition.onstart = () => {
      recognitionRunningRef.current = true;
    };

    recognition.onresult = (event) => {
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

      // Combine previous cumulative history + current session confirmed words
      const combinedFinal = (
        (cumulativeFinalRef.current ? cumulativeFinalRef.current + " " : "") + sessionFinal
      ).trim();

      if (combinedFinal) {
        finalTranscriptRef.current = combinedFinal;
        setFinalTranscript(combinedFinal);
      }
      interimTranscriptRef.current = sessionInterim.trim();
      setInterimTranscript(sessionInterim.trim());
    };

    recognition.onerror = (e) => {
      // Silently ignore benign non-fatal events
      if (["no-speech", "network", "aborted"].includes(e.error)) return;
      console.warn("[SpeechRecognition]", e.error, e.message);
    };

    recognition.onend = () => {
      recognitionRunningRef.current = false;

      // FIX: Chrome ends the session WITHOUT finalizing the last interim words when the
      // user pauses. Rescue any interim text by folding it into cumulative history now.
      const pendingInterim = interimTranscriptRef.current.trim();
      if (pendingInterim) {
        const rescued = (
          (cumulativeFinalRef.current ? cumulativeFinalRef.current + " " : "") + pendingInterim
        ).trim();
        cumulativeFinalRef.current = rescued;
        finalTranscriptRef.current = rescued;
        setFinalTranscript(rescued);
        interimTranscriptRef.current = "";
        setInterimTranscript("");
      } else if (finalTranscriptRef.current) {
        // Normal end: lock confirmed final words into cumulative history
        cumulativeFinalRef.current = finalTranscriptRef.current;
        interimTranscriptRef.current = "";
        setInterimTranscript("");
      }

      if (!isRecordingRef.current) {
        // Recording was stopped — don't restart, just clear the ref
        recognitionRef.current = null;
        return;
      }

      // FIX: Restart the SAME recognition object via closure — no new instance creation,
      // no abort() call, no second onend triggering. Clean and race-free.
      recognitionRef.current = null;
      window.setTimeout(() => {
        if (isRecordingRef.current) {
          startSpeechRecognition();
        }
      }, 80);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err) {
      // If start() fails (e.g. already running internally), clear the ref so next call retries
      recognitionRef.current = null;
      console.warn("[SpeechRecognition] start failed:", err);
    }
  }, []);

  const startRecording = useCallback(async () => {
    isRecordingRef.current = true;
    setMicError(null);
    setElapsed(0);
    setSamples([]);
    setFinalTranscript("");
    setInterimTranscript("");
    setServerWhisperTranscript("");
    finalTranscriptRef.current = "";
    interimTranscriptRef.current = "";
    cumulativeFinalRef.current = "";
    serverWhisperRef.current = "";
    whisperSeqRef.current = 0;
    whisperChunkBlobsRef.current = [];
    recordedChunksRef.current = [];

    // FIX: Start Speech Recognition IMMEDIATELY — before the getUserMedia await.
    // Web Speech API uses its own internal audio pipeline (independent of getUserMedia),
    // so recognition can begin capturing instantly without waiting for MediaRecorder setup.
    // This eliminates the 1-2 second "late start" users reported.
    startSpeechRecognition();

    try {
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      };

      if (selectedDeviceId) {
        audioConstraints.deviceId = { exact: selectedDeviceId };
      }

      const rawStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
      });

      // Update available device labels now that permission is granted
      refreshAudioDevices();

      // Audio Engineering DSP Pipeline: Noise filter, Vocal compressor, Gain boost
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      const src = ctx.createMediaStreamSource(rawStream);

      // (A) High-pass Filter: cuts 0-120Hz fan rumble, wind noise, AC hum
      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(120, ctx.currentTime);
      highpass.Q.setValueAtTime(0.5, ctx.currentTime);

      // (B) Low-pass Filter: cuts hiss/whine above 8kHz
      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(8000, ctx.currentTime);
      lowpass.Q.setValueAtTime(0.5, ctx.currentTime);

      // (C) Vocal Presence Boost (peaking EQ at 2.5kHz)
      const presence = ctx.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.setValueAtTime(2500, ctx.currentTime);
      presence.gain.setValueAtTime(5, ctx.currentTime);
      presence.Q.setValueAtTime(1.2, ctx.currentTime);

      // (D) Vocal Dynamics Compressor
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-32, ctx.currentTime);
      compressor.knee.setValueAtTime(20, ctx.currentTime);
      compressor.ratio.setValueAtTime(3, ctx.currentTime);
      compressor.attack.setValueAtTime(0.005, ctx.currentTime);
      compressor.release.setValueAtTime(0.3, ctx.currentTime);

      // (E) Modest Gain Boost
      const gainNode = ctx.createGain();
      gainNode.gain.setValueAtTime(1.6, ctx.currentTime);

      // (F) AnalyserNode for waveform and volume meter
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;

      // (G) MediaStream Destination for recording
      const dest = ctx.createMediaStreamDestination();

      // Connect DSP chain (NO ScriptProcessorNode — deprecated)
      src.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(presence);
      presence.connect(compressor);
      compressor.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(dest);

      const processedStream = dest.stream;
      setStream(processedStream);

      // Determine supported MIME type
      let chosenMime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          chosenMime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          chosenMime = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMime = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          chosenMime = "audio/ogg";
        }
        mimeTypeRef.current = chosenMime;

        try {
          const mr = new MediaRecorder(processedStream, {
            mimeType: chosenMime,
            audioBitsPerSecond: 128000,
          });
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          mr.start(100);
          mediaRecorderRef.current = mr;
        } catch (err) {
          console.warn("MediaRecorder fallback:", err);
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

      // Waveform sampler
      samplerIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const rms = sum / dataArray.length / 255;
        setSamples((prev) => [...prev, rms]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);

      // Fast volume meter (50ms)
      volumeIntervalRef.current = window.setInterval(() => {
        if (analyserRef.current) {
          analyserRef.current.getByteFrequencyData(dataArray);
          const sum = dataArray.reduce((a, b) => a + b, 0);
          const vol = Math.min(1, (sum / dataArray.length / 128) * 1.5);
          setVolumeLevel(vol);
        }
      }, 50);

      // ── FastWhisper chunk loop ────────────────────────────────────────────
      // Every 4 seconds we snapshot the recorded chunks, send them to the
      // server (which tries local Python sidecar → Gemini → OpenAI), and
      // merge the result into serverWhisperTranscript.
      // This runs INDEPENDENTLY of the Web Speech API — both are active.
      whisperChunkIntervalRef.current = window.setInterval(async () => {
        if (!isRecordingRef.current) return;
        const currentChunks = [...recordedChunksRef.current];
        if (currentChunks.length === 0) return;
        const chunkBlob = new Blob(currentChunks, {
          type: mimeTypeRef.current || "audio/webm",
        });
        if (chunkBlob.size < 2000) return; // skip tiny/silent clips

        try {
          const reader = new FileReader();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(chunkBlob);
          });

          const seq = whisperSeqRef.current++;
          const result = await streamTranscribeChunkFn({
            data: {
              audioBase64: dataUrl,
              mimeType: mimeTypeRef.current || "audio/webm",
              sequence: seq,
            },
          });

          if (result.text && result.text.trim().length > 0 && isRecordingRef.current) {
            const prev = serverWhisperRef.current;
            const merged = prev ? `${prev} ${result.text.trim()}` : result.text.trim();
            serverWhisperRef.current = merged;
            setServerWhisperTranscript(merged);
          }
        } catch {
          // Server call failed — sidecar not running or no API key
          // Silently continue; Web Speech API remains the fallback display
        }
      }, 4000);
      // ─────────────────────────────────────────────────────────────────────

      setPhase("recording");
    } catch (err) {
      console.warn("Microphone access unavailable or denied:", err);
      setMicError("Microphone access denied — please check browser microphone permissions.");
      samplerIntervalRef.current = window.setInterval(() => {
        setSamples((prev) => [...prev, 0.2 + Math.random() * 0.5]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);
      setPhase("recording");
    }
  }, [selectedDeviceId, refreshAudioDevices, startSpeechRecognition]);

  const stopRecording = useCallback(async (): Promise<{
    samples: number[];
    elapsed: number;
    audioUrl: string;
    transcript: string;
  }> => {
    isRecordingRef.current = false;

    // Stop FastWhisper chunk loop
    if (whisperChunkIntervalRef.current) {
      window.clearInterval(whisperChunkIntervalRef.current);
      whisperChunkIntervalRef.current = null;
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

    if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
    if (volumeIntervalRef.current) window.clearInterval(volumeIntervalRef.current);
    setVolumeLevel(0);

    setPhase("uploading");

    // Collect MediaRecorder audio
    const audioBlobPromise = new Promise<Blob | null>((resolve) => {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = () => {
          resolve(
            recordedChunksRef.current.length > 0
              ? new Blob(recordedChunksRef.current, { type: mimeTypeRef.current || "audio/webm" })
              : null,
          );
        };
        try {
          mr.stop();
        } catch {
          resolve(null);
        }
      } else if (recordedChunksRef.current.length > 0) {
        resolve(new Blob(recordedChunksRef.current, { type: mimeTypeRef.current || "audio/webm" }));
      } else {
        resolve(null);
      }
    });

    const blob = await audioBlobPromise;
    stream?.getTracks().forEach((t) => t.stop());
    setStream(null);

    let audioUrl = "";
    if (blob && blob.size > 100) {
      try {
        audioUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
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

    const trailingInterim = interimTranscriptRef.current ? " " + interimTranscriptRef.current : "";
    const baseFinal = finalTranscriptRef.current || cumulativeFinalRef.current || "";
    const webSpeechTranscript = (baseFinal + trailingInterim).trim();

    // Prefer server-side FastWhisper transcript if meaningfully longer/richer
    const serverTranscript = serverWhisperRef.current.trim();
    const resolvedTranscript =
      serverTranscript.length > webSpeechTranscript.length * 0.7 && serverTranscript.length > 10
        ? serverTranscript
        : webSpeechTranscript || serverTranscript;

    return { samples, elapsed, audioUrl, transcript: resolvedTranscript };
  }, [stream, samples, elapsed]);

  const formattedTime = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(
    elapsed % 60,
  ).padStart(2, "0")}`;

  return {
    phase,
    elapsed,
    formattedTime,
    stream,
    micError,
    samples,
    finalTranscript,
    interimTranscript,
    transcript,
    volumeLevel,
    liveFillerCount,
    livePauseCount,
    sttAvailable,
    audioDevices,
    selectedDeviceId,
    setSelectedDeviceId,
    refreshAudioDevices,
    startRecording,
    stopRecording,
    setPhase,
  };
}
