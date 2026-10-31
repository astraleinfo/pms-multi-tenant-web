import { describe, expect, it } from "vitest";
import { readNumberInput } from "./number-input";

describe("readNumberInput", () => {
  it("reports a typed number", () => {
    expect(readNumberInput("12.5")).toBe(12.5);
    expect(readNumberInput("007")).toBe(7);
  });

  it("leaves a half-typed value unreported", () => {
    expect(readNumberInput("-")).toBeUndefined();
    expect(readNumberInput("1e")).toBeUndefined();
  });

  it("reports an empty box as zero by default", () => {
    expect(readNumberInput("")).toBe(0);
    expect(readNumberInput("  ")).toBe(0);
  });

  it("reports an empty box as NaN for a field that opts in, so the caller can tell nothing from zero", () => {
    expect(readNumberInput("", { emptyAsNaN: true })).toBeNaN();
    expect(readNumberInput("0", { emptyAsNaN: true })).toBe(0);
    expect(readNumberInput("4", { emptyAsNaN: true })).toBe(4);
  });
});
