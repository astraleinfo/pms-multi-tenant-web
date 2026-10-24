"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { TODAY, formatDate, formatTime12, today as clinicToday } from "@/lib/format";
import { controlBase, controlInvalid } from "./control";
import { IconCalendar, IconCheck, IconChevronDown, IconChevronLeft, IconChevronRight, IconClock } from "./icons";

/* ==========================================================================
   Pickers: the select, the date and the time.

   The browser draws its own popup for a native <select> and its own calendar
   for a date input. Both belong to the operating system, not to the page: they
   ignore the theme, the type, the radii, and dark mode. These draw the same
   things out of the app's own tokens — the panel is the menu's panel, the rows
   are the combobox's rows — and keep the native contract at the edges: the
   same value strings, and an onChange whose `e.target.value` is the new value,
   so a call site written for the native control does not change.

   The panel is portalled to the body and placed against its field, so a card
   with `overflow-hidden` or a dialog cannot clip it; it opens upwards when
   there is not room below.
   ========================================================================== */

/**
 * The clinic's today where there is a clinic. The console has none, and the
 * shared value is still its server-render placeholder there — so outside a
 * clinic, the browser's own date. Pickers only render in the browser.
 */
function today() {
  const clinic = clinicToday();
  if (clinic !== TODAY) return clinic;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Above dialogs (z-50), so a picker inside one is not drawn behind it. */
const PANEL_Z = 60;

/** The shape of a change event, for handlers written against the native control. */
function changeEvent<T extends HTMLElement>(value: string, name?: string) {
  const target = { value, name: name ?? "" } as unknown as T;
  return {
    target, currentTarget: target, type: "change",
    preventDefault() {}, stopPropagation() {}, persist() {},
  } as unknown as React.ChangeEvent<T>;
}

/** Controlled when `value` is given, as a native control is; otherwise keeps its own. */
function useValue(value: unknown, defaultValue: unknown) {
  const [inner, setInner] = React.useState(defaultValue == null ? "" : String(defaultValue));
  const controlled = value !== undefined;
  return [controlled ? (value == null ? "" : String(value)) : inner, setInner] as const;
}

/* ---- the panel ------------------------------------------------------------- */

type Place = { left: number; top?: number; bottom?: number; minWidth: number; maxHeight: number };

/** A popover in the page's top layer, placed against its anchor — so a dialog's
    scrolling body never clips it. */
export function Panel({
  open, anchor, onClose, onPlaced, className, children, ...rest
}: {
  open: boolean;
  anchor: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  /** once it has its final size and place — the moment to scroll inside it */
  onPlaced?: () => void;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLDivElement>) {
  const panel = React.useRef<HTMLDivElement>(null);
  const [place, setPlace] = React.useState<Place | null>(null);

  React.useLayoutEffect(() => {
    if (!open) { setPlace(null); return; }
    const update = () => {
      const a = anchor.current, p = panel.current;
      if (!a || !p) return;
      const r = a.getBoundingClientRect();
      const gap = 6, margin = 8;
      const room = { below: window.innerHeight - r.bottom - gap - margin, above: r.top - gap - margin };
      const up = p.scrollHeight > room.below && room.above > room.below;
      const width = Math.max(r.width, p.offsetWidth);
      setPlace({
        left: Math.max(margin, Math.min(r.left, window.innerWidth - width - margin)),
        ...(up ? { bottom: window.innerHeight - r.top + gap } : { top: r.bottom + gap }),
        minWidth: r.width,
        /* tall enough for the calendar, short enough that a list of the
           day's times reads as a list rather than as the page */
        maxHeight: Math.min(384, Math.max(160, up ? room.above : room.below)),
      });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, anchor]);

  const placed = place !== null;
  React.useLayoutEffect(() => {
    if (placed) onPlaced?.();
    /* once per opening */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placed]);

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!anchor.current?.contains(t) && !panel.current?.contains(t)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, anchor, onClose]);

  if (!open) return null;
  return createPortal(
    <div
      ref={panel}
      className={cn(
        "pop fixed overflow-y-auto rounded-[var(--r)] border border-line bg-surface shadow-e3",
        className,
      )}
      style={{
        zIndex: PANEL_Z,
        maxWidth: "calc(100vw - 16px)",
        /* measured once on screen, then placed; hidden for that one frame */
        visibility: place ? undefined : "hidden",
        left: place?.left ?? 0,
        top: place?.top,
        bottom: place?.bottom,
        minWidth: place?.minWidth,
        maxHeight: place?.maxHeight,
      }}
      {...rest}
    >
      {children}
    </div>,
    document.body,
  );
}

/** The field a picker opens from — the text field's look, as a button. */
function triggerClass(open: boolean, invalid: boolean | undefined, className?: string) {
  return cn(
    controlBase,
    "flex h-9.5 items-center pl-3 pr-9 text-left text-body",
    open && "border-focus shadow-[var(--focus-ring)]",
    invalid && controlInvalid,
    className,
  );
}

/* ---- a list to choose from --------------------------------------------------- */

interface Item {
  value: string;
  label: React.ReactNode;
  /** what typing a letter matches against */
  text: string;
  disabled?: boolean;
  group?: string;
}

/**
 * The open list both the select and the time picker are made of. Focus stays
 * on the field while it is open, as it does on a native select: ↑/↓ move,
 * Enter or Space take the row, Escape closes, and typing jumps to a row.
 */
function ListPicker({
  items, value, onPick, icon, turns, placeholder, id, disabled, invalid, className, center, ariaProps,
}: {
  items: Item[];
  value: string;
  onPick: (value: string) => void;
  icon: React.ReactNode;
  /** the icon is a chevron, and points up while the list is open */
  turns?: boolean;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
  /** open with the chosen row in the middle of the list, not at its edge */
  center?: boolean;
  ariaProps?: React.AriaAttributes & { title?: string };
}) {
  const auto = React.useId();
  const listId = `${id ?? auto}-list`;
  const button = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(-1);
  const typed = React.useRef({ text: "", at: 0 });

  const selected = items.findIndex((o) => o.value === value);
  const shown = items[selected];

  const close = React.useCallback(() => setOpen(false), []);
  const firstEnabled = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < items.length; i += dir) if (!items[i].disabled) return i;
    return -1;
  };
  const show = () => {
    setActive(selected >= 0 ? selected : firstEnabled(0, 1));
    setOpen(true);
  };
  const take = (i: number) => {
    const item = items[i];
    if (!item || item.disabled) return;
    setOpen(false);
    if (item.value !== value) onPick(item.value);
  };

  /* keep the highlighted row in view as the keyboard moves it */
  React.useEffect(() => {
    if (!open || active < 0) return;
    document.getElementById(`${listId}-${active}`)?.scrollIntoView({ block: "nearest" });
  }, [open, active, listId]);

  /* and open with the chosen row in sight */
  const reveal = () => {
    if (selected < 0) return;
    document.getElementById(`${listId}-${selected}`)?.scrollIntoView({ block: center ? "center" : "nearest" });
  };

  const typeAhead = (key: string) => {
    const now = Date.now();
    const t = typed.current;
    t.text = now - t.at > 600 ? key : t.text + key;
    t.at = now;
    /* one letter steps to the next row starting with it; more keeps refining
       from the row already reached */
    const from = Math.max(open ? active : selected, 0) + (t.text.length === 1 ? 1 : 0);
    const term = t.text.toLowerCase();
    const hit = items
      .map((_, k) => (from + k) % items.length)
      .find((i) => !items[i].disabled && items[i].text.toLowerCase().startsWith(term));
    if (hit === undefined) return;
    if (open) setActive(hit);
    else take(hit);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); return; }
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const dir = e.key === "ArrowDown" ? 1 : -1;
      const next = firstEnabled(active + dir, dir);
      if (next >= 0) setActive(next);
      return;
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      setActive(e.key === "Home" ? firstEnabled(0, 1) : firstEnabled(items.length - 1, -1));
      return;
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      take(active);
      return;
    } else if (e.key === "Escape") {
      /* this list, not the dialog it may be sitting in */
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      return;
    } else if (e.key === "Tab") {
      setOpen(false);
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey && e.key !== " ") typeAhead(e.key);
  };

  return (
    <div className="relative">
      <button
        ref={button}
        id={id}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className={triggerClass(open, invalid, className)}
        {...ariaProps}
      >
        <span className={cn("min-w-0 flex-1 truncate", !shown && "text-ink-placeholder")}>
          {shown ? shown.label : placeholder ?? "Select"}
        </span>
      </button>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-3 transition-transform duration-150",
          open && turns && "rotate-180",
        )}
      >
        {icon}
      </span>

      <Panel open={open} anchor={button} onClose={close} onPlaced={reveal} className="p-1">
        <ul id={listId} role="listbox" aria-labelledby={id}>
          {items.map((item, i) => (
            <React.Fragment key={`${item.value}-${i}`}>
              {item.group && item.group !== items[i - 1]?.group && (
                <li role="presentation" className="px-2.5 pb-1 pt-2.5 text-micro font-medium text-ink-3 first:pt-1.5">
                  {item.group}
                </li>
              )}
              <li
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === selected}
                aria-disabled={item.disabled || undefined}
                /* mousedown, not click, so the field keeps focus */
                onMouseDown={(e) => { e.preventDefault(); take(i); }}
                onMouseMove={() => { if (!item.disabled && active !== i) setActive(i); }}
                className={cn(
                  "flex cursor-pointer select-none items-center justify-between gap-3 rounded-[var(--r-sm)] px-2.5 py-2 text-label transition-colors duration-100",
                  i === active && !item.disabled && "bg-hover",
                  i === selected ? "font-medium text-accent-text" : "text-ink",
                  item.disabled && "cursor-not-allowed text-disabled-ink",
                )}
              >
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <IconCheck size={14} strokeWidth={2.4} className={cn("shrink-0", i === selected ? "text-accent" : "invisible")} />
              </li>
            </React.Fragment>
          ))}
        </ul>
      </Panel>
    </div>
  );
}

/* ---- select ---------------------------------------------------------------- */

function textOf(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (React.isValidElement<{ children?: React.ReactNode }>(node)) return textOf(node.props.children);
  return "";
}

/** The <option>s and <optgroup>s a native select would have been given. */
function readOptions(children: React.ReactNode, group?: string): Item[] {
  const out: Item[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement<Record<string, unknown>>(child)) return;
    const props = child.props as { children?: React.ReactNode; value?: unknown; disabled?: boolean; label?: string };
    if (child.type === React.Fragment) out.push(...readOptions(props.children, group));
    else if (child.type === "optgroup") out.push(...readOptions(props.children, props.label));
    else if (child.type === "option") {
      const text = textOf(props.children);
      out.push({
        value: props.value != null ? String(props.value) : text,
        label: props.children,
        text,
        disabled: props.disabled,
        group,
      });
    }
  });
  return out;
}

/**
 * A select. Written exactly as a native one — `<option>`s inside, `value` and
 * `onChange={(e) => … e.target.value}` — and drawn as the app's own list.
 */
export function Select({
  className, invalid, children, value, defaultValue, onChange, disabled, id, name,
  "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, "aria-describedby": ariaDescribedby, title,
}: React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  const items = React.useMemo(() => readOptions(children), [children]);
  const [current, setCurrent] = useValue(value, defaultValue);
  /* a native select with no matching option shows its first one */
  const chosen = items.some((o) => o.value === current) ? current : items[0]?.value ?? "";

  return (
    <ListPicker
      items={items}
      value={chosen}
      onPick={(v) => { setCurrent(v); onChange?.(changeEvent<HTMLSelectElement>(v, name)); }}
      icon={<IconChevronDown size={16} />}
      turns
      id={id}
      disabled={disabled}
      invalid={invalid}
      className={className}
      ariaProps={{ "aria-label": ariaLabel, "aria-labelledby": ariaLabelledby, "aria-describedby": ariaDescribedby, title }}
    />
  );
}

/* ---- time ------------------------------------------------------------------ */

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean };

const hhmm = (mins: number) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
const minutesOf = (t: string) => {
  const m = /^(\d{2}):(\d{2})/.exec(t);
  return m ? Number(m[1]) * 60 + Number(m[2]) : -1;
};

/** A time, "HH:MM", picked from the day in steps — fifteen minutes unless `step` says otherwise. */
export function TimeInput({
  value, defaultValue, onChange, min, max, step, disabled, id, name, placeholder, invalid, className,
  "aria-label": ariaLabel, "aria-describedby": ariaDescribedby,
}: InputProps) {
  const [current, setCurrent] = useValue(value, defaultValue);
  const every = Math.max(1, Math.round((Number(step) || 900) / 60));

  const items = React.useMemo(() => {
    const lo = min ? minutesOf(String(min)) : 0;
    const hi = max ? minutesOf(String(max)) : 24 * 60 - 1;
    const times = new Set<number>();
    for (let m = 0; m < 24 * 60; m += every) if (m >= lo && m <= hi) times.add(m);
    /* a time already saved off the grid is still a time you can see and keep */
    const now = minutesOf(current);
    if (now >= 0) times.add(now);
    return [...times].sort((a, b) => a - b).map((m): Item => {
      const v = hhmm(m);
      return { value: v, label: formatTime12(v), text: formatTime12(v) };
    });
  }, [min, max, every, current]);

  return (
    <ListPicker
      items={items}
      value={current.slice(0, 5)}
      onPick={(v) => { setCurrent(v); onChange?.(changeEvent<HTMLInputElement>(v, name)); }}
      icon={<IconClock size={16} />}
      placeholder={placeholder ?? "Pick a time"}
      id={id}
      disabled={disabled}
      invalid={invalid}
      className={className}
      center
      ariaProps={{ "aria-label": ariaLabel, "aria-describedby": ariaDescribedby }}
    />
  );
}

/* ---- date ------------------------------------------------------------------ */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

const isoOf = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
const parse = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return utc(y, (m || 1) - 1, d || 1);
};
const shiftDays = (iso: string, n: number) => { const d = parse(iso); d.setUTCDate(d.getUTCDate() + n); return isoOf(d); };
const shiftMonths = (iso: string, n: number) => {
  const d = parse(iso);
  const day = d.getUTCDate();
  const t = utc(d.getUTCFullYear(), d.getUTCMonth() + n, 1);
  /* the 31st into a month that has thirty lands on the 30th, not on the 1st */
  const last = utc(t.getUTCFullYear(), t.getUTCMonth() + 1, 0).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return isoOf(t);
};
const validIso = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** "1985-03-14" ⇄ "14/03/1985" — the way a date is said aloud at the desk. */
const toTyped = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const fromTyped = (text: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!m) return "";
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (y < 1000 || mo < 1 || mo > 12 || d < 1 || d > utc(y, mo, 0).getUTCDate()) return "";
  return `${m[3]}-${m[2]}-${m[1]}`;
};
/** Digits in, slashes put in for you: "1403" → "14/03". */
const maskTyped = (raw: string) => {
  const n = raw.replace(/\D/g, "").slice(0, 8);
  return [n.slice(0, 2), n.slice(2, 4), n.slice(4)].filter(Boolean).join("/");
};

/**
 * A date, "YYYY-MM-DD".
 *
 * Typed, first: somebody reading a birth date off a form types `14031985` and
 * is done — the slashes put themselves in. The calendar is there for when the
 * date is easier seen than said, and its month and year are each one click
 * from any other, so 1985 is no further away than next week.
 */
export function DateInput({
  value, defaultValue, onChange, min, max, disabled, id, name, placeholder, required, invalid, className,
  "aria-label": ariaLabel, "aria-describedby": ariaDescribedby,
}: InputProps) {
  const [current, setCurrent] = useValue(value, defaultValue);
  const date = validIso(current.slice(0, 10)) ? current.slice(0, 10) : "";
  const lo = min ? String(min).slice(0, 10) : "";
  const hi = max ? String(max).slice(0, 10) : "";
  const outside = (d: string) => (!!lo && d < lo) || (!!hi && d > hi);
  const clamp = (d: string) => (lo && d < lo ? lo : hi && d > hi ? hi : d);

  const field = React.useRef<HTMLInputElement>(null);
  const anchor = React.useRef<HTMLDivElement>(null);
  const grid = React.useRef<HTMLDivElement>(null);
  const yearList = React.useRef<HTMLDivElement>(null);
  const [open, setOpen] = React.useState(false);
  /* the day the keyboard is on; the month shown is always the one it is in */
  const [focus, setFocus] = React.useState(() => date || today());
  const [level, setLevel] = React.useState<"days" | "months" | "years">("days");
  const close = React.useCallback(() => setOpen(false), []);

  /* what is in the box — the value as typed, until it is a date */
  const [text, setText] = React.useState(() => toTyped(date));
  const [unreadable, setUnreadable] = React.useState(false);
  /* a value set from outside rewrites the box; one this field just sent out
     came from the box, and leaves what was typed alone */
  const sent = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (sent.current === date) { sent.current = null; return; }
    setText(toTyped(date));
    setUnreadable(false);
  }, [date]);

  const emit = (d: string) => {
    if (d !== date) { sent.current = d; setCurrent(d); onChange?.(changeEvent<HTMLInputElement>(d, name)); }
  };
  const show = () => { setFocus(clamp(date || fromTyped(text) || today())); setLevel("days"); setOpen(true); };
  const pick = (d: string) => {
    if (outside(d)) return;
    setOpen(false);
    field.current?.focus();
    setText(toTyped(d));
    setUnreadable(false);
    emit(d);
  };

  /* a whole date typed is a date chosen; anything less waits for the blur */
  const onType = (raw: string) => {
    const next = maskTyped(raw);
    setText(next);
    setUnreadable(false);
    const iso = fromTyped(next);
    if (iso && !outside(iso)) { emit(iso); if (open) setFocus(iso); }
  };
  const settle = () => {
    if (!text) { setUnreadable(false); emit(""); return; }
    const iso = fromTyped(text);
    if (iso && !outside(iso)) { setUnreadable(false); emit(iso); return; }
    /* not a date, or not one this field takes: say so, and stop holding on to
       the old date — the form must not save one the box no longer shows */
    setUnreadable(true);
    emit("");
  };

  /* the focused day takes real focus once the calendar is in use, so the
     keyboard and the screen reader agree */
  const [driving, setDriving] = React.useState(false);
  React.useEffect(() => {
    if (!open) { setDriving(false); return; }
    const frame = requestAnimationFrame(() => {
      if (level === "years") {
        const at = yearList.current?.querySelector<HTMLButtonElement>(`[data-year="${focus.slice(0, 4)}"]`);
        at?.scrollIntoView({ block: "center" });
        if (driving) at?.focus({ preventScroll: true });
      } else if (level === "days" && driving) {
        grid.current?.querySelector<HTMLButtonElement>(`[data-day="${focus}"]`)?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focus, level, driving]);

  const view = parse(focus);
  const year = view.getUTCFullYear(), month = view.getUTCMonth();
  const first = utc(year, month, 1);
  const start = shiftDays(isoOf(first), -((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => shiftDays(start, i));
  const now = today();

  /* a century back and a few decades on, unless the field says otherwise */
  const thisYear = Number(now.slice(0, 4));
  const firstYear = Math.min(lo ? Number(lo.slice(0, 4)) : thisYear - 120, year);
  const lastYear = Math.max(hi ? Number(hi.slice(0, 4)) : thisYear + 30, year);
  const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);

  /* the same day in another month — the 31st lands on the last day there is */
  const moveTo = (y: number, m: number) =>
    clamp(isoOf(utc(y, m, Math.min(view.getUTCDate(), utc(y, m + 1, 0).getUTCDate()))));
  const monthOutside = (m: number) =>
    (!!lo && isoOf(utc(year, m + 1, 0)) < lo) || (!!hi && isoOf(utc(year, m, 1)) > hi);
  const lastMonth = shiftMonths(focus, -1), nextMonth = shiftMonths(focus, 1);
  const canBack = !lo || isoOf(utc(year, month, 0)) >= lo;
  const canOn = !hi || isoOf(utc(year, month + 1, 1)) <= hi;

  const onGridKey = (e: React.KeyboardEvent) => {
    const moves: Record<string, () => string> = {
      ArrowLeft: () => shiftDays(focus, -1),
      ArrowRight: () => shiftDays(focus, 1),
      ArrowUp: () => shiftDays(focus, -7),
      ArrowDown: () => shiftDays(focus, 7),
      PageUp: () => shiftMonths(focus, e.shiftKey ? -12 : -1),
      PageDown: () => shiftMonths(focus, e.shiftKey ? 12 : 1),
      Home: () => shiftDays(focus, -((parse(focus).getUTCDay() + 6) % 7)),
      End: () => shiftDays(focus, 6 - ((parse(focus).getUTCDay() + 6) % 7)),
    };
    if (moves[e.key]) { e.preventDefault(); setFocus(moves[e.key]()); return; }
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(focus); }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (open && e.key === "Escape") {
      /* this calendar, not the dialog it may be sitting in — and a month or
         year list steps back to the days before anything closes */
      e.preventDefault();
      e.stopPropagation();
      if (level !== "days") { setLevel("days"); return; }
      setOpen(false);
      field.current?.focus();
    }
  };

  const navButton = cn(
    "grid h-8 w-8 shrink-0 place-items-center rounded-[var(--r-sm)] text-ink-2 transition-colors",
    "hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:text-disabled-ink disabled:hover:bg-transparent",
  );
  const headButton = (on: boolean) => cn(
    "inline-flex h-8 items-center gap-1 rounded-[var(--r-sm)] px-2.5 text-label font-semibold transition-colors",
    "focus-visible:outline-2 focus-visible:outline-focus",
    on ? "bg-accent-soft text-accent-text" : "text-ink hover:bg-hover",
  );
  const cell = (selected: boolean) => cn(
    "rounded-[var(--r-sm)] text-label tabular-nums transition-colors duration-100",
    "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
    "disabled:cursor-not-allowed disabled:text-disabled-ink disabled:hover:bg-transparent",
    selected ? "bg-accent font-medium text-accent-ink hover:bg-accent-hover" : "text-ink hover:bg-hover",
  );

  return (
    <div ref={anchor} className="relative" onKeyDown={onKeyDown}>
      <input
        ref={field}
        id={id}
        name={name}
        value={text}
        disabled={disabled}
        required={required}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder ?? "DD/MM/YYYY"}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedby}
        aria-invalid={invalid || unreadable || undefined}
        title={unreadable ? "Type the date as DD/MM/YYYY" : undefined}
        onChange={(e) => onType(e.target.value)}
        onBlur={settle}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) { e.preventDefault(); setDriving(true); show(); }
          if (e.key === "Enter") settle();
        }}
        className={cn(triggerClass(open, invalid || unreadable, className), "pr-10 tabular-nums")}
      />
      <button
        type="button"
        tabIndex={-1}
        disabled={disabled}
        aria-label={open ? "Close calendar" : "Open calendar"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : show())}
        className={cn(
          "absolute right-1 top-1/2 grid h-7.5 w-7.5 -translate-y-1/2 place-items-center rounded-[var(--r-sm)]",
          "transition-colors hover:bg-hover hover:text-ink disabled:pointer-events-none",
          open ? "text-accent" : "text-ink-3",
        )}
      >
        <IconCalendar size={16} />
      </button>

      <Panel
        open={open}
        anchor={anchor}
        onClose={close}
        role="dialog"
        aria-label="Choose a date"
        className="w-[18.5rem] p-3"
        onKeyDownCapture={() => setDriving(true)}
      >
        <div className="mb-2 flex items-center gap-1">
          <button type="button" className={navButton} aria-label="Previous month" disabled={!canBack}
                  onClick={() => { setLevel("days"); setFocus(clamp(lastMonth)); }}>
            <IconChevronLeft size={16} />
          </button>
          <div className="flex flex-1 items-center justify-center gap-0.5" aria-live="polite">
            <button type="button" aria-expanded={level === "months"} aria-label={`${MONTHS[month]}, choose a month`}
                    className={headButton(level === "months")}
                    onClick={() => setLevel(level === "months" ? "days" : "months")}>
              {MONTHS[month]}
              <IconChevronDown size={14} className={cn("transition-transform", level === "months" && "rotate-180")} />
            </button>
            <button type="button" aria-expanded={level === "years"} aria-label={`${year}, choose a year`}
                    className={cn(headButton(level === "years"), "tabular-nums")}
                    onClick={() => setLevel(level === "years" ? "days" : "years")}>
              {year}
              <IconChevronDown size={14} className={cn("transition-transform", level === "years" && "rotate-180")} />
            </button>
          </div>
          <button type="button" className={navButton} aria-label="Next month" disabled={!canOn}
                  onClick={() => { setLevel("days"); setFocus(clamp(nextMonth)); }}>
            <IconChevronRight size={16} />
          </button>
        </div>

        {/* one height for all three, so the panel does not jump as you switch */}
        <div className="h-[15.75rem]">
          {level === "years" && (
            <div ref={yearList} className="grid h-full grid-cols-4 content-start gap-1 overflow-y-auto pr-0.5">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  data-year={y}
                  disabled={(!!lo && y < Number(lo.slice(0, 4))) || (!!hi && y > Number(hi.slice(0, 4)))}
                  onClick={() => { setFocus(moveTo(y, month)); setLevel("days"); }}
                  className={cn(cell(y === year), "h-9")}
                >
                  {y}
                </button>
              ))}
            </div>
          )}

          {level === "months" && (
            <div className="grid h-full grid-cols-3 grid-rows-4 gap-1">
              {MONTHS.map((label, m) => (
                <button
                  key={label}
                  type="button"
                  disabled={monthOutside(m)}
                  onClick={() => { setFocus(moveTo(year, m)); setLevel("days"); }}
                  className={cell(m === month)}
                >
                  {label.slice(0, 3)}
                </button>
              ))}
            </div>
          )}

          {level === "days" && (
            <>
              <div className="grid grid-cols-7 pb-1" aria-hidden>
                {WEEKDAYS.map((d) => (
                  <span key={d} className="py-1 text-center text-micro font-medium text-ink-3">{d}</span>
                ))}
              </div>

              <div ref={grid} role="grid" className="grid grid-cols-7 gap-0.5" onKeyDown={onGridKey}>
                {days.map((d) => {
                  const inMonth = parse(d).getUTCMonth() === month;
                  const isSelected = d === date;
                  const isToday = d === now;
                  const off = outside(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      role="gridcell"
                      data-day={d}
                      tabIndex={d === focus ? 0 : -1}
                      aria-selected={isSelected}
                      aria-current={isToday ? "date" : undefined}
                      aria-label={formatDate(d, "day") + " " + d.slice(0, 4)}
                      disabled={off}
                      onClick={() => pick(d)}
                      className={cn(
                        "relative grid h-9 place-items-center rounded-[var(--r-sm)] text-label tabular-nums transition-colors duration-100",
                        "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-focus",
                        isSelected
                          ? "bg-accent font-medium text-accent-ink hover:bg-accent-hover"
                          : cn("hover:bg-hover", inMonth ? "text-ink" : "text-ink-placeholder"),
                        isToday && !isSelected && "font-semibold text-accent-text",
                        off && "cursor-not-allowed text-disabled-ink hover:bg-transparent",
                      )}
                    >
                      {parse(d).getUTCDate()}
                      {isToday && !isSelected && (
                        <span aria-hidden className="absolute bottom-1 h-1 w-1 rounded-full bg-accent" />
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="mt-2.5 flex items-center justify-between border-t border-line-soft pt-2.5">
          <button
            type="button"
            disabled={outside(now)}
            onClick={() => pick(now)}
            className="rounded-[var(--r-sm)] px-2 py-1 text-label font-medium text-accent-text transition-colors hover:bg-accent-soft disabled:text-disabled-ink disabled:hover:bg-transparent"
          >
            Today
          </button>
          {date && !required && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                field.current?.focus();
                setText("");
                setUnreadable(false);
                emit("");
              }}
              className="rounded-[var(--r-sm)] px-2 py-1 text-label text-ink-2 transition-colors hover:bg-hover hover:text-ink"
            >
              Clear
            </button>
          )}
        </div>
      </Panel>
    </div>
  );
}

/* ---- date and time --------------------------------------------------------- */

/** A moment, "YYYY-MM-DDTHH:MM" — a date and a time side by side. */
export function DateTimeInput({
  value, defaultValue, onChange, min, max, disabled, id, name, invalid, className,
  "aria-label": ariaLabel,
}: InputProps) {
  const [current, setCurrent] = useValue(value, defaultValue);
  const [date, time] = current ? [current.slice(0, 10), current.slice(11, 16)] : ["", ""];

  const emit = (next: string) => { setCurrent(next); onChange?.(changeEvent<HTMLInputElement>(next, name)); };

  return (
    <div className="flex min-w-0 gap-2">
      <div className="min-w-0 flex-1">
        <DateInput
          id={id}
          value={date}
          min={min ? String(min).slice(0, 10) : undefined}
          max={max ? String(max).slice(0, 10) : undefined}
          disabled={disabled}
          invalid={invalid}
          className={className}
          aria-label={ariaLabel ? `${ariaLabel}, date` : undefined}
          onChange={(e) => emit(e.target.value ? `${e.target.value}T${time || "00:00"}` : "")}
        />
      </div>
      <div className="w-32 shrink-0">
        <TimeInput
          value={time}
          disabled={disabled}
          invalid={invalid}
          className={className}
          placeholder="Time"
          aria-label={ariaLabel ? `${ariaLabel}, time` : "Time"}
          onChange={(e) => emit(`${date || today()}T${e.target.value}`)}
        />
      </div>
    </div>
  );
}
