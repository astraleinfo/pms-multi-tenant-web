"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb, useAnalytics } from "@/lib/query/hooks";
import { selectAppointments, selectQueue, userName } from "@/lib/data/repository";
import { duration, formatDate, formatTime12, minutesBetween, pluralise } from "@/lib/format";
import type { QueueEntry } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, Segmented } from "@/components/ui/button";
import { Badge, Numeral } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/misc";
import { Stat } from "@/components/ui/stat";
import { FeatureGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { WalkInModal } from "@/components/domain/quick-actions";
import {
  IconCalendar, IconCheck, IconMonitor, IconPlay, IconPlus, IconQueue, IconStethoscope, IconX,
} from "@/components/ui/icons";

type Filter = "live" | "all" | "closed";

export default function QueuePage() {
  return (
    <FeatureGate feature="queue">
      <QueueBoard />
    </FeatureGate>
  );
}

const ORDER: Record<QueueEntry["status"], number> = {
  in_consultation: 0, called: 1, waiting: 2, completed: 3, no_show: 4, cancelled: 5,
};

function QueueBoard() {
  const { session, today, config, setQueueStatus, checkIn, notify } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  const [filter, setFilter] = React.useState<Filter>("live");
  const [walkIn, setWalkIn] = React.useState(false);

  const queue = selectQueue(db, t);
  /* Wait and consultation minutes are measured in the database, over the same
     window every other screen quotes. */
  const { data: analytics } = useAnalytics(30);
  const timings = analytics?.core;

  const counts = {
    waiting: queue.filter((q) => q.status === "waiting").length,
    called: queue.filter((q) => q.status === "called").length,
    inConsult: queue.filter((q) => q.status === "in_consultation").length,
    completed: queue.filter((q) => q.status === "completed").length,
  };

  const shown = queue
    .filter((q) => filter === "all"
      ? true
      : filter === "live"
        ? ["waiting", "called", "in_consultation"].includes(q.status)
        : ["completed", "no_show", "cancelled"].includes(q.status))
    .sort((a, b) => {
      const s = ORDER[a.status] - ORDER[b.status];
      if (s !== 0) return s;
      /* whether urgent jumps the queue is a per-clinic setting */
      if (config.urgent_first && a.priority !== b.priority) return a.priority === "urgent" ? -1 : 1;
      return a.token_no - b.token_no;
    });

  /* appointments booked for today that have not produced a queue entry yet */
  const arrivals = selectAppointments(db, t)
    .filter((a) => a.date === today && a.status === "scheduled")
    .sort((a, b) => a.time.localeCompare(b.time));

  const move = (q: QueueEntry, status: QueueEntry["status"], msg: string) => {
    setQueueStatus(q.id, status);
    notify({ tone: status === "no_show" ? "warn" : "ok", title: msg, body: `Token ${String(q.token_no).padStart(2, "0")}.` });
  };

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today, "day")}
        title="Queue"
        description="Everyone checked in today, in the order they will be seen. Booked patients and walk-ins share one board."
        actions={
          <>
            <ButtonLink href="/display" variant="secondary" target="_blank">
              <IconMonitor size={15} /> Waiting room screen
            </ButtonLink>
            <Button variant="primary" onClick={() => setWalkIn(true)}>
              <IconPlus size={15} /> Walk-in
            </Button>
          </>
        }
      />

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting" value={counts.waiting} tone={counts.waiting ? "warn" : "ink"} icon={<IconQueue size={16} />}
              hint={counts.waiting ? `Longest wait ${duration((timings?.max_wait_minutes ?? 0))}` : "Nobody in the room"} />
        <Stat label="Called" value={counts.called} icon={<IconPlay size={16} />}
              hint="Announced, not yet seated" />
        <Stat label="In consultation" value={counts.inConsult} icon={<IconStethoscope size={16} />}
              hint={`Average ${duration((timings?.avg_consultation_minutes ?? 0))} per visit`} />
        <Stat label="Seen today" value={counts.completed} icon={<IconCheck size={16} />}
              hint={`Average wait ${(timings?.avg_wait_minutes ?? 0)} min`} />
      </section>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card data-tour="queue-board">
          <CardHeader
            icon={<IconQueue size={15} />} tone="accent" title="The board"
            hint="Urgent tokens float above routine ones inside each state."
            actions={
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "live", label: "Live" },
                  { value: "closed", label: "Closed" },
                  { value: "all", label: "All" },
                ]}
              />
            }
          />
          <CardBody className="pt-0">
            {shown.length === 0 ? (
              <EmptyState
                icon={<IconQueue size={20} />}
                title={filter === "live" ? "Nobody is waiting" : "Nothing here yet"}
                body="Check in a booked patient from the arrivals list beside this one, or issue a walk-in token from the button above."
              />
            ) : (
              /* the day spine */
              <ol className="relative space-y-2.5 pl-11">
                <span className="absolute bottom-3 left-[21px] top-3 w-px bg-accent-border" aria-hidden />
                {shown.map((q) => {
                  const waited = minutesBetween(q.checked_in_at, q.called_at);
                  const live = ["waiting", "called", "in_consultation"].includes(q.status);
                  return (
                    <li key={q.id} className="relative">
                      <span className="absolute -left-11 top-3.5 flex w-11 justify-center">
                        <Numeral tone={q.priority === "urgent" ? "accent" : q.status === "in_consultation" ? "accent" : "neutral"}>
                          {String(q.token_no).padStart(2, "0")}
                        </Numeral>
                      </span>

                      <div className={[
                        "rounded-[var(--r)] border p-3 transition-colors",
                        q.status === "in_consultation"
                          ? "border-accent-border bg-accent-soft/45"
                          : live ? "border-line bg-surface" : "border-line-soft bg-surface-2",
                      ].join(" ")}>
                        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                          <div className="min-w-0">
                            <PatientRef id={q.patient_id} name={q.patient_name} href={`/patients/${q.patient_id}`} sub={q.reason} />
                          </div>
                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            {q.priority === "urgent" && <Badge tone="critical" size="sm">Urgent</Badge>}
                            {/* booked is the ordinary case; only the exception is marked */}
                            {!q.appointment_id && <Badge tone="neutral" size="sm">Walk-in</Badge>}
                            <StatusPill kind="queue" status={q.status} size="sm" pulse={q.status === "in_consultation"} />
                          </div>
                        </div>

                        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft pt-2.5">
                          <p className="tnum flex flex-wrap items-center gap-x-3 text-caption text-ink-3">
                            <span>Arrived {q.checked_in_at}</span>
                            {waited != null && waited >= 0 && <span>waited {waited} min</span>}
                            <span>{userName(db, q.doctor_id)}</span>
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5">
                            {q.status === "waiting" && (
                              <>
                                <Button size="sm" variant="primary" onClick={() => move(q, "called", "Patient called")}>
                                  Call now
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => move(q, "no_show", "Marked as no show")}>
                                  <IconX size={13} /> No show
                                </Button>
                              </>
                            )}
                            {q.status === "called" && (
                              <>
                                <Button size="sm" variant="primary" onClick={() => move(q, "in_consultation", "Consultation started")}>
                                  <IconPlay size={13} /> Start
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => move(q, "no_show", "Marked as no show")}>
                                  No show
                                </Button>
                              </>
                            )}
                            {q.status === "in_consultation" && (
                              <ButtonLink size="sm" variant="primary" href={`/consultations/new?queue=${q.id}`}>
                                <IconStethoscope size={13} /> Record encounter
                              </ButtonLink>
                            )}
                            {q.status === "completed" && (
                              /* the patient's name on this row is already a
                                 link to exactly this page */
                              <span className="text-caption text-ink-3">Seen</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </CardBody>
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader
              icon={<IconCalendar size={15} />} tone="violet" title="Expected to arrive"
              hint={`${pluralise(arrivals.length, "booking")} today with nobody checked in yet.`}
            />
            <CardBody className="pt-0">
              {arrivals.length === 0 ? (
                <EmptyState compact icon={<IconCheck size={20} />} title="Everyone has arrived"
                            body="Every booking for today has been checked in, closed or marked absent." />
              ) : (
                <ul className="divide-y divide-line-soft">
                  {arrivals.map((a) => {
                    return (
                      <li key={a.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <span className="tnum w-14 shrink-0 font-mono text-label font-medium text-ink">
                          {formatTime12(a.time)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <PatientRef id={a.patient_id} name={a.patient_name} size="sm" href={`/patients/${a.patient_id}`} sub={a.reason} />
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            checkIn(a.id);
                            notify({ tone: "ok", title: "Checked in", body: "A token was issued and the board updated." });
                          }}
                        >
                          Check in
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>

        </div>
      </div>

      <WalkInModal open={walkIn} onClose={() => setWalkIn(false)} />
    </>
  );
}
