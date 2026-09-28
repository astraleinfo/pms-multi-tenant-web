"use client";

import * as React from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useSubscription, useSupportInfo } from "@/lib/query/hooks";
import { formatDate } from "@/lib/format";
import { openPdfBlob } from "@/lib/pdf";
import { cn } from "@/lib/cn";
import type { Subscription, SubscriptionInvoice } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/misc";
import {
  IconAlert, IconClock, IconDownload, IconLock, IconLogout, IconMail, IconReceipt,
} from "@/components/ui/icons";

/* ==========================================================================
   What the clinic owes the platform.

   Three places show it: the bills tab in Settings, a banner across the top
   when a bill is close to its due date, and — if it goes unpaid past the
   grace period — the whole screen, because at that point it is the only thing
   the clinic can do here. All three read the same `/tenant/subscription`.
   ========================================================================== */

/** The platform bills in its own currency, which is not necessarily the clinic's. */
export const rentMoney = (amount: number, code: string) =>
  new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-GB", {
    style: "currency", currency: code || "INR", maximumFractionDigits: 2,
  }).format(amount);

/**
 * Same currency, shortened — for a chart axis or any other spot with a
 * fixed, narrow gutter that a full figure like "₹21,592.00" would overflow.
 * Below a thousand the full figure is already short, so it's left whole.
 */
export const rentMoneyCompact = (amount: number, code: string) =>
  Math.abs(amount) < 1000
    ? new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-GB", {
        style: "currency", currency: code || "INR", maximumFractionDigits: 0,
      }).format(amount)
    : new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-GB", {
        style: "currency", currency: code || "INR", notation: "compact", maximumFractionDigits: 1,
      }).format(amount);

const STATUS: Record<SubscriptionInvoice["status"], { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "warn" },
  paid: { label: "Paid", tone: "ok" },
  void: { label: "Void", tone: "neutral" },
};

function billState(bill: SubscriptionInvoice, today: string) {
  if (bill.status !== "open") return STATUS[bill.status];
  if (today >= bill.hold_on) return { label: "Holding the clinic", tone: "critical" as Tone };
  if (today > bill.due_on) return { label: "Overdue", tone: "critical" as Tone };
  return STATUS.open;
}

export function useBillPdf() {
  const { notify } = useApp();
  const [busy, setBusy] = React.useState<string | null>(null);
  const open = async (bill: SubscriptionInvoice) => {
    setBusy(bill.id);
    try {
      openPdfBlob(await api.getSubscriptionBillPdf(bill.id));
    } catch {
      notify({ tone: "warn", title: "Could not open the bill", body: "Try again in a moment." });
    } finally {
      setBusy(null);
    }
  };
  return { open, busy };
}

/** Every bill, newest first. */
/**
 * What the clinic has switched on, and what that comes to a month.
 *
 * Every module is listed, core and trial included, so "what do we have" and
 * "what do we pay" are one read. The price column is the catalogue's today;
 * the last column says whether the next bill charges for it, and the total is
 * the server's sum of exactly those — the same rule the bill is raised by.
 */
export function SubscriptionPlan({ subscription }: { subscription: Subscription }) {
  const plan = subscription.plan;
  const code = subscription.summary.currency;
  if (!plan || !plan.modules.length) {
    return (
      <EmptyState
        icon={<IconReceipt size={20} />}
        title="No modules switched on"
        body="Modules are switched on for this clinic by the Astrale team."
        compact
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Module</TH>
            <TH>Since</TH>
            <TH align="right">Price / month</TH>
            <TH align="right">On the bill</TH>
          </TR>
        </THead>
        <TBody>
          {plan.modules.map((m) => (
            <TR key={m.feature_key}>
              <TD>
                <span className="flex items-center gap-2">
                  <span className="text-label font-medium text-ink">{m.name}</span>
                  {m.is_core && <Badge tone="neutral" size="sm">Core</Badge>}
                  {m.status === "trial" && <Badge tone="info" size="sm">Trial</Badge>}
                </span>
              </TD>
              <TD>
                <span className="tnum text-label text-ink-2">
                  {m.activated_at ? formatDate(m.activated_at) : "—"}
                </span>
              </TD>
              <TD align="right">
                <span className="tnum font-mono text-label text-ink">
                  {m.is_core ? "Included" : rentMoney(m.price_monthly, code)}
                </span>
              </TD>
              <TD align="right">
                {m.billed ? (
                  <Badge tone="ok" size="sm" dot>Billed</Badge>
                ) : (
                  <span className="text-caption text-ink-3">
                    {m.is_core ? "Free" : m.status === "trial" ? "Not during trial" : subscription.summary.exempt ? "Exempt" : "Free"}
                  </span>
                )}
              </TD>
            </TR>
          ))}
        </TBody>
        <tfoot>
          <tr className="border-t border-line bg-surface-2">
            <td colSpan={2} className="px-4 py-3 text-label font-semibold text-ink">
              Monthly total
              <span className="ml-2 font-normal text-caption text-ink-3">
                {plan.modules.filter((m) => m.billed).length} billed of {plan.modules.length} on
              </span>
            </td>
            <td colSpan={2} className="px-4 py-3 text-right">
              <span className="tnum font-mono text-body font-semibold text-ink">{rentMoney(plan.monthly_total, code)}</span>
            </td>
          </tr>
        </tfoot>
      </Table>
    </TableWrap>
  );
}

export function SubscriptionBills({
  subscription, today, compact = false,
}: {
  subscription: Subscription;
  today: string;
  compact?: boolean;
}) {
  const pdf = useBillPdf();
  const bills = subscription.invoices;

  if (!bills.length) {
    return (
      <EmptyState
        icon={<IconReceipt size={20} />}
        title="No bills yet"
        body="A bill is raised at the start of each month for the paid modules switched on for this clinic."
        compact
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Bill</TH>
            <TH>Period</TH>
            {!compact && <TH>Modules</TH>}
            <TH>Due</TH>
            <TH>Status</TH>
            <TH align="right">Amount</TH>
            <TH align="right"><span className="sr-only">PDF</span></TH>
          </TR>
        </THead>
        <TBody>
          {bills.map((bill) => {
            const state = billState(bill, today);
            return (
              <TR key={bill.id}>
                <TD><span className="tnum font-mono text-label text-ink">{bill.number}</span></TD>
                <TD>
                  <span className="text-ink-2">
                    {new Date(`${bill.period_start}T00:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                  </span>
                </TD>
                {!compact && (
                  <TD>
                    <span className="text-caption text-ink-3">
                      {bill.lines.map((l) => l.name).join(", ")}
                    </span>
                  </TD>
                )}
                <TD><span className="tnum text-ink-2">{formatDate(bill.due_on)}</span></TD>
                <TD>
                  <Badge tone={state.tone} size="sm" dot={bill.status === "open"}>{state.label}</Badge>
                  {bill.status === "paid" && bill.payment_reference && (
                    <span className="mt-0.5 block text-micro text-ink-3">Ref {bill.payment_reference}</span>
                  )}
                </TD>
                <TD align="right">
                  <span className="tnum font-mono text-label font-medium text-ink">
                    {rentMoney(bill.amount, bill.currency)}
                  </span>
                </TD>
                <TD align="right">
                  <Button
                    variant="ghost" size="sm" disabled={pdf.busy === bill.id}
                    onClick={() => { void pdf.open(bill); }}
                    aria-label={`Download bill ${bill.number}`}
                  >
                    <IconDownload size={14} /> {pdf.busy === bill.id ? "…" : "PDF"}
                  </Button>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </TableWrap>
  );
}

/** How to pay — there is no gateway, so this is the honest answer. */
export function HowToPay({ className }: { className?: string }) {
  const { data: support } = useSupportInfo();
  const supportEmail = support?.support_email ?? "";
  const supportPhone = support?.support_phone ?? "";

  return (
    <div className={cn("rounded-[var(--r)] border border-line bg-surface-2 px-4 py-3", className)}>
      <p className="text-label font-medium text-ink">How to pay</p>
      <p className="mt-1 text-caption leading-relaxed text-ink-2">
        Pay by bank transfer or UPI quoting the bill number, then send the payment reference to{" "}
        <a href={`mailto:${supportEmail}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
          {supportEmail}
        </a>{" "}
        or call {supportPhone}. The bill is marked paid as soon as the payment is matched, and any hold
        lifts at the same moment.
      </p>
    </div>
  );
}

/**
 * A reminder across the top of every screen, for the people who can pay,
 * from the "due soon" point onwards. Everyone else is not shown it — a doctor
 * cannot settle the platform's bill and has patients to see.
 */
export function BillingBanner() {
  const { role } = useTenant();
  const { tenant } = useTenant();
  const isAdmin = role === "tenant_admin";
  const { data } = useSubscription(isAdmin);
  const today = tenant.today;

  if (!isAdmin || !data || data.summary.on_hold || !data.summary.next_due_on) return null;
  const { summary } = data;
  const due = summary.next_due_on!;
  const daysLeft = Math.round(
    (new Date(`${due}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime()) / 86_400_000,
  );
  /* Quiet until the "due soon" point — a bill raised this morning and due
     in a week is not yet worth a banner on every screen. */
  if (daysLeft > 3) return null;

  const overdue = summary.overdue;
  return (
    <div
      role="status"
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b px-4 py-2 text-label sm:px-6",
        overdue ? "border-critical-border bg-critical-soft text-critical-text" : "border-warn-border bg-warn-soft text-warn-text",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        {overdue ? <IconAlert size={15} className="shrink-0" /> : <IconClock size={15} className="shrink-0" />}
        <span className="min-w-0">
          <strong className="font-semibold">
            {overdue ? "Your Astrale bill is overdue" : daysLeft === 0 ? "Your Astrale bill is due today" : `Your Astrale bill is due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
          </strong>
          <span className="hidden sm:inline">
            {" "}— {rentMoney(summary.outstanding, summary.currency)}
            {overdue && summary.next_hold_on ? `. The clinic is put on hold on ${formatDate(summary.next_hold_on)} if it is still unpaid.` : "."}
          </span>
        </span>
      </span>
      <Link href="/settings?tab=subscription" className="shrink-0 font-medium underline-offset-4 hover:underline">
        View the bill
      </Link>
    </div>
  );
}

/**
 * The whole screen, while the clinic is on hold.
 *
 * The server refuses everything else with a 402, so this is not a curtain in
 * front of a working app — it is all there is. An admin sees what is owed and
 * the bills; everyone else is told who can sort it out. Nothing is deleted,
 * and saying so matters: a locked screen reads like lost data otherwise.
 */
export function OnHoldStage() {
  const { signOut } = useApp();
  const { tenant, user, role } = useTenant();
  const isAdmin = role === "tenant_admin";
  const { data, isPending } = useSubscription(isAdmin);
  const { data: support } = useSupportInfo();
  const supportEmail = support?.support_email ?? "";

  return (
    <div className="relative min-h-dvh bg-ground px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-3xl">
        <div className="rounded-[var(--r-xl)] border border-critical-border bg-surface shadow-e2">
          <div className="flex flex-col gap-4 border-b border-line-soft px-6 py-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--r-lg)] border border-critical-border bg-critical-soft text-critical-text">
                <IconLock size={20} />
              </span>
              <div className="min-w-0">
                <p className="text-micro font-semibold uppercase tracking-[0.12em] text-critical-text">Account on hold</p>
                <h1 className="mt-1 font-display text-h2 font-semibold leading-tight text-ink">
                  {tenant.name} is on hold for an unpaid bill
                </h1>
                <p className="mt-2 max-w-xl text-body leading-relaxed text-ink-2">
                  {isAdmin
                    ? "Your team can sign in, but patients, appointments and every other screen are paused until the subscription bill below is paid. Nothing has been deleted — everything comes back the moment it is settled."
                    : `Patients, appointments and every other screen are paused until the clinic's subscription bill is paid. Nothing has been deleted. Your practice admin can see the bill and settle it.`}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={signOut} className="shrink-0">
              <IconLogout size={14} /> Sign out
            </Button>
          </div>

          <div className="space-y-5 px-6 py-5">
            {isAdmin ? (
              isPending || !data ? (
                <p className="text-label text-ink-3">Reading the bills…</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-label text-ink-2">Outstanding</p>
                    <p className="tnum font-display text-display font-semibold text-ink">
                      {rentMoney(data.summary.outstanding, data.summary.currency)}
                    </p>
                  </div>
                  <SubscriptionBills subscription={data} today={tenant.today} compact />
                  <HowToPay />
                </>
              )
            ) : (
              <div className="flex items-start gap-3 rounded-[var(--r)] border border-line bg-surface-2 px-4 py-3">
                <IconMail size={16} className="mt-0.5 shrink-0 text-ink-3" />
                <p className="text-label leading-relaxed text-ink-2">
                  Signed in as {user.name}. Ask your practice admin to settle the bill, or contact{" "}
                  <a href={`mailto:${supportEmail}`} className="font-medium text-accent-text underline-offset-4 hover:underline">
                    {supportEmail}
                  </a>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
