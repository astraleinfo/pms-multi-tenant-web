import * as React from "react";
import { cn } from "@/lib/cn";

export type Tone = "accent" | "ok" | "warn" | "critical" | "info" | "violet" | "neutral";

const toneClass: Record<Tone, string> = {
  accent:   "bg-accent-soft   text-accent-text   border-accent-border",
  ok:       "bg-ok-soft       text-ok-text       border-ok-border",
  warn:     "bg-warn-soft     text-warn-text     border-warn-border",
  critical: "bg-critical-soft text-critical-text border-critical-border",
  info:     "bg-info-soft     text-info-text     border-info-border",
  violet:   "bg-violet-soft   text-violet-text   border-violet-border",
  neutral:  "bg-neutral-soft  text-neutral-text  border-neutral-border",
};

const dotClass: Record<Tone, string> = {
  accent: "bg-accent", ok: "bg-ok", warn: "bg-warn",
  critical: "bg-critical", info: "bg-info", violet: "bg-violet", neutral: "bg-neutral",
};

/**
 * A tone as a tinted tile: soft ground, saturated glyph, no border.
 *
 * This is the one piece of colour the redesign spends freely. A page of six
 * white panels with six grey icons is legible and completely undifferentiated
 * — you find "Recent visits" by reading every heading. Give each panel's icon
 * its own hue and the page acquires a map: the amber one is history, the green
 * one is the summary, the violet one is the diary. The hue is a landmark, and
 * that is all it is — it is never the only thing saying what a panel holds,
 * and the clinical tones keep their meanings wherever they carry state.
 */
export const toneTile: Record<Tone, string> = {
  accent:   "bg-accent-soft   text-accent-text",
  ok:       "bg-ok-soft       text-ok-text",
  warn:     "bg-warn-soft     text-warn-text",
  critical: "bg-critical-soft text-critical-text",
  info:     "bg-info-soft     text-info-text",
  violet:   "bg-violet-soft   text-violet-text",
  neutral:  "bg-neutral-soft  text-neutral-text",
};

export function Badge({
  tone = "neutral", dot, pulse, className, children, size = "md",
}: {
  tone?: Tone;
  dot?: boolean;
  pulse?: boolean;
  className?: string;
  children: React.ReactNode;
  size?: "sm" | "md";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border font-medium",
        size === "sm" ? "px-2 py-[1px] text-micro" : "px-2.5 py-[3px] text-caption",
        toneClass[tone],
        className,
      )}
    >
      {dot && (
        <span
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", dotClass[tone])}
          style={pulse ? { animation: "pulsedot 1.6s var(--ease) infinite" } : undefined}
        />
      )}
      {children}
    </span>
  );
}

/* ---- status → tone maps, one place, used everywhere ---------------------- */

export const APPOINTMENT_TONE: Record<string, Tone> = {
  scheduled: "info", confirmed: "ok", checked_in: "accent", completed: "ok", cancelled: "neutral",
  no_show: "critical",
};
/* Where a follow-up stands. The warm tones are the rows that still need the
   desk: amber for a new slot to find, red for a number nobody answered. */
export const FOLLOW_UP_TONE: Record<string, Tone> = {
  pending: "neutral", confirmed: "ok", reschedule_required: "warn", no_answer: "critical",
  call_back: "violet", declined: "neutral", rescheduled: "ok",
};
export const QUEUE_TONE: Record<string, Tone> = {
  waiting: "warn", called: "accent", in_consultation: "accent", completed: "ok",
  no_show: "critical", cancelled: "neutral",
};
export const RX_TONE: Record<string, Tone> = {
  pending: "warn", partially_dispensed: "info", dispensed: "ok",
};
export const LAB_TONE: Record<string, Tone> = {
  ordered: "neutral", pending: "warn", resulted: "info", verified: "ok",
};
export const INVOICE_TONE: Record<string, Tone> = {
  draft: "neutral", issued: "info", partially_paid: "warn", paid: "ok", void: "critical",
};
export const FLAG_TONE: Record<string, Tone> = {
  normal: "ok", high: "critical", low: "warn",
};
export const TX_TONE: Record<string, Tone> = {
  purchase: "ok", dispense: "accent", return: "info", adjustment: "warn",
  expiry: "critical", transfer: "neutral",
};

/** A capsule that carries a number — token numbers, counts, sequence markers. */
export function Numeral({
  children, tone = "accent", size = "md", className,
}: {
  children: React.ReactNode;
  tone?: "accent" | "neutral";
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const tones = {
    accent: "bg-accent text-accent-ink",
    neutral: "bg-surface-inset text-ink-2",
  };
  const sizes = {
    sm: "h-6 min-w-6 text-micro px-1.5",
    md: "h-8 min-w-8 text-label px-2",
    lg: "h-11 min-w-11 text-lead px-2.5",
  };
  return (
    <span
      className={cn(
        "tnum inline-flex items-center justify-center rounded-[var(--r-sm)] font-mono font-medium tracking-tight",
        tones[tone], sizes[size], className,
      )}
    >
      {children}
    </span>
  );
}
