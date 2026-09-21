"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV, ROLE_LABEL, modulePath, roleAllows } from "@/lib/nav";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useRailCounters } from "@/lib/query/hooks";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { IconLock, IconLogout } from "@/components/ui/icons";
import { Avatar } from "@/components/ui/misc";

/** The clinic monogram — two initials on a accent tile. The app's mark. */
export function Monogram({ name, size = 34 }: { name: string; size?: number }) {
  const letters = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-[10px] bg-accent font-display font-semibold text-accent-ink"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      {letters}
    </span>
  );
}

export function Rail({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { hasFeature, signOut } = useApp();
  const { tenant, user, role } = useTenant();
  const counters = useRailCounters();

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  return (
    <div className="flex h-full flex-col border-r border-line bg-rail text-rail-ink">
      {/* brand */}
      <div className={cn("flex items-center gap-3 px-4 pb-3 pt-4", collapsed && "justify-center px-0")}>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-accent text-accent-ink shadow-e1"
          aria-hidden
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3.2 20 7v6.4c0 4.6-3.4 7.6-8 9-4.6-1.4-8-4.4-8-9V7l8-3.8Z" />
            <path d="M12 8.4v7M8.5 11.9h7" />
          </svg>
        </span>
        {!collapsed && (
          <div className="min-w-0">
            <p className="font-display text-[0.9375rem] font-semibold leading-none tracking-[-0.01em] text-rail-ink-strong">
              Astrale
            </p>
            <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.14em] text-rail-ink-dim">Practice OS</p>
          </div>
        )}
      </div>

      {/* tenant identity */}
      <div
        data-tour="rail-tenant"
        className={cn("mx-3 mb-3 rounded-[var(--r)] border border-rail-line bg-rail-2 p-3", collapsed && "mx-2 p-2")}
      >
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <Monogram name={tenant.name} size={collapsed ? 28 : 32} />
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-[0.8125rem] font-semibold leading-tight text-rail-ink-strong">{tenant.name}</p>
              <p className="mt-0.5 truncate text-[0.6875rem] text-rail-ink-dim">
                {clinical.label} · {tenant.city}
              </p>
            </div>
          )}
        </div>
        {!collapsed && tenant.status === "trial" && (
          <p className="mt-2.5 rounded-[var(--r-sm)] border border-accent-border bg-accent-soft px-2 py-1 text-[0.6875rem] font-medium text-accent-text">
            Trial plan
          </p>
        )}
      </div>

      {/* nav */}
      <nav
        data-tour="rail-nav"
        className={cn("min-h-0 flex-1 overflow-y-auto px-3 pb-3", collapsed && "px-2")}
        aria-label="Modules"
      >
        {NAV.map((group) => {
          const visible = group.items.filter((i) => roleAllows(i, role));
          if (!visible.length) return null;
          return (
            <div key={group.label} className="mb-4 last:mb-0">
              {!collapsed && (
                <p className="mb-1.5 px-2.5 text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-rail-ink-dim">
                  {group.label}
                </p>
              )}
              <ul className="space-y-0.5">
                {visible.map((item) => {
                  const locked = item.feature ? !hasFeature(item.feature) : false;
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  const count = item.counter ? counters[item.counter] : 0;
                  const Icon = item.icon;

                  const inner = (
                    <>
                      <Icon size={17} className="shrink-0" />
                      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                      {!collapsed && locked && <IconLock size={13} className="shrink-0 opacity-70" />}
                      {!collapsed && !locked && count > 0 && (
                        <span
                          className={cn(
                            "tnum shrink-0 rounded-[var(--r-pill)] px-1.5 py-px font-mono text-[0.6875rem] leading-[1.45]",
                            active ? "bg-white/25 text-accent-ink" : "bg-rail-3 text-rail-ink",
                          )}
                        >
                          {count}
                        </span>
                      )}
                      {collapsed && !locked && count > 0 && (
                        <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent" />
                      )}
                    </>
                  );

                  const cls = cn(
                    "group relative flex items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-[0.8438rem] font-medium",
                    "transition-colors duration-150 ease-[var(--ease-brand)]",
                    collapsed && "justify-center px-0",
                    active
                      ? "bg-accent text-accent-ink shadow-e1"
                      : locked
                        ? "text-rail-ink-dim hover:bg-rail-2 hover:text-rail-ink"
                        : "text-rail-ink hover:bg-rail-2 hover:text-rail-ink-strong",
                  );

                  return (
                    <li key={item.href}>
                      <Link
                        href={locked && item.feature ? modulePath(item.feature) : item.href}
                        className={cls}
                        title={collapsed ? item.label : locked ? `${item.label} — not enabled for this clinic` : undefined}
                        onClick={onNavigate}
                        aria-current={active ? "page" : undefined}
                      >
                        {inner}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* user */}
      <div className={cn("border-t border-rail-line p-3", collapsed && "px-2")}>
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <Avatar name={user.name} initials={user.initials} size="sm" tintKey={user.id} />
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-[0.8125rem] font-medium leading-tight text-rail-ink-strong">{user.name}</p>
              <p className="mt-0.5 truncate text-[0.6875rem] text-rail-ink-dim">{ROLE_LABEL[role]}</p>
            </div>
          )}
          {!collapsed && (
            <button
              onClick={signOut}
              className="rounded-[var(--r-sm)] p-1.5 text-rail-ink-dim transition-colors hover:bg-rail-2 hover:text-rail-ink-strong"
              aria-label="Sign out"
              title="Sign out"
            >
              <IconLogout size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
