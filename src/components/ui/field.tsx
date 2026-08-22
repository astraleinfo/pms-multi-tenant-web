"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconCheck, IconChevronDown, IconSearch } from "./icons";

const controlBase =
  "w-full rounded-[var(--r)] border border-line-strong bg-surface text-ink " +
  "placeholder:text-ink-3/80 shadow-[inset_0_1px_2px_hsl(var(--sh)/.04)] " +
  "transition-[border-color,box-shadow,background-color] duration-150 ease-[var(--ease-brand)] " +
  "focus:outline-none focus:border-accent focus:shadow-[var(--focus-ring)] " +
  "disabled:bg-surface-2 disabled:text-ink-3 disabled:cursor-not-allowed";

export function Label({
  htmlFor, children, required, hint, className,
}: {
  htmlFor?: string;
  children: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn("mb-1.5 flex items-baseline justify-between gap-2 text-[0.8125rem] font-medium text-ink", className)}
    >
      <span>
        {children}
        {required && <span className="ml-1 text-accent" aria-hidden>*</span>}
      </span>
      {hint && <span className="text-[0.75rem] font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[0.75rem] leading-snug text-ink-3">{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-[0.75rem] font-medium leading-snug text-critical-text">{children}</p>;
}

export function Field({
  label, required, hint, help, error, children, className, htmlFor,
}: {
  label?: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  help?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && <Label htmlFor={htmlFor} required={required} hint={hint}>{label}</Label>}
      {children}
      {error ? <ErrorText>{error}</ErrorText> : help ? <Help>{help}</Help> : null}
    </div>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(
  function Input({ className, invalid, ...rest }, ref) {
    return (
      <input
        ref={ref}
        className={cn(controlBase, "h-9.5 px-3 text-[0.875rem]", invalid && "border-critical focus:border-critical", className)}
        {...rest}
      />
    );
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(controlBase, "resize-y px-3 py-2.5 text-[0.875rem] leading-relaxed", invalid && "border-critical", className)}
        {...rest}
      />
    );
  },
);

export function Select({
  className, invalid, children, ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        className={cn(
          controlBase, "h-9.5 appearance-none pl-3 pr-9 text-[0.875rem]",
          invalid && "border-critical", className,
        )}
        {...rest}
      >
        {children}
      </select>
      <IconChevronDown
        size={16}
        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3"
      />
    </div>
  );
}

export function SearchInput({
  className, wrapperClassName, ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { wrapperClassName?: string }) {
  return (
    <div className={cn("relative", wrapperClassName)}>
      <IconSearch size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        className={cn(controlBase, "h-9.5 pl-9 pr-3 text-[0.875rem] [&::-webkit-search-cancel-button]:appearance-none", className)}
        {...rest}
      />
    </div>
  );
}

export function Checkbox({
  checked, onChange, label, description, disabled, className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  description?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("group flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed opacity-50", className)}>
      <span
        className={cn(
          "mt-px flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-all duration-150 ease-[var(--ease-brand)]",
          checked ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface group-hover:border-ink-3",
        )}
      >
        {checked && <IconCheck size={12} strokeWidth={2.6} />}
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      {(label || description) && (
        <span className="min-w-0">
          {label && <span className="block text-[0.8438rem] leading-snug text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-3">{description}</span>}
        </span>
      )}
    </label>
  );
}

export function Switch({
  checked, onChange, label, disabled, className,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed opacity-50", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors duration-200 ease-[var(--ease-brand)]",
          checked ? "bg-accent" : "bg-line-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-e1 transition-[left] duration-200 ease-[var(--ease-spring)]",
            checked ? "left-[19px]" : "left-[3px]",
          )}
        />
      </button>
      {label && <span className="text-[0.8438rem] text-ink">{label}</span>}
    </label>
  );
}

/** Radio pills — a small set of options where each needs a visible label. */
export function ChoiceGroup<T extends string>({
  value, onChange, options, className, columns,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: React.ReactNode; description?: React.ReactNode }>;
  className?: string;
  columns?: number;
}) {
  return (
    <div
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[var(--r)] border px-3 py-2.5 text-left transition-all duration-150 ease-[var(--ease-brand)]",
              on
                ? "border-accent bg-accent-soft shadow-[inset_0_0_0_1px_var(--accent)]"
                : "border-line-strong bg-surface hover:border-ink-3/50 hover:bg-surface-2",
            )}
          >
            <span className={cn("block text-[0.8438rem] font-medium", on ? "text-accent-text" : "text-ink")}>
              {o.label}
            </span>
            {o.description && (
              <span className="mt-0.5 block text-[0.75rem] leading-snug text-ink-3">{o.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select as toggleable chips. */
export function ChipMulti({
  values, onChange, options, className,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  options: string[];
  className?: string;
}) {
  const toggle = (o: string) =>
    onChange(values.includes(o) ? values.filter((v) => v !== o) : [...values, o]);
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((o) => {
        const on = values.includes(o);
        return (
          <button
            key={o}
            type="button"
            onClick={() => toggle(o)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-3 py-1.5 text-[0.8125rem] transition-all duration-150",
              on
                ? "border-accent bg-accent-soft font-medium text-accent-text"
                : "border-line-strong bg-surface text-ink-2 hover:border-ink-3/50 hover:text-ink",
            )}
          >
            {on && <IconCheck size={12} strokeWidth={2.6} />}
            {o}
          </button>
        );
      })}
    </div>
  );
}
