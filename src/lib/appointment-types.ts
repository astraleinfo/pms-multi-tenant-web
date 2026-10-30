import type { AppointmentType, TenantConfig } from "@/lib/types";
import { toMinutes } from "@/lib/format";

/* ==========================================================================
   Appointment types.

   A clinic names the kinds of visit it books — a consultation, a review, a
   root canal — and gives each a length. That length is also the slot
   interval: a 90-minute procedure is offered at 90-minute steps, a 15-minute
   review at 15-minute ones, so the diary only ever offers times the visit
   actually fits.
   ========================================================================== */

/** Lengths a type can take, in minutes. The API accepts any 5-minute step up to four hours. */
export const TYPE_LENGTHS = [10, 15, 20, 30, 40, 45, 60, 75, 90, 120, 150, 180];

/** The clinic's types, or one plain type from the old single interval if it has none yet. */
export function appointmentTypes(config: TenantConfig): AppointmentType[] {
  if (config.appointment_types?.length) return config.appointment_types;
  return [{ id: "appointment", name: "Appointment", minutes: config.default_duration || config.slot_minutes }];
}

/** Start times from the day's opening to the last one a visit of `minutes` still fits in. */
export function slotTimes(dayStart: string, dayEnd: string, minutes: number) {
  const [sh, sm] = dayStart.split(":").map(Number);
  const [eh, em] = dayEnd.split(":").map(Number);
  const out: string[] = [];
  if (!minutes || minutes < 5) return out;
  for (let m = sh * 60 + sm; m + minutes <= eh * 60 + em; m += minutes) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

/** "09:30" plus 45 → "10:15". */
export function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * The start times on one day a visit can actually be booked at: on the grid,
 * clear of the clinician's other bookings, and — today — not already gone.
 * `clashes` is the diary's own overlap check (`conflictsFor`), so this offers
 * exactly what the booking dialog would; the server checks again on save.
 */
export function freeSlots({
  dayStart, dayEnd, minutes, date, today, now, clashes,
}: {
  dayStart: string;
  dayEnd: string;
  minutes: number;
  date: string;
  today: string;
  /** the clinic's clock, "HH:mm" */
  now: string;
  clashes: (time: string) => boolean;
}) {
  return slotTimes(dayStart, dayEnd, minutes).filter(
    (t) => (date > today || (date === today && t > now)) && !clashes(t),
  );
}

/**
 * How far past its start a slot can still be booked — the same figure the API
 * holds (`PAST_START_GRACE_MIN`), so the grid never offers what the server will
 * refuse. The desk books the patient standing in front of them at the slot that
 * has just begun; a start older than this is a plan for the past.
 */
export const PAST_START_GRACE_MIN = 15;

/** Has this start time gone, by the clinic's clock (`today`, `now` as "HH:mm")? */
export function slotHasPassed({
  date, time, today, now,
}: { date: string; time: string; today: string; now: string }) {
  if (date !== today) return date < today;
  return toMinutes(time) < toMinutes(now) - PAST_START_GRACE_MIN;
}

/** The times of a grid that have gone, for the slot buttons to draw disabled. */
export function passedSlots(
  times: string[], when: { date: string; today: string; now: string },
): Set<string> {
  return new Set(times.filter((time) => slotHasPassed({ ...when, time })));
}

export function formatLength(minutes: number) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60), m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** What is wrong with a list before it is saved, in words — or null. */
export function typeListProblem(types: AppointmentType[]): string | null {
  if (types.length === 0) return "Add at least one appointment type.";
  if (types.some((t) => !t.name.trim())) return "Every appointment type needs a name.";
  const names = types.map((t) => t.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "Two appointment types have the same name.";
  return null;
}

export const newTypeId = () => `type-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
