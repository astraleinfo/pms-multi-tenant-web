import { describe, expect, it } from "vitest";
import { nextToothState, toothStateMeta, TOOTH_STATES, TOOTH_CYCLE } from "./tooth-states";

describe("TOOTH_STATES", () => {
  it("lists mobility and fracture after the original six, which keep their keys and order", () => {
    expect(TOOTH_STATES.map((s) => s.key)).toEqual([
      "healthy", "watch", "caries", "filling", "crown", "extract", "mobility", "fracture",
    ]);
  });

  it("labels every state in words, so colour is never the only signal", () => {
    expect(TOOTH_STATES.map((s) => s.label)).toEqual([
      "Sound", "Watch", "Decay", "Filled", "Crowned", "For extraction", "Mobility", "Fracture",
    ]);
  });

  it("gives every state its own swatch", () => {
    const swatches = TOOTH_STATES.map((s) => s.swatch);
    expect(new Set(swatches).size).toBe(swatches.length);
  });

  it("cycles through exactly the states it lists, in the same order", () => {
    expect(TOOTH_CYCLE).toEqual(TOOTH_STATES.map((s) => s.key));
  });
});

describe("nextToothState", () => {
  it("steps through the whole scale and wraps from the last state back to sound", () => {
    let state: string = "healthy";
    const seen = [state];
    for (let i = 0; i < TOOTH_CYCLE.length; i++) {
      state = nextToothState(state);
      seen.push(state);
    }
    expect(seen).toEqual([...TOOTH_CYCLE, "healthy"]);
  });

  it("goes from extraction to mobility, and from fracture back to sound", () => {
    expect(nextToothState("extract")).toBe("mobility");
    expect(nextToothState("mobility")).toBe("fracture");
    expect(nextToothState("fracture")).toBe("healthy");
  });

  it("sends a state this build has never heard of to sound on the first click", () => {
    expect(nextToothState("something-from-the-future")).toBe("healthy");
  });
});

describe("toothStateMeta", () => {
  it("finds the new states", () => {
    expect(toothStateMeta("mobility")?.label).toBe("Mobility");
    expect(toothStateMeta("fracture")?.label).toBe("Fracture");
  });

  it("returns undefined for a legacy or unknown value instead of throwing", () => {
    expect(toothStateMeta("legacy-value")).toBeUndefined();
  });
});
