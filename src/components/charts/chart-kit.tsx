"use client";

import * as React from "react";
import { cn } from "@/lib/cn";

/* ==========================================================================
   Shared chart plumbing. Every chart in the app is hand-drawn SVG against
   the same tokens — one grid colour, one axis ink, one tooltip.
   Series colours are assigned in fixed order and never cycled or re-ranked.
   ========================================================================== */

export const SERIES = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
] as const;

export const seriesColor = (i: number) => SERIES[i % SERIES.length];

export interface TooltipRow {
  label: string;
  value: string;
  color?: string;
}

export function useTooltip() {
  const [tip, setTip] = React.useState<{ x: number; y: number; title: string; rows: TooltipRow[] } | null>(null);
  return { tip, setTip };
}

export function ChartTooltip({
  tip, containerWidth,
}: {
  tip: { x: number; y: number; title: string; rows: TooltipRow[] } | null;
  containerWidth: number;
}) {
  if (!tip) return null;
  const flip = tip.x > containerWidth * 0.62;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[140px] rounded-[var(--r-sm)] border border-line bg-surface px-3 py-2 shadow-e3"
      style={{
        left: tip.x, top: tip.y,
        transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)`,
      }}
      role="status"
    >
      <p className="mb-1 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3">{tip.title}</p>
      {tip.rows.map((r) => (
        <div key={r.label} className="flex items-baseline justify-between gap-4 py-px">
          <span className="flex items-center gap-1.5 text-caption text-ink-2">
            {r.color && <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: r.color }} />}
            {r.label}
          </span>
          <span className="tnum font-mono text-caption font-medium text-ink">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

/** Legend. Present whenever there are two or more series — identity is never colour alone. */
export function ChartLegend({
  items, className,
}: {
  items: Array<{ label: string; color: string; value?: string }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1.5", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-caption text-ink-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.color }} aria-hidden />
          <span>{it.label}</span>
          {it.value && <span className="tnum font-mono text-ink-3">{it.value}</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * Nice round tick values for a 0..max axis. Counts get whole-number steps —
 * an axis reading 2.5 patients is nonsense, so the ladder skips it.
 */
export function ticksFor(max: number, maxTicks = 5) {
  if (max <= 0) return [0, 1];
  const whole = Number.isInteger(max);
  const ladder = whole ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];

  let mag = Math.pow(10, Math.floor(Math.log10(Math.max(max, 1)) - 1));
  for (let guard = 0; guard < 12; guard++) {
    for (const m of ladder) {
      const step = m * mag;
      if (whole && step < 1) continue;
      if (Math.ceil(max / step) <= maxTicks) {
        const top = Math.ceil(max / step) * step;
        const out: number[] = [];
        for (let v = 0; v <= top + 1e-9; v += step) out.push(Number(v.toFixed(6)));
        return out;
      }
    }
    mag *= 10;
  }
  return [0, max];
}

/** Measured wrapper so charts are fluid without a resize library in the bundle. */
export function useMeasure<T extends HTMLElement>() {
  const ref = React.useRef<T>(null);
  const [width, setWidth] = React.useState(640);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}
