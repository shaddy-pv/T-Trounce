import { Waveform } from "@/components/tarang/Waveform";
import type { StudentRow, StudentWeeklyReport } from "@/types";
import { useLanguage } from "@/lib/i18n";
import { ShieldCheck, Calendar, Sparkles } from "lucide-react";

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
      ? "Distinction · High Clarity"
      : overallAvg >= 65
        ? "Proficient · Consistent Flow"
        : overallAvg >= 50
          ? "Developing · Needs Practice"
          : "Focus Required · Daily Drills Needed";

  const todayFormatted = new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date());

  const certNumber = `TRN-${new Date().getFullYear()}-${student.id.replace(/[^a-zA-Z0-9]/g, "").slice(-5).toUpperCase() || "78901"}`;

  return (
    <div
      id="parent-report-card"
      className="mt-3 mx-auto w-full max-w-[460px] rounded-[14px] border border-hairline bg-ink-900 p-5 sm:p-6 shadow-md transition-all print:max-w-none print:w-full print:border-2 print:border-slate-800 print:rounded-2xl print:bg-white print:text-slate-900 print:p-8 print:m-0 print:shadow-none print:break-inside-avoid"
    >
      {/* ============================================================== */}
      {/* PRINT-ONLY OFFICIAL HEADER (hidden on screen, shows on print)  */}
      {/* ============================================================== */}
      <div className="hidden print:block border-b-2 border-slate-800 pb-5 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="size-3 rounded-full bg-[#0D9488] inline-block" />
              <span className="text-[22px] font-bold tracking-tight text-slate-900 font-display">
                TROUNCE SPEECH & ACOUSTIC LABORATORY
              </span>
            </div>
            <p className="text-[12px] font-medium text-slate-600 mt-1 uppercase tracking-wider">
              Official Weekly Speech Diagnostic & Academic Progress Dossier
            </p>
          </div>
          <div className="text-right">
            <span className="inline-block border border-teal-800 bg-teal-50 text-teal-900 px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider">
              CERTIFIED PROGRESS CARD
            </span>
            <p className="text-[10px] text-slate-500 mt-1 num">Doc ID: {certNumber}</p>
          </div>
        </div>

        {/* Student Meta Strip in Print */}
        <div className="mt-5 grid grid-cols-4 gap-3 bg-slate-50 border border-slate-200 rounded-lg p-3 text-[12px]">
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Student Name</p>
            <p className="text-[15px] font-bold text-slate-900 mt-0.5">{student.name}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Academic Batch</p>
            <p className="text-[13px] font-semibold text-slate-800 mt-0.5 capitalize">{batchDisplay}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Sessions Recorded</p>
            <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{attemptsCount} Speaking Drill(s)</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Evaluation Date</p>
            <p className="text-[13px] font-semibold text-slate-800 mt-0.5">{todayFormatted}</p>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* SCREEN HEADER (shown on screen, hidden on print)               */}
      {/* ============================================================== */}
      <div className="print:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-[#3FB8AF]" />
            <span className="display text-[14px] font-semibold tracking-wide text-primary-warm">
              trounce
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="num text-[10px] uppercase tracking-[0.14em] text-[#3FB8AF] font-semibold bg-[#3FB8AF]/15 px-2.5 py-0.5 rounded-full border border-[#3FB8AF]/25">
              {t("report_weekly_title")}
            </span>
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <p className="num text-[10px] uppercase tracking-[0.18em] text-tertiary-warm">
              {t("report_student_label")}
            </p>
            <p className="mt-0.5 text-[20px] font-semibold text-primary-warm">{student.name}</p>
            <p className="text-[12px] text-secondary-warm capitalize">{batchDisplay}</p>
          </div>
          <div className="text-right">
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-tertiary-warm bg-ink-950 px-2 py-1 rounded border border-hairline">
              <Calendar size={12} className="text-[#3FB8AF]" />
              {todayFormatted}
            </span>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* ACOUSTIC WAVEFORM SPECTRUM SECTION                             */}
      {/* ============================================================== */}
      <div className="mt-5 rounded-[10px] border border-hairline bg-ink-950/70 p-3.5 print:bg-slate-50 print:border-slate-300 print:p-4">
        <div className="flex items-center justify-between pb-2 border-b border-hairline/40 print:border-slate-200">
          <span className="text-[10px] uppercase tracking-[0.16em] text-tertiary-warm print:text-slate-600 font-semibold">
            Acoustic Speech Spectrum
          </span>
          <span className="text-[10px] font-medium text-tertiary-warm print:text-slate-600">
            Cadence & Fluency Envelope
          </span>
        </div>

        <div className="mt-2.5">
          <Waveform mode="result" data={waveformData} height={105} />
        </div>

        {/* Bulletproof Legend: Solid borders + explicit styling so colors survive any printer */}
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

        {/* Parent Home Recommendation (Featured in Print & Screen) */}
        <div className="mt-3 pt-2.5 border-t border-hairline/60 print:border-slate-200 flex items-start gap-2">
          <Sparkles size={14} className="text-[#3FB8AF] print:text-teal-700 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-[1.5] text-secondary-warm print:text-slate-600">
            <strong className="text-primary-warm print:text-slate-900 font-semibold">
              Parent Guidance Tip:{" "}
            </strong>
            {overallAvg >= 70
              ? "Encourage consistent practice to maintain rhythm and expand complex vocabulary."
              : "Encourage 10 minutes of daily loud reading with the Trounce speech homework exercises to build sentence cadence."}
          </p>
        </div>
      </div>

      {/* ============================================================== */}
      {/* PRINT-ONLY SIGNATURE & VERIFICATION SEAL                       */}
      {/* ============================================================== */}
      <div className="hidden print:block mt-6 pt-5 border-t-2 border-slate-800">
        <div className="grid grid-cols-2 items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-700">
              Evaluated by: <span className="font-bold text-slate-900">{evaluatorName}</span>
            </p>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Trounce Spoken English Institute · Faculty Mentor
            </p>
            <div className="mt-4 pt-2 border-t border-slate-400 w-48">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">
                Instructor Signature & Stamp
              </p>
            </div>
          </div>

          <div className="text-right">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded border border-teal-800 bg-teal-50 text-teal-900 text-[11px] font-bold">
              <ShieldCheck size={14} />
              VERIFIED OFFICIAL PROGRESS RECORD
            </div>
            <p className="text-[9px] text-slate-500 mt-1.5 leading-tight">
              Generated from authentic speech acoustic samples via Trounce Acoustic Studio.
              <br />
              Registration No: TRN-EDU-2026 · Confidential Parent Copy
            </p>
          </div>
        </div>
      </div>

      {/* Screen Official Footer Tag */}
      <p className="print:hidden mt-4 text-[11px] text-tertiary-warm border-t border-hairline/60 pt-3 flex items-center justify-between">
        <span>{t("report_official_tag")}</span>
        <span className="num text-[10px] text-[#3FB8AF] font-medium">{qualitativeRating}</span>
      </p>
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
