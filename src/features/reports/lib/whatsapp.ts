import type { StudentRow } from "@/types";

export function generateParentReportWhatsAppLink(student: StudentRow): string {
  const attemptsCount = Math.max(3, 10 - (student.inactiveDays ?? 0));
  const trendText =
    student.trendPct >= 0
      ? `Score up ${student.trendPct}% — clear stretches are getting longer.`
      : `Score down ${Math.abs(student.trendPct)}% — please encourage daily practice.`;

  const shareText = encodeURIComponent(
    `*Tarang Spoken-English Weekly Report*\n` +
      `Student: *${student.name}*\n` +
      `Batch: Class X-A · Sharma Coaching\n` +
      `Weekly Score: *${student.scorePct}%* (${student.trendPct >= 0 ? "+" : ""}${student.trendPct}% vs last week)\n` +
      `Attempts Recorded: ${attemptsCount}\n` +
      `Summary: ${trendText}\n\n` +
      `_Sent by Tarang Console_`,
  );

  return `https://api.whatsapp.com/send?text=${shareText}`;
}
