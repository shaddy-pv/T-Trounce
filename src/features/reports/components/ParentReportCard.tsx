import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow } from "@/types";

export function ParentReportCard({ student }: { student: StudentRow }) {
  const attemptsCount = Math.max(3, 10 - (student.inactiveDays ?? 0));
  const trendText =
    student.trendPct >= 0
      ? `Score up ${student.trendPct}% — clear stretches are getting longer.`
      : `Score down ${Math.abs(student.trendPct)}% — please encourage daily practice.`;

  return (
    <div
      id="parent-report-card"
      className="mt-3 mx-auto max-w-[420px] rounded-[12px] border border-hairline bg-ink-900 p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#3FB8AF]" />
          <span className="display text-[13px] font-semibold tracking-wide">tarang</span>
        </div>
        <span className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
          weekly dossier
        </span>
      </div>

      <p className="num mt-5 text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">Student</p>
      <p className="mt-1 text-[18px]">{student.name}</p>
      <p className="text-[12px] text-secondary-warm capitalize">
        {student.sessionSeason || "Summer"} Session · {student.batchTime || "Morning"} Batch
      </p>

      <div className="mt-5">
        <Waveform mode="result" data={student.waveform} height={110} />
        <div className="mt-3 flex items-center justify-between text-[11px] text-secondary-warm">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#3FB8AF]" />
            clear
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#E2A33C]" />
            filler
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#6B645A]" />
            pause
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-[#2E2A26] rounded-[4px] border border-hairline bg-ink-950">
        <ScoreItem label="Pron" v={Math.max(40, student.scorePct - 4)} />
        <ScoreItem label="Vocab" v={Math.max(40, student.scorePct - 8)} />
        <ScoreItem label="Gram" v={Math.min(95, student.scorePct + 5)} />
      </div>

      <p className="mt-5 text-[13px] leading-[1.55] text-primary-warm">
        {student.name.split(" ")[0]} recorded {attemptsCount} attempts this week. {trendText}
      </p>

      <p className="mt-4 text-[11px] text-tertiary-warm">
        Sent by Tarang Console · Official Progress Card
      </p>
    </div>
  );
}

function ScoreItem({ label, v }: { label: string; v: number }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="num text-[9px] uppercase tracking-[0.14em] text-tertiary-warm">{label}</p>
      <p
        className={
          "num mt-1 text-[20px] " +
          (v < 50 ? "text-[#C1503B]" : v < 70 ? "text-[#E2A33C]" : "text-primary-warm")
        }
      >
        {v}%
      </p>
    </div>
  );
}
