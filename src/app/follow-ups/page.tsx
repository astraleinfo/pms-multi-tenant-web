"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, useFollowUpPage, useUsers } from "@/lib/query/hooks";
import { useDebounced } from "@/lib/debounce";
import { selectDoctors } from "@/lib/data/repository";
import { formatDate, formatTime12, pluralise, relativeDay, sentenceCase } from "@/lib/format";
import type { FollowUp, FollowUpStatus } from "@/lib/types";
import type { FollowUpQuery } from "@/lib/api";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Button, buttonClass } from "@/components/ui/button";
import { SearchInput, Select } from "@/components/ui/field";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { LoadingBar } from "@/components/ui/loader";
import { FOLLOW_UP_TONE } from "@/components/ui/badge";
import { RoleGate } from "@/components/domain/gates";
import { StatusPill } from "@/components/domain/status";
import { PatientRef } from "@/components/domain/patient";
import { FollowUpSheet } from "@/components/domain/follow-up-sheet";
import { IconChevronLeft, IconChevronRight, IconPhone } from "@/components/ui/icons";

const PAGE_SIZE = 25;

/**
 * The tabs, which are also the summary. Today is a date and the rest are
 * statuses, so the strip reads left to right as the morning does: who is
 * coming today, who has not been rung, who did not pick up, who asked to be
 * rung later, who needs a new slot, who is sorted.
 */
type Tab = "today" | "pending" | "no_answer" | "call_back" | "reschedule_required" | "confirmed" | "all";

const TABS: Array<{ value: Tab; label: string; tone?: string }> = [
  { value: "today", label: "Today" },
  { value: "pending", label: "Pending", tone: FOLLOW_UP_TONE.pending },
  { value: "no_answer", label: "No answer", tone: FOLLOW_UP_TONE.no_answer },
  { value: "call_back", label: "Call back", tone: FOLLOW_UP_TONE.call_back },
  { value: "reschedule_required", label: "Reschedule required", tone: FOLLOW_UP_TONE.reschedule_required },
  { value: "confirmed", label: "Confirmed", tone: FOLLOW_UP_TONE.confirmed },
  { value: "all", label: "All" },
];

const DOT: Record<string, string> = {
  ok: "bg-ok", warn: "bg-warn", critical: "bg-critical", violet: "bg-violet", neutral: "bg-neutral",
};

const RANGES = [
  { days: 3, label: "Next 3 days" },
  { days: 7, label: "Next 7 days" },
  { days: 14, label: "Next 14 days" },
  { days: 30, label: "Next 30 days" },
];

/* Patient → phone → appointment → doctor → status → call: the order a
   receptionist reads a row in before picking up the phone. */
const COLUMNS =
  "md:grid-cols-[minmax(0,1.5fr)_minmax(9.5rem,0.9fr)_minmax(7.5rem,0.8fr)_minmax(0,1fr)_minmax(0,1.2fr)_auto] md:items-center md:gap-x-4";
/* On a phone a row is two columns: the number to ring beside when the visit is. */
const SPAN = "col-span-2 md:col-span-1";

export default function FollowUpsPage() {
  return (
    <RoleGate allow={["receptionist", "doctor"]}>
      <FollowUps />
    </RoleGate>
  );
}

function FollowUps() {
  const { today } = useApp();
  const { user, role } = useTenant();
  const db = useClinicDb();
  const doctors = selectDoctors(db, user.tenant_id);

  const [tab, setTab] = React.useState<Tab>("today");
  const [days, setDays] = React.useState(7);
  /* a clinician opens on their own list; the desk sees everyone's */
  const [doctor, setDoctor] = React.useState(role === "doctor" ? user.id : "all");
  const [q, setQ] = React.useState("");
  const term = useDebounced(q);
  const [page, setPage] = React.useState(0);
  const [openId, setOpenId] = React.useState<string | null>(null);

  React.useEffect(() => { setPage(0); }, [tab, days, doctor, term]);

  const query = React.useMemo<FollowUpQuery>(() => ({
    days,
    date: tab === "today" ? today : undefined,
    status: tab !== "today" && tab !== "all" ? (tab as FollowUpStatus) : undefined,
    doctor_id: doctor === "all" ? undefined : doctor,
    search: term || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  }), [days, tab, today, doctor, term, page]);

  const { data, isFetching, isPending } = useFollowUpPage(query);
  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;
  const tally: Record<Tab, number | undefined> = {
    today: data?.today,
    pending: counts?.pending,
    no_answer: counts?.no_answer,
    call_back: counts?.call_back,
    reschedule_required: counts?.reschedule_required,
    confirmed: counts?.confirmed,
    all: counts ? Object.values(counts).reduce((s, n) => s + n, 0) : undefined,
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const groups = groupByDay(rows);

  return (
    <>
      <PageHeader
        eyebrow={formatDate(today, "day")}
        title="Follow-ups"
        description="Ring patients before their visit. Confirming marks the appointment confirmed; a new slot is checked against the clinician's diary again when it is booked, so two desks cannot take the same one."
      />

      <StatusStrip value={tab} onChange={setTab} tally={tally} />

      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
          <SearchInput
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, phone or MRN"
            aria-label="Search the call list"
            wrapperClassName="min-w-[200px] max-w-sm flex-1"
            className="h-9 text-label"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Select value={String(days)} onChange={(e) => setDays(Number(e.target.value))}
                    className="h-9 w-auto text-label" aria-label="How far ahead">
              {RANGES.map((r) => <option key={r.days} value={r.days}>{r.label}</option>)}
            </Select>
            <Select value={doctor} onChange={(e) => setDoctor(e.target.value)}
                    className="h-9 w-auto text-label" aria-label="Clinician">
              <option value="all">All clinicians</option>
              {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          </div>
          <p className="tnum ml-auto text-caption text-ink-2" aria-live="polite">
            {data ? pluralise(total, "booking") : " "}
          </p>
        </div>

        {/* column heads — on a phone each row says what it is instead */}
        <div className={cn(COLUMNS, "hidden border-y border-table-head-line bg-table-head px-4 py-2 text-micro font-medium text-ink-2 md:grid")}>
          <span>Patient</span>
          <span>Phone</span>
          <span>Appointment</span>
          <span>Clinician</span>
          <span>Follow-up</span>
          <span className="w-[5.75rem]" aria-hidden />
        </div>

        <div className="relative" aria-busy={isFetching || undefined}>
          {isFetching && rows.length > 0 && <LoadingBar />}

          {isPending && rows.length === 0 ? (
            <RowSkeletons />
          ) : rows.length === 0 ? (
            <EmptyState icon={<IconPhone size={20} />} {...EMPTY[tab](days, !!term)} />
          ) : (
            groups.map(([date, items]) => (
              <section key={date} aria-label={formatDate(date, "day")}>
                <h2 className="flex items-baseline gap-2 border-b border-line bg-surface-2 px-4 py-1.5 text-caption">
                  <span className="font-semibold text-ink">{sentenceCase(relativeDay(date))}</span>
                  <span className="text-ink-2">{formatDate(date, "day")}</span>
                </h2>
                <ul className="divide-y divide-row-line">
                  {items.map((row) => (
                    <FollowUpRow
                      key={row.appointment.id}
                      row={row}
                      open={openId === row.appointment.id}
                      onOpen={() => setOpenId(row.appointment.id)}
                      onClose={() => setOpenId(null)}
                    />
                  ))}
                </ul>
              </section>
            ))
          )}
        </div>

        {pageCount > 1 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2.5">
            <p className="tnum text-caption text-ink-2">
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1.5">
              <Button variant="secondary" size="icon-sm" aria-label="Previous page"
                      disabled={page === 0} onClick={() => setPage(page - 1)}>
                <IconChevronLeft size={15} />
              </Button>
              <span className="tnum px-1 text-caption text-ink-2">{page + 1} / {pageCount}</span>
              <Button variant="secondary" size="icon-sm" aria-label="Next page"
                      disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}>
                <IconChevronRight size={15} />
              </Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---- the strip -------------------------------------------------------------- */

/**
 * The summary and the filter in one bar. Each status carries the dot its badge
 * carries below, so the strip is also the key to the list's colours.
 */
function StatusStrip({
  value, onChange, tally,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
  tally: Record<Tab, number | undefined>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Filter the call list"
      className="flex overflow-x-auto rounded-[var(--r-lg)] border border-line bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {TABS.map((t, i) => {
        const on = t.value === value;
        const n = tally[t.value];
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(t.value)}
            className={cn(
              "relative flex min-w-[7.25rem] flex-[1_0_auto] flex-col items-start gap-0.5 px-4 py-3 text-left",
              "transition-colors duration-150 ease-[var(--ease-brand)]",
              i > 0 && "border-l border-line",
              /* "All" stands a step apart: it is the sum, not one more status */
              t.value === "all" && "border-l-line-strong",
              on ? "bg-accent-soft" : "hover:bg-hover",
            )}
          >
            <span className={cn("tnum font-display text-h1 font-semibold leading-none", on ? "text-accent-text" : "text-ink")}>
              {n ?? "–"}
            </span>
            <span className={cn("flex items-center gap-1.5 whitespace-nowrap text-caption", on ? "font-medium text-accent-text" : "text-ink-2")}>
              {t.tone && <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[t.tone])} aria-hidden />}
              {t.label}
            </span>
            {on && <span className="absolute inset-x-0 bottom-0 h-0.5 bg-accent" aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/* ---- one row ---------------------------------------------------------------- */

function FollowUpRow({
  row, open, onOpen, onClose,
}: {
  row: FollowUp;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { today } = useApp();
  const { data: users = [] } = useUsers();
  const a = row.appointment;
  const doctor = users.find((u) => u.id === a.doctor_id);
  const callable = a.status === "scheduled" || a.status === "confirmed";
  const trigger = React.useRef<HTMLElement>(null);

  const close = () => {
    onClose();
    /* back to where the person was, so the next row is a Tab away */
    requestAnimationFrame(() => trigger.current?.focus());
  };

  return (
    <li className={cn(open && "bg-surface shadow-[inset_3px_0_0_var(--accent)]")}>
      <div className={cn(COLUMNS, "grid grid-cols-2 items-start gap-x-3 gap-y-2 px-4 py-3")}>
        <div className={cn(SPAN, "min-w-0")}>
          <PatientRef
            id={a.patient_id}
            name={a.patient_name}
            href={`/patients/${a.patient_id}`}
            sub={`${a.patient_mrn}, ${a.reason}`}
            size="sm"
          />
        </div>

        <span className="tnum self-center font-mono text-label font-medium text-ink">
          {row.patient_phone || <span className="font-sans font-normal text-ink-3">No number on file</span>}
        </span>

        <span className="flex min-w-0 flex-col items-end gap-1 md:items-start">
          <span className="flex items-baseline gap-1.5">
            <span className="tnum font-mono text-label font-medium text-ink">{formatTime12(a.time)}</span>
            <span className="text-caption text-ink-2">{a.duration_min} min</span>
          </span>
          <StatusPill kind="appointment" status={a.status} size="sm" dot={false} />
        </span>

        <span className={cn(SPAN, "truncate self-center text-label text-ink-2")}>{doctor?.name ?? "—"}</span>

        <span className={cn(SPAN, "min-w-0 self-center")}>
          <StatusPill kind="followUp" status={row.status} size="sm" />
          {row.attempts > 0 && row.last_call && (
            <span className="mt-1 block truncate text-caption text-ink-2">
              {pluralise(row.attempts, "call")}, last {lastCalled(row.last_call.called_at, today)}
            </span>
          )}
        </span>

        <span className={cn(SPAN, "flex justify-end self-center md:w-[5.75rem]")}>
          {!callable ? (
            <span className="text-caption text-ink-3">Closed</span>
          ) : open ? (
            <Button size="sm" variant="ghost" onClick={close} aria-expanded>
              Close
            </Button>
          ) : (
            /* The desk rings from its own phone; this is where what was
               said is written down — the outcome, a new slot, or a release. */
            <button
              ref={trigger as React.Ref<HTMLButtonElement>}
              type="button"
              onClick={onOpen}
              aria-expanded={false}
              aria-label={`Update follow-up for ${a.patient_name}`}
              className={buttonClass({ variant: "primary", size: "sm", className: "w-full md:w-auto" })}
            >
              Update
            </button>
          )}
        </span>
      </div>

      {open && <FollowUpSheet row={row} onClose={close} />}
    </li>
  );
}

/* ---- the rest --------------------------------------------------------------- */

/** "today at 10:42am", or "7 Oct 26 at 4:05pm" — when the last call was made. */
function lastCalled(stamp: string, today: string) {
  const day = stamp.slice(0, 10);
  return `${day === today ? "today" : formatDate(day)} at ${formatTime12(stamp.slice(11, 16))}`;
}

function groupByDay(rows: FollowUp[]): Array<[string, FollowUp[]]> {
  const out: Array<[string, FollowUp[]]> = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last[0] === row.appointment.date) last[1].push(row);
    else out.push([row.appointment.date, [row]]);
  }
  return out;
}

function RowSkeletons() {
  return (
    <div className="divide-y divide-row-line" aria-hidden>
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className={cn(COLUMNS, "grid grid-cols-2 gap-x-3 gap-y-2 px-4 py-3.5")}>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-8 w-20" />
        </div>
      ))}
      <span className="sr-only" role="status">Loading the call list</span>
    </div>
  );
}

const EMPTY: Record<Tab, (days: number, searching: boolean) => { title: string; body: string }> = {
  today: (_, s) => s
    ? { title: "Nobody today matches", body: "Try the All tab, or clear the search." }
    : { title: "No bookings today", body: "Nobody is booked in today. The Pending tab has the days ahead." },
  pending: (d, s) => s
    ? { title: "Nobody pending matches", body: "Clear the search to see everyone still to ring." }
    : { title: "Everyone has been rung", body: `Every booking in the next ${d} days has had at least one call.` },
  no_answer: () => ({ title: "No unanswered calls", body: "Anyone who doesn't pick up appears here for another try." }),
  call_back: () => ({ title: "Nobody asked to be rung back", body: "Patients who ask you to call later appear here." }),
  reschedule_required: () => ({
    title: "No one is waiting for a new slot",
    body: "Patients who need to move a visit, but have not picked a time yet, appear here.",
  }),
  confirmed: (d) => ({ title: "Nothing confirmed yet", body: `Confirmed visits in the next ${d} days appear here.` }),
  all: (d, s) => s
    ? { title: "No booking matches", body: "Search by the patient's name, phone number or MRN." }
    : { title: "Nothing booked", body: `There are no appointments in the next ${d} days.` },
};
