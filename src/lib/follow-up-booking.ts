import { addDays, formatDate } from "@/lib/format";
import { isBooked, type AppointmentStatus } from "@/lib/types";

/* ==========================================================================
   Follow-ups from a consultation.

   A consultation's "follow-up in N days" is a clinician's instruction, not a
   booking. It only reaches the Follow-ups call list once somebody turns it
   into an appointment — so every screen that shows the instruction also says
   whether that has happened, and offers to do it, with the booking dialog
   filled in from the visit.
   ========================================================================== */

/** What a follow-up booking says it is for. */
export const FOLLOW_UP_REASON = "Follow-up";

/** When the review is due: the visit's date plus the interval, or null if none was asked for. */
export function followUpDue(encounterDate: string, days: number | null | undefined): string | null {
  if (!days || days <= 0) return null;
  return addDays(encounterDate, days);
}

/** The day to offer in the booking dialog: the due date, or today once it has gone. */
export function followUpBookingDate(due: string, today: string): string {
  return due < today ? today : due;
}

export interface FollowUpPrefill {
  patient: string | null;
  doctor: string;
  date: string;
  reason: string;
}

/** What the booking dialog opens with for this visit's follow-up — or null if there is none. */
export function followUpPrefill({
  patientId, doctorId, encounterDate, days, today,
}: {
  patientId: string | null;
  doctorId: string;
  encounterDate: string;
  days: number | null | undefined;
  today: string;
}): FollowUpPrefill | null {
  const due = followUpDue(encounterDate, days);
  if (!due) return null;
  return { patient: patientId, doctor: doctorId, date: followUpBookingDate(due, today), reason: FOLLOW_UP_REASON };
}

/**
 * Can the call list move this booking to another time today? The patient is
 * visiting today and needs a different hour: only a booking that is still to
 * happen, and is today's. Anything later goes through "Need to reschedule",
 * and the server refuses a booking that is already under way or closed.
 */
export function canMoveToday(a: { date: string; status: AppointmentStatus }, today: string): boolean {
  return a.date === today && isBooked(a.status);
}

type ApptLike = { patient_id: string; date: string; time: string; status: AppointmentStatus };
type VisitLike = { patient_id: string; date: string };

export type FollowUpState =
  /** no follow-up was asked for */
  | { kind: "none" }
  /** an appointment is coming up after the visit — it is on the call list */
  | { kind: "booked"; date: string; time: string }
  /** the patient has already been back since */
  | { kind: "seen"; date: string }
  /** asked for, and nothing booked */
  | { kind: "open"; due: string };

/**
 * Whether a visit's follow-up has been taken care of. Any upcoming booking
 * for the patient after the visit counts — the desk may have booked it from
 * the diary without saying what it was for — and so does the patient having
 * been in again since, booked or walked in.
 */
export function followUpState({
  patientId, encounterDate, days, today, appointments, encounters = [],
}: {
  patientId: string | null;
  encounterDate: string;
  days: number | null | undefined;
  today: string;
  appointments: readonly ApptLike[];
  encounters?: readonly VisitLike[];
}): FollowUpState {
  const due = followUpDue(encounterDate, days);
  if (!due) return { kind: "none" };
  if (!patientId) return { kind: "open", due };

  const after = appointments.filter((a) => a.patient_id === patientId && a.date > encounterDate);
  const upcoming = after
    .filter((a) => isBooked(a.status) && a.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))[0];
  if (upcoming) return { kind: "booked", date: upcoming.date, time: upcoming.time };

  const visits = [
    ...after.filter((a) => a.status === "checked_in" || a.status === "completed").map((a) => a.date),
    ...encounters.filter((e) => e.patient_id === patientId && e.date > encounterDate).map((e) => e.date),
  ].sort();
  if (visits.length) return { kind: "seen", date: visits[0] };

  return { kind: "open", due };
}

/** The button's words: what to do, or what has been done. */
export function followUpLabel(state: FollowUpState): string {
  switch (state.kind) {
    case "open": return "Book follow-up";
    case "booked": return `Booked ${formatDate(state.date, "long")}`;
    case "seen": return `Seen ${formatDate(state.date, "long")}`;
    default: return "";
  }
}
