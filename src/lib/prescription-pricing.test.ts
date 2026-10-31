import { describe, expect, it } from "vitest";
import {
  MAX_UNIT_PRICE, anyPriced, awaitsCounter, dispensedHere, dispensedTotal, lineTotal, priceAfterPick,
  priceAfterRetype, priceAfterToggle, priceToSend, startsDispensed, unitPriceProblem,
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

describe("priceAfterToggle", () => {
  it("drops the price when the line becomes prescribe only", () => {
    expect(priceAfterToggle(false, 12, 10)).toBeNull();
  });

  it("brings back the price the line had, else the stock price, else none", () => {
    expect(priceAfterToggle(true, 12, 10)).toBe(12);
    expect(priceAfterToggle(true, null, 10)).toBe(10);
    expect(priceAfterToggle(true, null, null)).toBeNull();
  });
});

describe("priceAfterPick", () => {
  const stockRow = { item_id: "stock-1", dispense: true, unit_price: 6 };
  const typedRow = { item_id: null, dispense: true, unit_price: 40 };

  it("brings a shelf line's price onto a dispensed row", () => {
    expect(priceAfterPick(typedRow, { unit_price: 1.1 })).toBe(1.1);
    expect(priceAfterPick(stockRow, { unit_price: 1.1 })).toBe(1.1);
  });

  it("leaves a prescribe-only row unpriced whatever is picked", () => {
    expect(priceAfterPick({ ...stockRow, dispense: false, unit_price: null }, { unit_price: 1.1 })).toBeNull();
  });

  it("does not carry the old stock line's price onto a catalogue medicine with none", () => {
    expect(priceAfterPick(stockRow, {})).toBeNull();
    expect(priceAfterPick(typedRow, {})).toBeNull();
  });

  it("keeps a catalogue medicine's own price when it has one", () => {
    expect(priceAfterPick(stockRow, { unit_price: 12 })).toBe(12);
  });

  it("drops a stock line's price when the row becomes a custom entry, but keeps one typed by hand", () => {
    expect(priceAfterPick(stockRow, { custom: true })).toBeNull();
    expect(priceAfterPick(typedRow, { custom: true })).toBe(40);
  });
});

describe("priceAfterRetype", () => {
  it("drops the stock line's price when the name is typed over", () => {
    expect(priceAfterRetype({ item_id: "stock-1", dispense: true, unit_price: 6 }, true)).toBeNull();
  });

  it("leaves the price alone while the name still matches", () => {
    expect(priceAfterRetype({ item_id: "stock-1", dispense: true, unit_price: 6 }, false)).toBe(6);
  });
});

describe("unitPriceProblem", () => {
  it("accepts no price, zero and anything up to the ceiling", () => {
    expect(unitPriceProblem(null)).toBeNull();
    expect(unitPriceProblem(0)).toBeNull();
    expect(unitPriceProblem(MAX_UNIT_PRICE)).toBeNull();
  });

  it("refuses what the API refuses", () => {
    expect(unitPriceProblem(-1)).toMatch(/negative/);
    expect(unitPriceProblem(MAX_UNIT_PRICE + 1)).toMatch(/more than/);
    expect(unitPriceProblem(Number.NaN)).toMatch(/number/);
  });
});

describe("priceToSend", () => {
  it("sends no price for a prescribe-only line", () => {
    expect(priceToSend({ dispense: false, unit_price: 12 })).toBeNull();
  });

  it("sends a dispensed line's price to the cent", () => {
    expect(priceToSend({ dispense: true, unit_price: 12.345 })).toBe(12.35);
    expect(priceToSend({ dispense: true, unit_price: null })).toBeNull();
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
