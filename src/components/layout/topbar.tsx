"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { navItemFor, ROLE_LABEL } from "@/lib/nav";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSep } from "@/components/ui/modal";
import { useTour } from "@/components/onboarding/tour";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import {
  IconCheck, IconChevronDown, IconExternal, IconLayers, IconLogout, IconMoon, IconSearch,
  IconSpark,
  IconSidebar, IconSun,
} from "@/components/ui/icons";
import { Monogram } from "./rail";

/**
 * Whether the queue socket is carrying live updates (§3.6). Silent when it is —
 * a live connection is the expectation, so it earns a dot and nothing more, and
 * only says something when it has dropped.
 */
function QueueLive({ state }: { state: "connecting" | "live" | "offline" }) {
  const tone = state === "live" ? "bg-ok" : state === "connecting" ? "bg-warn" : "bg-critical";
  const label = state === "live"
    ? "Queue updates are live"
    : state === "connecting"
      ? "Connecting to queue updates"
      : "Queue updates are offline — reconnecting";
  return (
    <span className="ml-2 inline-flex items-center gap-1.5 align-middle" title={label}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} aria-hidden />
      <span className="sr-only">{label}</span>
      {state === "offline" && <span className="text-critical-text">Reconnecting…</span>}
    </span>
  );
}

export function Topbar({
  onToggleRail, onOpenSearch, onOpenMobileNav,
}: {
  onToggleRail: () => void;
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const { session, host, signOut, theme, toggleTheme, today, notify, clinicUrl, consoleUrl, connection } = useApp();
  const { tenant, user, role } = useTenant();
  const item = navItemFor(pathname);
  const tour = useTour();
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md sm:px-6">
      {/* one control, two behaviours — a wrapper carries the breakpoint so the
          button's own display utility is never in a specificity race */}
      <span className="hidden lg:block">
        <Button variant="ghost" size="icon-sm" onClick={onToggleRail} aria-label="Collapse sidebar">
          <IconSidebar size={17} />
        </Button>
      </span>
      <span className="lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onOpenMobileNav} aria-label="Open menu">
          <IconSidebar size={17} />
        </Button>
      </span>

      <div className="min-w-0 flex-1" data-tour="topbar-context">
        <p className="truncate text-[0.9375rem] font-semibold tracking-[-0.01em] text-ink">
          {item?.label ?? "Astrale"}
        </p>
        <p className="hidden truncate text-[0.75rem] text-ink-3 sm:block">
          {formatDate(today, "day")} · {clinical.label} workflow
          <QueueLive state={connection} />
        </p>
      </div>

      <button
        onClick={onOpenSearch}
        data-tour="topbar-search"
        className="group hidden h-9 items-center gap-2.5 rounded-[var(--r)] border border-line-strong bg-surface-2 pl-3 pr-2 text-[0.8125rem] text-ink-3 transition-colors hover:border-ink-3/40 hover:text-ink-2 md:flex md:w-64 lg:w-80"
      >
        <IconSearch size={15} />
        <span className="flex-1 text-left">Search patients, modules…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <span className="md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onOpenSearch} aria-label="Search">
          <IconSearch size={17} />
        </Button>
      </span>

      {/* the clinic is the address — this menu leaves for another host, it does
          not swap a value inside the app */}
      <Menu
        width={300}
        trigger={({ toggle, open }) => (
          <button
            onClick={toggle}
            aria-expanded={open}
            className="flex h-9 items-center gap-2 rounded-[var(--r)] border border-line-strong bg-surface pl-1.5 pr-2 transition-colors hover:bg-surface-2"
          >
            <Monogram name={tenant.name} size={24} />
            <span className="hidden max-w-[150px] truncate text-left lg:block">
              <span className="block truncate text-[0.8125rem] font-medium leading-tight text-ink">{tenant.name}</span>
              <span className="tnum block truncate font-mono text-[0.6875rem] leading-tight text-ink-3">
                {tenant.slug}.{host.root}
              </span>
            </span>
            <IconChevronDown size={14} className="shrink-0 text-ink-3" />
          </button>
        )}
      >
        {() => (
          <>
            <MenuLabel>Signed in at</MenuLabel>
            <div className="flex items-center gap-2.5 rounded-[var(--r-sm)] bg-accent-soft px-2 py-2">
              <Monogram name={tenant.name} size={28} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium text-ink">{tenant.name}</span>
                <span className="tnum block truncate font-mono text-[0.6875rem] text-ink-2">
                  {tenant.slug}.{host.root}{host.port ? `:${host.port}` : ""}
                </span>
              </span>
              <IconCheck size={15} className="shrink-0 text-accent-text" />
            </div>

            {/* There is no list of other clinics here any more, and that is
                the point: signed in at this address you cannot see that any
                other clinic exists. The API would not tell us if we asked. */}
            <MenuSep />
            <a
              role="menuitem"
              href={consoleUrl()}
              className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[0.8438rem] text-ink transition-colors hover:bg-surface-3"
            >
              <IconLayers size={15} className="text-ink-3" />
              <span className="flex-1">Platform console</span>
              <IconExternal size={14} className="text-ink-3" />
            </a>
            <p className="px-2.5 pb-1.5 pt-2 text-[0.6875rem] leading-snug text-ink-3">
              Opening another clinic means a different host and a different sign-in — sessions never cross.
            </p>
          </>
        )}
      </Menu>

      <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme"
              title={theme === "light" ? "Night shift" : "Daylight"}>
        {theme === "light" ? <IconMoon size={17} /> : <IconSun size={17} />}
      </Button>

      {/* role / user switcher — shows the RBAC guard changing the nav */}
      <Menu
        width={252}
        trigger={({ toggle, open }) => (
          <button onClick={toggle} aria-expanded={open} className="rounded-full ring-offset-2 transition-transform hover:scale-[1.04]">
            <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
          </button>
        )}
      >
        {(close) => (
          <>
            <div className="px-2.5 py-2">
              <p className="text-[0.8438rem] font-semibold text-ink">{user.name}</p>
              <p className="mt-0.5 text-[0.75rem] text-ink-3">{user.email}</p>
              <Badge tone="accent" size="sm" className="mt-2">{ROLE_LABEL[role]}</Badge>
            </div>
            <MenuSep />
            <MenuItem
              icon={<IconSpark size={15} />}
              onClick={() => { close(); tour.start(); }}
            >
              Take the tour
            </MenuItem>
            <MenuItem
              icon={<IconLogout size={15} />}
              onClick={() => { close(); signOut(); }}
            >
              Sign out
            </MenuItem>

            {/* The role is the account's, and only a practice admin can change
                it — so there is nothing to switch to from in here. */}
            <MenuSep />
            <MenuLabel>Signed in as {ROLE_LABEL[role]}</MenuLabel>
          </>
        )}
      </Menu>
    </header>
  );
}
