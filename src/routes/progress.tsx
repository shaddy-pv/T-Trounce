import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { StudentShell } from "@/components/tarang/StudentShell";
import { Waveform, type WaveformSegment } from "@/components/tarang/Waveform";
import { fetchStudentAttemptsFn } from "@/server/data";
import { cachedClientFetch } from "@/lib/client-cache";
import type { AttemptResult } from "@/types";
import { useLanguage } from "@/lib/i18n";

export const Route = createFileRoute("/progress")({
  head: () => ({
    meta: [
      { title: "Progress · Trounce" },
      { name: "description", content: "Your speaking attempts over time." },
    ],
  }),
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: "/login" });
  },
  loader: async ({ context }): Promise<{ attempts: AttemptResult[] }> => {
    const studentId = context.session?.userId;
    const attempts = studentId
      ? await cachedClientFetch(`student-attempts-${studentId}`, () =>
          fetchStudentAttemptsFn({ data: studentId }),
        )
      : [];
    return { attempts };
  },
  pendingComponent: ProgressSkeleton,
  component: ProgressPage,
});

function ProgressSkeleton() {
  return (
    <StudentShell>
      <div className="space-y-6 px-5 py-6 animate-pulse">
        <div className="h-6 w-32 bg-ink-900 rounded" />
        <div className="h-32 bg-ink-900 rounded-[12px] border border-hairline" />
        <div className="h-44 bg-ink-900 rounded-[12px] border border-hairline" />
      </div>
    </StudentShell>
  );
}

function ProgressPage() {
  const loaderData = Route.useLoaderData() as { attempts?: AttemptResult[] } | undefined;
  const attempts = loaderData?.attempts ?? [];
  const { t } = useLanguage();

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
        <h1 className="display text-[26px] font-medium text-primary-warm">
          {t("your_progress_title")}
        </h1>
        <p className="mt-1 text-[13px] text-secondary-warm">{t("your_progress_sub")}</p>

        {history.length > 0 ? (
          <>
            <div className="mt-5 rounded-[12px] border border-hairline bg-ink-900 p-4">
              <div className="flex items-baseline justify-between">
                <p className="num text-[11px] uppercase tracking-[0.14em] text-tertiary-warm">
                  {t("trajectory_title")}
                </p>
                <p className="num text-[15px] font-bold text-primary-warm">
                  {firstScore}% <span className="text-tertiary-warm">➜</span>{" "}
                  <span className="text-[#3FB8AF]">{latestScore}%</span>
                </p>
              </div>
              <p className="mt-1 text-[12px] text-secondary-warm">
                {latestScore >= firstScore ? t("trajectory_good") : t("trajectory_start")}
              </p>
            </div>

            <ul className="mt-5 flex flex-col gap-3">
              {history.map((h) => (
                <li key={h.id} className="rounded-[12px] border border-hairline bg-ink-900 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[13px] font-medium text-primary-warm">{h.date}</p>
                      <p className="text-[12px] text-secondary-warm line-clamp-1 italic">
                        "{h.prompt}"
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="display num text-[16px] font-bold text-[#3FB8AF]">{h.score}%</p>
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
                      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#3FB8AF] hover:underline"
                    >
                      {t("listen_result_btn")}
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-12 text-center rounded-[12px] border border-hairline bg-ink-900 p-8">
            <p className="text-[15px] font-medium text-primary-warm">{t("no_recordings_yet")}</p>
            <p className="mt-1 text-[12px] text-secondary-warm">{t("no_recordings_sub")}</p>
            <Link
              to="/practice"
              className="mt-4 inline-flex items-center justify-center rounded-[10px] bg-[#3FB8AF] px-5 py-2.5 text-[13px] font-bold text-ink-950 shadow-md shadow-[#3FB8AF]/20"
            >
              {t("start_first_drill_btn")}
            </Link>
          </div>
        )}
      </div>
    </StudentShell>
  );
}
