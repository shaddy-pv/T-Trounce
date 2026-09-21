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
      <div className="mt-3 overflow-x-auto rounded-[4px] border border-dashed border-[#C1503B]/60 bg-[#C1503B]/[0.04]">
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
                  <span className="font-medium text-primary-warm group-hover:text-white group-hover:underline transition-colors">
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
                <td className="px-2 py-2.5 text-right">
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
