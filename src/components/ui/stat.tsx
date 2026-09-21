"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { Sparkline } from "@/components/charts/sparkline";
import { IconArrowDown, IconArrowUp } from "./icons";
import { toneTile } from "./badge";

/**
 * A stat tile — the answer to "one number, no plot needed". A trend mark is
 * decoration only when a real series exists; otherwise it is left out.
 */
export function Stat({
  label, value, unit, delta, deltaLabel, trend, trendColor, hint, tone = "ink", className, icon, footer,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  unit?: React.ReactNode;
  /** signed percentage or count; sign drives the arrow, never the colour alone */
  delta?: number;
  deltaLabel?: string;
  trend?: number[];
  trendColor?: string;
  hint?: React.ReactNode;
  tone?: "ink" | "accent" | "ok" | "warn" | "critical";
  className?: string;
  icon?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const valueTone = {
    ink: "text-ink", accent: "text-accent-text",
    ok: "text-ok-text", warn: "text-warn-text", critical: "text-critical-text",
  }[tone];

  const up = (delta ?? 0) >= 0;

  return (
    <div className={cn("rounded-[var(--r-lg)] border border-line bg-surface p-3.5", className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-medium text-ink-3">{label}</p>
        {icon && (
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]",
              /* A tile keyed to the figure's own tone: a warning stat gets an
                 amber glyph, an ordinary one the house blue. */
              toneTile[tone === "ink" ? "accent" : tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-1.5">
          <span className={cn("tnum font-display text-display font-semibold leading-none", valueTone)}>
            {value}
          </span>
          {unit && <span className="text-label text-ink-3">{unit}</span>}
        </div>
        {trend && trend.length > 1 && (
          <Sparkline values={trend} color={trendColor ?? "var(--series-1)"} />
        )}
      </div>

      {(delta != null || hint) && (
        <div className="mt-2 flex items-start gap-2 text-caption">
          {delta != null && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-0.5 rounded-[var(--r-pill)] px-1.5 py-px font-medium",
                up ? "bg-ok-soft text-ok-text" : "bg-critical-soft text-critical-text",
              )}
            >
              {up ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />}
              <span className="tnum">{Math.abs(delta)}{deltaLabel ?? "%"}</span>
            </span>
          )}
          {/* Two lines, then an ellipsis — `truncate` cut these at one line
              and stopped most of them mid-sentence, which is worse than the
              tile being a few pixels taller. */}
          {hint && (
            <span className="line-clamp-2 min-w-0 leading-snug text-ink-3">{hint}</span>
          )}
        </div>
      )}

      {footer && <div className="mt-3 border-t border-line-soft pt-2.5">{footer}</div>}
    </div>
  );
}
