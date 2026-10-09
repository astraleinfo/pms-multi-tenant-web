import { describe, expect, it } from "vitest";
import type { PlatformTenantRow } from "@/lib/api";
import type { Tenant } from "@/lib/types";
import { accountStateOf, consoleRows, notBilledReason, platformTotals } from "./subscriptions";

const tenant = (over: Partial<Tenant> = {}) =>
  ({ id: "t1", name: "Northgate", slug: "northgate", status: "active", billing_exempt: false, ...over } as Tenant);

const row = (t: Tenant): PlatformTenantRow => ({
  tenant: t, users: 1, patients: 10, appointments: 0, encounters: 0, invoices: 0, revenue: 0, last_activity: null,
});

describe("who the flat fee applies to", () => {
  it("bills an active clinic, and not one on trial, suspended or exempt", () => {
    expect(accountStateOf(tenant())).toBe("billed");
    expect(accountStateOf(tenant({ status: "trial" }))).toBe("trial");
    expect(accountStateOf(tenant({ status: "suspended" }))).toBe("held");
    expect(accountStateOf(tenant({ billing_exempt: true }))).toBe("exempt");
  });

  it("puts exemption ahead of suspension, the way the API does", () => {
    expect(accountStateOf(tenant({ status: "suspended", billing_exempt: true }))).toBe("exempt");
  });

  it("says why a clinic is not billed, including when no fee is set", () => {
    expect(notBilledReason(tenant(), 9999)).toBeNull();
    expect(notBilledReason(tenant(), 0)).toBe("no_fee");
    expect(notBilledReason(tenant({ status: "trial" }), 9999)).toBe("trial");
    expect(notBilledReason(tenant({ status: "suspended" }), 9999)).toBe("suspended");
    expect(notBilledReason(tenant({ billing_exempt: true }), 9999)).toBe("exempt");
  });
});

describe("the run rate", () => {
  it("is the fee times the clinics it applies to, whatever their discipline", () => {
    const rows = consoleRows([
      row(tenant({ id: "a", clinical_type: "dental" })),
      row(tenant({ id: "b", clinical_type: "ophthalmology" })),
      row(tenant({ id: "c", status: "trial" })),
      row(tenant({ id: "d", status: "suspended" })),
      row(tenant({ id: "e", billing_exempt: true })),
    ], 100);

    expect(rows.map((r) => r.mrr)).toEqual([100, 100, 0, 0, 0]);

    const totals = platformTotals(rows, 100);
    expect(totals.mrr).toBe(200);
    expect(totals.arr).toBe(2400);
    expect(totals.billedTenants).toBe(2);
    expect(totals.trialValue).toBe(100);
    expect(totals.heldValue).toBe(100);
    expect(totals.exempt).toBe(1);
  });

  it("is zero while no fee is set, without changing who would be billed", () => {
    const totals = platformTotals(consoleRows([row(tenant())], 0), 0);
    expect(totals.mrr).toBe(0);
    expect(totals.billedTenants).toBe(1);
  });
});
