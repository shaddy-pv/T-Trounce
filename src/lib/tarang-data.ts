import { makeSampleWaveform, type WaveformSegment } from "@/components/tarang/Waveform";
import type { Status } from "@/components/tarang/StatusDot";

export interface Module {
  id: string;
  title: string;
  prompt: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  durationSec: number;
  completed?: boolean;
}

export const modules: Module[] = [
  {
    id: "hobby",
    title: "Talk about your favorite hobby",
    prompt: "Tell me about your favorite hobby",
    difficulty: "Beginner",
    durationSec: 45,
    completed: true,
  },
  {
    id: "weekend",
    title: "Describe your last weekend",
    prompt: "Describe what you did last weekend",
    difficulty: "Beginner",
    durationSec: 60,
  },
  {
    id: "city",
    title: "Your city in three sentences",
    prompt: "Describe your city in three sentences",
    difficulty: "Intermediate",
    durationSec: 60,
    completed: true,
  },
  {
    id: "opinion",
    title: "An opinion you hold strongly",
    prompt: "Share one opinion you hold strongly, and explain why",
    difficulty: "Intermediate",
    durationSec: 75,
  },
  {
    id: "debate",
    title: "Should phones be allowed in class?",
    prompt: "Argue for or against phones in classrooms",
    difficulty: "Advanced",
    durationSec: 90,
  },
];

export interface StudentRow {
  id: string;
  name: string;
  status: Status;
  focus: "General" | "Vocab" | "Pron" | "Grammar" | "Fluency";
  lastActive: string;
  scorePct: number;
  trendPct: number; // negative = decline
  waveform: WaveformSegment[];
  inactiveDays?: number;
  flagReason?: string;
}

export const studentRoster: StudentRow[] = [
  {
    id: "priya-s",
    name: "Priya S.",
    status: "flagged",
    focus: "Vocab",
    lastActive: "8d ago",
    scorePct: 41,
    trendPct: -6,
    inactiveDays: 8,
    flagReason: "Vocab 41% · Inactive 8d",
    waveform: makeSampleWaveform(11, 56, 0.45),
  },
  {
    id: "rahul-k",
    name: "Rahul K.",
    status: "flagged",
    focus: "Pron",
    lastActive: "2d ago",
    scorePct: 38,
    trendPct: -12,
    flagReason: "Pron 38% · Score down 12%",
    waveform: makeSampleWaveform(22, 56, 0.4),
  },
  {
    id: "aman-v",
    name: "Aman V.",
    status: "on-track",
    focus: "General",
    lastActive: "Today",
    scorePct: 82,
    trendPct: 4,
    waveform: makeSampleWaveform(3, 56, 0.08),
  },
  {
    id: "sneha-t",
    name: "Sneha T.",
    status: "nudge",
    focus: "Grammar",
    lastActive: "Today",
    scorePct: 64,
    trendPct: 1,
    waveform: makeSampleWaveform(7, 56, 0.18),
  },
  {
    id: "vikram-r",
    name: "Vikram R.",
    status: "on-track",
    focus: "General",
    lastActive: "Today",
    scorePct: 78,
    trendPct: 3,
    waveform: makeSampleWaveform(14, 56, 0.1),
  },
  {
    id: "anjali-m",
    name: "Anjali M.",
    status: "nudge",
    focus: "Fluency",
    lastActive: "Yesterday",
    scorePct: 59,
    trendPct: -2,
    waveform: makeSampleWaveform(19, 56, 0.22),
  },
  {
    id: "kabir-d",
    name: "Kabir D.",
    status: "on-track",
    focus: "General",
    lastActive: "Today",
    scorePct: 86,
    trendPct: 6,
    waveform: makeSampleWaveform(31, 56, 0.07),
  },
  {
    id: "ishita-p",
    name: "Ishita P.",
    status: "on-track",
    focus: "General",
    lastActive: "Yesterday",
    scorePct: 74,
    trendPct: 2,
    waveform: makeSampleWaveform(41, 56, 0.11),
  },
  {
    id: "neha-g",
    name: "Neha G.",
    status: "nudge",
    focus: "Vocab",
    lastActive: "2d ago",
    scorePct: 55,
    trendPct: -3,
    waveform: makeSampleWaveform(52, 56, 0.24),
  },
  {
    id: "arjun-b",
    name: "Arjun B.",
    status: "on-track",
    focus: "General",
    lastActive: "Today",
    scorePct: 80,
    trendPct: 5,
    waveform: makeSampleWaveform(63, 56, 0.09),
  },
];

export interface AttemptResult {
  id: string;
  assignmentId?: string;
  assignmentTitle?: string;
  prompt: string;
  durationSec: number;
  pronunciation: number;
  vocabulary: number;
  grammar: number;
  fillerCount: number;
  pauseCount: number;
  feedback: string;
  waveform: WaveformSegment[];
  createdAt?: string;
}

export function sampleResult(id: string): AttemptResult {
  const wf = makeSampleWaveform(
    id.split("").reduce((a, c) => a + c.charCodeAt(0), 0),
    56,
    0.2,
  );
  const fillers = wf.filter((s) => s.kind === "filler").length;
  const pauses = wf.filter((s) => s.kind === "pause").length;
  return {
    id,
    prompt: "Tell me about your favorite hobby",
    durationSec: 38,
    pronunciation: 72,
    vocabulary: 64,
    grammar: 81,
    fillerCount: fillers,
    pauseCount: pauses,
    feedback: `${fillers} filler words in this attempt: try pausing instead of saying "umm".`,
    waveform: wf,
    createdAt: new Date().toISOString(),
  };
}
