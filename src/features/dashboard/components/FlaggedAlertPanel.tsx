import { useNavigate, useRouter } from "@tanstack/react-router";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { StatusDot } from "@/components/tarang/StatusDot";
import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow } from "@/types";

export function FlaggedAlertPanel({
  flagged,
  totalCount,
}: {
  flagged: StudentRow[];
  totalCount: number;
}) {
  const navigate = useNavigate();
  const router = useRouter();
  if (flagged.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between">
        <p className="num text-[11px] uppercase tracking-[0.18em] text-[#C1503B] light:text-red-700 font-semibold flex items-center gap-1.5">
          <AlertTriangle size={13} className="shrink-0" /> Needs Attention
        </p>
        <span className="num text-[11px] text-tertiary-warm font-medium">
          {flagged.length} of {totalCount} students
        </span>
      </div>

      {/* Mobile Card Layout (< sm) */}
      <div className="mt-3 sm:hidden space-y-2.5">
        {flagged.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
            className="rounded-[8px] border border-dashed border-[#C1503B]/60 light:border-red-300 bg-[#C1503B]/[0.05] light:bg-red-50/60 p-3.5 space-y-2.5 active:bg-[#C1503B]/[0.12] transition-colors cursor-pointer shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status="flagged" />
                <span className="font-semibold text-primary-warm truncate text-[14px]">
                  {s.name}
                </span>
              </div>
              <span className="inline-flex items-center gap-0.5 num text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700 shrink-0">
                Review <ChevronRight size={13} />
              </span>
            </div>

            <div className="rounded-[4px] bg-ink-950/80 light:bg-slate-100 p-2 border border-hairline/40">
              <Waveform mode="thumbnail" data={s.waveform} height={20} />
            </div>

            <p className="num text-[12px] font-medium text-[#C1503B] light:text-red-700">
              {s.flagReason}
            </p>
          </div>
        ))}
      </div>

      {/* Tablet & Desktop Table Layout (>= sm) */}
      <div className="mt-3 hidden sm:block overflow-x-auto rounded-[6px] border border-dashed border-[#C1503B]/60 light:border-red-300 bg-[#C1503B]/[0.04] light:bg-red-50/40 shadow-sm">
        <table className="w-full min-w-[560px] text-[13px]">
          <tbody>
            {flagged.map((s, i) => (
              <tr
                key={s.id}
                onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
                onMouseEnter={() =>
                  router.preloadRoute({ to: "/students/$id", params: { id: s.id } })
                }
                className={
                  "group cursor-pointer select-none transition-colors duration-150 hover:bg-[#C1503B]/[0.10] light:hover:bg-red-100/60 active:bg-[#C1503B]/[0.16] " +
                  (i > 0 ? "border-t border-[#C1503B]/20 light:border-red-200" : "")
                }
                title={`Click to open ${s.name}'s review dossier`}
              >
                <td className="w-6 px-3 py-2.5">
                  <StatusDot status="flagged" />
                </td>
                <td className="px-2 py-2.5">
                  <span className="font-semibold text-primary-warm group-hover:text-[#C1503B] light:group-hover:text-red-700 group-hover:underline transition-colors whitespace-nowrap">
                    {s.name}
                  </span>
                </td>
                <td className="px-2 py-2.5 w-[160px]">
                  <div className="rounded-[4px] bg-ink-950/80 light:bg-slate-100 p-1 border border-hairline/40">
                    <Waveform mode="thumbnail" data={s.waveform} height={18} />
                  </div>
                </td>
                <td className="num px-2 py-2.5 font-medium text-[#C1503B] light:text-red-700 transition-colors">
                  {s.flagReason}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="inline-flex items-center gap-0.5 num text-[12px] font-semibold text-[#3FB8AF] light:text-teal-700 group-hover:translate-x-0.5 transition-transform">
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
