"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useSession } from "@/lib/store/session";
import { IconExternal, IconLogout, IconShield } from "@/components/ui/icons";

/**
 * Platform staff are working inside this clinic.
 *
 * A support session looks exactly like a practice admin's from the inside —
 * that is what makes it useful — so the one thing that must not be subtle is
 * that it is not one. This sits above the topbar, in a colour nothing else in
 * the product uses, and does not scroll away.
 *
 * It is a courtesy to whoever is holding the session, not a control: the
 * server has already recorded who opened it, and every line the session writes
 * to the audit trail names them rather than the clinic account it writes
 * through. Hiding this banner would change nothing about that.
 */
export function SupportBanner() {
  const { session, hostTenant, consoleUrl } = useApp();
  const { platformUser, endSession } = useSession();

  if (!session.impersonated) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-warn-border bg-warn-soft px-4 py-2 text-label text-warn-text sm:px-6"
    >
      <span className="flex min-w-0 items-center gap-2">
        <IconShield size={15} className="shrink-0" />
        <span className="min-w-0">
          <strong className="font-semibold">Platform support session</strong>
          {platformUser && (
            <span className="hidden sm:inline"> — signed in as {platformUser.name}</span>
          )}
          <span className="hidden md:inline">
            {hostTenant ? ` inside ${hostTenant.name}` : ""}. Everything you do here is
            recorded against you, not against this clinic&rsquo;s staff.
          </span>
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-3">
        <a
          href={consoleUrl()}
          className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          Console <IconExternal size={13} />
        </a>
        <button
          type="button"
          onClick={endSession}
          className="inline-flex items-center gap-1.5 font-medium underline-offset-4 hover:underline"
        >
          End session <IconLogout size={13} />
        </button>
      </span>
    </div>
  );
}
