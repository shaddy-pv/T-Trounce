/**
 * Tarang Application & Acoustic Constants
 */
export const APP_CONFIG = {
  name: "Tarang",
  tagline: "Speak. See your signal.",
  institution: "Sharma Coaching, Patna",
  defaultBatch: "Class X-A",
  defaultTeacher: "Mrs. Mehta",
} as const;

export const ACOUSTIC_THRESHOLDS = {
  silence: 0.15,
  hesitation: 0.35,
  sampleIntervalMs: 200,
  targetWaveformBars: 56,
  minDurationSec: 5,
  maxDurationSec: 180,
} as const;

export const THEME_COLORS = {
  ink950: "#100E0C",
  ink900: "#171412",
  ink800: "#221E1A",
  signalTeal: "#3FB8AF",
  staticAmber: "#E2A33C",
  alertRust: "#C1503B",
  pauseMuted: "#6B645A",
  warmBorder: "#2E2A26",
} as const;
