"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

export function Tabs<T extends string>({
  value, onChange, tabs, className, size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  tabs: Array<{ value: T; label: React.ReactNode; count?: number; disabled?: boolean }>;
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div className={cn("relative flex items-center gap-0.5 overflow-x-auto border-b border-line", className)} role="tablist">
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
              "relative -mb-px flex shrink-0 items-center gap-2 border-b-2 font-medium transition-colors duration-150",
              size === "sm" ? "px-3 py-2 text-[0.8125rem]" : "px-3.5 py-2.5 text-[0.875rem]",
              on
                ? "border-accent text-ink"
                : "border-transparent text-ink-2 hover:border-line-strong hover:text-ink",
              t.disabled && "cursor-not-allowed opacity-40 hover:border-transparent",
            )}
          >
            {t.label}
            {t.count != null && (
              <span
                className={cn(
                  "tnum rounded-[var(--r-pill)] px-1.5 py-px font-mono text-[0.6875rem]",
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
