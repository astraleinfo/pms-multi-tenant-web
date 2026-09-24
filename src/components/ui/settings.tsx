import * as React from "react";
import { cn } from "@/lib/cn";
import { InfoHint, quietHint } from "./info";

/**
 * Settings, as a list rather than as a wall of cards.
 *
 * The shape this replaces was one card per setting: a heading, a paragraph
 * under the heading, a label, a paragraph under the label, and somewhere on
 * the right the one control anybody came for. Twelve settings made twelve
 * boxes and about forty lines of grey text, and the eye had no straight line
 * to run down.
 *
 * What is here instead is a plain list. One rule holds it together: a row is a
 * label on the left and its control on the right, on a shared right-hand edge,
 * separated from the next row by a hairline. The explanation hangs off the
 * label as a hint. Sections carry a quiet header bar, so the page can be read
 * either by scanning the headers or by running down the controls.
 */

/* ---- section ------------------------------------------------------------- */

export function SettingsSection({
  title, hint, description, actions, children, className, id,
}: {
  title?: React.ReactNode;
  /** the explanation, on the ⓘ beside the title */
  hint?: React.ReactNode;
  /** a line that must stay on the page — use sparingly, prefer `hint` */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={cn("overflow-hidden rounded-[var(--r-lg)] border border-line bg-surface", className)}
    >
      {(title || actions) && (
        <header className="group/hint flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="truncate text-label font-semibold text-ink">{title}</h2>
            {hint && <InfoHint className={quietHint} label={`About ${typeof title === "string" ? title : "this section"}`}>{hint}</InfoHint>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      {description && (
        <p className="border-b border-line-soft px-4 py-2.5 text-caption leading-snug text-ink-2">{description}</p>
      )}
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}

/* ---- row ----------------------------------------------------------------- */

/**
 * How wide the control gets. A field is sized for what goes in it: a two-letter
 * prefix in a 350px box looks like the form is expecting a sentence, and an
 * address in a 100px one is unreadable. The column still ends on the same
 * right-hand edge whichever is chosen, so the page keeps its straight line.
 */
const CONTROL_WIDTH = {
  sm: "sm:w-[7rem]",
  md: "sm:w-[12rem]",
  full: "sm:w-[min(22rem,50%)]",
} as const;

export function SettingRow({
  label, hint, htmlFor, control, children, suffix, className, align = "center", badge,
  width = "full",
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  /** ties the label to the control, so clicking the words focuses the field */
  htmlFor?: string;
  /** the control; `children` is accepted as an alias so JSX reads naturally */
  control?: React.ReactNode;
  children?: React.ReactNode;
  /** the unit beside the control — "minutes", "days", "₹" */
  suffix?: React.ReactNode;
  className?: string;
  /** `start` for a textarea or a stack of controls taller than its label */
  align?: "center" | "start";
  badge?: React.ReactNode;
  /** size the control for what it holds, not for the column */
  width?: keyof typeof CONTROL_WIDTH;
}) {
  const Tag = htmlFor ? "label" : "div";
  return (
    <div
      className={cn(
        "group/hint flex flex-col gap-2 px-4 py-row sm:flex-row sm:gap-6",
        align === "center" ? "sm:items-center" : "sm:items-start",
        className,
      )}
    >
      <Tag
        {...(htmlFor ? { htmlFor } : {})}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-1.5 text-label font-medium text-ink",
          align === "start" && "sm:pt-2",
          htmlFor && "cursor-pointer",
        )}
      >
        <span className="min-w-0">{label}</span>
        {hint && <InfoHint className={quietHint} label={`About ${typeof label === "string" ? label : "this setting"}`}>{hint}</InfoHint>}
        {badge}
      </Tag>
      <div
        className={cn(
          "flex shrink-0 items-center gap-2.5 sm:justify-end",
          /* The column ends on the same edge down the whole page, which is
             what makes it a line rather than a ragged stack. It gives way on a
             phone, where a column is a cramp rather than an alignment. */
          CONTROL_WIDTH[width],
        )}
      >
        <div className="min-w-0 flex-1">{control ?? children}</div>
        {suffix && <span className="shrink-0 text-label text-ink-3">{suffix}</span>}
      </div>
    </div>
  );
}

/**
 * A row whose control is a switch. The switch keeps its natural width and sits
 * hard against the right edge rather than stretching across the column.
 */
export function SettingToggleRow({
  label, hint, children, className, badge,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className={cn("group/hint flex items-center justify-between gap-6 px-4 py-row", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-label font-medium text-ink">
        <span className="min-w-0">{label}</span>
        {hint && <InfoHint className={quietHint} label={`About ${typeof label === "string" ? label : "this setting"}`}>{hint}</InfoHint>}
        {badge}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** A row that is a link or a button out to somewhere else. */
export function SettingLinkRow({
  label, hint, children, className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group/hint flex flex-wrap items-center justify-between gap-3 px-4 py-row", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-label font-medium text-ink">
        <span className="min-w-0">{label}</span>
        {hint && <InfoHint className={quietHint}>{hint}</InfoHint>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * A row that is not a control: a fact the page is reporting. Same geometry as
 * the others so it lines up with them, but the right-hand side is a value.
 */
export function SettingValueRow({
  label, hint, value, className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    /* A tighter gap than the control rows: these often sit in a narrow
       sidebar, where `gap-6` is what makes a two-word label wrap. */
    <div className={cn("group/hint flex items-baseline justify-between gap-3 px-4 py-row", className)}>
      <div className="flex min-w-0 shrink items-center gap-1.5 text-label text-ink-2">
        <span className="min-w-0">{label}</span>
        {hint && <InfoHint className={quietHint}>{hint}</InfoHint>}
      </div>
      <div className="min-w-0 shrink-0 text-right text-label font-medium text-ink">{value}</div>
    </div>
  );
}

/* ---- danger -------------------------------------------------------------- */

/**
 * Destructive actions, set apart without being shouted.
 *
 * A pink card the width of the page, with a heading and two lines of warning,
 * turns "this one is different" into "this is the loudest thing on the
 * screen" — and a person who sees it on every settings page stops seeing it.
 * The separation is carried by the hairline, a small red heading and the
 * button's own colour; the ground stays neutral.
 */
export function DangerZone({
  title = "Danger zone", children, className,
}: {
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-[var(--r-lg)] border border-critical-border bg-surface", className)}>
      <header className="border-b border-critical-border bg-critical-soft px-4 py-2.5">
        <h2 className="text-label font-semibold text-critical-text">{title}</h2>
      </header>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}

export function DangerRow({
  label, hint, children, className,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("group/hint flex flex-wrap items-center justify-between gap-3 px-4 py-row", className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-label font-medium text-ink">
        <span className="min-w-0">{label}</span>
        {hint && <InfoHint className={quietHint}>{hint}</InfoHint>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * The save bar that sits under a section: the primary on the right, the way
 * back beside it, and nothing else competing for the same corner.
 */
export function SettingsActions({
  children, note, className,
}: {
  children: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", className)}>
      <p className="min-w-0 text-caption text-ink-3">{note}</p>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  );
}
