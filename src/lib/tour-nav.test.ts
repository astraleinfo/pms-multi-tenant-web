import { describe, expect, it } from "vitest";
import { isOnRoute, maxAnchorAttempts, skipTarget, stepTarget } from "./tour-nav";

describe("stepTarget", () => {
  it("moves forward and finishes past the last step", () => {
    expect(stepTarget(0, 5, "forward")).toBe(1);
    expect(stepTarget(3, 5, "forward")).toBe(4);
    expect(stepTarget(4, 5, "forward")).toBe("finish");
  });
  it("moves back and stays on the first step", () => {
    expect(stepTarget(4, 5, "back")).toBe(3);
    expect(stepTarget(1, 5, "back")).toBe(0);
    expect(stepTarget(0, 5, "back")).toBe(0);
  });
});

describe("skipTarget", () => {
  it("skips in the direction of travel", () => {
    expect(skipTarget(2, 5, "forward")).toBe(3);
    expect(skipTarget(2, 5, "back")).toBe(1);
  });
  it("ends the tour when there is nothing left in that direction", () => {
    expect(skipTarget(4, 5, "forward")).toBe("finish");
    expect(skipTarget(0, 5, "back")).toBe("finish");
  });
});

describe("anchor waiting", () => {
  it("waits far less once on the step's route", () => {
    expect(maxAnchorAttempts(true)).toBeLessThan(maxAnchorAttempts(false));
  });
  it("compares the path, ignoring the query", () => {
    expect(isOnRoute(undefined, "/dashboard")).toBe(true);
    expect(isOnRoute("/settings?tab=fields", "/settings")).toBe(true);
    expect(isOnRoute("/queue", "/patients")).toBe(false);
  });
});
