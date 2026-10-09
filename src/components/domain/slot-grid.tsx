"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { formatTime12 } from "@/lib/format";

/**
 * The diary's slot buttons — the one grid the booking dialog and the
 * follow-up reschedule both pick a time from, so a slot looks and behaves the
 * same wherever it is offered.
 *
 * `taken` slots are drawn struck through, for a grid that shows the whole day;
 * a grid that only offers what is free leaves them out before it gets here.
 */
export function SlotGrid({
  times, value, onChange, taken, label = "Time",
}: {
  times: string[];
  value: string;
  onChange: (time: string) => void;
  taken?: ReadonlySet<string>;
  /** names the group for a screen reader */
  label?: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={label}>
      {times.map((t) => {
        const busy = taken?.has(t) ?? false;
        const on = t === value;
        return (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(t)}
            className={cn(
              "tnum rounded-[var(--r-sm)] border px-2.5 py-1.5 text-caption transition-all duration-150",
              /* busy survives selection: picking a taken slot must still look taken */
              busy
                ? on
                  ? "border-critical bg-critical-soft text-critical-text line-through"
                  : "border-line bg-surface-2 text-ink-3 line-through"
                : on
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-line-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft",
            )}
            title={busy ? "Clashes with an existing booking" : undefined}
          >
            {formatTime12(t)}
          </button>
        );
      })}
    </div>
  );
}
