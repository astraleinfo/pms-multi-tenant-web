"use client";

import * as React from "react";
import Link from "next/link";
import type { PlatformBilling } from "@/lib/api";
import { charges, moduleRevenue, revenueSeries, revenueTotals } from "@/lib/platform/revenue";
import { rentMoney } from "@/components/domain/subscription";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { Select } from "@/components/ui/field";
import { EmptyState } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarChart, RankBar } from "@/components/charts/bar-chart";
import { IconAlert, IconChart, IconReceipt, IconSpark, IconUsers } from "@/components/ui/icons";

/* ==========================================================================
   Revenue and activity, both read off raised invoices.

   Everything here answers "what did we bill, and what came in" — never
   "what is this clinic set up to be billed", which is the access grid's
   question and is computed from entitlements instead.
   ========================================================================== */

/** Shown wherever a figure would otherwise be a zero that reads as collapse. */
function NeverBilled({ what }: { what: string }) {
  return (
    <EmptyState
      icon={<IconReceipt size={20} />}
      title="Billing has not run yet"
      body={`No bill has been raised, so there is no ${what} to show. Run the billing cycle from the Bills tab and this fills in.`}
      compact
    />
  );
}

/** The period a figure is quoted for, spelled out so nobody reads it as "now". */
export function periodLabel(period: string): string {
  return new Date(`${period}T00:00:00`).toLocaleDateString(undefined, {
    month: "long", year: "numeric",
  });
}

/* ==========================================================================
   Loading and failure are not "billing has never run".

   `usePlatformBilling()` can leave a screen in three states before there is
   ever a real figure to show: still resolving, failed outright, or resolved
   with nothing ever billed. Only the last of those is "billing has not run
   yet" — the first two just don't know yet, and every surface that reads
   this query (Overview's stats, the Revenue tab, the Activity tab) has to
   tell them apart the same way rather than growing its own copy of the
   three-way branch.
   ========================================================================== */

export interface BillingQuery {
  data: PlatformBilling | undefined;
  isPending: boolean;
  isError: boolean;
}

export type BillingStatus = "pending" | "error" | "never-billed" | "billed";

export function billingStatus(query: BillingQuery): BillingStatus {
  if (query.isPending) return "pending";
  if (query.isError) return "error";
  if (!query.data || revenueTotals(query.data).period === null) return "never-billed";
  return "billed";
}

/** Card-level stand-in for whichever of the three non-"billed" states applies. */
export function BillingGate({ status, what }: { status: Exclude<BillingStatus, "billed">; what: string }) {
  if (status === "pending") {
    return (
      <Card>
        <EmptyState
          icon={<IconReceipt size={20} />}
          title="Reading bills…"
          body={`Fetching ${what} from the billing run.`}
          compact
        />
      </Card>
    );
  }
  if (status === "error") {
    return (
      <Card>
        <EmptyState
          icon={<IconAlert size={20} />}
          title="Bills could not be read"
          body="Try again in a moment."
          compact
        />
      </Card>
    );
  }
  return <Card><NeverBilled what={what} /></Card>;
}

export function RevenueTab({ query }: { query: BillingQuery }) {
  const status = billingStatus(query);
  const billing = query.data;
  const totals = React.useMemo(() => (billing ? revenueTotals(billing) : null), [billing]);
  const series = React.useMemo(() => (billing ? revenueSeries(billing, 6) : []), [billing]);
  const modules = React.useMemo(() => (billing ? moduleRevenue(billing) : []), [billing]);
  const money = (n: number) => rentMoney(n, billing?.currency ?? "INR");

  if (status !== "billed" || !billing || !totals || totals.period === null) {
    return <BillingGate status={status === "billed" ? "never-billed" : status} what="revenue" />;
  }

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Monthly recurring" value={money(totals.billed)} unit="/mo"
          icon={<IconReceipt size={16} />}
          hint={`billed for ${periodLabel(totals.period)}`}
        />
        <Stat
          label="Collected" value={money(totals.collected)}
          icon={<IconSpark size={16} />}
          hint={totals.outstanding ? `${money(totals.outstanding)} still outstanding` : "every bill settled"}
        />
        <Stat
          label="Clinics billed" value={totals.clinics}
          icon={<IconUsers size={16} />}
          hint={`of ${billing.clinics.length} on the platform`}
        />
        <Stat
          label="Per billed clinic" value={money(totals.arpa)} unit="/mo"
          icon={<IconChart size={16} />}
          hint="what the average billed clinic pays"
        />
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader
            icon={<IconChart size={15} />} tone="ok" title="Billed and collected"
            hint="Every bill the run has raised, month by month, against what has been paid."
          />
          <CardBody>
            <BarChart
              labels={series.map((p) => p.label)}
              series={[
                { name: "Billed", values: series.map((p) => p.billed) },
                { name: "Collected", values: series.map((p) => p.collected) },
              ]}
              format={money}
              highlight={series.length - 1}
            />
            <p className="mt-3 text-caption leading-relaxed text-ink-3">
              Raised invoices, not a projection. A month dips when fewer clinics were billed,
              and the gap between the two bars is what is still owed for that month.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            icon={<IconReceipt size={15} />} tone="ok" title="Revenue by module"
            hint={`What each module billed in ${periodLabel(totals.period)}.`}
          />
          <CardBody>
            {modules.length ? (
              <RankBar
                rows={modules.map((m) => ({
                  label: m.name,
                  value: m.billed,
                  hint: `${m.clinics} ${m.clinics === 1 ? "clinic" : "clinics"}`,
                }))}
                format={money}
              />
            ) : (
              <p className="py-10 text-center text-label text-ink-3">
                Nothing was billed in this period.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function ActivityTab({ query }: { query: BillingQuery }) {
  const queryStatus = billingStatus(query);
  const billing = query.data;
  const rows = React.useMemo(() => (billing ? charges(billing) : []), [billing]);
  const [module, setModule] = React.useState<string>("any");
  const [status, setStatus] = React.useState<"any" | "open" | "paid">("any");
  const money = (n: number) => rentMoney(n, billing?.currency ?? "INR");

  /* The modules that have actually been charged for, not the whole
     catalogue — a filter offering something with no rows behind it is a
     dead end. */
  const options = React.useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of rows) seen.set(row.feature_key, row.name);
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const shown = rows.filter(
    (r) => (module === "any" || r.feature_key === module) && (status === "any" || r.status === status),
  );

  if (queryStatus !== "billed" || !billing || !rows.length) {
    return <BillingGate status={queryStatus === "billed" ? "never-billed" : queryStatus} what="activity" />;
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconReceipt size={15} />} tone="ok" title="Charges"
        hint="Every module the platform has billed for, on the bill it was billed on."
        actions={
          <div className="flex items-center gap-2">
            <Select value={module} onChange={(e) => setModule(e.target.value)} className="h-8 text-label">
              <option value="any">All modules</option>
              {options.map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </Select>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as "any" | "open" | "paid")}
              className="h-8 text-label"
            >
              <option value="any">Any status</option>
              <option value="paid">Paid</option>
              <option value="open">Open</option>
            </Select>
          </div>
        }
      />

      {shown.length === 0 ? (
        <EmptyState
          icon={<IconReceipt size={20} />} title="Nothing to show"
          body="No charge matches those filters." compact
        />
      ) : (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Billed on</TH>
                <TH>Clinic</TH>
                <TH>Module</TH>
                <TH>Status</TH>
                <TH align="right">Amount</TH>
              </TR>
            </THead>
            <TBody>
              {shown.map((row) => (
                <TR key={row.id}>
                  <TD><span className="tnum font-mono text-label text-ink-2">{formatDate(row.date)}</span></TD>
                  <TD>
                    <Link href={`/platform/tenants/${row.tenant.id}`} className="min-w-0 hover:underline">
                      <span className="block truncate font-medium text-ink">{row.tenant.name}</span>
                      <span className="tnum block truncate font-mono text-caption text-ink-3">
                        {row.tenant.slug}
                      </span>
                    </Link>
                  </TD>
                  <TD><span className="text-ink-2">{row.name}</span></TD>
                  <TD>
                    <Badge tone={row.status === "paid" ? "ok" : "warn"} size="sm">
                      {row.status === "paid" ? "Paid" : "Open"}
                    </Badge>
                  </TD>
                  <TD align="right">
                    <span className={cn("tnum font-mono text-label", row.status === "paid" ? "text-ink" : "text-ink-3")}>
                      {money(row.amount)}
                    </span>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </TableWrap>
      )}

      <p className="border-t border-line-soft px-5 py-2.5 text-caption text-ink-3">
        {shown.length} of {rows.length} charges · withdrawn bills are not listed
      </p>
    </Card>
  );
}
