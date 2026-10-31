"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { IconCheck, IconChevronDown, IconEye, IconEyeOff, IconSearch } from "./icons";
import { controlBase, controlInvalid } from "./control";
import { DateInput, DateTimeInput, Panel, TimeInput } from "./picker";

export { Select } from "./picker";

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
      className={cn("mb-1.5 flex items-baseline justify-between gap-2 text-label font-medium text-ink", className)}
    >
      <span>
        {children}
        {required && <span className="ml-1 text-accent" aria-hidden>*</span>}
      </span>
      {hint && <span className="text-caption font-normal text-ink-3">{hint}</span>}
    </label>
  );
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-caption leading-snug text-ink-3">{children}</p>;
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  return <p className="mt-1.5 text-caption font-medium leading-snug text-critical-text">{children}</p>;
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
    /* The browser's own date and time pickers are drawn by the operating
       system and ignore the theme, so those three types get ours instead —
       same value strings, same change event, so no call site has to know. */
    if (rest.type === "date") return <DateInput className={className} invalid={invalid} {...rest} />;
    if (rest.type === "time") return <TimeInput className={className} invalid={invalid} {...rest} />;
    if (rest.type === "datetime-local") return <DateTimeInput className={className} invalid={invalid} {...rest} />;
    return (
      <input
        ref={ref}
        className={cn(controlBase, "h-9.5 px-3 text-body", invalid && controlInvalid, className)}
        {...rest}
      />
    );
  },
);

/**
 * A password field that can be shown. Typing a long password blind on a phone
 * is how accounts get locked; the toggle is a button, so it is reachable by
 * keyboard, and it never submits the form.
 */
export const PasswordInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { invalid?: boolean }
>(function PasswordInput({ className, invalid, ...rest }, ref) {
  const [shown, setShown] = React.useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={shown ? "text" : "password"}
        className={cn(controlBase, "h-9.5 pl-3 pr-10 text-body", invalid && controlInvalid, className)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-[var(--r)] text-ink-3 transition-colors hover:text-ink"
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
      >
        {shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
      </button>
    </div>
  );
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(
  function Textarea({ className, invalid, rows = 3, ...rest }, ref) {
    return (
      <textarea
        ref={ref}
        rows={rows}
        className={cn(controlBase, "resize-y px-3 py-2.5 text-body leading-relaxed", invalid && "border-critical", className)}
        {...rest}
      />
    );
  },
);

/**
 * A number field you can actually empty.
 *
 * The obvious `value={n} onChange={Number(e.target.value) || 0}` cannot be
 * cleared: deleting the last digit yields `""`, which becomes `0`, which is
 * written straight back into the box. Anyone typing a figure has to select the
 * zero first, and anyone who does not ends up with `020` — or gives up and
 * types the number into the field next door.
 *
 * So the text is this component's own state while it is being edited, and the
 * parent is told a number. An empty box means zero as far as the parent is
 * concerned, but stays empty on screen until focus leaves it.
 */
/** Bring a figure inside the bounds the field declares, if it declares any. */
function clamp(value: number, min?: string | number, max?: string | number) {
  const low = min === undefined || min === "" ? -Infinity : Number(min);
  const high = max === undefined || max === "" ? Infinity : Number(max);
  if (Number.isFinite(low) && value < low) return low;
  if (Number.isFinite(high) && value > high) return high;
  return value;
}

export function NumberInput({
  value, onChange, onBlur, className, invalid, ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> & {
  value: number;
  onChange: (value: number) => void;
  invalid?: boolean;
}) {
  const show = (n: number) => (Number.isFinite(n) ? String(n) : "");
  const [text, setText] = React.useState(() => show(value));
  /* what the parent was last told — so a change from outside (a dialogue
     reopening on another row) resyncs, while our own echo does not. */
  const reported = React.useRef(value);

  React.useEffect(() => {
    if (value !== reported.current) {
      reported.current = value;
      setText(show(value));
    }
  }, [value]);

  return (
    <input
      type="number"
      inputMode="decimal"
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        setText(raw);
        /* Half-typed values — "", "-", "1e" — are left on screen without being
           reported, except that an empty box means zero. Nothing is clamped
           here: pulling a figure back to `min` on every keystroke is the same
           trap in a different shape, since deleting "12" down to "1" would
           snap it to the floor before the "5" arrives. */
        if (raw.trim() === "") {
          reported.current = 0;
          onChange(0);
          return;
        }
        const parsed = Number(raw);
        if (Number.isNaN(parsed)) return;
        reported.current = parsed;
        onChange(parsed);
      }}
      onBlur={(e) => {
        /* Now that they have finished: "" becomes 0, "007" becomes 7, and
           anything outside min/max is brought inside it. */
        const bounded = clamp(reported.current, rest.min, rest.max);
        if (bounded !== reported.current) {
          reported.current = bounded;
          onChange(bounded);
        }
        setText(show(bounded));
        onBlur?.(e);
      }}
      className={cn(
        controlBase, "h-9.5 px-3 text-body",
        invalid && controlInvalid, className,
      )}
      {...rest}
    />
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
        className={cn(controlBase, "h-9.5 pl-9 pr-3 text-body [&::-webkit-search-cancel-button]:appearance-none", className)}
        {...rest}
      />
    </div>
  );
}

/**
 * A select you can type into.
 *
 * A dropdown is fine for five options and hopeless for five hundred: picking a
 * medicine out of a stock list means typing the first few letters of its name,
 * not scrolling. The options are already in the browser — this filters them as
 * you type, over the name, the code, and whatever hint each row carries.
 *
 * Keyboard: type to filter, ↑/↓ to move, Enter to take the highlighted row,
 * Escape to close without changing anything.
 */
export interface ComboOption {
  value: string;
  label: string;
  /** the second line — a code, a level, whatever tells two rows apart */
  hint?: string;
  /** extra text to match against without showing it */
  keywords?: string;
}

export function Combobox({
  value, onChange, options, placeholder = "Type to search", emptyText = "Nothing matches",
  disabled, id, invalid, className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  emptyText?: string;
  disabled?: boolean;
  id?: string;
  invalid?: boolean;
  className?: string;
}) {
  const auto = React.useId();
  const listId = `${id ?? auto}-listbox`;
  const input = React.useRef<HTMLInputElement>(null);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);

  const selected = options.find((o) => o.value === value) ?? null;

  /* While it is closed the input shows what is chosen; while it is open it
     shows what is being typed, so the list and the box always agree. */
  const text = open ? query : selected?.label ?? "";

  const matches = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!open || !term) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint ?? ""} ${o.keywords ?? ""}`.toLowerCase().includes(term),
    );
  }, [options, query, open]);

  React.useEffect(() => { setActive(0); }, [query, open]);

  /* keep the highlighted row in view as the keyboard moves it */
  React.useEffect(() => {
    if (open) document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  const take = (option: ComboOption) => {
    onChange(option.value);
    close();
  };

  return (
    <div className={cn("relative", className)}>
      <input
        ref={input}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={text}
        placeholder={selected ? selected.label : placeholder}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        /* Focus stays here after a pick, so focusing again never fires — a
           click has to be able to open the list a second time on its own. */
        onClick={() => setOpen(true)}
        /* Leaving the field leaves the list. The rows take the mouse on
           mousedown and keep focus here, so a pick never blurs it. */
        onBlur={close}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            setActive((i) => {
              const next = e.key === "ArrowDown" ? i + 1 : i - 1;
              if (!matches.length) return 0;
              return (next + matches.length) % matches.length;
            });
            return;
          }
          if (e.key === "Enter" && open) {
            const option = matches[active];
            if (option) { e.preventDefault(); take(option); }
            return;
          }
          if (e.key === "Escape" && open) {
            /* this list, not the dialog it may be sitting in */
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
        className={cn(
          controlBase, "h-9.5 pl-3 pr-9 text-body",
          invalid && controlInvalid,
        )}
      />
      <IconChevronDown
        size={16}
        className={cn(
          "pointer-events-none absolute right-2.5 top-[1.1875rem] -translate-y-1/2 text-ink-3 transition-transform duration-150",
          open && "rotate-180",
        )}
      />

      {/* In the top layer rather than under the field, so a dialog's
          scrolling body cannot cut the list off at its footer. */}
      <Panel
        open={open}
        anchor={input}
        onClose={close}
        className="p-1.5"
        /* a press on the list, its scrollbar included, must not take focus
           from the field — that would close it mid-scroll */
        onMouseDown={(e) => e.preventDefault()}
      >
        <ul id={listId} role="listbox" aria-labelledby={id}>
          {matches.length === 0 && (
            <li className="px-3 py-5 text-center text-label text-ink-3">{emptyText}</li>
          )}
          {matches.map((option, i) => (
            <li
              key={option.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={option.value === value}
              onMouseDown={(e) => { e.preventDefault(); take(option); }}
              onMouseMove={() => { if (active !== i) setActive(i); }}
              className={cn(
                "flex cursor-pointer items-center justify-between gap-3 rounded-[var(--r-sm)] px-2.5 py-2 transition-colors",
                i === active ? "bg-hover" : "",
                option.value === value ? "bg-accent-soft" : "",
              )}
            >
              <span className="min-w-0 flex-1 truncate text-label text-ink">{option.label}</span>
              {option.hint && (
                <span className="shrink-0 text-caption text-ink-3">{option.hint}</span>
              )}
            </li>
          ))}
        </ul>
      </Panel>
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
    <label className={cn("group flex cursor-pointer items-start gap-2.5", disabled && "cursor-not-allowed [&_*]:!text-disabled-ink", className)}>
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
          {label && <span className="block text-label leading-snug text-ink">{label}</span>}
          {description && <span className="mt-0.5 block text-caption leading-snug text-ink-3">{description}</span>}
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
    <label className={cn("inline-flex cursor-pointer items-center gap-2.5", disabled && "cursor-not-allowed [&_*]:!text-disabled-ink", className)}>
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
        {/* The knob takes the ink of whatever it is sitting on, so it stays
            visible on the accent track and on the grey one, in both themes —
            a white knob vanishes against the night-shift accent. */}
        <span
          className={cn(
            "absolute top-[3px] h-4 w-4 rounded-full shadow-e1 transition-[left,background-color] duration-200 ease-[var(--ease-spring)]",
            checked ? "left-[19px] bg-accent-ink" : "left-[3px] bg-surface",
          )}
        />
      </button>
      {label && <span className="text-label text-ink">{label}</span>}
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
            /* One ring, not two. The old active state drew an accent border
               and an inset accent shadow on top of it, which at this size
               reads as a 2px slab and makes the chosen option the heaviest
               thing on the page rather than simply the chosen one. */
            className={cn(
              "rounded-[var(--r)] border px-3 py-2 text-left transition-colors duration-150 ease-[var(--ease-brand)]",
              on
                ? "border-accent bg-accent-soft"
                : "border-line-strong bg-surface hover:border-line-strong hover:bg-hover",
            )}
          >
            <span className={cn("block text-label font-medium", on ? "text-accent-text" : "text-ink")}>
              {o.label}
            </span>
            {o.description && (
              <span className={cn(
                "mt-0.5 block text-caption leading-snug",
                on ? "text-accent-text/80" : "text-ink-3",
              )}>
                {o.description}
              </span>
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
              "inline-flex items-center gap-1.5 rounded-[var(--r-pill)] border px-2.5 py-1 text-label transition-colors duration-150",
              on
                ? "border-accent-border bg-accent-soft font-medium text-accent-text"
                : "border-line-strong bg-surface text-ink-2 hover:bg-hover hover:text-ink",
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
