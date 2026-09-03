import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { StudentShell } from "@/components/tarang/StudentShell";
import { Waveform, type WaveformSegment } from "@/components/tarang/Waveform";
import { fetchStudentAttemptsFn } from "@/server/data";
import { useUser } from "@/lib/auth";
import type { AttemptResult } from "@/types";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress · Tarang" },
      { name: "description", content: "Your speaking attempts over time." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  loader: async ({ context }): Promise<{ attempts: AttemptResult[] }> => {
    const studentId = context.session?.userId;
    const attempts = studentId ? await fetchStudentAttemptsFn({ data: studentId }) : [];
    return { attempts };
  },
  component: ProgressPage,
});

function ProgressPage() {
  const loaderData = Route.useLoaderData() as { attempts?: AttemptResult[] } | undefined;
  const attempts = loaderData?.attempts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const user = useUser();

  /**
   * Compute completion% the same way as the practice page "Done · X%" badge:
   *   min(100, round(recordedSec / targetSec * 100))
   * Falls back to audio-quality triad average only for old attempts without targetDurationSec.
   */
  const computeScore = (a: AttemptResult): number => {
    if (a.targetDurationSec && a.targetDurationSec > 0) {
      return Math.min(100, Math.round((a.durationSec / a.targetDurationSec) * 100));
    }
    return Math.round((a.pronunciation + a.vocabulary + a.grammar) / 3);
  };

  const history: {
    id: string;
    date: string;
    score: number;
    prompt: string;
    label: string;
    wf: WaveformSegment[];
  }[] = attempts.map((a: AttemptResult) => ({
    id: a.id,
    date: new Date(a.createdAt || Date.now()).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
    score: computeScore(a),
    prompt: a.prompt,
    // Show recorded vs target duration as a sub-label
    label: a.targetDurationSec
      ? `${a.durationSec}s / ${a.targetDurationSec}s`
      : `${a.durationSec}s`,
    wf: a.waveform,
  }));

  const firstScore = history[history.length - 1]?.score ?? 0;
  const latestScore = history[0]?.score ?? 0;

  return (
    <StudentShell>
      <div className="px-5 pt-2 pb-10">
        <h1 className="display text-[28px]">Your portfolio</h1>
        <p className="mt-2 text-[13px] text-secondary-warm">
          Attempts saved to your coaching profile — latest on top.
        </p>

        {history.length > 0 ? (
          <>
            <div className="mt-6 rounded-[12px] border border-hairline bg-ink-900 p-4">
              <div className="flex items-baseline justify-between">
                <p className="num text-[11px] uppercase tracking-[0.14em] text-tertiary-warm">
                  30-day signal trajectory
                </p>
                <p className="num text-[14px] text-primary-warm">
                  {firstScore} <span className="text-tertiary-warm">→</span> {latestScore}%
                </p>
              </div>
              <p className="mt-1 text-[13px] text-secondary-warm">
                {latestScore >= firstScore
                  ? "Speech energy is rising. Pauses are more deliberate."
                  : "Keep practicing daily prompts to build vocal confidence."}
              </p>
            </div>

            <ul className="mt-6 flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-[12px] border border-hairline bg-ink-900 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-primary-warm">{h.date}</p>
                      <p className="text-[11px] text-secondary-warm line-clamp-1">{h.prompt}</p>
                    </div>
                    <div className="text-right">
                      <p className="num text-[14px] text-primary-warm">{h.score}%</p>
                      <p className="num text-[10px] text-tertiary-warm">{h.label}</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <Waveform mode="thumbnail" data={h.wf} height={28} />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Link
                      to="/result/$attemptId"
                      params={{ attemptId: h.id }}
                      className="num text-[11px] text-[#3FB8AF] hover:underline"
                    >
                      View Full Diagnostics →
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-12 flex flex-col items-center gap-3 text-center">
            <p className="num text-[13px] uppercase tracking-[0.14em] text-tertiary-warm">
              No attempts yet
            </p>
            <p className="text-[14px] text-secondary-warm">
              Complete a practice drill or homework to see your signal here.
            </p>
            <Link
              to="/practice"
              className="mt-2 inline-flex items-center gap-1.5 rounded-[8px] bg-[#3FB8AF] px-4 py-2 text-[13px] font-medium text-ink-950 transition hover:brightness-110"
            >
              Go to Practice →
            </Link>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
