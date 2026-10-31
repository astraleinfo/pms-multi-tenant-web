/* ==========================================================================
   What a prescription line costs, and whether this clinic hands it over.

   A line is dispensed from the clinic — it has a unit price, comes out of
   stock at the pharmacy and is billed there — or it is "prescribe only": the
   patient buys it elsewhere, so it has no price, never moves stock and never
   becomes a charge. The price is never typed: the server sets it from the stock
   line when the prescription is saved. This file only reads what was stored, so
   the read-only views say the same thing about a line.
   ========================================================================== */

import type { PrescriptionStatus, TenantConfig } from "@/lib/types";

/** The parts of a line that decide what it costs. */
export interface PricedLine {
  qty: number;
  dispense: boolean;
  unit_price: number | null;
}

/* Rounded half up from the decimal text, as the API rounds (12.345 → 12.35);
   `Math.round(n * 100)` would see 1234.4999… and go the other way. */
const cents = (n: number) => Number(`${Math.round(Number(`${n}e2`))}e-2`);

/** A new line starts the way the clinic set it up: a clinic that only
 *  prescribes starts every line as prescribe only. */
export const startsDispensed = (config: Pick<TenantConfig, "prescribe_only_default">) =>
  !config.prescribe_only_default;

/** The lines the pharmacy hands over. A row from before lines carried the flag
 *  has none, and was always dispensed here. */
export const dispensedHere = <T extends { dispense?: boolean }>(items: T[]) =>
  items.filter((i) => i.dispense !== false);

/** qty × unit price, for a line dispensed here that has a price; null otherwise. */
export function lineTotal(line: PricedLine): number | null {
  if (!line.dispense || line.unit_price == null) return null;
  return cents(line.qty * line.unit_price);
}

/** What the lines dispensed here come to. A prescribe-only line adds nothing. */
export function dispensedTotal(lines: PricedLine[]): number {
  return cents(lines.reduce((sum, line) => sum + (lineTotal(line) ?? 0), 0));
}

/** Whether any line would put a price on the page — with none, a print or a
 *  view shows no price column at all. */
export const anyPriced = (lines: PricedLine[]) => lines.some((l) => lineTotal(l) !== null);

/** Still something for the pharmacy to hand over. */
export const awaitsCounter = (status: PrescriptionStatus) =>
  status === "pending" || status === "partially_dispensed";
