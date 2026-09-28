import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { InfoHint, quietHint } from "./info";
import { toneTile, type Tone } from "./badge";

/**
 * The one card: a hairline and an off-white ground, and that is the whole of
 * it. A resting card throws no shadow — a page of twenty cards each with its
 * own drop shadow is a page of twenty things claiming to float. Depth is kept
 * for the things that have actually left the page: menus, popovers, dialogues.
 */
export function Card({
  className, children, as: As = "div", interactive, ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType; interactive?: boolean }) {
  return (
    <As
      className={cn(
        "rounded-[var(--r-lg)] border border-line bg-surface",
        interactive &&
          "transition-[box-shadow,border-color] duration-200 ease-[var(--ease-brand)] hover:border-line-strong hover:shadow-e2",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

/**
 * A card's header.
 *
 * Two slots for the second line, and which one a caller reaches for is the
 * whole distinction the redesign turns on:
 *
 *  - `hint` is an explanation — why this panel exists, what the rule behind it
 *    is, what happens when you press the thing. It lives on the ⓘ.
 *  - `subtitle` is a fact this panel is reporting — "4 bookable slots a day",
 *    "MRN 0041 · 34 years", "₹12,400 outstanding". It stays on the page,
 *    because somebody reads it every single time they look at the card.
 */
export function CardHeader({
  title, subtitle, hint, actions, className, icon, tone = "accent",
}: {
  title: React.ReactNode;
  /** an at-a-glance fact — stays visible */
  subtitle?: React.ReactNode;
  /** an explanation — folded onto the ⓘ */
  hint?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
  /**
   * The hue of the icon tile. A landmark, not a status: it tells one panel
   * from another down a long page. Where a panel genuinely carries state —
   * something overdue, something failed — give it the tone that means that.
   */
  tone?: Tone;
}) {
  return (
    <div className={cn("group/hint flex items-center justify-between gap-3 px-card pb-2.5 pt-3.5", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && (
          /* An ordinary panel's glyph is a landmark, so it sits bare in the
             muted ink; only a panel carrying state (warn, critical…) earns a
             tinted tile. A page of coloured tiles is a page shouting. */
          <span
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]",
              tone === "accent" ? "text-ink-3" : toneTile[tone],
            )}
            aria-hidden
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h2 className="min-w-0 truncate text-label font-semibold leading-tight text-ink">{title}</h2>
            {hint && (
              <InfoHint className={quietHint} label={`About ${typeof title === "string" ? title : "this panel"}`}>{hint}</InfoHint>
            )}
          </div>
          {subtitle && <p className="mt-0.5 truncate text-caption leading-snug text-ink-3">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * The quiet link in a card's corner — "View all", "Edit", "Open the ledger".
 *
 * A button here would be wrong twice over: it is not the action the panel is
 * for, and a row of cards each with a bordered button in the corner reads as a
 * page of six equally urgent things. Accent text, no chrome, and it only
 * becomes underlined under the pointer.
 */
export function CardLink({
  href, onClick, children, icon, trailing, className,
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  const cls = cn(
    "inline-flex items-center gap-1.5 rounded-[var(--r-sm)] px-1 py-0.5 text-caption font-medium",
    "text-accent-text underline-offset-[3px] transition-colors hover:underline",
    className,
  );
  const body = <>{icon}{children}{trailing}</>;
  return href
    ? <Link href={href} className={cls}>{body}</Link>
    : <button type="button" onClick={onClick} className={cls}>{body}</button>;
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-card pb-card", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-line-soft px-card py-2.5", className)}>
      {children}
    </div>
  );
}

/**
 * A label above a group of controls. The rule that used to run off to the
 * right of it is gone: inside a card that already has a border, a second
 * horizontal line every few fields is one line too many.
 */
export function Legend({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-2 text-micro font-semibold uppercase tracking-[0.08em] text-ink-3", className)}>
      {children}
    </div>
  );
}
