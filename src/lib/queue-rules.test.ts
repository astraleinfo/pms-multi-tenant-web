import { describe, expect, it } from "vitest";
import { blockingConsultation, closeSignedToken, doctorBusyFromError } from "./queue-rules";
import type { QueueEntry } from "./types";

const DAY = "2026-10-25";

function entry(over: Partial<QueueEntry>): QueueEntry {
  return {
    id: "q", tenant_id: "t", patient_id: "p", patient_name: "Someone", patient_mrn: "NG-1",
    appointment_id: null, doctor_id: "dr-a", token_no: 1, status: "waiting", checked_in_at: "09:00",
    priority: "routine", reason: "", queue_date: DAY, ...over,
  };
}

describe("blockingConsultation", () => {
  const inRoom = entry({ id: "q1", token_no: 1, status: "in_consultation", patient_name: "Amelia Fitzgerald" });
  const called = entry({ id: "q2", token_no: 2, status: "called" });
  const waiting = entry({ id: "q3", token_no: 3, status: "waiting" });

  it("names the consultation the same clinician already has open", () => {
    const queue = [inRoom, called, waiting];
    expect(blockingConsultation(queue, called)?.id).toBe("q1");
    expect(blockingConsultation(queue, waiting)?.id).toBe("q1");
  });

  it("never blocks the token that is itself in the room", () => {
    expect(blockingConsultation([inRoom, called], inRoom)).toBeNull();
  });

  it("is not held up by a colleague's consultation", () => {
    const colleagues = entry({ id: "q9", doctor_id: "dr-b", status: "in_consultation" });
    expect(blockingConsultation([colleagues, called], called)).toBeNull();
  });

  it("ignores a consultation left open on another day", () => {
    const yesterday = entry({ id: "q8", status: "in_consultation", queue_date: "2026-10-24" });
    expect(blockingConsultation([yesterday, called], called)).toBeNull();
  });

  it("is free once the consultation is completed", () => {
    expect(blockingConsultation([{ ...inRoom, status: "completed" }, called], called)).toBeNull();
  });
});

describe("closeSignedToken", () => {
  const inRoom = entry({ id: "q1", status: "in_consultation" });
  const next = entry({ id: "q2", token_no: 2, status: "called" });

  it("takes the signed visit's token off the board", () => {
    const after = closeSignedToken([inRoom, next], { queue_entry_id: "q1", status: "signed" });
    expect(after?.map((q) => q.status)).toEqual(["completed", "called"]);
  });

  it("leaves the board alone for a draft, an unlinked visit or no board yet", () => {
    const queue = [inRoom, next];
    expect(closeSignedToken(queue, { queue_entry_id: "q1", status: "draft" })).toBe(queue);
    expect(closeSignedToken(queue, { queue_entry_id: null, status: "signed" })).toBe(queue);
    expect(closeSignedToken(undefined, { queue_entry_id: "q1", status: "signed" })).toBeUndefined();
  });
});

describe("doctorBusyFromError", () => {
  it("reads the API's refusal", () => {
    const error = Object.assign(new Error("Aparna Iyer is still consulting Amelia Fitzgerald (token 1)."), {
      status: 409,
      details: { reason: "doctor_busy", queue_entry_id: "q1", patient_name: "Amelia Fitzgerald", token_no: 1 },
    });
    expect(doctorBusyFromError(error)).toEqual({
      message: "Aparna Iyer is still consulting Amelia Fitzgerald (token 1).",
      queueEntryId: "q1",
      patientName: "Amelia Fitzgerald",
      tokenNo: 1,
    });
  });

  it("leaves every other error alone", () => {
    expect(doctorBusyFromError(Object.assign(new Error("x"), { status: 409, details: {} }))).toBeNull();
    expect(doctorBusyFromError(Object.assign(new Error("x"), { status: 500, details: { reason: "doctor_busy" } }))).toBeNull();
    expect(doctorBusyFromError(new Error("plain"))).toBeNull();
    expect(doctorBusyFromError(null)).toBeNull();
  });
});
