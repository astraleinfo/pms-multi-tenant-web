import type { PlatformTenantRow } from "@/lib/api";
import type { NotBilledReason, Tenant } from "@/lib/types";

/* ==========================================================================
   What the platform is owed, worked out from the one fee it charges.

   Every clinic has every module, and every billed clinic pays the same flat
   monthly fee for the whole product (`subscription_fee_monthly`, set in the
   console's settings). So what a clinic is *set up* to pay is a function of
   two things only: that fee, and the clinic's own record — whether it is
   active, on trial, suspended or exempt.

   That is the question this file answers, at today's fee. Its counterpart in
   `revenue.ts` answers the other one — what the billing run actually raised
   and collected — and nothing here may be used to answer that, or the console
   ends up quoting two different revenues.
   ========================================================================== */

/**
 * What one clinic is set up to pay, as a single word.
 *
 * `held` is the case worth naming: a suspended clinic is not serving and is
 * not invoiced, so reading its fee as revenue would overstate the run rate.
 */
export type AccountState = "billed" | "trial" | "held" | "exempt";

/**
 * The same rule the API bills by (`rent.billable_lines`), so the console and
 * the next bill cannot disagree: exempt first, then suspended, then trial.
 * A zero fee bills nobody, but the clinic's state is still what it is.
 */
export function accountStateOf(tenant: Tenant): AccountState {
  if (tenant.billing_exempt) return "exempt";
  if (tenant.status === "suspended") return "held";
  if (tenant.status === "trial") return "trial";
  return "billed";
}

/** Why the clinic's next bill leaves the fee off — `null` when it is billed. */
export function notBilledReason(tenant: Tenant, fee: number): NotBilledReason | null {
  const state = accountStateOf(tenant);
  if (state === "exempt") return "exempt";
  if (state === "held") return "suspended";
  if (state === "trial") return "trial";
  return fee > 0 ? null : "no_fee";
}

export interface ConsoleRow extends PlatformTenantRow {
  state: AccountState;
  /** what it pays the platform each month, at today's fee */
  mrr: number;
}

export function consoleRows(rows: readonly PlatformTenantRow[], fee: number): ConsoleRow[] {
  return rows.map((row) => {
    const state = accountStateOf(row.tenant);
    return { ...row, state, mrr: state === "billed" ? fee : 0 };
  });
}

/* ---- platform-wide figures ------------------------------------------------ */

export interface PlatformTotals {
  tenants: number;
  active: number;
  trial: number;
  suspended: number;
  exempt: number;
  /** clinics serving right now — anything not suspended */
  live: number;

  users: number;
  patients: number;
  encounters: number;
  appointments: number;
  invoices: number;
  /** what the clinics themselves billed their patients — not platform revenue */
  clinicRevenue: number;

  /** the flat monthly fee every billed clinic pays */
  fee: number;
  /** what the platform collects a month, and the same figure annualised */
  mrr: number;
  arr: number;
  /** clinics the fee applies to — active, not exempt, not suspended */
  billedTenants: number;
  /** monthly value sitting behind suspended clinics, collected by nobody */
  heldValue: number;
  /** what the trials would be worth if every one of them converted */
  trialValue: number;
}

export function platformTotals(rows: readonly ConsoleRow[], fee: number): PlatformTotals {
  const sum = (f: (r: ConsoleRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const count = (f: (r: ConsoleRow) => boolean) => rows.filter(f).length;

  const mrr = sum((r) => r.mrr);

  return {
    tenants: rows.length,
    active: count((r) => r.tenant.status === "active"),
    trial: count((r) => r.tenant.status === "trial"),
    suspended: count((r) => r.tenant.status === "suspended"),
    exempt: count((r) => r.state === "exempt"),
    live: count((r) => r.tenant.status !== "suspended"),

    users: sum((r) => r.users),
    patients: sum((r) => r.patients),
    encounters: sum((r) => r.encounters),
    appointments: sum((r) => r.appointments),
    invoices: sum((r) => r.invoices),
    clinicRevenue: sum((r) => r.revenue),

    fee,
    mrr,
    arr: mrr * 12,
    billedTenants: count((r) => r.state === "billed"),
    heldValue: count((r) => r.state === "held") * fee,
    trialValue: count((r) => r.state === "trial") * fee,
  };
}
