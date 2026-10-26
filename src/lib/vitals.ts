/**
 * The vitals a consultation records, in the order they are read out: blood pressure, pulse,
 * temperature (°F) and oxygen saturation. They are ordinary encounter fields in the
 * clinic's schema — `clinical_ext` keys the API keeps — that the screen groups under
 * "Vitals" instead of with the clinic's own assessment fields.
 */
export const VITAL_KEYS = ["bp", "pulse", "temperature", "spo2"] as const;

/**
 * Split a clinic's encounter schema into its vitals and everything else. The chief
 * complaint is in neither: it is driven from its own control.
 */
export function splitVitals<T extends { field_key: string }>(schema: T[]): { vitals: T[]; rest: T[] } {
  const isVital = (key: string) => (VITAL_KEYS as readonly string[]).includes(key);
  return {
    vitals: schema.filter((f) => isVital(f.field_key)),
    rest: schema.filter((f) => f.field_key !== "chief_complaint" && !isVital(f.field_key)),
  };
}
