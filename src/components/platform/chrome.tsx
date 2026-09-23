"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import type { Id, Tenant } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/misc";
import { Menu, MenuItem, MenuSep } from "@/components/ui/modal";
import { StageLoader } from "@/components/ui/loader";
import {
  IconExternal, IconLayers, IconLock, IconLogout, IconPulse, IconReceipt, IconShield, IconUsers,
} from "@/components/ui/icons";
import { isSuperAdmin } from "@/lib/api";

/* ==========================================================================
   The console's own chrome.

   Deliberately not the clinic's: a different bar, a different colour, and the
   address it is served on printed under the name. Platform staff move between
   two products in one browser, and the one thing worse than an ugly console is
   one that looks enough like a clinic to be mistaken for it.
   ========================================================================== */

/**
 * Where the console goes, in the order it is worked.
 *
 * `superAdmin` on a section means it is not shown to the support desk. Read
 * that as housekeeping rather than as security: the API refuses those routes
 * to anybody but a super admin whatever this array says, and it answers 403
 * rather than 401 so a hand-typed URL is refused on who is asking, not on
 * whether they are signed in.
 */
const SECTIONS = [
  {
    href: "/platform" as const,
    label: "Overview",
    icon: <IconLayers size={15} />,
    blurb: "Everything at once",
  },
  {
    href: "/platform/tenants" as const,
    label: "Tenants",
    icon: <IconUsers size={15} />,
    blurb: "Every clinic, filtered",
  },
  {
    href: "/platform/modules" as const,
    label: "Modules & pricing",
    icon: <IconLayers size={15} />,
    blurb: "Pricing, subscriptions, access",
  },
  {
    href: "/platform/billing" as const,
    label: "Bills",
    icon: <IconReceipt size={15} />,
    blurb: "Monthly bills, reminders and holds",
  },
  {
    href: "/platform/jobs" as const,
    label: "Background jobs",
    icon: <IconPulse size={15} />,
    blurb: "Celery queues, workers and failures",
    superAdmin: true,
  },
];

/**
 * A console page: signed in, wrapped in the platform bar, inside the container
 * every section shares.
 *
 * The guard is here rather than in a layout because the layout is a server
 * component and the session lives in the browser — and because a console page
 * that flashed its tenant list before redirecting would be showing every clinic
 * on the platform to somebody who is not signed in.
 */
export function ConsolePage({
  children, superAdmin,
}: {
  children: React.ReactNode;
  /** this section is the platform's own machinery, not the support desk's */
  superAdmin?: boolean;
}) {
  const router = useRouter();
  const { platformSession, platformUser, ready } = useApp();

  React.useEffect(() => {
    if (ready && !platformSession.signedIn) router.replace("/platform/login");
  }, [ready, platformSession.signedIn, router]);

  if (!ready || !platformSession.signedIn) return <StageLoader />;

  /* Not a redirect. Somebody who followed a link to a section that is not
     theirs should be told so, and left where they are — bouncing them to the
     overview reads as a broken link rather than as an answer. The API has
     already refused the data either way. */
  const refused = superAdmin && !isSuperAdmin(platformUser);

  return (
    <div className="min-h-dvh bg-ground">
      <ConsoleBar />
      <main className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6">
        {refused ? <NotYourSection /> : children}
      </main>
    </div>
  );
}

function NotYourSection() {
  return (
    <div className="mx-auto max-w-lg py-16">
      <EmptyState
        icon={<IconLock size={20} />}
        title="This section is for super admins"
        body="Background jobs read the platform's own machinery — the workers, the broker, and the arguments every job was called with. Your console account is on the support desk, which covers everything else here."
        action={
          <Button variant="secondary" size="sm" onClick={() => history.back()}>Go back</Button>
        }
      />
    </div>
  );
}

function ConsoleBar() {
  const { host, platformUser, platformSignOut } = useApp();
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-stage text-stage-ink">
      <div className="mx-auto flex h-[var(--topbar-h)] w-full max-w-[1440px] items-center gap-3 px-4 sm:px-6">
        <Link href="/platform" className="flex min-w-0 items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink" aria-hidden>
            <IconShield size={17} />
          </span>
          <div className="min-w-0">
            <p className="truncate font-display text-body font-semibold leading-tight">
              Astrale Platform
            </p>
            <p className="tnum truncate font-mono text-micro text-stage-dim">
              admin.{host.root}{host.port ? `:${host.port}` : ""}
            </p>
          </div>
        </Link>

        <div className="flex-1" />

        <Badge
          tone={isSuperAdmin(platformUser) ? "accent" : "neutral"}
          size="sm"
          className="hidden sm:inline-flex"
        >
          {isSuperAdmin(platformUser) ? "Super admin" : "Support desk"}
        </Badge>

        {platformUser && (
          <Menu
            width={230}
            trigger={({ toggle }) => (
              <button
                onClick={toggle}
                className="flex items-center gap-2 rounded-[var(--r)] px-1.5 py-1 transition-colors hover:bg-white/10"
              >
                <Avatar name={platformUser.name} initials={platformUser.initials} size="xs" tintKey={platformUser.id} />
                <span className="hidden text-label font-medium sm:block">{platformUser.name}</span>
              </button>
            )}
          >
            {() => (
              <>
                <div className="px-2.5 py-2">
                  <p className="text-label font-semibold text-ink">{platformUser.name}</p>
                  <p className="mt-0.5 text-caption text-ink-3">{platformUser.email}</p>
                  <p className="mt-1.5 text-micro text-ink-3">{platformUser.title}</p>
                </div>
                <MenuSep />
                <MenuItem icon={<IconLogout size={15} />} onClick={platformSignOut}>Sign out</MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>

      {/* The sections, as a rail under the bar rather than inside it — three
          destinations with room for their names beats three crowded words. */}
      <nav className="mx-auto flex w-full max-w-[1440px] items-center gap-0.5 overflow-x-auto px-4 sm:px-6" aria-label="Console sections">
        {SECTIONS.filter((s) => !s.superAdmin || isSuperAdmin(platformUser)).map((section) => {
          /* `/platform` is a prefix of everything, so only its own path lights it */
          const on = section.href === "/platform"
            ? pathname === "/platform"
            : pathname.startsWith(section.href);
          return (
            <Link
              key={section.href}
              href={section.href}
              aria-current={on ? "page" : undefined}
              title={section.blurb}
              /* The same three-way active state as `Tabs` — rule, colour and
                 weight — restated for a dark ground, where the app's accent
                 text token would be too dark to read. */
              className={cn(
                "-mb-px flex shrink-0 items-center gap-2 rounded-t-[var(--r-sm)] border-b-2 px-3 py-2",
                "text-label transition-colors duration-150 ease-[var(--ease-brand)]",
                on
                  ? "border-accent font-semibold text-stage-ink"
                  : "border-transparent font-medium text-stage-dim hover:bg-white/[0.06] hover:text-stage-ink",
              )}
            >
              {section.icon}
              {section.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

/* ---- entering a clinic ---------------------------------------------------- */

/**
 * Open a clinic from the console, already signed in.
 *
 * This is what "navigate to a clinic" means for platform staff. They have no
 * account inside any clinic and never will, so without a support session the
 * only thing a clinic address can show them is its sign-in screen — which is
 * a dead end, because there is nothing they could type into it.
 *
 * The token is handed to the clinic tab in the URL fragment. Browsers do not
 * send a fragment to a server, so it never reaches a proxy or an access log;
 * the clinic tab reads it once, wipes it from the address bar, and holds it in
 * memory like any other access token.
 *
 * Opening one is an audit line in that clinic's trail, and so is everything it
 * goes on to do. That is the trade being made every time this runs, which is
 * why it is one function rather than a thing each call site improvises.
 */
export function useEnterClinic() {
  const { openSupportSession, notify } = useApp();
  const [entering, setEntering] = React.useState<Id | null>(null);

  const enter = React.useCallback(async (tenant: Tenant, path = "/dashboard") => {
    setEntering(tenant.id);
    try {
      const opened = await openSupportSession(tenant.id);
      window.open(
        `${opened.url}${path}#support_token=${encodeURIComponent(opened.access_token)}`,
        "_blank",
        "noopener,noreferrer",
      );
      notify({
        tone: "warn",
        title: `Support session opened in ${tenant.name}`,
        body: "Recorded against you, not against this clinic's staff. It expires on its own.",
      });
    } catch (error) {
      notify({
        tone: "critical",
        title: `Could not open ${tenant.name}`,
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setEntering(null);
  }, [openSupportSession, notify]);

  return { enter, entering };
}

/** A clinic's address, which opens as support on an ordinary click. */
export function TenantAddress({ tenant, className }: { tenant: Tenant; className?: string }) {
  const { host, clinicUrl } = useApp();
  const { enter, entering } = useEnterClinic();

  /* Still an anchor, and its href is still the clinic's real address, so
     middle-click and "open in new tab" behave the way the underline promises.
     The click handler is what upgrades an ordinary visit into a signed-in one;
     the fallback is the sign-in screen, which is where those gestures land. */
  return (
    <a
      href={clinicUrl(tenant.slug)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        void enter(tenant);
      }}
      title={`Open ${tenant.name} as platform support`}
      className={cn(
        "tnum inline-flex items-center gap-1.5 font-mono text-label text-accent-text underline-offset-4 hover:underline",
        className,
      )}
    >
      {tenant.slug}.{host.root}
      {entering === tenant.id
        ? <span className="text-micro text-ink-3">opening…</span>
        : <IconExternal size={12} />}
    </a>
  );
}
