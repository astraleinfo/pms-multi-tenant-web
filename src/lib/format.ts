/* ==========================================================================
   Formatting.

   Two pieces of ambient state, both set once by the provider from what the
   server said: the clinic's currency and the clinic's date. Threading either
   through a dozen component signatures would buy nothing.
   ========================================================================== */

/**
 * The clinic's today. Server-rendered markup has to match the first client
 * render, so this starts at a fixed value and the provider replaces it with
 * the clinic's real date — in the clinic's timezone — once that has arrived.
 */
export const TODAY = "2026-08-19";

let ACTIVE_TODAY = TODAY;

export function setToday(iso: string) {
  ACTIVE_TODAY = iso;
}

export const today = () => ACTIVE_TODAY;

/* The active clinic's currency. The provider sets it whenever configuration
   changes, so every call site formats money the tenant's way without threading
   config through a dozen component signatures. */
let ACTIVE_CURRENCY: "GBP" | "EUR" | "USD" | "INR" = "INR";
const LOCALES: Record<string, string> = { GBP: "en-GB", EUR: "de-DE", USD: "en-US", INR: "en-IN" };

export function setActiveCurrency(code: "GBP" | "EUR" | "USD" | "INR") {
  ACTIVE_CURRENCY = code;
}

export const currency = (n: number) =>
  new Intl.NumberFormat(LOCALES[ACTIVE_CURRENCY], {
    style: "currency", currency: ACTIVE_CURRENCY, maximumFractionDigits: 2,
  }).format(n);

/** Compact only where it earns its keep — below a thousand the full figure is shorter. */
export const compactCurrency = (n: number) =>
  Math.abs(n) < 1000
    ? new Intl.NumberFormat(LOCALES[ACTIVE_CURRENCY], { style: "currency", currency: ACTIVE_CURRENCY, maximumFractionDigits: 0 }).format(n)
    : new Intl.NumberFormat(LOCALES[ACTIVE_CURRENCY], { style: "currency", currency: ACTIVE_CURRENCY, notation: "compact", maximumFractionDigits: 1 }).format(n);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Parse a YYYY-MM-DD string without letting the local timezone shift the day. */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

export function formatDate(iso: string | null | undefined, style: "short" | "long" | "day" = "short") {
  if (!iso) return "—";
  const d = parseDate(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  const yr = d.getUTCFullYear();
  if (style === "long") return `${day} ${mon} ${yr}`;
  if (style === "day") return `${DAYS[d.getUTCDay()]} ${day} ${mon}`;
  return `${day} ${mon} ${String(yr).slice(2)}`;
}

export function weekdayShort(iso: string) {
  return DAYS[parseDate(iso).getUTCDay()].slice(0, 3);
}

export function addDays(iso: string, n: number) {
  const d = parseDate(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86_400_000);
}

export function relativeDay(iso: string) {
  const diff = daysBetween(ACTIVE_TODAY, iso);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  if (diff < 0) return `${Math.abs(diff)} days ago`;
  return `in ${diff} days`;
}

export function age(dob: string) {
  const b = parseDate(dob), t = parseDate(ACTIVE_TODAY);
  let a = t.getUTCFullYear() - b.getUTCFullYear();
  const m = t.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && t.getUTCDate() < b.getUTCDate())) a--;
  return a;
}

/** "09:30" → minutes since midnight. Returns -1 for placeholders like "—". */
export function toMinutes(hhmm: string) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
}

export function formatTime12(hhmm: string) {
  const mins = toMinutes(hhmm);
  if (mins < 0) return hhmm;
  const h = Math.floor(mins / 60), m = mins % 60;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function minutesBetween(a?: string | null, b?: string | null) {
  if (!a || !b) return null;
  const x = toMinutes(a), y = toMinutes(b);
  if (x < 0 || y < 0) return null;
  return y - x;
}

export function duration(mins: number | null) {
  if (mins == null) return "—";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export const initialsOf = (name: string) =>
  name.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("");

export const titleCase = (s: string) =>
  s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const sentenceCase = (s: string) => {
  const t = s.replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const pluralise = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
