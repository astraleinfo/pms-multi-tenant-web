"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { IconInfo } from "./icons";

/**
 * The explanation, folded away.
 *
 * Every setting in this application came with a sentence under it saying what
 * it does. Each sentence is worth having and none of them is worth reading
 * twice, so after the first week they are two hundred lines of grey text
 * between the person and the control they came to change. This is where that
 * text goes instead: on the label, one glyph wide, open on hover, on focus and
 * on click, and gone again the moment it is not wanted.
 *
 * It is a hint, never the only copy of something. Anything a person must know
 * before they act — a warning, a consequence, a figure — stays on the page.
 *
 * Mechanics worth knowing:
 *
 *  - It is a `button`, so it is in the tab order and opens from the keyboard.
 *    A `title` attribute is not: a screen reader may or may not read it, it
 *    cannot be reached without a mouse, and it takes a second to appear.
 *  - The bubble is portalled to `body` and positioned from the trigger's
 *    measured rect, so it is not clipped by the card, the table, or the
 *    `overflow-hidden` on whatever else it happens to live inside.
 *  - It flips above the trigger near the bottom of the viewport and is pulled
 *    inside the left and right edges, so a hint on the last row of a long
 *    settings page is still readable.
 */
export function InfoHint({
  children, label = "What this means", size = 14, className, width = 268,
}: {
  children: React.ReactNode;
  /** what a screen reader announces for the trigger itself */
  label?: string;
  size?: number;
  className?: string;
  width?: number;
}) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number; above: boolean } | null>(null);
  const ref = React.useRef<HTMLButtonElement>(null);
  const id = React.useId();

  const place = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 10;
    /* Bubble height is unknown until it renders; 128px covers the two or three
       lines these ever hold and only decides which side to open on. */
    const above = r.bottom + 128 > window.innerHeight && r.top > 128;
    const left = Math.min(
      Math.max(margin, r.left + r.width / 2 - width / 2),
      window.innerWidth - width - margin,
    );
    setPos({ top: above ? r.top - 8 : r.bottom + 8, left, above });
  }, [width]);

  const show = () => { place(); setOpen(true); };
  const hide = () => setOpen(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    /* Anything that moves the trigger takes the bubble with it rather than
       leaving it hanging where the row used to be. */
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={(e) => { e.preventDefault(); open ? hide() : show(); }}
        className={cn(
          "inline-flex shrink-0 translate-y-px items-center justify-center rounded-full text-ink-3",
          "transition-colors duration-150 hover:text-accent-text focus-visible:text-accent-text",
          className,
        )}
      >
        <IconInfo size={size} />
      </button>

      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            width,
            transform: pos.above ? "translateY(-100%)" : undefined,
          }}
          className="pop pointer-events-none z-[70] rounded-[var(--r)] border border-line bg-surface px-3 py-2 text-caption leading-snug text-ink-2 shadow-e3"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}

/**
 * A heading with its explanation on the hint rather than under it.
 *
 * `<HintedTitle as="h1" className="text-h1">Auto dispatch</HintedTitle>` is the
 * shape the page titles and the card headers both took, so it lives here once.
 */
export function HintedTitle({
  children, hint, as: As = "h2", className, hintLabel, size = 14,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  as?: React.ElementType;
  className?: string;
  hintLabel?: string;
  size?: number;
}) {
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <As className={cn("min-w-0 truncate", className)}>{children}</As>
      {hint && (
        <InfoHint size={size} label={hintLabel ?? `About ${typeof children === "string" ? children : "this"}`}>
          {hint}
        </InfoHint>
      )}
    </span>
  );
}

/**
 * A label for something that shows none: the icons in a collapsed rail, an
 * icon-only button. Same portalled bubble as {@link InfoHint}, opened by
 * hovering or focusing whatever it wraps rather than by its own glyph.
 *
 * A `title` attribute would be less code and worse: it waits a second before
 * it appears, it cannot be styled to match anything, and on a rail of twelve
 * icons that second is the whole difference between a nav you can use
 * collapsed and one you have to expand to read.
 */
export function Tooltip({
  label, children, side = "right", className,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: "right" | "top";
  className?: string;
}) {
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const ref = React.useRef<HTMLSpanElement>(null);

  const place = React.useCallback(() => {
    const el = ref.current?.firstElementChild ?? ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos(
      side === "right"
        ? { top: r.top + r.height / 2, left: r.right + 8 }
        : { top: r.top - 8, left: r.left + r.width / 2 },
    );
  }, [side]);

  React.useEffect(() => {
    if (!pos) return;
    const off = () => setPos(null);
    window.addEventListener("scroll", off, true);
    window.addEventListener("resize", off);
    return () => {
      window.removeEventListener("scroll", off, true);
      window.removeEventListener("resize", off);
    };
  }, [pos]);

  return (
    <>
      <span
        ref={ref}
        className={cn("contents", className)}
        onMouseEnter={place}
        onMouseLeave={() => setPos(null)}
        onFocusCapture={place}
        onBlurCapture={() => setPos(null)}
      >
        {children}
      </span>
      {pos && typeof document !== "undefined" && createPortal(
        <div
          role="tooltip"
          style={{
            position: "fixed",
            top: pos.top,
            left: pos.left,
            transform: side === "right" ? "translateY(-50%)" : "translate(-50%, -100%)",
          }}
          className="fade pointer-events-none z-[70] whitespace-nowrap rounded-[var(--r-sm)] border border-line bg-surface px-2 py-1 text-caption font-medium text-ink shadow-e3"
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}
