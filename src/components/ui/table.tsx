import * as React from "react";
import { cn } from "@/lib/cn";

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

export function Table({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <table className={cn("w-full min-w-[44rem] border-collapse text-left", className)}>{children}</table>
  );
}

export function THead({ children, sticky }: { children: React.ReactNode; sticky?: boolean }) {
  return (
    <thead
      className={cn(
        "border-y border-line bg-surface-2",
        /* the cells do the sticking: a sticky `thead` loses its borders in
           several browsers, sticky `th`s keep everything */
        sticky && "[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:bg-surface-2",
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
  align?: "left" | "right" | "center";
  width?: string | number;
}) {
  return (
    <th
      scope="col"
      style={width ? { width } : undefined}
      className={cn(
        "whitespace-nowrap px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-line-soft">{children}</tbody>;
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
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors duration-100",
        onClick && "cursor-pointer hover:bg-surface-2",
        selected && "bg-accent-soft/50",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function TD({
  children, className, align = "left", colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "px-4 py-3 align-middle text-[0.8438rem] text-ink",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}
