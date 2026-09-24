"use client";

import * as React from "react";
import Link from "next/link";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useAnalytics, useClinicDb } from "@/lib/query/hooks";
import {
  lowStock, nearExpiry, selectAppointments,
  selectLabOrders, selectQueue, 
} from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { modulePath } from "@/lib/nav";
import {
  compactCurrency, currency, duration, formatDate, formatTime12, pluralise, weekdayShort,
} from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, Numeral } from "@/components/ui/badge";
import { EmptyState, KV, Meter } from "@/components/ui/misc";
import { LineChart } from "@/components/charts/line-chart";
import { BarChart, RankBar } from "@/components/charts/bar-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { StatusPill } from "@/components/domain/status";
import { PatientChip, PatientRef } from "@/components/domain/patient";
import { AppointmentModal, WalkInModal } from "@/components/domain/quick-actions";
import {
  IconAlert, IconArrowRight, IconBox, IconCalendar, IconChart, IconClock, IconFlask, IconPill,
  IconPlus, IconQueue, IconReceipt, IconSpark, IconStethoscope, IconUsers
} from "@/components/ui/icons";

export default function DashboardPage() {
  const { session, today, hasFeature, config } = useApp();
  const db = useClinicDb();
  const { tenant, user } = useTenant();
  const t = session.tenantId;

  const [walkIn, setWalkIn] = React.useState(false);
  const [booking, setBooking] = React.useState(false);

  /* §3.14 — one request, aggregated in the database. The panels that appear are
     the ones the API sent, which are the ones this clinic pays for. */
  const { data: analytics } = useAnalytics(14);
  const m = analytics?.core;
  const visits = m?.visits_series ?? [];
  const attendance = (m?.attendance_series ?? []).slice(-7);
  const funnel = m?.queue_funnel ?? [];
  const diagnoses = (m?.top_diagnoses ?? []).slice(0, 5);
  const money = analytics?.modules.billing;
  const pharm = analytics?.modules.pharmacy;
  const lab = analytics?.modules.lab;

  const queue = selectQueue(db, t);
  const board = queue
    .filter((q) => q.status === "waiting" || q.status === "called" || q.status === "in_consultation")
    .sort((a, b) => (a.priority === b.priority ? a.token_no - b.token_no : a.priority === "urgent" ? -1 : 1));

  const upcoming = selectAppointments(db, t)
    .filter((a) => a.date === today && (a.status === "scheduled" || a.status === "checked_in"))
    .sort((a, b) => a.time.localeCompare(b.time))
    .slice(0, 5);

  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  /* the attention list — anything that needs a human before the day ends */
  const attention = React.useMemo(() => {
    const rows: Array<{ id: string; tone: "critical" | "warn" | "info"; title: string; detail: string; href: string }> = [];
    for (const a of selectAppointments(db, t).filter((x) => x.date === today && x.status === "no_show")) {
      rows.push({ id: `ns-${a.id}`, tone: "critical", title: `${a.patient_name} did not arrive`,
        detail: `${formatTime12(a.time)} · ${a.reason}`, href: "/appointments" });
    }
    if (hasFeature("lab")) {
      for (const l of selectLabOrders(db, t).filter((x) => x.status === "resulted")) {
        rows.push({ id: `lb-${l.id}`, tone: "warn", title: `${l.test_name} awaits verification`,
          detail: `${l.patient_name} · results held until signed off`, href: "/lab" });
      }
    }
    if (hasFeature("inventory")) {
      for (const s of lowStock(db, t).slice(0, 3)) {
        rows.push({ id: `ls-${s.item.id}`, tone: "warn", title: `${s.item.name} below reorder level`,
          detail: `${s.level} ${s.item.unit} on hand · reorder at ${s.item.reorder_level}`, href: "/inventory" });
      }
      for (const b of nearExpiry(db, t, today, config.expiry_alert_days).slice(0, 2)) {
        rows.push({ id: `ex-${b.batch_no}`, tone: "critical", title: `Batch ${b.batch_no} expires soon`,
          detail: `${b.item.name} · ${b.daysLeft <= 0 ? "expired" : `${b.daysLeft} days left`}`, href: "/inventory" });
      }
    }
    if (money && money.unpaid > 0) {
      rows.push({ id: "bill", tone: "info", title: `${pluralise(money.unpaid, "invoice")} unpaid`,
        detail: `${currency(money.outstanding)} outstanding across the ledger`, href: "/billing" });
    }
    if (pharm && pharm.prescriptions_waiting > 0) {
      rows.push({ id: "rx", tone: "info", title: `${pluralise(pharm.prescriptions_waiting, "prescription")} waiting at the counter`,
        detail: "Dispense draws stock from the inventory ledger", href: "/pharmacy" });
    }
    return rows.slice(0, 7);
  }, [db, t, today, hasFeature, money, pharm, config]);

  const hour = 10;
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today, "day")}
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`${tenant.name} runs the ${clinical.label.toLowerCase()} workflow. ${clinical.blurb}`}
        actions={
          <>
            <ButtonLink href="/patients/new" variant="primary">
              <IconUsers size={15} /> Add patient
            </ButtonLink>
            <Button variant="primary" onClick={() => setWalkIn(true)}>
              <IconPlus size={15} /> Walk-in
            </Button>
            <Button variant="primary" onClick={() => setBooking(true)}>
              <IconCalendar size={15} /> Book appointment
            </Button>
          </>
        }
      />

      {/* ---- the numbers ---- */}
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="In the waiting room"
          value={(m?.waiting_now ?? 0) + (m?.in_consultation ?? 0)}
          hint={`${m?.waiting_now ?? 0} waiting · ${m?.in_consultation ?? 0} in consultation`}
          tone="accent"
          icon={<IconQueue size={16} />}
        />
        <Stat
          label="Appointments today"
          value={m?.appointments_today ?? 0}
          hint={`${m?.completed_today ?? 0} seen · ${m?.no_shows ?? 0} no-show`}
          icon={<IconCalendar size={16} />}
          trend={visits.slice(-7).map((v) => v.value)}
        />
        <Stat
          label="Average wait"
          value={m?.avg_wait_minutes ?? 0}
          unit="min"
          hint={`Longest ${duration(m?.max_wait_minutes ?? 0)}`}
          tone={(m?.avg_wait_minutes ?? 0) > 25 ? "warn" : "ok"}
          icon={<IconClock size={16} />}
        />
        {money ? (
          <Stat
            label="Collected"
            value={compactCurrency(money.paid)}
            hint={`${currency(money.outstanding)} still outstanding`}
            tone="ok"
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

      {/* ---- main grid ---- */}
      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          {/* live board */}
          <Card>
            <CardHeader
              icon={<IconQueue size={16} />}
              title="On the board now"
              hint="Tokens issued today, urgent first, then in sequence."
              actions={<ButtonLink href="/queue" variant="ghost" size="sm">Open queue <IconArrowRight size={14} /></ButtonLink>}
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
                /* the day spine — accent rule with each token hung off it */
                <ol className="relative space-y-2 pl-8">
                  <span className="absolute bottom-2 left-[15px] top-2 w-px bg-accent-border" aria-hidden />
                  {board.slice(0, 6).map((q) => {
                    return (
                      <li key={q.id} className="relative">
                        <span className="absolute -left-8 top-1.5 flex h-8 w-8 items-center justify-center">
                          <Numeral tone={q.priority === "urgent" ? "accent" : "neutral"} size="sm">
                            {String(q.token_no).padStart(2, "0")}
                          </Numeral>
                        </span>
                        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
                          <div className="min-w-0">
                            <PatientRef id={q.patient_id} name={q.patient_name} href={`/patients/${q.patient_id}`} sub={q.reason} />
                          </div>
                          <div className="flex shrink-0 items-center gap-2.5">
                            {q.priority === "urgent" && <Badge tone="critical" size="sm">Urgent</Badge>}
                            <span className="tnum hidden font-mono text-caption text-ink-3 sm:inline">
                              in {q.checked_in_at}
                            </span>
                            <StatusPill kind="queue" status={q.status} size="sm" pulse={q.status === "in_consultation"} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardBody>
          </Card>

          {/* volume */}
          <Card>
            <CardHeader
              icon={<IconChart size={15} />} tone="accent" title="Visits, last fourteen days"
              hint="Completed appointments and walk-in encounters, per day."
              actions={<Badge tone="neutral" size="sm">{visits.reduce((s, v) => s + v.value, 0)} total</Badge>}
            />
            <CardBody className="pt-1">
              <LineChart
                labels={visits.map((v) => weekdayShort(v.date))}
                series={[{ name: "Visits", values: visits.map((v) => v.value) }]}
                height={190}
                yLabel="visits per day"
              />
            </CardBody>
          </Card>

          {/* attendance */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader icon={<IconChart size={15} />} tone="accent" title="Attendance" hint="How the week's bookings resolved." />
              <CardBody className="pt-1">
                <BarChart
                  labels={attendance.map((a) => weekdayShort(a.date))}
                  series={[
                    { name: "Kept", values: attendance.map((a) => a.kept) },
                    { name: "No show", values: attendance.map((a) => a.missed) },
                    { name: "Cancelled", values: attendance.map((a) => a.cancelled) },
                  ]}
                  stacked
                  height={190}
                  highlight={attendance.length - 1}
                />
              </CardBody>
            </Card>

            <Card>
              <CardHeader icon={<IconChart size={15} />} tone="accent" title="Most recorded diagnoses" hint="Straight off the encounter rows." />
              <CardBody className="pt-1">
                {diagnoses.length ? (
                  <RankBar rows={diagnoses} format={(n) => `${n}`} />
                ) : (
                  <EmptyState compact icon={<IconStethoscope size={20} />} title="No encounters yet" body="Diagnoses appear here once consultations are signed." />
                )}
              </CardBody>
            </Card>
          </div>
        </div>

        {/* ---- right column ---- */}
        <div className="space-y-5">
          <Card>
            <CardHeader
              tone="warn" icon={<IconAlert size={16} />}
              title="Needs attention"
              hint="Composed from every module this clinic has switched on."
            />
            <CardBody className="pt-0">
              {attention.length === 0 ? (
                <EmptyState compact icon={<IconSpark size={20} />} title="Nothing outstanding"
                            body="No missed appointments, unverified results, low stock or unpaid invoices." />
              ) : (
                <ul className="space-y-1.5">
                  {attention.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={a.href}
                        className="group flex items-start gap-2.5 rounded-[var(--r)] px-2.5 py-2 transition-colors hover:bg-hover"
                      >
                        <span
                          className={[
                            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
                            a.tone === "critical" ? "bg-critical" : a.tone === "warn" ? "bg-warn" : "bg-info",
                          ].join(" ")}
                          aria-hidden
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-label font-medium text-ink">{a.title}</span>
                          <span className="block truncate text-caption text-ink-3">{a.detail}</span>
                        </span>
                        <IconArrowRight size={14} className="mt-1 shrink-0 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconCalendar size={15} />} tone="violet" title="Next in the diary" hint="Still to arrive today."
                        actions={<ButtonLink href="/appointments" variant="ghost" size="sm">All <IconArrowRight size={14} /></ButtonLink>} />
            <CardBody className="pt-0">
              {upcoming.length === 0 ? (
                <EmptyState compact icon={<IconCalendar size={20} />} title="Nothing left today"
                            body="Every booked patient has arrived or been closed off." />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {upcoming.map((a) => {
                    return (
                      <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                        <span className="tnum w-14 shrink-0 font-mono text-label font-medium text-ink">
                          {formatTime12(a.time)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <PatientRef id={a.patient_id} name={a.patient_name} size="sm" href={`/patients/${a.patient_id}`} sub={a.reason} />
                        </span>
                        <StatusPill kind="appointment" status={a.status} size="sm" dot={false} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* queue funnel */}
          <Card>
            <CardHeader
              icon={<IconQueue size={15} />} tone="accent" title="Today's tokens"
              subtitle={`${m?.wait_samples ?? 0} measured · average consult ${duration(m?.avg_consultation_minutes ?? 0)}`}
            />
            <CardBody className="pt-1 space-y-3">
              {funnel.map((f, i) => (
                <div key={f.label}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-label text-ink">{f.label}</span>
                    <span className="tnum font-mono text-label font-medium text-ink-2">{f.value}</span>
                  </div>
                  <Meter
                    value={f.value}
                    max={Math.max(1, ...funnel.map((x) => x.value))}
                    tone={i === 4 ? "critical" : i === 3 ? "ok" : i === 0 ? "warn" : "accent"}
                  />
                </div>
              ))}
            </CardBody>
          </Card>

          {/* feature-conditional panels — §3.14 */}
          {money && money.revenue_mix.length > 0 && (
            <Card>
              <CardHeader tone="ok" icon={<IconReceipt size={16} />} title="Revenue mix" hint="Billed value by line-item source." />
              <CardBody className="pt-1">
                <DonutChart
                  slices={money.revenue_mix}
                  centreValue={compactCurrency(money.billed)}
                  centreLabel="billed"
                  format={(n) => compactCurrency(n)}
                  size={140}
                  thickness={20}
                />
              </CardBody>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-1">
            {pharm && (
              <Card>
                <CardHeader tone="ok" icon={<IconPill size={16} />} title="Pharmacy" hint="From the dispense ledger." />
                <CardBody className="pt-1">
                  <dl className="grid grid-cols-2 gap-x-4">
                    <KV label="Units out" value={<span className="tnum font-mono">{pharm.dispensed_units}</span>} />
                    <KV label="Value" value={<span className="tnum font-mono">{currency(pharm.dispensed_value)}</span>} />
                    <KV label="At the counter" value={pharm.prescriptions_waiting} />
                    <KV label="Fully dispensed" value={pharm.fully_dispensed} />
                  </dl>
                </CardBody>
              </Card>
            )}

            {lab && (
              <Card>
                <CardHeader tone="info" icon={<IconFlask size={16} />} title="Lab" hint="Orders by state." />
                <CardBody className="pt-1">
                  <Legend>Pipeline</Legend>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { l: "Ordered", v: lab.ordered }, { l: "Pending", v: lab.pending },
                      { l: "Resulted", v: lab.resulted }, { l: "Verified", v: lab.verified },
                    ].map((s) => (
                      <div key={s.l} className="rounded-[var(--r)] border border-line bg-surface-2 py-2.5">
                        <p className="tnum font-mono text-title font-semibold text-ink">{s.v}</p>
                        <p className="mt-0.5 text-micro text-ink-3">{s.l}</p>
                      </div>
                    ))}
                  </div>
                  {lab.abnormal > 0 && (
                    <p className="mt-3 flex items-center gap-1.5 text-caption text-critical-text">
                      <IconAlert size={13} /> {pluralise(lab.abnormal, "order")} with a flagged analyte.
                    </p>
                  )}
                </CardBody>
              </Card>
            )}

            {!hasFeature("pharmacy") && !hasFeature("lab") && !hasFeature("billing") && (
              <Card className="border-dashed">
                <CardBody className="pt-5">
                  <EmptyState
                    compact
                    icon={<IconBox size={20} />}
                    title="Core modules only"
                    body="Pharmacy, lab, inventory and billing are not enabled for this clinic. The core loop works without them."
                    action={<ButtonLink href={modulePath("pharmacy")} size="sm" variant="secondary">See what they do</ButtonLink>}
                  />
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      </div>

      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} />
      <AppointmentModal open={booking} onClose={() => setBooking(false)} />
    </>
  );
}
