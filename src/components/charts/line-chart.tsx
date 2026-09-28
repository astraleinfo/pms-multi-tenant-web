"use client";

import * as React from "react";
import { ChartLegend, ChartTooltip, seriesColor, ticksFor, useMeasure, useTooltip } from "./chart-kit";

export interface LineSeries {
  name: string;
  values: number[];
}

/**
 * Line / area over time. One y-scale, always — two measures of different
 * magnitude get two charts, never a second axis.
 */
export function LineChart({
  labels, series, height = 200, format = (n: number) => String(n), area = true, yLabel,
}: {
  labels: string[];
  series: LineSeries[];
  height?: number;
  format?: (n: number) => string;
  area?: boolean;
  yLabel?: string;
}) {
  const { ref, width } = useMeasure<HTMLDivElement>();
  const { tip, setTip } = useTooltip();
  const [hover, setHover] = React.useState<number | null>(null);

  const pad = { t: 12, r: 14, b: 26, l: 44 };
  const w = Math.max(240, width);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const ticks = ticksFor(max);
  const top = ticks[ticks.length - 1];

  const x = (i: number) => pad.l + (labels.length === 1 ? innerW / 2 : (i / (labels.length - 1)) * innerW);
  const y = (v: number) => pad.t + innerH - (v / top) * innerH;

  const pathFor = (vals: number[]) => vals.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const rel = e.clientX - box.left;
    const i = Math.round((rel / innerW) * (labels.length - 1));
    const idx = Math.max(0, Math.min(labels.length - 1, i));
    setHover(idx);
    setTip({
      x: x(idx), y: y(series[0].values[idx]),
      title: labels[idx],
      rows: series.map((s, si) => ({ label: s.name, value: format(s.values[idx]), color: seriesColor(si) })),
    });
  };

  const stride = Math.max(1, Math.ceil(labels.length / 8));

  return (
    <div className="relative" ref={ref}>
      <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} role="img"
           aria-label={`${series.map((s) => s.name).join(", ")} over ${labels.length} periods`}>
        <defs>
          {series.map((s, si) => (
            <linearGradient key={s.name} id={`lg-${si}-${s.name.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={seriesColor(si)} stopOpacity={0.22} />
              <stop offset="100%" stopColor={seriesColor(si)} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>

        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--grid)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle"
                  fontSize={10.5} fill="var(--ink-3)" className="tnum">{format(t)}</text>
          </g>
        ))}

        {labels.map((l, i) => (i % stride === 0 || i === labels.length - 1) && (
          <text key={l + i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10.5} fill="var(--ink-3)">{l}</text>
        ))}

        {area && series.length === 1 && (
          <path
            d={`${pathFor(series[0].values)} L${x(labels.length - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`}
            fill={`url(#lg-0-${series[0].name.replace(/\W/g, "")})`}
          />
        )}

        {series.map((s, si) => (
          <path key={s.name} d={pathFor(s.values)} fill="none" stroke={seriesColor(si)}
                strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {hover != null && (
          <>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + innerH}
                  stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="3 3" />
            {series.map((s, si) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover])} r={4.5}
                      fill={seriesColor(si)} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </>
        )}

        <rect x={pad.l} y={pad.t} width={innerW} height={innerH} fill="transparent"
              onMouseMove={onMove} onMouseLeave={() => { setHover(null); setTip(null); }} />
      </svg>

      <ChartTooltip tip={tip} containerWidth={w} />

      <div className="mt-2 flex items-center justify-between gap-3">
        {series.length > 1
          ? <ChartLegend items={series.map((s, si) => ({ label: s.name, color: seriesColor(si) }))} />
          : <span />}
        {yLabel && <span className="text-micro uppercase tracking-[0.08em] text-ink-3">{yLabel}</span>}
      </div>
    </div>
  );
}
