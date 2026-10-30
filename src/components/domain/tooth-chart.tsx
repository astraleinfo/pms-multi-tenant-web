"use client";

import type * as React from "react";
import { cn } from "@/lib/cn";
import {
  IconAlert, IconTooth, IconToothFracture, IconToothMobility, type IconProps,
} from "@/components/ui/icons";
import { nextToothState, toothStateMeta, TOOTH_STATES, type ToothState } from "@/lib/tooth-states";

export { TOOTH_STATES, type ToothState };

/** The glyph a state draws on its tooth. Most states are the plain tooth tinted by their swatch;
    the two findings that are not a treatment have a shape of their own. */
const GLYPH: Partial<Record<ToothState, (p: IconProps) => React.ReactElement>> = {
  mobility: IconToothMobility,
  fracture: IconToothFracture,
};

/**
 * What a tooth looks like when the record holds a state this build has never
 * heard of — a value written by a newer version, a hand-edited payload, a
 * migration half done.
 *
 * It is deliberately not "Sound". `clinical_ext` is an open column: the server
 * will hand back whatever was stored in it, and the previous code asserted
 * that the lookup could not miss (`find(...)!`), so a single unrecognised
 * value took the whole record page down with a TypeError. Falling back to
 * healthy instead would be worse than the crash — it would draw a tooth
 * marked for extraction as a sound one, and nobody would know. So the
 * unknown state gets its own neutral, obviously-not-a-diagnosis swatch and
 * says what it actually found.
 */
const UNKNOWN = {
  key: "unknown" as const,
  label: "Not recognised",
  swatch: "bg-neutral-soft border-neutral-border border-dashed",
  ink: "text-neutral-text",
};

/* FDI quadrants, drawn outwards from the midline like a real chart. */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

const Glyph = ({ state, size }: { state: ToothState; size: number }) => {
  const Icon = GLYPH[state] ?? IconTooth;
  return <Icon size={size} />;
};

export type ToothMap = Record<string, ToothState>;

/** The 32 permanent teeth this chart draws, as FDI numbers. */
const DRAWN = new Set(
  [...UPPER_RIGHT, ...UPPER_LEFT, ...LOWER_RIGHT, ...LOWER_LEFT].map(String),
);

export function ToothChart({
  value, onChange, readOnly, className,
}: {
  value: ToothMap;
  onChange?: (next: ToothMap) => void;
  readOnly?: boolean;
  className?: string;
}) {
  const cycle = (n: number) => {
    if (readOnly || !onChange) return;
    const next = nextToothState(value?.[String(n)] ?? "healthy");
    const copy = { ...value };
    if (next === "healthy") delete copy[String(n)];
    else copy[String(n)] = next;
    onChange(copy);
  };

  const Tooth = ({ n }: { n: number }) => {
    const state = value?.[String(n)] ?? "healthy";
    const known = toothStateMeta(state);
    const meta = known ?? UNKNOWN;
    return (
      <button
        type="button"
        onClick={() => cycle(n)}
        disabled={readOnly}
        title={
          known
            ? `Tooth ${n} — ${meta.label}${readOnly ? "" : " (click to change)"}`
            : `Tooth ${n} — stored as “${String(state)}”, which this version does not recognise`
        }
        className={cn(
          "flex h-11 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[6px] border transition-all duration-150",
          meta.swatch, meta.ink,
          !readOnly && "hover:-translate-y-0.5 hover:shadow-e1",
          readOnly && "cursor-default",
        )}
      >
        {known ? <Glyph state={known.key} size={15} /> : <span className="text-micro leading-none">?</span>}
        <span className="tnum text-micro leading-none">{n}</span>
      </button>
    );
  };

  const Row = ({ left, right, label }: { left: number[]; right: number[]; label: string }) => (
    <div className="flex items-center gap-3">
      <span className="hidden w-16 shrink-0 text-right text-micro uppercase tracking-[0.08em] text-ink-3 sm:block">
        {label}
      </span>
      <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto pb-1">
        <div className="flex gap-1">{left.map((n) => <Tooth key={n} n={n} />)}</div>
        <span className="mx-1 h-9 w-px bg-line-strong" aria-hidden />
        <div className="flex gap-1">{right.map((n) => <Tooth key={n} n={n} />)}</div>
      </div>
    </div>
  );

  /* Findings recorded against something this chart has no box for — the demo
     data carries teeth 30, 39 and 40, which are not FDI numbers at all. The
     chart cannot draw them, but it must not imply they are not there: a
     clinician reading a chart is entitled to assume it shows the whole record,
     and silently dropping a finding is the one failure this component must
     not have. */
  const offChart = Object.keys(value ?? {}).filter((k) => !DRAWN.has(k)).sort();

  return (
    <div className={cn("space-y-3", className)}>
      <Row left={UPPER_RIGHT} right={UPPER_LEFT} label="Upper" />
      <Row left={LOWER_RIGHT} right={LOWER_LEFT} label="Lower" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-3">
        {TOOTH_STATES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-caption text-ink-2">
            <span className={cn("flex h-4 w-4 items-center justify-center rounded-[4px] border", s.swatch, s.ink)} aria-hidden>
              <Glyph state={s.key} size={11} />
            </span>
            {s.label}
          </span>
        ))}
        {!readOnly && <span className="ml-auto text-caption text-ink-3">Click a tooth to cycle its state.</span>}
      </div>

      {offChart.length > 0 && (
        <p className="flex items-start gap-2 rounded-[var(--r-sm)] bg-warn-soft px-2.5 py-2 text-caption leading-snug text-warn-text">
          <IconAlert size={14} className="mt-px shrink-0" />
          <span>
            Not shown above: this record also holds{" "}
            {offChart.map((k) => `${k} (${value[k]})`).join(", ")} — tooth
            {offChart.length === 1 ? " number that is" : " numbers that are"} outside the
            permanent FDI chart.
          </span>
        </p>
      )}
    </div>
  );
}
