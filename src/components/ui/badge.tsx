import * as React from "react";
import { cn } from "@/lib/cn";

export type Tone = "accent" | "ok" | "warn" | "critical" | "info" | "neutral";

const toneClass: Record<Tone, string> = {
  accent:   "bg-accent-soft   text-accent-text   border-accent-border",
  ok:       "bg-ok-soft       text-ok-text       border-ok-border",
  warn:     "bg-warn-soft     text-warn-text     border-warn-border",
  critical: "bg-critical-soft text-critical-text border-critical-border",
  info:     "bg-info-soft     text-info-text     border-info-border",
  neutral:  "bg-neutral-soft  text-neutral-text  border-neutral-border",
};

const dotClass: Record<Tone, string> = {
  accent: "bg-accent", ok: "bg-ok", warn: "bg-warn",
  critical: "bg-critical", info: "bg-info", neutral: "bg-neutral",
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
        size === "sm" ? "px-2 py-[1px] text-[0.6875rem]" : "px-2.5 py-[3px] text-[0.75rem]",
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
  scheduled: "info", checked_in: "accent", completed: "ok", cancelled: "neutral", no_show: "critical",
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
    sm: "h-6 min-w-6 text-[0.6875rem] px-1.5",
    md: "h-8 min-w-8 text-[0.8125rem] px-2",
    lg: "h-11 min-w-11 text-[1rem] px-2.5",
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
