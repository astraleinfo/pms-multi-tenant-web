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
    xs: "h-6 w-6 text-[0.625rem]",
    sm: "h-7.5 w-7.5 text-[0.6875rem]",
    md: "h-9 w-9 text-[0.75rem]",
    lg: "h-11 w-11 text-[0.875rem]",
    xl: "h-14 w-14 text-[1.0625rem]",
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
    <div className={cn("flex flex-col items-center justify-center text-center", compact ? "py-8 px-5" : "py-16 px-6", className)}>
      {icon && (
        <span className="mb-3.5 flex h-12 w-12 items-center justify-center rounded-[var(--r-lg)] bg-surface-3 text-ink-3">
          {icon}
        </span>
      )}
      <p className="text-[0.9375rem] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-[0.8438rem] leading-relaxed text-ink-2">{body}</p>}
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
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{label}</dt>
      <dd className={cn("mt-1 text-[0.875rem] text-ink", mono && "font-mono tnum text-[0.8125rem]")}>{value}</dd>
    </div>
  );
}

/* ---- misc ----------------------------------------------------------------- */

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-[5px] border border-line-strong bg-surface-2 px-1.5 py-px font-mono text-[0.6875rem] leading-[1.4] text-ink-2 shadow-[0_1px_0_var(--line-strong)]">
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
