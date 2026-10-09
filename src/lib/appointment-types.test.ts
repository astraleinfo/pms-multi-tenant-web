import { describe, expect, it } from "vitest";
import { addMinutes, freeSlots } from "./appointment-types";

const day = { dayStart: "09:00", dayEnd: "11:00", minutes: 30, today: "2026-10-09" };

describe("freeSlots", () => {
  it("offers every slot on the grid on a later day with nothing booked", () => {
    expect(freeSlots({ ...day, date: "2026-10-10", now: "10:15", clashes: () => false }))
      .toEqual(["09:00", "09:30", "10:00", "10:30"]);
  });

  it("drops the slots that clash with a booking", () => {
    const busy = new Set(["09:30", "10:00"]);
    expect(freeSlots({ ...day, date: "2026-10-10", now: "08:00", clashes: (t) => busy.has(t) }))
      .toEqual(["09:00", "10:30"]);
  });

  it("drops slots that have already started today, by the clinic's clock", () => {
    expect(freeSlots({ ...day, date: "2026-10-09", now: "10:00", clashes: () => false }))
      .toEqual(["10:30"]);
  });

  it("offers nothing on a day that has gone", () => {
    expect(freeSlots({ ...day, date: "2026-10-08", now: "08:00", clashes: () => false })).toEqual([]);
  });
});

describe("addMinutes", () => {
  it("carries into the hour", () => {
    expect(addMinutes("09:45", 30)).toBe("10:15");
  });
});
