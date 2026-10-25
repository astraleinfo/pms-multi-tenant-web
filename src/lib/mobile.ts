/** Patient mobile numbers: exactly ten digits, nothing else. */

export const MOBILE_LENGTH = 10;
export const MOBILE_ERROR = "Enter a 10-digit mobile number";

const digitsOf = (s: string) => s.replace(/\D/g, "");

/**
 * Digits only, with a +91 / 91 / 0 prefix dropped when the number is longer
 * than ten digits. For text that arrives whole — a pasted number, or one
 * already stored — not for one keystroke at a time (a mobile may legitimately
 * start with 91).
 */
export function normalizeMobile(raw: string | null | undefined): string {
  let d = digitsOf(raw ?? "");
  if (d.length > MOBILE_LENGTH && d.startsWith("91")) d = d.slice(2);
  else if (d.length > MOBILE_LENGTH && d.startsWith("0")) d = d.slice(1);
  return d;
}

/**
 * What the input should hold after a change. Typing and deleting just strip
 * non-digits and cap the length; a paste of several characters at once is
 * normalised so "+91 98765 43210" lands as 9876543210.
 */
export function sanitizeMobileInput(next: string, previous = ""): string {
  const pasted = next.length - previous.length > 1;
  const d = pasted ? normalizeMobile(next) : digitsOf(next);
  return d.slice(0, MOBILE_LENGTH);
}

/** An error message, or null when the value is exactly ten digits. */
export function validateMobile(value: string | null | undefined): string | null {
  return /^\d{10}$/.test(value ?? "") ? null : MOBILE_ERROR;
}
