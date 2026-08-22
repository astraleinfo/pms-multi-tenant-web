"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

type Variant = "primary" | "secondary" | "ghost" | "quiet" | "danger";
type Size = "sm" | "md" | "lg" | "icon" | "icon-sm";

const base =
  "relative inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap " +
  "transition-[background-color,color,box-shadow,border-color,transform] duration-150 " +
  "ease-[var(--ease-brand)] select-none disabled:opacity-45 disabled:pointer-events-none " +
  "active:translate-y-[0.5px]";

const variants: Record<Variant, string> = {
  primary:
    "bg-accent text-accent-ink shadow-e1 hover:bg-accent-hover hover:shadow-e2",
  secondary:
    "bg-surface text-ink border border-line-strong shadow-e1 hover:bg-surface-2 hover:border-ink-3/40",
  ghost:
    "bg-transparent text-ink-2 hover:bg-surface-3 hover:text-ink",
  quiet:
    "bg-surface-3 text-ink hover:bg-surface-inset",
  danger:
    "bg-critical text-white shadow-e1 hover:brightness-95",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[0.8125rem] rounded-[var(--r-sm)]",
  md: "h-9.5 px-3.5 text-[0.8438rem] rounded-[var(--r)]",
  lg: "h-11 px-5 text-[0.9063rem] rounded-[var(--r)]",
  icon: "h-9.5 w-9.5 rounded-[var(--r)]",
  "icon-sm": "h-8 w-8 rounded-[var(--r-sm)]",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export function Button({ variant = "secondary", size = "md", className, ...rest }: ButtonProps) {
  return <button className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
}

export interface ButtonLinkProps extends React.ComponentProps<typeof Link> {
  variant?: Variant;
  size?: Size;
}

export function ButtonLink({ variant = "secondary", size = "md", className, ...rest }: ButtonLinkProps) {
  return <Link className={cn(base, variants[variant], sizes[size], className)} {...rest} />;
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
              size === "sm" ? "h-7 px-2.5 text-[0.75rem]" : "h-8 px-3 text-[0.8125rem]",
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
