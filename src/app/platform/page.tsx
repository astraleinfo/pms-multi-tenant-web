"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/app-store";
import { usePlatformEntitlements, usePlatformSnapshot } from "@/lib/query/hooks";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import {
  TODAY, compactCurrency, currency, formatDate,
} from "@/lib/format";
import {
  PAID_FEATURES, activationLedger, consoleRows, moduleStats, mrrSeries, platformToday,
  platformTotals,
  type ConsoleRow, type PlatformTotals,
} from "@/lib/platform/subscriptions";
import { cn } from "@/lib/cn";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState, Meter } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { BarChart } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { seriesColor } from "@/components/charts/chart-kit";
import { Monogram } from "@/components/layout/rail";
import { ConsolePage } from "@/components/platform/chrome";
import { CreateClinicFlow } from "@/components/platform/create-clinic";
import { AccountBadge, BillingBadge } from "@/components/platform/module-controls";
import {
  IconAlert, IconArrowRight, IconLayers, IconPlus, IconReceipt, IconSpark,
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
  const { host } = useApp();
  const { data: snapshot, isPending } = usePlatformSnapshot();
  const { byTenant } = usePlatformEntitlements();
  const [creating, setCreating] = React.useState(false);

  const rows = React.useMemo(
    () => consoleRows(snapshot?.tenants ?? [], byTenant),
    [snapshot, byTenant],
  );
  const totals = React.useMemo(() => platformTotals(rows), [rows]);
  const stats = React.useMemo(
    () => moduleStats(rows).filter((s) => !s.feature.is_core),
    [rows],
  );

  const today = React.useMemo(() => platformToday(rows, TODAY), [rows]);
  const series = React.useMemo(() => mrrSeries(rows, today, 6), [rows, today]);
  const recent = React.useMemo(() => activationLedger(rows).slice(0, 7), [rows]);

  if (isPending) {
    return (
      <>
        <PageHeader eyebrow="Control centre" title="Astrale Platform" />
        <p className="py-16 text-center text-[0.8125rem] text-ink-3">Reading the platform…</p>
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
            body="Creating one claims its subdomain, seeds the five core modules, clones the field set for its discipline and invites its first administrator."
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
        description="Every clinic on this deployment, what each one holds, and what the whole of it earns. This is the only view that reads across tenants — the API still gathers it one clinic at a time, with that clinic bound to the connection."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <IconPlus size={15} /> Create clinic
          </Button>
        }
      />

      <HeroStats totals={totals} series={series} />
      <SecondaryStats totals={totals} />

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <RunRateCard series={series} totals={totals} />
        <ModuleAdoptionCard stats={stats} tenants={rows.length} />
      </div>

      {/* Top-aligned rather than stretched: these two are lists of different
          lengths, and a healthy platform has four short attention rows next to
          a long activity feed — matching their heights just draws a tall empty
          box around the good news. */}
      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-2">
        <AttentionCard rows={rows} totals={totals} />
        <RecentActivityCard recent={recent} />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <TopClinicsCard rows={rows} />
        <DisciplineCard rows={rows} />
      </div>

      <div className="mt-5 max-w-3xl space-y-2 text-[0.75rem] leading-relaxed text-ink-3">
        <p>
          Money figures are the catalogue price of what is switched on, not invoices — the platform
          has no billing service behind it yet, so every subscription figure here is worked out from
          the entitlement rows and the module prices. When real invoices arrive they replace that
          arithmetic and these screens keep their shape.
        </p>
        {host.root === "localhost" && (
          <p className="rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2 text-warn-text">
            Local development note: a console session is not a clinic session. Opening a clinic from
            here lands you on its sign-in screen unless you go in as support — platform staff have no
            account inside any clinic, and the API refuses a console token at a clinic address.
          </p>
        )}
      </div>

      <CreateClinicFlow open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

/* ---- the numbers ------------------------------------------------------------ */

function HeroStats({ totals, series }: { totals: PlatformTotals; series: ReturnType<typeof mrrSeries> }) {
  const trend = series.map((p) => p.mrr);
  const previous = trend[trend.length - 2] ?? 0;
  const growth = previous > 0 ? Math.round(((totals.mrr - previous) / previous) * 100) : undefined;

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Stat
        label="Clinics" value={totals.tenants} icon={<IconLayers size={16} />}
        hint={`${totals.active} active · ${totals.trial} trial · ${totals.suspended} suspended`}
      />
      <Stat
        label="Monthly recurring" value={currency(totals.mrr)} unit="/mo"
        icon={<IconReceipt size={16} />}
        trend={trend.some((v) => v > 0) ? trend : undefined}
        delta={growth}
        hint={`${currency(totals.arr)} annualised`}
      />
      <Stat
        label="Live subscriptions" value={totals.billedSubscriptions}
        icon={<IconSpark size={16} />}
        hint={`${totals.trialSubscriptions} on trial · ${totals.lockedModules} still locked`}
      />
      <Stat
        label="Needs attention" value={totals.suspended + totals.heldSubscriptions}
        tone={totals.suspended || totals.heldSubscriptions ? "critical" : "ink"}
        icon={<IconAlert size={16} />}
        hint={
          totals.suspended
            ? `${currency(totals.heldValue)}/mo held behind suspended clinics`
            : "Every clinic is reachable and billing"
        }
      />
    </section>
  );
}

function SecondaryStats({ totals }: { totals: PlatformTotals }) {
  const cells: Array<{ label: string; value: React.ReactNode; hint?: string }> = [
    { label: "Patients", value: totals.patients.toLocaleString(), hint: "across every register" },
    { label: "Encounters", value: totals.encounters.toLocaleString(), hint: "consultations signed" },
    { label: "Staff accounts", value: totals.users.toLocaleString(), hint: "sign-ins that exist" },
    { label: "Modules enabled", value: totals.enabledModules, hint: "core and paid, every clinic" },
    { label: "Modules locked", value: totals.lockedModules, hint: "paid, not yet sold" },
    { label: "Per paying clinic", value: `${currency(totals.arpa)}/mo`, hint: `${totals.payingTenants} of ${totals.tenants} pay` },
  ];

  return (
    <section className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-[var(--r-lg)] border border-line bg-line sm:grid-cols-3 xl:grid-cols-6">
      {cells.map((c) => (
        <div key={c.label} className="bg-surface px-4 py-3.5">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{c.label}</p>
          <p className="tnum mt-1.5 font-display text-[1.125rem] font-semibold leading-none tracking-[-0.02em] text-ink">
            {c.value}
          </p>
          {c.hint && <p className="mt-1.5 truncate text-[0.6875rem] text-ink-3">{c.hint}</p>}
        </div>
      ))}
    </section>
  );
}

/* ---- charts ----------------------------------------------------------------- */

function RunRateCard({
  series, totals,
}: {
  series: ReturnType<typeof mrrSeries>;
  totals: PlatformTotals;
}) {
  return (
    <Card>
      <CardHeader
        title="Monthly run rate"
        subtitle="Rebuilt from the day each live subscription was switched on."
        actions={
          <Link
            href="/platform/modules"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text underline-offset-4 hover:underline"
          >
            Billing activity <IconArrowRight size={13} />
          </Link>
        }
      />
      <CardBody>
        {series.some((p) => p.mrr > 0) ? (
          <>
            <BarChart
              labels={series.map((p) => p.label)}
              series={[{ name: "Run rate", values: series.map((p) => p.mrr) }]}
              format={compactCurrency}
              highlight={series.length - 1}
              height={200}
            />
            <div className="mt-4 grid grid-cols-3 gap-4 border-t border-line-soft pt-3.5">
              <Figure label="Billed now" value={`${currency(totals.mrr)}/mo`} />
              <Figure label="In trial" value={`${currency(totals.trialValue)}/mo`}
                      tone={totals.trialValue ? "warn" : "ink"} />
              <Figure label="Held" value={`${currency(totals.heldValue)}/mo`} tone={totals.heldValue ? "critical" : "ink"} />
            </div>
          </>
        ) : (
          <EmptyState
            icon={<IconReceipt size={20} />}
            title="Nothing is being billed yet"
            body="Switch a paid module on for a clinic and it starts counting from that day."
            compact
          />
        )}
      </CardBody>
    </Card>
  );
}

/**
 * A figure under a chart. It wears ink unless the number is one somebody has to
 * do something about — there is no "good" colour here, because money arriving
 * as expected is the boring case and does not need to shout.
 */
function Figure({
  label, value, tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "warn" | "critical";
}) {
  const colour = {
    ink: "text-ink", warn: "text-warn-text", critical: "text-critical-text",
  }[tone];
  return (
    <div className="min-w-0">
      <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{label}</p>
      <p className={cn("tnum mt-1 truncate font-mono text-[0.875rem] font-medium", colour)}>{value}</p>
    </div>
  );
}

function ModuleAdoptionCard({
  stats, tenants,
}: {
  stats: ReturnType<typeof moduleStats>;
  tenants: number;
}) {
  return (
    <Card>
      <CardHeader
        title="Module adoption"
        subtitle="Paid modules, by the clinics holding them."
        actions={
          <Link
            href="/platform/modules"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text underline-offset-4 hover:underline"
          >
            Manage <IconArrowRight size={13} />
          </Link>
        }
      />
      <CardBody>
        <ul className="space-y-3.5">
          {[...stats].sort((a, b) => b.subscribers - a.subscribers).map((s) => (
            <li key={s.feature.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <Link
                  href={`/platform/tenants?module=${s.feature.key}&moduleState=enabled`}
                  className="truncate text-[0.8125rem] text-ink underline-offset-4 hover:underline"
                >
                  {s.feature.name}
                </Link>
                <span className="tnum shrink-0 font-mono text-[0.75rem] text-ink-2">
                  {s.subscribers}/{tenants}
                  <span className="ml-1.5 text-ink-3">{currency(s.feature.price_monthly)}</span>
                </span>
              </div>
              <Meter value={s.subscribers} max={Math.max(1, tenants)} tone="accent" height={5} />
            </li>
          ))}
        </ul>
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
      <CardHeader title="By discipline" subtitle="What kind of practice runs on the platform." />
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
function AttentionCard({ rows, totals }: { rows: ConsoleRow[]; totals: PlatformTotals }) {
  const dormantClinics = rows.filter((r) => !r.last_activity).length;

  const items: AttentionItem[] = [
    {
      label: "Suspended clinics",
      detail: totals.heldValue
        ? `${currency(totals.heldValue)}/mo of modules held behind them`
        : "No subscriptions held behind them",
      count: totals.suspended,
      tone: "critical",
      href: "/platform/tenants?status=suspended",
    },
    {
      label: "Trials running",
      detail: totals.trialValue
        ? `${currency(totals.trialValue)}/mo if they all convert`
        : "Nothing is on trial",
      count: totals.trialSubscriptions,
      tone: "warn",
      href: "/platform/tenants?billing=trial",
    },
    {
      label: "Clinics on core only",
      detail: "Live, and paying for nothing",
      count: rows.filter((r) => r.state === "core_only").length,
      tone: "info",
      href: "/platform/tenants?billing=core_only",
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
        icon={<IconAlert size={16} />}
        title="Needs attention"
        subtitle="Each one opens the tenant list with the filters already set."
      />
      <ul className="divide-y divide-line-soft border-t border-line-soft">
        {items.map((item) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="flex items-center justify-between gap-4 px-5 py-3.5 transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0">
                <p className="text-[0.875rem] font-medium text-ink">{item.label}</p>
                <p className="mt-0.5 truncate text-[0.75rem] text-ink-3">{item.detail}</p>
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

function RecentActivityCard({ recent }: { recent: ReturnType<typeof activationLedger> }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Recent subscription activity"
        subtitle="The latest paid modules switched on, newest first."
        actions={
          <Link
            href="/platform/modules"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text underline-offset-4 hover:underline"
          >
            All activity <IconArrowRight size={13} />
          </Link>
        }
      />
      {recent.length === 0 ? (
        <EmptyState
          icon={<IconSpark size={20} />}
          title="No subscriptions yet"
          body="Paid modules stay off until the platform switches one on for a clinic."
          compact
        />
      ) : (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {recent.map((entry) => (
            <li key={entry.id} className="flex items-center justify-between gap-4 px-5 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <Monogram name={entry.tenant.name} size={28} />
                <div className="min-w-0">
                  <p className="truncate text-[0.8438rem] text-ink">
                    <Link
                      href={`/platform/tenants/${entry.tenant.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {entry.tenant.name}
                    </Link>
                    <span className="text-ink-3"> took </span>
                    {entry.feature.name}
                  </p>
                  <p className="tnum mt-0.5 font-mono text-[0.75rem] text-ink-3">
                    {formatDate(entry.date)} · {currency(entry.amount)}/mo
                  </p>
                </div>
              </div>
              <BillingBadge state={entry.state} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---- top clinics ------------------------------------------------------------- */

function TopClinicsCard({ rows }: { rows: ConsoleRow[] }) {
  const top = [...rows].sort((a, b) => b.mrr - a.mrr || b.patients - a.patients).slice(0, 6);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        title="Largest accounts"
        subtitle="By what they pay the platform, then by how much they use it."
        actions={
          <Link
            href="/platform/tenants"
            className="inline-flex items-center gap-1 text-[0.8125rem] text-accent-text underline-offset-4 hover:underline"
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
              <TH>Modules</TH>
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
                      <p className="tnum truncate font-mono text-[0.75rem] text-ink-3">{row.tenant.slug}</p>
                    </div>
                  </Link>
                </TD>
                <TD><AccountBadge state={row.state} /></TD>
                <TD>
                  <span className="tnum font-mono text-[0.8125rem] text-ink-2">
                    {row.billed.length + row.trialing.length + row.held.length} of {PAID_FEATURES.length}
                  </span>
                </TD>
                <TD align="right">
                  <span className={cn("tnum font-mono text-[0.8125rem]", row.mrr ? "text-ink" : "text-ink-3")}>
                    {row.mrr ? `${currency(row.mrr)}` : "—"}
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
