import * as React from "react";
import { cn } from "@/lib/cn";

export function PageHeader({
  eyebrow, title, description, actions, meta, className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[0.6875rem] font-semibold uppercase tracking-[0.13em] text-accent-text">{eyebrow}</p>
        )}
        <h1 className="font-display text-[1.625rem] font-semibold leading-[1.15] tracking-[-0.025em] text-ink">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-ink-2">{description}</p>
        )}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">{meta}</div>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
