import type { StudentRow, StudentWeeklyReport } from "@/types";

export function generateParentReportWhatsAppLink(
  student: StudentRow,
  report?: StudentWeeklyReport | null,
): string {
  const attemptsCount = report ? report.attemptsThisWeek : student.scorePct > 0 ? 1 : 0;
  const weeklyScore = report ? report.scorePct : student.scorePct;
  const trendPct = report ? report.trendPct : student.trendPct;
  const trendText = report
    ? report.trendText
    : trendPct >= 0
      ? `Score up ${trendPct}%, clear stretches are getting longer.`
      : `Score down ${Math.abs(trendPct)}%, please encourage daily practice.`;

  const session = student.sessionSeason || "summer";
  const batch = student.batchTime || "morning";
  const sessionLabel = session.charAt(0).toUpperCase() + session.slice(1);
  const batchLabel = batch.charAt(0).toUpperCase() + batch.slice(1);
  const batchDisplay = report?.batchLabel || `${sessionLabel} Session · ${batchLabel} Batch`;

  const shareText = encodeURIComponent(
    `*Trounce Spoken-English Weekly Report*\n` +
      `Student: *${student.name}*\n` +
      `Batch: ${batchDisplay}\n` +
      `Weekly Score: *${weeklyScore}%* (${trendPct >= 0 ? "+" : ""}${trendPct}% vs prior period)\n` +
      `Attempts Recorded This Week: ${attemptsCount}\n` +
      `Pronunciation: ${report?.pronunciation ?? weeklyScore}% | Vocabulary: ${report?.vocabulary ?? weeklyScore}% | Grammar: ${report?.grammar ?? weeklyScore}%\n` +
      `Summary: ${trendText}\n\n` +
      `_Sent by Trounce Console_`,
  );

  return `https://api.whatsapp.com/send?text=${shareText}`;
}
