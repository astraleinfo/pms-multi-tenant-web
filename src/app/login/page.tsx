"use client";

import * as React from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { SUPPORT } from "@/lib/support";
import { cn } from "@/lib/cn";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconEye,
  IconEyeOff,
} from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";
import background from "../../../public/images/tenant-login-bg.webp";

/* ==========================================================================
   Tenant sign-in.

   Built to the approved mockup: a clinic photograph with a mint wave, the
   pitch on the wave, the form over the room. It runs on its own small
   palette rather than the working tokens — deep navy ink, a blue-slate for
   secondary text, the application's accent blue for what can be pressed. Text is always
   a solid colour. There is no card — the form sits on the photograph.
   ========================================================================== */

/* The blue is the application's own action colour — `--accent` and
   `--accent-hover` in globals.css — written out because this page is always
   light, and the tokens turn pale under the night-shift theme. Keep them in step. */
const INK = "text-[#0E1742]";
const MUTED = "text-[#525E84]";

const FEATURES = [
  {
    title: "Appointments & Queue",
    body: ["Book visits and see", "who is waiting now"],
    icon: <GlyphCalendar />,
    tile: "bg-[#E4ECFA] text-[#2F62C8]",
  },
  {
    title: "Patient Records",
    body: ["Complete medical history", "at your fingertips"],
    icon: <GlyphPatients />,
    tile: "bg-[#DDF6EC] text-[#10B866]",
  },
  {
    title: "Billing & Payments",
    body: ["Invoices built straight", "from each visit"],
    icon: <GlyphBilling />,
    tile: "bg-[#E6E6FD] text-[#7A4CF6]",
  },
  {
    title: "Reports & Insights",
    body: ["Track visits, revenue", "and patient trends"],
    icon: <GlyphReports />,
    tile: "bg-[#FDECE2] text-[#FB5A12]",
  },
];

/* the address is remembered only when asked, and only on this device */
const REMEMBER_KEY = "astrale.login.email";

export default function LoginPage() {
  const router = useRouter();
  const { hostTenant, hostTenantPending, session, ready, signIn, notify } =
    useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [shown, setShown] = React.useState(false);
  const [remember, setRemember] = React.useState(false);
  const [askAdmin, setAskAdmin] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* already signed in? the login page has nothing to offer */
  React.useEffect(() => {
    if (ready && session.signedIn) router.replace("/dashboard");
  }, [ready, session.signedIn, router]);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* storage blocked — nothing to restore */
    }
  }, []);

  /* the clinic behind this address is a public read — the one thing the API
     answers without a session */
  if (!ready || hostTenantPending || !hostTenant) {
    return <StageLoader className="!bg-stage" />;
  }

  const tenant = hostTenant;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage blocked — sign-in still stands */
      }
      setError(null);
      notify({
        tone: "ok",
        title: "Signed in",
        body: `Welcome back to ${tenant.name}.`,
      });
      router.replace("/dashboard");
    } else {
      setError(result.error);
      setPassword("");
    }
  };

  return (
    <div
      className={cn(
        "relative isolate flex min-h-dvh flex-col overflow-hidden bg-[#E4F6F0] font-[family-name:var(--font-login)]",
        INK,
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

      {/* ---- top bar ---------------------------------------------------- */}
      <header className="mx-auto flex w-full max-w-[1698px] items-center justify-between gap-4 px-4 pt-5 sm:px-10 lg:pl-[94px] lg:pr-[84px] lg:pt-[42px] short:lg:pt-5">
        <Brand />
        <p
          className={cn(
            "flex items-center gap-3 text-[14px] leading-none",
            MUTED,
          )}
        >
          <span className="hidden sm:inline">Need help?</span>
          <a
            href={`mailto:${SUPPORT.email}`}
            className="inline-flex items-center gap-1.5 rounded-[6px] text-[14px] font-medium leading-none text-[#2F62C8] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#2F62C8]"
          >
            <GlyphHeadset />
            Contact Support
          </a>
        </p>
      </header>

      <main className="mx-auto flex w-full max-w-[1698px] flex-1 items-center justify-center gap-10 px-4 py-8 sm:px-10 lg:px-[94px] xl:justify-between xl:py-2 short:py-3">
        {/* ---- the pitch, on the wave ------------------------------------ */}
        <section className="hidden min-w-0 flex-1 xl:-mt-[6px] xl:block short:mt-0">
          <span
            aria-hidden
            className="block h-[3px] w-[54px] rounded-full bg-[#2F62C8]"
          />
          <p
            className={cn(
              "mt-[34px] text-[13.5px] font-medium uppercase tracking-[0.1em] short:mt-5",
              MUTED,
            )}
          >
            Better care. Healthier tomorrows.
          </p>
          <h1 className="mt-[12px] text-[38px] font-bold leading-[1.18] tracking-[-0.01em] xl:text-[41px]">
            Everything you need
            <br />
            for <span className="text-[#2F62C8]">better patient care</span>
          </h1>
          <p
            className={cn(
              "mt-[22px] text-[19px] leading-[1.5] short:mt-4",
              MUTED,
            )}
          >
            Every patient, every visit, every record —
            <br />
            from first appointment to follow-up.
          </p>

          <ul className="mt-[38px] grid w-fit grid-cols-[297px_auto] gap-y-[40px] short:mt-6 short:gap-y-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex items-start gap-6 short:gap-4">
                <span
                  className={cn(
                    "flex h-[66px] w-[66px] shrink-0 items-center justify-center rounded-[16px] short:h-14 short:w-14",
                    "shadow-[inset_0_1px_0_#FFFFFF,0_6px_14px_-8px_rgba(14,23,66,0.25)]",
                    f.tile,
                  )}
                >
                  {f.icon}
                </span>
                <span className="pt-[8px] short:pt-1">
                  <span className="block text-[16.5px] font-medium">
                    {f.title}
                  </span>
                  <span
                    className={cn(
                      "mt-[4px] block whitespace-nowrap text-[15px] leading-[1.4]",
                      MUTED,
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
            className="mt-[58px] ml-[66px] w-fit origin-left -rotate-[16deg] font-[family-name:var(--font-login-script)] text-[40px] leading-[1.02] text-[#2A6A60] [-webkit-text-stroke:0.4px_#2A6A60] short:hidden"
          >
            Care
            <br />
            <span className="ml-[18px]">Moves Forward</span>
            <br />
            <span className="ml-[50px]">Together</span>
            <span className="mt-[10px] ml-[90px] block h-[2px] w-[88px] rounded-full bg-[#2A6A60]" />
          </p>
        </section>

        {/* ---- the card ------------------------------------------------- */}
        <section
          aria-labelledby="login-title"
          className={cn(
            /* no card: the form sits straight on the photograph */
            "w-full max-w-[541px] shrink-0 bg-transparent px-2 py-8 xl:-mt-[46px] short:xl:mt-0",
            "sm:px-[68px] sm:pt-[40px] sm:pb-[32px] xl:w-[480px] xl:px-12 2xl:mr-[155px] 2xl:w-[541px] 2xl:px-[68px] short:py-6",
          )}
        >
          <div className="hidden flex-col items-center text-center xl:flex short:!hidden">
            <AstraleMark size={58} />
            <span className="mt-[6px] text-[32px] font-bold leading-none tracking-[-0.01em]">
              Astrale
            </span>
            <span className={cn("mt-[6px] text-[15px]", MUTED)}>
              Patient Management System
            </span>
            <span
              aria-hidden
              className="mt-[14px] block h-[3px] w-[46px] rounded-full bg-[#2F62C8]"
            />
          </div>

          <h2
            id="login-title"
            className="text-[31px] font-bold leading-[1.15] tracking-[-0.01em] sm:mt-[20px] short:!mt-0"
          >
            Login
          </h2>

          <form
            onSubmit={submit}
            className="mt-[22px] space-y-[12px] short:mt-5"
          >
            <div>
              <label
                htmlFor="email"
                className="mb-[6px] block text-[15px] font-medium"
              >
                Email address
              </label>
              <IconField icon={<GlyphMail />} invalid={!!error}>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your email address"
                  aria-invalid={!!error}
                  required
                  className={inputClass}
                />
              </IconField>
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-[6px] block text-[15px] font-medium"
              >
                Password
              </label>
              <IconField icon={<GlyphLock />} invalid={!!error}>
                <input
                  id="password"
                  type={shown ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Enter your password"
                  aria-invalid={!!error}
                  required
                  className={cn(inputClass, "pr-[54px]")}
                />
                <button
                  type="button"
                  onClick={() => setShown((s) => !s)}
                  className={cn(
                    "absolute inset-y-0 right-0 flex w-[54px] items-center justify-center rounded-r-[10px] transition-colors hover:text-[#0E1742]",
                    "focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#2F62C8]",
                    MUTED,
                  )}
                  aria-label={shown ? "Hide password" : "Show password"}
                  aria-pressed={shown}
                >
                  {shown ? (
                    <IconEye size={20} strokeWidth={1.9} />
                  ) : (
                    <IconEyeOff size={20} strokeWidth={1.9} />
                  )}
                </button>
              </IconField>
            </div>

            <div className="!mt-[16px] flex items-center justify-between gap-3">
              <label className="group flex cursor-pointer items-center gap-[12px] text-[15px] font-medium">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border-[1.5px] transition-colors",
                    "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#2F62C8]",
                    remember
                      ? "border-[#2F62C8] bg-[#2F62C8] text-white"
                      : "border-[#6A7596] bg-white group-hover:border-[#0E1742]",
                  )}
                >
                  {remember && <IconCheck size={12} strokeWidth={2.6} />}
                </span>
                Remember me
              </label>
              <a
                href="/forgot-password"
                className="rounded-[4px] text-[15px] font-medium text-[#2F62C8] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F62C8]"
              >
                Forgot password?
              </a>
            </div>

            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-[10px] border border-[#F5C2C0] bg-[#FDF0EF] px-3.5 py-3 text-[14px] leading-snug text-[#B42318]"
              >
                <IconAlert size={16} className="mt-px shrink-0" />
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className={cn(
                "!mt-[20px] flex h-[53px] w-full items-center justify-center gap-2 rounded-[10px] bg-[#2F62C8] text-[17px] font-medium text-white",
                "shadow-[0_10px_24px_rgba(47,98,200,0.25)] transition-[background-color,transform] duration-150",
                "hover:bg-[#26529F] active:translate-y-px",
                "focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[#2F62C8]",
                "disabled:cursor-not-allowed disabled:bg-[#9DB3E3] disabled:shadow-none",
                "short:!mt-4 short:h-12",
              )}
            >
              {busy ? (
                "Signing in…"
              ) : (
                <>
                  Sign In <IconArrowRight size={18} strokeWidth={2} />
                </>
              )}
            </button>
          </form>

          <div className="mt-[14px] text-center short:mt-4">
            <button
              type="button"
              onClick={() => setAskAdmin((v) => !v)}
              aria-expanded={askAdmin}
              className="rounded-[4px] text-[15px] font-medium text-[#2F62C8] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F62C8]"
            >
              Contact your administrator
            </button>
            {askAdmin && (
              <p className={cn("mt-2 text-[14px] leading-[1.5]", MUTED)}>
                Accounts at {tenant.name} are created by your clinic admin —
                ask them to send you an invitation.
              </p>
            )}
          </div>
        </section>
      </main>

      {/* ---- footer ----------------------------------------------------- */}
      <footer
        className={cn(
          "mx-auto flex w-full max-w-[1698px] items-center justify-between gap-4 px-4 pb-5 text-[14.5px] sm:px-10 lg:pl-[94px] lg:pr-[84px] lg:pb-[38px] short:lg:pb-4",
          MUTED,
        )}
      >
        <span className="lg:pl-[89px]">
          © {new Date().getFullYear()} Astrale. All rights reserved.
        </span>
        <span className="hidden sm:inline">
          Better Care. Brighter Communities.
        </span>
      </footer>
    </div>
  );
}

/* Chrome paints saved (autofilled) credentials on its own ground (pale blue or
   white, by version) with an !important colour we can't override. What it
   doesn't force is where that ground is painted, so it is clipped to the
   glyphs — which the solid text fill then covers — leaving the field clear. */
const inputClass =
  "h-[50px] w-full rounded-[10px] border-0 bg-transparent pl-[58px] pr-4 text-[15.5px] text-[#0E1742] " +
  "placeholder:text-[#5E6989] focus:outline-none short:h-[46px] " +
  "autofill:[-webkit-background-clip:text] autofill:[background-clip:text] " +
  "autofill:[-webkit-text-fill-color:#0E1742] autofill:[caret-color:#0E1742] " +
  "autofill:[transition:background-color_600000s_0s,color_600000s_0s]";

/** An input sat in a bordered shell with a leading icon; the shell owns the focus ring. */
function IconField({
  icon,
  invalid,
  children,
}: {
  icon: React.ReactNode;
  invalid?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        /* a plain border that holds up on the photograph; focus only changes its colour.
           The room behind the field is blurred so the plant and desk don't run through the text. */
        "relative rounded-[10px] border bg-transparent backdrop-blur-[14px] transition-colors duration-150",
        invalid
          ? "border-[#E5484D] focus-within:border-[#E5484D]"
          : "border-[#8494AE] focus-within:border-[#2F62C8]",
      )}
    >
      <span
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 flex w-[58px] items-center justify-center",
          MUTED,
        )}
      >
        {icon}
      </span>
      {children}
    </div>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-[16px]">
      <AstraleMark size={44} className="sm:h-[66px] sm:w-[66px]" />
      <span className="leading-none">
        <span className="block text-[28px] font-bold tracking-[-0.01em] sm:text-[40px]">
          Astrale
        </span>
        <span className={cn("mt-[6px] hidden text-[15.5px] sm:block", MUTED)}>
          Patient Management System
        </span>
      </span>
    </div>
  );
}

/* ---- drawings -------------------------------------------------------------
   The mockup's marks are heavier and more colourful than the app's line icon
   set, so this page draws its own rather than bending the shared family. */

/** The Astrale "A": two gradient legs meeting in a rounded apex, a soft sweep for a crossbar, and a spark. */
function AstraleMark({
  size = 48,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const id = React.useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-l`}
          x1="8"
          y1="58"
          x2="30"
          y2="8"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#12E0F0" />
          <stop offset="1" stopColor="#1C9BFF" />
        </linearGradient>
        <linearGradient
          id={`${id}-r`}
          x1="32"
          y1="6"
          x2="56"
          y2="58"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#1E8BFF" />
          <stop offset="1" stopColor="#2463FF" />
        </linearGradient>
        <linearGradient
          id={`${id}-s`}
          x1="12"
          y1="50"
          x2="46"
          y2="40"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#7FEAF7" stopOpacity="0" />
          <stop offset="1" stopColor="#B8E4FF" />
        </linearGradient>
      </defs>
      <path
        d="M10 53.5 27.2 12.5"
        stroke={`url(#${id}-l)`}
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M36.8 12.5 54 53.5"
        stroke={`url(#${id}-r)`}
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M27.2 12.5a5.2 5.2 0 0 1 9.6 0"
        stroke={`url(#${id}-r)`}
        strokeWidth="13"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11 52c9.5-8.5 20-12.5 33-11.5"
        stroke={`url(#${id}-s)`}
        strokeWidth="6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M44.5 31c.7 3.6 2.4 5.3 6 6-3.6.7-5.3 2.4-6 6-.7-3.6-2.4-5.3-6-6 3.6-.7 5.3-2.4 6-6Z"
        fill="#FFFFFF"
      />
    </svg>
  );
}

function Glyph({
  children,
  size = 34,
}: {
  children: React.ReactNode;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

function GlyphCalendar() {
  return (
    <Glyph>
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      {[
        [8, 13.5],
        [12, 13.5],
        [16, 13.5],
        [8, 17],
        [12, 17],
        [16, 17],
      ].map(([cx, cy]) => (
        <circle
          key={`${cx}-${cy}`}
          cx={cx}
          cy={cy}
          r="1.15"
          fill="currentColor"
          stroke="none"
        />
      ))}
    </Glyph>
  );
}

function GlyphPatients() {
  return (
    <Glyph>
      <circle cx="8.5" cy="8" r="3.2" />
      <circle cx="15.8" cy="8" r="3.2" />
      <path d="M3 19.5a5.5 5.5 0 0 1 11 0M10.6 19.5a5.5 5.5 0 0 1 10.4 0" />
    </Glyph>
  );
}

function GlyphBilling() {
  return (
    <Glyph>
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <path d="M3.5 9.5h17M7.2 14.5h4" />
    </Glyph>
  );
}

function GlyphReports() {
  return (
    <svg
      width={34}
      height={34}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="4" y="13" width="3.8" height="7.5" rx="1.9" />
      <rect x="10.1" y="8.5" width="3.8" height="12" rx="1.9" />
      <rect x="16.2" y="3.5" width="3.8" height="17" rx="1.9" />
    </svg>
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
