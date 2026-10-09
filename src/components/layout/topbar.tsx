"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useRailCounters } from "@/lib/query/hooks";
import { navItemFor, ROLE_LABEL } from "@/lib/nav";
import { titleCase } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSep } from "@/components/ui/modal";
import { useTour } from "@/components/onboarding/tour";
import { Avatar, Kbd } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/info";
import {
  IconBell, IconCheck, IconChevronDown, IconLogout, IconMoon, IconReceipt, IconRx, IconFlask,
  IconQueue, IconSearch, IconSidebar, IconSpark, IconSun,
} from "@/components/ui/icons";

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
    <span className="inline-flex items-center gap-1.5" title={label}>
      <span className={cn("h-1.5 w-1.5 rounded-full", tone)} aria-hidden />
      <span className="sr-only">{label}</span>
      {state === "offline" && <span className="text-caption text-critical-text">Reconnecting…</span>}
    </span>
  );
}

/** What to call a page the rail has no entry for. */
function pageTitle(pathname: string) {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ? titleCase(first.replace(/-/g, " ")) : "";
}

/**
 * What is waiting.
 *
 * Deliberately not a feed. Nothing in this product happens *at* a member of
 * staff — there is no "Dr Rahman mentioned you"; there is a queue with four
 * people in it and eleven prescriptions nobody has dispensed. So the bell
 * carries the same four counters the rail does, which are the only four
 * things in the clinic that can be described as waiting, and every line is a
 * link to the screen where the waiting is ended. When all four are zero the
 * dot is absent and the panel says so, rather than inventing news.
 */
function Notifications() {
  const c = useRailCounters();

  const lines = [
    { key: "queue", href: "/queue", icon: <IconQueue size={15} />, n: c.queue,
      label: "waiting in the queue" },
    { key: "rx", href: "/prescriptions", icon: <IconRx size={15} />, n: c.pendingRx,
      label: "prescriptions not dispensed" },
    { key: "lab", href: "/lab", icon: <IconFlask size={15} />, n: c.labPending,
      label: "lab results unverified" },
    { key: "unpaid", href: "/billing", icon: <IconReceipt size={15} />, n: c.unpaid,
      label: "invoices unpaid" },
  ].filter((l) => l.n > 0);

  const total = lines.reduce((s, l) => s + l.n, 0);

  return (
    <Menu
      width={276}
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={total ? `${total} things waiting` : "Nothing waiting"}
          className="relative flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] text-ink-2 transition-colors hover:bg-hover hover:text-ink"
        >
          <IconBell size={17} />
          {/* A count, not a dot with no number: "four people waiting" is
              actionable and "something happened" is not. It is the house blue,
              not alarm red — work waiting is ordinary, and a red badge that is
              never empty trains everyone to ignore red. The ring is the
              topbar's own ground, so the badge reads as sitting on the bell. */}
          {total > 0 && (
            <span className="tnum absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-medium leading-none text-accent-ink ring-2 ring-surface">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <>
          <MenuLabel>Waiting</MenuLabel>
          {lines.length === 0 ? (
            <p className="flex items-center gap-2 px-2.5 py-2 text-label text-ink-3">
              <IconCheck size={15} className="text-ok" /> Nothing is waiting.
            </p>
          ) : (
            lines.map((l) => (
              <Link
                key={l.key}
                href={l.href}
                onClick={close}
                role="menuitem"
                className="flex items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-label text-ink transition-colors hover:bg-hover"
              >
                <span className="text-ink-3">{l.icon}</span>
                <span className="min-w-0 flex-1 truncate">
                  <span className="tnum font-medium">{l.n}</span> {l.label}
                </span>
              </Link>
            ))
          )}
        </>
      )}
    </Menu>
  );
}

/**
 * The header, reduced to what it is for.
 *
 * It used to carry the clinic's name and address, the date, the clinical-type
 * workflow and the page's own title — the clinic twice over if you count the
 * rail, and a page title that the rail's own highlight had already given away.
 * The clinic went back to the rail, where there is one of it; the date went
 * back to the screens that are about the day. What is left says which page
 * this is, and holds the four controls that belong to no page in particular.
 *
 * Search is the one that moved. It sat at the right end with the icons, which
 * put the most-used control in the application in among the least-used ones.
 * It is now the middle of the bar and the widest thing in it, because finding
 * a patient is what somebody at a front desk does forty times a day.
 */
export function Topbar({
  onOpenSearch, onOpenMobileNav,
}: {
  onOpenSearch: () => void;
  onOpenMobileNav: () => void;
}) {
  const pathname = usePathname();
  const { signOut, theme, toggleTheme, connection } = useApp();
  const { user, role } = useTenant();
  const item = navItemFor(pathname);
  const tour = useTour();

  return (
    <header className="sticky top-0 z-30 flex h-[var(--topbar-h)] items-center gap-2 border-b border-line bg-surface px-3 sm:px-4">
      {/* desktop collapses the rail from the rail itself; this is the phone's
          only way to the drawer. The wrapper carries the breakpoint so the
          button's own display utility is never in a specificity race */}
      <span className="lg:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onOpenMobileNav} aria-label="Open menu">
          <IconSidebar size={17} />
        </Button>
      </span>

      <div className="flex min-w-0 items-center gap-2 lg:w-52 lg:shrink-0" data-tour="topbar-context">
        <p className="truncate text-body font-semibold text-ink">{item?.label ?? pageTitle(pathname)}</p>
        <QueueLive state={connection} />
      </div>

      {/* the middle of the bar, and the widest thing in it */}
      <button
        onClick={onOpenSearch}
        data-tour="topbar-search"
        className="group mx-auto hidden h-9 w-full max-w-xl items-center gap-2.5 rounded-[var(--r)] border border-line-strong bg-surface-2 pl-3 pr-1.5 text-label text-ink-3 transition-colors hover:border-ink-3/40 hover:bg-surface hover:text-ink-2 md:flex"
      >
        <IconSearch size={16} className="shrink-0" />
        <span className="flex-1 truncate text-left">Search patients, appointments or records…</span>
        <Kbd>⌘K</Kbd>
      </button>
      <span className="ml-auto md:hidden">
        <Button variant="ghost" size="icon-sm" onClick={onOpenSearch} aria-label="Search">
          <IconSearch size={17} />
        </Button>
      </span>

      <div className="flex shrink-0 items-center gap-1 md:ml-auto lg:w-52 lg:justify-end">
        <Notifications />

        <Tooltip label={theme === "light" ? "Night shift" : "Daylight"} side="top">
          <Button variant="ghost" size="icon-sm" onClick={toggleTheme} aria-label="Toggle theme">
            {theme === "light" ? <IconMoon size={17} /> : <IconSun size={17} />}
          </Button>
        </Tooltip>

        <Menu
          width={248}
          trigger={({ toggle, open }) => (
            <button
              onClick={toggle}
              aria-expanded={open}
              aria-label="Account"
              className="flex items-center gap-2 rounded-[var(--r)] py-1 pl-1 pr-1.5 transition-colors hover:bg-hover"
            >
              <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
              {/* The name is here rather than behind the avatar because two
                  people share a screen at a front desk and "who is this
                  signed in as" should not need a click to answer. It folds
                  away below `lg`, where the avatar alone has to do. */}
              <span className="hidden min-w-0 text-left lg:block">
                <span className="block max-w-[9rem] truncate text-caption font-medium leading-tight text-ink">
                  {user.name}
                </span>
                <span className="block max-w-[9rem] truncate text-micro leading-tight text-ink-3">
                  {ROLE_LABEL[role]}
                </span>
              </span>
              <IconChevronDown size={14} className="hidden shrink-0 text-ink-3 lg:block" />
            </button>
          )}
        >
          {(close) => (
            <>
              <div className="px-2.5 py-2">
                <p className="text-label font-semibold text-ink">{user.name}</p>
                <p className="mt-0.5 text-caption text-ink-3">{user.email}</p>
                <Badge tone="accent" size="sm" className="mt-2">{ROLE_LABEL[role]}</Badge>
              </div>
              <MenuSep />
              <MenuItem icon={<IconSpark size={15} />} onClick={() => { close(); tour.start(); }}>
                Take the tour
              </MenuItem>
              <MenuItem icon={<IconLogout size={15} />} onClick={() => { close(); signOut(); }}>
                Sign out
              </MenuItem>

              {/* The role is the account's, and only a practice admin can change
                  it — so there is nothing to switch to from in here. */}
              <MenuSep />
              <MenuLabel>Signed in as {ROLE_LABEL[role]}</MenuLabel>
            </>
          )}
        </Menu>
      </div>
    </header>
  );
}
