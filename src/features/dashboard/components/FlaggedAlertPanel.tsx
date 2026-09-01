import { Link } from "@tanstack/react-router";
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
      <div className="mt-3 overflow-hidden rounded-[4px] border border-dashed border-[#C1503B]/60 bg-[#C1503B]/[0.04]">
        <table className="w-full text-[13px]">
          <tbody>
            {flagged.map((s, i) => (
              <tr
                key={s.id}
                className={
                  "transition hover:bg-[#C1503B]/[0.08] " +
                  (i > 0 ? "border-t border-[#C1503B]/20" : "")
                }
              >
                <td className="w-6 px-3 py-2.5">
                  <StatusDot status="flagged" />
                </td>
                <td className="px-2 py-2.5">
                  <Link
                    to="/students/$id"
                    params={{ id: s.id }}
                    className="font-medium text-primary-warm hover:underline"
                  >
                    {s.name}
                  </Link>
                </td>
                <td className="px-2 py-2.5 w-[160px]">
                  <div className="opacity-90">
                    <Waveform mode="thumbnail" data={s.waveform} height={20} />
                  </div>
                </td>
                <td className="num px-2 py-2.5 text-secondary-warm">{s.flagReason}</td>
                <td className="px-2 py-2.5 text-right">
                  <Link
                    to="/students/$id"
                    params={{ id: s.id }}
                    className="num text-[12px] text-[#3FB8AF] hover:underline"
                  >
                    Review →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
