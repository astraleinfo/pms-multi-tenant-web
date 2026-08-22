"use client";

import { cn } from "@/lib/cn";
import { IconTooth } from "@/components/ui/icons";

export type ToothState = "healthy" | "watch" | "filling" | "crown" | "extract";

export const TOOTH_STATES: Array<{ key: ToothState; label: string; swatch: string; ink: string }> = [
  { key: "healthy", label: "Sound", swatch: "bg-surface border-line-strong", ink: "text-ink-2" },
  { key: "watch", label: "Watch", swatch: "bg-warn-soft border-warn-border", ink: "text-warn-text" },
  { key: "filling", label: "Filled", swatch: "bg-info-soft border-info-border", ink: "text-info-text" },
  { key: "crown", label: "Crowned", swatch: "bg-accent-soft border-accent-border", ink: "text-accent-text" },
  { key: "extract", label: "For extraction", swatch: "bg-critical-soft border-critical-border", ink: "text-critical-text" },
];

const CYCLE: ToothState[] = ["healthy", "watch", "filling", "crown", "extract"];

/* FDI quadrants, drawn outwards from the midline like a real chart. */
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];

export type ToothMap = Record<string, ToothState>;

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
    const cur = value[String(n)] ?? "healthy";
    const next = CYCLE[(CYCLE.indexOf(cur) + 1) % CYCLE.length];
    const copy = { ...value };
    if (next === "healthy") delete copy[String(n)];
    else copy[String(n)] = next;
    onChange(copy);
  };

  const Tooth = ({ n }: { n: number }) => {
    const state = value[String(n)] ?? "healthy";
    const meta = TOOTH_STATES.find((s) => s.key === state)!;
    return (
      <button
        type="button"
        onClick={() => cycle(n)}
        disabled={readOnly}
        title={`Tooth ${n} — ${meta.label}${readOnly ? "" : " (click to change)"}`}
        className={cn(
          "flex h-11 w-8 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[6px] border transition-all duration-150",
          meta.swatch, meta.ink,
          !readOnly && "hover:-translate-y-0.5 hover:shadow-e1",
          readOnly && "cursor-default",
        )}
      >
        <IconTooth size={15} />
        <span className="tnum font-mono text-[0.5625rem] leading-none opacity-80">{n}</span>
      </button>
    );
  };

  const Row = ({ left, right, label }: { left: number[]; right: number[]; label: string }) => (
    <div className="flex items-center gap-3">
      <span className="hidden w-16 shrink-0 text-right text-[0.6875rem] uppercase tracking-[0.08em] text-ink-3 sm:block">
        {label}
      </span>
      <div className="flex flex-1 items-center justify-center gap-1 overflow-x-auto pb-1">
        <div className="flex gap-1">{left.map((n) => <Tooth key={n} n={n} />)}</div>
        <span className="mx-1 h-9 w-px bg-line-strong" aria-hidden />
        <div className="flex gap-1">{right.map((n) => <Tooth key={n} n={n} />)}</div>
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-3", className)}>
      <Row left={UPPER_RIGHT} right={UPPER_LEFT} label="Upper" />
      <Row left={LOWER_RIGHT} right={LOWER_LEFT} label="Lower" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line-soft pt-3">
        {TOOTH_STATES.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[0.75rem] text-ink-2">
            <span className={cn("h-3 w-3 rounded-[4px] border", s.swatch)} aria-hidden />
            {s.label}
          </span>
        ))}
        {!readOnly && <span className="ml-auto text-[0.75rem] text-ink-3">Click a tooth to cycle its state.</span>}
      </div>
    </div>
  );
}
