import { useNavigate } from "@tanstack/react-router";
import { TrendingDown, TrendingUp } from "lucide-react";
import { StatusDot } from "@/components/tarang/StatusDot";
import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow } from "@/types";

export function ChannelStripTable({ students }: { students: StudentRow[] }) {
  const navigate = useNavigate();
  return (
    <section className="mt-10">
      <div className="flex items-center justify-between">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">
          roster · channel strips
        </p>
        <div className="flex items-center gap-3 text-[11px] text-tertiary-warm">
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

      <div className="mt-3 overflow-hidden rounded-[4px] border border-hairline">
        <table className="w-full text-[13px]">
          <thead className="bg-ink-900">
            <tr className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
              <th className="w-6 px-3 py-2 text-left"></th>
              <th className="px-2 py-2 text-left font-normal">Name</th>
              <th className="px-2 py-2 text-left font-normal">Waveform</th>
              <th className="px-2 py-2 text-left font-normal">Focus</th>
              <th className="px-2 py-2 text-right font-normal">Score</th>
              <th className="px-2 py-2 text-right font-normal">Trend</th>
              <th className="px-2 py-2 text-right font-normal">Last active</th>
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr
                key={s.id}
                onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
                className={
                  "cursor-pointer group transition hover:bg-ink-900 " +
                  (i > 0 ? "border-t border-hairline" : "")
                }
              >
                <td className="px-3 py-3">
                  <StatusDot status={s.status} />
                </td>
                <td className="px-2 py-3">
                  <span className="text-primary-warm group-hover:underline font-medium">
                    {s.name}
                  </span>
                </td>
                <td className="px-2 py-3 w-[200px]">
                  <Waveform mode="thumbnail" data={s.waveform} height={20} />
                </td>
                <td className="px-2 py-3 text-secondary-warm">{s.focus}</td>
                <td className="num px-2 py-3 text-right text-primary-warm">{s.scorePct}%</td>
                <td className="num px-2 py-3 text-right">
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
                <td className="num px-2 py-3 text-right text-secondary-warm">{s.lastActive}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
