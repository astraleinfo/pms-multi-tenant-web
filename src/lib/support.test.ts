import { describe, expect, it } from "vitest";
import { telHref } from "./support";

describe("telHref", () => {
  it("strips spacing from an international number", () => {
    expect(telHref("+91 80 4718 2200")).toBe("tel:+918047182200");
  });

  it("dials a bare ten-digit Indian mobile number as +91", () => {
    expect(telHref("7305961254")).toBe("tel:+917305961254");
    expect(telHref("73059 61254")).toBe("tel:+917305961254");
  });

  it("leaves anything else as the digits it has", () => {
    expect(telHref("1800 123 456")).toBe("tel:1800123456");
    expect(telHref("+44 20 7946 0958")).toBe("tel:+442079460958");
  });
});
