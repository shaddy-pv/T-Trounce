import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow, StudentWeeklyReport } from "@/types";
import { useLanguage } from "@/lib/i18n";
import { ShieldCheck, Calendar, Sparkles, CheckCircle2 } from "lucide-react";

export function ParentReportCard({
  student,
  report,
  evaluatorName = "Faculty Mentor",
}: {
  student: StudentRow;
  report?: StudentWeeklyReport | null;
  evaluatorName?: string;
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
      : `Score down ${Math.abs(student.trendPct)}%, please encourage regular daily practice.`;

  const firstName = student.name ? student.name.split(" ")[0] : "Student";
  const batchDisplay =
    report?.batchLabel ||
    `${(student.sessionSeason || "Summer").charAt(0).toUpperCase() + (student.sessionSeason || "Summer").slice(1)} Session · ${(student.batchTime || "Morning").charAt(0).toUpperCase() + (student.batchTime || "Morning").slice(1)} Batch`;

  const overallAvg = Math.round((pronScore + vocabScore + gramScore) / 3);
  const qualitativeRating =
    overallAvg >= 80
      ? "Distinction · Native-like Clarity"
      : overallAvg >= 65
        ? "Proficient · Consistent Cadence"
        : overallAvg >= 50
          ? "Developing · Steady Improvement"
          : "Focus Required · Daily Drills Recommended";

  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const certNumber = `TRN-${new Date().getFullYear()}-${student.id.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "78901"}`;

  return (
    <div
      id="parent-report-card"
      className="mt-3 mx-auto w-full max-w-[500px] rounded-[16px] border border-hairline bg-ink-900 p-6 sm:p-7 shadow-md transition-all print:max-w-none print:w-full print:border-2 print:border-slate-800 print:rounded-2xl print:bg-white print:text-slate-900 print:p-8 print:m-0 print:shadow-none print:break-inside-avoid"
      style={{
        WebkitPrintColorAdjust: "exact",
        printColorAdjust: "exact",
      }}
    >
      {/* ============================================================== */}
      {/* OFFICIAL LETTERHEAD (Visible on Screen & in PDF Export)        */}
      {/* ============================================================== */}
      <div className="border-b border-hairline/80 print:border-slate-800 pb-4 mb-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-[#3FB8AF] inline-block border border-[#3FB8AF]" />
              <span className="text-[16px] sm:text-[18px] font-bold tracking-tight text-primary-warm print:text-slate-900 font-display uppercase">
                TROUNCE SPEECH & ACOUSTIC LABORATORY
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] font-semibold text-tertiary-warm print:text-slate-600 mt-1 uppercase tracking-wider">
              Certified Student Weekly Speech Progress Dossier
            </p>
          </div>
          <div className="text-right shrink-0">
            <span className="inline-block border border-[#3FB8AF]/40 bg-[#3FB8AF]/15 text-[#3FB8AF] print:border-teal-800 print:bg-teal-50 print:text-teal-900 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider">
              OFFICIAL REPORT
            </span>
            <p className="text-[9px] text-tertiary-warm print:text-slate-500 mt-1 num font-mono">
              ID: {certNumber}
            </p>
          </div>
        </div>

        {/* Student Meta Strip */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-ink-950/70 print:bg-slate-50 border border-hairline/60 print:border-slate-200 rounded-lg p-3 text-[11px]">
          <div>
            <p className="text-[9px] font-semibold text-tertiary-warm print:text-slate-500 uppercase tracking-wider">
              Student Name
            </p>
            <p className="text-[13px] font-bold text-primary-warm print:text-slate-900 mt-0.5 truncate">
              {student.name}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-tertiary-warm print:text-slate-500 uppercase tracking-wider">
              Batch & Session
            </p>
            <p className="text-[12px] font-semibold text-secondary-warm print:text-slate-800 mt-0.5 capitalize truncate">
              {batchDisplay}
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-tertiary-warm print:text-slate-500 uppercase tracking-wider">
              Drills Recorded
            </p>
            <p className="text-[12px] font-semibold text-secondary-warm print:text-slate-800 mt-0.5">
              {attemptsCount} Session(s)
            </p>
          </div>
          <div>
            <p className="text-[9px] font-semibold text-tertiary-warm print:text-slate-500 uppercase tracking-wider">
              Issue Date
            </p>
            <p className="text-[12px] font-semibold text-secondary-warm print:text-slate-800 mt-0.5">
              {todayFormatted}
            </p>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* ACOUSTIC WAVEFORM SPECTRUM SECTION                             */}
      {/* ============================================================== */}
      <div className="mt-4 rounded-[10px] border border-hairline/70 bg-ink-950/70 p-3.5 print:bg-slate-50 print:border-slate-300 print:p-4">
        <div className="flex items-center justify-between pb-2 border-b border-hairline/40 print:border-slate-200">
          <span className="text-[10px] uppercase tracking-[0.16em] text-tertiary-warm print:text-slate-600 font-semibold">
            Acoustic Speech Energy Spectrum
          </span>
          <span className="text-[10px] font-medium text-tertiary-warm print:text-slate-600">
            Cadence & Fluency Profile
          </span>
        </div>

        <div className="mt-2.5">
          <Waveform mode="result" data={waveformData} height={105} />
        </div>

        {/* Legend with solid bordered markers */}
        <div className="mt-3 flex items-center justify-between text-[11px] text-secondary-warm print:text-slate-700 pt-2 border-t border-hairline/40 print:border-slate-200">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className="size-2.5 rounded-full inline-block border border-teal-600"
              style={{ backgroundColor: "#0D9488" }}
            />
            {t("report_speech_clear")}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className="size-2.5 rounded-full inline-block border border-amber-600"
              style={{ backgroundColor: "#D97706" }}
            />
            {t("report_speech_filler")}
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className="size-2.5 rounded-full inline-block border border-slate-500"
              style={{ backgroundColor: "#64748B" }}
            />
            {t("report_speech_pause")}
          </span>
        </div>
      </div>

      {/* ============================================================== */}
      {/* CORE PERFORMANCE TRIAD GRID                                    */}
      {/* ============================================================== */}
      <div className="mt-4 grid grid-cols-3 divide-x divide-hairline rounded-[10px] border border-hairline bg-ink-950 print:bg-slate-50 print:border-slate-300 print:divide-slate-300">
        <ScoreItem
          label={t("report_score_pron")}
          v={pronScore}
          subLabel="Diction"
        />
        <ScoreItem
          label={t("report_score_vocab")}
          v={vocabScore}
          subLabel="Word Choice"
        />
        <ScoreItem
          label={t("report_score_gram")}
          v={gramScore}
          subLabel="Structure"
        />
      </div>

      {/* ============================================================== */}
      {/* QUALITATIVE ASSESSMENT & PEDAGOGICAL INSIGHTS                   */}
      {/* ============================================================== */}
      <div className="mt-4 rounded-[10px] border border-hairline/70 bg-ink-950/40 p-3.5 print:bg-white print:border-slate-200">
        <p className="text-[12px] leading-[1.6] text-primary-warm print:text-slate-800">
          {attemptsCount > 0
            ? t("report_summary_active", { name: firstName, count: attemptsCount, trend: trendText })
            : t("report_summary_zero", { name: firstName })}
        </p>

        {/* Parent Guidance Tip */}
        <div className="mt-3 pt-2.5 border-t border-hairline/60 print:border-slate-200 flex items-start gap-2">
          <Sparkles size={14} className="text-[#3FB8AF] print:text-teal-700 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.5] text-secondary-warm print:text-slate-600">
            <strong className="text-primary-warm print:text-slate-900 font-semibold">
              Parent Guidance Tip:{" "}
            </strong>
            {overallAvg >= 70
              ? "Encourage consistent practice to maintain speech rhythm and expand complex vocabulary."
              : "Encourage 10 minutes of daily speaking aloud with the Trounce speech exercises to strengthen sentence cadence."}
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* OFFICIAL VERIFICATION & SIGN-OFF BLOCK                         */}
      {/* ============================================================== */}
      <div className="mt-5 pt-4 border-t border-hairline/80 print:border-slate-800">
        <div className="grid grid-cols-2 items-end justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-secondary-warm print:text-slate-700">
              Evaluated by: <span className="font-bold text-primary-warm print:text-slate-900">{evaluatorName}</span>
            </p>
            <p className="text-[10px] text-tertiary-warm print:text-slate-500 mt-0.5">
              Trounce Spoken English Institute · Faculty Mentor
            </p>
            <div className="mt-3 pt-1.5 border-t border-hairline/60 print:border-slate-400 w-36 sm:w-44">
              <p className="text-[9px] text-tertiary-warm print:text-slate-500 uppercase tracking-wider font-mono">
                Instructor Sign & Stamp
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded border border-[#3FB8AF]/30 bg-[#3FB8AF]/10 text-[#3FB8AF] print:border-teal-800 print:bg-teal-50 print:text-teal-900 text-[10px] font-bold">
              <ShieldCheck size={13} />
              VERIFIED OFFICIAL RECORD
            </div>
            <p className="text-[9px] text-tertiary-warm print:text-slate-500 mt-1.5 leading-tight">
              Trounce Acoustic Studio · Reg. No: TRN-EDU-2026
              <br />
              Confidential Student Progress Dossier
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreItem({
  label,
  v,
  subLabel,
}: {
  label: string;
  v: number;
  subLabel?: string;
}) {
  return (
    <div className="px-2 py-3 text-center print:py-2.5">
      <p className="num text-[9px] uppercase tracking-[0.14em] text-tertiary-warm print:text-slate-600 font-semibold">
        {label}
      </p>
      <p
        className={
          "num mt-1 text-[22px] font-bold tracking-tight " +
          (v === 0
            ? "text-tertiary-warm print:text-slate-400"
            : v < 50
              ? "text-[#C1503B] print:text-rose-700"
              : v < 70
                ? "text-[#E2A33C] print:text-amber-700"
                : "text-primary-warm print:text-teal-800")
        }
      >
        {v}%
      </p>
      {subLabel && (
        <p className="text-[9px] text-tertiary-warm print:text-slate-500 mt-0.5 num">
          {subLabel}
        </p>
      )}
    </div>
  );
}
