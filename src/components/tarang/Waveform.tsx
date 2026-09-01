import { useEffect, useRef, useState } from "react";

/**
 * The Waveform — the one shared visual that carries Tarang's identity.
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
}

const COLOR_CLEAR = "#3FB8AF";
const COLOR_FILLER = "#E2A33C";
const COLOR_PAUSE = "#6B645A";
const COLOR_LIVE = "#3FB8AF";
const COLOR_REST = "#2E2A26";

export function Waveform({
  mode,
  data,
  stream,
  height = mode === "thumbnail" ? 24 : mode === "live" ? 140 : 120,
  bars = mode === "thumbnail" ? 28 : 56,
  className,
}: WaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const liveBufferRef = useRef<number[]>(new Array(bars).fill(0));
  const [settleProgress, setSettleProgress] = useState(mode === "result" ? 0 : 1);

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
    const duration = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      // ease-out
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

    const tick = () => {
      const canvas = canvasRef.current;
      if (canvas) {
        let amp = 0;
        if (analyser && frame) {
          analyser.getByteTimeDomainData(frame);
          let sum = 0;
          for (let i = 0; i < frame.length; i++) {
            const v = (frame[i] - 128) / 128;
            sum += v * v;
          }
          amp = Math.min(1, Math.sqrt(sum / frame.length) * 2.4);
        } else {
          // idle shimmer so it never looks dead
          amp = 0.08 + Math.random() * 0.06;
        }
        liveBufferRef.current.push(amp);
        if (liveBufferRef.current.length > bars) liveBufferRef.current.shift();
        drawLive(canvas, liveBufferRef.current, bars);
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

  // result/thumbnail drawing
  useEffect(() => {
    if (mode === "live") return;
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    drawStatic(canvas, data, bars, mode === "result" ? settleProgress : 1, mode);
  }, [mode, data, bars, settleProgress]);

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
      style={{ width: "100%", height, display: "block" }}
      className={className}
    />
  );
}

// ---------- drawing helpers ----------

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);
  return { ctx, w: rect.width, h: rect.height };
}

function drawLive(canvas: HTMLCanvasElement, buf: number[], bars: number) {
  const { ctx, w, h } = setupCanvas(canvas);
  const gap = 2;
  const barW = (w - gap * (bars - 1)) / bars;
  const mid = h / 2;
  for (let i = 0; i < bars; i++) {
    const v = buf[i] ?? 0;
    const bh = Math.max(2, v * h * 0.9);
    const x = i * (barW + gap);
    ctx.fillStyle = v > 0.04 ? COLOR_LIVE : COLOR_REST;
    roundRect(ctx, x, mid - bh / 2, barW, bh, Math.min(2, barW / 2));
    ctx.fill();
  }
}

function drawStatic(
  canvas: HTMLCanvasElement,
  data: WaveformSegment[],
  bars: number,
  progress: number,
  mode: WaveformMode,
) {
  const { ctx, w, h } = setupCanvas(canvas);
  const n = Math.min(bars, data.length);
  const gap = mode === "thumbnail" ? 1 : 2;
  const barW = (w - gap * (n - 1)) / n;
  const mid = h / 2;
  const revealCount = Math.floor(n * progress + 0.0001);
  for (let i = 0; i < n; i++) {
    const seg = data[i];
    const revealed = i < revealCount || progress >= 1;
    const v = seg.v;
    const bh = Math.max(mode === "thumbnail" ? 1.5 : 2, v * h * 0.9);
    const x = i * (barW + gap);
    let color: string = COLOR_REST;
    if (revealed) {
      color =
        seg.kind === "filler" ? COLOR_FILLER : seg.kind === "pause" ? COLOR_PAUSE : COLOR_CLEAR;
    }
    ctx.fillStyle = color;
    roundRect(ctx, x, mid - bh / 2, barW, bh, Math.min(2, barW / 2));
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
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// ---------- sample data helpers used across screens ----------

export function makeSampleWaveform(
  seed: number,
  length = 56,
  flagDensity = 0.15,
): WaveformSegment[] {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const out: WaveformSegment[] = [];
  for (let i = 0; i < length; i++) {
    const base = 0.35 + Math.sin(i * 0.35 + seed) * 0.18 + rand() * 0.35;
    const v = Math.max(0.05, Math.min(1, base));
    const r = rand();
    const kind: WaveformSegment["kind"] =
      r < flagDensity * 0.6 ? "filler" : r < flagDensity ? "pause" : "clear";
    out.push({ v, kind });
  }
  return out;
}
