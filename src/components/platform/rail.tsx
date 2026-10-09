"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import { isSuperAdmin } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuItem, MenuSep } from "@/components/ui/modal";
import { Tooltip } from "@/components/ui/info";
import {
  IconGauge, IconLogout, IconPulse, IconReceipt, IconSettings, IconSidebar, IconUsers,
} from "@/components/ui/icons";

/** The platform's own mark — static, not a clinic's, so it lives as an asset
 *  rather than a database value. Swap `public/astrale-logo-mark.png` to
 *  rebrand the console; nothing else here needs to change. */
const MARK_RATIO = 1382 / 245;

export function PlatformMark({ height = 20 }: { height?: number }) {
  return (
    <Image
      src="/astrale-logo-mark.png"
      alt="Astrale"
      width={Math.round(height * MARK_RATIO)}
      height={height}
      priority
    />
  );
}

/* ==========================================================================
   The console's own rail.

   Same shape as the clinic's `Rail` — a brand block that folds the sidebar
   away, a flat list of destinations, the signed-in person at the bottom —
   because a platform operator moving between the console and a clinic
   should recognise the pattern even though the colours and the list are
   different on purpose (§ chrome.tsx: never mistakable for a clinic).

   Unlike the clinic rail, this one defaults *open*: five destinations is
   nothing to hide behind icons, where twelve was.
   ========================================================================== */

export const SECTIONS = [
  {
    href: "/platform" as const,
    label: "Overview",
    icon: <IconGauge size={17} />,
    blurb: "Everything at once",
  },
  {
    href: "/platform/tenants" as const,
    label: "Tenants",
    icon: <IconUsers size={17} />,
    blurb: "Every clinic, filtered",
  },
  {
    href: "/platform/settings" as const,
    label: "Settings",
    icon: <IconSettings size={17} />,
    blurb: "Subscription fee, new-clinic defaults, support contact",
    superAdmin: true,
  },
  {
    href: "/platform/billing" as const,
    label: "Billing & revenue",
    icon: <IconReceipt size={17} />,
    blurb: "Bills, revenue and activity",
  },
  {
    href: "/platform/jobs" as const,
    label: "Background jobs",
    icon: <IconPulse size={17} />,
    blurb: "Celery queues, workers and failures",
    /* Housekeeping, not security: the API refuses these routes to anybody
       but a super admin whatever this array says, and it answers 403 rather
       than 401 so a hand-typed URL is refused on who is asking. */
    superAdmin: true,
  },
];

export function ConsoleRail({
  collapsed, onToggle, onNavigate,
}: {
  collapsed: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { host, platformUser, platformSignOut } = useApp();
  const items = SECTIONS.filter((s) => !s.superAdmin || isSuperAdmin(platformUser));

  return (
    <div className="flex h-full flex-col border-r border-white/10 bg-stage text-stage-ink">
      {/* the platform, and the control that folds this away */}
      <div
        className={cn(
          "flex h-[var(--topbar-h)] shrink-0 items-center gap-1.5 border-b border-white/10",
          collapsed ? "justify-center px-2" : "pl-2.5 pr-1.5",
        )}
      >
        {collapsed ? (
          <Tooltip label="Expand sidebar">
            <button
              onClick={onToggle}
              aria-label="Expand sidebar"
              aria-expanded={false}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] text-stage-dim transition-colors hover:bg-stage-2 hover:text-stage-ink"
            >
              <IconSidebar size={17} />
            </button>
          </Tooltip>
        ) : (
          <>
            <Link
              href="/platform"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-[var(--r-sm)] px-1 py-1 transition-colors hover:bg-stage-2"
            >
              <span className="min-w-0">
                <PlatformMark height={18} />
                <p className="tnum truncate pt-1 font-mono text-micro text-stage-dim">
                  admin.{host.root}{host.port ? `:${host.port}` : ""}
                </p>
              </span>
            </Link>
            {onToggle && (
              <Tooltip label="Collapse sidebar">
                <button
                  onClick={onToggle}
                  aria-label="Collapse sidebar"
                  aria-expanded={true}
                  className="shrink-0 rounded-[var(--r-sm)] p-1.5 text-stage-dim transition-colors hover:bg-stage-2 hover:text-stage-ink"
                >
                  <IconSidebar size={16} />
                </button>
              </Tooltip>
            )}
          </>
        )}
      </div>

      {/* the destinations */}
      <nav
        className={cn("min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-2", collapsed ? "px-2" : "px-2")}
        aria-label="Console sections"
      >
        <ul className="space-y-px">
          {items.map((section) => {
            /* `/platform` is a prefix of everything, so only its own path lights it */
            const active = section.href === "/platform"
              ? pathname === "/platform"
              : pathname.startsWith(section.href);

            const link = (
              <Link
                href={section.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-8.5 items-center gap-2.5 rounded-[var(--r-sm)] text-label",
                  "transition-colors duration-150 ease-[var(--ease-brand)]",
                  collapsed ? "justify-center px-0" : "px-2.5",
                  active
                    ? "bg-white/10 font-semibold text-stage-ink"
                    : "font-normal text-stage-dim hover:bg-stage-2 hover:text-stage-ink",
                )}
              >
                {section.icon}
                {!collapsed && <span className="min-w-0 flex-1 truncate">{section.label}</span>}
              </Link>
            );

            return (
              <li key={section.href}>
                {collapsed ? <Tooltip label={`${section.label} — ${section.blurb}`}>{link}</Tooltip> : link}
              </li>
            );
          })}
        </ul>
      </nav>

      {/* the person signed in */}
      <div className={cn("shrink-0 border-t border-white/10 p-2", collapsed && "flex justify-center")}>
        {platformUser && (
          <Menu
            align="start"
            side="top"
            width={230}
            className={collapsed ? undefined : "w-full"}
            trigger={({ toggle }) =>
              collapsed ? (
                <Tooltip label={`${platformUser.name} — ${isSuperAdmin(platformUser) ? "Super admin" : "Support desk"}`}>
                  <button onClick={toggle} aria-label="Account menu" className="rounded-full">
                    <Avatar name={platformUser.name} initials={platformUser.initials} size="sm" tintKey={platformUser.id} />
                  </button>
                </Tooltip>
              ) : (
                <button
                  onClick={toggle}
                  className="flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 text-left transition-colors hover:bg-stage-2"
                >
                  <Avatar name={platformUser.name} initials={platformUser.initials} size="sm" tintKey={platformUser.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-label font-medium leading-tight text-stage-ink">{platformUser.name}</p>
                    <Badge tone={isSuperAdmin(platformUser) ? "accent" : "neutral"} size="sm" className="mt-1">
                      {isSuperAdmin(platformUser) ? "Super admin" : "Support desk"}
                    </Badge>
                  </div>
                </button>
              )
            }
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
    </div>
  );
}
