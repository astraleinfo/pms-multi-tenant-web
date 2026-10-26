import { describe, expect, it } from "vitest";
import { splitVitals, VITAL_KEYS } from "./vitals";

const field = (field_key: string) => ({ field_key });

describe("splitVitals", () => {
  it("puts the four vitals in `vitals`, in the order the clinic's schema gives them", () => {
    const schema = [field("spo2"), field("bp"), field("temperature"), field("pulse")];
    expect(splitVitals(schema).vitals.map((f) => f.field_key)).toEqual(["spo2", "bp", "temperature", "pulse"]);
    expect(VITAL_KEYS).toEqual(["bp", "pulse", "temperature", "spo2"]);
  });

  it("leaves the clinic's own fields in `rest` and drops the chief complaint, which has its own control", () => {
    const schema = [field("chief_complaint"), field("bp"), field("pain_scale"), field("bruxism")];
    const { vitals, rest } = splitVitals(schema);
    expect(vitals.map((f) => f.field_key)).toEqual(["bp"]);
    expect(rest.map((f) => f.field_key)).toEqual(["pain_scale", "bruxism"]);
  });

  it("returns two empty lists for an empty schema", () => {
    expect(splitVitals([])).toEqual({ vitals: [], rest: [] });
  });

  it("keeps whatever else the field carries", () => {
    const schema = [{ field_key: "temperature", label: "Temperature (°F)", id: "t1" }];
    expect(splitVitals(schema).vitals[0]).toEqual({ field_key: "temperature", label: "Temperature (°F)", id: "t1" });
  });
});
