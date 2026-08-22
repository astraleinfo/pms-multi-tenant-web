"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store/app-store";
import { useShellReady } from "@/lib/query/hooks";
import { Rail } from "./rail";
import { Topbar } from "./topbar";
import { CommandPalette } from "./command-palette";
import { SuspendedTenantStage, UnknownTenantStage } from "./sign-in-stage";
import { TourProvider } from "@/components/onboarding/tour";
import { StageLoader } from "@/components/ui/loader";

const RAIL_KEY = "astrale-pms.rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { session, ready, host, hostTenant, hostTenantPending } = useApp();
  const shellReady = useShellReady();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNav, setMobileNav] = React.useState(false);
  const [search, setSearch] = React.useState(false);

  React.useEffect(() => {
    try { setCollapsed(localStorage.getItem(RAIL_KEY) === "1"); } catch { /* ignore */ }
  }, []);

  const toggleRail = () => setCollapsed((c) => {
    try { localStorage.setItem(RAIL_KEY, c ? "0" : "1"); } catch { /* ignore */ }
    return !c;
  });

  React.useEffect(() => { setMobileNav(false); }, [pathname]);

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

  function RedirectTo({ href }: { href: string }) {
    React.useEffect(() => { router.replace(href); }, [href]);
    return <StageLoader />;
  }

  if (!ready) {
    return <StageLoader />;
  }

  /* the apex host serves the platform console, which brings its own chrome */
  if (host.kind === "platform") return <>{children}</>;

  /* is there a clinic at this address at all? one public read answers that */
  if (hostTenantPending) {
    return <StageLoader label="Finding this clinic…" />;
  }

  /* a subdomain nobody has claimed, or one the platform has switched off */
  if (!hostTenant) return <UnknownTenantStage slug={host.slug} />;
  if (hostTenant.status === "suspended") return <SuspendedTenantStage name={hostTenant.name} />;

  /* the login page is its own screen, not something inside the shell */
  if (pathname === "/login") return <>{children}</>;
  if (!session.signedIn) return <RedirectTo href="/login" />;

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
          "sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-300 ease-[var(--ease-brand)] lg:block",
        )}
        style={{ width: collapsed ? "var(--rail-w-collapsed)" : "var(--rail-w)" }}
      >
        <Rail collapsed={collapsed} />
      </aside>

      {/* mobile drawer rail */}
      {mobileNav && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-[hsl(var(--sh)/.4)] fade" onClick={() => setMobileNav(false)} aria-hidden />
          <div
            className="relative h-full w-[var(--rail-w)] max-w-[84vw] shadow-e4"
            style={{ animation: "railin var(--d-3) var(--ease-out) both" }}
          >
            <style>{"@keyframes railin{from{transform:translateX(-18px);opacity:.5}to{transform:none;opacity:1}}"}</style>
            <Rail collapsed={false} onNavigate={() => setMobileNav(false)} />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          onToggleRail={toggleRail}
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
