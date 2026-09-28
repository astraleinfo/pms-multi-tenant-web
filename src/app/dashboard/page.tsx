"use client";

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useAnalytics, useClinicDb } from "@/lib/query/hooks";
import {
  lowStock, nearExpiry, selectAppointments, selectLabOrders, selectQueue,
} from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { compactCurrency, currency, duration, formatDate, formatTime12, pluralise } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, CardLink } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Numeral } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { AppointmentModal, WalkInModal } from "@/components/domain/quick-actions";
import {
  IconAlert, IconArrowRight, IconBox, IconCalendar, IconChart, IconClock, IconFlask, IconPill,
  IconPlus, IconQueue, IconReceipt, IconSpark, IconStethoscope, IconUsers
} from "@/components/ui/icons";

/* ==========================================================================
   The clinic's home screen: today, and only today.

   It used to carry thirteen panels — the live board and the diary, but also
   three charts, a funnel, a revenue donut and a pharmacy and lab summary —
   and read like a control room. The people who land here are about to see a
   patient, so it now answers three questions and stops: how is the room,
   who is on the board and next in the diary, and what needs a person before
   the day ends. The trends live on Reports, one link away.
   ========================================================================== */

export default function DashboardPage() {
  const { session, today, hasFeature, config } = useApp();
  const db = useClinicDb();
  const { tenant, user, role } = useTenant();
  const t = session.tenantId;

  const [walkIn, setWalkIn] = React.useState(false);
  const [booking, setBooking] = React.useState(false);

  /* §3.14 — one request, aggregated in the database. */
  const { data: analytics } = useAnalytics(14);
  const m = analytics?.core;
  const visits = m?.visits_series ?? [];
  const money = analytics?.modules.billing;
  const pharm = analytics?.modules.pharmacy;

  const queue = selectQueue(db, t);
  const board = queue
    .filter((q) => q.status === "waiting" || q.status === "called" || q.status === "in_consultation")
    .sort((a, b) => (a.priority === b.priority ? a.token_no - b.token_no : a.priority === "urgent" ? -1 : 1));

  const upcoming = selectAppointments(db, t)
    .filter((a) => a.date === today && (a.status === "scheduled" || a.status === "checked_in"))
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 5);

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const seesReports = role === "tenant_admin" || role === "doctor";

  /* The attention list — anything that needs a human before the day ends.
     Stock and expiry used to arrive as one row per item, which on a normal
     Tuesday is five rows about gutta percha; they are now one line each, and
     the inventory page has the itemised list. */
  const attention = React.useMemo(() => {
    const rows: Array<{ id: string; tone: "critical" | "warn" | "info"; title: string; detail: string; href: string }> = [];
    for (const a of selectAppointments(db, t).filter((x) => x.date === today && x.status === "no_show")) {
      rows.push({ id: `ns-${a.id}`, tone: "critical", title: `${a.patient_name} did not arrive`,
        detail: `${formatTime12(a.time)} · ${a.reason}`, href: "/appointments" });
    }
    if (hasFeature("lab")) {
      const waiting = selectLabOrders(db, t).filter((x) => x.status === "resulted");
      if (waiting.length) {
        rows.push({ id: "lab", tone: "warn",
          title: `${pluralise(waiting.length, "lab result")} to verify`,
          detail: waiting.length === 1
            ? `${waiting[0].test_name} · ${waiting[0].patient_name}`
            : `${waiting[0].test_name} and ${waiting.length - 1} more`,
          href: "/lab" });
      }
    }
    if (hasFeature("inventory")) {
      const low = lowStock(db, t);
      if (low.length) {
        rows.push({ id: "stock", tone: "warn",
          title: `${pluralise(low.length, "item")} running low`,
          detail: low.slice(0, 2).map((x) => x.item.name).join(", ") + (low.length > 2 ? "…" : ""),
          href: "/inventory" });
      }
      const expiring = nearExpiry(db, t, today, config.expiry_alert_days);
      if (expiring.length) {
        const soonest = Math.min(...expiring.map((b) => b.daysLeft));
        rows.push({ id: "expiry", tone: "critical",
          title: `${pluralise(expiring.length, "batch", "batches")} expiring soon`,
          detail: soonest <= 0 ? "At least one has already expired" : `The first in ${pluralise(soonest, "day")}`,
          href: "/inventory" });
      }
    }
    if (money && money.unpaid > 0) {
      rows.push({ id: "bill", tone: "info", title: `${pluralise(money.unpaid, "invoice")} unpaid`,
        /* the sum is the practice admin's; the count is everyone's work */
        detail: money.outstanding !== undefined ? `${currency(money.outstanding)} outstanding` : "Waiting for payment",
        href: "/billing" });
    }
    if (pharm && pharm.prescriptions_waiting > 0) {
      rows.push({ id: "rx", tone: "info", title: `${pluralise(pharm.prescriptions_waiting, "prescription")} at the counter`,
        detail: "Waiting to be dispensed", href: "/pharmacy" });
    }
    return rows;
  }, [db, t, today, hasFeature, money, pharm, config]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today, "day")}
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`${tenant.name} runs the ${clinical.label.toLowerCase()} workflow. ${clinical.blurb}`}
        actions={
          <>
            <ButtonLink href="/patients/new" variant="secondary">
              <IconUsers size={15} /> Add patient
            </ButtonLink>
            <Button variant="secondary" onClick={() => setBooking(true)}>
              <IconCalendar size={15} /> Book appointment
            </Button>
            <Button variant="primary" onClick={() => setWalkIn(true)}>
              <IconPlus size={15} /> Walk-in
            </Button>
          </>
        }
      />

      {/* ---- the numbers ---- */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat
          label="In the waiting room"
          value={(m?.waiting_now ?? 0) + (m?.in_consultation ?? 0)}
          hint={`${m?.in_consultation ?? 0} in consultation`}
          icon={<IconQueue size={16} />}
        />
        <Stat
          label="Appointments today"
          value={m?.appointments_today ?? 0}
          hint={`${m?.completed_today ?? 0} seen so far`}
          icon={<IconCalendar size={16} />}
        />
        <Stat
          label="Average wait"
          value={m?.avg_wait_minutes ?? 0}
          unit="min"
          hint={`Longest ${duration(m?.max_wait_minutes ?? 0)}`}
          tone={(m?.avg_wait_minutes ?? 0) > 25 ? "warn" : "ink"}
          icon={<IconClock size={16} />}
        />
        {/* The takings, for the practice admin; everyone else is shown the
            register instead — the server does not send them the money. */}
        {money && money.paid !== undefined ? (
          <Stat
            label="Collected"
            value={compactCurrency(money.paid)}
            hint={`${compactCurrency(money.outstanding ?? 0)} outstanding`}
            icon={<IconReceipt size={16} />}
          />
        ) : (
          <Stat
            label="Registered patients"
            value={m?.patients ?? 0}
            hint={`${m?.new_patients ?? 0} joined this month`}
            icon={<IconUsers size={16} />}
          />
        )}
      </section>

      {/* ---- today ---- */}
      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        {/* live board */}
        <Card>
          <CardHeader
            icon={<IconQueue size={16} />}
            title="On the board now"
            hint="Tokens issued today, urgent first, then in sequence."
            actions={<CardLink href="/queue" trailing={<IconArrowRight size={13} />}>Open queue</CardLink>}
          />
          <CardBody className="pt-0">
            {board.length === 0 ? (
              <EmptyState
                compact
                icon={<IconQueue size={20} />}
                title="The waiting room is empty"
                body="Check a booked patient in, or add a walk-in to issue the next token."
                action={<Button size="sm" onClick={() => setWalkIn(true)}><IconPlus size={14} /> Add walk-in</Button>}
              />
            ) : (
              <ul className="divide-y divide-line-soft">
                {board.slice(0, 6).map((q) => (
                  <li key={q.id} className="flex items-center gap-3.5 py-3 first:pt-1 last:pb-0">
                    <Numeral tone={q.priority === "urgent" ? "accent" : "neutral"} size="sm">
                      {String(q.token_no).padStart(2, "0")}
                    </Numeral>
                    <div className="min-w-0 flex-1">
                      <PatientRef id={q.patient_id} name={q.patient_name} href={`/patients/${q.patient_id}`} sub={q.reason} />
                    </div>
                    {q.priority === "urgent" && <Badge tone="critical" size="sm">Urgent</Badge>}
                    <StatusPill kind="queue" status={q.status} size="sm" pulse={q.status === "in_consultation"} />
                  </li>
                ))}
              </ul>
            )}
            {board.length > 6 && (
              <p className="mt-3 text-caption text-ink-3">
                and {pluralise(board.length - 6, "more token")} on the <Link href="/queue" className="text-accent-text hover:underline">queue</Link>
              </p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              tone={attention.length ? "warn" : "accent"} icon={<IconAlert size={16} />}
              title="Needs attention"
              hint="Anything that needs a person before the day ends, from every module this clinic has switched on."
            />
            <CardBody className="pt-0">
              {attention.length === 0 ? (
                <EmptyState compact icon={<IconSpark size={20} />} title="Nothing outstanding"
                            body="No missed appointments, results to verify, low stock or unpaid invoices." />
              ) : (
                <ul className="-mx-2.5 space-y-0.5">
                  {attention.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        className="group flex items-start gap-3 rounded-[var(--r)] px-2.5 py-2 transition-colors hover:bg-hover"
                      >
                        <span
                          className={cn(
                            "mt-[7px] h-2 w-2 shrink-0 rounded-full",
                            a.tone === "critical" ? "bg-critical" : a.tone === "warn" ? "bg-warn" : "bg-info",
                          )}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label font-medium text-ink">{a.title}</span>
                          <span className="block truncate text-caption text-ink-3">{a.detail}</span>
                        </span>
                        <IconArrowRight size={14} className="mt-1 shrink-0 text-ink-3 transition-colors group-hover:text-accent-text" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconCalendar size={15} />} title="Next in the diary" hint="Still to arrive today."
                        actions={<CardLink href="/appointments" trailing={<IconArrowRight size={13} />}>Diary</CardLink>} />
            <CardBody className="pt-0">
              {upcoming.length === 0 ? (
                <EmptyState compact icon={<IconCalendar size={20} />} title="Nothing left today"
                            body="Every booked patient has arrived or been closed off." />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {upcoming.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <span className="tnum w-16 shrink-0 text-label font-medium text-ink">
                        {formatTime12(a.time)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <PatientRef id={a.patient_id} name={a.patient_name} size="sm" href={`/patients/${a.patient_id}`} sub={a.reason} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* ---- the trends, one link away ---- */}
      {seesReports && (
        <Link
          href="/reports"
          className="group mt-6 flex items-center justify-between gap-4 rounded-[var(--r-lg)] border border-line bg-surface px-card py-3.5 transition-colors hover:border-line-strong"
        >
          <span className="flex min-w-0 items-center gap-3">
            <IconChart size={16} className="shrink-0 text-ink-3" />
            <span className="min-w-0">
              <span className="block text-label font-medium text-ink">Trends and reports</span>
              <span className="block truncate text-caption text-ink-3">
                {visits.reduce((sum, v) => sum + v.value, 0)} visits in the last fourteen days — attendance,
                diagnoses and revenue are on Reports.
              </span>
            </span>
          </span>
          <IconArrowRight size={15} className="shrink-0 text-ink-3 transition-colors group-hover:text-accent-text" />
        </Link>
      )}

      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} />
      <AppointmentModal open={booking} onClose={() => setBooking(false)} />
    </>
  );
}
