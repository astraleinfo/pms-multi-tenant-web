import { describe, expect, it } from "vitest";
import { encounterHref, pharmacyCounterHref } from "./routes";

describe("routes", () => {
  it("opens the counter with a prescription picked", () => {
    expect(pharmacyCounterHref("rx 1")).toBe("/pharmacy?rx=rx%201");
  });
  it("opens the bare counter without one", () => {
    expect(pharmacyCounterHref()).toBe("/pharmacy");
    expect(pharmacyCounterHref(null)).toBe("/pharmacy");
  });
  it("names the encounter", () => {
    expect(encounterHref("e1")).toBe("/consultations/e1");
  });
});
