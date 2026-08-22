"use client";

import * as React from "react";
import { ChartLegend, ChartTooltip, seriesColor, ticksFor, useMeasure, useTooltip } from "./chart-kit";

export interface BarSeries {
  name: string;
  values: number[];
  color?: string;
}

/** Vertical bars. Grouped when several series are passed, stacked on request. */
export function BarChart({
  labels, series, height = 210, format = (n: number) => String(n), stacked = false, highlight,
}: {
  labels: string[];
  series: BarSeries[];
  height?: number;
  format?: (n: number) => string;
  stacked?: boolean;
  /** index of a bar to keep emphasised (e.g. today) */
  highlight?: number;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { tip, setTip } = useTooltip();
  const [hover, setHover] = React.useState<number | null>(null);

  const pad = { t: 12, r: 12, b: 26, l: 42 };
  const w = Math.max(240, width);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const totals = labels.map((_, i) =>
    stacked ? series.reduce((s, se) => s + (se.values[i] ?? 0), 0) : Math.max(...series.map((se) => se.values[i] ?? 0)));
  const ticks = ticksFor(Math.max(1, ...totals));
  const top = ticks[ticks.length - 1];

  const slot = innerW / labels.length;
  const bandPad = Math.min(10, slot * 0.22);
  const band = slot - bandPad;
  const barW = stacked ? band : (band - 2 * (series.length - 1)) / series.length;
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;

  const colorOf = (i: number, se: BarSeries) => se.color ?? seriesColor(i);

  return (
    <div className="relative" ref={ref}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img"
           aria-label={`${series.map((s) => s.name).join(", ")} by ${labels.length} groups`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                  fontSize={10.5} fill="var(--ink-3)" className="tnum">{format(t)}</text>
          </g>
        ))}

        {labels.map((label, i) => {
          const gx = pad.l + i * slot + bandPad / 2;
          let acc = 0;
          return (
            <g key={label + i}
               onMouseEnter={() => {
                 setHover(i);
                 setTip({
                   x: gx + band / 2, y: pad.t + innerH / 2, title: label,
                   rows: series.map((se, si) => ({ label: se.name, value: format(se.values[i] ?? 0), color: colorOf(si, se) })),
                 });
               }}
               onMouseLeave={() => { setHover(null); setTip(null); }}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={innerH}
                    fill={hover === i ? "var(--surface-2)" : "transparent"} />
              {series.map((se, si) => {
                const v = se.values[i] ?? 0;
                const h = Math.max(v > 0 ? 3 : 0, (v / top) * innerH - (stacked && si > 0 ? 2 : 0));
                const bx = stacked ? gx : gx + si * (barW + 2);
                const by = stacked ? pad.t + innerH - acc - h : y(v);
                if (stacked) acc += h + 2;
                return (
                  <rect key={se.name} x={bx} y={by} width={Math.max(2, barW)} height={h}
                        rx={4} fill={colorOf(si, se)}
                        opacity={highlight != null && highlight !== i && hover == null ? 0.82 : 1} />
                );
              })}
            </g>
          );
        })}

        {labels.map((l, i) => (
          <text key={l + i} x={pad.l + i * slot + slot / 2} y={height - 8} textAnchor="middle"
                fontSize={10.5} fill={highlight === i ? "var(--ink)" : "var(--ink-3)"}
                fontWeight={highlight === i ? 600 : 400}>{l}</text>
        ))}
      </svg>

      <ChartTooltip tip={tip} containerWidth={w} />

      {series.length > 1 && (
        <ChartLegend className="mt-2" items={series.map((s, si) => ({ label: s.name, color: colorOf(si, s) }))} />
      )}
    </div>
  );
}

/**
 * Horizontal ranked bars — for "top N" lists where the labels are long.
 * One hue by default: the bars encode magnitude, and colouring by rank would
 * repaint a row the moment the sort changed.
 */
export function RankBar({
  rows, format = (n: number) => String(n), max, colorAt,
}: {
  rows: Array<{ label: string; value: number; hint?: string }>;
  format?: (n: number) => string;
  max?: number;
  /** override only when each row is a real entity with its own fixed colour */
  colorAt?: (i: number) => string;
}) {
  const top = max ?? Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={r.label} className="group">
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="truncate text-[0.8125rem] text-ink">{r.label}</span>
            <span className="tnum shrink-0 font-mono text-[0.75rem] font-medium text-ink-2">
              {format(r.value)}
              {r.hint && <span className="ml-1.5 font-sans text-ink-3">{r.hint}</span>}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-[var(--r-pill)] bg-surface-inset">
            <div
              className="h-full rounded-[var(--r-pill)] transition-[width] duration-500 ease-[var(--ease-brand)]"
              style={{ width: `${(r.value / top) * 100}%`, background: colorAt ? colorAt(i) : seriesColor(0) }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
