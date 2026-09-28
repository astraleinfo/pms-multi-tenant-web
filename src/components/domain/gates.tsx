"use client";

import * as React from "react";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useFeatureCatalog } from "@/lib/query/hooks";
import { ROLE_LABEL, modulePath } from "@/lib/nav";
import type { FeatureKey, Role } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { IconArrowRight, IconLock, IconShield } from "@/components/ui/icons";
import { currency } from "@/lib/format";

/**
 * Feature guard, frontend half (§3.2). This hides UI; the server guard is what
 * actually enforces the entitlement. Anything gated renders through here so the
 * locked state is identical across modules.
 *
 * Where it sends somebody is the module's own page, not Settings: the switch
 * belongs to the platform, so the useful thing to offer a clinic standing in
 * front of a padlock is what the module does and how to ask for it.
 */
export function FeatureGate({
  feature, children,
}: {
  feature: FeatureKey;
  children: React.ReactNode;
}) {
  const { hasFeature } = useApp();
  const { tenant } = useTenant();
  const catalog = useFeatureCatalog();
  if (hasFeature(feature)) return <>{children}</>;

  const f = catalog.byKey[feature];

  return (
    <Card className="mx-auto max-w-2xl overflow-hidden">
      <div className="border-b border-line-soft bg-surface-2 px-6 py-8 text-center">
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-[var(--r-lg)] border border-line-strong bg-surface text-ink-3">
          <IconLock size={22} />
        </span>
        <h2 className="font-display text-h2 font-semibold text-ink">
          {f.name} is not enabled for {tenant.name}
        </h2>
        <p className="mx-auto mt-2 max-w-md text-body leading-relaxed text-ink-2">{f.summary}</p>
      </div>
      <div className="px-6 py-5">
        <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Turning it on unlocks</p>
        <ul className="mt-2.5 space-y-1.5">
          {f.unlocks.map((u) => (
            <li key={u} className="flex items-center gap-2 text-body text-ink">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {u}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-4">
          <p className="text-label text-ink-2">
            <span className="tnum font-mono font-medium text-ink">
              {catalog.priced ? currency(f.price_monthly) : "…"}
            </span> per month
          </p>
          <ButtonLink href={modulePath(feature)} variant="primary">
            See what it does <IconArrowRight size={15} />
          </ButtonLink>
        </div>
      </div>
    </Card>
  );
}

/** RBAC guard, frontend half (§4 step 4). */
export function RoleGate({
  allow, children,
}: {
  allow: Role[];
  children: React.ReactNode;
}) {
  const { role, user } = useTenant();
  if (role === "tenant_admin" || allow.includes(role)) return <>{children}</>;

  return (
    <Card className="mx-auto max-w-lg px-6 py-10 text-center">
      <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[var(--r-lg)] bg-surface-3 text-ink-3">
        <IconShield size={20} />
      </span>
      <h2 className="font-display text-title-lg font-semibold text-ink">
        Not available to {ROLE_LABEL[role].toLowerCase()}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-body leading-relaxed text-ink-2">
        {user.name} is signed in as {ROLE_LABEL[role].toLowerCase()}. This module is limited to{" "}
        {allow.map((r) => ROLE_LABEL[r].toLowerCase()).join(", ")} and practice admins.
        Switch role from the avatar menu to see it.
      </p>
    </Card>
  );
}
