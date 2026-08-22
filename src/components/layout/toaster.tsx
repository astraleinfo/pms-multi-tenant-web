"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store/app-store";
import { IconAlert, IconCheck, IconInfo, IconX } from "@/components/ui/icons";

const toneStyle = {
  ok: { cls: "border-ok-border bg-ok-soft text-ok-text", icon: <IconCheck size={15} /> },
  warn: { cls: "border-warn-border bg-warn-soft text-warn-text", icon: <IconAlert size={15} /> },
  critical: { cls: "border-critical-border bg-critical-soft text-critical-text", icon: <IconAlert size={15} /> },
  accent: { cls: "border-accent-border bg-accent-soft text-accent-text", icon: <IconInfo size={15} /> },
} as const;

export function Toaster() {
  const { toasts, dismissToast } = useApp();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      role="region"
      aria-live="polite"
    >
      {toasts.map((t) => {
        const s = toneStyle[t.tone];
        return (
          <div
            key={t.id}
            className="pointer-events-auto flex items-start gap-3 rounded-[var(--r)] border border-line bg-surface p-3 shadow-e3"
            style={{ animation: "pop var(--d-2) var(--ease-spring) both" }}
          >
            <span className={cn("mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] border", s.cls)}>
              {s.icon}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[0.8438rem] font-medium leading-snug text-ink">{t.title}</p>
              {t.body && <p className="mt-0.5 text-[0.75rem] leading-snug text-ink-2">{t.body}</p>}
            </div>
            <button
              onClick={() => dismissToast(t.id)}
              className="shrink-0 rounded-[var(--r-sm)] p-1 text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
              aria-label="Dismiss"
            >
              <IconX size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
