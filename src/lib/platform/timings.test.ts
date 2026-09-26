import { describe, expect, it } from "vitest";
import { daysToSeconds, hoursToSeconds, secondsToDays, secondsToHours } from "./timings";

describe("seconds round-trip through the friendlier unit the form shows", () => {
  it("days", () => {
    expect(secondsToDays(604800)).toBe(7);
    expect(daysToSeconds(secondsToDays(604800))).toBe(604800);
  });

  it("hours", () => {
    expect(secondsToHours(7200)).toBe(2);
    expect(hoursToSeconds(secondsToHours(7200))).toBe(7200);
  });

  it("rounds a value that doesn't land on a whole unit rather than truncating silently", () => {
    expect(secondsToDays(600000)).toBe(7); // 6.94 days
  });
});
