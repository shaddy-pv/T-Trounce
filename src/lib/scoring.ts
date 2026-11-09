/**
 * Shared attempt scoring and speech helpers, used by both server and client.
 */

const MISSING_METRIC_DEFAULT = 70;

export interface ScorableAttempt {
  durationSec: number;
  targetDurationSec?: number;
  pronunciation?: number;
  vocabulary?: number;
  grammar?: number;
}

/** Average of the three speech metrics. */
export function averageMetrics(a: Omit<ScorableAttempt, "durationSec" | "targetDurationSec">) {
  return Math.round(
    ((a.pronunciation ?? MISSING_METRIC_DEFAULT) +
      (a.vocabulary ?? MISSING_METRIC_DEFAULT) +
      (a.grammar ?? MISSING_METRIC_DEFAULT)) /
      3,
  );
}

/**
 * Completion score: seconds recorded against the target, capped at 100.
 * Older attempts without a target fall back to the metric average.
 */
export function attemptScore(a: ScorableAttempt): number {
  if (a.targetDurationSec && a.targetDurationSec > 0) {
    return Math.min(100, Math.round((a.durationSec / a.targetDurationSec) * 100));
  }
  return averageMetrics(a);
}

/** Name of the weakest metric, shown to teachers as the student's focus area. */
export function weakestMetric(a: {
  pronunciation?: number;
  vocabulary?: number;
  grammar?: number;
}): "Pronunciation" | "Vocabulary" | "Grammar" {
  const pronunciation = a.pronunciation ?? MISSING_METRIC_DEFAULT;
  const vocabulary = a.vocabulary ?? MISSING_METRIC_DEFAULT;
  const grammar = a.grammar ?? MISSING_METRIC_DEFAULT;
  const min = Math.min(pronunciation, vocabulary, grammar);
  if (min === pronunciation) return "Pronunciation";
  if (min === vocabulary) return "Vocabulary";
  return "Grammar";
}

/** The single list of filler sounds used for counting and for highlighting. */
export const FILLER_KEYWORDS: ReadonlySet<string> = new Set([
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

export function countFillerWords(text: string): number {
  let count = 0;
  for (const word of text.toLowerCase().split(/\s+/)) {
    if (FILLER_KEYWORDS.has(word.replace(/[^a-z]/g, ""))) count++;
  }
  return count;
}
