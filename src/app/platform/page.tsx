"use client";

import * as React from "react";
import Link from "next/link";
import { isSuperAdmin } from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { usePlatformBilling, usePlatformSnapshot } from "@/lib/query/hooks";
import { CLINICAL_TYPES, MODULES } from "@/lib/data/catalog";
import { formatDate, pluralise } from "@/lib/format";
import {
  consoleRows, platformTotals,
  type AccountState, type ConsoleRow, type PlatformTotals,
} from "@/lib/platform/subscriptions";
import {
  charges, revenueSeries, revenueTotals,
  type ChargeRow, type RevenuePeriod, type RevenueTotals,
} from "@/lib/platform/revenue";
import { rentMoney, rentMoneyCompact } from "@/components/domain/subscription";
import { billingStatus, periodLabel, type BillingStatus } from "@/components/platform/revenue-tabs";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader, CardLink } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/chart-kit";
import { Monogram } from "@/components/layout/rail";
import { ConsolePage } from "@/components/platform/chrome";
import { CreateClinicFlow } from "@/components/platform/create-clinic";
import { AccountBadge } from "@/components/platform/account-badge";
import {
  IconAlert, IconArrowRight, IconChart, IconLayers, IconPlus, IconReceipt, IconSpark,
} from "@/components/ui/icons";

/* ==========================================================================
   The console's front page.

   Not a list — the list is a click away and has its own screen. This is the
   four numbers somebody opening the console wants before they know what they
   came for: how big the platform is, what it earns, what is on fire, and what
   changed since they last looked.
   ========================================================================== */

export default function PlatformPage() {
  return <ConsolePage><Overview /></ConsolePage>;
}

function Overview() {
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const { data: billing, isPending: billingPending, isError: billingIsError } = usePlatformBilling();
  const [creating, setCreating] = React.useState(false);
  /* Billing is a separate query from the platform snapshot and the API
     builds it one clinic at a time, so it routinely still resolves after
     the rest of this page has rendered. It is deliberately left out of this
     gate — the snapshot-driven parts of the page have no reason to wait on
     it — and its own pending/error state is instead threaded into every
     billing-driven figure below via `revenueStatus`. The fee rides on it
     too, so a figure priced at the fee says "…" until it lands. */
  const fee = billing?.fee_monthly ?? 0;

  const rows = React.useMemo(() => consoleRows(snapshot?.tenants ?? [], fee), [snapshot, fee]);
  const totals = React.useMemo(() => platformTotals(rows, fee), [rows, fee]);

  /* Money is what was invoiced; the counts beside it are what clinics are
     set up to pay, at today's fee. Two different questions, two sources. */
  const revenueStatus = billingStatus({ data: billing, isPending: billingPending, isError: billingIsError });
  const revenue = React.useMemo(
    () => (billing ? revenueTotals(billing) : null),
    [billing],
  );
  const series = React.useMemo(
    () => (billing ? revenueSeries(billing, 6) : []),
    [billing],
  );
  const recent = React.useMemo(
    () => (billing ? charges(billing).slice(0, 7) : []),
    [billing],
  );

  if (isPending) {
    return (
      <>
        <PageHeader eyebrow="Control centre" title="Astrale Platform" />
        <p className="py-16 text-center text-label text-ink-3">Reading the platform…</p>
      </>
    );
  }

  if (!rows.length) {
    return (
      <>
        <PageHeader
          eyebrow="Control centre"
          title="Astrale Platform"
          description="Nothing is running yet. A clinic is created here and nowhere else."
        />
        <Card>
          <EmptyState
            icon={<IconLayers size={20} />}
            title="No clinics on this platform"
            body="Creating one claims its subdomain, clones the field set for its discipline and invites its first administrator. It has every module from the start."
            action={
              <Button variant="primary" onClick={() => setCreating(true)}>
                <IconPlus size={15} /> Create the first clinic
              </Button>
            }
          />
        </Card>
        <CreateClinicFlow open={creating} onClose={() => setCreating(false)} />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Control centre"
        title="Astrale Platform"
        description="Every clinic on this deployment, what each one pays, and what the whole of it earns. Every clinic runs every module. This is the only view that reads across tenants — the API still gathers it one clinic at a time, with that clinic bound to the connection."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IconPlus size={15} /> Create clinic
          </Button>
        }
      />

      <HeroStats
        totals={totals} revenue={revenue} status={revenueStatus} series={series}
        currency={billing?.currency ?? "INR"}
      />
      <SecondaryStats totals={totals} revenue={revenue} status={revenueStatus} currency={billing?.currency ?? "INR"} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RunRateCard status={revenueStatus} series={series} currency={billing?.currency ?? "INR"} />
        <PlanCard rows={rows} fee={billing ? fee : null} currency={billing?.currency ?? "INR"} />
      </div>

      {/* Top-aligned rather than stretched: these two are lists of different
          lengths, and a healthy platform has four short attention rows next to
          a long activity feed — matching their heights just draws a tall empty
          box around the good news. */}
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <AttentionCard rows={rows} totals={totals} priced={!!billing} currency={billing?.currency ?? "INR"} />
        <RecentActivityCard status={revenueStatus} recent={recent} currency={billing?.currency ?? "INR"} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TopClinicsCard rows={rows} priced={!!billing} currency={billing?.currency ?? "INR"} />
        <DisciplineCard rows={rows} />
      </div>

      <CreateClinicFlow open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/* ---- the numbers ------------------------------------------------------------ */

/**
 * value/unit/hint for a figure driven by `usePlatformBilling()`, so every
 * stat that reads off it tells loading, error and never-billed apart the
 * same way instead of each growing its own copy of the three-way branch.
 */
function billingCell(
  status: BillingStatus,
  ready: () => { value: React.ReactNode; unit?: string; hint: string },
): { value: React.ReactNode; unit?: string; hint: string } {
  switch (status) {
    case "pending": return { value: "…", hint: "reading bills…" };
    case "error": return { value: "—", hint: "bills could not be read" };
    case "never-billed": return { value: "—", hint: "billing has not run yet" };
    case "billed": return ready();
  }
}

function HeroStats({
  totals, revenue, status, series, currency: currencyCode,
}: {
  totals: PlatformTotals;
  revenue: RevenueTotals | null;
  status: BillingStatus;
  series: RevenuePeriod[];
  currency: string;
}) {
  const trend = series.map((p) => p.billed);
  const previous = trend[trend.length - 2] ?? 0;
  const growth = revenue && previous > 0
    ? Math.round(((revenue.billed - previous) / previous) * 100)
    : undefined;

  const monthly = billingCell(status, () => ({
    value: rentMoney(revenue!.billed, currencyCode),
    unit: "/mo",
    hint: `billed for ${periodLabel(revenue!.period!)}`,
  }));

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Clinics" value={totals.tenants} icon={<IconLayers size={16} />}
        hint={`${totals.active} active · ${totals.trial} trial · ${totals.suspended} suspended`}
      />
      <Stat
        label="Monthly recurring"
        value={monthly.value}
        unit={monthly.unit}
        icon={<IconReceipt size={16} />}
        trend={status === "billed" && trend.some((v) => v > 0) ? trend : undefined}
        delta={status === "billed" ? growth : undefined}
        hint={monthly.hint}
      />
      <Stat
        label="Paying clinics" value={totals.billedTenants}
        icon={<IconSpark size={16} />}
        hint={`${totals.trial} on trial · ${totals.exempt} exempt`}
      />
      <Stat
        label="Needs attention" value={totals.suspended}
        tone={totals.suspended ? "critical" : "ink"}
        icon={<IconAlert size={16} />}
        hint={
          totals.suspended
            ? `${pluralise(totals.suspended, "clinic")} suspended`
            : "Every clinic is reachable"
        }
      />
    </section>
  );
}

function SecondaryStats({
  totals, revenue, status, currency: currencyCode,
}: {
  totals: PlatformTotals;
  revenue: RevenueTotals | null;
  status: BillingStatus;
  currency: string;
}) {
  const perClinic = billingCell(status, () => ({
    value: `${rentMoney(revenue!.arpa, currencyCode)}/mo`,
    hint: `${revenue!.clinics} of ${totals.tenants} billed`,
  }));

  const fee = billingCell(status === "pending" || status === "error" ? status : "billed", () => ({
    value: `${rentMoney(totals.fee, currencyCode)}/mo`,
    hint: "every module, every clinic",
  }));

  const cells: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    { label: "Patients", value: totals.patients.toLocaleString(), hint: "across every register" },
    { label: "Encounters", value: totals.encounters.toLocaleString(), hint: "consultations signed" },
    { label: "Staff accounts", value: totals.users.toLocaleString(), hint: "sign-ins that exist" },
    { label: "Modules", value: MODULES.length, hint: "in every clinic" },
    { label: "Subscription fee", value: fee.value, hint: fee.hint },
    { label: "Per billed clinic", value: perClinic.value, hint: perClinic.hint },
  ];

  return (
    <section className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-4 py-3.5">
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">{c.label}</p>
          <p className="tnum mt-1.5 font-display text-title font-semibold leading-none text-ink">
            {c.value}
          </p>
          {c.hint && <p className="mt-1.5 truncate text-micro text-ink-3">{c.hint}</p>}
        </div>
      ))}
    </section>
  );
}

/* ---- charts ----------------------------------------------------------------- */

function RunRateCard({
  status, series, currency: currencyCode,
}: {
  status: BillingStatus;
  series: RevenuePeriod[];
  currency: string;
}) {
  return (
    <Card>
      <CardHeader
        icon={<IconChart size={15} />} tone="ok" title="Monthly run rate"
        hint="What the billing run has raised, month by month."
      />
      <CardBody>
        {status === "pending" ? (
          <p className="py-16 text-center text-label text-ink-3">Reading bills…</p>
        ) : status === "error" ? (
          <p className="py-16 text-center text-label text-ink-3">Bills could not be read.</p>
        ) : series.some((p) => p.billed > 0) ? (
          <BarChart
            labels={series.map((p) => p.label)}
            series={[{ name: "Billed", values: series.map((p) => p.billed) }]}
            format={(n: number) => rentMoneyCompact(n, currencyCode)}
            highlight={series.length - 1}
            height={200}
          />
        ) : (
          <EmptyState
            icon={<IconReceipt size={20} />}
            title="Nothing is being billed yet"
            body="Run the billing cycle from the Bills tab and this fills in."
            compact
          />
        )}
      </CardBody>
    </Card>
  );
}

const PLAN_ORDER: AccountState[] = ["billed", "trial", "exempt", "held"];

/**
 * The one plan, and who is on which side of it. There is no catalogue to
 * adopt — every clinic has every module — so what is worth seeing is how
 * many clinics the fee applies to, and why it does not apply to the rest.
 */
function PlanCard({
  rows, fee, currency: currencyCode,
}: {
  rows: ConsoleRow[];
  /** null until the billing read has brought the fee */
  fee: number | null;
  currency: string;
}) {
  const { platformUser } = useApp();
  return (
    <Card>
      <CardHeader
        icon={<IconLayers size={15} />} tone="accent" title="One plan, every module"
        hint="Every clinic runs the whole product. Billed clinics pay one monthly fee."
        actions={
          /* the fee is a super admin's to set; the desk can read it here */
          isSuperAdmin(platformUser) && (
            <CardLink href="/platform/settings" trailing={<IconArrowRight size={13} />}>
              Set the fee
            </CardLink>
          )
        }
      />
      <CardBody>
        <p className="tnum font-display text-display font-semibold leading-none text-ink">
          {fee === null ? "…" : rentMoney(fee, currencyCode)}
          <span className="ml-1 text-label font-normal text-ink-3">/ clinic / month</span>
        </p>
        <ul className="mt-4 divide-y divide-line-soft border-y border-line-soft">
          {PLAN_ORDER.map((state) => (
            <li key={state}>
              <Link
                href={`/platform/tenants?billing=${state}`}
                className="flex items-center justify-between gap-3 py-2.5 text-label transition-colors hover:text-accent-text"
              >
                <AccountBadge state={state} />
                <span className="tnum font-mono text-ink-2">
                  {rows.filter((r) => r.state === state).length}
                  <span className="ml-1 text-ink-3">{state === "billed" ? "billed" : "not billed"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-caption leading-relaxed text-ink-3">
          {MODULES.map((m) => m.name).join(" · ")}
        </p>
      </CardBody>
    </Card>
  );
}

function DisciplineCard({ rows }: { rows: ConsoleRow[] }) {
  const slices = CLINICAL_TYPES.map((c, i) => ({
    label: c.label,
    value: rows.filter((r) => r.tenant.clinical_type === c.key).length,
    color: seriesColor(i),
  })).filter((s) => s.value > 0);

  return (
    <Card>
      <CardHeader icon={<IconChart size={15} />} tone="accent" title="By discipline" hint="What kind of practice runs on the platform." />
      <CardBody>
        <DonutChart
          slices={slices}
          centreValue={rows.length}
          centreLabel="clinics"
          size={150}
        />
      </CardBody>
    </Card>
  );
}

/* ---- attention -------------------------------------------------------------- */

interface AttentionItem {
  label: string;
  detail: string;
  count: number;
  tone: Tone;
  href: string;
}

/**
 * The four things worth doing something about, each a link into the tenant list
 * with the filters already set — an answer rather than a number to go and chase.
 */
function AttentionCard({
  rows, totals, priced, currency: currencyCode,
}: {
  rows: ConsoleRow[];
  totals: PlatformTotals;
  /** false until the fee has arrived — a figure priced at it would be a guess */
  priced: boolean;
  currency: string;
}) {
  const dormantClinics = rows.filter((r) => !r.last_activity).length;
  const money = (n: number) => (priced ? rentMoney(n, currencyCode) : "…");

  const items: AttentionItem[] = [
    {
      label: "Suspended clinics",
      detail: totals.suspended
        ? `${money(totals.heldValue)}/mo not collected while they are`
        : "Nothing is suspended",
      count: totals.suspended,
      tone: "critical",
      href: "/platform/tenants?status=suspended",
    },
    {
      label: "Trials running",
      detail: totals.trial
        ? `${money(totals.trialValue)}/mo if they all convert`
        : "Nothing is on trial",
      count: totals.trial,
      tone: "warn",
      href: "/platform/tenants?billing=trial",
    },
    {
      label: "Exempt from billing",
      detail: "Live, and never billed by the platform",
      count: totals.exempt,
      tone: "info",
      href: "/platform/tenants?billing=exempt",
    },
    {
      label: "Never used",
      detail: "Created, but nothing has happened inside them",
      count: dormantClinics,
      tone: "neutral",
      href: "/platform/tenants",
    },
  ];

  return (
    <Card className="overflow-hidden">
      <CardHeader
        tone="warn" icon={<IconAlert size={16} />}
        title="Needs attention"
        hint="Each one opens the tenant list with the filters already set."
      />
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-hover"
            >
              <div className="min-w-0">
                <p className="text-body font-medium text-ink">{item.label}</p>
                <p className="mt-0.5 truncate text-caption text-ink-3">{item.detail}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <Badge tone={item.count ? item.tone : "neutral"} size="md" dot={item.count > 0}>
                  {item.count}
                </Badge>
                <IconArrowRight size={14} className="text-ink-3" />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecentActivityCard({
  status, recent, currency: currencyCode,
}: {
  status: BillingStatus;
  recent: ChargeRow[];
  currency: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconReceipt size={15} />} tone="ok" title="Recent billing activity"
        hint="The latest charges the billing run has raised, newest first."
        actions={
          <CardLink href="/platform/billing?tab=activity" trailing={<IconArrowRight size={13} />}>
            All activity
          </CardLink>
        }
      />
      {status === "pending" ? (
        <p className="px-5 py-10 text-center text-label text-ink-3">Reading bills…</p>
      ) : status === "error" ? (
        <p className="px-5 py-10 text-center text-label text-ink-3">Bills could not be read.</p>
      ) : recent.length === 0 ? (
        <EmptyState
          icon={<IconSpark size={20} />}
          title="No charges yet"
          body="Nothing shows here until the billing run raises its first bill."
          compact
        />
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {recent.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Monogram name={row.tenant.name} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-label text-ink">
                    <Link
                      href={`/platform/tenants/${row.tenant.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.tenant.name}
                    </Link>
                    <span className="text-ink-3"> billed for </span>
                    {row.name}
                  </p>
                  <p className="tnum mt-0.5 font-mono text-caption text-ink-3">
                    {formatDate(row.date)} · {rentMoney(row.amount, currencyCode)}
                  </p>
                </div>
              </div>
              <Badge tone={row.status === "paid" ? "ok" : "warn"} size="sm">
                {row.status === "paid" ? "Paid" : "Open"}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---- top clinics ------------------------------------------------------------- */

function TopClinicsCard({
  rows, priced, currency: currencyCode,
}: {
  rows: ConsoleRow[];
  priced: boolean;
  currency: string;
}) {
  /* Every billed clinic pays the same fee, so size is how much they use it. */
  const top = [...rows].sort((a, b) => b.patients - a.patients || b.encounters - a.encounters).slice(0, 6);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconReceipt size={15} />} tone="ok" title="Largest accounts"
        hint="By how much they use the product — every billed clinic pays the same."
        actions={
          <Link
            href="/platform/tenants"
            className="inline-flex items-center gap-1 text-label text-accent-text underline-offset-4 hover:underline"
          >
            All tenants <IconArrowRight size={13} />
          </Link>
        }
      />
      <TableWrap>
        <Table className="min-w-[38rem]">
          <THead>
            <TR>
              <TH>Clinic</TH>
              <TH>Account</TH>
              <TH align="right">Patients</TH>
              <TH align="right">Monthly</TH>
            </TR>
          </THead>
          <TBody>
            {top.map((row) => (
              <TR key={row.tenant.id}>
                <TD>
                  <Link
                    href={`/platform/tenants/${row.tenant.id}`}
                    className="flex min-w-0 items-center gap-2.5"
                  >
                    <Monogram name={row.tenant.name} size={28} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink hover:underline">{row.tenant.name}</p>
                      <p className="tnum truncate font-mono text-caption text-ink-3">{row.tenant.slug}</p>
                    </div>
                  </Link>
                </TD>
                <TD><AccountBadge state={row.state} /></TD>
                <TD align="right">
                  <span className="tnum font-mono text-label text-ink-2">{row.patients.toLocaleString()}</span>
                </TD>
                <TD align="right">
                  <span className={cn("tnum font-mono text-label", row.mrr ? "text-ink" : "text-ink-3")}>
                    {!priced ? "…" : row.mrr ? rentMoney(row.mrr, currencyCode) : "—"}
                  </span>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
    </Card>
  );
}
