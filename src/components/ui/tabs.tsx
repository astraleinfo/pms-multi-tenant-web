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
/** How wide the edge fade is — and so how far from an edge the chosen tab is kept. */
const FADE_PX = 40;

export function Tabs<T extends string>({
  value, onChange, tabs, className, size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: React.ReactNode; icon?: React.ReactNode; count?: number; disabled?: boolean }>;
  className?: string;
  size?: "sm" | "md";
}) {
  /* A row wider than its container scrolls — but with the native scrollbar
     hidden (it showed as a stray bar under every tab row) the only hint that
     there is more is a fade on whichever edge has tabs behind it. The rule
     under the row is an inset shadow rather than a border, so the active
     tab's underline covers it without poking out of the scroll box. */
  const row = React.useRef<HTMLDivElement>(null);
  const [fade, setFade] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const el = row.current;
    if (!el) return;
    setFade({
      left: el.scrollLeft > 2,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
    });
  }, []);
  /* Keep the chosen tab clear of either edge. Not `scrollIntoView`: its
     "nearest" stops with the tab flush against the edge, which is exactly
     where the fade is, and clips its last letters. */
  const reveal = React.useCallback(() => {
    const el = row.current;
    const tab = el?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !tab) return;
    const clear = FADE_PX + 8;
    // The row is `relative`, so this is already measured from the row itself.
    const left = tab.offsetLeft;
    const right = left + tab.offsetWidth;
    if (left - clear < el.scrollLeft) {
      el.scrollLeft = Math.max(0, left - clear);
    } else if (right + clear > el.scrollLeft + el.clientWidth) {
      el.scrollLeft = right + clear - el.clientWidth;
    }
    measure();
  }, [measure]);

  /* Following the chosen tab until somebody scrolls the row themselves. Tabs
     change width after the first paint — a count badge arrives with its data,
     a web font swaps in — and each change can push the chosen tab back under
     the fade; but a row the reader is scrolling must not be pulled back. */
  const following = React.useRef(true);
  React.useEffect(() => {
    following.current = true;
    reveal();
  }, [value, reveal]);

  React.useEffect(() => {
    const el = row.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      measure();
      if (following.current) reveal();
    });
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    const stop = () => { following.current = false; };
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    el.addEventListener("pointerdown", stop);
    return () => {
      observer.disconnect();
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("pointerdown", stop);
    };
  }, [measure, reveal, tabs.length]);

  const mask =
    fade.left && fade.right ? `linear-gradient(90deg, transparent, #000 ${FADE_PX}px, #000 calc(100% - ${FADE_PX}px), transparent)`
      : fade.right ? `linear-gradient(90deg, #000 calc(100% - ${FADE_PX}px), transparent)`
        : fade.left ? `linear-gradient(90deg, transparent, #000 ${FADE_PX}px)`
          : undefined;

  return (
    <div
      ref={row}
      onScroll={measure}
      className={cn(
        "relative flex items-center gap-0.5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--line)]",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
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
              "relative flex shrink-0 items-center gap-1.5 rounded-t-[var(--r-sm)] border-b-2",
              "transition-colors duration-150 ease-[var(--ease-brand)]",
              size === "sm" ? "px-2.5 py-1.5 text-label" : "px-3 py-2 text-label",
              on
                ? "border-accent font-semibold text-accent-text"
                : "border-transparent font-medium text-ink-3 hover:bg-surface-2 hover:text-ink",
              t.disabled && "cursor-not-allowed !text-disabled-ink hover:bg-transparent",
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
