"use client";

import * as React from "react";
import { MODULES } from "@/lib/data/catalog";
import { useSupportInfo } from "@/lib/query/hooks";
import { cn } from "@/lib/cn";
import { PRODUCT_NAME } from "@/lib/platform/brand";
import { Spinner } from "@/components/ui/loader";
import {
  IconAlert, IconArrowRight, IconCheck,
  IconEye, IconEyeOff, IconLock, IconMail,
} from "@/components/ui/icons";
import { AstraleMark } from "./brand-mark";
import { ModuleArt } from "./module-art";

/* ==========================================================================
   The authentication screen: one window, split in two.

   Left, the product shows what it does — a carousel that walks the module
   catalogue. Right, the clinic signs in. Both halves are built from the
   working tokens, so this reads as the application before sign-in rather
   than as a marketing page in front of it.

   The carousel reads `MODULES` straight from the catalogue rather than
   keeping a list of its own. That is the point of it: a module added to the
   catalogue appears here — slide, description and one more pagination dot —
   with no edit to this file.
   ========================================================================== */

const ROTATE_MS = 5500;

/**
 * The line each module is introduced with. Written for somebody who has not
 * signed in yet, which is a different job from the catalogue's own `summary`
 * (written for somebody already using it).
 *
 * A module with no line here falls back to its catalogue summary, so nothing
 * has to be added when a module is.
 */
const BLURB: Record<string, string> = {
  patient: "Keep patient records and care information organised in one place.",
  appointment: "Manage schedules and appointments with a clear view of your day.",
  queue: "Issue tokens, check patients in, and keep the waiting room moving.",
  consultation: "Capture clinical information and keep every consultation organised.",
  prescription: "Create and manage prescriptions while keeping patient history connected.",
  pharmacy: "Dispense against prescriptions and keep pharmacy stock organised.",
  lab: "Order tests, record results, and hold them behind verification.",
  inventory: "Track stock levels and stay ahead of inventory needs.",
  billing: "Manage invoices, payments, and outstanding balances effortlessly.",
  advanced_reports: "Turn practice data into clear operational insights.",
};

export type Tone = "clinic" | "console";

/* Whole class names. Tailwind reads the source text, so a class assembled at
   runtime — `bg-[...${hue}...]` — is a class it never sees and never emits.
   These are written out in full for that reason. */
const FIELDS: Record<Tone, [string, string, string, string]> = {
  clinic: [
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--accent)_32%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--violet)_32%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--info)_30%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--ok)_26%,transparent),transparent_66%)]",
  ],
  console: [
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--violet)_34%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--accent)_32%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--accent-hover)_30%,transparent),transparent_66%)]",
    "bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--info)_26%,transparent),transparent_66%)]",
  ],
};

/* ---- the showcase ------------------------------------------------------------ */

export interface ShowcaseSlide {
  /** also the key into the drawing set */
  key: string;
  name: string;
  blurb: string;
}

/** The clinic's own showcase: every module in the catalogue, in its order. */
export const MODULE_SLIDES: ShowcaseSlide[] = MODULES.map((f) => ({
  key: f.key,
  name: f.name,
  blurb: BLURB[f.key] ?? f.summary,
}));

function ModuleShowcase({ slides, badge, tone }: {
  slides: ShowcaseSlide[];
  badge?: string;
  tone: Tone;
}) {
  const [index, setIndex] = React.useState(0);
  const [from, setFrom] = React.useState<1 | -1>(1);
  const [held, setHeld] = React.useState(false);

  /* Somebody who has asked for less motion gets no rotation and no slide —
     an animation that starts itself is exactly what the preference is about. */
  const [still, setStill] = React.useState(false);
  React.useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setStill(m.matches);
    sync();
    m.addEventListener("change", sync);
    return () => m.removeEventListener("change", sync);
  }, []);

  const go = React.useCallback((next: number, direction: 1 | -1) => {
    setFrom(direction);
    setIndex((next + slides.length) % slides.length);
  }, [slides.length]);

  React.useEffect(() => {
    if (held || still || slides.length < 2) return;
    const t = setInterval(() => go(index + 1, 1), ROTATE_MS);
    return () => clearInterval(t);
  }, [held, still, slides.length, index, go]);

  const slide = slides[index];
  const dots = React.useRef<Array<HTMLButtonElement | null>>([]);

  return (
    <section
      aria-roledescription="carousel"
      aria-label="What Astrale does"
      className={cn(
        "relative isolate flex shrink-0 flex-col overflow-hidden bg-ground",
        "border-b border-line lg:h-full lg:w-[45%] lg:border-b-0 lg:border-r xl:w-1/2",
      )}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <Decoration tone={tone} />

      <div className="flex items-center gap-3 px-6 pt-7 sm:px-10 lg:px-12 lg:pt-11 xl:px-16">
        <AstraleMark size={38} />
        <span className="leading-tight">
          <span className="flex items-center gap-2 text-title-lg font-semibold text-ink">
            Astrale
            {/* the console is the same product, and must never be mistaken for
                a clinic's own sign-in; the word does that, not the colour */}
            {badge && (
              <span className="rounded-full border border-accent-border bg-accent-soft px-2 py-0.5 text-micro font-medium uppercase tracking-[0.07em] text-accent-text">
                {badge}
              </span>
            )}
          </span>
          {/* --ink-2, not --ink-3: still the muted second line, but the aurora
              passing under this corner took --ink-3 to 4.48:1 — just under AA
              for text this size. Measured, not guessed. */}
          <span className="block text-caption text-ink-2">{PRODUCT_NAME}</span>
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col justify-center px-6 py-6 sm:px-10 lg:px-12 lg:py-8 xl:px-20">
        <Slide index={index} from={from} still={still}>
          <ModuleArt featureKey={slide.key} name={slide.name} />
          <div className="mt-6 text-center lg:mt-8">
            <h2 className="text-[22px] font-semibold leading-tight text-ink sm:text-[26px] lg:text-[28px]">
              {slide.name}
            </h2>
            <p className="mx-auto mt-2 max-w-[420px] text-body leading-relaxed text-ink-2">
              {slide.blurb}
            </p>
          </div>
        </Slide>
      </div>

      <div className="flex items-center justify-center px-6 pb-7 sm:px-10 lg:px-12 lg:pb-8 xl:px-16">
        {/* One tab stop, not ten. Somebody arriving by keyboard is here to sign
            in, and ten dots between them and the email field is a toll gate;
            the arrow keys move between them once the group has focus. */}
        <ol
          role="tablist"
          aria-label="Choose a module"
          className="flex flex-wrap items-center justify-center gap-1.5"
          onKeyDown={(e) => {
            const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
            if (!step) return;
            e.preventDefault();
            go(index + step, step as 1 | -1);
            const next = (index + step + slides.length) % slides.length;
            dots.current[next]?.focus();
          }}
        >
          {slides.map((s, i) => (
            <li key={s.key}>
              <button
                ref={(el) => { dots.current[i] = el; }}
                type="button"
                role="tab"
                onClick={() => go(i, i > index ? 1 : -1)}
                aria-label={s.name}
                aria-selected={i === index}
                tabIndex={i === index ? 0 : -1}
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300 ease-[var(--ease-brand)]",
                  "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus",
                  i === index ? "w-6 bg-accent" : "w-1.5 bg-ink-3/70 hover:bg-ink-3",
                )}
              />
            </li>
          ))}
        </ol>
      </div>

      <p className="hidden px-12 pb-8 text-caption text-ink-3 lg:block xl:px-16">
        © {new Date().getFullYear()} Astrale
      </p>
    </section>
  );
}

/**
 * One slide's entrance: a short slide in the direction of travel, and an
 * opacity step. Both are transitions rather than keyframes, so a slide that
 * is interrupted mid-move picks up from where it is instead of snapping.
 */
function Slide({
  index, from, still, children,
}: {
  index: number;
  from: 1 | -1;
  still: boolean;
  children: React.ReactNode;
}) {
  const [shown, setShown] = React.useState(false);
  React.useEffect(() => {
    setShown(false);
    const f = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    return () => cancelAnimationFrame(f);
  }, [index]);

  if (still) return <div>{children}</div>;

  return (
    <div
      className={cn(
        "transition-[opacity,transform] duration-500 ease-[var(--ease-out)]",
        shown ? "translate-x-0 opacity-100" : "opacity-0",
        shown ? "" : from === 1 ? "translate-x-5" : "-translate-x-5",
      )}
    >
      {children}
    </div>
  );
}

/**
 * The left half's background: four drifting fields of colour, and a dot grid
 * over the top of them.
 *
 * The hues are the application's own — accent, violet, info, ok — mixed down
 * into the ground at strengths where they read as a tint rather than as
 * paint. In oklab, so a blue crossing a green passes through the colours
 * between them instead of through the grey that sRGB interpolation puts in
 * the middle.
 *
 * It stays on this half. The form opposite is a white plane with hairline
 * inputs on it, and moving colour under a password field buys nothing and
 * costs contrast.
 *
 * Two hue sets. The clinic's runs blue-led, the console's indigo-led and a
 * shade deeper — related at a glance, and not the same screen.
 */
function Decoration({ tone }: { tone: Tone }) {
  const c = FIELDS[tone];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <span
        className={cn(
          "absolute -left-[34%] -top-[40%] h-[92%] w-[92%] rounded-full will-change-transform",
          c[0],
          "animate-[aurora-a_16s_ease-in-out_infinite]",
        )}
      />
      <span
        className={cn(
          "absolute -right-[28%] -top-[18%] h-[80%] w-[80%] rounded-full will-change-transform",
          c[1],
          "animate-[aurora-b_19s_ease-in-out_infinite]",
        )}
      />
      <span
        className={cn(
          "absolute -bottom-[32%] -left-[18%] h-[85%] w-[85%] rounded-full will-change-transform",
          c[2],
          "animate-[aurora-c_23s_ease-in-out_infinite]",
        )}
      />
      <span
        className={cn(
          "absolute -bottom-[26%] -right-[22%] h-[75%] w-[75%] rounded-full will-change-transform",
          c[3],
          "animate-[aurora-d_27s_ease-in-out_infinite]",
        )}
      />
      {/* the grid sits over the colour, and fades out before the text */}
      <span className="absolute inset-0 bg-[radial-gradient(var(--line-strong)_1px,transparent_1px)] [background-size:26px_26px] opacity-40 [mask-image:radial-gradient(120%_90%_at_40%_10%,#000_12%,transparent_68%)]" />
    </div>
  );
}

/* ---- the window --------------------------------------------------------------- */

export function AuthSplit({
  title, subtitle, children, below, slides = MODULE_SLIDES, badge, tone = "clinic",
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** the form */
  children: React.ReactNode;
  /** anything under it — a help link, a note */
  below?: React.ReactNode;
  /** what the left half shows; the module catalogue unless told otherwise */
  slides?: ShowcaseSlide[];
  /** a word beside the wordmark, for a sign-in that is not a clinic's */
  badge?: string;
  tone?: Tone;
}) {
  const { data: support } = useSupportInfo();

  return (
    <div className="flex min-h-dvh w-full flex-col bg-surface lg:h-dvh lg:flex-row lg:overflow-hidden">
      <ModuleShowcase slides={slides} badge={badge} tone={tone} />

      <main className="flex min-w-0 flex-1 flex-col lg:overflow-y-auto">
        <div className="flex justify-end px-6 pt-6 sm:px-10 lg:px-12 lg:pt-10 xl:px-14">
          <a
            href={`mailto:${support?.support_email ?? ""}`}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 rounded-[var(--r-sm)] text-label font-medium text-accent",
              "underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4",
            )}
          >
            <GlyphHeadset />
            Contact support
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10 lg:py-6">
          <section aria-labelledby="auth-title" className="w-full max-w-[460px]">
            <h1 id="auth-title" className="text-[28px] font-semibold leading-tight text-ink sm:text-[32px]">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-[16px] leading-relaxed text-ink-2">{subtitle}</p>}
            {children}
            {below}
          </section>
        </div>

        <footer className="flex items-center justify-between gap-4 px-6 pb-6 text-caption text-ink-3 sm:px-10 lg:px-12 xl:px-14">
          <span className="lg:hidden">© {new Date().getFullYear()} Astrale</span>
          <span className="ml-auto">Better care. Brighter communities.</span>
        </footer>
      </main>
    </div>
  );
}

/* ---- the form ----------------------------------------------------------------- */

/* Chrome paints saved credentials on a ground of its own with an !important
   colour we cannot override. What it does not force is where that ground is
   painted, so it is clipped to the glyphs, which the text fill then covers. */
const inputBase =
  "h-[54px] w-full rounded-[var(--r-lg)] border bg-surface pl-12 pr-4 text-[16px] text-ink " +
  "placeholder:text-ink-placeholder transition-[border-color,box-shadow] duration-150 " +
  "ease-[var(--ease-brand)] focus:outline-none " +
  "autofill:[-webkit-background-clip:text] autofill:[background-clip:text] " +
  "autofill:[-webkit-text-fill-color:var(--ink)] autofill:[caret-color:var(--ink)] " +
  "autofill:[transition:background-color_600000s_0s,color_600000s_0s]";

const inputTone = (invalid?: boolean) =>
  invalid
    ? "border-critical focus:border-critical focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--critical)_18%,transparent)]"
    : "border-line-strong focus:border-focus focus:shadow-[var(--focus-ring)]";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "type">;

function Shell({
  id, label, icon, error, children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-2 block text-label font-medium text-ink">
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex w-12 items-center justify-center text-ink-3">
          {icon}
        </span>
        {children}
      </div>
      {/* the message is text, not a colour: a field that says nothing but turns
          red has told a colour-blind reader only that something is wrong */}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-caption leading-snug text-critical-text">
          {error}
        </p>
      )}
    </div>
  );
}

export function EmailField({
  id, label, error, ...rest
}: InputProps & { id: string; label: string; error?: string | null }) {
  return (
    <Shell id={id} label={label} icon={<IconMail size={18} />} error={error}>
      <input
        id={id}
        type="email"
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(inputBase, inputTone(!!error))}
        {...rest}
      />
    </Shell>
  );
}

export function PasswordField({
  id, label, error, invalid, ...rest
}: InputProps & { id: string; label: string; error?: string | null; invalid?: boolean }) {
  const [shown, setShown] = React.useState(false);
  const bad = !!error || invalid;
  return (
    <Shell id={id} label={label} icon={<IconLock size={18} />} error={error}>
      <input
        id={id}
        type={shown ? "text" : "password"}
        aria-invalid={bad}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(inputBase, inputTone(bad), "pr-12")}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className={cn(
          "absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-[var(--r-lg)]",
          "text-ink-3 transition-colors hover:text-ink",
          "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus",
        )}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
      >
        {shown ? <IconEye size={18} /> : <IconEyeOff size={18} />}
      </button>
    </Shell>
  );
}

export function RememberRow({ checked, onChange, trailing }: {
  checked: boolean;
  onChange: (v: boolean) => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="group flex cursor-pointer items-center gap-2.5 text-label font-medium text-ink">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded-[5px] border-[1.5px] transition-colors",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus",
            checked
              ? "border-accent bg-accent text-accent-ink"
              : "border-line-strong bg-surface group-hover:border-ink-3",
          )}
        >
          {checked && <IconCheck size={12} strokeWidth={2.6} />}
        </span>
        Remember me
      </label>
      {trailing}
    </div>
  );
}

/** A text link in the accent — an anchor, or a button when given `onClick`. */
export function AuthLink({ href, onClick, muted, children, ...aria }: {
  href?: string;
  onClick?: () => void;
  /** for the secondary line under a form, which should not compete */
  muted?: boolean;
  children: React.ReactNode;
  "aria-expanded"?: boolean;
}) {
  const className = cn(
    "rounded-[var(--r-sm)] text-label font-medium underline-offset-4 hover:underline",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
    muted ? "text-ink-3 hover:text-ink-2" : "text-accent",
  );
  return href ? (
    <a href={href} className={className}>{children}</a>
  ) : (
    <button type="button" onClick={onClick} className={className} {...aria}>{children}</button>
  );
}

/** The form's own failure — a line of text with a mark beside it, not a slab. */
export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <p
      role="alert"
      className={cn(
        "flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft",
        "px-3.5 py-3 text-caption leading-relaxed text-critical-text",
      )}
    >
      <IconAlert size={15} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function AuthNote({ children }: { children: React.ReactNode }) {
  return <p className="mt-2 text-caption leading-snug text-ink-3">{children}</p>;
}

export function SubmitButton({ busy, busyLabel = "Signing in…", children }: {
  busy: boolean;
  busyLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className={cn(
        "flex h-[54px] w-full items-center justify-center gap-2 rounded-[var(--r-lg)]",
        "bg-accent text-[16px] font-medium text-accent-ink",
        "shadow-e1 transition-[background-color,box-shadow,transform] duration-150 ease-[var(--ease-brand)]",
        "hover:bg-accent-hover hover:shadow-e2 active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
        "disabled:cursor-not-allowed disabled:bg-disabled-surface disabled:text-disabled-ink disabled:shadow-none",
      )}
    >
      {busy ? (
        <>
          <Spinner size={17} />
          {busyLabel}
        </>
      ) : (
        <>
          {children}
          <IconArrowRight size={17} strokeWidth={2} />
        </>
      )}
    </button>
  );
}

function GlyphHeadset() {
  return (
    <svg
      width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13" width="4" height="6" rx="1.8" />
      <rect x="16.5" y="13" width="4" height="6" rx="1.8" />
      <path d="M18.5 19a3 3 0 0 1-3 2.5H13" />
    </svg>
  );
}
