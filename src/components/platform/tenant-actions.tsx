"use client";

import * as React from "react";
import Link from "next/link";
import { useApp } from "@/lib/store/app-store";
import { currency } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { Tenant } from "@/lib/types";
import { buttonClass } from "@/components/ui/button";
import { ConfirmDialog, ConsequenceList } from "./confirm";
import { useEnterClinic } from "./chrome";
import {
  IconCheck, IconEdit, IconExternal, IconLock, IconShield, IconUnlock,
} from "@/components/ui/icons";

/* ==========================================================================
   What you can do to a clinic from a table row.

   Four icons rather than a menu behind three dots. A console row has exactly
   four things worth doing to it, they are the same four on every row, and
   hiding them one click deep bought nothing except a second click — the icons
   carry `title` and `aria-label`, so the shorthand is never the only label.
   ========================================================================== */

/** A row action: same box as an icon button, whether it is a button or a link. */
const actionClass = (tone?: "critical") =>
  cn(
    buttonClass({ variant: "ghost", size: "icon-sm" }),
    tone === "critical" && "text-critical-text hover:bg-critical-soft hover:text-critical-text",
  );

export function TenantRowActions({ tenant }: { tenant: Tenant }) {
  const { clinicUrl } = useApp();
  const { enter, entering } = useEnterClinic();
  const status = useTenantStatusSwitch();
  const suspended = tenant.status === "suspended";

  return (
    <div className="flex items-center justify-end gap-0.5">
      <button
        type="button"
        className={actionClass()}
        title={`Open ${tenant.name} as platform support`}
        aria-label={`Open ${tenant.name} as platform support`}
        disabled={entering === tenant.id}
        onClick={() => { void enter(tenant); }}
      >
        <IconShield size={15} />
      </button>

      {/* The bare address, for the rare time you want to see what a member of
          this clinic's staff sees when they arrive — the sign-in screen itself,
          with no session attached. */}
      <a
        href={clinicUrl(tenant.slug)}
        target="_blank"
        rel="noopener noreferrer"
        className={actionClass()}
        title={`Open ${tenant.name}'s sign-in page`}
        aria-label={`Open ${tenant.name}'s sign-in page`}
      >
        <IconExternal size={15} />
      </a>

      <Link
        href={`/platform/tenants/${tenant.id}`}
        className={actionClass()}
        title={`Manage ${tenant.name}`}
        aria-label={`Manage ${tenant.name}`}
      >
        <IconEdit size={15} />
      </Link>

      <button
        type="button"
        className={actionClass(suspended ? undefined : "critical")}
        title={suspended ? `Reactivate ${tenant.name}` : `Suspend ${tenant.name}`}
        aria-label={suspended ? `Reactivate ${tenant.name}` : `Suspend ${tenant.name}`}
        onClick={() => status.request(tenant, suspended ? "active" : "suspended")}
      >
        {suspended ? <IconUnlock size={15} /> : <IconLock size={15} />}
      </button>

      {status.dialog}
    </div>
  );
}

/* ---- suspending, with a sentence in front of it ---------------------------- */

interface Pending {
  tenant: Tenant;
  next: Tenant["status"];
}

/**
 * Take a clinic's subdomain offline, or put it back.
 *
 * Not an edit, which is why it has never lived in the edit form: suspending
 * stops a whole practice signing in, mid-day, with no warning to the people it
 * happens to. So it asks first, and it says what the address will serve
 * afterwards.
 */
export function useTenantStatusSwitch() {
  const { setTenantStatus, notify } = useApp();
  const [ask, setAsk] = React.useState<Pending | null>(null);

  const request = React.useCallback(
    (tenant: Tenant, next: Tenant["status"]) => setAsk({ tenant, next }),
    [],
  );

  const confirm = React.useCallback(() => {
    if (!ask) return;
    const { tenant, next } = ask;
    setTenantStatus(tenant.id, next);
    notify(
      next === "suspended"
        ? {
          tone: "warn",
          title: `${tenant.name} suspended`,
          body: "Nobody can sign in on that subdomain now, and it stops being billed.",
        }
        : {
          tone: "ok",
          title: `${tenant.name} reactivated`,
          body: "Its subdomain serves the app again and its subscriptions resume.",
        },
    );
    setAsk(null);
  }, [ask, setTenantStatus, notify]);

  const dialog = (
    <ConfirmDialog
      open={!!ask}
      onClose={() => setAsk(null)}
      onConfirm={confirm}
      tone={ask?.next === "suspended" ? "danger" : "primary"}
      title={ask ? `${ask.next === "suspended" ? "Suspend" : "Reactivate"} ${ask.tenant.name}?` : ""}
      subtitle={ask ? `${ask.tenant.slug} — ${ask.tenant.city}` : undefined}
      confirmLabel={ask?.next === "suspended" ? "Suspend clinic" : "Reactivate clinic"}
    >
      {ask && <StatusConsequences {...ask} />}
    </ConfirmDialog>
  );

  return { request, dialog };
}

function StatusConsequences({ tenant, next }: Pending) {
  if (next === "suspended") {
    return (
      <ConsequenceList
        items={[
          <>
            <strong className="font-medium text-ink">{tenant.slug}</strong> stops serving the app and
            serves a notice instead. Everyone signed in is signed out at their next request.
          </>,
          <>Its subscription goes on hold — no bill is raised while it stays suspended.</>,
          <>
            <strong className="font-medium text-ink">No data is touched.</strong> Patients, records
            and invoices are exactly where they were, and reactivating puts the clinic back as it was.
          </>,
        ]}
      />
    );
  }
  return (
    <ConsequenceList
      items={[
        <>
          <strong className="font-medium text-ink">{tenant.slug}</strong> serves the app again and
          its staff can sign in with the passwords they already had.
        </>,
        <>Modules it held come off hold and resume billing at their catalogue price.</>,
        <>Its first admin may still need a fresh invitation if they never accepted the original.</>,
      ]}
    />
  );
}

/** The one-line version for a detail page header, where there is room for words. */
export function TenantStatusButton({ tenant }: { tenant: Tenant }) {
  const status = useTenantStatusSwitch();
  const suspended = tenant.status === "suspended";
  return (
    <>
      <button
        type="button"
        className={cn(
          buttonClass({ variant: suspended ? "primary" : "secondary" }),
          !suspended && "text-critical-text",
        )}
        onClick={() => status.request(tenant, suspended ? "active" : "suspended")}
      >
        {suspended ? <><IconCheck size={15} /> Reactivate clinic</> : <><IconLock size={15} /> Suspend clinic</>}
      </button>
      {status.dialog}
    </>
  );
}

/** What a clinic pays a month, printed where a row has room for one figure. */
export function MonthlyCharge({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={cn("tnum font-mono text-label", amount > 0 ? "text-ink" : "text-ink-3", className)}>
      {amount > 0 ? `${currency(amount)}/mo` : "—"}
    </span>
  );
}
