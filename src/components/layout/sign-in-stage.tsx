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
        <p className="tnum font-mono text-[0.75rem] uppercase tracking-[0.16em] text-accent-hover">No such clinic</p>
        <h1 className="mt-3 font-display text-[2rem] font-semibold leading-tight tracking-[-0.03em]">
          Nothing is served at{" "}
          <span className="tnum font-mono text-[1.5rem] text-accent-hover">{slug}</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-stage-dim">
          That subdomain does not belong to a clinic on this platform. Check the address, or open the console to see
          every clinic and create a new one.
        </p>
        <a
          href={consoleUrl()}
          className="mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--r)] bg-stage-ink px-4 text-[0.875rem] font-medium text-stage transition-opacity hover:opacity-90"
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
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.03em]">{name} is suspended</h1>
        <p className="mx-auto mt-4 max-w-md text-[0.9375rem] leading-relaxed text-stage-dim">
          The platform has paused this clinic, so nobody can sign in and no data is served. Reactivating it in the
          console brings the subdomain straight back.
        </p>
        <a
          href={consoleUrl()}
          className={cn(
            "mt-6 inline-flex h-10 items-center gap-2 rounded-[var(--r)] bg-stage-ink px-4",
            "text-[0.875rem] font-medium text-stage transition-opacity hover:opacity-90",
          )}
        >
          Platform console <IconArrowRight size={15} />
        </a>
      </div>
    </div>
  );
}
