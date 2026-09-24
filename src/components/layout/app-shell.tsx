"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store/app-store";
import { useQueryClient } from "@tanstack/react-query";
import { useShellReady, useTenantRecord } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { onAccountHold } from "@/lib/api/client";
import { BillingBanner, OnHoldStage } from "@/components/domain/subscription";
import { Rail } from "./rail";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { ApexStage, SuspendedTenantStage, UnknownTenantStage } from "./sign-in-stage";
import { PasswordGate } from "./password-gate";
import { SupportBanner } from "./support-banner";
import { TourProvider } from "@/components/onboarding/tour";
import { StageLoader } from "@/components/ui/loader";
import { usePresence } from "@/components/ui/modal";

const RAIL_KEY = "astrale-pms.rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, ready, host, hostTenant, hostTenantPending } = useApp();
  const shellReady = useShellReady();
  const { data: tenantRecord } = useTenantRecord();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const router = useRouter();
  /* Collapsed is the resting state. A clinic screen earns its keep in the
     content, not in a permanently open list of twelve destinations, and the
     rail is one click — or one hover away from a tooltip — either way. */
  const [collapsed, setCollapsed] = React.useState(true);
  const [mobileNav, setMobileNav] = React.useState(false);
  const mobileSheet = usePresence(mobileNav);
  const [search, setSearch] = React.useState(false);

  React.useEffect(() => {
    /* Only an explicit "0" reopens it: an unset key is somebody's first visit,
       and that starts collapsed like everybody else's. */
    try { setCollapsed(localStorage.getItem(RAIL_KEY) !== "0"); } catch { /* ignore */ }
  }, []);

  const toggleRail = () => setCollapsed((c) => {
    try { localStorage.setItem(RAIL_KEY, c ? "0" : "1"); } catch { /* ignore */ }
    return !c;
  });

  React.useEffect(() => { setMobileNav(false); }, [pathname]);

  /* A clinic can be put on hold while somebody is working in it — the
     billing run lands overnight, a tab stays open. The first request the API
     refuses with a 402 re-reads the clinic, and the record says why. */
  const tenantId = session.tenantId;
  React.useEffect(() => {
    onAccountHold(() => {
      if (tenantId) void queryClient.invalidateQueries({ queryKey: qk.tenant(tenantId), exact: true });
    });
    return () => onAccountHold(null);
  }, [queryClient, tenantId]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* The waiting-room screen is a public display: no rail, no topbar. */
  const bare = pathname === "/display";

  /* Screens for somebody who has no session and is not supposed to have one
     yet. They live on a clinic's address because the clinic is the address,
     but none of them is inside the shell. */
  const PUBLIC = ["/login", "/forgot-password", "/accept-invitation", "/reset-password"];
  const isPublic = PUBLIC.includes(pathname);

  function RedirectTo({ href }: { href: string }) {
    React.useEffect(() => { router.replace(href); }, [href]);
    return <StageLoader />;
  }

  if (!ready) {
    return <StageLoader />;
  }

  /* the console has its own address and brings its own chrome */
  if (host.kind === "admin") return <>{children}</>;

  /* the apex is neither a clinic nor the console — there is nothing here to
     sign in to, and saying so is better than a redirect into either */
  if (host.kind === "platform") return <ApexStage />;

  /* is there a clinic at this address at all? one public read answers that */
  if (hostTenantPending) {
    return <StageLoader label="Finding this clinic…" />;
  }

  /* a subdomain nobody has claimed, or one the platform has switched off */
  if (!hostTenant) return <UnknownTenantStage slug={host.slug} />;
  if (hostTenant.status === "suspended") return <SuspendedTenantStage name={hostTenant.name} />;

  /* the sign-in and password screens are their own, not inside the shell */
  if (isPublic) return <>{children}</>;
  if (!session.signedIn) return <RedirectTo href="/login" />;

  /* A password somebody else chose gets one screen and no more, and the server
     agrees — this is not a courtesy a hand-written request could step around. */
  if (session.mustChangePassword) return <PasswordGate>{children}</PasswordGate>;

  /* On hold for an unpaid bill: the server answers nothing but the bill, so
     the bill is the screen. A support session is never held — it is how the
     platform looks into a clinic in exactly this state. */
  if (tenantRecord?.billing_hold && !session.impersonated) return <OnHoldStage />;

  /* the shell decides what to render from what this clinic bought and how it is
     configured — hold the chrome until those have arrived rather than flashing
     a nav that is about to change */
  if (!shellReady) {
    return <StageLoader label="Opening the clinic…" />;
  }

  if (bare) return <>{children}</>;

  return (
    <TourProvider>
    <div className="flex min-h-dvh bg-ground">
      {/* desktop rail */}
      <aside
        className={cn(
          "sticky top-0 z-[45] hidden h-dvh shrink-0 transition-[width] duration-300 ease-[var(--ease-brand)] lg:block",
        )}
        style={{ width: collapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)" }}
      >
        <Rail collapsed={collapsed} onToggle={toggleRail} />
      </aside>

      {/* mobile drawer rail — slides in from its edge, and back out */}
      {mobileSheet.present && (
        <div className={cn("fixed inset-0 z-50 lg:hidden", mobileSheet.leaving && "pointer-events-none")}>
          <div
            className={cn("fixed inset-0 bg-[hsl(var(--sh)/.4)]", mobileSheet.leaving ? "scrim-out" : "scrim")}
            onClick={() => setMobileNav(false)}
            aria-hidden
          />
          <div
            className={cn(
              "relative h-full w-[var(--rail-w)] max-w-[84vw] shadow-e4",
              mobileSheet.leaving ? "sheet-out" : "sheet-in",
            )}
          >
            <Rail collapsed={false} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <SupportBanner />
        <BillingBanner />
        <Topbar
          onOpenSearch={() => setSearch(true)}
          onOpenMobileNav={() => setMobileNav(true)}
        />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[var(--page-max)] px-4 py-6 sm:px-6 sm:py-7">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={search} onClose={() => setSearch(false)} />
    </div>
    </TourProvider>
  );
}
