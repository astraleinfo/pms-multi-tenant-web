import { describe, expect, it } from "vitest";
import { applySeed, seedFromQueue } from "./encounter-prefill";

describe("seedFromQueue", () => {
  it("takes patient, doctor and reason from the entry", () => {
    expect(seedFromQueue({ patient_id: "p1", doctor_id: "d1", reason: " Teeth cleaning " })).toEqual({
      patient: "p1", doctor: "d1", complaint: "Teeth cleaning",
    });
  });
  it("is null for an unknown entry", () => {
    expect(seedFromQueue(null)).toBeNull();
    expect(seedFromQueue(undefined)).toBeNull();
  });
});

describe("applySeed", () => {
  const seed = { patient: "p1", doctor: "d1", complaint: "Teeth cleaning" };
  it("fills an empty form", () => {
    expect(applySeed({ patient: null, doctor: "x", complaint: "" }, seed)).toEqual({
      patient: "p1", doctor: "d1", complaint: "Teeth cleaning",
    });
  });
  it("keeps what the clinician already chose", () => {
    expect(applySeed({ patient: "p9", doctor: "x", complaint: "Pain" }, seed)).toEqual({
      patient: "p9", doctor: "d1", complaint: "Pain",
    });
  });
  it("does nothing without a seed", () => {
    const cur = { patient: null, doctor: "x", complaint: "" };
    expect(applySeed(cur, null)).toBe(cur);
  });
});
