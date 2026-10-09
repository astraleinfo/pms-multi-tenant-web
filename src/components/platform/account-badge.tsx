"use client";

import type { AccountState } from "@/lib/platform/subscriptions";
import { Badge, type Tone } from "@/components/ui/badge";

/* ==========================================================================
   What a clinic is set up to pay, as one chip.

   Colour only where it means something. The house rule is in `globals.css`:
   red, amber and emerald are reserved for state and never spent on
   decoration. A paying clinic is the ordinary, healthy, uninteresting case —
   painting it emerald turns a console with everything working into a wall of
   green — so it reads as plain as "exempt", and the only coloured chips left
   are the ones worth walking towards.
   ========================================================================== */

export const ACCOUNT_LABEL: Record<AccountState, string> = {
  billed: "Paying",
  trial: "Trial",
  held: "On hold",
  exempt: "Exempt",
};

export const ACCOUNT_TONE: Record<AccountState, Tone> = {
  billed: "neutral",
  trial: "warn",
  held: "critical",
  exempt: "neutral",
};

export function AccountBadge({ state, size = "sm" }: { state: AccountState; size?: "sm" | "md" }) {
  return (
    <Badge tone={ACCOUNT_TONE[state]} size={size} dot={state === "trial" || state === "held"}>
      {ACCOUNT_LABEL[state]}
    </Badge>
  );
}
