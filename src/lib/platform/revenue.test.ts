import { describe, expect, it } from "vitest";
import type { PlatformBilling } from "@/lib/api";
import type { SubscriptionInvoice, Tenant, FeatureKey } from "@/lib/types";
import {
  charges, latestPeriod, moduleRevenue, revenueSeries, revenueTotals,
} from "./revenue";

const tenant = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() } as Tenant);

function invoice(over: Partial<SubscriptionInvoice> = {}): SubscriptionInvoice {
  return {
    id: "inv-1", tenant_id: "t1", number: "AS-1", period_start: "2026-09-01",
    period_end: "2026-09-30", currency: "INR", amount: 100,
    lines: [{ feature_key: "billing", name: "Billing", amount: 100 }],
    issued_on: "2026-09-01", due_on: "2026-09-08", hold_on: "2026-09-15",
    status: "open", reminder_stage: "none", reminders_sent: 0,
    paid_at: null, payment_reference: "", settled_by: "",
    ...over,
  } as SubscriptionInvoice;
}

function billing(clinics: PlatformBilling["clinics"]): PlatformBilling {
  return {
    enabled: true, currency: "INR", due_days: 7, grace_days: 7,
    reminder_days_before_due: 3, clinics,
  };
}

const EMPTY = billing([]);

describe("a withdrawn bill is not money", () => {
  it("leaves void invoices out of every total", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [
        invoice({ id: "a", amount: 100, status: "paid" }),
        invoice({ id: "b", amount: 900, status: "void" }),
      ],
    }]);

    expect(revenueTotals(data).billed).toBe(100);
    expect(revenueSeries(data, 6)[0].billed).toBe(100);
    expect(moduleRevenue(data).reduce((s, m) => s + m.billed, 0)).toBe(100);
    expect(charges(data)).toHaveLength(1);
  });
});

describe("a void-only period is not the current one", () => {
  it("falls back to the last period with real money, not the one with only a void bill", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [
        invoice({ id: "a", period_start: "2026-08-01", amount: 300, status: "paid" }),
        invoice({ id: "b", period_start: "2026-09-01", amount: 900, status: "void" }),
      ],
    }]);

    expect(latestPeriod(data)).toBe("2026-08-01");

    const totals = revenueTotals(data);
    expect(totals.period).toBe("2026-08-01");
    expect(totals.billed).toBe(300);
    expect(totals.collected).toBe(300);
  });
});

describe("no invoices at all", () => {
  it("reports no period rather than a zero total", () => {
    expect(latestPeriod(EMPTY)).toBeNull();
    expect(revenueTotals(EMPTY).period).toBeNull();
    expect(revenueSeries(EMPTY, 6)).toEqual([]);
    expect(moduleRevenue(EMPTY)).toEqual([]);
    expect(charges(EMPTY)).toEqual([]);
  });
});

describe("the current month has not been billed yet", () => {
  it("reads the latest period that has invoices, not zero", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [
        invoice({ id: "a", period_start: "2026-07-01", amount: 300 }),
        invoice({ id: "b", period_start: "2026-08-01", amount: 500 }),
      ],
    }]);

    expect(latestPeriod(data)).toBe("2026-08-01");
    expect(revenueTotals(data).billed).toBe(500);
  });
});

describe("a module dropped from the catalogue", () => {
  it("names it from the invoice line, which carries its own copy", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [invoice({
        lines: [{ feature_key: "retired_module" as FeatureKey, name: "Retired Module", amount: 250 }],
      })],
    }]);

    expect(moduleRevenue(data)).toEqual([
      { feature_key: "retired_module" as FeatureKey, name: "Retired Module", billed: 250, clinics: 1 },
    ]);
  });
});

describe("collected against billed", () => {
  it("counts only paid invoices as collected, and the rest as outstanding", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [
        invoice({ id: "a", amount: 100, status: "paid" }),
        invoice({ id: "b", amount: 400, status: "open" }),
      ],
    }]);

    const totals = revenueTotals(data);
    expect(totals.billed).toBe(500);
    expect(totals.collected).toBe(100);
    expect(totals.outstanding).toBe(400);
    expect(totals.clinics).toBe(1);
    expect(totals.arpa).toBe(500);
  });
});

describe("the month label", () => {
  it("does not shift a month for anyone west of Greenwich", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [invoice({ period_start: "2026-09-01" })],
    }]);

    expect(revenueSeries(data, 6)[0].label).toBe("Sep");
  });
});
