"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/**
 * One tab row for the whole application.
 *
 * The active tab is said three ways at once — accent text, accent rule, and a
 * half-step of weight — because on a row of six the underline alone is easy to
 * lose, and colour alone is not something everyone can see. The inactive tabs
 * are muted rather than merely un-underlined, so the row has a clear figure
 * and a clear ground instead of six things of equal loudness.
 *
 * An `icon` is allowed per tab and is the fourth signal on the active one: a
 * row of seven words is read left to right every time, a row of seven glyphs
 * is recognised. The glyph never stands on its own — the word is always there
 * beside it, because "a flask" is not a synonym for "prescriptions and lab".
 *
 * The hover wash sits on the tab's top corners only, so it reads as the tab
 * lifting off the rule rather than as a floating pill unrelated to it.
 */
export function Tabs<T extends string>({
  value, onChange, tabs, className, size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number; disabled?: boolean }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn("relative flex items-center gap-0.5 overflow-x-auto border-b border-line", className)}
      role="tablist"
    >
      {tabs.map((t) => {
        const on = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={on}
            disabled={t.disabled}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative -mb-px flex shrink-0 items-center gap-1.5 rounded-t-[var(--r-sm)] border-b-2",
              "transition-colors duration-150 ease-[var(--ease-brand)]",
              size === "sm" ? "px-2.5 py-1.5 text-label" : "px-3 py-2 text-label",
              on
                ? "border-accent font-semibold text-accent-text"
                : "border-transparent font-medium text-ink-3 hover:bg-surface-2 hover:text-ink",
              t.disabled && "cursor-not-allowed opacity-60 hover:bg-transparent hover:text-ink-3",
            )}
          >
            {/* The inactive glyph is a step quieter than its own label, so the
                row does not read as seven icons with some text after them. */}
            {t.icon && (
              <span className={cn("shrink-0", !on && "text-ink-3/85")} aria-hidden>
                {t.icon}
              </span>
            )}
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  "tnum rounded-[var(--r-pill)] px-1.5 py-px font-mono text-micro leading-[1.5] transition-colors",
                  on ? "bg-accent-soft text-accent-text" : "bg-surface-3 text-ink-3",
                )}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
