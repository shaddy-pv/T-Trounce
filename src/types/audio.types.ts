export type WaveformMode = "live" | "result" | "thumbnail";

export type WaveformSegmentKind = "clear" | "filler" | "pause";

export interface WaveformSegment {
  /** 0..1 amplitude value */
  v: number;
  /** Clear speech vs hesitation vs pause segment */
  kind?: WaveformSegmentKind;
}

export interface AcousticAnalysisResult {
  durationSec: number;
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  waveform: WaveformSegment[];
}
