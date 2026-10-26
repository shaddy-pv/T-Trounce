import { useNavigate, useRouter } from "@tanstack/react-router";
import { TrendingDown, TrendingUp, Users, ChevronRight, AlertCircle } from "lucide-react";
import { StatusDot } from "@/components/tarang/StatusDot";
import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow } from "@/types";
import { useLanguage } from "@/lib/i18n";

function StatusBadge({ status }: { status: "on-track" | "nudge" | "flagged" }) {
  if (status === "on-track") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#3FB8AF]/10 light:bg-teal-50 text-[#3FB8AF] light:text-teal-800 border border-[#3FB8AF]/30 light:border-teal-200 whitespace-nowrap">
        <StatusDot status="on-track" />
        On Track
      </span>
    );
  }
  if (status === "nudge") {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#E2A33C]/10 light:bg-amber-50 text-[#E2A33C] light:text-amber-800 border border-[#E2A33C]/30 light:border-amber-200 whitespace-nowrap">
        <StatusDot status="nudge" />
        Needs Nudge
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[#C1503B]/10 light:bg-red-50 text-[#C1503B] light:text-red-800 border border-[#C1503B]/30 light:border-red-200 whitespace-nowrap">
      <StatusDot status="flagged" />
      Needs Help
    </span>
  );
}

export function ChannelStripTable({
  students,
  onResetFilters,
}: {
  students: StudentRow[];
  onResetFilters?: () => void;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  const { t } = useLanguage();

  if (students.length === 0) {
    return (
      <section className="mt-8 rounded-[8px] border border-hairline bg-ink-900 p-8 text-center shadow-sm">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-ink-800 light:bg-slate-100 text-tertiary-warm mb-3">
          <Users size={22} />
        </div>
        <h3 className="text-[15px] font-semibold text-primary-warm">No students match your criteria</h3>
        <p className="mt-1 text-[13px] text-secondary-warm max-w-md mx-auto">
          Try clearing your search term, changing the session or batch filter, or resetting the status filter.
        </p>
        {onResetFilters && (
          <button
            onClick={onResetFilters}
            className="mt-4 inline-flex items-center gap-1.5 rounded-[6px] bg-[#3FB8AF] px-4 py-1.5 text-[12px] font-semibold text-[#100E0C] hover:brightness-110 transition cursor-pointer"
          >
            Reset all filters
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="mt-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <p className="num text-[11px] uppercase tracking-[0.18em] text-tertiary-warm font-semibold">
            {t("channel_strip_title")}
          </p>
          <p className="text-[12px] text-secondary-warm mt-0.5">
            Showing {students.length} student{students.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-tertiary-warm shrink-0">
          <span className="flex items-center gap-1.5">
            <StatusDot status="on-track" /> {t("status_on_track")}
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot status="nudge" /> {t("status_needs_nudge")}
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot status="flagged" /> {t("status_flagged_help")}
          </span>
        </div>
      </div>

      {/* Mobile Card Roster (< sm) */}
      <div className="mt-3 sm:hidden space-y-2.5">
        {students.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
            className="rounded-[8px] border border-hairline bg-ink-900 p-3.5 space-y-2.5 active:bg-ink-800 transition-colors cursor-pointer shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusBadge status={s.status} />
                <span className="font-semibold text-primary-warm truncate text-[14px]">{s.name}</span>
              </div>
              <span className="num text-[11px] text-secondary-warm shrink-0">{s.lastActive}</span>
            </div>

            <div className="rounded-[4px] bg-ink-950 light:bg-slate-100 p-2 border border-hairline/50">
              <Waveform mode="thumbnail" data={s.waveform} height={20} />
            </div>

            {s.status === "flagged" && s.flagReason ? (
              <div className="flex items-center gap-1.5 text-[12px] text-[#C1503B] light:text-red-700 bg-[#C1503B]/[0.08] light:bg-red-50 p-2 rounded-[4px] border border-[#C1503B]/20">
                <AlertCircle size={14} className="shrink-0" />
                <span className="truncate">{s.flagReason}</span>
              </div>
            ) : (
              <div className="text-[12px] text-secondary-warm truncate">
                Focus: <span className="text-primary-warm font-medium">{s.focus}</span>
              </div>
            )}

            <div className="flex items-center justify-between text-[12px] pt-1 border-t border-hairline/60">
              <div className="flex items-center gap-2 shrink-0">
                <span className="num font-semibold text-primary-warm">{s.scorePct}%</span>
                <span
                  className={
                    "inline-flex items-center gap-0.5 num text-[11px] font-medium " +
                    (s.trendPct < 0
                      ? "text-[#C1503B] light:text-red-700"
                      : s.trendPct === 0
                        ? "text-tertiary-warm"
                        : "text-[#3FB8AF] light:text-teal-700")
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

              <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700">
                Review <ChevronRight size={14} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Tablet & Desktop Table Roster (>= sm) */}
      <div className="mt-3 hidden sm:block overflow-x-auto rounded-[6px] border border-hairline shadow-sm bg-ink-900">
        <table className="w-full min-w-[680px] text-[13px]">
          <thead className="bg-ink-800/60 light:bg-slate-100/80 border-b border-hairline">
            <tr className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">Status</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{t("col_name")}</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{t("col_waveform")}</th>
              <th className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{t("col_focus")}</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t("col_score")}</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t("col_trend")}</th>
              <th className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{t("col_last_practice")}</th>
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">Action</th>
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
                  "cursor-pointer group transition-colors hover:bg-ink-800/70 light:hover:bg-slate-50 " +
                  (i > 0 ? "border-t border-hairline" : "")
                }
              >
                <td className="px-3 py-3 whitespace-nowrap">
                  <StatusBadge status={s.status} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className="text-primary-warm font-semibold group-hover:text-[#3FB8AF] light:group-hover:text-teal-700 transition-colors">
                    {s.name}
                  </span>
                </td>
                <td className="px-3 py-3 w-[180px]">
                  <div className="rounded-[4px] bg-ink-950/70 light:bg-slate-100 p-1 border border-hairline/40">
                    <Waveform mode="thumbnail" data={s.waveform} height={18} />
                  </div>
                </td>
                <td className="px-3 py-3 max-w-[200px] truncate">
                  {s.status === "flagged" && s.flagReason ? (
                    <span className="text-[#C1503B] light:text-red-700 font-medium text-[12px] flex items-center gap-1">
                      <AlertCircle size={13} className="shrink-0" />
                      {s.flagReason}
                    </span>
                  ) : (
                    <span className="text-secondary-warm">{s.focus}</span>
                  )}
                </td>
                <td className="num px-3 py-3 text-right font-semibold text-primary-warm whitespace-nowrap">
                  {s.scorePct}%
                </td>
                <td className="num px-3 py-3 text-right whitespace-nowrap">
                  <span
                    className={
                      "inline-flex items-center gap-1 font-medium " +
                      (s.trendPct < 0
                        ? "text-[#C1503B] light:text-red-700"
                        : s.trendPct === 0
                          ? "text-tertiary-warm"
                          : "text-[#3FB8AF] light:text-teal-700")
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
                <td className="num px-3 py-3 text-right text-secondary-warm whitespace-nowrap">
                  {s.lastActive}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-[4px] text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700 bg-ink-800/80 light:bg-slate-100 border border-hairline group-hover:bg-[#3FB8AF] group-hover:text-[#100E0C] group-hover:border-[#3FB8AF] transition">
                    Review <ChevronRight size={13} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
