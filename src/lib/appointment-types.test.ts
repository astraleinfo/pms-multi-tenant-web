import { describe, expect, it } from "vitest";
import {
  addMinutes, freeSlots, PAST_START_GRACE_MIN, passedSlots, slotHasPassed, slotTimes,
} from "./appointment-types";

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

  it("drops slots that started before the grace, by the clinic's clock", () => {
    expect(freeSlots({ ...day, date: "2026-10-09", now: "10:20", clashes: () => false }))
      .toEqual(["10:30"]);
  });

  it("keeps the slot that has just begun, as the diary and the server do", () => {
    expect(freeSlots({ ...day, date: "2026-10-09", now: "10:10", clashes: () => false }))
      .toEqual(["10:00", "10:30"]);
    expect(freeSlots({ ...day, date: "2026-10-09", now: "10:00", clashes: () => false }))
      .toEqual(["10:00", "10:30"]);
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

describe("slotHasPassed", () => {
  const today = "2026-10-09";

  it("treats a morning slot as gone at 10pm the same day", () => {
    expect(slotHasPassed({ date: today, time: "09:00", today, now: "22:00" })).toBe(true);
  });

  it("keeps the current time and later slots open", () => {
    expect(slotHasPassed({ date: today, time: "22:00", today, now: "22:00" })).toBe(false);
    expect(slotHasPassed({ date: today, time: "22:30", today, now: "22:00" })).toBe(false);
  });

  it("keeps the slot that has just begun open, for booking someone who is here now", () => {
    expect(slotHasPassed({ date: today, time: "21:45", today, now: "22:00" })).toBe(false);
    expect(PAST_START_GRACE_MIN).toBe(15);
    expect(slotHasPassed({ date: today, time: "21:44", today, now: "22:00" })).toBe(true);
  });

  it("never closes a later day, and always closes an earlier one", () => {
    expect(slotHasPassed({ date: "2026-10-10", time: "00:00", today, now: "22:00" })).toBe(false);
    expect(slotHasPassed({ date: "2026-10-08", time: "23:30", today, now: "00:05" })).toBe(true);
  });
});

describe("passedSlots", () => {
  const times = slotTimes("09:00", "11:00", 30);

  it("lists the slots of today that are behind the clinic's clock", () => {
    /* 10:00 began 20 minutes ago, past the grace; 10:30 has not begun */
    expect([...passedSlots(times, { date: "2026-10-09", today: "2026-10-09", now: "10:20" })])
      .toEqual(["09:00", "09:30", "10:00"]);
  });

  it("is empty on a later day", () => {
    expect(passedSlots(times, { date: "2026-10-10", today: "2026-10-09", now: "23:00" }).size).toBe(0);
  });
});
