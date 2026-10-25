import { describe, expect, it } from "vitest";
import { MOBILE_ERROR, normalizeMobile, sanitizeMobileInput, validateMobile } from "./mobile";

describe("sanitizeMobileInput", () => {
  it("keeps digits only and caps at ten", () => {
    expect(sanitizeMobileInput("98a76-5", "98")).toBe("98765");
    expect(sanitizeMobileInput("1234567890985645465", "123456789098564546")).toBe("1234567890");
  });
  it("normalises a pasted formatted number", () => {
    expect(sanitizeMobileInput("+91 98765 43210")).toBe("9876543210");
    expect(sanitizeMobileInput("09876543210")).toBe("9876543210");
  });
  it("does not strip a 91 that the user is typing", () => {
    expect(sanitizeMobileInput("91999999999", "9199999999")).toBe("9199999999");
  });
});

describe("normalizeMobile", () => {
  it("strips +91, 91, 0, spaces and dashes when longer than ten", () => {
    expect(normalizeMobile("+91 98765-43210")).toBe("9876543210");
    expect(normalizeMobile("919876543210")).toBe("9876543210");
    expect(normalizeMobile("07000 000000")).toBe("7000000000");
  });
  it("leaves ten digits and short numbers alone", () => {
    expect(normalizeMobile("9198765432")).toBe("9198765432");
    expect(normalizeMobile("12345")).toBe("12345");
    expect(normalizeMobile(null)).toBe("");
  });
});

describe("validateMobile", () => {
  it("accepts exactly ten digits", () => {
    expect(validateMobile("9876543210")).toBeNull();
  });
  it("rejects everything else", () => {
    for (const v of ["", "98765", "12345678901", "98765 43210", "98765abcde", null, undefined]) {
      expect(validateMobile(v)).toBe(MOBILE_ERROR);
    }
  });
});

describe("paste handling", () => {
  it("a whole formatted paste lands as the right ten digits (the input must not truncate it first)", () => {
    expect(sanitizeMobileInput("+91 98765 43210", "")).toBe("9876543210");
    expect(sanitizeMobileInput("98765 43210", "")).toBe("9876543210");
  });
});
