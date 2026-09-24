"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useAppointmentPage, useClinicDb, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { selectAppointments, selectDoctors, userName } from "@/lib/data/repository";
import { addDays, daysBetween, formatDate, formatTime12, pluralise, relativeDay, toMinutes, weekdayShort } from "@/lib/format";
import type { Appointment } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, columnHelperFor } from "@/components/ui/data-table";
import { Card, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, Segmented } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Drawer } from "@/components/ui/modal";
import { Select } from "@/components/ui/field";
import { FeatureGate, RoleGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { AppointmentModal } from "@/components/domain/quick-actions";
import {
  IconArrowRight, IconCalendar, IconCheck, IconChevronLeft, IconChevronRight,
  IconClock, IconPlus, IconX,
} from "@/components/ui/icons";

const PAGE_SIZE = 10;

/** Column id → the sort key the API understands. Anything else is not sortable. */
const SORT_KEYS: Record<string, string> = {
  when: "when",
  reason: "reason",
  created_via: "created_via",
  status: "status",
};

const PX_PER_MIN = 1.15;
/* breathing room so the first hour label is not sliced by the container edge */
const TOP_PAD = 10;

const col = columnHelperFor<Appointment>();

const appointmentColumns = col.columns([
  col.accessor((a) => `${a.date} ${a.time}`, {
    id: "when",
    header: "When",
    cell: ({ row }) => (
      <>
        <span className="tnum block font-mono text-label text-ink">{formatDate(row.original.date)}</span>
        <span className="tnum block font-mono text-caption text-ink-3">{formatTime12(row.original.time)}</span>
      </>
    ),
  }),
  col.accessor((a) => a.patient_id, {
    id: "patient", header: "Patient", enableSorting: false,
    cell: ({ row }) => <ApptPatient appointment={row.original} />,
  }),
  col.accessor((a) => a.doctor_id, {
    id: "clinician", header: "Clinician", enableSorting: false,
    cell: ({ row }) => <ApptClinician id={row.original.doctor_id} />,
  }),
  col.accessor("reason", {
    header: "Reason",
    cell: ({ getValue }) => <span className="block max-w-[260px] truncate">{getValue()}</span>,
  }),
  col.accessor("created_via", {
    header: "Booked via",
    cell: ({ getValue }) => <span className="text-ink-3">{getValue().replace("_", " ")}</span>,
  }),
  col.accessor("status", {
    header: "Status", meta: { align: "right" },
    cell: ({ getValue }) => <StatusPill kind="appointment" status={getValue()} size="sm" dot={false} />,
  }),
]);

function ApptPatient({ appointment }: { appointment: Appointment }) {
  /* The row already names its patient — see PatientRef. */
  return (
    <PatientRef
      id={appointment.patient_id}
      name={appointment.patient_name}
      mrn={appointment.patient_mrn}
      size="sm"
    />
  );
}

function ApptClinician({ id }: { id: string }) {
  const { data: users = [] } = useUsers();
  return <span className="text-ink-2">{users.find((u) => u.id === id)?.name ?? "—"}</span>;
}

export default function AppointmentsPage() {
  return (
    <RoleGate allow={["receptionist", "doctor"]}>
      <FeatureGate feature="appointment">
        <Appointments />
      </FeatureGate>
    </RoleGate>
  );
}

function Appointments() {
  const { session, today, config, setAppointmentStatus, checkIn, notify } = useApp();
  const db = useClinicDb();
  const t = session.tenantId;
  /* the grid spans the clinic's configured working day, rounded to the hour */
  const DAY_START = Math.floor(toMinutes(config.day_start) / 60) * 60;
  const DAY_END = Math.ceil(toMinutes(config.day_end) / 60) * 60;

  const [date, setDate] = React.useState(today);
  const [view, setView] = React.useState<"day" | "week" | "list">("day");
  const [doctorFilter, setDoctorFilter] = React.useState<string>("all");
  const [booking, setBooking] = React.useState(false);
  const [detail, setDetail] = React.useState<Appointment | null>(null);

  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [sort, setSort] = React.useState({ id: "when", desc: true });

  /* any change to what is being asked for starts again at the first page */
  React.useEffect(() => { setPage(0); }, [term, sort, doctorFilter]);

  const doctors = selectDoctors(db, t);
  const all = selectAppointments(db, t);
  const visibleDoctors = doctorFilter === "all" ? doctors : doctors.filter((d) => d.id === doctorFilter);

  const forDay = all
    .filter((a) => a.date === date)
    .filter((a) => doctorFilter === "all" || a.doctor_id === doctorFilter)
    .sort((a, b) => a.time.localeCompare(b.time));

  const weekStart = React.useMemo(() => {
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    return addDays(date, -((dow + 6) % 7));
  }, [date]);
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  /**
   * The list view is a page; the day and week grids are not.
   *
   * A grid is about one date — it needs every booking on it, and asks for the
   * collection. "Every booking, across all dates" is exactly the view that
   * should not hold every booking, so it sends its search, filter, sort and
   * page to the database and renders the ten rows that come back.
   */
  const listQuery = React.useMemo(() => ({
    search: term || undefined,
    doctor_id: doctorFilter === "all" ? undefined : doctorFilter,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
    sort: SORT_KEYS[sort.id] ?? "when",
    order: (sort.desc ? "desc" : "asc") as "asc" | "desc",
  }), [term, doctorFilter, page, sort]);

  const { data: listPage, isFetching: listFetching } = useAppointmentPage(
    listQuery, { enabled: view === "list" },
  );
  const listRows = listPage?.items ?? [];
  const listTotal = listPage?.total ?? 0;

  const act = (a: Appointment, status: Appointment["status"], msg: string) => {
    setAppointmentStatus(a.id, status);
    notify({ tone: status === "no_show" ? "warn" : "ok", title: msg, body: `${formatDate(a.date)} · ${formatTime12(a.time)}` });
    setDetail(null);
  };

  return (
    <>
      <PageHeader
        eyebrow="Diary"
        title="Appointments"
        description="Booking checks the clinician's existing slots before it holds anything. Checking a patient in creates the queue token — the appointment never becomes the queue."
        actions={
          <Button variant="primary" onClick={() => setBooking(true)}>
            <IconPlus size={15} /> Book appointment
          </Button>
        }
      />

      {/* controls */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="icon-sm" onClick={() => setDate(addDays(date, view === "week" ? -7 : -1))} aria-label="Previous">
            <IconChevronLeft size={16} />
          </Button>
          <Button variant={date === today ? "primary" : "secondary"} size="sm" onClick={() => setDate(today)}>
            Today
          </Button>
          <Button variant="secondary" size="icon-sm" onClick={() => setDate(addDays(date, view === "week" ? 7 : 1))} aria-label="Next">
            <IconChevronRight size={16} />
          </Button>
          <div className="ml-1.5">
            <p className="text-body font-semibold leading-tight text-ink">
              {view === "week" ? `Week of ${formatDate(weekStart, "long")}` : formatDate(date, "day")}
            </p>
            <p className="text-caption text-ink-3">
              {view === "week"
                ? `${pluralise(all.filter((a) => weekDays.includes(a.date)).length, "booking")}`
                : `${relativeDay(date)} · ${pluralise(forDay.length, "booking")}`}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={doctorFilter} onChange={(e) => setDoctorFilter(e.target.value)} className="h-8 w-auto text-label">
            <option value="all">All clinicians</option>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "list", label: "List" }]}
          />
        </div>
      </div>

      {view === "day" && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              {/* column heads */}
              <div
                className="sticky top-0 z-10 grid border-b border-table-head-line bg-table-head"
                style={{ gridTemplateColumns: `64px repeat(${visibleDoctors.length}, minmax(0,1fr))` }}
              >
                <div />
                {visibleDoctors.map((d) => (
                  <div key={d.id} className="border-l border-line px-3 py-2">
                    <p className="truncate text-label font-semibold text-ink">{d.name}</p>
                    <p className="truncate text-caption text-ink-3">{d.speciality ?? "Clinician"}</p>
                  </div>
                ))}
              </div>

              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `64px repeat(${visibleDoctors.length}, minmax(0,1fr))`,
                  height: (DAY_END - DAY_START) * PX_PER_MIN + TOP_PAD * 2,
                }}
              >
                {/* hour rail */}
                <div className="relative border-r border-line">
                  {Array.from({ length: (DAY_END - DAY_START) / 60 + 1 }, (_, i) => {
                    const mins = DAY_START + i * 60;
                    return (
                      <span
                        key={mins}
                        className="tnum absolute right-2 -translate-y-1/2 font-mono text-micro text-ink-3"
                        style={{ top: (mins - DAY_START) * PX_PER_MIN + TOP_PAD }}
                      >
                        {formatTime12(`${String(Math.floor(mins / 60)).padStart(2, "0")}:00`)}
                      </span>
                    );
                  })}
                </div>

                {visibleDoctors.map((d) => {
                  const items = forDay.filter((a) => a.doctor_id === d.id);
                  return (
                    <div key={d.id} className="relative border-l border-line">
                      {Array.from({ length: (DAY_END - DAY_START) / 30 }, (_, i) => (
                        <span
                          key={i}
                          className={i % 2 === 0 ? "absolute left-0 right-0 border-t border-line" : "absolute left-0 right-0 border-t border-line-soft"}
                          style={{ top: i * 30 * PX_PER_MIN + TOP_PAD }}
                          aria-hidden
                        />
                      ))}

                      {items.map((a) => {
                        const top = (toMinutes(a.time) - DAY_START) * PX_PER_MIN + TOP_PAD;
                        const h = Math.max(26, a.duration_min * PX_PER_MIN - 3);
                        /* a half-hour block cannot hold two lines of text */
                        const tight = h < 44;
                        const tone =
                          a.status === "no_show" ? "border-critical-border bg-critical-soft"
                          : a.status === "cancelled" ? "border-line bg-surface-2 [&_*]:!text-ink-3"
                          : a.status === "completed" ? "border-ok-border bg-ok-soft"
                          : a.status === "checked_in" ? "border-accent-border bg-accent-soft"
                          : "border-info-border bg-info-soft";

                        return (
                          <button
                            key={a.id}
                            onClick={() => setDetail(a)}
                            className={`absolute left-1.5 right-1.5 overflow-hidden rounded-[var(--r-sm)] border px-2 py-1 text-left transition-all duration-150 hover:-translate-y-px hover:shadow-e2 ${tone}`}
                            style={{ top, height: h }}
                          >
                            {tight ? (
                              <p className="flex items-baseline gap-1.5 truncate text-caption font-medium leading-[1.35] text-ink">
                                <span className="tnum shrink-0 font-mono text-micro font-normal text-ink-2">
                                  {formatTime12(a.time)}
                                </span>
                                <span className="truncate">{a.patient_name}</span>
                              </p>
                            ) : (
                              <>
                                <p className="tnum font-mono text-micro leading-tight text-ink-2">
                                  {formatTime12(a.time)} · {a.duration_min}m
                                </p>
                                <p className="truncate text-label font-medium leading-tight text-ink">
                                  {a.patient_name}
                                </p>
                                {h > 58 && <p className="truncate text-caption leading-tight text-ink-2">{a.reason}</p>}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {view === "week" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {weekDays.map((d) => {
            const items = all
              .filter((a) => a.date === d && (doctorFilter === "all" || a.doctor_id === doctorFilter))
              .sort((a, b) => a.time.localeCompare(b.time));
            const isToday = d === today;
            return (
              <Card key={d} className={isToday ? "border-accent-border" : undefined}>
                <div className={`flex items-baseline justify-between border-b px-3 py-2.5 ${isToday ? "border-accent-border bg-accent-soft" : "border-line-soft"}`}>
                  <div>
                    <p className={`text-label font-semibold ${isToday ? "text-accent-text" : "text-ink"}`}>{weekdayShort(d)}</p>
                    <p className="tnum font-mono text-caption text-ink-3">{formatDate(d)}</p>
                  </div>
                  <span className="tnum font-mono text-caption text-ink-3">{items.length}</span>
                </div>
                <div className="space-y-1.5 p-2">
                  {items.length === 0 && <p className="px-1 py-3 text-center text-caption text-ink-3">Free</p>}
                  {items.map((a) => {
                    return (
                      <button
                        key={a.id}
                        onClick={() => setDetail(a)}
                        className="w-full rounded-[var(--r-sm)] border border-line bg-surface-2 px-2 py-1.5 text-left transition-colors hover:bg-hover"
                      >
                        <p className="tnum font-mono text-micro text-ink-3">{formatTime12(a.time)}</p>
                        <p className="truncate text-caption font-medium text-ink">{a.patient_name}</p>
                      </button>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {view === "list" && (
        <Card className="overflow-hidden">
          <CardHeader
            icon={<IconCalendar size={15} />} tone="violet" title="Every booking"
            hint={`${pluralise(listTotal, "booking")}, across all dates — searched and paged in the database.`}
          />
          <DataTable
            columns={appointmentColumns}
            data={listRows}
            getRowId={(a) => a.id}
            searchPlaceholder="Patient, reason or clinician"
            pageSize={PAGE_SIZE}
            onRowClick={(a) => setDetail(a)}
            minWidth="56rem"
            empty={
              <EmptyState
                icon={<IconCalendar size={20} />}
                title={q ? "No booking matches" : "No appointments yet"}
                body={q ? `Nothing in this clinic matches “${q}”.` : undefined}
              />
            }
            server={{
              total: listTotal,
              page,
              onPageChange: setPage,
              search: q,
              onSearchChange: setQ,
              sort,
              onSortChange: setSort,
              loading: listFetching,
            }}
          />
        </Card>
      )}

      {/* detail drawer */}
      <Drawer
        open={!!detail}
        onClose={() => setDetail(null)}
        title={detail?.patient_name ?? "Appointment"}
        subtitle={detail ? `${formatDate(detail.date, "day")} at ${formatTime12(detail.time)}` : ""}
        footer={
          detail && (
            <>
              {detail.status === "scheduled" && (
                <>
                  <Button variant="ghost" onClick={() => act(detail, "cancelled", "Appointment cancelled")}>
                    <IconX size={14} /> Cancel
                  </Button>
                  <Button variant="secondary" onClick={() => act(detail, "no_show", "Marked as no show")}>
                    No show
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      checkIn(detail.id);
                      notify({ tone: "ok", title: "Checked in", body: "Token issued and pushed to the waiting-room board." });
                      setDetail(null);
                    }}
                  >
                    <IconCheck size={14} /> Check in
                  </Button>
                </>
              )}
              {detail.status !== "scheduled" && (
                <ButtonLink href={`/patients/${detail.patient_id}`} variant="secondary">
                  Open patient record <IconArrowRight size={14} />
                </ButtonLink>
              )}
            </>
          )
        }
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <StatusPill kind="appointment" status={detail.status} />
              <Badge tone="neutral" size="sm">{detail.duration_min} minutes</Badge>
            </div>

            <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
              <KV label="Clinician" value={userName(db, detail.doctor_id)} />
              <KV label="Booked via" value={detail.created_via.replace("_", " ")} />
              <KV label="Date" value={formatDate(detail.date, "long")} />
              <KV label="Time" value={formatTime12(detail.time)} mono />
            </dl>

            <div>
              <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Reason</p>
              <p className="mt-1 text-body leading-relaxed text-ink">{detail.reason}</p>
            </div>

            {detail.date === today && detail.status === "scheduled" && (
              <p className="flex items-start gap-2 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-caption leading-relaxed text-ink-2">
                <IconClock size={14} className="mt-px shrink-0 text-ink-3" />
                Checking in issues the next token in today's sequence and pushes the board update — the appointment row stays
                where it is and only changes status.
              </p>
            )}
            {daysBetween(today, detail.date) > 0 && (
              <p className="text-caption text-ink-3">
                This booking is {relativeDay(detail.date).toLowerCase()} — check-in opens on the day.
              </p>
            )}
          </div>
        )}
      </Drawer>

      <AppointmentModal open={booking} onClose={() => setBooking(false)} defaultDate={date} />
    </>
  );
}
