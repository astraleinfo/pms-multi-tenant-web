"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { NavigationPending, useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import type { Id, Tenant } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { StageLoader } from "@/components/ui/loader";
import { IconExternal, IconLock, IconSidebar } from "@/components/ui/icons";
import { PlatformMark } from "./rail";
import { isSuperAdmin } from "@/lib/api";
import { ConsoleRail } from "./rail";

/* ==========================================================================
   The console's own chrome.

   Deliberately not the clinic's: a different bar, a different colour, and the
   address it is served on printed under the name. Platform staff move between
   two products in one browser, and the one thing worse than an ugly console is
   one that looks enough like a clinic to be mistaken for it.

   The shape underneath is the clinic app's own, though — a collapsible desktop
   rail, a mobile drawer, the same layout constants — because a platform
   operator who knows one should recognise the other instead of relearning it.
   ========================================================================== */

const RAIL_KEY = "astrale-pms.console-rail";

/**
 * The console's frame: signed in, wrapped in the rail, inside the container
 * every section shares. Mounted once by the console's layout, so moving between
 * sections swaps only the page — the rail stays where it is, open or collapsed.
 *
 * The guard is here, in the browser, because the session lives there — and
 * because a console page that flashed its tenant list before redirecting would
 * be showing every clinic on the platform to somebody who is not signed in.
 * The sign-in page is the one console address that brings no frame.
 */
export function ConsoleChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const signIn = pathname === "/platform/login";
  const router = useRouter();
  const { platformSession, ready } = useApp();
  /* Five destinations is nothing to hide behind icons, where the clinic
     rail's twelve was — so, unlike that one, this rail rests open. */
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);

  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(RAIL_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  const toggleRail = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem(RAIL_KEY, next ? "1" : "0"); } catch { /* ignore */ }
      return next;
    });
  };

  React.useEffect(() => {
    if (!signIn && ready && !platformSession.signedIn) router.replace("/platform/login");
  }, [signIn, ready, platformSession.signedIn, router]);

  if (signIn) return children;
  if (!ready || !platformSession.signedIn) return <StageLoader />;

  return (
    <div className="flex min-h-dvh bg-ground">
      {/* desktop rail */}
      <aside
        className="sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-300 ease-[var(--ease-brand)] lg:block"
        style={{ width: collapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)" }}
      >
        <ConsoleRail collapsed={collapsed} onToggle={toggleRail} />
      </aside>

      {/* mobile drawer rail */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-[hsl(var(--sh)/.4)] fade"
            onClick={() => setMobileNav(false)}
            aria-hidden
          />
          <div
            className="relative h-full w-[var(--rail-w)] max-w-[84vw] shadow-e4"
            style={{ animation: "railin var(--d-3) var(--ease-out) both" }}
          >
            <style>{"@keyframes railin{from{transform:translateX(-18px);opacity:.5}to{transform:none;opacity:1}}"}</style>
            <ConsoleRail collapsed={false} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* the mobile-only strip: the rail is a drawer below `lg`, so this is
            the one thing worth keeping on screen at all times instead — a
            way back into it. */}
        <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] shrink-0 items-center gap-3 border-b border-line-soft bg-surface px-4 lg:hidden">
          <Button variant="ghost" size="icon-sm" onClick={() => setMobileNav(true)} aria-label="Open menu">
            <IconSidebar size={17} />
          </Button>
          <span className="flex h-7 shrink-0 items-center rounded-[9px] bg-stage px-2" aria-hidden>
            <PlatformMark height={13} />
          </span>
        </header>

        <main className="relative min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6">
            {children}
          </div>
          <NavigationPending className="mx-auto w-full max-w-[1440px] px-4 py-7 sm:px-6" />
        </main>
      </div>
    </div>
  );
}

/**
 * A console section. The frame is the layout's; this is only the question of
 * whether the section is this operator's to see.
 */
export function ConsolePage({
  children, superAdmin,
}: {
  children: React.ReactNode;
  /** this section is the platform's own machinery, not the support desk's */
  superAdmin?: boolean;
}) {
  const { platformUser } = useApp();
  /* Not a redirect. Somebody who followed a link to a section that is not
     theirs should be told so, and left where they are — bouncing them to the
     overview reads as a broken link rather than as an answer. The API has
     already refused the data either way. */
  if (superAdmin && !isSuperAdmin(platformUser)) return <NotYourSection />;
  return children;
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
