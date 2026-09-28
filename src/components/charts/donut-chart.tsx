"use client";

import * as React from "react";
import { ChartLegend, seriesColor } from "./chart-kit";

export interface Slice {
  label: string;
  value: number;
  color?: string;
}

/** Donut with a hero number in the middle. Legend always present, values direct-labelled. */
export function DonutChart({
  slices, size = 168, thickness = 22, centreValue, centreLabel, format = (n: number) => String(n),
}: {
  slices: Slice[];
  size?: number;
  thickness?: number;
  centreValue?: React.ReactNode;
  centreLabel?: React.ReactNode;
  format?: (n: number) => string;
}) {
  const [hover, setHover] = React.useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? 2 : 0;

  let offset = 0;

  return (
    <div className="flex flex-wrap items-center gap-6">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} role="img" aria-label="Composition">
          <circle cx={c} cy={c} r={r} fill="none" stroke="var(--surface-inset)" strokeWidth={thickness} />
          {slices.map((s, i) => {
            if (s.value <= 0) return null;
            const len = (s.value / Math.max(total, 1)) * circ;
            const dash = `${Math.max(0, len - gap)} ${circ - Math.max(0, len - gap)}`;
            const el = (
              <circle
                key={s.label} cx={c} cy={c} r={r} fill="none"
                stroke={s.color ?? seriesColor(i)}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${c} ${c})`}
                style={{ transition: "stroke-width 160ms var(--ease-brand)", cursor: "pointer" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
            offset += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="tnum font-display text-h2 font-semibold leading-none text-ink">
            {hover != null ? format(slices[hover].value) : centreValue}
          </span>
          <span className="mt-1 max-w-[90px] text-micro leading-tight text-ink-3">
            {hover != null ? slices[hover].label : centreLabel}
          </span>
        </div>
      </div>

      <ChartLegend
        className="min-w-0 flex-1 !flex-col !items-start !gap-2"
        items={slices.map((s, i) => ({
          label: s.label,
          color: s.color ?? seriesColor(i),
          value: `${format(s.value)}${total > 0 ? ` · ${Math.round((s.value / total) * 100)}%` : ""}`,
        }))}
      />
    </div>
  );
}
