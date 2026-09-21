"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconAlert, IconCheck, IconInfo, IconSpark, IconX } from "./icons";
import type { Tone } from "./badge";

/**
 * A line of guidance across the width of the content.
 *
 * Not a card and not a toast: a card is a place where work is done, a toast is
 * gone before it is read. This is the third thing — a standing note about the
 * screen you are on. A tip that explains the page, a warning about what a
 * setting will do, a confirmation that something has already happened.
 *
 * `dismissKey` makes it a tip rather than a fixture. Something that teaches
 * you the tabs is useful once and furniture forever, so closing it is
 * remembered per browser and it does not come back. A callout with no key
 * cannot be closed at all — a warning is not the reader's to switch off.
 */

const tones: Record<Tone, { wrap: string; glyph: string }> = {
  accent:   { wrap: "border-accent-border   bg-accent-soft   text-accent-text",   glyph: "text-accent" },
  ok:       { wrap: "border-ok-border       bg-ok-soft       text-ok-text",       glyph: "text-ok" },
  warn:     { wrap: "border-warn-border     bg-warn-soft     text-warn-text",     glyph: "text-warn" },
  critical: { wrap: "border-critical-border bg-critical-soft text-critical-text", glyph: "text-critical" },
  info:     { wrap: "border-info-border     bg-info-soft     text-info-text",     glyph: "text-info" },
  violet:   { wrap: "border-violet-border   bg-violet-soft   text-violet-text",   glyph: "text-violet" },
  neutral:  { wrap: "border-line           bg-surface-2      text-ink-2",         glyph: "text-ink-3" },
};

const DEFAULT_GLYPH: Record<string, React.ReactNode> = {
  warn: <IconAlert size={16} />,
  critical: <IconAlert size={16} />,
  ok: <IconCheck size={16} />,
};

export function Callout({
  tone = "info", title, children, icon, action, className, dismissKey,
}: {
  tone?: Tone;
  /** a lead-in run into the sentence — "Tip", "Heads up", "Not enabled" */
  title?: React.ReactNode;
  children: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  /** makes it closable, and remembers that it was closed */
  dismissKey?: string;
}) {
  const storageKey = dismissKey ? `astrale-pms.callout.${dismissKey}` : null;
  /* Starts closed and opens once the browser has been asked, rather than
     flashing a tip the reader dismissed a fortnight ago. */
  const [shown, setShown] = React.useState(!storageKey);

  React.useEffect(() => {
    if (!storageKey) return;
    try { setShown(localStorage.getItem(storageKey) !== "1"); } catch { setShown(true); }
  }, [storageKey]);

  if (!shown) return null;

  const t = tones[tone];

  return (
    <div
      role="note"
      className={cn(
        "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-[var(--r-lg)] border px-3.5 py-2.5 text-label",
        t.wrap, className,
      )}
    >
      <span className={cn("mt-px shrink-0", t.glyph)} aria-hidden>
        {icon ?? DEFAULT_GLYPH[tone] ?? <IconInfo size={16} />}
      </span>
      <p className="min-w-0 flex-1 leading-relaxed">
        {title && <span className="font-semibold">{title}: </span>}
        {children}
      </p>
      {action && <span className="shrink-0">{action}</span>}
      {storageKey && (
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => {
            setShown(false);
            try { localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
          }}
          className="-mr-1 shrink-0 rounded-[var(--r-sm)] p-1 opacity-70 transition-opacity hover:opacity-100"
        >
          <IconX size={14} />
        </button>
      )}
    </div>
  );
}

/** The house tip: one sentence about the screen, closable, remembered. */
export function Tip({
  children, dismissKey, className, action,
}: {
  children: React.ReactNode;
  dismissKey: string;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <Callout tone="warn" title="Tip" icon={<IconSpark size={16} />} dismissKey={dismissKey} action={action} className={className}>
      {children}
    </Callout>
  );
}
