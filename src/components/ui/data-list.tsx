import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { toneTile, type Tone } from "./badge";

/**
 * A record, laid out so it can be read.
 *
 * The pattern this replaces is a `<dl>` of loose label/value pairs floating in
 * a grid: the label small and grey above the value, nothing lining up across
 * columns, and the eye re-finding the left edge on every pair. It is fine for
 * three facts and unreadable for fifteen.
 *
 * A `DataList` is a ruled two-column list instead — label left, value right,
 * a hairline between rows — so a reader can run down the labels to find the
 * one they want, or down the values to scan them. It is the same geometry as
 * the settings rows, deliberately: a screen that displays a record and a
 * screen that edits one should not be two different shapes.
 *
 * `columns={2}` splits the rows into two ruled lists side by side once there
 * is room, which is what a long record wants — fifteen rows in one column is
 * a page of scrolling for something that fits on a screen.
 */
export function DataList({
  children, className, columns = 1,
}: {
  children: React.ReactNode;
  className?: string;
  /** side-by-side lists above `sm`; one list below it */
  columns?: 1 | 2;
}) {
  if (columns === 2) {
    const rows = React.Children.toArray(children).filter(Boolean);
    const half = Math.ceil(rows.length / 2);
    return (
      <div className={cn("grid grid-cols-1 gap-x-6 sm:grid-cols-2", className)}>
        <dl className="divide-y divide-row-line border-t border-row-line">{rows.slice(0, half)}</dl>
        <dl className="divide-y divide-row-line border-t border-row-line">{rows.slice(half)}</dl>
      </div>
    );
  }
  return (
    <dl className={cn("divide-y divide-row-line border-t border-row-line", className)}>{children}</dl>
  );
}

/**
 * One fact. The value is the thing being read, so it takes the ink and the
 * weight; the label is the index you scan to find it, so it stays quiet.
 */
export function DataRow({
  label, value, mono, className, hint,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  /** a code, an id, a figure — anything that should line up down the column */
  mono?: boolean;
  className?: string;
  /** a short qualifier after the value, in muted ink */
  hint?: React.ReactNode;
}) {
  return (
    <div className={cn("flex flex-wrap items-baseline justify-between gap-x-4 py-2", className)}>
      <dt className="min-w-0 shrink text-label text-ink-3">{label}</dt>
      <dd className={cn("min-w-0 grow text-right text-label font-medium text-ink", mono && "tnum font-mono")}>
        {value}
        {hint && <span className="ml-1.5 font-normal text-ink-3">{hint}</span>}
      </dd>
    </div>
  );
}

/**
 * A figure with its own tinted glyph — the small grid the reference puts under
 * a patient's name: date of birth, blood group, visits, last seen. Four facts
 * that are looked up constantly and belong above the fold rather than inside
 * a list of twenty.
 */
export function FactGrid({
  children, className, columns = 2,
}: {
  children: React.ReactNode;
  className?: string;
  columns?: 1 | 2;
}) {
  return (
    <div
      className={cn(
        "grid gap-x-4 gap-y-3",
        columns === 2 ? "grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Fact({
  icon, value, label, tone = "accent", className,
}: {
  icon?: React.ReactNode;
  value: React.ReactNode;
  label: React.ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {icon && (
        <span
          className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]", toneTile[tone])}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <div className="min-w-0">
        <p className="truncate text-label font-medium leading-tight text-ink">{value}</p>
        <p className="truncate text-caption leading-tight text-ink-3">{label}</p>
      </div>
    </div>
  );
}

/**
 * The quick-actions column: a stack of full-width buttons, the recommended one
 * tinted. Not a card of loose buttons — a list, so they read as one set of
 * choices rather than five unrelated controls that happen to be near each
 * other.
 */
export function ActionList({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-col gap-1", className)}>{children}</div>;
}

/**
 * One row of that list.
 *
 * `emphasis` tints the one or two that are what somebody came to this record
 * to do — book, start the consultation — so the column has a top rather than
 * being five equal choices the reader has to rank for themselves. A row that
 * opens something else rather than doing something gets `trailing`, usually a
 * chevron: the shape says "this goes somewhere" before the label is read.
 *
 * It renders as a `Link` when given an `href` and a `button` otherwise, so a
 * navigation is a navigation — middle-clickable, openable in a new tab — and
 * not a click handler pretending to be one.
 */
export function ActionItem({
  icon, children, href, onClick, emphasis, trailing, disabled, wrap, className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  href?: string;
  onClick?: () => void;
  /** the recommended action — tinted, not enlarged */
  emphasis?: boolean;
  trailing?: React.ReactNode;
  disabled?: boolean;
  /**
   * Let the label run onto a second line instead of ending in an ellipsis.
   * A row whose label is a name — "Book appointment" — truncates fine. A row
   * whose label is a sentence — "₹10,000.00 outstanding on this account" —
   * loses the half that matters, in a column too narrow to ever fit it.
   */
  wrap?: boolean;
  className?: string;
}) {
  const cls = cn(
    "flex w-full gap-2.5 rounded-[var(--r)] px-2.5 py-2 text-left text-label font-medium",
    wrap ? "items-start" : "items-center",
    "transition-colors duration-150 ease-[var(--ease-brand)]",
    emphasis
      ? "bg-accent-soft text-accent-text hover:bg-accent-soft/70"
      : "text-ink hover:bg-hover",
    disabled && "pointer-events-none text-disabled-ink",
    className,
  );
  const body = (
    <>
      {icon && (
        <span
          className={cn("shrink-0", wrap && "mt-0.5", emphasis ? "text-accent" : "text-ink-3")}
          aria-hidden
        >
          {icon}
        </span>
      )}
      <span className={cn("min-w-0 flex-1", wrap ? "leading-snug" : "truncate")}>{children}</span>
      {trailing && <span className={cn("shrink-0 text-ink-3", wrap && "mt-0.5")}>{trailing}</span>}
    </>
  );
  return href && !disabled
    ? <Link href={href} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} disabled={disabled} className={cls}>{body}</button>;
}
