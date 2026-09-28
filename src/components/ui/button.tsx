"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

/**
 * A disabled button is repainted, not faded.
 *
 * `opacity-45` on a filled button drags the label and its ground toward the
 * page together: white on blue at 45% lands near 2.5:1, which is a shape
 * where a word used to be. Real disabled colours keep it legible at ~3.3:1
 * while still reading, unmistakably, as "not now".
 */
const base =
  "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,border-color,transform] duration-150 " +
  "ease-[var(--ease-brand)] select-none active:translate-y-[0.5px] " +
  "disabled:pointer-events-none disabled:bg-disabled-surface disabled:text-disabled-ink " +
  "disabled:border-disabled-border disabled:shadow-none";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-e1 hover:bg-accent-hover hover:shadow-e2",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-e1 hover:bg-hover hover:border-ink-3/40",
  ghost:
    "bg-transparent text-ink-2 hover:bg-hover hover:text-ink",
  quiet:
    "bg-surface-3 text-ink hover:bg-hover-strong",
  /* `text-ink-on`, not `text-white`: --critical inverts between themes, and a
     white label on the lighter night-shift red is 2.9:1. */
  danger:
    "bg-critical text-ink-on shadow-e1 hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-label rounded-[var(--r-sm)]",
  md: "h-9.5 px-3.5 text-label rounded-[var(--r)]",
  lg: "h-11 px-5 text-body rounded-[var(--r)]",
  icon: "h-9.5 w-9.5 rounded-[var(--r)]",
  "icon-sm": "h-8 w-8 rounded-[var(--r-sm)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonProps) {
  return <button className={buttonClass({ variant, size, className })} {...rest} />;
}

/**
 * The button's own classes, for the anchors that cannot be a `Link` — a
 * `mailto:` or a `tel:` goes to the mail client or the dialler, not through
 * the router.
 */
export function buttonClass({
  variant = "secondary", size = "md", className,
}: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(base, variants[variant], sizes[size], className);
}

export interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size, className })} {...rest} />;
}

/** Segmented control — one row of mutually exclusive choices. */
export function Segmented<T extends string | number>({
  value, onChange, options, size = "md", className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; title?: string }>;
  size?: "sm" | "md";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-0.5 rounded-[var(--r)] bg-surface-3 p-0.5",
        className,
      )}
      role="tablist"
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            role="tab"
            aria-selected={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[calc(var(--r)-3px)] font-medium transition-all duration-150 ease-[var(--ease-brand)]",
              size === "sm" ? "h-7 px-2.5 text-caption" : "h-8 px-3 text-label",
              on ? "bg-surface text-ink shadow-e1" : "text-ink-2 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
