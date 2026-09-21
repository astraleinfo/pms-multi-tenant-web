import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { InfoHint } from "./info";
import { IconChevronLeft } from "./icons";

/**
 * The way back, above the title.
 *
 * A record page is somewhere you arrived from a list, and the browser's back
 * button is the wrong answer for someone who got here from a search, a token
 * or a link in an invoice. It is set above the title rather than beside it so
 * it never competes with the name of the thing being read.
 */
export function BackLink({ href, label, className }: { href: string; label: string; className?: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "-ml-1 inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1 py-0.5 text-caption font-medium",
        "text-ink-3 transition-colors hover:text-accent-text",
        className,
      )}
    >
      <IconChevronLeft size={14} className="shrink-0" />
      {label}
    </Link>
  );
}

/**
 * The top of a page: where you came from, what this is, and what you can do
 * from here.
 *
 * `description` is the paragraph that used to sit under the title on every
 * screen — a good sentence, read once, and thereafter two lines of grey
 * between the person and their work. It now hangs off the title as a hint, so
 * the page opens on the title and the first row of real content.
 *
 * Anything that belongs on the page rather than behind a hint goes in `meta`:
 * a patient's age, an invoice's due date, whether a module is on. That is
 * context somebody reads every time, and a hint is the wrong place for it.
 */
export function PageHeader({
  eyebrow, title, description, actions, meta, className, leading, back, status,
}: {
  eyebrow?: React.ReactNode;
  /**
   * Something that identifies the subject, set beside the title rather than
   * above it: a patient's monogram, a clinic's mark. A record page opens on
   * who it is about, not on the word "Patient".
   */
  leading?: React.ReactNode;
  title: React.ReactNode;
  /**
   * A badge that belongs to the subject rather than to the page — active,
   * suspended, signed, void. It rides beside the title because it changes how
   * everything under it should be read.
   */
  status?: React.ReactNode;
  /** the explanation — shown on the ⓘ beside the title, not under it */
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** at-a-glance context that stays on the page */
  meta?: React.ReactNode;
  /** the list this record came out of */
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cn("mb-block", className)}>
      {back && <BackLink href={back.href} label={back.label} className="mb-2.5" />}
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3">
        {leading && <div className="shrink-0">{leading}</div>}
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="text-micro font-medium text-ink-3">{eyebrow}</p>}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
            <h1 className="min-w-0 truncate font-display text-h1 font-semibold text-ink">{title}</h1>
            {status}
            {description && (
              <InfoHint
                size={15}
                width={320}
                label={`About ${typeof title === "string" ? title : "this page"}`}
              >
                {description}
              </InfoHint>
            )}
          </div>
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption text-ink-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * One fact in a header's meta row: a glyph, then the words.
 *
 * The row is a run of short phrases separated by nothing but space, so the
 * few that carry a glyph are the ones the eye lands on first — when a patient
 * was registered, when they were last seen.
 */
export function MetaItem({
  icon, children, className,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {icon && <span className="shrink-0 text-ink-3">{icon}</span>}
      {children}
    </span>
  );
}
