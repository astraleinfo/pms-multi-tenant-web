"use client";

import * as React from "react";
import Image, { type StaticImageData } from "next/image";
import { SUPPORT } from "@/lib/support";
import { cn } from "@/lib/cn";
import { IconAlert, IconArrowRight, IconCheck, IconEye, IconEyeOff } from "@/components/ui/icons";

/* ==========================================================================
   The sign-in scene — shared by the clinic login and the platform console.

   Built to the approved mockup: a clinic photograph with a wave down its
   left side, the pitch on the wave, the form over the room with no card.
   The clinic sees it by day (mint wave, navy ink); the console sees the same
   room at night (navy wave, light ink), so the two are plainly related and
   never mistaken for each other.

   Each scene runs on its own small palette rather than the working tokens,
   because the page's lightness is fixed by its photograph, not by the theme
   a user has picked. The action blue is the application's own `--accent`
   (#2F62C8 / #26529F) in both; on the night scene, links and focus take the
   app's night-shift accent text (#A6C0F5) so they stay legible on navy.
   Text is always a solid colour.
   ========================================================================== */

export type LoginTone = "day" | "night";

const PALETTES = {
  day: {
    root: "bg-[#E4F6F0] text-[#0E1742]",
    /* the daytime photograph is shown as it is */
    dim: "",
    /* headings carry the app's own `--ink` in base styles, so they are told again */
    ink: "text-[#0E1742]",
    muted: "text-[#525E84]",
    link: "text-[#2F62C8] focus-visible:outline-[#2F62C8]",
    outline: "focus-visible:outline-[#2F62C8]",
    peerOutline: "peer-focus-visible:outline-[#2F62C8]",
    bar: "bg-[#2F62C8]",
    accentText: "text-[#2F62C8]",
    field: "border-[#8494AE] focus-within:border-[#2F62C8]",
    input:
      "text-[#0E1742] placeholder:text-[#5E6989] " +
      "autofill:[-webkit-text-fill-color:#0E1742] autofill:[caret-color:#0E1742]",
    icon: "text-[#525E84] hover:text-[#0E1742]",
    checkboxOff: "border-[#6A7596] bg-white group-hover:border-[#0E1742]",
    signature: "text-[#2A6A60] [-webkit-text-stroke:0.4px_#2A6A60]",
    signatureRule: "bg-[#2A6A60]",
    tile: "shadow-[inset_0_1px_0_#FFFFFF,0_6px_14px_-8px_rgba(14,23,66,0.25)]",
    error: "border-[#F5C2C0] bg-[#FDF0EF] text-[#B42318]",
    button: "shadow-[0_10px_24px_rgba(47,98,200,0.25)] disabled:bg-[#9DB3E3]",
    buttonOutline: "focus-visible:outline-[#2F62C8]",
  },
  night: {
    /* the night room has lamp-lit patches — a soft dark halo keeps light text
       legible where it crosses one, without dimming the text itself */
    root: "bg-[#0A1B45] text-[#F4F7FF] [text-shadow:0_1px_10px_rgb(5_12_40_/_0.7)]",
    /* the lamp-lit room is brighter than a night console should feel — a navy
       wash, heavier over the room where the form sits, calms it */
    dim: "bg-[linear-gradient(90deg,rgb(8_18_48_/_0.35)_0%,rgb(8_18_48_/_0.55)_45%,rgb(8_18_48_/_0.68)_100%)]",
    ink: "text-[#F4F7FF]",
    muted: "text-[#B4C1E2]",
    link: "text-[#A6C0F5] focus-visible:outline-[#A6C0F5]",
    outline: "focus-visible:outline-[#A6C0F5]",
    peerOutline: "peer-focus-visible:outline-[#A6C0F5]",
    bar: "bg-[#7C9FE8]",
    accentText: "text-[#8FB2FF]",
    field: "border-[#7486B3] focus-within:border-[#A6C0F5]",
    input:
      "text-[#F4F7FF] placeholder:text-[#A3B0D1] " +
      "autofill:[-webkit-text-fill-color:#F4F7FF] autofill:[caret-color:#F4F7FF]",
    icon: "text-[#B4C1E2] hover:text-[#F4F7FF]",
    checkboxOff: "border-[#8C9BC0] bg-[#0A1B45] group-hover:border-[#F4F7FF]",
    signature: "text-[#9ED9CE] [-webkit-text-stroke:0.4px_#9ED9CE]",
    signatureRule: "bg-[#9ED9CE]",
    tile: "shadow-[inset_0_1px_0_#2C3F73,0_8px_18px_-10px_rgba(0,0,0,0.6)]",
    error: "border-[#7A2E36] bg-[#3A1620] text-[#FFC2C2]",
    button: "shadow-[0_10px_24px_rgba(0,0,0,0.35)] disabled:bg-[#344C82]",
    buttonOutline: "focus-visible:outline-[#A6C0F5]",
  },
} as const;

type Palette = (typeof PALETTES)[LoginTone];

const PaletteContext = React.createContext<Palette>(PALETTES.day);

/** The current scene's palette, for the odd line of text a page adds itself. */
export function useLoginPalette() {
  return React.useContext(PaletteContext);
}

export interface LoginFeature {
  title: string;
  /** two lines, broken where the mockup breaks them */
  body: [string, string];
  icon: React.ReactNode;
  /** the tile's ground and icon colour, as solid Tailwind classes */
  tile: string;
}

export function LoginScene({
  tone,
  background,
  pitch,
  title,
  subtitle,
  children,
  below,
}: {
  tone: LoginTone;
  background: StaticImageData;
  pitch: {
    eyebrow: string;
    /** two lines; the second may carry a highlighted phrase via <LoginAccent> */
    headline: React.ReactNode;
    lede: React.ReactNode;
    features: LoginFeature[];
  };
  title: string;
  subtitle?: React.ReactNode;
  /** the form */
  children: React.ReactNode;
  /** anything under the form — a help link, a note */
  below?: React.ReactNode;
}) {
  const p = PALETTES[tone];

  return (
    <PaletteContext.Provider value={p}>
      <div
        className={cn(
          "relative isolate flex min-h-dvh flex-col overflow-hidden font-[family-name:var(--font-login)]",
          p.root,
        )}
      >
        <Image
          src={background}
          alt=""
          fill
          preload
          sizes="100vw"
          className="-z-10 object-cover object-[28%_center]"
        />
        {p.dim && <div aria-hidden className={cn("pointer-events-none absolute inset-0 -z-10", p.dim)} />}

        {/* ---- top bar -------------------------------------------------- */}
        <header className="mx-auto flex w-full max-w-[1698px] items-center justify-between gap-4 px-4 pt-5 sm:px-10 lg:pl-[94px] lg:pr-[84px] lg:pt-[42px] short:lg:pt-5">
          <Brand />
          <p className={cn("flex items-center gap-3 text-[14px] leading-none", p.muted)}>
            <span className="hidden sm:inline">Need help?</span>
            <a
              href={`mailto:${SUPPORT.email}`}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] text-[14px] font-medium leading-none underline-offset-4 hover:underline",
                "focus-visible:outline-2 focus-visible:outline-offset-4",
                p.link,
              )}
            >
              <GlyphHeadset />
              Contact Support
            </a>
          </p>
        </header>

        <main className="mx-auto flex w-full max-w-[1698px] flex-1 items-center justify-center gap-10 px-4 py-8 sm:px-10 lg:px-[94px] xl:justify-between xl:py-2 short:py-3">
          {/* ---- the pitch, on the wave -------------------------------- */}
          <section className="hidden min-w-0 flex-1 xl:-mt-[6px] xl:block short:mt-0">
            <span aria-hidden className={cn("block h-[3px] w-[54px] rounded-full", p.bar)} />
            <p
              className={cn(
                "mt-[34px] text-[13.5px] font-medium uppercase tracking-[0.1em] short:mt-5",
                p.muted,
              )}
            >
              {pitch.eyebrow}
            </p>
            <h1 className={cn("mt-[12px] text-[38px] font-bold leading-[1.18] tracking-[-0.01em] xl:text-[41px]", p.ink)}>
              {pitch.headline}
            </h1>
            <p className={cn("mt-[22px] text-[19px] leading-[1.5] short:mt-4", p.muted)}>
              {pitch.lede}
            </p>

            <ul className="mt-[38px] grid w-fit grid-cols-[297px_auto] gap-y-[40px] short:mt-6 short:gap-y-5">
              {pitch.features.map((f) => (
                <li key={f.title} className="flex items-start gap-6 short:gap-4">
                  <span
                    className={cn(
                      "flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[16px] short:h-14 short:w-14",
                      p.tile,
                      f.tile,
                    )}
                  >
                    {f.icon}
                  </span>
                  <span className="pt-[8px] short:pt-1">
                    <span className="block text-[16.5px] font-medium">{f.title}</span>
                    <span
                      className={cn(
                        "mt-[4px] block whitespace-nowrap text-[15px] leading-[1.4]",
                        p.muted,
                      )}
                    >
                      {f.body[0]}
                      <br />
                      {f.body[1]}
                    </span>
                  </span>
                </li>
              ))}
            </ul>

            <p
              aria-hidden
              className={cn(
                "mt-[58px] ml-[66px] w-fit origin-left -rotate-[16deg] font-[family-name:var(--font-login-script)] text-[40px] leading-[1.02] short:hidden",
                p.signature,
              )}
            >
              Care
              <br />
              <span className="ml-[18px]">Moves Forward</span>
              <br />
              <span className="ml-[50px]">Together</span>
              <span className={cn("mt-[10px] ml-[90px] block h-[2px] w-[88px] rounded-full", p.signatureRule)} />
            </p>
          </section>

          {/* ---- the form: no card, it sits straight on the photograph --- */}
          <section
            aria-labelledby="login-title"
            className={cn(
              "w-full max-w-[541px] shrink-0 bg-transparent px-2 py-8 xl:-mt-[46px] short:xl:mt-0",
              "sm:px-[68px] sm:pt-[40px] sm:pb-[32px] xl:w-[480px] xl:px-12 2xl:mr-[155px] 2xl:w-[541px] 2xl:px-[68px] short:py-6",
            )}
          >
            <div className="hidden flex-col items-center text-center xl:flex short:!hidden">
              <AstraleMark size={58} />
              <span className="mt-[6px] text-[32px] font-bold leading-none tracking-[-0.01em]">
                Astrale
              </span>
              <span className={cn("mt-[6px] text-[15px]", p.muted)}>Patient Management System</span>
              <span aria-hidden className={cn("mt-[14px] block h-[3px] w-[46px] rounded-full", p.bar)} />
            </div>

            <h2
              id="login-title"
              className={cn("text-[31px] font-bold leading-[1.15] tracking-[-0.01em] sm:mt-[20px] short:!mt-0", p.ink)}
            >
              {title}
            </h2>
            {subtitle && <p className={cn("mt-[4px] text-[17px]", p.muted)}>{subtitle}</p>}

            {children}

            {below}
          </section>
        </main>

        {/* ---- footer --------------------------------------------------- */}
        <footer
          className={cn(
            "mx-auto flex w-full max-w-[1698px] items-center justify-between gap-4 px-4 pb-5 text-[14.5px] sm:px-10 lg:pl-[94px] lg:pr-[84px] lg:pb-[38px] short:lg:pb-4",
            p.muted,
          )}
        >
          <span className="lg:pl-[89px]">© {new Date().getFullYear()} Astrale. All rights reserved.</span>
          <span className="hidden sm:inline">Better Care. Brighter Communities.</span>
        </footer>
      </div>
    </PaletteContext.Provider>
  );
}

/** The highlighted phrase in the headline. */
export function LoginAccent({ children }: { children: React.ReactNode }) {
  return <span className={useLoginPalette().accentText}>{children}</span>;
}

/* ---- form controls --------------------------------------------------------- */

/* Chrome paints saved (autofilled) credentials on its own ground (pale blue or
   white, by version) with an !important colour we can't override. What it
   doesn't force is where that ground is painted, so it is clipped to the
   glyphs — which the solid text fill then covers — leaving the field clear. */
const inputBase =
  "h-[50px] w-full rounded-[10px] border-0 bg-transparent pl-[58px] pr-4 text-[15.5px] focus:outline-none short:h-[46px] " +
  "autofill:[-webkit-background-clip:text] autofill:[background-clip:text] " +
  "autofill:[transition:background-color_600000s_0s,color_600000s_0s]";

type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "className" | "type">;

function FieldShell({
  id, label, icon, invalid, children,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  const p = useLoginPalette();
  return (
    <div>
      <label htmlFor={id} className="mb-[6px] block text-[15px] font-medium">
        {label}
      </label>
      <div
        className={cn(
          /* a plain border that holds up on the photograph; focus only changes its colour.
             The room behind the field is blurred so the plant and desk don't run through the text. */
          "relative rounded-[10px] border bg-transparent backdrop-blur-[14px] transition-colors duration-150",
          invalid ? "border-[#E5484D] focus-within:border-[#E5484D]" : p.field,
        )}
      >
        <span
          className={cn(
            "pointer-events-none absolute inset-y-0 left-0 flex w-[58px] items-center justify-center",
            p.muted,
          )}
        >
          {icon}
        </span>
        {children}
      </div>
    </div>
  );
}

export function EmailField({ id, label, invalid, ...rest }: InputProps & { id: string; label: string; invalid?: boolean }) {
  const p = useLoginPalette();
  return (
    <FieldShell id={id} label={label} icon={<GlyphMail />} invalid={invalid}>
      <input id={id} type="email" aria-invalid={invalid} className={cn(inputBase, p.input)} {...rest} />
    </FieldShell>
  );
}

export function PasswordField({ id, label, invalid, ...rest }: InputProps & { id: string; label: string; invalid?: boolean }) {
  const p = useLoginPalette();
  const [shown, setShown] = React.useState(false);
  return (
    <FieldShell id={id} label={label} icon={<GlyphLock />} invalid={invalid}>
      <input
        id={id}
        type={shown ? "text" : "password"}
        aria-invalid={invalid}
        className={cn(inputBase, "pr-[54px]", p.input)}
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        className={cn(
          "absolute inset-y-0 right-0 flex w-[54px] items-center justify-center rounded-r-[10px] transition-colors",
          "focus-visible:outline-2 focus-visible:-outline-offset-4",
          p.icon,
          p.outline,
        )}
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
      >
        {shown ? <IconEye size={20} strokeWidth={1.9} /> : <IconEyeOff size={20} strokeWidth={1.9} />}
      </button>
    </FieldShell>
  );
}

/** "Remember me" on the left, an optional link on the right. */
export function RememberRow({
  checked, onChange, trailing,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  trailing?: React.ReactNode;
}) {
  const p = useLoginPalette();
  return (
    <div className="!mt-[16px] flex items-center justify-between gap-3">
      <label className="group flex cursor-pointer items-center gap-[12px] text-[15px] font-medium">
        <input
          type="checkbox"
          className="peer sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
            "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
            p.peerOutline,
            checked ? "border-[#2F62C8] bg-[#2F62C8] text-white" : p.checkboxOff,
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

/** A text link in the scene's link colour — an anchor, or a button when given onClick. */
export function LoginLink({
  href, onClick, children, ...aria
}: {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  "aria-expanded"?: boolean;
}) {
  const p = useLoginPalette();
  const className = cn(
    "rounded-[4px] text-[15px] font-medium underline-offset-4 hover:underline",
    "focus-visible:outline-2 focus-visible:outline-offset-2",
    p.link,
  );
  return href ? (
    <a href={href} className={className}>{children}</a>
  ) : (
    <button type="button" onClick={onClick} className={className} {...aria}>
      {children}
    </button>
  );
}

export function LoginError({ children }: { children: React.ReactNode }) {
  const p = useLoginPalette();
  return (
    <p
      role="alert"
      className={cn("flex items-start gap-2 rounded-[10px] border px-3.5 py-3 text-[14px] leading-snug", p.error)}
    >
      <IconAlert size={16} className="mt-px shrink-0" />
      {children}
    </p>
  );
}

export function SubmitButton({
  busy, busyLabel = "Signing in…", children,
}: {
  busy: boolean;
  busyLabel?: string;
  children: React.ReactNode;
}) {
  const p = useLoginPalette();
  return (
    <button
      type="submit"
      disabled={busy}
      className={cn(
        "!mt-[20px] flex h-[53px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#2F62C8] text-[17px] font-medium text-white",
        "transition-[background-color,transform] duration-150 hover:bg-[#26529F] active:translate-y-px",
        "focus-visible:outline-2 focus-visible:outline-offset-3",
        "disabled:cursor-not-allowed disabled:shadow-none",
        "short:!mt-4 short:h-12",
        p.button,
        p.buttonOutline,
      )}
    >
      {busy ? busyLabel : <>{children} <IconArrowRight size={18} strokeWidth={2} /></>}
    </button>
  );
}

/** Muted small print under the form. */
export function LoginNote({ children }: { children: React.ReactNode }) {
  return <p className={cn("mt-2 text-[14px] leading-[1.5]", useLoginPalette().muted)}>{children}</p>;
}

/* ---- brand ----------------------------------------------------------------- */

function Brand() {
  const p = useLoginPalette();
  return (
    <div className="flex items-center gap-[16px]">
      <AstraleMark size={44} className="sm:h-[66px] sm:w-[66px]" />
      <span className="leading-none">
        <span className="block text-[28px] font-bold tracking-[-0.01em] sm:text-[40px]">Astrale</span>
        <span className={cn("mt-[6px] hidden text-[15.5px] sm:block", p.muted)}>
          Patient Management System
        </span>
      </span>
    </div>
  );
}

/* ---- drawings -------------------------------------------------------------
   The mockup's marks are heavier and more colourful than the app's line icon
   set, so the sign-in scene draws its own rather than bending the shared family. */

/** The Astrale "A": two gradient legs meeting in a rounded apex, a soft sweep for a crossbar, and a spark. */
function AstraleMark({ size = 48, className }: { size?: number; className?: string }) {
  const id = React.useId();
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`${id}-l`} x1="8" y1="58" x2="30" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#12E0F0" />
          <stop offset="1" stopColor="#1C9BFF" />
        </linearGradient>
        <linearGradient id={`${id}-r`} x1="32" y1="6" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1E8BFF" />
          <stop offset="1" stopColor="#2463FF" />
        </linearGradient>
        <linearGradient id={`${id}-s`} x1="12" y1="50" x2="46" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7FEAF7" stopOpacity="0" />
          <stop offset="1" stopColor="#B8E4FF" />
        </linearGradient>
      </defs>
      <path d="M10 53.5 27.2 12.5" stroke={`url(#${id}-l)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M36.8 12.5 54 53.5" stroke={`url(#${id}-r)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M27.2 12.5a5.2 5.2 0 0 1 9.6 0" stroke={`url(#${id}-r)`} strokeWidth="13" strokeLinecap="round" fill="none" />
      <path d="M11 52c9.5-8.5 20-12.5 33-11.5" stroke={`url(#${id}-s)`} strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M44.5 31c.7 3.6 2.4 5.3 6 6-3.6.7-5.3 2.4-6 6-.7-3.6-2.4-5.3-6-6 3.6-.7 5.3-2.4 6-6Z" fill="#FFFFFF" />
    </svg>
  );
}

function Glyph({ children, size = 34 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      {children}
    </svg>
  );
}

export function GlyphCalendar() {
  return (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      {[[8, 13.5], [12, 13.5], [16, 13.5], [8, 17], [12, 17], [16, 17]].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.15" fill="currentColor" stroke="none" />
      ))}
    </Glyph>
  );
}

export function GlyphPatients() {
  return (
    <Glyph>
      <circle cx="8.5" cy="8" r="3.2" />
      <circle cx="15.8" cy="8" r="3.2" />
      <path d="M3 19.5a5.5 5.5 0 0 1 11 0M10.6 19.5a5.5 5.5 0 0 1 10.4 0" />
    </Glyph>
  );
}

export function GlyphBilling() {
  return (
    <Glyph>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M7.2 14.5h4" />
    </Glyph>
  );
}

export function GlyphReports() {
  return (
    <svg width={34} height={34} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <rect x="4" y="13" width="3.8" height="7.5" rx="1.9" />
      <rect x="10.1" y="8.5" width="3.8" height="12" rx="1.9" />
      <rect x="16.2" y="3.5" width="3.8" height="17" rx="1.9" />
    </svg>
  );
}

/** A clinic building with a cross over the door. */
export function GlyphClinic() {
  return (
    <Glyph>
      <path d="M4 20.5V8.5l8-4.5 8 4.5v12" />
      <path d="M2.5 20.5h19" />
      <path d="M12 9v5M9.5 11.5h5" />
      <path d="M9.5 20.5v-3.5h5v3.5" />
    </Glyph>
  );
}

/** Four tiles — the modules a clinic can switch on. */
export function GlyphModules() {
  return (
    <Glyph>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <path d="M17 13.5v7M13.5 17h7" />
    </Glyph>
  );
}

export function GlyphShield() {
  return (
    <Glyph>
      <path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.2 7.5 9.5 4.3-1.3 7.5-4.9 7.5-9.5V6L12 3Z" />
      <path d="m8.8 12.2 2.2 2.2 4.4-4.6" />
    </Glyph>
  );
}

export function GlyphClock() {
  return (
    <Glyph>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Glyph>
  );
}

/** A door with an arrow leaving it — every session signed out. */
export function GlyphSignOut() {
  return (
    <Glyph>
      <path d="M13.5 4.5h-7a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h7" />
      <path d="M10.5 12h10M17 8.5l3.5 3.5-3.5 3.5" />
    </Glyph>
  );
}

export function GlyphPadlock() {
  return (
    <Glyph>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <path d="M12 14.5v2" />
    </Glyph>
  );
}

function GlyphMail() {
  return (
    <Glyph size={21}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.2" />
      <path d="m3.8 7 8.2 6 8.2-6" />
    </Glyph>
  );
}

function GlyphLock() {
  return (
    <Glyph size={21}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2.2" />
      <path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" />
      <circle cx="12" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

function GlyphHeadset() {
  return (
    <Glyph size={17}>
      <path d="M4.5 14v-2a7.5 7.5 0 0 1 15 0v2" />
      <rect x="3.5" y="13" width="4" height="6" rx="1.8" />
      <rect x="16.5" y="13" width="4" height="6" rx="1.8" />
      <path d="M18.5 19a3 3 0 0 1-3 2.5H13" />
    </Glyph>
  );
}
