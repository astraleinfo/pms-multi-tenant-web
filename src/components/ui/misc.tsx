import * as React from "react";
import { cn } from "@/lib/cn";
import { initialsOf } from "@/lib/format";

/* ---- avatar --------------------------------------------------------------- */

const AVATAR_TINTS = [
  "bg-accent-soft text-accent-text",
  "bg-accent-soft text-accent-text",
  "bg-info-soft text-info-text",
  "bg-ok-soft text-ok-text",
  "bg-warn-soft text-warn-text",
  "bg-neutral-soft text-neutral-text",
];

export function Avatar({
  name, size = "md", className, initials, tintKey,
}: {
  name: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  initials?: string;
  tintKey?: string;
}) {
  const sizes = {
    xs: "h-6 w-6 text-micro",
    sm: "h-7.5 w-7.5 text-micro",
    md: "h-9 w-9 text-caption",
    lg: "h-11 w-11 text-body",
    xl: "h-14 w-14 text-title-sm",
  };
  const key = tintKey ?? name;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold tracking-tight",
        AVATAR_TINTS[hash % AVATAR_TINTS.length], sizes[size], className,
      )}
      aria-hidden
    >
      {initials ?? initialsOf(name)}
    </span>
  );
}

/* ---- scroll pane ---------------------------------------------------------- */

/**
 * A pane that scrolls inside itself rather than growing the page.
 *
 * A patient seen for two years has a record metres long, and a page that long
 * takes its own tabs off the top of the screen with it. Capping the pane keeps
 * the header, the tabs and the summary rail where they were put.
 *
 * `overscroll-contain` stops the page behind it scrolling on once the pane
 * reaches its end, and printing ignores the cap — a printed record is the whole
 * record, not the part that happened to be in view.
 */
export function ScrollArea({
  children, className, maxHeight = "min(62vh, 40rem)", label,
}: {
  children: React.ReactNode;
  className?: string;
  /** any CSS length; viewport-relative by default, so tall screens show more */
  maxHeight?: string;
  /** names the pane for a screen reader, since it is focusable */
  label?: string;
}) {
  return (
    <div
      /* focusable, so the pane can be scrolled from the keyboard as well */
      tabIndex={0}
      role="region"
      aria-label={label}
      style={{ maxHeight }}
      className={cn(
        "overflow-y-auto overscroll-contain",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-border",
        "print:max-h-none print:overflow-visible",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---- empty state ---------------------------------------------------------- */

/**
 * Nothing here — said once, properly.
 *
 * The glyph sits in a large soft disc rather than a small tinted square: this
 * is the only thing in a panel that is otherwise blank, so it is allowed to be
 * the shape the eye lands on. The disc is neutral on purpose — an empty diary
 * is not a warning, and a tinted tile would be claiming a state the panel does
 * not have. What the reader can do about it, if anything, goes in `action`.
 */
export function EmptyState({
  icon, title, body, action, className, compact,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "px-5 py-7" : "px-6 py-11", className)}>
      {icon && (
        <span
          className={cn(
            "mb-3.5 flex shrink-0 items-center justify-center rounded-full bg-surface-3 text-ink-3",
            compact ? "h-11 w-11" : "h-[4.25rem] w-[4.25rem]",
          )}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <p className="text-label font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-[22rem] text-caption leading-relaxed text-ink-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---- meters --------------------------------------------------------------- */

export function Meter({
  value, max = 100, tone = "accent", className, height = 6,
}: {
  value: number;
  max?: number;
  tone?: "accent" | "ok" | "warn" | "critical" | "info";
  className?: string;
  height?: number;
}) {
  const pct = max <= 0 ? 0 : Math.max(0, Math.min(100, (value / max) * 100));
  const bg = {
    accent: "bg-accent", ok: "bg-ok",
    warn: "bg-warn", critical: "bg-critical", info: "bg-info",
  }[tone];
  return (
    <div
      className={cn("w-full overflow-hidden rounded-[var(--r-pill)] bg-surface-inset", className)}
      style={{ height }}
      role="meter"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-[var(--r-pill)] transition-[width] duration-500 ease-[var(--ease-brand)]", bg)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---- key/value ------------------------------------------------------------ */

export function KV({
  label, value, className, mono,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
  mono?: boolean;
}) {
  /* A ruled row, not a stacked pair. Stacked, fifteen of these are a drift of
     grey-over-dark with nothing lining up; ruled, the labels form a column you
     can run down and the values form another. The hairline belongs to the row
     so a grid of them reads as one list however the parent lays them out. */
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 border-b border-row-line py-2",
        className,
      )}
    >
      <dt className="min-w-0 shrink text-label text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 grow text-right text-label font-medium text-ink", mono && "tnum font-mono")}>
        {value}
      </dd>
    </div>
  );
}

/* ---- misc ----------------------------------------------------------------- */

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-micro leading-[1.4] text-ink-2 shadow-[0_1px_0_var(--line-strong)]">
      {children}
    </kbd>
  );
}

export function Dot({ className }: { className?: string }) {
  return <span className={cn("inline-block h-1 w-1 rounded-full bg-ink-3/60 align-middle", className)} aria-hidden />;
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={cn("rounded-[var(--r-sm)] bg-surface-3", className)}
      style={{
        backgroundImage: "linear-gradient(90deg, transparent, color-mix(in srgb, var(--surface) 70%, transparent), transparent)",
        backgroundSize: "200% 100%",
        animation: "sweep 1.4s linear infinite",
        ...style,
      }}
    />
  );
}
