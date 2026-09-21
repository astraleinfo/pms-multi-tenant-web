"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { Button } from "./button";
import { IconX } from "./icons";

function useMounted() {
  const [m, setM] = React.useState(false);
  React.useEffect(() => setM(true), []);
  return m;
}

function useLockScroll(active: boolean) {
  React.useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [active]);
}

interface OverlayProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: "sm" | "md" | "lg" | "xl";
}

const widths = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" };

/** Centred dialog. Used for short, decisive tasks. */
export function Modal({ open, onClose, title, subtitle, children, footer, width = "md" }: OverlayProps) {
  const mounted = useMounted();
  useLockScroll(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div
        className="fixed inset-0 bg-[hsl(var(--sh)/.34)] backdrop-blur-[2px] fade"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "pop relative my-auto w-full overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface shadow-e4",
          widths[width],
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-title font-semibold leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-caption leading-snug text-ink-3">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </Button>
        </div>
        <div className="max-h-[min(70vh,720px)] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line-soft bg-surface-2 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Right-hand drawer. Used when the task needs the page still visible behind it. */
export function Drawer({ open, onClose, title, subtitle, children, footer, width = "md" }: OverlayProps) {
  const mounted = useMounted();
  useLockScroll(open);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const w = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[width];

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="fixed inset-0 bg-[hsl(var(--sh)/.34)] backdrop-blur-[2px] fade" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative flex h-full w-full flex-col border-l border-line bg-surface shadow-e4",
          w,
        )}
        style={{ animation: "drawerin var(--d-3) var(--ease-out) both" }}
      >
        <style>{"@keyframes drawerin{from{transform:translateX(24px);opacity:.4}to{transform:none;opacity:1}}"}</style>
        <div className="flex items-start justify-between gap-4 border-b border-line-soft px-6 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-title font-semibold leading-tight text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-caption leading-snug text-ink-3">{subtitle}</p>}
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close">
            <IconX size={16} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line-soft bg-surface-2 px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Anchored popover menu. */
export function Menu({
  trigger, children, align = "end", side = "bottom", className, width = 220,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (close: () => void) => React.ReactNode;
  align?: "start" | "end";
  /**
   * Which way the panel opens. A trigger pinned to the foot of the rail has
   * nothing below it to open into, so it opens upward instead of unrolling
   * off the bottom of the window.
   */
  side?: "bottom" | "top";
  className?: string;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className={cn("relative", className)} ref={ref}>
      {trigger({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={cn(
            "pop absolute z-40 overflow-hidden rounded-[var(--r)] border border-line bg-surface p-1 shadow-e3",
            align === "end" ? "right-0" : "left-0",
            side === "top" ? "bottom-full mb-1.5" : "mt-1.5",
          )}
          style={{ width }}
          role="menu"
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children, onClick, icon, tone, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  icon?: React.ReactNode;
  tone?: "critical";
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-[var(--r-sm)] px-2.5 py-2 text-left text-label transition-colors duration-100",
        tone === "critical" ? "text-critical-text hover:bg-critical-soft" : "text-ink hover:bg-hover",
        disabled && "pointer-events-none opacity-65",
      )}
    >
      {icon && <span className="text-ink-3">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-2 text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
      {children}
    </div>
  );
}

export function MenuSep() {
  return <div className="my-1 h-px bg-line-soft" />;
}
