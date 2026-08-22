"use client";

import * as React from "react";

/** A bare trend mark inside a stat tile. No axes, no tooltip — the number is the message. */
export function Sparkline({
  values, width = 96, height = 28, color = "var(--series-1)", filled = true,
}: {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  filled?: boolean;
}) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => (i / (values.length - 1)) * (width - 3) + 1.5;
  const y = (v: number) => height - 2.5 - ((v - min) / span) * (height - 5);
  const d = values.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const id = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      {filled && (
        <>
          <defs>
            <linearGradient id={`sp${id}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${d} L${x(values.length - 1)},${height} L${x(0)},${height} Z`} fill={`url(#sp${id})`} />
        </>
      )}
      <path d={d} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={2.6}
              fill={color} stroke="var(--surface)" strokeWidth={1.6} />
    </svg>
  );
}
