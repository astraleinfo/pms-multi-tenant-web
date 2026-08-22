import * as React from "react";
import { cn } from "@/lib/cn";
import { Card } from "./card";
import { Skeleton } from "./misc";

/* ==========================================================================
   Waiting, shown three ways.

   There are three kinds of wait in this app and they do not deserve the same
   treatment:

   - A *page* has nothing to show yet: the record has not arrived, so neither
     has its shape. That gets a spinner in the space the page is about to fill.
   - A *table* knows its shape before it knows its rows — same columns, same row
     height, same ten of them. That gets skeleton rows, so nothing jumps when
     the answer lands.
   - A *refetch* already has an answer on screen. Paging or searching keeps the
     page that is there, dimmed, under a thin bar — replacing it with a spinner
     would be throwing away something true to say "working".

   Every one of them is announced: `role="status"` with a live region, so a
   screen reader is told the same thing the dimming says.
   ========================================================================== */

export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn("spin text-ink-3", className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * A whole screen's worth of waiting.
 *
 * The label is visible rather than only announced: under `prefers-reduced-
 * motion` the spinner stops turning, and a still spinner with no words is a
 * screen that looks broken rather than busy.
 */
export function PageLoader({
  label = "Loading…", minHeight = "60vh", className,
}: {
  label?: string;
  minHeight?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      style={{ minHeight }}
      className={cn("fade flex flex-col items-center justify-center gap-3", className)}
    >
      <Spinner size={22} />
      <p className="text-[0.8125rem] text-ink-3">{label}</p>
    </div>
  );
}

/** The same, filling the viewport — the shell's stages before there is a shell. */
export function StageLoader({ label, className }: { label?: string; className?: string }) {
  return <PageLoader label={label} minHeight="100dvh" className={cn("bg-ground", className)} />;
}

/**
 * Rows in the shape of the rows that are coming.
 *
 * Returned as bare `<tr>`s so a table can drop them into its own `<tbody>` and
 * keep its borders, striping and column widths.
 */
export function TableSkeletonRows({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, r) => (
        <tr key={r} aria-hidden>
          {Array.from({ length: columns }, (_, c) => (
            <td key={c} className="px-4 py-3 align-middle">
              {/* the first column carries a name, so it reads wider than the rest */}
              <Skeleton
                className="h-3.5"
                style={{
                  width: c === 0 ? "60%" : c === columns - 1 ? "40%" : `${45 + ((r + c) % 3) * 12}%`,
                  marginLeft: c === columns - 1 ? "auto" : undefined,
                  opacity: 1 - r * 0.07,
                }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** The thin bar over a table that is fetching a page it can already show. */
export function LoadingBar({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden", className)}
    >
      <span className="indeterminate block h-full w-full bg-accent" />
    </span>
  );
}

/** Cards in the shape of the cards that are coming — the register on a phone. */
export function CardsSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}
    >
      <span className="sr-only">Loading</span>
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} as="article" className="p-4" aria-hidden>
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <div className="mt-3.5 space-y-2 border-t border-line-soft pt-3">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}
