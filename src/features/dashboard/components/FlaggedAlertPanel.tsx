import { useNavigate, useRouter } from "@tanstack/react-router";
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
        <p className="num text-[11px] uppercase tracking-[0.18em] text-[#C1503B]">
          ⚠ needs attention
        </p>
        <span className="num text-[11px] text-tertiary-warm">
          {flagged.length} of {totalCount}
        </span>
      </div>

      {/* Mobile Card Layout (< sm) */}
      <div className="mt-3 sm:hidden space-y-2.5">
        {flagged.map((s) => (
          <div
            key={s.id}
            onClick={() => navigate({ to: "/students/$id", params: { id: s.id } })}
            className="rounded-[8px] border border-dashed border-[#C1503B]/60 bg-[#C1503B]/[0.05] p-3.5 space-y-2.5 active:bg-[#C1503B]/[0.12] transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <StatusDot status="flagged" />
                <span className="font-semibold text-primary-warm truncate text-[14px]">
                  {s.name}
                </span>
              </div>
              <span className="num text-[12px] font-medium text-[#3FB8AF] shrink-0">Review →</span>
            </div>

            <div className="rounded-[4px] bg-ink-950/80 p-2">
              <Waveform mode="thumbnail" data={s.waveform} height={20} />
            </div>

            <p className="num text-[12px] text-[#C1503B]">{s.flagReason}</p>
          </div>
        ))}
      </div>

      {/* Tablet & Desktop Table Layout (>= sm) */}
      <div className="mt-3 hidden sm:block overflow-x-auto rounded-[4px] border border-dashed border-[#C1503B]/60 bg-[#C1503B]/[0.04]">
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
                  "group cursor-pointer select-none transition-colors duration-150 hover:bg-[#C1503B]/[0.12] active:bg-[#C1503B]/[0.18] " +
                  (i > 0 ? "border-t border-[#C1503B]/20" : "")
                }
                title={`Click to open ${s.name}'s review dossier`}
              >
                <td className="w-6 px-3 py-2.5">
                  <StatusDot status="flagged" />
                </td>
                <td className="px-2 py-2.5">
                  <span className="font-medium text-primary-warm group-hover:text-white group-hover:underline transition-colors whitespace-nowrap">
                    {s.name}
                  </span>
                </td>
                <td className="px-2 py-2.5 w-[160px]">
                  <div className="opacity-90">
                    <Waveform mode="thumbnail" data={s.waveform} height={20} />
                  </div>
                </td>
                <td className="num px-2 py-2.5 text-secondary-warm group-hover:text-primary-warm transition-colors">
                  {s.flagReason}
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap">
                  <span className="num text-[12px] font-medium text-[#3FB8AF] group-hover:translate-x-0.5 group-hover:underline transition-transform inline-block">
                    Review →
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
