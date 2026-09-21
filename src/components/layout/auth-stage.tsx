"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconShield } from "@/components/ui/icons";

/**
 * The dark stage both login pages sit on. Editorial column on the left, the
 * card on the right, and nothing else — a signed-out visitor sees no clinic
 * data at all.
 */
export function AuthStage({
  eyebrow, title, address, blurb, points, children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  address?: string;
  blurb: React.ReactNode;
  points?: Array<{ title: string; body: string }>;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-stage text-stage-ink">
      <div className="fixed inset-0 -z-10 bg-stage" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(1100px 620px at 12% -10%, color-mix(in srgb, var(--stage-2) 92%, transparent), transparent 62%), " +
            "radial-gradient(760px 520px at 96% 108%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto grid grid-cols-1 min-h-dvh w-full max-w-[1180px] items-center gap-10 px-5 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1.05fr_minmax(0,25rem)] lg:gap-16">
        <div className="rise order-2 lg:order-1">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink" aria-hidden>
              <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.2 20 7v6.4c0 4.6-3.4 7.6-8 9-4.6-1.4-8-4.4-8-9V7l8-3.8Z" />
                <path d="M12 8.4v7M8.5 11.9h7" />
              </svg>
            </span>
            <div>
              <p className="font-display text-title-sm font-semibold leading-none">Astrale</p>
              <p className="mt-1 text-micro uppercase tracking-[0.16em] text-stage-dim">Practice OS</p>
            </div>
          </div>

          {eyebrow && (
            <p className="mt-8 text-micro font-semibold uppercase tracking-[0.16em] text-accent-text">{eyebrow}</p>
          )}
          <h1 className="mt-3 max-w-xl font-display text-[clamp(1.9rem,4.2vw,2.9rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-stage-ink">
            {title}
          </h1>

          {address && (
            <p className="mt-4 inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-white/12 bg-white/[0.05] px-3 py-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              <span className="tnum break-all font-mono text-label text-stage-ink">{address}</span>
            </p>
          )}

          <div className="mt-5 max-w-lg text-body leading-relaxed text-stage-dim sm:text-lead">{blurb}</div>

          {points && (
            <dl className="mt-8 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2">
              {points.map((a, i) => (
                <div key={a.title} className="flex gap-3">
                  <span className="tnum mt-0.5 font-mono text-caption text-accent-text">0{i + 1}</span>
                  <div>
                    <dt className="text-body font-semibold text-stage-ink">{a.title}</dt>
                    <dd className="mt-1 text-label leading-relaxed text-stage-dim">{a.body}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-8 flex items-center gap-2 text-caption text-stage-dim">
            <IconShield size={14} />
            Demonstration data. Credentials are hashed, and every request is scoped to one clinic.
          </p>
        </div>

        <div className="pop order-1 rounded-[var(--r-xl)] border border-white/10 bg-white/[0.04] p-1.5 shadow-e4 backdrop-blur-sm lg:order-2">
          <div className="rounded-[calc(var(--r-xl)-6px)] bg-surface p-5 sm:p-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** Click-to-fill credential list. A demo needs a way in; a real build has none. */
export function DemoCredentials({
  accounts, onPick, className,
}: {
  accounts: Array<{ label: string; sub: string; email: string; password: string; disabled?: string }>;
  onPick: (email: string, password: string) => void;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn("rounded-[var(--r)] border border-line bg-surface-2", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
        aria-expanded={open}
      >
        <span className="text-caption font-medium text-ink">Demo accounts</span>
        <span className="text-caption text-ink-3">{open ? "Hide" : "Show"}</span>
      </button>
      {open && (
        <ul className="max-h-56 space-y-1 overflow-y-auto border-t border-line-soft p-1.5">
          {accounts.map((a) => (
            <li key={a.email}>
              <button
                type="button"
                disabled={!!a.disabled}
                onClick={() => onPick(a.email, a.password)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-[var(--r-sm)] px-2 py-1.5 text-left transition-colors",
                  a.disabled ? "cursor-not-allowed opacity-65" : "hover:bg-hover",
                )}
                title={a.disabled ?? "Fill these credentials"}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-caption font-medium text-ink">{a.label}</span>
                  <span className="tnum block truncate font-mono text-micro text-ink-3">{a.email}</span>
                </span>
                {a.disabled
                  ? <span className="shrink-0 text-micro uppercase tracking-wide text-critical-text">{a.disabled}</span>
                  : <span className="shrink-0 text-micro uppercase tracking-wide text-ink-3">{a.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
