"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Feature, Id, Tenant, TenantFeatureStatus } from "@/lib/types";
import type { AccountState, BillingState } from "@/lib/platform/subscriptions";
import { Badge, type Tone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, ConsequenceList } from "./confirm";
import { IconCheck, IconLock, IconSpark } from "@/components/ui/icons";

/* ==========================================================================
   The switch, and the sentence in front of it.

   A module is an entitlement, and throwing its switch opens or closes a set of
   routes for everyone at a clinic at once. That is not a thing to do by
   mis-clicking a row, so the switch itself is never wired straight to the API:
   every call goes through `useModuleSwitch`, which asks first, says what the
   change costs, and reports what the server actually did.
   ========================================================================== */

export const BILLING_LABEL: Record<BillingState, string> = {
  included: "Included",
  billed: "Billed",
  trial: "Trial",
  held: "On hold",
  dormant: "Not subscribed",
};

/**
 * Colour only where it means something.
 *
 * The house rule is in `globals.css`: red, amber and emerald are reserved for
 * state and never spent on decoration. A module that is billed is the ordinary,
 * healthy, uninteresting case — painting it emerald turns a console with
 * everything working into a wall of green and leaves nothing for the two states
 * that actually want a human. So billed reads as plain as "not subscribed", and
 * the only coloured chips left are the ones worth walking towards.
 */
export const BILLING_TONE: Record<BillingState, Tone> = {
  included: "neutral",
  billed: "neutral",
  trial: "warn",
  held: "critical",
  dormant: "neutral",
};

export const ACCOUNT_LABEL: Record<AccountState, string> = {
  billed: "Paying",
  trial: "Trial",
  held: "On hold",
  core_only: "Core only",
};

export const ACCOUNT_TONE: Record<AccountState, Tone> = {
  billed: "neutral",
  trial: "warn",
  held: "critical",
  core_only: "neutral",
};

/** Only the states that want attention carry a dot, so the eye goes to them. */
const BILLING_DOT: Record<BillingState, boolean> = {
  included: false, billed: false, trial: true, held: true, dormant: false,
};

export function BillingBadge({ state, size = "sm" }: { state: BillingState; size?: "sm" | "md" }) {
  return (
    <Badge tone={BILLING_TONE[state]} size={size} dot={BILLING_DOT[state]}>
      {BILLING_LABEL[state]}
    </Badge>
  );
}

export function AccountBadge({ state, size = "sm" }: { state: AccountState; size?: "sm" | "md" }) {
  return (
    <Badge tone={ACCOUNT_TONE[state]} size={size} dot={state === "trial" || state === "held"}>
      {ACCOUNT_LABEL[state]}
    </Badge>
  );
}

/** The catalogue price, printed the same way everywhere it appears. */
export function ModulePrice({
  feature, className, size = "md",
}: {
  feature: Feature;
  className?: string;
  size?: "sm" | "md" | "lg";
}) {
  if (feature.is_core) {
    return (
      <span className={cn("text-[0.8125rem] text-ink-3", className)}>Included in every plan</span>
    );
  }
  const sizes = {
    sm: "text-[0.8125rem]",
    md: "text-[0.9375rem]",
    lg: "text-[1.25rem]",
  };
  return (
    <span className={cn("tnum inline-flex items-baseline gap-1 font-medium text-ink", className)}>
      <span className={cn("font-display tracking-[-0.02em]", sizes[size])}>
        {currency(feature.price_monthly)}
      </span>
      <span className="text-[0.75rem] font-normal text-ink-3">/clinic/mo</span>
    </span>
  );
}

/* ---- the switch ------------------------------------------------------------ */

interface Pending {
  tenant: Tenant;
  feature: Feature;
  next: TenantFeatureStatus;
  current: TenantFeatureStatus;
}

const rowKey = (tenantId: Id, featureKey: string) => `${tenantId}:${featureKey}`;

/**
 * Ask, then throw the switch.
 *
 * Returns the dialog to render once per screen and a `request` to wire every
 * button to. `busyOn` names the row the server is currently being asked about,
 * so a grid can disable exactly the one control that is in flight instead of
 * all of them.
 */
export function useModuleSwitch() {
  const { setTenantFeature, notify } = useApp();
  const [ask, setAsk] = React.useState<Pending | null>(null);
  const [busyOn, setBusyOn] = React.useState<string | null>(null);

  const request = React.useCallback(
    (tenant: Tenant, feature: Feature, next: TenantFeatureStatus, current: TenantFeatureStatus) => {
      /* Core modules have no switch anywhere in the UI, and the server refuses
         one anyway — this is the belt to that pair of braces. */
      if (feature.is_core) return;
      setAsk({ tenant, feature, next, current });
    },
    [],
  );

  const close = React.useCallback(() => setAsk(null), []);

  const confirm = React.useCallback(async () => {
    if (!ask) return;
    const { tenant, feature, next } = ask;
    setBusyOn(rowKey(tenant.id, feature.key));
    try {
      await setTenantFeature(tenant.id, feature.key, next);
      notify(
        next === "active"
          ? {
            tone: "ok",
            title: `${feature.name} enabled for ${tenant.name}`,
            body: `Its routes are open, and ${currency(feature.price_monthly)}/mo is now billed.`,
          }
          : next === "trial"
            ? {
              tone: "warn",
              title: `${feature.name} put on trial at ${tenant.name}`,
              body: "The module works in full and nothing is billed until it is made live.",
            }
            : {
              tone: "warn",
              title: `${feature.name} disabled for ${tenant.name}`,
              body: "Its routes are shut and it stops being billed. Nothing was deleted.",
            },
      );
      setAsk(null);
    } catch (error) {
      notify({
        tone: "critical",
        title: "Not changed",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setBusyOn(null);
  }, [ask, setTenantFeature, notify]);

  /* The subtitle names the clinic rather than the module: the dialog is there
     to catch acting on the wrong row, and the module is already in the title. */
  const dialog = (
    <ConfirmDialog
      open={!!ask}
      onClose={close}
      onConfirm={() => { void confirm(); }}
      busy={!!busyOn}
      tone={ask?.next === "inactive" ? "danger" : "primary"}
      title={ask ? `${verb(ask.next)} ${ask.feature.name}?` : ""}
      subtitle={ask ? `${ask.tenant.name} — ${ask.tenant.slug}` : undefined}
      confirmLabel={ask ? `${verb(ask.next)} ${ask.feature.name}` : ""}
    >
      {ask && <SwitchConsequences {...ask} />}
    </ConfirmDialog>
  );

  return { request, dialog, busyOn, isBusy: (tenantId: Id, featureKey: string) => busyOn === rowKey(tenantId, featureKey) };
}

const verb = (next: TenantFeatureStatus) =>
  next === "active" ? "Enable" : next === "trial" ? "Start trial of" : "Disable";

function SwitchConsequences({ tenant, feature, next, current }: Pending) {
  const price = currency(feature.price_monthly);

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--r)] border border-line bg-surface-2 px-3.5 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[0.875rem] font-medium text-ink">{feature.name}</p>
            <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-3">{feature.summary}</p>
          </div>
          <ModulePrice feature={feature} className="shrink-0" size="sm" />
        </div>
      </div>

      {next === "active" && (
        <ConsequenceList
          items={[
            <>
              Everyone at <strong className="font-medium text-ink">{tenant.name}</strong> can use it
              immediately. It unlocks {feature.unlocks.join(", ")}.
            </>,
            current === "trial"
              ? <>The trial ends and <strong className="font-medium text-ink">{price}/mo</strong> starts being billed.</>
              : <><strong className="font-medium text-ink">{price}/mo</strong> is added to this clinic&apos;s subscription from today.</>,
            <>Data this module wrote before is still there and becomes reachable again.</>,
          ]}
        />
      )}

      {next === "trial" && (
        <ConsequenceList
          items={[
            <>The module works in full — a trial is not a reduced version of it.</>,
            <>Nothing is billed. It counts as <strong className="font-medium text-ink">{price}/mo</strong> of trial value, not revenue.</>,
            <>It stays on until somebody here makes it live or switches it off; there is no timer.</>,
          ]}
        />
      )}

      {next === "inactive" && (
        <ConsequenceList
          items={[
            <>
              Its routes close for everyone at <strong className="font-medium text-ink">{tenant.name}</strong>,
              including anyone with it open right now.
            </>,
            <>Billing stops: <strong className="font-medium text-ink">{price}/mo</strong> comes off this clinic&apos;s subscription.</>,
            <>
              <strong className="font-medium text-ink">Nothing is deleted.</strong> Stock, orders and
              invoices this module wrote stay in the database and come back if it is switched on again.
            </>,
          ]}
        />
      )}

      {tenant.status === "suspended" && (
        <p className="rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2 text-[0.75rem] leading-relaxed text-warn-text">
          {tenant.name} is suspended, so its subdomain is serving a notice rather than the app.
          This change is recorded and takes effect the moment the clinic is reactivated.
        </p>
      )}
    </div>
  );
}

/* ---- the button that sits in a row ----------------------------------------- */

/**
 * One module's control, as it appears in a grid or a list.
 *
 * Core modules get a fact rather than a switch: the product does not work
 * without them, and the server refuses to turn one off.
 */
export function ModuleSwitch({
  tenant, feature, status, onRequest, busy, withTrial = false, size = "sm",
}: {
  tenant: Tenant;
  feature: Feature;
  status: TenantFeatureStatus;
  onRequest: (tenant: Tenant, feature: Feature, next: TenantFeatureStatus, current: TenantFeatureStatus) => void;
  busy?: boolean;
  /** offer "start trial" alongside — worth the width on a detail page, not in a grid */
  withTrial?: boolean;
  size?: "sm" | "md";
}) {
  if (feature.is_core) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[0.75rem] text-ink-3">
        <IconLock size={12} /> Always on
      </span>
    );
  }

  const on = status === "active";

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {withTrial && status !== "trial" && (
        <Button
          variant="ghost"
          size={size}
          disabled={busy}
          onClick={() => onRequest(tenant, feature, "trial", status)}
        >
          <IconSpark size={14} /> Trial
        </Button>
      )}
      {on || status === "trial" ? (
        <Button
          variant="ghost"
          size={size}
          disabled={busy}
          onClick={() => onRequest(tenant, feature, "inactive", status)}
        >
          {busy ? "…" : "Disable"}
        </Button>
      ) : null}
      {!on && (
        <Button
          variant="primary"
          size={size}
          disabled={busy}
          onClick={() => onRequest(tenant, feature, "active", status)}
        >
          {busy ? "…" : <><IconCheck size={14} /> Enable</>}
        </Button>
      )}
    </div>
  );
}
