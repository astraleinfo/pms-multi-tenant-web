import type { PlatformBilling } from "@/lib/api";
import type { SubscriptionInvoice, Tenant } from "@/lib/types";

/* ==========================================================================
   Revenue, as invoiced.

   Every figure here is read off `subscription_invoices` — what the billing
   run actually raised, and what has actually been paid. Its counterpart in
   `subscriptions.ts` answers the other question: what a clinic is *set up*
   to be billed, at today's prices. Both are legitimate, and nothing here
   may be used to answer that one, or the console ends up quoting two
   different revenues.

   Money assumption: every sum below is in `billing.currency`. Each invoice
   carries its own `currency`, and today every clinic is on the platform's.
   A second live currency would make every total on this page wrong, and
   would need grouping per currency before any of them mean anything.
   ========================================================================== */

export interface RevenuePeriod {
  /** the invoice period_start, e.g. "2026-09-01" */
  period: string;
  label: string;
  billed: number;
  collected: number;
  clinics: number;
}

export interface ModuleRevenue {
  feature_key: string;
  name: string;
  billed: number;
  clinics: number;
}

export interface ChargeRow {
  id: string;
  /** the invoice's issued_on */
  date: string;
  period: string;
  tenant: Tenant;
  feature_key: string;
  name: string;
  amount: number;
  /** never "void" — a withdrawn bill is not a charge */
  status: "open" | "paid";
}

export interface RevenueTotals {
  /** null when nothing has ever been billed */
  period: string | null;
  billed: number;
  collected: number;
  outstanding: number;
  clinics: number;
  /** billed per clinic billed, not per clinic on the platform */
  arpa: number;
}

/** Every invoice that counts as money. A withdrawn bill never does. */
function counted(billing: PlatformBilling): Array<{ tenant: Tenant; invoice: SubscriptionInvoice }> {
  return billing.clinics.flatMap((row) =>
    row.invoices
      .filter((invoice) => invoice.status !== "void")
      .map((invoice) => ({ tenant: row.tenant, invoice })),
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "2026-09-01" → "Sep", read off the string rather than through `Date`.
 * `new Date("2026-09-01")` is parsed as UTC midnight, so `.getMonth()`
 * answers August for anybody west of Greenwich.
 */
function monthLabel(period: string): string {
  return MONTHS[Number(period.slice(5, 7)) - 1] ?? period;
}

/** The most recent period holding any invoice, or null if none ever has. */
export function latestPeriod(billing: PlatformBilling): string | null {
  let latest: string | null = null;
  for (const { invoice } of counted(billing)) {
    if (latest === null || invoice.period_start > latest) latest = invoice.period_start;
  }
  return latest;
}

/** What was billed and collected each month, oldest first, last `months` of them. */
export function revenueSeries(billing: PlatformBilling, months: number): RevenuePeriod[] {
  const byPeriod = new Map<string, { billed: number; collected: number; clinics: Set<string> }>();

  for (const { tenant, invoice } of counted(billing)) {
    let bucket = byPeriod.get(invoice.period_start);
    if (!bucket) {
      bucket = { billed: 0, collected: 0, clinics: new Set() };
      byPeriod.set(invoice.period_start, bucket);
    }
    bucket.billed += invoice.amount;
    if (invoice.status === "paid") bucket.collected += invoice.amount;
    bucket.clinics.add(tenant.id);
  }

  return [...byPeriod.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-months)
    .map(([period, b]) => ({
      period,
      label: monthLabel(period),
      billed: b.billed,
      collected: b.collected,
      clinics: b.clinics.size,
    }));
}

/** What each module earned in one period — the latest, unless told otherwise. */
export function moduleRevenue(billing: PlatformBilling, period?: string): ModuleRevenue[] {
  const target = period ?? latestPeriod(billing);
  if (target === null) return [];

  const byModule = new Map<string, { name: string; billed: number; clinics: Set<string> }>();

  for (const { tenant, invoice } of counted(billing)) {
    if (invoice.period_start !== target) continue;
    for (const line of invoice.lines) {
      let bucket = byModule.get(line.feature_key);
      if (!bucket) {
        /* The line's own name, never a catalogue lookup: a module dropped
           from the catalogue after it was invoiced still has to render. */
        bucket = { name: line.name, billed: 0, clinics: new Set() };
        byModule.set(line.feature_key, bucket);
      }
      bucket.billed += line.amount;
      bucket.clinics.add(tenant.id);
    }
  }

  return [...byModule.entries()]
    .map(([feature_key, b]) => ({
      feature_key, name: b.name, billed: b.billed, clinics: b.clinics.size,
    }))
    .sort((a, b) => b.billed - a.billed);
}

/** One row per invoice line: what was charged, to whom, for what, when. */
export function charges(billing: PlatformBilling): ChargeRow[] {
  const rows: ChargeRow[] = [];

  for (const { tenant, invoice } of counted(billing)) {
    for (const line of invoice.lines) {
      rows.push({
        id: `${invoice.id}:${line.feature_key}`,
        date: invoice.issued_on,
        period: invoice.period_start,
        tenant,
        feature_key: line.feature_key,
        name: line.name,
        amount: line.amount,
        status: invoice.status === "paid" ? "paid" : "open",
      });
    }
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

/** The headline figures, for the latest period that has any. */
export function revenueTotals(billing: PlatformBilling): RevenueTotals {
  const period = latestPeriod(billing);
  if (period === null) {
    return { period: null, billed: 0, collected: 0, outstanding: 0, clinics: 0, arpa: 0 };
  }

  let billed = 0;
  let collected = 0;
  const clinics = new Set<string>();

  for (const { tenant, invoice } of counted(billing)) {
    if (invoice.period_start !== period) continue;
    billed += invoice.amount;
    if (invoice.status === "paid") collected += invoice.amount;
    clinics.add(tenant.id);
  }

  return {
    period,
    billed,
    collected,
    outstanding: billed - collected,
    clinics: clinics.size,
    arpa: clinics.size ? billed / clinics.size : 0,
  };
}
