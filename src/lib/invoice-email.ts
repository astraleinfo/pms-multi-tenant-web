/**
 * An invoice emailed to the patient it bills.
 *
 * The API owns every rule here (`services/invoice_email.py`) and refuses what
 * breaks one; this mirrors them so Settings can say what is wrong as someone
 * types, and show the message as a patient will read it, before anything is
 * saved. The mail goes out through the platform's own transport — what a
 * clinic sets is the wording and where a reply lands, never a mail password.
 *
 * Placeholders are a short whitelist filled in one pass. Anything brace-shaped
 * that is not one of them is refused, so a template cannot reach for something
 * the server would not fill.
 */

/** The placeholders a subject or message may use, in the order Settings offers them. */
export const PLACEHOLDERS = [
  { key: "patient_name", label: "Patient's name" },
  { key: "invoice_number", label: "Invoice number" },
  { key: "clinic_name", label: "Clinic name" },
  { key: "amount", label: "Invoice total" },
  { key: "balance", label: "Balance owed" },
  { key: "due_date", label: "Due date" },
] as const;

export type PlaceholderKey = (typeof PLACEHOLDERS)[number]["key"];

/** What an empty subject or message means. Matches the API's defaults. */
export const DEFAULT_SUBJECT = "Invoice {invoice_number} from {clinic_name}";
export const DEFAULT_MESSAGE =
  "Dear {patient_name},\n\n" +
  "Please find attached invoice {invoice_number} for {amount}.\n\n" +
  "Thank you for choosing {clinic_name}.";

const KNOWN = new Set<string>(PLACEHOLDERS.map((p) => p.key));
const TOKEN = /\{([^{}]*)\}/g;

/** Why `text` cannot be a subject or message — or `null` if it can. */
export function templateProblem(text: string): string | null {
  for (const match of text.matchAll(TOKEN)) {
    if (!KNOWN.has(match[1])) {
      const known = PLACEHOLDERS.map((p) => `{${p.key}}`).join(", ");
      return `{${match[1]}} is not a placeholder this message can fill. Use one of ${known}.`;
    }
  }
  const rest = text.replace(TOKEN, "");
  if (rest.includes("{") || rest.includes("}")) {
    return "A brace has to be part of a placeholder, such as {patient_name}.";
  }
  return null;
}

export function subjectProblem(text: string): string | null {
  if (/[\r\n]/.test(text)) return "A subject is one line.";
  return templateProblem(text);
}

/** A display name, not an address. */
export function senderNameProblem(text: string): string | null {
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(text)) return "A sender name is one line of plain text.";
  if (/[@<>"]/.test(text)) {
    return "A sender name cannot contain @, <, > or quotation marks — it is a name, not an address.";
  }
  return null;
}

/** One email address — a rough check that catches typing slips; the API has the last word. */
export function emailProblem(value: string): string | null {
  const v = value.trim();
  if (!v) return "Type an email address.";
  if (!/^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>".]+$/.test(v)) {
    return "That doesn’t look like one email address — check it for typos.";
  }
  return null;
}

/** Fill the placeholders in one pass; an unknown token is left as written. */
export function fillTemplate(text: string, values: Partial<Record<string, string>>): string {
  return text.replace(TOKEN, (whole, key: string) => values[key] ?? whole);
}

/** Sample figures for the Settings preview — the clinic's own name, made-up everything else. */
export function previewValues(clinic: string): Record<PlaceholderKey, string> {
  return {
    patient_name: "Asha Rao",
    invoice_number: "INV-2045",
    clinic_name: clinic || "Your clinic",
    amount: "₹1,250.00",
    balance: "₹1,250.00",
    due_date: "14 Nov 2026",
  };
}

export interface InvoiceEmailSettings {
  invoice_email_reply_to: string;
  invoice_email_sender_name: string;
  invoice_email_subject: string;
  invoice_email_message: string;
}

/** The first thing wrong with the invoice email settings, naming its field — or `null`. */
export function invoiceEmailProblem(s: InvoiceEmailSettings): string | null {
  const replyTo = s.invoice_email_reply_to.trim();
  if (replyTo && emailProblem(replyTo)) return "The reply-to address isn’t a valid email address.";
  const sender = senderNameProblem(s.invoice_email_sender_name);
  if (sender) return `Sender name: ${sender}`;
  const subject = subjectProblem(s.invoice_email_subject);
  if (subject) return `Subject: ${subject}`;
  const message = templateProblem(s.invoice_email_message);
  if (message) return `Message: ${message}`;
  return null;
}
