import type { StudentRow, StudentWeeklyReport } from "@/types";
import { cleanIndianPhoneNumber, formatPhoneDisplay } from "@/features/assignments/lib/whatsapp-reminders";

export function generateParentReportWhatsAppLink(
  student: StudentRow,
  report?: StudentWeeklyReport | null,
  language: "hi" | "en" = "hi",
  teacherName?: string,
  teacherPhone?: string,
): string {
  const attemptsCount = report ? report.attemptsThisWeek : student.scorePct > 0 ? 1 : 0;
  const weeklyScore = report ? report.scorePct : student.scorePct;
  const trendPct = report ? report.trendPct : student.trendPct;

  const session = student.sessionSeason || "summer";
  const batch = student.batchTime || "morning";
  const sessionLabel = session.charAt(0).toUpperCase() + session.slice(1);
  const batchLabel = batch.charAt(0).toUpperCase() + batch.slice(1);
  const batchDisplay = report?.batchLabel || `${sessionLabel} Session · ${batchLabel} Batch`;

  const teacherContact = teacherPhone
    ? `${teacherName || "Teacher"} (${formatPhoneDisplay(teacherPhone)})`
    : teacherName || "Trounce Faculty";

  let shareText = "";

  if (language === "hi") {
    const trendHindi =
      trendPct >= 0
        ? `स्कोर में ${trendPct}% का सुधार हुआ है। बच्चा आत्मविश्वास से बोल रहा है।`
        : `इस हफ्ते अभ्यास थोड़ा कम हुआ है, कृपया रोज़ाना 10 मिनट बोलने के लिए प्रेरित करें।`;

    shareText =
      `*नमस्ते जी! 🙏*\n\n` +
      `*Trounce Spoken English Institute* से आपके बच्चे *${student.name}* की इस हफ्ते की प्रगति रिपोर्ट:\n\n` +
      `👤 छात्र: *${student.name}*\n` +
      `🏫 बैच: ${batchDisplay}\n` +
      `🎙️ इस हफ्ते बोलकर अभ्यास: *${attemptsCount} बार*\n` +
      `📈 स्पीकिंग स्कोर: *${weeklyScore}%* (${trendPct >= 0 ? "+" : ""}${trendPct}% सुधार)\n` +
      `📊 विवरण: उच्चारण ${report?.pronunciation ?? weeklyScore}% | शब्द ज्ञान ${report?.vocabulary ?? weeklyScore}% | व्याकरण ${report?.grammar ?? weeklyScore}%\n` +
      `💡 शिक्षक की टिप्पणी: "${trendHindi}"\n\n` +
      `_शिक्षक: ${teacherContact}_\n` +
      `_Trounce Spoken English Institute_`;
  } else {
    const trendText = report
      ? report.trendText
      : trendPct >= 0
        ? `Score up ${trendPct}%, speech clarity is improving.`
        : `Score down ${Math.abs(trendPct)}%, please encourage regular daily practice.`;

    shareText =
      `*Trounce Spoken-English Weekly Report*\n\n` +
      `Student: *${student.name}*\n` +
      `Batch: ${batchDisplay}\n` +
      `Weekly Score: *${weeklyScore}%* (${trendPct >= 0 ? "+" : ""}${trendPct}% vs prior week)\n` +
      `Voice Practice Attempts: ${attemptsCount}\n` +
      `Pronunciation: ${report?.pronunciation ?? weeklyScore}% | Vocabulary: ${report?.vocabulary ?? weeklyScore}% | Grammar: ${report?.grammar ?? weeklyScore}%\n` +
      `Teacher Note: ${trendText}\n\n` +
      `_Teacher: ${teacherContact}_\n` +
      `_Trounce Spoken English Institute_`;
  }

  const cleanPhone = cleanIndianPhoneNumber(student.phone);
  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(shareText)}`;
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
}
