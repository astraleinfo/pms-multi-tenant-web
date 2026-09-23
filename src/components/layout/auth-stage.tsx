"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconLock, IconShield } from "@/components/ui/icons";

/** The accent, lifted towards white: the brand blue on its own is too dark
    to read as text on the stage in the light theme. */
const STAGE_ACCENT = "color-mix(in srgb, var(--accent) 45%, white)";

/**
 * The stage both sign-in pages stand on.
 *
 * Two panes. The form gets a quiet, full-height light panel of its own — it is
 * the only thing anybody came here to do, so nothing competes with it. The
 * other pane is the brand: what the product is for, in the clinic's terms, and
 * a small picture of it drawn in CSS rather than shipped as a screenshot, so it
 * is sharp at any size, follows the theme, and costs nothing to load.
 *
 * On a phone the brand pane folds away to a header strip: someone signing in
 * on a phone at the front desk wants the form, not the pitch.
 */
export function AuthStage({
  eyebrow, title, address, blurb, points, preview, children,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  address?: string;
  blurb: React.ReactNode;
  points?: Array<{ title: string; body: string; icon?: React.ReactNode }>;
  /** an illustration of the product for the brand pane */
  preview?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-surface text-ink lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(26rem,0.9fr)]">
      {/* ---- brand pane ---- */}
      <section className="relative isolate overflow-hidden bg-stage text-stage-ink">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(900px 520px at 0% 0%, color-mix(in srgb, var(--accent) 34%, transparent), transparent 60%), " +
              "radial-gradient(700px 480px at 100% 100%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 62%)",
          }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(var(--stage-ink) 1px, transparent 1px), linear-gradient(90deg, var(--stage-ink) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
            maskImage: "radial-gradient(ellipse at 30% 30%, black 20%, transparent 75%)",
          }}
          aria-hidden
        />

        <div className="mx-auto flex h-full w-full max-w-[40rem] flex-col px-5 py-6 sm:px-10 lg:py-12">
          <Brand />

          <div className="rise mt-8 hidden lg:block">
            {eyebrow && (
              <p className="text-micro font-semibold uppercase tracking-[0.16em]" style={{ color: STAGE_ACCENT }}>{eyebrow}</p>
            )}
            <h1 className="mt-3 max-w-xl font-display text-[clamp(2rem,3.4vw,2.85rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-stage-ink">
              {title}
            </h1>
            {address && <AddressPill address={address} />}
            <div className="mt-5 max-w-lg text-lead leading-relaxed text-stage-dim">{blurb}</div>
          </div>

          {preview && <div className="rise mt-9 hidden lg:block" aria-hidden>{preview}</div>}

          {points && (
            <dl className={cn(
              "mt-10 hidden grid-cols-1 gap-x-6 gap-y-5 lg:grid",
              points.length % 2 ? "grid-cols-1" : "sm:grid-cols-2",
            )}>
              {points.map((p, i) => (
                <div key={p.title} className="flex gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r)] border border-white/12 bg-white/[0.06]" style={{ color: STAGE_ACCENT }}>
                    {p.icon ?? <span className="tnum font-mono text-caption">0{i + 1}</span>}
                  </span>
                  <div>
                    <dt className="text-body font-semibold text-stage-ink">{p.title}</dt>
                    <dd className="mt-0.5 text-label leading-relaxed text-stage-dim">{p.body}</dd>
                  </div>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-auto hidden items-center gap-2 pt-10 text-caption text-stage-dim lg:flex">
            <IconShield size={14} />
            Encrypted in transit. Every clinic&apos;s records are kept apart from every other&apos;s.
          </p>
        </div>
      </section>

      {/* ---- form pane ---- */}
      <section className="flex min-h-[calc(100dvh-4.5rem)] items-center justify-center bg-surface px-5 py-10 sm:px-8 lg:min-h-dvh">
        <div className="pop w-full max-w-[24rem]">
          {/* On a phone the brand pane is a header strip, so the title and
              address it would have shown are said here instead. */}
          {address && (
            <p className="mb-5 flex items-center justify-center gap-1.5 text-caption text-ink-3 lg:hidden">
              <IconLock size={12} /> <span className="tnum font-mono">{address}</span>
            </p>
          )}
          {children}
        </div>
      </section>
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink shadow-[0_8px_24px_-8px_color-mix(in_srgb,var(--accent)_70%,transparent)]" aria-hidden>
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
  );
}

function AddressPill({ address }: { address: string }) {
  return (
    <p className="mt-4 inline-flex items-center gap-2 rounded-[var(--r-pill)] border border-white/12 bg-white/[0.05] px-3 py-1.5">
      <span className="h-1.5 w-1.5 rounded-full bg-ok" aria-hidden />
      <span className="tnum break-all font-mono text-label">{address}</span>
    </p>
  );
}

/* ---- the pictures ------------------------------------------------------------ */

/** A glass card for the illustrations. */
function Glass({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] border border-white/12 bg-white/[0.07] p-3.5 shadow-[0_24px_48px_-24px_rgba(0,0,0,0.6)] backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </div>
  );
}

function Bar({ w, className }: { w: string; className?: string }) {
  return <span className={cn("block h-1.5 rounded-full bg-white/20", className)} style={{ width: w }} />;
}

/**
 * A clinic's day, in miniature: the queue, the diary and the money — the
 * three things a practice actually opens the product for.
 */
export function ClinicPreview() {
  const queue = [
    { token: "A12", name: "S. Rée", state: "In consultation", tone: "bg-accent" },
    { token: "A13", name: "M. Okafor", state: "Waiting · 6 min", tone: "bg-warn" },
    { token: "A14", name: "P. Nair", state: "Checked in", tone: "bg-ok" },
  ];
  const bars = [38, 52, 44, 70, 58, 82, 64];
  return (
    /* A grid, not absolute positions: overlapping cards look deliberate at
       one width and like a layout bug at every other. */
    <div className="grid max-w-[36rem] grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)] gap-3">
      <Glass className="min-w-0">
        <div className="flex items-center justify-between">
          <p className="text-caption font-semibold">Today&apos;s queue</p>
          <span className="rounded-[var(--r-pill)] bg-white/10 px-2 py-0.5 text-micro text-stage-dim">3 waiting</span>
        </div>
        <ul className="mt-3 space-y-2">
          {queue.map((q) => (
            <li key={q.token} className="flex items-center gap-2.5 rounded-[var(--r)] bg-white/[0.05] px-2.5 py-2">
              <span className="tnum w-8 font-mono text-micro text-stage-dim">{q.token}</span>
              <span className="min-w-0 flex-1 truncate text-caption">{q.name}</span>
              <span className="flex items-center gap-1.5 text-micro text-stage-dim">
                <span className={cn("h-1.5 w-1.5 rounded-full", q.tone)} />
                {q.state}
              </span>
            </li>
          ))}
        </ul>
      </Glass>

      <Glass className="flex min-w-0 flex-col">
        <p className="text-micro uppercase tracking-[0.12em] text-stage-dim">Visits this week</p>
        <div className="mt-3 flex h-20 flex-1 items-end gap-1.5">
          {bars.map((h, i) => (
            <span
              key={i}
              className={cn("flex-1 rounded-t-[3px]", i === bars.length - 1 ? "bg-accent" : "bg-white/25")}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
        <p className="tnum mt-2 font-display text-title-sm font-semibold">148</p>
      </Glass>

      <Glass className="col-span-2 flex min-w-0 items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ok/25 text-ok">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-caption font-semibold">Invoice paid</p>
          <p className="truncate text-micro text-stage-dim">Consultation, radiograph · by UPI</p>
        </div>
        <span className="tnum font-mono text-caption">₹3,600</span>
      </Glass>
    </div>
  );
}

/** The console, in miniature: clinics and what they are running. */
export function ConsolePreview() {
  const rows = [
    { name: "Northgate Dental", on: 4 },
    { name: "Clearview Eye", on: 3 },
    { name: "Rowan Skin", on: 2 },
  ];
  return (
    <Glass className="max-w-[30rem]">
      <div className="flex items-center justify-between">
        <p className="text-caption font-semibold">Clinics</p>
        <span className="text-micro text-stage-dim">modules on</span>
      </div>
      <ul className="mt-3 space-y-2">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-3 rounded-[var(--r)] bg-white/[0.05] px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate text-caption">{r.name}</span>
            <span className="flex gap-1">
              {Array.from({ length: 5 }, (_, i) => (
                <span key={i} className={cn("h-2 w-5 rounded-full", i < r.on ? "bg-accent" : "bg-white/15")} />
              ))}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 space-y-1.5">
        <Bar w="72%" />
        <Bar w="48%" className="bg-white/12" />
      </div>
    </Glass>
  );
}
