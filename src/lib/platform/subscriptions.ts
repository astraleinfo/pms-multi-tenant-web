import type { PlatformTenantRow } from "@/lib/api";
import { FEATURES } from "@/lib/data/catalog";
import type {
  Feature, FeatureKey, Id, Tenant, TenantFeature, TenantFeatureStatus,
} from "@/lib/types";

/* ==========================================================================
   What the platform is owed, worked out from what it has switched on.

   There is no billing service behind the console: no invoice table for
   clinics, no gateway, no dunning run. What there *is* is the entitlement row
   — which module a clinic holds, whether it is live or on trial, and the day
   it was switched on — and the catalogue price sitting next to it, which a
   super admin sets in the console and the API serves. Those two are enough to say what each clinic is charged this month, what the platform
   collects across all of them, and when every subscription started.

   So every figure in the console is a pure function of those two inputs, and
   nothing here invents a transaction that did not happen. When the API grows
   real invoices this is the one file that changes: the screens above it read
   `Subscription`, `ModuleStats` and `LedgerEntry`, not prices and statuses.
   ========================================================================== */

/** The paid modules by name — the copy only. What each costs is `Feature`,
    from `usePlatformCatalog`. */
export const PAID_FEATURES = FEATURES.filter((f) => !f.is_core);
export const CORE_FEATURES = FEATURES.filter((f) => f.is_core);

/**
 * What one clinic is being charged for one module.
 *
 * `held` is the case worth naming: the clinic still holds the entitlement, but
 * its subdomain is suspended, so nothing is collected while it stays that way.
 * Reading it as revenue would overstate the run rate every month.
 */
export type BillingState = "included" | "billed" | "trial" | "held" | "dormant";

/** The same question asked of a whole clinic rather than one of its modules. */
export type AccountState = "billed" | "trial" | "held" | "core_only";

export interface Subscription {
  tenant: Tenant;
  feature: Feature;
  /** the entitlement row's own status — what the server would enforce */
  status: TenantFeatureStatus;
  state: BillingState;
  /** what this line adds to the monthly bill; zero unless it is billed */
  amount: number;
  /** the day it was switched on, where the entitlement row knows it */
  since: string | null;
}

/** Entitlement rows per clinic, as the console fetches them one clinic at a time. */
export type Entitlements = ReadonlyMap<Id, readonly TenantFeature[]>;

export function billingStateOf(
  tenant: Tenant, feature: Feature, status: TenantFeatureStatus,
): BillingState {
  if (feature.is_core) return "included";
  if (status === "inactive") return "dormant";
  /* A suspended clinic is not serving and is not invoiced, whichever way its
     entitlement rows happen to be set. */
  if (tenant.status === "suspended") return "held";
  return status === "trial" ? "trial" : "billed";
}

export interface ConsoleRow extends PlatformTenantRow {
  /** one line per module in the catalogue, core included */
  subscriptions: Subscription[];
  billed: Subscription[];
  trialing: Subscription[];
  held: Subscription[];
  /** paid modules this clinic could buy and has not */
  locked: Subscription[];
  /** what it pays the platform each month */
  mrr: number;
  state: AccountState;
  /** true once its entitlement rows have arrived and the dates are real */
  detailed: boolean;
}

/**
 * Turn the snapshot into the console's own row.
 *
 * The entitlement rows are fetched per clinic and land after the snapshot, so
 * until they do this falls back to the list of active keys the snapshot
 * already carries. That is the same answer for everything except trials and
 * activation dates, which is why the row says whether it is `detailed` — the
 * ledger and the trend leave undetailed rows out rather than guess a date.
 */
export function consoleRows(
  rows: readonly PlatformTenantRow[], entitlements: Entitlements, features: readonly Feature[],
): ConsoleRow[] {
  return rows.map((row) => {
    const held = entitlements.get(row.tenant.id);
    const byKey = new Map((held ?? []).map((r) => [r.feature_key, r]));

    const subscriptions = features.map<Subscription>((feature) => {
      const entitlement = byKey.get(feature.key);
      const status: TenantFeatureStatus = entitlement
        ? entitlement.status
        : row.active_features.includes(feature.key) ? "active" : "inactive";
      const state = billingStateOf(row.tenant, feature, status);
      return {
        tenant: row.tenant,
        feature,
        status,
        state,
        amount: state === "billed" ? feature.price_monthly : 0,
        since: entitlement?.activated_at?.slice(0, 10) ?? null,
      };
    });

    const paid = subscriptions.filter((s) => !s.feature.is_core);
    const billed = paid.filter((s) => s.state === "billed");
    const trialing = paid.filter((s) => s.state === "trial");
    const onHold = paid.filter((s) => s.state === "held");

    return {
      ...row,
      subscriptions,
      billed,
      trialing,
      held: onHold,
      locked: paid.filter((s) => s.state === "dormant"),
      mrr: billed.reduce((sum, s) => sum + s.amount, 0),
      state: billed.length ? "billed" : trialing.length ? "trial" : onHold.length ? "held" : "core_only",
      detailed: !!held,
    };
  });
}

/* ---- platform-wide figures ------------------------------------------------ */

export interface PlatformTotals {
  tenants: number;
  active: number;
  trial: number;
  suspended: number;
  /** clinics serving right now — anything not suspended */
  live: number;

  users: number;
  patients: number;
  encounters: number;
  appointments: number;
  invoices: number;
  /** what the clinics themselves billed their patients — not platform revenue */
  clinicRevenue: number;

  /** module entitlements switched on across every clinic, core included */
  enabledModules: number;
  /** paid modules a clinic could hold and does not */
  lockedModules: number;
  /** every paid module that is on, whether billed, trialling or held */
  subscriptions: number;
  billedSubscriptions: number;
  trialSubscriptions: number;
  heldSubscriptions: number;

  /** what the platform collects a month, and the same figure annualised */
  mrr: number;
  arr: number;
  /** monthly value sitting behind suspended clinics, collected by nobody */
  heldValue: number;
  /** what a trial would be worth if every one of them converted */
  trialValue: number;
  payingTenants: number;
  /** average revenue per paying clinic */
  arpa: number;
}

export function platformTotals(rows: readonly ConsoleRow[]): PlatformTotals {
  const sum = (f: (r: ConsoleRow) => number) => rows.reduce((t, r) => t + f(r), 0);
  const count = (f: (r: ConsoleRow) => boolean) => rows.filter(f).length;

  const mrr = sum((r) => r.mrr);
  const paying = count((r) => r.mrr > 0);

  return {
    tenants: rows.length,
    active: count((r) => r.tenant.status === "active"),
    trial: count((r) => r.tenant.status === "trial"),
    suspended: count((r) => r.tenant.status === "suspended"),
    live: count((r) => r.tenant.status !== "suspended"),

    users: sum((r) => r.users),
    patients: sum((r) => r.patients),
    encounters: sum((r) => r.encounters),
    appointments: sum((r) => r.appointments),
    invoices: sum((r) => r.invoices),
    clinicRevenue: sum((r) => r.revenue),

    enabledModules: sum((r) => r.subscriptions.filter((s) => s.status === "active").length),
    lockedModules: sum((r) => r.locked.length),
    subscriptions: sum((r) => r.billed.length + r.trialing.length + r.held.length),
    billedSubscriptions: sum((r) => r.billed.length),
    trialSubscriptions: sum((r) => r.trialing.length),
    heldSubscriptions: sum((r) => r.held.length),

    mrr,
    arr: mrr * 12,
    heldValue: sum((r) => r.held.reduce((t, s) => t + s.feature.price_monthly, 0)),
    trialValue: sum((r) => r.trialing.reduce((t, s) => t + s.feature.price_monthly, 0)),
    payingTenants: paying,
    arpa: paying ? mrr / paying : 0,
  };
}

/* ---- one module, across every clinic -------------------------------------- */

export interface ModuleStats {
  feature: Feature;
  /** every clinic's line for this module, clinics in the order given */
  lines: Subscription[];
  billed: number;
  trial: number;
  held: number;
  locked: number;
  /** clinics holding it at all — billed, trialling or held */
  subscribers: number;
  mrr: number;
  /** subscribers over clinics, 0–1 */
  adoption: number;
}

export function moduleStats(
  rows: readonly ConsoleRow[], features: readonly Feature[],
): ModuleStats[] {
  return features.map((feature) => {
    const lines = rows.map(
      (r) => r.subscriptions.find((s) => s.feature.key === feature.key)!,
    );
    const of = (state: BillingState) => lines.filter((l) => l.state === state).length;
    const billed = of("billed");
    const trial = of("trial");
    const held = of("held");
    const subscribers = feature.is_core ? lines.length : billed + trial + held;

    return {
      feature,
      lines,
      billed,
      trial,
      held,
      locked: of("dormant"),
      subscribers,
      mrr: lines.reduce((t, l) => t + l.amount, 0),
      adoption: rows.length ? subscribers / rows.length : 0,
    };
  });
}

export const statsByKey = (stats: readonly ModuleStats[]) =>
  new Map<FeatureKey, ModuleStats>(stats.map((s) => [s.feature.key, s]));

/**
 * The console's today.
 *
 * The console is not inside a clinic, so the ambient "today" every other screen
 * uses — the one the provider sets from the tenant it signed into — is never
 * set here and stays at its placeholder. The clinics themselves each carry
 * their own date in their own zone, so the latest of those is the closest thing
 * the platform has to a date, and it is a real one.
 */
export function platformToday(rows: readonly ConsoleRow[], fallback: string) {
  return rows.reduce((latest, r) => (r.tenant.today > latest ? r.tenant.today : latest), fallback);
}

/* ---- when each subscription started --------------------------------------- */

export interface LedgerEntry {
  id: string;
  /** the day the entitlement was switched on */
  date: string;
  tenant: Tenant;
  feature: Feature;
  state: BillingState;
  /** the monthly charge this subscription carries */
  amount: number;
}

/**
 * Every paid subscription that is on, newest first, with the day it started.
 *
 * This is an activation ledger rather than a payment history: it says when the
 * platform started charging for something, not that money moved. A module
 * switched on and later off leaves nothing behind, because the entitlement row
 * carries one date and no trail — so this reads as the making of what is live
 * today, not as everything that ever happened.
 */
export function activationLedger(rows: readonly ConsoleRow[]): LedgerEntry[] {
  return rows
    .flatMap((r) => r.subscriptions)
    .filter((s) => !s.feature.is_core && s.state !== "dormant" && s.since)
    .map((s) => ({
      id: `${s.tenant.id}:${s.feature.key}`,
      date: s.since!,
      tenant: s.tenant,
      feature: s.feature,
      state: s.state,
      amount: s.feature.price_monthly,
    }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export interface MonthPoint {
  /** YYYY-MM */
  month: string;
  label: string;
  /** the run rate at the end of that month */
  mrr: number;
  /** subscriptions that started in it */
  started: number;
}

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * The run rate month by month, rebuilt from when each live subscription began.
 *
 * Reconstructed, not recorded: only subscriptions that are still on have a date
 * to place, so this traces the growth of what the platform bills today and
 * never dips. A real invoice table would replace it outright.
 */
export function mrrSeries(rows: readonly ConsoleRow[], today: string, months = 6): MonthPoint[] {
  const ledger = activationLedger(rows).filter((e) => e.state === "billed");
  const [year, month] = today.split("-").map(Number);

  return Array.from({ length: months }, (_, i) => {
    const offset = months - 1 - i;
    const d = new Date(Date.UTC(year, month - 1 - offset, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth();
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    /* everything that had started by the last day of this month */
    const end = `${key}-31`;

    return {
      month: key,
      label: `${MONTH_LABELS[m]} ${String(y).slice(2)}`,
      mrr: ledger.filter((e) => e.date <= end).reduce((t, e) => t + e.amount, 0),
      started: ledger.filter((e) => e.date.slice(0, 7) === key).length,
    };
  });
}
