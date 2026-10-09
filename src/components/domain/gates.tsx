"use client";

import * as React from "react";
import { useTenant } from "@/lib/store/app-store";
import { ROLE_LABEL } from "@/lib/nav";
import type { Role } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { IconShield } from "@/components/ui/icons";

/**
 * RBAC guard, frontend half (§4 step 3). Every clinic has every module; what
 * this answers is whether this person's role may use the one in front of them.
 * It hides UI — the server's permission guard is the enforcement.
 */
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
