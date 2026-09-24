"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV, ROLE_LABEL, modulePath, roleAllows } from "@/lib/nav";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useRailCounters, useSupportInfo } from "@/lib/query/hooks";
import { telHref } from "@/lib/support";
import {
  IconChevronDown, IconInfo, IconLock, IconLogout, IconMail, IconPhone, IconSidebar, IconSpark,
} from "@/components/ui/icons";
import { Tooltip } from "@/components/ui/info";
import { Menu, MenuItem, MenuLabel, MenuSep } from "@/components/ui/modal";
import { useTour } from "@/components/onboarding/tour";
import { Avatar } from "@/components/ui/misc";

/** The clinic monogram — two initials on an accent tile. */
export function Monogram({ name, size = 28 }: { name: string; size?: number }) {
  const letters = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-accent font-display font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {letters}
    </span>
  );
}

/**
 * The rail.
 *
 * Two things changed here and they are the same change. The product's name is
 * gone from the top — inside a clinic, the only name that answers "where am
 * I?" is the clinic's, and "Astrale / Practice OS" was answering a question
 * nobody in a surgery is asking. And the four category headings are gone —
 * TODAY, CLINICAL, OPERATIONS, PRACTICE were four lines of shouting capitals
 * over twelve destinations that are perfectly recognisable by their own
 * names. What is left is the clinic, the list, and the person signed in.
 *
 * The grouping itself was not wrong, only its labels, so the groups survive
 * as an unlabelled hairline between runs of items — enough to break twelve
 * rows into a shape the eye can land in, with nothing to read.
 */
export function Rail({
  collapsed, onToggle, onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { hasFeature, signOut, host, consoleUrl } = useApp();
  const { tenant, user, role } = useTenant();
  const counters = useRailCounters();

  /* one flat list, with a note of where a group used to start */
  const items = React.useMemo(
    () =>
      NAV.flatMap((group, gi) =>
        group.items
          .filter((i) => roleAllows(i, role))
          .map((item, ii) => ({ ...item, divide: gi > 0 && ii === 0 })),
      ),
    [role],
  );

  return (
    <div className="flex h-full flex-col border-r border-rail-line bg-rail text-rail-ink">
      {/* the clinic, and the control that folds this away */}
      <div
        data-tour="rail-tenant"
        className={cn(
          "flex h-[var(--topbar-h)] shrink-0 items-center gap-1.5 border-b border-rail-line",
          collapsed ? "justify-center px-2" : "pl-2.5 pr-1.5",
        )}
      >
        {collapsed ? (
          <Tooltip label={`${tenant.name} — expand`}>
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              className="rounded-[var(--r-sm)] p-0.5 transition-opacity hover:opacity-80"
            >
              <Monogram name={tenant.name} size={28} />
            </button>
          </Tooltip>
        ) : (
          <>
            <Menu
              align="start"
              width={286}
              className="min-w-0 flex-1"
              trigger={({ toggle, open }) => (
                <button
                  onClick={toggle}
                  aria-expanded={open}
                  className="flex w-full min-w-0 items-center gap-2 rounded-[var(--r-sm)] px-1.5 py-1.5 text-left transition-colors hover:bg-rail-2"
                >
                  <Monogram name={tenant.name} size={26} />
                  <span className="min-w-0 flex-1 truncate text-label font-semibold text-rail-ink-strong">
                    {tenant.name}
                  </span>
                  <IconChevronDown size={14} className="shrink-0 text-rail-ink-dim" />
                </button>
              )}
            >
              {() => (
                <>
                  <MenuLabel>Signed in at</MenuLabel>
                  <div className="px-2.5 pb-1.5">
                    <p className="truncate text-label font-medium text-ink">{tenant.name}</p>
                    <p className="tnum truncate font-mono text-micro text-ink-3">
                      {tenant.slug}.{host.root}{host.port ? `:${host.port}` : ""}
                    </p>
                  </div>
                  {tenant.status === "trial" && (
                    <p className="mx-2.5 mb-1 rounded-[var(--r-sm)] bg-accent-soft px-2 py-1 text-micro font-medium text-accent-text">
                      Trial plan
                    </p>
                  )}
                  <MenuSep />
                  {/* There is no list of other clinics here, and that is the
                      point: signed in at this address you cannot see that any
                      other clinic exists. The API would not tell us if we
                      asked — another clinic means another host and another
                      sign-in. */}
                  <a
                    role="menuitem"
                    href={consoleUrl()}
                    className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-label text-ink transition-colors hover:bg-hover"
                  >
                    Platform console
                  </a>
                </>
              )}
            </Menu>
            {/* the mobile drawer has no collapsed state to go to, so it is
                handed no toggle and shows none */}
            {onToggle && (
              <Tooltip label="Collapse sidebar">
                <button
                  onClick={onToggle}
                  aria-label="Collapse sidebar"
                  className="shrink-0 rounded-[var(--r-sm)] p-1.5 text-rail-ink-dim transition-colors hover:bg-rail-2 hover:text-rail-ink-strong"
                >
                  <IconSidebar size={16} />
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {/* the list */}
      <nav
        data-tour="rail-nav"
        className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2", collapsed ? "px-2" : "px-2")}
        aria-label="Modules"
      >
        <ul className="space-y-px">
          {items.map((item) => {
            const locked = item.feature ? !hasFeature(item.feature) : false;
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            const count = item.counter ? counters[item.counter] : 0;
            const Icon = item.icon;

            const link = (
              <Link
                href={locked && item.feature ? modulePath(item.feature) : item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex h-8.5 items-center gap-2.5 rounded-[var(--r-sm)] text-label",
                  "transition-colors duration-150 ease-[var(--ease-brand)]",
                  collapsed ? "justify-center px-0" : "px-2.5",
                  active
                    ? "bg-accent-soft font-medium text-accent-text"
                    : locked
                      ? "font-normal text-rail-ink-dim hover:bg-rail-2 hover:text-rail-ink"
                      : "font-normal text-rail-ink hover:bg-rail-2 hover:text-rail-ink-strong",
                )}
              >
                <Icon size={17} className="shrink-0" />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                {!collapsed && locked && <IconLock size={13} className="shrink-0 opacity-70" />}
                {!collapsed && !locked && count > 0 && (
                  <span className="tnum shrink-0 rounded-[var(--r-pill)] bg-rail-3 px-1.5 py-px font-mono text-micro leading-[1.45] text-rail-ink">
                    {count}
                  </span>
                )}
                {/* collapsed: a padlock in the corner for a module this clinic
                    has not been given, a dot for one with something waiting */}
                {collapsed && locked && (
                  <IconLock size={10} className="absolute bottom-1 right-1 opacity-75" />
                )}
                {collapsed && !locked && count > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                )}
              </Link>
            );

            return (
              <li key={item.href} className={cn(item.divide && "mt-1.5 border-t border-rail-line pt-1.5")}>
                {collapsed ? (
                  <Tooltip label={locked ? `${item.label} — not enabled` : item.label}>{link}</Tooltip>
                ) : (
                  link
                )}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Help, where a rail always puts it: last item, above the account.
          A clinic cannot switch a module on for itself and cannot fix a
          rejected payment from in here — for both the answer is a person at
          the desk, so the desk's address, number and hours are one click from
          every screen instead of being typed into the two pages that happened
          to need them. */}
      <div className={cn("shrink-0 px-2 pb-1", collapsed && "flex justify-center")}>
        <SupportMenu collapsed={collapsed} />
      </div>

      {/* the person signed in */}
      <div className={cn("shrink-0 border-t border-rail-line p-2", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip label={`${user.name} — ${ROLE_LABEL[role]}`}>
            <button onClick={signOut} aria-label="Sign out" className="rounded-full">
              <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
            </button>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-2.5 px-1">
            <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-label font-medium leading-tight text-rail-ink-strong">{user.name}</p>
              <p className="truncate text-micro text-rail-ink-dim">{ROLE_LABEL[role]}</p>
            </div>
            <Tooltip label="Sign out">
              <button
                onClick={signOut}
                aria-label="Sign out"
                className="rounded-[var(--r-sm)] p-1.5 text-rail-ink-dim transition-colors hover:bg-rail-2 hover:text-rail-ink-strong"
              >
                <IconLogout size={16} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The support desk, as a menu rather than a page.
 *
 * Everything on it is a way to reach somebody — mail, phone, the hours they
 * are there — plus the tour, which is the one question the desk can answer
 * without being asked. There is no ticket form: this product does not run a
 * helpdesk, and a form that posts into nothing is worse than an address.
 */
function SupportMenu({ collapsed }: { collapsed: boolean }) {
  const tour = useTour();
  const { tenant, user } = useTenant();
  const { data: support } = useSupportInfo();
  const supportEmail = support?.support_email ?? "";
  const supportPhone = support?.support_phone ?? "";
  const supportHours = support?.support_hours ?? "";

  const mailto =
    `mailto:${supportEmail}` +
    `?subject=${encodeURIComponent(`Help with ${tenant.name}`)}` +
    `&body=${encodeURIComponent(
      [`Hello Astrale support,`, "", "", `Clinic:  ${tenant.name}${tenant.slug ? ` (${tenant.slug})` : ""}`,
       `Asked by: ${user.name}${user.email ? `, ${user.email}` : ""}`].join("\n"),
    )}`;

  const trigger = ({ toggle, open }: { toggle: () => void; open: boolean }) => (
    <button
      onClick={toggle}
      aria-expanded={open}
      aria-label="Help and support"
      className={cn(
        "flex h-8.5 items-center gap-2.5 rounded-[var(--r-sm)] text-label font-normal text-rail-ink",
        "transition-colors duration-150 ease-[var(--ease-brand)] hover:bg-rail-2 hover:text-rail-ink-strong",
        collapsed ? "w-8.5 justify-center px-0" : "w-full px-2.5",
      )}
    >
      <IconInfo size={17} className="shrink-0" />
      {!collapsed && <span className="min-w-0 flex-1 truncate text-left">Help &amp; Support</span>}
    </button>
  );

  return (
    <Menu
      align="start"
      side="top"
      width={268}
      className={collapsed ? undefined : "w-full"}
      trigger={(p) =>
        collapsed ? <Tooltip label="Help & Support">{trigger(p)}</Tooltip> : trigger(p)
      }
    >
      {(close) => (
        <>
          <MenuLabel>Astrale support</MenuLabel>
          <a
            role="menuitem"
            href={mailto}
            onClick={close}
            className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-label text-ink transition-colors hover:bg-hover"
          >
            <IconMail size={15} className="shrink-0 text-ink-3" />
            <span className="min-w-0 flex-1 truncate">{supportEmail}</span>
          </a>
          <a
            role="menuitem"
            href={telHref(supportPhone)}
            onClick={close}
            className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-label text-ink transition-colors hover:bg-hover"
          >
            <IconPhone size={15} className="shrink-0 text-ink-3" />
            <span className="tnum min-w-0 flex-1 truncate font-mono">{supportPhone}</span>
          </a>
          <p className="px-2.5 pb-1.5 pt-1 text-caption leading-snug text-ink-3">{supportHours}</p>
          <MenuSep />
          <MenuItem icon={<IconSpark size={15} />} onClick={() => { close(); tour.start(); }}>
            Take the tour
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
