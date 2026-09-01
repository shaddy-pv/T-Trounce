import { useState, useRef, useEffect, useCallback } from "react";
import { ACOUSTIC_THRESHOLDS } from "@/config/constants";

export type RecorderPhase = "idle" | "recording" | "uploading";

/**
 * Encodes audio buffer float samples into standard 16-bit PCM WAV Data URI.
 */
export function encodeWavFromFloatSamples(samples: Float32Array, sampleRate: number): string {
  const numChannels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF Chunk descriptor
  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false); // "WAVE"

  // "fmt " Sub-chunk
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 = PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample

  // "data" Sub-chunk
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataSize, true);

  // Write 16-bit PCM audio samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return `data:audio/wav;base64,${btoa(binary)}`;
}

export function useAudioRecorder() {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [micError, setMicError] = useState<string | null>(null);
  const [samples, setSamples] = useState<number[]>([]);
  const [transcript, setTranscript] = useState("");

  const isRecordingRef = useRef<boolean>(false);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const samplerIntervalRef = useRef<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("audio/webm");
  const recognitionRef = useRef<{ start: () => void; stop: () => void; abort?: () => void } | null>(
    null,
  );
  const transcriptRef = useRef<string>("");
  const accumulatedFinalRef = useRef<string>("");
  const pcmSamplesRef = useRef<number[]>([]);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

  // Timer
  useEffect(() => {
    if (phase !== "recording") return;
    timerRef.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [phase]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isRecordingRef.current = false;
      stream?.getTracks().forEach((t) => t.stop());
      if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
      if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
    };
  }, [stream]);

  const startRecording = useCallback(async () => {
    isRecordingRef.current = true;
    setMicError(null);
    setElapsed(0);
    setSamples([]);
    setTranscript("");
    transcriptRef.current = "";
    accumulatedFinalRef.current = "";
    recordedChunksRef.current = [];
    pcmSamplesRef.current = [];

    // 1. Initialize Web Speech API for real-time speech-to-text
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
    interface SpeechRecognitionInstance {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      maxAlternatives: number;
      onresult: (event: { resultIndex: number; results: SpeechRecognitionResultList }) => void;
      onerror: (err: { error: string }) => void;
      onend: () => void;
      start: () => void;
      stop: () => void;
      abort?: () => void;
    }

    const windowWithSpeech = window as unknown as {
      SpeechRecognition?: new () => SpeechRecognitionInstance;
      webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
    };
    const SpeechRecognitionClass =
      windowWithSpeech.SpeechRecognition || windowWithSpeech.webkitSpeechRecognition;

    if (SpeechRecognitionClass) {
      try {
        const recognition = new SpeechRecognitionClass();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;
        // Accept natural English speech (supports en-US, en-IN, en-GB)
        recognition.lang = navigator.language || "en-US";

        recognition.onresult = (event) => {
          let interimText = "";
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const res = event.results[i];
            if (res.isFinal) {
              accumulatedFinalRef.current += res[0].transcript + " ";
            } else {
              interimText += res[0].transcript;
            }
          }
          const fullText = (accumulatedFinalRef.current + " " + interimText).trim();
          transcriptRef.current = fullText;
          setTranscript(fullText);
        };

        recognition.onerror = (e) => {
          // Ignore normal no-speech event, keep recording
          if (e.error !== "no-speech") {
            console.warn("[SpeechRecognition]", e.error);
          }
        };

        recognition.onend = () => {
          // Automatically restart recognition if user is still in recording phase
          if (isRecordingRef.current) {
            try {
              recognition.start();
            } catch {
              // ignore restart error
            }
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
      } catch (e) {
        console.warn("Speech recognition initialization note:", e);
      }
    }

    // 2. Initialize Microphone Audio Stream & MediaRecorder
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      setStream(s);

      // Determine supported MIME type for recording
      let chosenMime = "audio/webm";
      if (typeof MediaRecorder !== "undefined") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          chosenMime = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          chosenMime = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          chosenMime = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/aac")) {
          chosenMime = "audio/aac";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          chosenMime = "audio/ogg";
        }
        mimeTypeRef.current = chosenMime;

        try {
          const mr = new MediaRecorder(s, { mimeType: chosenMime });
          mr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) {
              recordedChunksRef.current.push(e.data);
            }
          };
          mr.start(100); // chunk every 100ms
          mediaRecorderRef.current = mr;
        } catch (err) {
          console.warn("MediaRecorder instantiation fallback:", err);
          const fallbackMr = new MediaRecorder(s);
          fallbackMr.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data);
          };
          fallbackMr.start(100);
          mediaRecorderRef.current = fallbackMr;
        }
      }

      // 3. Initialize AudioContext for 60 FPS live waveform & PCM backup
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      const src = ctx.createMediaStreamSource(s);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.8;
      src.connect(analyser);

      // PCM script processor fallback for 100% reliable audio rendering
      try {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0);
          for (let i = 0; i < inputData.length; i += 4) {
            pcmSamplesRef.current.push(inputData[i]);
          }
        };
        src.connect(processor);
        processor.connect(ctx.destination);
        scriptProcessorRef.current = processor;
      } catch {
        // script processor fallback
      }

      audioContextRef.current = ctx;
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      samplerIntervalRef.current = window.setInterval(() => {
        analyser.getByteFrequencyData(dataArray);
        const sum = dataArray.reduce((a, b) => a + b, 0);
        const rms = sum / dataArray.length / 255;
        setSamples((prev) => [...prev, rms]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);

      setPhase("recording");
    } catch (err) {
      console.warn("Microphone access unavailable or denied:", err);
      setMicError("Microphone access denied — acoustic simulation active.");
      samplerIntervalRef.current = window.setInterval(() => {
        setSamples((prev) => [...prev, 0.2 + Math.random() * 0.5]);
      }, ACOUSTIC_THRESHOLDS.sampleIntervalMs);
      setPhase("recording");
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<{
    samples: number[];
    elapsed: number;
    audioUrl: string;
    transcript: string;
  }> => {
    isRecordingRef.current = false;
    if (samplerIntervalRef.current) window.clearInterval(samplerIntervalRef.current);
    if (scriptProcessorRef.current) scriptProcessorRef.current.disconnect();

    // Stop speech recognition
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }

    setPhase("uploading");

    // Asynchronously stop MediaRecorder and collect all chunks
    const audioBlobPromise = new Promise<Blob | null>((resolve) => {
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== "inactive") {
        mr.onstop = () => {
          if (recordedChunksRef.current.length > 0) {
            const finalBlob = new Blob(recordedChunksRef.current, {
              type: mimeTypeRef.current || "audio/webm",
            });
            resolve(finalBlob);
          } else {
            resolve(null);
          }
        };
        try {
          mr.stop();
        } catch {
          resolve(null);
        }
      } else if (recordedChunksRef.current.length > 0) {
        resolve(
          new Blob(recordedChunksRef.current, {
            type: mimeTypeRef.current || "audio/webm",
          }),
        );
      } else {
        resolve(null);
      }
    });

    const blob = await audioBlobPromise;

    // Release microphone tracks
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

    // Fallback: encode from captured PCM samples if MediaRecorder blob was empty
    if (!audioUrl && pcmSamplesRef.current.length > 0) {
      try {
        const floatArray = new Float32Array(pcmSamplesRef.current);
        const sampleRate = audioContextRef.current?.sampleRate
          ? Math.round(audioContextRef.current.sampleRate / 4)
          : 11025;
        audioUrl = encodeWavFromFloatSamples(floatArray, sampleRate);
      } catch (err) {
        console.warn("PCM WAV encoding failed:", err);
      }
    }

    // Close AudioContext
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      try {
        await audioContextRef.current.close();
      } catch {
        // ignore
      }
    }

    const finalTranscript = (transcriptRef.current || accumulatedFinalRef.current).trim();

    return {
      samples,
      elapsed,
      audioUrl,
      transcript: finalTranscript,
    };
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
    transcript,
    startRecording,
    stopRecording,
    setPhase,
  };
}
