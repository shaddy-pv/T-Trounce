import { useNavigate, useRouter } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { StatusDot } from "@/components/tarang/StatusDot";
import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow } from "@/types";

export function ChannelStripTable({ students }: { students: StudentRow[] }) {
  const navigate = useNavigate();
  const router = useRouter();
  return (
    <section className="mt-10">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
          roster · channel strips
        </p>
        <div className="flex items-center gap-3 text-[11px] text-tertiary-warm shrink-0">
          <span className="flex items-center gap-1.5">
            <StatusDot status="on-track" /> on track
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot status="nudge" /> nudge
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot status="flagged" /> flagged
          </span>
        </div>
      </div>

      {/* Mobile Card Roster (< sm) */}
      <div className="mt-3 sm:hidden space-y-2.5">
        {students.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
            className="rounded-[8px] border border-hairline bg-ink-900 p-3.5 space-y-2.5 active:bg-ink-800 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status={s.status} />
                <span className="font-medium text-primary-warm truncate text-[14px]">{s.name}</span>
              </div>
              <span className="num text-[11px] text-secondary-warm shrink-0">{s.lastActive}</span>
            </div>

            <div className="rounded-[4px] bg-ink-950 p-2">
              <Waveform mode="thumbnail" data={s.waveform} height={20} />
            </div>

            <div className="flex items-center justify-between text-[12px] pt-0.5">
              <span className="text-secondary-warm truncate max-w-[180px]">{s.focus}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className="num font-semibold text-primary-warm">{s.scorePct}%</span>
                <span
                  className={
                    "inline-flex items-center gap-0.5 num text-[11px] " +
                    (s.trendPct < 0
                      ? "text-[#C1503B]"
                      : s.trendPct === 0
                        ? "text-tertiary-warm"
                        : "text-[#3FB8AF]")
                  }
                >
                  {s.trendPct < 0 ? (
                    <TrendingDown size={11} />
                  ) : s.trendPct > 0 ? (
                    <TrendingUp size={11} />
                  ) : null}
                  {s.trendPct > 0 ? "+" : ""}
                  {s.trendPct}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tablet & Desktop Table Roster (>= sm) */}
      <div className="mt-3 hidden sm:block overflow-x-auto rounded-[4px] border border-hairline">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead className="bg-ink-900">
            <tr className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
              <th className="w-6 px-3 py-2 text-left"></th>
              <th className="px-2 py-2 text-left font-normal whitespace-nowrap">Name</th>
              <th className="px-2 py-2 text-left font-normal whitespace-nowrap">Waveform</th>
              <th className="px-2 py-2 text-left font-normal whitespace-nowrap">Focus</th>
              <th className="px-2 py-2 text-right font-normal whitespace-nowrap">Score</th>
              <th className="px-2 py-2 text-right font-normal whitespace-nowrap">Trend</th>
              <th className="px-2 py-2 text-right font-normal whitespace-nowrap">Last active</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr
                key={s.id}
                onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
                onMouseEnter={() =>
                  router.preloadRoute({ to: "/students/$id", params: { id: s.id } })
                }
                className={
                  "cursor-pointer group transition hover:bg-ink-900 " +
                  (i > 0 ? "border-t border-hairline" : "")
                }
              >
                <td className="px-3 py-3">
                  <StatusDot status={s.status} />
                </td>
                <td className="px-2 py-3">
                  <span className="text-primary-warm group-hover:underline font-medium whitespace-nowrap">
                    {s.name}
                  </span>
                </td>
                <td className="px-2 py-3 w-[200px]">
                  <Waveform mode="thumbnail" data={s.waveform} height={20} />
                </td>
                <td className="px-2 py-3 text-secondary-warm">{s.focus}</td>
                <td className="num px-2 py-3 text-right text-primary-warm whitespace-nowrap">
                  {s.scorePct}%
                </td>
                <td className="num px-2 py-3 text-right whitespace-nowrap">
                  <span
                    className={
                      "inline-flex items-center gap-1 " +
                      (s.trendPct < 0
                        ? "text-[#C1503B]"
                        : s.trendPct === 0
                          ? "text-tertiary-warm"
                          : "text-[#3FB8AF]")
                    }
                  >
                    {s.trendPct < 0 ? (
                      <TrendingDown size={12} />
                    ) : s.trendPct > 0 ? (
                      <TrendingUp size={12} />
                    ) : null}
                    {s.trendPct > 0 ? "+" : ""}
                    {s.trendPct}%
                  </span>
                </td>
                <td className="num px-2 py-3 text-right text-secondary-warm whitespace-nowrap">
                  {s.lastActive}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
