import { describe, expect, it } from "vitest";
import type { PlatformBilling } from "@/lib/api";
import type { SubscriptionInvoice, Tenant } from "@/lib/types";
import {
  charges, clinicRevenue, latestPeriod, revenueSeries, revenueTotals,
} from "./revenue";

const tenant = (id: string, name: string) => ({ id, name, slug: name.toLowerCase() } as Tenant);

function invoice(over: Partial<SubscriptionInvoice> = {}): SubscriptionInvoice {
  return {
    id: "inv-1", tenant_id: "t1", number: "AS-1", period_start: "2026-09-01",
    period_end: "2026-09-30", currency: "INR", amount: 100,
    lines: [{ name: "Astrale PMS subscription", amount: 100 }],
    issued_on: "2026-09-01", due_on: "2026-09-08", hold_on: "2026-09-15",
    status: "open", reminder_stage: "none", reminders_sent: 0,
    paid_at: null, payment_reference: "", settled_by: "",
    ...over,
  } as SubscriptionInvoice;
}

function billing(clinics: PlatformBilling["clinics"]): PlatformBilling {
  return {
    enabled: true, currency: "INR", due_days: 7, grace_days: 7,
    reminder_days_before_due: 3, fee_monthly: 100, clinics,
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
    expect(revenueSeries(data, 6).at(-1)!.billed).toBe(100);
    expect(clinicRevenue(data).reduce((s, c) => s + c.billed, 0)).toBe(100);
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
    expect(clinicRevenue(EMPTY)).toEqual([]);
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

describe("a bill from before every module was included", () => {
  it("lists each of its old per-module lines by the name the line carries", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [invoice({
        amount: 400,
        lines: [{ name: "Lab", amount: 150 }, { name: "Billing", amount: 250 }],
      })],
    }]);

    expect(charges(data).map((c) => [c.name, c.amount])).toEqual([["Lab", 150], ["Billing", 250]]);
    expect(new Set(charges(data).map((c) => c.id)).size).toBe(2);
    expect(clinicRevenue(data)).toEqual([
      { tenant: tenant("t1", "Northgate"), billed: 400, collected: 0 },
    ]);
  });
});

describe("revenue by clinic", () => {
  it("ranks clinics by what they were billed in the period, and counts only paid bills as collected", () => {
    const data = billing([
      {
        tenant: tenant("t1", "Northgate"),
        summary: {} as never,
        invoices: [invoice({ id: "a", amount: 100, status: "paid" })],
      },
      {
        tenant: tenant("t2", "Clearview"),
        summary: {} as never,
        invoices: [
          invoice({ id: "b", tenant_id: "t2", amount: 300, status: "open" }),
          invoice({ id: "c", tenant_id: "t2", period_start: "2026-08-01", amount: 999, status: "paid" }),
        ],
      },
    ]);

    expect(clinicRevenue(data).map((c) => [c.tenant.name, c.billed, c.collected])).toEqual([
      ["Clearview", 300, 0],
      ["Northgate", 100, 100],
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

    expect(revenueSeries(data, 6).at(-1)!.label).toBe("Sep");
  });
});

describe("revenueSeries zero-fills its window", () => {
  it("shows a fixed six months even when only the latest one has been billed, so a single real month never looks like a broken chart", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [invoice({ period_start: "2026-09-01", amount: 500 })],
    }]);

    const series = revenueSeries(data, 6);
    expect(series.map((p) => p.period)).toEqual([
      "2026-04-01", "2026-05-01", "2026-06-01", "2026-07-01", "2026-08-01", "2026-09-01",
    ]);
    expect(series.slice(0, 5).every((p) => p.billed === 0 && p.collected === 0 && p.clinics === 0)).toBe(true);
    expect(series.at(-1)).toMatchObject({ billed: 500, clinics: 1 });
  });

  it("crosses a year boundary without losing a month", () => {
    const data = billing([{
      tenant: tenant("t1", "Northgate"),
      summary: {} as never,
      invoices: [invoice({ period_start: "2026-02-01", amount: 100 })],
    }]);

    const series = revenueSeries(data, 6);
    expect(series.map((p) => p.period)).toEqual([
      "2025-09-01", "2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01",
    ]);
    expect(series.map((p) => p.label)).toEqual(["Sep", "Oct", "Nov", "Dec", "Jan", "Feb"]);
  });
});
