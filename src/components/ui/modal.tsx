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

/**
 * Hold the page still behind an overlay. Hiding the scrollbar alone widens the
 * page by the scrollbar's width, and everything behind the overlay jumps
 * sideways as it opens and back as it closes — so the width it took is given
 * back as padding. Counted, so a modal opened on top of another does not
 * restore the page while the first is still open.
 */
let locks = 0;
let restore: { overflow: string; paddingRight: string } | null = null;

function useLockScroll(active: boolean) {
  React.useLayoutEffect(() => {
    if (!active) return;
    const body = document.body;
    if (locks++ === 0) {
      const gutter = window.innerWidth - document.documentElement.clientWidth;
      restore = { overflow: body.style.overflow, paddingRight: body.style.paddingRight };
      body.style.overflow = "hidden";
      if (gutter > 0) body.style.paddingRight = `${gutter}px`;
    }
    return () => {
      if (--locks === 0 && restore) {
        body.style.overflow = restore.overflow;
        body.style.paddingRight = restore.paddingRight;
        restore = null;
      }
    };
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

/** How long a closing overlay stays on screen. Matches `.scrim-out` and
    `.dialog-out` in globals.css. */
export const EXIT_MS = 160;

/**
 * Whether an overlay should be on screen, and whether it is on its way out.
 *
 * Closing flips `open` at once, but the overlay stays for `EXIT_MS` so it can
 * animate away instead of vanishing. Reopening during the exit cancels it.
 */
export function usePresence(open: boolean) {
  const [present, setPresent] = React.useState(open);
  const [leaving, setLeaving] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setPresent(true);
      setLeaving(false);
      return;
    }
    if (!present) return;
    setLeaving(true);
    const t = setTimeout(() => { setPresent(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
    /* `present` is read, not reacted to: only a change of `open` starts an exit */
  }, [open]);
  return { present: open || present, leaving: !open && present };
}

/** The modals open right now, oldest first. */
const openStack: object[] = [];

/** Centred dialog. Used for short, decisive tasks, and for a record opened from a list. */
export function Modal(props: OverlayProps) {
  const { open, onClose } = props;
  const mounted = useMounted();
  const { present, leaving } = usePresence(open);
  useLockScroll(present);

  /* What it last showed while open. A caller usually clears the record behind
     a popup the moment it closes, and the exit should show that record
     leaving, not an empty dialog. */
  const last = React.useRef(props);
  if (open) last.current = props;
  const { title, subtitle, children, footer, width = "md" } = open ? props : last.current;

  /* A record's popup can open another on top of it — taking a payment from a
     lab order — and Escape should close the one in front, not both. */
  const self = React.useRef({});
  React.useEffect(() => {
    if (!open) return;
    const me = self.current;
    openStack.push(me);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && openStack[openStack.length - 1] === me) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      openStack.splice(openStack.indexOf(me), 1);
    };
  }, [open, onClose]);

  if (!mounted || !present) return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6",
        /* on its way out it is already gone as far as the pointer is concerned */
        leaving && "pointer-events-none",
      )}
    >
      <div
        className={cn(
          "fixed inset-0 bg-[hsl(var(--sh)/.34)] backdrop-blur-[2px]",
          leaving ? "scrim-out" : "scrim",
        )}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal={leaving ? undefined : "true"}
        className={cn(
          "relative my-auto w-full overflow-hidden rounded-[var(--r-xl)] border border-line bg-surface shadow-e4",
          leaving ? "dialog-out" : "dialog-in",
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
        disabled && "pointer-events-none !text-disabled-ink [&_*]:!text-disabled-ink",
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
