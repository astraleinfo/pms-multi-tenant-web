/* ==========================================================================
   What a prescription line costs, and whether this clinic hands it over.

   A line is dispensed from the clinic — it has a unit price, comes out of
   stock at the pharmacy and is billed there — or it is "prescribe only": the
   patient buys it elsewhere, so it has no price, never moves stock and never
   becomes a charge. The server decides all of that (it drops the price of a
   prescribe-only line itself); this mirrors it so the editor and the read-only
   views say the same thing before anything is saved.
   ========================================================================== */

import type { PrescriptionStatus, TenantConfig } from "@/lib/types";

/** The parts of a line that decide what it costs. */
export interface PricedLine {
  qty: number;
  dispense: boolean;
  unit_price: number | null;
}

/** The most one unit can be priced at — the API refuses anything above it. */
export const MAX_UNIT_PRICE = 1_000_000;

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

/**
 * The price a line has after its dispense switch is flipped. Switched off it
 * has none. Switched back on it gets back what it had, or failing that its
 * stock line's price, or stays unpriced.
 */
export function priceAfterToggle(
  dispense: boolean, previous: number | null, stockPrice: number | null,
): number | null {
  if (!dispense) return null;
  return previous ?? stockPrice;
}

/** Why a typed price will be refused, in a sentence — or null. */
export function unitPriceProblem(price: number | null): string | null {
  if (price == null) return null;
  if (!Number.isFinite(price)) return "Enter a number.";
  if (price < 0) return "A price cannot be negative.";
  if (price > MAX_UNIT_PRICE) return "That is more than a unit can be priced at.";
  return null;
}

/** The price to send for a line: none for a prescribe-only line, otherwise to the cent. */
export function priceToSend(line: Pick<PricedLine, "dispense" | "unit_price">): number | null {
  if (!line.dispense || line.unit_price == null) return null;
  return cents(line.unit_price);
}

/** Still something for the pharmacy to hand over. */
export const awaitsCounter = (status: PrescriptionStatus) =>
  status === "pending" || status === "partially_dispensed";
