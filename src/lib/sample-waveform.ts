import type { WaveformSegment } from "@/types";

/**
 * Generates an illustrative waveform for decoration, such as the sign-in page preview.
 * This is not anyone's real recording, so it must never be shown as a student's data.
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
