import { useEffect, useRef, useState } from "react";

/**
 * The Waveform — the one shared visual that carries Trounce's identity.
 * Three modes, one component.
 *
 *  - live:      reacts to mic input in real time, neutral teal
 *  - result:    static bars, color-segmented (teal = clear, amber = filler/pause),
 *               settles left-to-right over ~600ms on mount
 *  - thumbnail: static, compact, no animation — for tables & portfolio strips
 */

export type WaveformMode = "live" | "result" | "thumbnail";

export interface WaveformSegment {
  /** 0..1 amplitude */
  v: number;
  /** clear speech vs flagged moment */
  kind?: "clear" | "filler" | "pause";
}

interface WaveformProps {
  mode: WaveformMode;
  data?: WaveformSegment[];
  /** for live mode, optional MediaStream */
  stream?: MediaStream | null;
  height?: number;
  bars?: number;
  className?: string;
  playbackProgress?: number; // 0..1 current playback position (lights up played portion in real time)
  onSeek?: (fraction: number) => void; // clickable seeking on waveform
}

function getThemeColors() {
  const isLight =
    typeof document !== "undefined" && document.documentElement.classList.contains("light");
  return {
    clear: isLight ? "#0D9488" : "#3FB8AF",
    filler: isLight ? "#D97706" : "#E2A33C",
    pause: isLight ? "#94A3B8" : "#6B645A",
    live: isLight ? "#0D9488" : "#3FB8AF",
    rest: isLight ? "#CBD5E1" : "#2E2A26",
    unplayed: isLight ? "#E2E8F0" : "#26221D",
  };
}

export function Waveform({
  mode,
  data,
  stream,
  height = mode === "thumbnail" ? 22 : mode === "live" ? 140 : 100,
  bars = mode === "thumbnail" ? 48 : 64,
  className,
  playbackProgress,
  onSeek,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const liveBufferRef = useRef<number[]>(new Array(bars).fill(0));
  const [settleProgress, setSettleProgress] = useState(mode === "result" ? 0 : 1);

  const isDraggingRef = useRef(false);

  // result-mode settle animation
  useEffect(() => {
    if (mode !== "result") return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setSettleProgress(1);
      return;
    }
    const start = performance.now();
    const duration = 650;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setSettleProgress(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [mode, data]);

  // live-mode mic loop
  useEffect(() => {
    if (mode !== "live") return;
    let ctx: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let src: MediaStreamAudioSourceNode | null = null;
    let frame: Uint8Array<ArrayBuffer> | null = null;

    const setup = async () => {
      if (!stream) return;
      try {
        const Ctor =
          (window as unknown as { AudioContext?: typeof AudioContext }).AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        ctx = new Ctor();
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        src = ctx.createMediaStreamSource(stream);
        src.connect(analyser);
        frame = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      } catch {
        // silently degrade to idle waveform
      }
    };
    setup();

    const BAR_INTERVAL_MS = 70;
    let lastBarTime = 0;
    let smoothedAmp = 0;

    const tick = (now: number) => {
      const canvas = canvasRef.current;
      if (canvas) {
        let rawAmp = 0;
        if (analyser && frame) {
          analyser.getByteTimeDomainData(frame);
          let sum = 0;
          for (let i = 0; i < frame.length; i++) {
            const v = (frame[i] - 128) / 128;
            sum += v * v;
          }
          rawAmp = Math.min(1, Math.sqrt(sum / frame.length) * 2.6);
        } else {
          rawAmp = 0.05 + Math.random() * 0.04;
        }

        const alpha = rawAmp > smoothedAmp ? 0.45 : 0.14;
        smoothedAmp = alpha * rawAmp + (1 - alpha) * smoothedAmp;

        if (now - lastBarTime >= BAR_INTERVAL_MS) {
          lastBarTime = now;
          liveBufferRef.current.push(smoothedAmp);
          if (liveBufferRef.current.length > bars) liveBufferRef.current.shift();
        }

        drawLive(canvas, liveBufferRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      src?.disconnect();
      analyser?.disconnect();
      ctx?.close().catch(() => {});
    };
  }, [mode, stream, bars]);

  // result / thumbnail drawing (synchronized with RAF to prevent tearing/flicker)
  useEffect(() => {
    if (mode === "live") return;
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    let animId = 0;
    const render = () => {
      const progress =
        playbackProgress !== undefined && playbackProgress > 0
          ? 1
          : mode === "result"
            ? settleProgress
            : 1;
      drawStatic(canvas, data, progress, mode, playbackProgress);
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, [mode, data, settleProgress, playbackProgress]);

  // Re-draw on window resize
  useEffect(() => {
    if (mode === "live") return;
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (canvas && data) {
        const progress =
          playbackProgress !== undefined && playbackProgress > 0
            ? 1
            : mode === "result"
              ? settleProgress
              : 1;
        drawStatic(canvas, data, progress, mode, playbackProgress);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [mode, data, settleProgress, playbackProgress]);

  // Global mouseup to cleanly release dragging seek anywhere on the window
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      isDraggingRef.current = false;
    };
    window.addEventListener("mouseup", handleGlobalMouseUp);
    return () => window.removeEventListener("mouseup", handleGlobalMouseUp);
  }, []);

  const seekFromEvent = (clientX: number) => {
    if (!onSeek) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0) return;
    const clickX = clientX - rect.left;
    const fraction = Math.max(0, Math.min(1, clickX / rect.width));
    onSeek(fraction);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onSeek) return;
    isDraggingRef.current = true;
    seekFromEvent(e.clientX);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current && onSeek) {
      seekFromEvent(e.clientX);
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={
        mode === "live"
          ? "Live recording waveform"
          : mode === "result"
            ? "Speech waveform with clarity segments"
            : "Attempt waveform thumbnail"
      }
      onMouseDown={onSeek ? handleMouseDown : undefined}
      onMouseMove={onSeek ? handleMouseMove : undefined}
      onMouseUp={onSeek ? handleMouseUp : undefined}
      style={{ width: "100%", height, display: "block" }}
      className={`${className || ""} ${onSeek ? "cursor-pointer select-none" : ""}`}
    />
  );
}

// ---------- drawing helpers ----------

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  const rect = canvas.getBoundingClientRect();
  const w = rect.width;
  const h = rect.height;
  if (w <= 0 || h <= 0) return { ctx: null, w: 0, h: 0 };

  const targetW = Math.max(1, Math.floor(w * dpr));
  const targetH = Math.max(1, Math.floor(h * dpr));

  // Only allocate new buffer if dimensions actually changed (prevents GPU flicker)
  if (canvas.width !== targetW || canvas.height !== targetH) {
    canvas.width = targetW;
    canvas.height = targetH;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) return { ctx: null, w: 0, h: 0 };

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Resamples an array of WaveformSegments continuously at a normalized fraction [0..1]
 */
function sampleSegmentAt(data: WaveformSegment[], fraction: number): WaveformSegment {
  if (data.length === 0) return { v: 0.1, kind: "clear" };
  if (data.length === 1) return data[0];
  const idxFloat = Math.max(0, Math.min(data.length - 1, fraction * (data.length - 1)));
  const i0 = Math.floor(idxFloat);
  const i1 = Math.min(data.length - 1, i0 + 1);
  const t = idxFloat - i0;

  const v0 = data[i0].v;
  const v1 = data[i1].v;
  const v = v0 * (1 - t) + v1 * t;

  // Preserve diagnostics (filler or pause) within the window
  const kind =
    data[i0].kind === "filler" || data[i1].kind === "filler"
      ? "filler"
      : data[i0].kind === "pause" || data[i1].kind === "pause"
        ? "pause"
        : "clear";

  return { v, kind };
}

function drawLive(canvas: HTMLCanvasElement, buf: number[]) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!ctx || w <= 0 || h <= 0) return;
  const colors = getThemeColors();
  const barW = 3;
  const gap = 2;
  const slot = barW + gap;
  const maxBars = Math.max(16, Math.floor((w + gap) / slot));
  const n = Math.min(buf.length, maxBars);
  const mid = h / 2;
  const totalW = n * slot - gap;
  const startX = Math.max(0, (w - totalW) / 2);

  for (let i = 0; i < n; i++) {
    const v = buf[i] ?? 0;
    const minH = 4;
    const maxH = Math.max(minH, h * 0.92);
    const bh = minH + v * (maxH - minH);
    const x = startX + i * slot;
    if (x + barW > w) break;
    ctx.fillStyle = v > 0.04 ? colors.live : colors.rest;
    roundRect(ctx, x, mid - bh / 2, barW, bh, 1.5);
    ctx.fill();
  }
}

function drawStatic(
  canvas: HTMLCanvasElement,
  data: WaveformSegment[],
  progress: number,
  mode: WaveformMode,
  playbackProgress?: number,
) {
  const { ctx, w, h } = setupCanvas(canvas);
  if (!ctx || w <= 0 || h <= 0 || !data.length) return;
  const colors = getThemeColors();

  // High-density, slender audio bars
  const isThumb = mode === "thumbnail";
  const barW = isThumb ? 2.5 : 3.0;
  const gap = isThumb ? 1.5 : 2.0;
  const slot = barW + gap;

  // Number of slender bars that fill this exact canvas width
  const totalBars = Math.max(16, Math.floor((w + gap) / slot));
  const actualWaveWidth = totalBars * slot - gap;
  const startX = Math.max(0, (w - actualWaveWidth) / 2);
  const mid = h / 2;
  const revealCount = Math.floor(totalBars * progress + 0.0001);

  // Height scaling: minimum height forms a clean center resting baseline (pins, not flat dashes)
  const minH = isThumb ? 3 : 4;
  const maxH = Math.max(minH, h * 0.92);
  const radius = isThumb ? 1.25 : 1.5;

  for (let i = 0; i < totalBars; i++) {
    const fraction = totalBars > 1 ? i / (totalBars - 1) : 0;
    const seg = sampleSegmentAt(data, fraction);
    const revealed = i < revealCount || progress >= 1;

    // Amplitude mapping
    const bh = minH + Math.max(0, Math.min(1, seg.v)) * (maxH - minH);
    const x = startX + i * slot;
    if (x + barW > w) break;

    let color: string = colors.rest;
    if (revealed) {
      if (playbackProgress !== undefined) {
        const isPlayed = fraction <= playbackProgress;
        if (isPlayed) {
          color =
            seg.kind === "filler"
              ? colors.filler
              : seg.kind === "pause"
                ? colors.pause
                : colors.clear;
        } else {
          color = colors.unplayed;
        }
      } else {
        color =
          seg.kind === "filler"
            ? colors.filler
            : seg.kind === "pause"
              ? colors.pause
              : colors.clear;
      }
    }

    ctx.fillStyle = color;
    roundRect(ctx, x, mid - bh / 2, barW, bh, radius);
    ctx.fill();
  }

  // Draw luminous playhead needle if audio is actively playing or scrubbed
  if (playbackProgress !== undefined && playbackProgress >= 0 && playbackProgress <= 1) {
    const playheadX = Math.min(w - 2, Math.max(startX, startX + playbackProgress * actualWaveWidth));
    const needleH = Math.min(h, maxH + 4);
    ctx.fillStyle = colors.clear;
    roundRect(ctx, playheadX - 1, mid - needleH / 2, 2, needleH, 1);
    ctx.fill();
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (w <= 0 || h <= 0) return;
  const maxR = Math.max(0, Math.min(w / 2, h / 2));
  const rr = Math.max(0, Math.min(r, maxR));
  if (rr === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- authentic speech envelope synthesizer ----------

/**
 * Generates an authentic speech waveform envelope that mirrors human vocal cadence
 * (distinct spoken breath groups, syllabic vowel peaks, consonant valleys, and sentence pauses)
 */
export function makeSampleWaveform(
  seed: number,
  length = 56,
  flagDensity = 0.15,
): WaveformSegment[] {
  let s = Math.abs(seed * 9301 + 49297) % 233280;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const out: WaveformSegment[] = [];

  // Model 3-5 distinct spoken phrases (breath groups) across the timeline
  const numPhrases = 3 + Math.floor(rand() * 2);
  const phraseLength = Math.max(8, Math.floor(length / numPhrases));

  for (let i = 0; i < length; i++) {
    const posInPhrase = (i % phraseLength) / phraseLength; // 0..1

    // Natural speech phrase dynamic envelope (rises smoothly, plateaus with syllables, tapers)
    const phraseEnvelope = Math.sin(posInPhrase * Math.PI) * (0.8 + rand() * 0.2);

    // Syllabic modulation (simulates vowel-consonant cadences of English speech)
    const syllableWave = 0.55 + 0.35 * Math.sin(i * 1.65 + seed * 0.7);

    // Acoustic micro-texture
    const jitter = (rand() - 0.5) * 0.14;

    // Breath pause between phrases
    const isPhraseBoundary = posInPhrase < 0.08 || posInPhrase > 0.92;

    let v: number;
    let kind: WaveformSegment["kind"] = "clear";

    if (isPhraseBoundary && rand() < 0.75) {
      // Natural breath pause between sentences
      v = 0.06 + rand() * 0.05;
      kind = "pause";
    } else {
      v = Math.max(0.12, Math.min(0.96, phraseEnvelope * syllableWave + jitter));

      const r = rand();
      if (r < flagDensity * 0.5) {
        kind = "filler";
        v = Math.max(0.22, v * 0.7); // Hesitations have muffled acoustic energy
      } else if (r < flagDensity) {
        kind = "pause";
        v = 0.06 + rand() * 0.05;
      }
    }

    out.push({ v, kind });
  }

  return out;
}
