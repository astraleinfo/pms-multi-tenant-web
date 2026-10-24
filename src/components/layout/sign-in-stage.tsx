"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store/app-store";
import { useSupportInfo } from "@/lib/query/hooks";
import { telHref } from "@/lib/support";
import { RESERVED_SUBDOMAINS, tenantUrl } from "@/lib/tenancy";
import { IconArrowRight, IconShield } from "@/components/ui/icons";
import { AuthLink, AuthNote, AuthSplit, SubmitButton } from "./auth-split";

/** A subdomain nobody has claimed. */
export function UnknownTenantStage({ slug }: { slug: string | null }) {
  const { host } = useApp();
  return (
    <AuthSplit
      title="No clinic uses this address"
      subtitle={
        <>
          Nothing is set up at <span className="break-all font-medium text-ink">{slug}.{host.root}</span>. Check
          the spelling of your clinic&rsquo;s name and try again.
        </>
      }
      below={<AddressHelp />}
    >
      <ClinicAddressForm initial={slug ?? ""} current={slug} />
    </AuthSplit>
  );
}

/** A clinic the platform has switched off. */
export function SuspendedTenantStage({ name }: { name: string }) {
  const { consoleUrl } = useApp();
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-stage px-6 text-stage-ink">
      <div className="fixed inset-0 -z-10 bg-stage" aria-hidden />
      <div className="max-w-lg text-center">
        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-[var(--r-lg)] border border-white/12 bg-white/[0.05]">
          <IconShield size={22} />
        </span>
        <h1 className="font-display text-display-lg font-semibold leading-tight text-stage-ink">{name} is suspended</h1>
        <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-stage-dim">
          The platform has paused this clinic, so nobody can sign in and no data is served. Reactivating it in the
          console brings the subdomain straight back.
        </p>
        <a
          href={consoleUrl()}
          className={cn(
            "mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--r)] bg-stage-ink px-4",
            "text-body font-medium text-stage transition-[filter] hover:brightness-110",
          )}
        >
          Platform console <IconArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}

/**
 * The apex: neither a clinic nor the console.
 *
 * The people who land here are clinic staff who typed the bare domain, so the
 * page is a way to their own clinic's address — not a door to the console,
 * which they cannot use and which lives at `admin.<root>` for those who can.
 * It is the sign-in window, so it reads as the first step of signing in.
 */
export function ApexStage() {
  return (
    <AuthSplit
      title="Find your clinic"
      subtitle="Every clinic on Astrale signs in at an address of its own. Type your clinic’s name as it appears in that address."
      below={<AddressHelp />}
    >
      <ClinicAddressForm initial="" current={null} />
    </AuthSplit>
  );
}

/* ---- shared by the two screens above ------------------------------------------ */

/** Who to ask, folded away like the sign-in screen's own note. */
function AddressHelp() {
  const [open, setOpen] = React.useState(false);
  const { data: support } = useSupportInfo();
  const email = support?.support_email ?? "";
  const phone = support?.support_phone ?? "";

  return (
    <div className="mt-6 text-center">
      <AuthLink muted onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Don&rsquo;t know your clinic&rsquo;s address?
      </AuthLink>
      {open && (
        <AuthNote>
          Your clinic&rsquo;s administrator can tell you. Astrale support can also find it for you
          {email && (
            <>
              {" at "}
              <a href={`mailto:${email}`} className="font-medium text-accent underline-offset-4 hover:underline">
                {email}
              </a>
            </>
          )}
          {phone && (
            <>
              {email ? " or " : " on "}
              <a href={telHref(phone)} className="tnum font-medium text-accent underline-offset-4 hover:underline">
                {phone}
              </a>
            </>
          )}
          .
        </AuthNote>
      )}
    </div>
  );
}

/**
 * Reduce whatever was typed or pasted to the one label that names a clinic:
 * `https://northgate.example.com/login` and `Northgate` both become
 * `northgate`.
 */
function clinicLabel(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[./:?#\s]/)[0]
    .replace(/[^a-z0-9-]/g, "");
}

/**
 * The address, with the clinic's part left open to type into. The rest of it
 * is printed beside the field rather than in it, so what somebody types is
 * only ever the part that differs between clinics.
 */
function ClinicAddressForm({ initial, current }: { initial: string; current: string | null }) {
  const { host } = useApp();
  const [value, setValue] = React.useState(initial);
  const [problem, setProblem] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const suffix = `.${host.root}${host.port ? `:${host.port}` : ""}`;

  /* on the wrong-address page the misspelt name is already in the field,
     selected, so typing replaces it and an arrow key edits it */
  React.useEffect(() => {
    if (initial) inputRef.current?.select();
  }, [initial]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const slug = clinicLabel(value);
    setValue(slug);

    if (!slug) return setProblem("Type your clinic\u2019s name as it appears in its address.");
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      return setProblem("A clinic\u2019s address uses only letters, numbers and hyphens, and cannot start or end with a hyphen.");
    }
    if (RESERVED_SUBDOMAINS.has(slug)) return setProblem("That address belongs to the platform, not to a clinic.");
    if (slug === current) return setProblem("That is the address you are on, and no clinic uses it.");

    setProblem(null);
    window.location.assign(tenantUrl(slug, host, "/login"));
  }

  return (
    <form onSubmit={submit} noValidate className="mt-8 space-y-5">
      <div>
        <label htmlFor="clinic-address" className="mb-2 block text-label font-medium text-ink">
          Clinic address
        </label>
        <div
          onClick={() => inputRef.current?.focus()}
          className={cn(
            "flex h-[54px] cursor-text items-center rounded-[var(--r-lg)] border bg-surface pr-4",
            "transition-[border-color,box-shadow] duration-150 ease-[var(--ease-brand)]",
            problem
              ? "border-critical focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--critical)_18%,transparent)]"
              : "border-line-strong focus-within:border-focus focus-within:shadow-[var(--focus-ring)]",
          )}
        >
          <span className="flex w-12 shrink-0 items-center justify-center text-ink-3" aria-hidden>
            <GlyphGlobe />
          </span>
          {/* the field is exactly as wide as what is in it, so the rest of the
              address follows straight on, the way it reads in the address bar */}
          <span className="grid h-full min-w-0 shrink">
            <span
              className={cn(
                "invisible col-start-1 row-start-1 self-center whitespace-pre pr-0.5 text-[16px]",
                value ? "font-medium" : "font-normal",
              )}
              aria-hidden
            >
              {value || "your-clinic"}
            </span>
            <input
              ref={inputRef}
              id="clinic-address"
              value={value}
              onChange={(e) => {
                setValue(clinicLabel(e.target.value));
                setProblem(null);
              }}
              placeholder="your-clinic"
              size={1}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? "clinic-address-error" : undefined}
              className={cn(
                "col-start-1 row-start-1 h-full w-full min-w-0 bg-transparent text-[16px] font-medium text-ink",
                "focus:outline-none placeholder:font-normal placeholder:text-ink-placeholder",
              )}
            />
          </span>
          <span className="min-w-0 shrink-[2] truncate text-[16px] text-ink-3" aria-hidden>
            {suffix}
          </span>
        </div>
        {problem && (
          <p id="clinic-address-error" className="mt-1.5 text-caption leading-snug text-critical-text">
            {problem}
          </p>
        )}
      </div>
      <SubmitButton busy={false}>Continue to sign in</SubmitButton>
    </form>
  );
}

function GlyphGlobe() {
  return (
    <svg
      width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18a14 14 0 0 1 0-18Z" />
    </svg>
  );
}
