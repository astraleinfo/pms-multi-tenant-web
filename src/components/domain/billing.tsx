"use client";

/* ==========================================================================
   Settings → Billing.

   What the practice pays the platform. Not the same screen as `/billing`,
   which is what the practice charges its patients — different money, different
   people, and the only thing they share is the word.

   Three rules this screen keeps, all of them the server's rules made visible:

   *   **it never computes money.** Every figure comes from the API. The
       browser adding up a subtotal would be a second answer to a question that
       already has one, and the two would disagree the first time anybody
       discounted anything;
   *   **it says what a click cost.** Activating a module mid-month charges a
       prorated amount, activating one you had just cancelled charges nothing,
       and cancelling charges nothing. The response says which happened and so
       does the toast — a billing screen that answers "Done" is a billing
       screen nobody trusts;
   *   **it never treats the payment widget as proof.** The Checkout handler
       firing means a claim arrived, not that money did. The invoice turns paid
       when the server says so.
   ========================================================================== */

import * as React from "react";
import * as api from "@/lib/api";
import { useSession } from "@/lib/store/session";
import {
  useActivateAddon, useBillingSummary, useCancelAddon, useCancelSubscription,
  useChangePlan, useKeepSubscription, usePauseSubscription, usePlans,
  useResumeSubscription, useSubscribe, useSubscriptionInvoices, useUpdateBillingAccount,
  usePayInvoice,
} from "@/lib/query/billing";
import { openPdfBlob } from "@/lib/pdf";
import { currency, formatDate, pluralise, titleCase } from "@/lib/format";
import type {
  BillingAddon, BillingSummary, FeatureKey, Plan, SubscriptionInvoice, SubscriptionStatus,
} from "@/lib/types";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { EmptyState, KV, Skeleton } from "@/components/ui/misc";
import { Modal } from "@/components/ui/modal";
import { Field, Input } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  IconAlert, IconCard, IconCheck, IconDownload, IconInfo, IconLayers, IconReceipt,
  IconRefresh, IconSpark,
} from "@/components/ui/icons";

/* -------------------------------------------------------------------------- */

const SUBSCRIPTION_TONE: Record<SubscriptionStatus, Tone> = {
  pending: "warn",
  trialing: "info",
  active: "ok",
  past_due: "critical",
  paused: "neutral",
  cancelled: "neutral",
  expired: "neutral",
};

const SUB_INVOICE_TONE: Record<string, Tone> = {
  draft: "neutral", issued: "info", partially_paid: "warn",
  paid: "ok", void: "neutral", uncollectible: "critical",
};

/**
 * The last day *inside* a billing period.
 *
 * `period_end` is exclusive — it is the first day of the next cycle — so
 * printing it raw gives "1 Feb to 1 Mar" for February and invites the entirely
 * reasonable question of who is paying for the 1st of March.
 */
function lastDayOf(periodEnd: string) {
  const d = new Date(`${periodEnd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* -------------------------------------------------------------------------- */

export function BillingTab() {
  const { data, isPending, isError, refetch } = useBillingSummary();

  if (isPending) return <BillingSkeleton />;
  if (isError || !data) {
    return (
      <Card>
        <EmptyState
          icon={<IconAlert size={20} />}
          title="Billing could not be read"
          body="The subscription service did not answer. Nothing has changed."
          action={<Button variant="secondary" onClick={() => void refetch()}><IconRefresh size={15} /> Try again</Button>}
        />
      </Card>
    );
  }

  if (!data.subscription) return <ChoosePlan summary={data} />;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-5">
          <CurrentPlan summary={data} />
          <Addons summary={data} />
        </div>
        <div className="space-y-5">
          <NextInvoice summary={data} />
          <BillingAccountCard summary={data} />
        </div>
      </div>
      <BillingHistory />
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-5">
        <Skeleton className="h-52 w-full rounded-[var(--r-lg)]" />
        <Skeleton className="h-72 w-full rounded-[var(--r-lg)]" />
      </div>
      <Skeleton className="h-64 w-full rounded-[var(--r-lg)]" />
    </div>
  );
}

/* ---- no subscription yet -------------------------------------------------- */

/**
 * Requirement 1 made visible: a base plan is mandatory, so a clinic without one
 * is shown the catalogue rather than an empty screen with a link somewhere.
 */
function ChoosePlan({ summary }: { summary: BillingSummary }) {
  const { data: plans, isPending } = usePlans();
  const subscribe = useSubscribe();
  const { notify } = useSession();
  const [chosen, setChosen] = React.useState<string | null>(null);

  return (
    <Card>
      <CardHeader
        icon={<IconCard size={16} />}
        title="Choose a plan"
        subtitle="Every practice is on one monthly base plan. Modules are added on top, priced per month and charged for the days you actually have them."
      />
      <CardBody className="pt-0">
        {isPending ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-[var(--r)]" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {(plans ?? []).map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                selected={chosen === plan.code}
                onSelect={() => setChosen(plan.code)}
              />
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-[0.75rem] leading-relaxed text-ink-3">
            The price is the one in the catalogue — this screen never sends an amount, and the
            server would refuse it if it did.
          </p>
          <Button
            variant="primary"
            disabled={!chosen || subscribe.isPending}
            onClick={() => {
              if (!chosen) return;
              subscribe.mutate(chosen, {
                onSuccess: (next) => {
                  const invoiced = next.subscription?.status !== "trialing";
                  notify({
                    tone: "ok",
                    title: `${next.subscription?.plan.name ?? "Plan"} is active`,
                    body: invoiced
                      ? "The first invoice is on the Billing history below."
                      : `Free until ${formatDate(next.subscription?.trial_ends_on, "long")} — nothing is charged until then.`,
                  });
                },
              });
            }}
          >
            {subscribe.isPending ? "Setting up…" : "Start subscription"}
          </Button>
        </div>

        {summary.account.currency && (
          <p className="mt-2 text-[0.75rem] text-ink-3">
            Billed in {summary.account.currency}.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

function PlanCard({
  plan, selected, onSelect, current,
}: {
  plan: Plan;
  selected?: boolean;
  onSelect?: () => void;
  current?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={current}
      aria-pressed={selected}
      className={[
        "rounded-[var(--r)] border p-4 text-left transition-colors",
        current
          ? "cursor-default border-line bg-surface-2"
          : selected
            ? "border-accent bg-accent-soft/50"
            : "border-line bg-surface hover:border-line-strong",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.9375rem] font-semibold text-ink">{plan.name}</p>
        {current && <Badge tone="ok" size="sm" dot>Current</Badge>}
      </div>
      <p className="mt-1 min-h-[2.5rem] text-[0.8125rem] leading-snug text-ink-2">{plan.description}</p>
      <p className="tnum mt-3 font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
        {currency(plan.amount)}
        <span className="ml-1 text-[0.8125rem] font-normal text-ink-3">/month</span>
      </p>
      {plan.trial_days > 0 && (
        <p className="mt-1.5 text-[0.75rem] text-accent-text">{plan.trial_days} days free</p>
      )}
    </button>
  );
}

/* ---- the current plan ----------------------------------------------------- */

function CurrentPlan({ summary }: { summary: BillingSummary }) {
  const subscription = summary.subscription!;
  const { notify } = useSession();
  const pause = usePauseSubscription();
  const resume = useResumeSubscription();
  const keep = useKeepSubscription();
  const [changing, setChanging] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  const status = subscription.status;
  const paused = status === "paused";
  const ending = subscription.cancel_at_cycle_end;
  const period = subscription.current_period_start && subscription.current_period_end
    ? `${formatDate(subscription.current_period_start, "long")} – ${formatDate(lastDayOf(subscription.current_period_end), "long")}`
    : "—";

  return (
    <>
      <Card>
        <CardHeader
          icon={<IconCard size={16} />}
          title="Current plan"
          subtitle="The base plan every practice has. Modules are billed on top of it."
          actions={<Badge tone={SUBSCRIPTION_TONE[status]} size="sm" dot>{titleCase(status)}</Badge>}
        />
        <CardBody className="pt-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-display text-[1.375rem] font-semibold tracking-[-0.02em] text-ink">
                {subscription.plan.name}
              </p>
              <p className="tnum mt-0.5 text-[0.875rem] text-ink-2">
                {currency(subscription.plan.amount)} / month
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setChanging(true)}>
                <IconLayers size={14} /> Change plan
              </Button>
              {paused ? (
                <Button size="sm" variant="primary" disabled={resume.isPending}
                        onClick={() => resume.mutate(undefined, {
                          onSuccess: () => notify({ tone: "ok", title: "Billing resumed", body: "The next cycle starts from today." }),
                        })}>
                  Resume
                </Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={pause.isPending || ending}
                        onClick={() => pause.mutate(undefined, {
                          onSuccess: () => notify({ tone: "warn", title: "Billing paused", body: "Nothing further is charged until you resume. Nothing is refunded for the period already paid for." }),
                        })}>
                  Pause
                </Button>
              )}
              {ending ? (
                <Button size="sm" variant="primary" disabled={keep.isPending}
                        onClick={() => keep.mutate(undefined, {
                          onSuccess: () => notify({ tone: "ok", title: "Cancellation withdrawn", body: "Nothing was charged — the subscription never stopped." }),
                        })}>
                  Keep subscription
                </Button>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setCancelling(true)}>Cancel</Button>
              )}
            </div>
          </div>

          {/* The two states worth calling out in words rather than a badge. */}
          {ending && subscription.current_period_end && (
            <Notice tone="warn" icon={<IconAlert size={15} />}>
              Cancelling on <strong>{formatDate(subscription.current_period_end, "long")}</strong>. Everything
              keeps working until then, because it has already been paid for — and nothing further will be
              charged. You can withdraw this at any time before that date.
            </Notice>
          )}
          {paused && (
            <Notice tone="neutral" icon={<IconInfo size={15} />}>
              Billing is paused. The practice keeps working and nothing is being charged; nothing is
              refunded for the period already paid for.
            </Notice>
          )}
          {status === "past_due" && (
            <Notice tone="critical" icon={<IconAlert size={15} />}>
              An invoice is overdue. Nothing has been switched off — settle it below and this clears by
              itself.
            </Notice>
          )}
          {status === "trialing" && subscription.trial_ends_on && (
            <Notice tone="info" icon={<IconSpark size={15} />}>
              Free trial until <strong>{formatDate(subscription.trial_ends_on, "long")}</strong>. The first
              invoice is raised when it ends.
            </Notice>
          )}

          <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line-soft pt-4 sm:grid-cols-4">
            <KV label="This period" value={period} />
            <KV
              label="Days in cycle"
              value={subscription.current_period_days ?? "—"}
              mono
            />
            <KV
              label="Next billed"
              value={summary.next_billing_on ? formatDate(summary.next_billing_on, "long") : "Not scheduled"}
            />
            <KV label="Since" value={formatDate(subscription.started_on, "long")} />
          </dl>

          <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-3">
            A month is however many days it has. Anything added part-way through this cycle is charged over
            its {subscription.current_period_days ?? "—"} days, not a notional thirty.
          </p>
        </CardBody>
      </Card>

      <ChangePlanModal
        open={changing}
        onClose={() => setChanging(false)}
        currentCode={subscription.plan.code}
      />
      <CancelModal open={cancelling} onClose={() => setCancelling(false)} summary={summary} />
    </>
  );
}

function Notice({
  tone, icon, children,
}: {
  tone: "warn" | "critical" | "info" | "neutral" | "ok";
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  const skin = {
    warn: "border-warn-border bg-warn-soft text-warn-text",
    critical: "border-critical-border bg-critical-soft text-critical-text",
    info: "border-info-border bg-info-soft text-info-text",
    ok: "border-ok-border bg-ok-soft text-ok-text",
    neutral: "border-line-strong bg-surface-2 text-ink-2",
  }[tone];
  return (
    <div className={`mt-4 flex items-start gap-2.5 rounded-[var(--r)] border px-3 py-2.5 text-[0.8125rem] leading-relaxed ${skin}`}>
      {icon && <span className="mt-px shrink-0">{icon}</span>}
      <p>{children}</p>
    </div>
  );
}

function ChangePlanModal({
  open, onClose, currentCode,
}: {
  open: boolean;
  onClose: () => void;
  currentCode: string;
}) {
  const { data: plans } = usePlans();
  const change = useChangePlan();
  const { notify } = useSession();
  const [chosen, setChosen] = React.useState<string | null>(null);

  React.useEffect(() => { if (open) setChosen(null); }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change plan"
      subtitle="The new plan starts today. What you have already paid for and will not use comes back as a credit on the next invoice."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Close</Button>
          <Button
            variant="primary"
            disabled={!chosen || change.isPending}
            onClick={() => {
              if (!chosen) return;
              change.mutate(chosen, {
                onSuccess: (next) => {
                  onClose();
                  notify({
                    tone: "ok",
                    title: `Now on ${next.subscription?.plan.name ?? "the new plan"}`,
                    body: "The new invoice is on the Billing history, with any credit shown as its own line.",
                  });
                },
              });
            }}
          >
            {change.isPending ? "Changing…" : "Change plan"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(plans ?? []).map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            current={plan.code === currentCode}
            selected={chosen === plan.code}
            onSelect={() => setChosen(plan.code)}
          />
        ))}
      </div>
      <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-2">
        Changing plan does not switch modules off. A module the new plan happens to include stops being
        billed separately; one it does not carries on as an add-on.
      </p>
    </Modal>
  );
}

function CancelModal({
  open, onClose, summary,
}: {
  open: boolean;
  onClose: () => void;
  summary: BillingSummary;
}) {
  const cancel = useCancelSubscription();
  const { notify } = useSession();
  const [reason, setReason] = React.useState("");
  const endsOn = summary.subscription?.current_period_end;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="sm"
      title="Cancel the subscription"
      subtitle={endsOn ? `Everything keeps working until ${formatDate(endsOn, "long")}.` : undefined}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button
            variant="danger"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(reason, {
              onSuccess: () => {
                onClose();
                notify({
                  tone: "warn",
                  title: "Cancellation scheduled",
                  body: endsOn
                    ? `Everything keeps working until ${formatDate(endsOn, "long")}. Nothing further will be charged.`
                    : "Nothing further will be charged.",
                });
              },
            })}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel subscription"}
          </Button>
        </>
      }
    >
      <p className="text-[0.875rem] leading-relaxed text-ink-2">
        The subscription ends at the end of the period you have already paid for — not today. Until then
        nothing changes, and you can withdraw the cancellation at any point.
      </p>
      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-3">
        Nothing is refunded for the remainder of the period, and nothing further is charged after it.
      </p>
      <div className="mt-4">
        <Field label="Anything you would like to tell us" help="Optional, and recorded with the cancellation.">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Too expensive, moving to…" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- add-ons -------------------------------------------------------------- */

function Addons({ summary }: { summary: BillingSummary }) {
  const purchasable = summary.addons.filter((a) => !a.included);
  const included = summary.addons.filter((a) => a.included);

  return (
    <Card>
      <CardHeader
        icon={<IconSpark size={16} />}
        title="Modules"
        subtitle="Added part-way through a month, a module is charged only for the days left in it. Removed, it keeps working to the end of the month you have paid for."
      />
      <CardBody className="pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {purchasable.map((addon) => (
            <AddonRow key={addon.feature_key} addon={addon} summary={summary} />
          ))}
        </div>

        {included.length > 0 && (
          <>
            <Legend className="mt-6">Included in {summary.subscription?.plan.name}</Legend>
            <div className="flex flex-wrap gap-1.5">
              {included.map((addon) => (
                <span
                  key={addon.feature_key}
                  className={[
                    "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-1 text-[0.75rem]",
                    addon.active
                      ? "border-line-strong bg-surface-2 text-ink-2"
                      : "border-line bg-surface text-ink-3",
                  ].join(" ")}
                >
                  {/* Covered by the plan is not the same as switched on: an
                      administrator can still turn one off, and a chip that
                      always showed a tick would be telling them otherwise. */}
                  {addon.active
                    ? <IconCheck size={12} className="text-ok-text" />
                    : <span className="h-1.5 w-1.5 rounded-full bg-ink-3/40" aria-hidden />}
                  {addon.name}
                  {!addon.active && <span className="text-ink-3">· off</span>}
                </span>
              ))}
            </div>
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-ink-3">
              Covered by the plan rather than free extras — they are never invoiced separately, and they
              cannot be removed on their own.
            </p>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * One module row, in one of four states.
 *
 * The third is the one worth getting right: `active` with a `cancels_on` means
 * the module is **still on**, still usable and already paid for. Showing it as
 * "cancelled" would be wrong, and offering "Add" rather than "Keep" would
 * imply a charge that is not going to happen.
 */
function AddonRow({ addon, summary }: { addon: BillingAddon; summary: BillingSummary }) {
  const activate = useActivateAddon();
  const cancel = useCancelAddon();
  const { notify } = useSession();
  const busy = activate.isPending || cancel.isPending;
  const ending = addon.active && !!addon.cancels_on;
  const price = addon.monthly_amount ?? 0;

  const onActivate = () =>
    activate.mutate(addon.feature_key as FeatureKey, {
      onSuccess: (result) => {
        if (result.reinstated) {
          notify({
            tone: "ok",
            title: `${addon.name} kept`,
            body: "Nothing was charged — it never stopped, so the month you had already paid for still covers it.",
          });
          return;
        }
        if (result.charged && result.amount != null) {
          const workings = result.prorated_days != null && result.cycle_days != null
            ? ` for ${result.prorated_days} of ${result.cycle_days} days`
            : "";
          notify({
            tone: "ok",
            title: `${addon.name} is on`,
            body: `Charged ${currency(result.amount)}${workings}. The invoice is on the Billing history below.`,
          });
          return;
        }
        notify({
          tone: "ok",
          title: `${addon.name} is on`,
          body: "Nothing was charged — this period is already covered.",
        });
      },
    });

  const onCancel = () =>
    cancel.mutate(addon.feature_key as FeatureKey, {
      onSuccess: (result) => {
        notify({
          tone: "warn",
          title: `${addon.name} ends ${result.cancels_on ? formatDate(result.cancels_on, "long") : "at the cycle end"}`,
          body: "It keeps working until then. Nothing is refunded, and it will not be on the next invoice.",
        });
      },
    });

  return (
    <div
      className={[
        "rounded-[var(--r)] border p-4 transition-colors",
        ending
          ? "border-warn-border bg-warn-soft/40"
          : addon.active
            ? "border-accent-border bg-accent-soft/40"
            : "border-line bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[0.9375rem] font-semibold text-ink">{addon.name}</p>
          <p className="tnum mt-0.5 font-mono text-[0.75rem] text-ink-3">
            {currency(price)}/mo
          </p>
        </div>
        {ending ? (
          <Badge tone="warn" size="sm" dot>Ending</Badge>
        ) : addon.active ? (
          <Badge tone="ok" size="sm" dot>On</Badge>
        ) : (
          <Badge tone="neutral" size="sm">Off</Badge>
        )}
      </div>

      {ending && addon.cancels_on && (
        <p className="mt-2.5 text-[0.75rem] leading-snug text-warn-text">
          Active until {formatDate(addon.cancels_on, "long")}, then off. Already paid for — nothing is
          refunded and nothing more is charged.
        </p>
      )}
      {addon.active && !ending && addon.activated_on && (
        <p className="mt-2.5 text-[0.75rem] text-ink-3">Added {formatDate(addon.activated_on, "long")}</p>
      )}
      {!addon.active && summary.subscription?.current_period_days && (
        <p className="mt-2.5 text-[0.75rem] leading-snug text-ink-3">
          Charged for the days left in this {summary.subscription.current_period_days}-day cycle.
        </p>
      )}

      <div className="mt-3 border-t border-line-soft pt-3">
        {ending ? (
          <Button size="sm" variant="primary" className="w-full" disabled={busy} onClick={onActivate}>
            Keep {addon.name}
          </Button>
        ) : addon.active ? (
          <Button size="sm" variant="ghost" className="w-full" disabled={busy} onClick={onCancel}>
            Remove at cycle end
          </Button>
        ) : (
          <Button size="sm" variant="secondary" className="w-full" disabled={busy} onClick={onActivate}>
            {activate.isPending ? "Adding…" : "Add module"}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---- the right rail ------------------------------------------------------- */

function NextInvoice({ summary }: { summary: BillingSummary }) {
  const owing = summary.outstanding_count > 0;
  return (
    <Card>
      <CardHeader icon={<IconReceipt size={16} />} title="What comes next" />
      <CardBody className="pt-0 space-y-4">
        <div>
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">
            Next invoice, before tax
          </p>
          <p className="tnum mt-1 font-display text-[1.625rem] font-semibold tracking-[-0.025em] text-ink">
            {currency(summary.recurring_subtotal)}
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-2">
            {summary.next_billing_on
              ? `On ${formatDate(summary.next_billing_on, "long")}`
              : "Nothing scheduled"}
          </p>
        </div>

        <div className="border-t border-line-soft pt-4">
          <p className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">Outstanding</p>
          <p className={[
            "tnum mt-1 font-display text-[1.375rem] font-semibold tracking-[-0.025em]",
            owing ? "text-critical-text" : "text-ok-text",
          ].join(" ")}>
            {currency(summary.outstanding_total)}
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-2">
            {owing ? pluralise(summary.outstanding_count, "invoice") + " to pay" : "Nothing to pay"}
          </p>
        </div>

        <p className="border-t border-line-soft pt-3 text-[0.75rem] leading-relaxed text-ink-3">
          Every figure on this screen is the server&rsquo;s. Nothing here is added up in your browser, so
          what you see is what the invoice will say.
        </p>
      </CardBody>
    </Card>
  );
}

function BillingAccountCard({ summary }: { summary: BillingSummary }) {
  const update = useUpdateBillingAccount();
  const { notify } = useSession();
  const [editing, setEditing] = React.useState(false);
  const account = summary.account;

  return (
    <>
      <Card>
        <CardHeader
          title="Billing details"
          subtitle="Where invoices go, and the tax identity they carry."
          actions={<Button size="sm" variant="ghost" onClick={() => setEditing(true)}>Edit</Button>}
        />
        <CardBody className="pt-0">
          <dl className="space-y-3">
            <KV label="Billed to" value={account.legal_name || "Not set"} />
            <KV label="Invoices to" value={account.billing_email || "Your practice administrators"} />
            <KV label="Tax identifier" value={account.tax_id || "—"} mono />
            <KV
              label="Place of supply"
              value={[account.place_of_supply, account.country].filter(Boolean).join(", ") || "—"}
            />
          </dl>
          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
            Changing these changes what future invoices are taxed at. An invoice already issued says what
            it said the day it was raised — nothing here can rewrite it.
          </p>
        </CardBody>
      </Card>

      <BillingAccountModal
        open={editing}
        onClose={() => setEditing(false)}
        account={account}
        onSave={(changes) =>
          update.mutate(changes, {
            onSuccess: () => {
              setEditing(false);
              notify({ tone: "ok", title: "Billing details saved", body: "Future invoices will use them." });
            },
          })
        }
        saving={update.isPending}
      />
    </>
  );
}

function BillingAccountModal({
  open, onClose, account, onSave, saving,
}: {
  open: boolean;
  onClose: () => void;
  account: BillingSummary["account"];
  onSave: (changes: api.BillingAccountEdit) => void;
  saving: boolean;
}) {
  const [form, setForm] = React.useState(account);
  React.useEffect(() => { if (open) setForm(account); }, [open, account]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Billing details"
      subtitle="Who the invoice is made out to, and where it goes."
      width="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => onSave({
              legal_name: form.legal_name,
              billing_email: form.billing_email,
              phone: form.phone,
              address: form.address,
              tax_id: form.tax_id,
              country: form.country,
              place_of_supply: form.place_of_supply,
            })}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Legal name" className="sm:col-span-2">
          <Input value={form.legal_name} onChange={(e) => set("legal_name", e.target.value)} />
        </Field>
        <Field label="Invoices to" help="Blank sends them to every practice administrator.">
          <Input
            type="email"
            value={form.billing_email}
            onChange={(e) => set("billing_email", e.target.value)}
            placeholder="accounts@practice.example"
          />
        </Field>
        <Field label="Phone">
          <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
        <Field label="Address" className="sm:col-span-2">
          <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
        </Field>
        <Field label="Tax identifier" help="GSTIN, VAT number — printed on the invoice.">
          <Input value={form.tax_id} onChange={(e) => set("tax_id", e.target.value)} />
        </Field>
        <Field label="Country" help="Two letters.">
          <Input
            value={form.country}
            maxLength={2}
            onChange={(e) => set("country", e.target.value.toUpperCase())}
            placeholder="IN"
          />
        </Field>
        <Field label="Place of supply" className="sm:col-span-2" help="The state or region. It decides which tax applies.">
          <Input value={form.place_of_supply} onChange={(e) => set("place_of_supply", e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

/* ---- billing history ------------------------------------------------------ */

function BillingHistory() {
  const { data, isPending } = useSubscriptionInvoices({ limit: 24 });
  const [open, setOpen] = React.useState<SubscriptionInvoice | null>(null);
  const invoices = data?.items ?? [];

  return (
    <>
      <Card className="overflow-hidden">
        <CardHeader
          icon={<IconReceipt size={16} />}
          title="Billing history"
          subtitle="Every invoice, with the line items it was made of."
        />
        {isPending ? (
          <CardBody className="pt-0"><Skeleton className="h-40 w-full rounded-[var(--r)]" /></CardBody>
        ) : invoices.length === 0 ? (
          <EmptyState compact icon={<IconReceipt size={20} />} title="No invoices yet"
                      body="The first one is raised when the current cycle is billed." />
        ) : (
          <TableWrap>
            <Table className="min-w-[52rem]">
              <THead>
                <TR>
                  <TH>Invoice</TH>
                  <TH>Period</TH>
                  <TH align="right">Total</TH>
                  <TH align="right">Balance</TH>
                  <TH>Status</TH>
                  <TH align="right">{""}</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((invoice) => (
                  <TR key={invoice.id} onClick={() => setOpen(invoice)}>
                    <TD>
                      <span className="tnum font-mono text-[0.8125rem] text-ink">{invoice.number}</span>
                      <span className="block text-[0.75rem] text-ink-3">
                        Issued {formatDate(invoice.issued_on)}
                      </span>
                    </TD>
                    <TD>
                      <span className="text-ink-2">
                        {formatDate(invoice.period_start)} – {formatDate(lastDayOf(invoice.period_end))}
                      </span>
                    </TD>
                    <TD align="right"><span className="tnum">{currency(invoice.total)}</span></TD>
                    <TD align="right">
                      <span className={invoice.balance > 0 ? "tnum text-critical-text" : "tnum text-ink-3"}>
                        {currency(invoice.balance)}
                      </span>
                    </TD>
                    <TD>
                      <Badge tone={SUB_INVOICE_TONE[invoice.status] ?? "neutral"} size="sm" dot>
                        {titleCase(invoice.status)}
                      </Badge>
                    </TD>
                    <TD align="right">
                      <div className="flex items-center justify-end gap-1.5">
                        <DownloadButton invoice={invoice} />
                        {invoice.balance > 0 && <PayNowButton invoice={invoice} />}
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </Card>

      <InvoiceModal invoice={open} onClose={() => setOpen(null)} />
    </>
  );
}

function DownloadButton({ invoice }: { invoice: SubscriptionInvoice }) {
  const { notify } = useSession();
  const [busy, setBusy] = React.useState(false);

  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={(e) => {
        e.stopPropagation();
        setBusy(true);
        void api.downloadSubscriptionInvoice(invoice.id)
          .then(openPdfBlob)
          .catch((error: unknown) => notify({
            tone: "critical",
            title: "That invoice did not open",
            body: error instanceof Error ? error.message : "Try again in a moment.",
          }))
          .finally(() => setBusy(false));
      }}
      aria-label={`Download invoice ${invoice.number}`}
    >
      <IconDownload size={14} />
    </Button>
  );
}

/**
 * Pay Now.
 *
 * Three steps and the middle one is somebody else's window: the server prices
 * an order, Checkout collects the money, and the server verifies what comes
 * back before the invoice is treated as paid. A dismissal is not an error —
 * closing a payment window is the most common thing that happens to one — so
 * it says nothing at all.
 */
function PayNowButton({ invoice }: { invoice: SubscriptionInvoice }) {
  const { pay, busy } = usePayInvoice();

  return (
    <Button
      size="sm"
      variant="primary"
      disabled={busy}
      onClick={(e) => { e.stopPropagation(); void pay(invoice); }}
    >
      {busy ? "Opening…" : "Pay now"}
    </Button>
  );
}

/** One invoice, with the workings its line items carry. */
function InvoiceModal({
  invoice, onClose,
}: {
  invoice: SubscriptionInvoice | null;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!invoice}
      onClose={onClose}
      width="lg"
      title={invoice ? `Invoice ${invoice.number}` : ""}
      subtitle={
        invoice
          ? `${formatDate(invoice.period_start, "long")} – ${formatDate(lastDayOf(invoice.period_end), "long")}`
          : undefined
      }
      footer={
        invoice && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            <DownloadButton invoice={invoice} />
            {invoice.balance > 0 && <PayNowButton invoice={invoice} />}
          </>
        )
      }
    >
      {invoice && (
        <>
          <TableWrap>
            <Table className="min-w-[34rem]">
              <THead>
                <TR>
                  <TH>Line</TH>
                  <TH>Basis</TH>
                  <TH align="right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {invoice.items.map((item, i) => (
                  <TR key={`${item.kind}-${i}`}>
                    <TD>
                      <span className="text-ink">{item.description}</span>
                    </TD>
                    <TD>
                      <span className="text-[0.75rem] text-ink-3">
                        {item.prorated_days != null && item.cycle_days
                          ? `${item.prorated_days} of ${item.cycle_days} days at ${currency(item.unit_amount)}/mo`
                          : item.tax_percent != null
                            ? `${item.tax_code} at ${item.tax_percent}%`
                            : "Full period"}
                      </span>
                    </TD>
                    <TD align="right">
                      <span className={item.amount < 0 ? "tnum text-ok-text" : "tnum"}>
                        {currency(item.amount)}
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableWrap>

          <dl className="mt-4 space-y-2 border-t border-line-soft pt-4 text-[0.875rem]">
            <Row label="Subtotal" value={currency(invoice.subtotal)} />
            {invoice.discount_total > 0 && (
              <Row label="Discounts and credits" value={`− ${currency(invoice.discount_total)}`} tone="ok" />
            )}
            <Row label="Tax" value={currency(invoice.tax_total)} />
            <Row label="Total" value={currency(invoice.total)} strong />
            <Row label="Paid" value={currency(invoice.paid)} />
            <Row
              label="Balance"
              value={currency(invoice.balance)}
              strong
              tone={invoice.balance > 0 ? "critical" : "ok"}
            />
          </dl>

          <p className="mt-4 text-[0.75rem] leading-relaxed text-ink-3">
            Issued {formatDate(invoice.issued_on, "long")}, due {formatDate(invoice.due_on, "long")}. An
            issued invoice cannot be edited by anyone — a mistake is corrected by voiding it and raising
            another.
          </p>
        </>
      )}
    </Modal>
  );
}

function Row({
  label, value, strong, tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "ok" | "critical";
}) {
  const colour = tone === "ok" ? "text-ok-text" : tone === "critical" ? "text-critical-text" : "text-ink";
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className={strong ? "font-medium text-ink" : "text-ink-2"}>{label}</dt>
      <dd className={`tnum ${strong ? "font-semibold" : ""} ${colour}`}>{value}</dd>
    </div>
  );
}
