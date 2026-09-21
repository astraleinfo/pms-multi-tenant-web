import * as React from "react";
import { cn } from "@/lib/cn";

/* ==========================================================================
   The table language.

   Two things in this application draw grids: the plain `Table` below, for a
   list a page already has in hand, and `DataTable`, for one the engine sorts
   and pages. They used to carry their own copies of the same class strings,
   which is how a header ends up one shade off between two screens nobody
   views side by side. The strings live here now and both import them.

   Four rules hold a grid together:

   1.  One strong rule, under the head. Everything below it is a row; nothing
       above it is. Rules between rows are deliberately lighter than any
       border on the page, because twenty of equal weight read as a fence.
   2.  Column heads are quiet and sentence case. They are a legend, read once;
       setting them in spaced capitals makes the lightest text on screen also
       the hardest to read.
   3.  A figure is right-aligned and tabular, always, and the two travel
       together — a right-aligned column of proportional digits does not line
       up, which is the only reason to right-align it.
   4.  A row reacts to the pointer only when something happens if you click
       it. Hover on an inert row is a promise the table does not keep.
   ========================================================================== */

type Align = "left" | "right" | "center";

/** The head band: its own ground, closed by the one strong rule. */
export const tableHeadClass = "border-b border-table-head-line bg-table-head";

/** A column head. */
export function thClass(align: Align = "left", className?: string) {
  return cn(
    "whitespace-nowrap px-4 py-2 text-caption font-semibold text-ink-2",
    align === "right" && "text-right",
    align === "center" && "text-center",
    className,
  );
}

/** A cell. Right-aligned means numeric, so it is given tabular figures. */
export function tdClass(align: Align = "left", className?: string) {
  return cn(
    "px-4 py-2.5 align-middle text-label text-ink",
    align === "right" && "text-right tnum",
    align === "center" && "text-center",
    className,
  );
}

/** A row. */
export function trClass(
  { interactive, selected }: { interactive?: boolean; selected?: boolean } = {},
  className?: string,
) {
  return cn(
    "transition-colors duration-100",
    interactive && "cursor-pointer hover:bg-row-hover",
    /* A selected row is tinted, and keeps its tint under the pointer —
       otherwise hovering the current row looks like deselecting it. */
    selected && "bg-accent-soft/60 hover:bg-accent-soft/60",
    className,
  );
}

/** The rules between rows, lighter than anything bounding the table. */
export const tbodyClass = "divide-y divide-row-line";

/**
 * Tables live in their own horizontal scroller so the page never scrolls
 * sideways. Below the min-width the table keeps its columns readable and the
 * wrapper scrolls — squeezing a six-column table into 390px helps nobody.
 */
export function TableWrap({
  className, children, maxHeight,
}: {
  className?: string;
  children: React.ReactNode;
  /** cap the height and let the rows scroll under a stuck header */
  maxHeight?: string;
}) {
  return (
    <div
      style={maxHeight ? { maxHeight } : undefined}
      className={cn(
        "-mx-px overflow-x-auto overscroll-x-contain",
        maxHeight && "overflow-y-auto overscroll-y-contain print:max-h-none print:overflow-visible",
        className,
      )}
    >
      <div className="min-w-full align-middle">{children}</div>
    </div>
  );
}

/**
 * `minWidth` is the width below which the wrapper scrolls rather than the
 * columns squeezing. 44rem suits a full-width grid of six columns; a four-
 * column table inside a half-width card needs a smaller floor, or it scrolls
 * its last column out of sight on a perfectly wide screen. It is a prop rather
 * than a class because `cn` joins without merging — passing `min-w-0` here
 * would leave two min-widths on the element and let stylesheet order decide.
 */
export function Table({
  className, children, minWidth = "44rem",
}: {
  className?: string;
  children: React.ReactNode;
  minWidth?: string;
}) {
  return (
    <table style={{ minWidth }} className={cn("w-full border-collapse text-left", className)}>
      {children}
    </table>
  );
}

export function THead({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <thead
      className={cn(
        tableHeadClass,
        /* the cells do the sticking: a sticky `thead` loses its borders in
           several browsers, sticky `th`s keep everything */
        sticky && "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-table-head",
      )}
    >
      {children}
    </thead>
  );
}

export function TH({
  children, className, align = "left", width,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: Align;
  width?: string | number;
}) {
  return (
    <th scope="col" style={width ? { width } : undefined} className={thClass(align, className)}>
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className={tbodyClass}>{children}</tbody>;
}

export function TR({
  children, className, onClick, selected,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}) {
  return (
    <tr onClick={onClick} className={trClass({ interactive: !!onClick, selected }, className)}>
      {children}
    </tr>
  );
}

export function TD({
  children, className, align = "left", colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: Align;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={tdClass(align, className)}>
      {children}
    </td>
  );
}
