import { describe, expect, it } from "vitest";
import { groupOutcomes, outcomeForKey, outcomeOptions } from "./follow-up-outcomes";

describe("outcomeOptions", () => {
  it("draws the reached options first, then the unreached, numbered in that order", () => {
    expect(outcomeOptions(false).map((o) => [o.key, o.value, o.group])).toEqual([
      [1, "confirmed", "reached"],
      [2, "reschedule_required", "reached"],
      [3, "declined", "reached"],
      [4, "no_answer", "unreached"],
      [5, "call_back", "unreached"],
    ]);
  });

  it("offers Reschedule today only when the booking can move today, straight after Confirmed", () => {
    expect(outcomeOptions(false).some((o) => o.value === "rescheduled")).toBe(false);
    expect(outcomeOptions(true).map((o) => [o.key, o.value])).toEqual([
      [1, "confirmed"],
      [2, "rescheduled"],
      [3, "reschedule_required"],
      [4, "declined"],
      [5, "no_answer"],
      [6, "call_back"],
    ]);
  });

  it("gives every option its own label and its own line saying what it does", () => {
    const options = outcomeOptions(true);
    expect(new Set(options.map((o) => o.label)).size).toBe(options.length);
    expect(new Set(options.map((o) => o.hint)).size).toBe(options.length);
    for (const o of options) expect(o.hint).toMatch(/\S.*\.$/);
  });

  it("keeps the line that tells the two reschedule options apart", () => {
    const byValue = Object.fromEntries(outcomeOptions(true).map((o) => [o.value, o]));
    expect(byValue.rescheduled.hint).toMatch(/today/i);
    expect(byValue.reschedule_required.hint).toMatch(/another day/i);
    expect(byValue.rescheduled.hint).not.toBe(byValue.reschedule_required.hint);
  });

  it("keeps every label short enough for a one-line card", () => {
    for (const o of outcomeOptions(true)) {
      expect(o.label.length).toBeLessThanOrEqual(20);
      expect(o.label).not.toContain(".");
    }
  });
});

describe("groupOutcomes", () => {
  it("puts each option under its caption, in the order drawn", () => {
    const groups = groupOutcomes(outcomeOptions(true));
    expect(groups.map((g) => [g.caption, g.options.map((o) => o.value)])).toEqual([
      ["Reached the patient", ["confirmed", "rescheduled", "reschedule_required", "declined"]],
      ["Could not reach", ["no_answer", "call_back"]],
    ]);
  });

  it("leaves out a group with nothing in it", () => {
    const reachedOnly = outcomeOptions(false).filter((o) => o.group === "reached");
    expect(groupOutcomes(reachedOnly).map((g) => g.group)).toEqual(["reached"]);
  });
});

describe("outcomeForKey", () => {
  it("picks the option whose number was pressed", () => {
    const options = outcomeOptions(true);
    expect(outcomeForKey(options, "1")).toBe("confirmed");
    expect(outcomeForKey(options, "2")).toBe("rescheduled");
    expect(outcomeForKey(options, "6")).toBe("call_back");
    expect(outcomeForKey(outcomeOptions(false), "2")).toBe("reschedule_required");
  });

  it("ignores keys that are not a number shown", () => {
    const options = outcomeOptions(false);
    for (const key of ["0", "6", "a", "Enter", " "]) expect(outcomeForKey(options, key)).toBeNull();
  });
});
