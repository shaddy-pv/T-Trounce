/**
 * WhatsApp Reminder utilities for targeted homework assignments
 */

/**
 * Format any entered phone into clean digits with country code 91
 */
export function cleanIndianPhoneNumber(phone?: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    digits = `91${digits}`;
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = `91${digits.slice(1)}`;
  } else if (digits.length === 12 && digits.startsWith("91")) {
    // already 91 prefixed
  }
  return digits;
}

export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  const core = digits.length >= 10 ? digits.slice(-10) : digits;
  if (core.length === 10) {
    return `+91 ${core.slice(0, 5)} ${core.slice(5)}`;
  }
  return phone;
}

export function generateIndividualHomeworkReminderUrl(params: {
  studentName: string;
  studentPhone?: string;
  assignmentTitle: string;
  prompt: string;
  dueDate?: string;
  session?: string;
  batch?: string;
  teacherName?: string;
  teacherPhone?: string;
}): string {
  const sessionStr = params.session
    ? params.session.charAt(0).toUpperCase() + params.session.slice(1)
    : "Speech";
  const batchStr = params.batch
    ? params.batch.charAt(0).toUpperCase() + params.batch.slice(1)
    : "Batch";
  const dueStr = params.dueDate || "soon";

  const teacherContact = params.teacherPhone
    ? `${params.teacherName || "Teacher"} (${formatPhoneDisplay(params.teacherPhone)})`
    : params.teacherName || "Trounce Faculty";

  const text =
    `*Trounce Spoken English : Homework Alert 📢*\n\n` +
    `Namaste *${params.studentName}*! 🙏\n` +
    `Aapka speaking homework abhi pending hai:\n\n` +
    `📝 *Assignment:* ${params.assignmentTitle}\n` +
    `🏫 *Batch:* ${sessionStr} Session · ${batchStr}\n` +
    `⏰ *Due Date:* ${dueStr}\n` +
    `🎙️ *Speaking Prompt:* "${params.prompt}"\n\n` +
    `Kripya Trounce portal open karke apni voice recording submit karein:\n` +
    `👉 https://trounce.app/practice\n\n` +
    `_Teacher: ${teacherContact}_\n` +
    `_Trounce Spoken English Institute_`;

  const cleanPhone = cleanIndianPhoneNumber(params.studentPhone);
  if (cleanPhone) {
    // Opens chat directly with student's WhatsApp number from teacher's WhatsApp account
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function generateBatchBroadcastReminderUrl(params: {
  assignmentTitle: string;
  prompt: string;
  dueDate?: string;
  session?: string;
  batch?: string;
  pendingCount: number;
  teacherName?: string;
  teacherPhone?: string;
}): string {
  const sessionStr = params.session
    ? params.session.charAt(0).toUpperCase() + params.session.slice(1)
    : "Speech";
  const batchStr = params.batch
    ? params.batch.charAt(0).toUpperCase() + params.batch.slice(1)
    : "Batch";
  const dueStr = params.dueDate || "soon";

  const teacherContact = params.teacherPhone
    ? `${params.teacherName || "Teacher"} (${formatPhoneDisplay(params.teacherPhone)})`
    : params.teacherName || "Trounce Faculty";

  const text =
    `*📢 Trounce Homework Alert : ${sessionStr} · ${batchStr} Batch*\n\n` +
    `Sabhi students dhyan dein! Niche diya gaya homework submission open hai:\n\n` +
    `📝 *Task:* ${params.assignmentTitle}\n` +
    `⏰ *Deadline:* ${dueStr}\n` +
    `🎙️ *Prompt:* "${params.prompt}"\n\n` +
    `Jin students ne abhi tak submit nahi kiya hai (${params.pendingCount} students pending), kripya aaj hi record karein!\n\n` +
    `👉 Practice Now: https://trounce.app/practice\n\n` +
    `_Teacher: ${teacherContact}_\n` +
    `_Trounce Spoken English Institute_`;

  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
