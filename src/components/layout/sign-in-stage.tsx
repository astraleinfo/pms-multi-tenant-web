"use client";

import { cn } from "@/lib/cn";
import { useApp } from "@/lib/store/app-store";
import { IconArrowRight, IconShield } from "@/components/ui/icons";

/** A subdomain nobody has claimed. */
export function UnknownTenantStage({ slug }: { slug: string | null }) {
  const { consoleUrl } = useApp();
  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-stage px-6 text-stage-ink">
      <div className="fixed inset-0 -z-10 bg-stage" aria-hidden />
      <div className="max-w-lg text-center">
        <p className="tnum font-mono text-caption uppercase tracking-[0.16em] text-accent-hover">No such clinic</p>
        <h1 className="mt-3 font-display text-display-lg font-semibold leading-tight text-stage-ink">
          Nothing is served at{" "}
          <span className="tnum font-mono text-h2 text-accent-hover">{slug}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-stage-dim">
          That subdomain does not belong to a clinic on this platform. Check the address, or open the console to see
          every clinic and create a new one.
        </p>
        <a
          href={consoleUrl()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--r)] bg-stage-ink px-4 text-body font-medium text-stage transition-[filter] hover:brightness-110"
        >
          Platform console <IconArrowRight size={15} />
        </a>
      </div>
    </div>
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
 * Before the console moved to `admin.<root>`, this address served it. It no
 * longer does — and the API refuses `/platform/*` here — so rendering the
 * console would produce a screen that cannot talk to anything. Saying where
 * the two doors are is more use than a redirect into either.
 */
export function ApexStage() {
  const { host, consoleUrl } = useApp();
  const root = `${host.root}${host.port ? `:${host.port}` : ""}`;

  return (
    <div className="relative flex min-h-dvh items-center justify-center bg-stage px-6 text-stage-ink">
      <div className="fixed inset-0 -z-10 bg-stage" aria-hidden />
      <div className="max-w-lg text-center">
        <span
          className="mx-auto flex h-11 w-11 items-center justify-center rounded-[13px] bg-accent text-accent-ink"
          aria-hidden
        >
          <IconShield size={20} />
        </span>
        <h1 className="mt-5 font-display text-display-lg font-semibold leading-tight text-stage-ink">
          Astrale Practice OS
        </h1>
        <p className="mx-auto mt-4 max-w-md text-body leading-relaxed text-stage-dim">
          Every clinic is served on its own address, and the tenant is that address — there is
          no clinic selector to get wrong. Sign in at{" "}
          <span className="tnum font-mono text-body text-stage-ink">
            your-clinic.{root}
          </span>
          .
        </p>
        <a
          href={consoleUrl()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--r)] bg-stage-ink px-4 text-body font-medium text-stage transition-[filter] hover:brightness-110"
        >
          Super-admin console <IconArrowRight size={15} />
        </a>
        <p className="tnum mt-3 font-mono text-caption text-stage-dim">admin.{root}</p>
      </div>
    </div>
  );
}
