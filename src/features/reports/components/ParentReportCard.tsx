import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow, StudentWeeklyReport } from "@/types";

export function ParentReportCard({
  student,
  report,
}: {
  student: StudentRow;
  report?: StudentWeeklyReport | null;
}) {
  const attemptsCount = report
    ? report.attemptsThisWeek
    : Math.max(0, student.scorePct > 0 ? 1 : 0);
  const pronScore =
    report && report.attemptsThisWeek > 0 ? report.pronunciation : Math.max(0, student.scorePct);
  const vocabScore =
    report && report.attemptsThisWeek > 0 ? report.vocabulary : Math.max(0, student.scorePct);
  const gramScore =
    report && report.attemptsThisWeek > 0 ? report.grammar : Math.max(0, student.scorePct);
  const waveformData =
    report?.waveform && report.waveform.length > 0 ? report.waveform : student.waveform;

  const trendText = report
    ? report.trendText
    : student.trendPct >= 0
      ? `Score up ${student.trendPct}%, clear stretches are getting longer.`
      : `Score down ${Math.abs(student.trendPct)}%, please encourage daily practice.`;

  const firstName = student.name.split(" ")[0];
  const batchDisplay =
    report?.batchLabel ||
    `${(student.sessionSeason || "Summer").charAt(0).toUpperCase() + (student.sessionSeason || "Summer").slice(1)} Session · ${(student.batchTime || "Morning").charAt(0).toUpperCase() + (student.batchTime || "Morning").slice(1)} Batch`;

  return (
    <div
      id="parent-report-card"
      className="mt-3 mx-auto max-w-[420px] rounded-[12px] border border-hairline bg-ink-900 p-6"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#3FB8AF]" />
          <span className="display text-[13px] font-semibold tracking-wide">trounce</span>
        </div>
        <span className="num text-[10px] uppercase tracking-[0.14em] text-tertiary-warm">
          weekly dossier
        </span>
      </div>

      <p className="num mt-5 text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">Student</p>
      <p className="mt-1 text-[18px]">{student.name}</p>
      <p className="text-[12px] text-secondary-warm capitalize">{batchDisplay}</p>

      <div className="mt-5">
        <Waveform mode="result" data={waveformData} height={110} />
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
        <ScoreItem label="Pron" v={pronScore} />
        <ScoreItem label="Vocab" v={vocabScore} />
        <ScoreItem label="Gram" v={gramScore} />
      </div>

      <p className="mt-5 text-[13px] leading-[1.55] text-primary-warm">
        {attemptsCount > 0 ? (
          <>
            <strong>{firstName}</strong> recorded {attemptsCount}{" "}
            {attemptsCount === 1 ? "attempt" : "attempts"} this week. {trendText}
          </>
        ) : (
          <>
            <strong>{firstName}</strong> has recorded 0 voice attempts this week. Encourage regular
            speaking practice on Trounce.
          </>
        )}
      </p>

      <p className="mt-4 text-[11px] text-tertiary-warm">
        Sent by Trounce Console · Official Progress Card
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
          (v === 0
            ? "text-tertiary-warm"
            : v < 50
              ? "text-[#C1503B]"
              : v < 70
                ? "text-[#E2A33C]"
                : "text-primary-warm")
        }
      >
        {v}%
      </p>
    </div>
  );
}
