/** Indian phone number helpers, used for WhatsApp links and display. */

/** Digits with the 91 country code, as WhatsApp links require. Empty if there is no number. */
export function cleanIndianPhoneNumber(phone?: string): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `91${digits.slice(1)}`;
  return digits;
}

/** "+91 98765 43210" for a valid number. Anything else is shown as it was entered. */
export function formatPhoneDisplay(phone?: string): string {
  if (!phone) return "";
  const digits = cleanIndianPhoneNumber(phone);
  if (digits.length === 12 && digits.startsWith("91")) {
    return `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`;
  }
  return phone;
}
