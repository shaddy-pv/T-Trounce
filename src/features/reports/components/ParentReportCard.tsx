import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow, StudentWeeklyReport } from "@/types";
import { useLanguage } from "@/lib/i18n";

export function ParentReportCard({
  student,
  report,
}: {
  student: StudentRow;
  report?: StudentWeeklyReport | null;
}) {
  const { t } = useLanguage();

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
      ? `Score up ${student.trendPct}%, speech clarity is improving.`
      : `Score down ${Math.abs(student.trendPct)}%, please encourage regular practice.`;

  const firstName = student.name.split(" ")[0];
  const batchDisplay =
    report?.batchLabel ||
    `${(student.sessionSeason || "Summer").charAt(0).toUpperCase() + (student.sessionSeason || "Summer").slice(1)} Session · ${(student.batchTime || "Morning").charAt(0).toUpperCase() + (student.batchTime || "Morning").slice(1)} Batch`;

  return (
    <div
      id="parent-report-card"
      className="mt-3 mx-auto max-w-[420px] rounded-[12px] border border-hairline bg-ink-900 p-6 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-[#3FB8AF]" />
          <span className="display text-[13px] font-semibold tracking-wide">trounce</span>
        </div>
        <span className="num text-[10px] uppercase tracking-[0.14em] text-[#3FB8AF] font-semibold bg-[#3FB8AF]/15 px-2 py-0.5 rounded">
          {t("report_weekly_title")}
        </span>
      </div>

      <p className="num mt-5 text-[11px] uppercase tracking-[0.18em] text-tertiary-warm">{t("report_student_label")}</p>
      <p className="mt-1 text-[20px] font-semibold text-primary-warm">{student.name}</p>
      <p className="text-[12px] text-secondary-warm capitalize">{batchDisplay}</p>

      <div className="mt-5">
        <Waveform mode="result" data={waveformData} height={110} />
        <div className="mt-3 flex items-center justify-between text-[11px] text-secondary-warm">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#3FB8AF]" />
            {t("report_speech_clear")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#E2A33C]" />
            {t("report_speech_filler")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-[#6B645A]" />
            {t("report_speech_pause")}
          </span>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 divide-x divide-hairline rounded-[8px] border border-hairline bg-ink-950">
        <ScoreItem label={t("report_score_pron")} v={pronScore} />
        <ScoreItem label={t("report_score_vocab")} v={vocabScore} />
        <ScoreItem label={t("report_score_gram")} v={gramScore} />
      </div>

      <p className="mt-5 text-[13px] leading-[1.55] text-primary-warm">
        {attemptsCount > 0
          ? t("report_summary_active", { name: firstName, count: attemptsCount, trend: trendText })
          : t("report_summary_zero", { name: firstName })}
      </p>

      <p className="mt-4 text-[11px] text-tertiary-warm border-t border-hairline/60 pt-3">
        {t("report_official_tag")}
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
