import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_REASON, followUpBookingDate, followUpDue, followUpLabel, followUpPrefill, followUpState,
} from "./follow-up-booking";

const appt = (over: Partial<{ patient_id: string; date: string; time: string; status: string }> = {}) => ({
  patient_id: "p1", date: "2026-11-01", time: "10:00", status: "scheduled", ...over,
}) as { patient_id: string; date: string; time: string; status: "scheduled" | "confirmed" | "checked_in" | "cancelled" | "no_show" | "completed" };

describe("followUpDue", () => {
  it("is the encounter date plus the interval", () => {
    expect(followUpDue("2026-10-20", 7)).toBe("2026-10-27");
    expect(followUpDue("2026-12-28", 14)).toBe("2027-01-11");
  });
  it("is null when no follow-up was asked for", () => {
    expect(followUpDue("2026-10-20", null)).toBeNull();
    expect(followUpDue("2026-10-20", undefined)).toBeNull();
    expect(followUpDue("2026-10-20", 0)).toBeNull();
  });
});

describe("followUpBookingDate", () => {
  it("books on the due date when it is still ahead", () => {
    expect(followUpBookingDate("2026-11-01", "2026-10-25")).toBe("2026-11-01");
    expect(followUpBookingDate("2026-10-25", "2026-10-25")).toBe("2026-10-25");
  });
  it("books from today when the due date has gone", () => {
    expect(followUpBookingDate("2026-10-01", "2026-10-25")).toBe("2026-10-25");
  });
});

describe("followUpPrefill", () => {
  it("carries the patient, the doctor, the due date and the reason", () => {
    expect(followUpPrefill({
      patientId: "p1", doctorId: "d1", encounterDate: "2026-10-25", days: 30, today: "2026-10-25",
    })).toEqual({ patient: "p1", doctor: "d1", date: "2026-11-24", reason: FOLLOW_UP_REASON });
  });
  it("moves a due date already gone to today", () => {
    expect(followUpPrefill({
      patientId: "p1", doctorId: "d1", encounterDate: "2026-01-01", days: 7, today: "2026-10-25",
    })?.date).toBe("2026-10-25");
  });
  it("is null with no interval, and leaves the patient empty when none is chosen yet", () => {
    expect(followUpPrefill({ patientId: "p1", doctorId: "d1", encounterDate: "2026-10-25", days: null, today: "2026-10-25" })).toBeNull();
    expect(followUpPrefill({ patientId: null, doctorId: "d1", encounterDate: "2026-10-25", days: 7, today: "2026-10-25" })?.patient).toBeNull();
  });
});

describe("followUpState", () => {
  const base = { patientId: "p1", encounterDate: "2026-10-20", days: 7, today: "2026-10-25" };

  it("is none when no follow-up was asked for", () => {
    expect(followUpState({ ...base, days: null, appointments: [appt()] })).toEqual({ kind: "none" });
  });

  it("is open, with the due date, when nothing is booked", () => {
    expect(followUpState({ ...base, appointments: [] })).toEqual({ kind: "open", due: "2026-10-27" });
  });

  it("is booked by the earliest upcoming booking after the visit", () => {
    const state = followUpState({
      ...base,
      appointments: [
        appt({ date: "2026-11-10", time: "09:00" }),
        appt({ date: "2026-10-28", time: "11:30", status: "confirmed" }),
        appt({ date: "2026-10-28", time: "09:15" }),
      ],
    });
    expect(state).toEqual({ kind: "booked", date: "2026-10-28", time: "09:15" });
  });

  it("ignores other patients, cancelled and no-show bookings, and bookings already gone", () => {
    expect(followUpState({
      ...base,
      appointments: [
        appt({ patient_id: "p2" }),
        appt({ status: "cancelled" }),
        appt({ status: "no_show" }),
        appt({ date: "2026-10-22" }), // after the visit but before today: stale
        appt({ date: "2026-10-20" }), // the visit's own day
      ],
    }).kind).toBe("open");
  });

  it("is seen when the patient has been in since the visit", () => {
    expect(followUpState({ ...base, appointments: [appt({ date: "2026-10-24", status: "completed" })] }))
      .toEqual({ kind: "seen", date: "2026-10-24" });
    expect(followUpState({
      ...base, appointments: [],
      encounters: [{ patient_id: "p1", date: "2026-10-23" }, { patient_id: "p2", date: "2026-10-24" }],
    })).toEqual({ kind: "seen", date: "2026-10-23" });
  });

  it("prefers an upcoming booking over an earlier visit", () => {
    expect(followUpState({
      ...base,
      appointments: [appt({ date: "2026-10-24", status: "completed" }), appt({ date: "2026-11-02" })],
    }).kind).toBe("booked");
  });
});

describe("followUpLabel", () => {
  it("says what to do, or what is already done", () => {
    expect(followUpLabel({ kind: "open", due: "2026-10-27" })).toBe("Book follow-up");
    expect(followUpLabel({ kind: "booked", date: "2026-10-28", time: "09:15" })).toBe("Booked 28 Oct 2026");
    expect(followUpLabel({ kind: "seen", date: "2026-10-24" })).toBe("Seen 24 Oct 2026");
    expect(followUpLabel({ kind: "none" })).toBe("");
  });
});
