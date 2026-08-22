import * as React from "react";
import { cn } from "@/lib/cn";

/** The one card. White, hairline, soft shadow — the ground shows through around it. */
export function Card({
  className, children, as: As = "div", interactive, ...rest
}: React.HTMLAttributes<HTMLElement> & { as?: React.ElementType; interactive?: boolean }) {
  return (
    <As
      className={cn(
        "rounded-[var(--r-lg)] border border-line bg-surface shadow-e1",
        interactive &&
          "transition-[box-shadow,transform,border-color] duration-200 ease-[var(--ease-brand)] hover:-translate-y-px hover:shadow-e2 hover:border-line-strong",
        className,
      )}
      {...rest}
    >
      {children}
    </As>
  );
}

export function CardHeader({
  title, subtitle, actions, className, icon,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-4 px-5 pt-4.5 pb-3.5", className)}>
      <div className="flex min-w-0 items-start gap-2.5">
        {icon && <span className="mt-0.5 text-ink-3">{icon}</span>}
        <div className="min-w-0">
          <h2 className="truncate text-[0.9375rem] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h2>
          {subtitle && <p className="mt-1 text-[0.8125rem] leading-snug text-ink-2">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export function CardFooter({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex items-center justify-between gap-3 border-t border-line-soft px-5 py-3.5", className)}>
      {children}
    </div>
  );
}

/** Section label used above groups of controls or fields. */
export function Legend({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "mb-3 flex items-center gap-2.5 text-[0.6875rem] font-semibold uppercase tracking-[0.11em] text-ink-3",
        className,
      )}
    >
      <span className="whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}
