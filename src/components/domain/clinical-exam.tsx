"use client";

import { cn } from "@/lib/cn";
import { Field, Input } from "@/components/ui/field";
import { Legend } from "@/components/ui/card";
import { Meter } from "@/components/ui/misc";
import { ToothChart, type ToothMap } from "./tooth-chart";
import type { ClinicalTypeKey } from "@/lib/types";

/* ==========================================================================
   The parts of an encounter that are shaped by clinical type. Same Encounter
   row underneath — only the payload in clinical_ext differs (§3.7).
   ========================================================================== */

export interface Refraction {
  od_sph?: string; od_cyl?: string; od_axis?: string;
  os_sph?: string; os_cyl?: string; os_axis?: string;
}
export interface VisualAcuity { od?: string; os?: string }

export const BODY_SITES = [
  "Scalp", "Face", "Neck", "Chest", "Abdomen", "Back",
  "Left arm", "Right arm", "Hands", "Left leg", "Right leg", "Feet",
];

/* ---- ophthalmology --------------------------------------------------------- */

export function RefractionGrid({
  refraction, va, onChange, readOnly,
}: {
  refraction: Refraction;
  va: VisualAcuity;
  onChange?: (r: Refraction, v: VisualAcuity) => void;
  readOnly?: boolean;
}) {
  const set = (patch: Partial<Refraction>) => onChange?.({ ...refraction, ...patch }, va);
  const setVa = (patch: Partial<VisualAcuity>) => onChange?.(refraction, { ...va, ...patch });

  const cell = (v: string | undefined, on: (s: string) => void, placeholder: string) =>
    readOnly ? (
      <span className="tnum block px-1 py-1.5 font-mono text-[0.8125rem] text-ink">{v || "—"}</span>
    ) : (
      <Input value={v ?? ""} placeholder={placeholder} onChange={(e) => on(e.target.value)}
             className="h-9 px-2 text-center font-mono text-[0.8125rem]" />
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-collapse text-left">
        <thead>
          <tr className="border-b border-line">
            {["Eye", "Sphere", "Cylinder", "Axis", "Acuity"].map((h) => (
              <th key={h} className="px-2 py-2 text-[0.6875rem] font-semibold uppercase tracking-[0.09em] text-ink-3">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          <tr>
            <td className="px-2 py-2 text-[0.8125rem] font-medium text-ink">Right <span className="text-ink-3">(OD)</span></td>
            <td className="px-1 py-1.5">{cell(refraction.od_sph, (s) => set({ od_sph: s }), "-1.75")}</td>
            <td className="px-1 py-1.5">{cell(refraction.od_cyl, (s) => set({ od_cyl: s }), "-0.50")}</td>
            <td className="px-1 py-1.5">{cell(refraction.od_axis, (s) => set({ od_axis: s }), "90")}</td>
            <td className="px-1 py-1.5">{cell(va.od, (s) => setVa({ od: s }), "6/6")}</td>
          </tr>
          <tr>
            <td className="px-2 py-2 text-[0.8125rem] font-medium text-ink">Left <span className="text-ink-3">(OS)</span></td>
            <td className="px-1 py-1.5">{cell(refraction.os_sph, (s) => set({ os_sph: s }), "-1.25")}</td>
            <td className="px-1 py-1.5">{cell(refraction.os_cyl, (s) => set({ os_cyl: s }), "-0.25")}</td>
            <td className="px-1 py-1.5">{cell(refraction.os_axis, (s) => set({ os_axis: s }), "85")}</td>
            <td className="px-1 py-1.5">{cell(va.os, (s) => setVa({ os: s }), "6/9")}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---- dermatology ----------------------------------------------------------- */

const SITE_GEOMETRY: Record<string, { cx: number; cy: number; rx: number; ry: number }> = {
  "Scalp":      { cx: 60, cy: 16, rx: 11, ry: 10 },
  "Face":       { cx: 60, cy: 30, rx: 9, ry: 8 },
  "Neck":       { cx: 60, cy: 42, rx: 7, ry: 5 },
  "Chest":      { cx: 60, cy: 60, rx: 19, ry: 13 },
  "Abdomen":    { cx: 60, cy: 84, rx: 16, ry: 12 },
  "Back":       { cx: 60, cy: 104, rx: 14, ry: 8 },
  "Left arm":   { cx: 30, cy: 72, rx: 8, ry: 26 },
  "Right arm":  { cx: 90, cy: 72, rx: 8, ry: 26 },
  "Hands":      { cx: 60, cy: 122, rx: 22, ry: 6 },
  "Left leg":   { cx: 47, cy: 148, rx: 10, ry: 30 },
  "Right leg":  { cx: 73, cy: 148, rx: 10, ry: 30 },
  "Feet":       { cx: 60, cy: 186, rx: 24, ry: 6 },
};

export function LesionMap({
  sites, onChange, readOnly, className,
}: {
  sites: string[];
  onChange?: (next: string[]) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const toggle = (s: string) => {
    if (readOnly || !onChange) return;
    onChange(sites.includes(s) ? sites.filter((x) => x !== s) : [...sites, s]);
  };

  return (
    <div className={cn("flex flex-wrap items-start gap-6", className)}>
      <svg viewBox="0 0 120 200" width="150" height="250" className="shrink-0" role="img" aria-label="Body site map">
        <rect x="0" y="0" width="120" height="200" rx="10" fill="var(--surface-2)" />
        {Object.entries(SITE_GEOMETRY).map(([site, g]) => {
          const on = sites.includes(site);
          return (
            <ellipse
              key={site}
              cx={g.cx} cy={g.cy} rx={g.rx} ry={g.ry}
              fill={on ? "var(--accent)" : "var(--surface-3)"}
              stroke={on ? "var(--accent)" : "var(--line-strong)"}
              strokeWidth={on ? 2 : 1}
              opacity={on ? 0.9 : 1}
              onClick={() => toggle(site)}
              style={{ cursor: readOnly ? "default" : "pointer", transition: "fill 160ms var(--ease-brand)" }}
            >
              <title>{site}</title>
            </ellipse>
          );
        })}
      </svg>

      <div className="min-w-[190px] flex-1">
        <Legend>Affected sites</Legend>
        <div className="flex flex-wrap gap-1.5">
          {BODY_SITES.map((s) => {
            const on = sites.includes(s);
            return (
              <button
                key={s}
                type="button"
                disabled={readOnly}
                onClick={() => toggle(s)}
                className={cn(
                  "rounded-[var(--r-pill)] border px-2.5 py-1 text-[0.75rem] transition-colors",
                  on ? "border-accent-border bg-accent-soft font-medium text-accent-text" : "border-line-strong bg-surface text-ink-2",
                  !readOnly && "hover:border-ink-3/50",
                )}
              >
                {s}
              </button>
            );
          })}
        </div>
        {!readOnly && (
          <p className="mt-3 text-[0.75rem] text-ink-3">Tap the map or a chip — both write the same field.</p>
        )}
      </div>
    </div>
  );
}

/* ---- scores shared by several disciplines ---------------------------------- */

export function ScoreSlider({
  label, value, onChange, max = 10, tone = "accent", readOnly, suffix,
}: {
  label: string;
  value: number;
  onChange?: (v: number) => void;
  max?: number;
  tone?: "accent" | "warn";
  readOnly?: boolean;
  suffix?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[0.8125rem] font-medium text-ink">{label}</span>
        <span className="tnum font-mono text-[0.8125rem] font-medium text-ink">
          {value}{suffix ?? ` / ${max}`}
        </span>
      </div>
      {readOnly ? (
        <Meter value={value} max={max} tone={tone} />
      ) : (
        <input
          type="range" min={0} max={max} value={value}
          onChange={(e) => onChange?.(Number(e.target.value))}
          className="h-2 w-full cursor-pointer appearance-none rounded-[var(--r-pill)] bg-surface-inset accent-[var(--accent)]"
        />
      )}
    </div>
  );
}

/* ---- the switchboard -------------------------------------------------------- */

export function ClinicalExamPanel({
  clinicalType, ext, onChange, readOnly,
}: {
  clinicalType: ClinicalTypeKey;
  ext: Record<string, unknown>;
  onChange?: (patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  if (clinicalType === "dental") {
    return (
      <ToothChart
        readOnly={readOnly}
        value={(ext.tooth_chart as ToothMap) ?? {}}
        onChange={(next) => onChange?.({ tooth_chart: next })}
      />
    );
  }

  if (clinicalType === "ophthalmology") {
    return (
      <RefractionGrid
        readOnly={readOnly}
        refraction={(ext.refraction as Refraction) ?? {}}
        va={(ext.va as VisualAcuity) ?? {}}
        onChange={(refraction, va) => onChange?.({ refraction, va })}
      />
    );
  }

  return (
    <LesionMap
      readOnly={readOnly}
      sites={(ext.lesion_sites as string[]) ?? []}
      onChange={(next) => onChange?.({ lesion_sites: next })}
    />
  );
}

export function VitalsRow({
  ext, onChange, readOnly,
}: {
  ext: Record<string, unknown>;
  onChange?: (patch: Record<string, unknown>) => void;
  readOnly?: boolean;
}) {
  if (readOnly) {
    return (
      <div className="flex flex-wrap gap-x-8 gap-y-2">
        <span className="text-[0.8125rem] text-ink-2">
          BP <span className="tnum ml-1 font-mono text-ink">{String(ext.bp ?? "—")}</span>
        </span>
        <span className="text-[0.8125rem] text-ink-2">
          Pulse <span className="tnum ml-1 font-mono text-ink">{ext.pulse ? `${ext.pulse} bpm` : "—"}</span>
        </span>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Blood pressure">
        <Input value={String(ext.bp ?? "")} placeholder="120/80" onChange={(e) => onChange?.({ bp: e.target.value })} />
      </Field>
      <Field label="Pulse (bpm)">
        <Input type="number" value={String(ext.pulse ?? "")} placeholder="72"
               onChange={(e) => onChange?.({ pulse: e.target.value === "" ? "" : Number(e.target.value) })} />
      </Field>
    </div>
  );
}
