/** Where things live, so a link and the page it opens agree on the address. */

/** The dispensing counter, with one prescription already picked when given. */
export function pharmacyCounterHref(prescriptionId?: string | null): string {
  return prescriptionId ? `/pharmacy?rx=${encodeURIComponent(prescriptionId)}` : "/pharmacy";
}

/** The encounter a prescription was written in. */
export function encounterHref(encounterId: string): string {
  return `/consultations/${encodeURIComponent(encounterId)}`;
}
