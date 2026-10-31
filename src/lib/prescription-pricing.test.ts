import { describe, expect, it } from "vitest";
import {
  anyPriced, awaitsCounter, dispensedHere, dispensedTotal, lineTotal, startsDispensed,
} from "./prescription-pricing";

const line = (qty: number, unit_price: number | null, dispense = true) => ({ qty, unit_price, dispense });

describe("lineTotal", () => {
  it("is quantity times unit price for a line dispensed here", () => {
    expect(lineTotal(line(3, 42.5))).toBe(127.5);
    expect(lineTotal(line(1, 0))).toBe(0);
  });

  it("is rounded to the cent", () => {
    expect(lineTotal(line(3, 0.1))).toBe(0.3);
  });

  it("is null for a prescribe-only line, whatever price it carries", () => {
    expect(lineTotal(line(3, 42.5, false))).toBeNull();
  });

  it("is null for a line nobody priced", () => {
    expect(lineTotal(line(3, null))).toBeNull();
  });
});

describe("dispensedTotal", () => {
  it("adds up only the lines dispensed here", () => {
    expect(dispensedTotal([line(3, 20), line(1, 99, false), line(2, null), line(2, 1.25)])).toBe(62.5);
  });

  it("is nothing for a prescription the patient fills elsewhere", () => {
    expect(dispensedTotal([line(1, null, false), line(5, null, false)])).toBe(0);
    expect(dispensedTotal([])).toBe(0);
  });
});

describe("anyPriced", () => {
  it("is false when nothing on the prescription has a price to print", () => {
    expect(anyPriced([line(1, null, false), line(2, null)])).toBe(false);
    expect(anyPriced([line(1, null, false), line(2, 4)])).toBe(true);
  });
});

describe("startsDispensed", () => {
  it("follows the clinic's default", () => {
    expect(startsDispensed({ prescribe_only_default: false })).toBe(true);
    expect(startsDispensed({ prescribe_only_default: true })).toBe(false);
  });
});

describe("dispensedHere", () => {
  it("leaves out lines the patient buys elsewhere, and keeps a row with no flag", () => {
    const rows = [{ id: "a", dispense: true }, { id: "b", dispense: false }, { id: "c" }];
    expect(dispensedHere(rows).map((r) => r.id)).toEqual(["a", "c"]);
  });
});

describe("awaitsCounter", () => {
  it("is true only while something is left for the pharmacy", () => {
    expect(awaitsCounter("pending")).toBe(true);
    expect(awaitsCounter("partially_dispensed")).toBe(true);
    expect(awaitsCounter("dispensed")).toBe(false);
    expect(awaitsCounter("prescribe_only")).toBe(false);
  });
});
