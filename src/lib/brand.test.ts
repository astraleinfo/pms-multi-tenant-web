import { describe, expect, it } from "vitest";
import { brandProblem, contrastWithWhite, DEFAULT_BRAND_COLOR } from "./brand";

describe("contrastWithWhite", () => {
  it("is 21 for black and 1 for white", () => {
    expect(contrastWithWhite("#000000")).toBeCloseTo(21, 0);
    expect(contrastWithWhite("#ffffff")).toBeCloseTo(1, 1);
  });
});

describe("brandProblem", () => {
  it("accepts the default and any dark enough colour", () => {
    expect(brandProblem(DEFAULT_BRAND_COLOR)).toBeNull();
    expect(brandProblem("#1e3a8a")).toBeNull();
    expect(brandProblem("#1E3A8A")).toBeNull();
  });

  it("refuses something that is not #rrggbb, saying what a colour looks like", () => {
    expect(brandProblem("teal")).toMatch(/#rrggbb/);
    expect(brandProblem("#12345")).toMatch(/#rrggbb/);
    expect(brandProblem("")).toMatch(/#rrggbb/);
  });

  it("refuses a colour too light for white text, saying so", () => {
    expect(brandProblem("#ffff00")).toMatch(/too light/);
    expect(brandProblem("#ffffff")).toMatch(/too light/);
  });
});
