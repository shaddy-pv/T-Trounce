/**
 * WhatsApp Credentials Dispatch Utilities for User & Teacher Management
 */

export function cleanIndianPhoneNumber(rawPhone?: string): string {
  if (!rawPhone) return "";
  let digits = rawPhone.replace(/[^0-9]/g, "");
  // If 10 digits (standard Indian mobile without country code), prepend 91
  if (digits.length === 10) {
    digits = "91" + digits;
  }
  return digits;
}

export function generateUserCredentialsWhatsAppUrl(params: {
  name: string;
  email: string;
  passwordPlain: string;
  role: "teacher" | "student" | "admin" | string;
  phone?: string;
  sessionSeason?: string;
  batchTime?: string;
  senderName?: string;
  senderPhone?: string;
}): string {
  const roleLabel =
    params.role === "teacher"
      ? "Teacher / Faculty"
      : params.role === "admin"
        ? "Administrator"
        : "Student";

  const sessionStr = params.sessionSeason
    ? params.sessionSeason.charAt(0).toUpperCase() + params.sessionSeason.slice(1)
    : "Summer";
  const batchStr = params.batchTime
    ? params.batchTime.charAt(0).toUpperCase() + params.batchTime.slice(1)
    : "Morning";

  const cleanPhone = cleanIndianPhoneNumber(params.phone);
  const senderContact = params.senderPhone
    ? `${params.senderName || "Trounce Faculty"} (${params.senderPhone})`
    : params.senderName || "Trounce Administration";

  const text =
    `*Welcome to Trounce Spoken English Institute! 🎉*\n\n` +
    `Namaste *${params.name}*! 🙏\n` +
    `Aapka Trounce speech portal account create ho gaya hai:\n\n` +
    `🌐 *Portal Login:* https://trounce.app/login\n` +
    `📧 *User ID / Email:* ${params.email}\n` +
    `🔑 *Permanent Password:* ${params.passwordPlain}\n` +
    `👤 *Role:* ${roleLabel}\n` +
    `🏫 *Batch:* ${sessionStr} Session · ${batchStr} Batch\n\n` +
    `Kripya portal par login karke apna daily voice practice aur homework shuru karein!\n\n` +
    `_Issued by: ${senderContact}_\n` +
    `_Trounce Spoken English Institute_`;

  if (cleanPhone) {
    return `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
  }
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}

export function formatCredentialsPlainText(params: {
  name: string;
  email: string;
  passwordPlain: string;
  role: string;
  phone?: string;
  sessionSeason?: string;
  batchTime?: string;
}): string {
  const roleLabel = params.role === "teacher" ? "Teacher" : "Student";
  const sessionStr = params.sessionSeason
    ? params.sessionSeason.charAt(0).toUpperCase() + params.sessionSeason.slice(1)
    : "Summer";
  const batchStr = params.batchTime
    ? params.batchTime.charAt(0).toUpperCase() + params.batchTime.slice(1)
    : "Morning";

  return `Trounce Login Credentials:
Name: ${params.name}
Role: ${roleLabel}
Login URL: https://trounce.app/login
Email: ${params.email}
Password: ${params.passwordPlain}
Batch: ${sessionStr} · ${batchStr}`;
}
