"use client";

import * as React from "react";
import Link from "next/link";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { selectQueue, userName } from "@/lib/data/repository";
import { formatDate } from "@/lib/format";
import { IconChevronLeft } from "@/components/ui/icons";

/**
 * The screen in the waiting room. No rail, no topbar, no patient names beyond
 * a first name and initial — it is a public display.
 */
export default function DisplayPage() {
  const { session, today } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const [clock, setClock] = React.useState("");

  /* The clock on the wall is the clinic's, not this browser's — a screen in a
     Manchester waiting room shows Manchester time wherever it is driven from. */
  React.useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tenant.timezone || undefined,
    }));
    tick();
    const id = setInterval(tick, 15_000);
    return () => clearInterval(id);
  }, [tenant.timezone]);

  const queue = selectQueue(db, session.tenantId);
  const nowServing = queue.filter((q) => q.status === "called" || q.status === "in_consultation")
    .sort((a, b) => a.token_no - b.token_no);
  const waiting = queue.filter((q) => q.status === "waiting")
    .sort((a, b) => (a.priority === b.priority ? a.token_no - b.token_no : a.priority === "urgent" ? -1 : 1));

  /* A first name and an initial, from the name the row already carries: the
     waiting room is a public screen, so it never sees more than that. */
  const shortName = (fullName: string) => {
    const [first, ...rest] = (fullName ?? "").split(/\s+/).filter(Boolean);
    if (!first) return "—";
    return `${first} ${rest.length ? rest[rest.length - 1][0] + "." : ""}`.trim();
  };

  return (
    <div className="relative min-h-dvh bg-stage px-6 py-8 text-stage-ink sm:px-10 sm:py-10">
      {/* the screen owns the whole viewport, whatever the content height */}
      <div className="fixed inset-0 -z-10 bg-stage" aria-hidden />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px 520px at 8% -10%, color-mix(in srgb, var(--stage-2) 90%, transparent), transparent 60%), " +
            "radial-gradient(700px 480px at 98% 105%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%)",
        }}
        aria-hidden
      />

      <div className="relative mx-auto max-w-6xl">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <p className="text-micro uppercase tracking-[0.2em] text-stage-dim">Now serving</p>
            <h1 className="mt-2 font-display text-[clamp(1.75rem,3.6vw,2.6rem)] font-semibold leading-none tracking-[-0.03em] text-stage-ink">
              {tenant.name}
            </h1>
          </div>
          <div className="text-right">
            <p className="tnum font-mono text-[clamp(1.75rem,3.6vw,2.6rem)] font-medium leading-none">{clock || "--:--"}</p>
            <p className="mt-2 text-label text-stage-dim">{formatDate(today, "day")}</p>
          </div>
        </header>

        {/* called */}
        <section className="mt-8">
          {nowServing.length === 0 ? (
            <div className="rounded-[var(--r-xl)] border border-white/10 bg-white/[0.03] px-8 py-16 text-center">
              <p className="font-display text-display font-semibold">No one is being called</p>
              <p className="mt-2 text-lead text-stage-dim">Please take a seat — you will be called by token number.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {nowServing.map((q) => (
                <div
                  key={q.id}
                  className="rise rounded-[var(--r-xl)] border border-accent/40 bg-accent/[0.12] p-7"
                >
                  <p className="text-micro uppercase tracking-[0.18em] text-accent-hover">
                    {q.status === "called" ? "Called" : "In consultation"}
                  </p>
                  <p className="tnum mt-3 font-mono text-[clamp(3.5rem,11vw,6rem)] font-semibold leading-none text-stage-ink">
                    {String(q.token_no).padStart(2, "0")}
                  </p>
                  <p className="mt-4 text-title font-medium">{shortName(q.patient_name)}</p>
                  <p className="mt-1 text-body text-stage-dim">{userName(db, q.doctor_id)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* waiting */}
        <section className="mt-10">
          <h2 className="text-micro uppercase tracking-[0.2em] text-stage-dim">Waiting</h2>
          {waiting.length === 0 ? (
            <p className="mt-4 text-lead text-stage-dim">The waiting room is clear.</p>
          ) : (
            <ul className="mt-4 flex flex-wrap gap-3">
              {waiting.map((q) => (
                <li
                  key={q.id}
                  className="min-w-[124px] rounded-[var(--r-lg)] border border-white/10 bg-white/[0.04] px-5 py-4"
                >
                  <p className="tnum font-mono text-display-lg font-semibold leading-none">
                    {String(q.token_no).padStart(2, "0")}
                  </p>
                  <p className="mt-2 text-body text-stage-dim">{shortName(q.patient_name)}</p>
                  {q.priority === "urgent" && (
                    <p className="mt-1 text-micro uppercase tracking-[0.12em] text-accent-hover">Priority</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <footer className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-6 text-label text-stage-dim">
          <p>Tokens are issued in arrival order. Urgent cases are seen first.</p>
          <Link href="/queue" className="inline-flex items-center gap-1.5 text-stage-ink underline-offset-4 hover:underline">
            <IconChevronLeft size={14} /> Back to the queue
          </Link>
        </footer>
      </div>
    </div>
  );
}
