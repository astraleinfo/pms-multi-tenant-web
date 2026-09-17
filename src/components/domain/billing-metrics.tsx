"use client";

/* ==========================================================================
   The console's billing metrics.

   Every figure here is computed by the server, one clinic at a time, and this
   file renders them. That is a deliberate change from what the console used to
   do: it added its MRR up in the browser from a feature catalogue, which was
   fine until the day a plan bundled a module or discounted one — at which
   point the number on this screen and the number on the invoices would quietly
   stop agreeing, and the invoices would be right.

   The filter bar is split for the same reason the API splits it:

   *   **stock** figures — MRR, subscription counts, outstanding invoices —
       describe *now* and ignore the dates. "MRR between March and April" is
       not a question with an answer, so the screen does not pretend it is;
   *   **movement** figures — revenue, refunds, payments, new and cancelled
       subscriptions — describe the window.

   The tiles say which they are, because a reader who does not know is worse
   off than one who has no filter at all.
   ========================================================================== */

import * as React from "react";
import { useBillingMetrics } from "@/lib/query/billing";
import { compactCurrency, currency, formatDate, pluralise, titleCase } from "@/lib/format";
import type { BillingMetricsFilter, SubscriptionStatus } from "@/lib/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, Meter, Skeleton } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  IconAlert, IconCard, IconChart, IconLayers, IconReceipt, IconRefresh, IconSpark, IconUsers,
} from "@/components/ui/icons";

const STATUS_TONE: Record<string, Tone> = {
  active: "ok", trialing: "info", past_due: "critical",
  paused: "neutral", cancelled: "neutral", expired: "neutral", pending: "warn",
};

/** How many payments were tried in the window, successful or not. */
const attempted = (m: { payments_successful: number; payments_failed: number }) =>
  m.payments_successful + m.payments_failed;

/** Sensible default window: the last thirty days, ending today. */
function defaultWindow() {
  const end = new Date();
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export function BillingMetricsConsole() {
  const [filter, setFilter] = React.useState<BillingMetricsFilter>(() => defaultWindow());
  const { data, isPending, isError, refetch, isFetching } = useBillingMetrics(filter);

  const set = <K extends keyof BillingMetricsFilter>(key: K, value: BillingMetricsFilter[K]) =>
    setFilter((f) => ({ ...f, [key]: value || undefined }));

  if (isError) {
    return (
      <Card className="mt-5">
        <EmptyState
          icon={<IconAlert size={20} />}
          title="The billing figures could not be read"
          body="Nothing has changed — this screen only reads."
          action={<Button variant="secondary" onClick={() => void refetch()}><IconRefresh size={15} /> Try again</Button>}
        />
      </Card>
    );
  }

  const modules = data?.addons ?? [];
  const topAdoption = Math.max(1, ...modules.map((m) => m.active_tenants));

  return (
    <div className="mt-5 space-y-5">
      {/* ---- filters ---- */}
      <Card>
        <CardHeader
          icon={<IconChart size={16} />}
          title="Filters"
          subtitle="Dates bound the movement figures only. MRR, subscription counts and outstanding invoices describe the present whatever window is chosen."
          actions={
            <Button size="sm" variant="ghost" onClick={() => setFilter(defaultWindow())}>
              <IconRefresh size={14} /> Reset
            </Button>
          }
        />
        <CardBody className="pt-0">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="From">
              <Input type="date" value={filter.start ?? ""} onChange={(e) => set("start", e.target.value)} />
            </Field>
            <Field label="To">
              <Input type="date" value={filter.end ?? ""} onChange={(e) => set("end", e.target.value)} />
            </Field>
            <Field label="Clinic">
              <Select
                value={filter.tenant_id ?? ""}
                onChange={(e) => set("tenant_id", e.target.value)}
              >
                <option value="">Every clinic</option>
                {(data?.tenants ?? []).map((t) => (
                  <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Module">
              <Select
                value={filter.feature_key ?? ""}
                onChange={(e) => set("feature_key", e.target.value as BillingMetricsFilter["feature_key"])}
              >
                <option value="">Every module</option>
                {modules.map((m) => (
                  <option key={m.feature_key} value={m.feature_key}>{m.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Subscription">
              <Select
                value={filter.subscription_status ?? ""}
                onChange={(e) => set("subscription_status", e.target.value as SubscriptionStatus)}
              >
                <option value="">Any status</option>
                {["active", "trialing", "past_due", "paused", "cancelled", "expired", "pending"].map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Field label="Payment status">
              <Select
                value={filter.payment_status ?? ""}
                onChange={(e) => set("payment_status", e.target.value as BillingMetricsFilter["payment_status"])}
              >
                <option value="">Any payment</option>
                {["captured", "failed", "refunded", "partially_refunded", "created", "authorised"].map((s) => (
                  <option key={s} value={s}>{titleCase(s)}</option>
                ))}
              </Select>
            </Field>
          </div>
        </CardBody>
      </Card>

      {/* ---- money ---- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="MRR"
          value={data ? currency(data.mrr) : null}
          pending={isPending}
          tone="ok"
          icon={<IconSpark size={16} />}
          hint={data ? `${currency(data.arr)} a year at today's plans` : undefined}
          scope="now"
        />
        <MetricTile
          label="Revenue collected"
          value={data ? currency(data.revenue) : null}
          pending={isPending}
          icon={<IconCard size={16} />}
          hint={data ? `Net ${currency(data.net_revenue)} after ${currency(data.refunded)} refunded` : undefined}
          scope="window"
        />
        <MetricTile
          label="Outstanding"
          value={data ? currency(data.outstanding_total) : null}
          pending={isPending}
          tone={data && data.outstanding_total > 0 ? "warn" : "ok"}
          icon={<IconReceipt size={16} />}
          hint={data ? `${pluralise(data.invoices_outstanding, "invoice")} unpaid` : undefined}
          scope="now"
        />
        {/* A success rate with no attempts behind it is not 0% — it is nothing,
            and printing 0% would read as "every payment failed". */}
        <MetricTile
          label="Payments taken"
          value={
            data
              ? attempted(data) === 0
                ? "—"
                : `${Math.round(data.payment_success_rate * 100)}%`
              : null
          }
          pending={isPending}
          tone={data && attempted(data) > 0 && data.payment_success_rate < 0.9 ? "warn" : "ok"}
          icon={<IconChart size={16} />}
          hint={
            data
              ? attempted(data) === 0
                ? "No payments attempted in this window"
                : `${data.payments_successful} succeeded · ${data.payments_failed} failed`
              : undefined
          }
          scope="window"
        />
      </section>

      {/* ---- subscriptions ---- */}
      <Card>
        <CardHeader
          icon={<IconUsers size={16} />}
          title="Subscriptions"
          subtitle="Where every clinic stands, and what moved inside the window."
        />
        <CardBody className="pt-0">
          {isPending || !data ? (
            <Skeleton className="h-20 w-full rounded-[var(--r)]" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
              <Count label="Active" value={data.subscriptions_active} tone="ok" scope="now" />
              <Count label="Trialing" value={data.subscriptions_trialing} tone="info" scope="now" />
              <Count label="Past due" value={data.subscriptions_past_due} tone={data.subscriptions_past_due ? "critical" : "neutral"} scope="now" />
              <Count label="Paused" value={data.subscriptions_paused} tone="neutral" scope="now" />
              <Count label="Cancelling" value={data.cancellations_scheduled} tone={data.cancellations_scheduled ? "warn" : "neutral"} scope="now" />
              <Count label="New" value={data.subscriptions_new} tone="accent" scope="window" />
              <Count label="Cancelled" value={data.subscriptions_cancelled} tone="neutral" scope="window" />
            </div>
          )}
          {data && data.subscriptions_past_due > 0 && (
            <p className="mt-3 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2 text-[0.8125rem] leading-relaxed text-warn-text">
              {pluralise(data.subscriptions_past_due, "clinic")} past due. Nothing has been switched off —
              suspending a practice takes away its access to its own patient records, so it stays a decision
              somebody makes rather than something the billing run does.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ---- add-on adoption ---- */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<IconLayers size={16} />}
          title="Module adoption"
          subtitle="How many practices have each module, and what it earns. Adoption and revenue are different questions — a cheap module everyone buys and an expensive one nobody does look identical on one of them."
        />
        {isPending ? (
          <CardBody className="pt-0"><Skeleton className="h-40 w-full rounded-[var(--r)]" /></CardBody>
        ) : modules.length === 0 ? (
          <EmptyState compact icon={<IconLayers size={20} />} title="No modules in the catalogue" />
        ) : (
          <TableWrap>
            <Table className="min-w-[44rem]">
              <THead>
                <TR>
                  <TH>Module</TH>
                  <TH>Practices</TH>
                  <TH align="right">Of which ending</TH>
                  <TH align="right">MRR</TH>
                  <TH align="right">Billed in window</TH>
                </TR>
              </THead>
              <TBody>
                {modules.map((m) => (
                  <TR key={m.feature_key}>
                    <TD><span className="font-medium text-ink">{m.name}</span></TD>
                    <TD>
                      <div className="flex items-center gap-2.5">
                        <span className="tnum w-6 text-right text-ink">{m.active_tenants}</span>
                        <Meter value={m.active_tenants} max={topAdoption} className="w-28" height={5} />
                      </div>
                    </TD>
                    <TD align="right">
                      {m.cancelling > 0
                        ? <Badge tone="warn" size="sm">{m.cancelling}</Badge>
                        : <span className="text-ink-3">—</span>}
                    </TD>
                    <TD align="right"><span className="tnum">{currency(m.monthly_revenue)}</span></TD>
                    <TD align="right"><span className="tnum text-ink-2">{currency(m.billed_in_window)}</span></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      {/* ---- per clinic ---- */}
      <Card className="overflow-hidden">
        <CardHeader
          icon={<IconUsers size={16} />}
          title="By practice"
          subtitle="Read one clinic at a time, with that clinic bound — the console is a privileged view, not a privileged query."
          actions={isFetching && !isPending ? <span className="text-[0.75rem] text-ink-3">Refreshing…</span> : undefined}
        />
        {isPending ? (
          <CardBody className="pt-0"><Skeleton className="h-48 w-full rounded-[var(--r)]" /></CardBody>
        ) : (data?.tenants.length ?? 0) === 0 ? (
          <EmptyState
            compact
            icon={<IconUsers size={20} />}
            title="No practice matches"
            body="Every clinic with a subscription appears here. One that has never subscribed is not counted — it is not a zero in the average, it is outside the population."
          />
        ) : (
          <TableWrap>
            <Table className="min-w-[52rem]">
              <THead>
                <TR>
                  <TH>Practice</TH>
                  <TH>Plan</TH>
                  <TH>Status</TH>
                  <TH align="right">Modules</TH>
                  <TH align="right">MRR</TH>
                  <TH align="right">Collected</TH>
                  <TH align="right">Outstanding</TH>
                </TR>
              </THead>
              <TBody>
                {(data?.tenants ?? []).map((t) => (
                  <TR key={t.tenant_id}>
                    <TD>
                      <span className="font-medium text-ink">{t.name}</span>
                      <span className="tnum block font-mono text-[0.75rem] text-ink-3">{t.slug}</span>
                    </TD>
                    <TD><span className="text-ink-2">{t.plan || "—"}</span></TD>
                    <TD>
                      <Badge tone={STATUS_TONE[t.subscription_status] ?? "neutral"} size="sm" dot>
                        {titleCase(t.subscription_status || "none")}
                      </Badge>
                    </TD>
                    <TD align="right"><span className="tnum text-ink-2">{t.active_addons}</span></TD>
                    <TD align="right"><span className="tnum">{currency(t.mrr)}</span></TD>
                    <TD align="right"><span className="tnum text-ink-2">{compactCurrency(t.revenue)}</span></TD>
                    <TD align="right">
                      <span className={t.outstanding > 0 ? "tnum text-critical-text" : "tnum text-ink-3"}>
                        {currency(t.outstanding)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <p className="max-w-3xl text-[0.75rem] leading-relaxed text-ink-3">
        {data ? `${pluralise(data.invoices_issued, "invoice")} issued in this window, ${data.invoices_paid} paid. ` : ""}
        Every figure is the server&rsquo;s arithmetic over the invoices it raised — none of it is added up in
        this browser, so the console and the invoices cannot disagree.
        {filter.start && filter.end && ` Window: ${formatDate(filter.start, "long")} – ${formatDate(filter.end, "long")}.`}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** A stat tile that says whether it is describing now or the window. */
function MetricTile({
  label, value, hint, tone, icon, pending, scope,
}: {
  label: string;
  value: string | null;
  hint?: string;
  tone?: "ink" | "ok" | "warn" | "critical" | "accent";
  icon?: React.ReactNode;
  pending: boolean;
  scope: "now" | "window";
}) {
  if (pending || value == null) return <Skeleton className="h-[7.5rem] rounded-[var(--r-lg)]" />;
  return (
    <Stat
      label={
        <span className="flex items-center gap-1.5">
          {label}
          <span className="rounded-[var(--r-pill)] bg-surface-3 px-1.5 py-px text-[0.5625rem] font-semibold uppercase tracking-[0.08em] text-ink-3">
            {scope === "now" ? "now" : "window"}
          </span>
        </span>
      }
      value={value}
      tone={tone}
      icon={icon}
      hint={hint}
    />
  );
}

function Count({
  label, value, tone, scope,
}: {
  label: string;
  value: number;
  tone: Tone;
  scope: "now" | "window";
}) {
  return (
    <div className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-ink-3">
        {label}
        <span className="text-[0.5625rem] font-medium normal-case tracking-normal text-ink-3/70">
          {scope === "now" ? "now" : "in window"}
        </span>
      </p>
      <p className="tnum mt-1 font-display text-[1.25rem] font-semibold tracking-[-0.02em] text-ink">
        {value}
      </p>
      <span className={`mt-1.5 inline-block h-1 w-8 rounded-full ${
        { ok: "bg-ok", warn: "bg-warn", critical: "bg-critical", info: "bg-info",
          accent: "bg-accent", neutral: "bg-neutral" }[tone]
      }`} />
    </div>
  );
}
