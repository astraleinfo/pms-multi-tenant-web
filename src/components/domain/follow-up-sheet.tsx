"use client";

import * as React from "react";
import { cn } from "@/lib/cn";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, useFollowUpCalls } from "@/lib/query/hooks";
import { selectDoctors, userName } from "@/lib/data/repository";
import { freeSlots, formatLength } from "@/lib/appointment-types";
import {
  addDays, clinicClock, formatDate, formatStamp, formatTime12, weekdayShort,
} from "@/lib/format";
import { canMoveToday } from "@/lib/follow-up-booking";
import {
  groupOutcomes, outcomeForKey, outcomeOptions, type OutcomeOption,
} from "@/lib/follow-up-outcomes";
import type { FollowUp, FollowUpCall, FollowUpOutcome } from "@/lib/types";
import type { NewFollowUpCall } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox, Select, Textarea } from "@/components/ui/field";
import { Spinner } from "@/components/ui/loader";
import { StatusPill } from "@/components/domain/status";
import { SlotGrid } from "@/components/domain/slot-grid";
import {
  IconCalendar, IconCheck, IconClock, IconPhone, IconPhoneOff, IconX, type IconProps,
} from "@/components/ui/icons";

/** How far ahead a new slot is looked for. */
const RESCHEDULE_DAYS = 14;

/** What the desk can say came of a call. */
type Choice = FollowUpOutcome;

/* An icon per option, so the cards can be told apart before they are read.
   No colour: the options are not a scale of good to bad, and a green beside
   Confirmed would claim one. */
const ICON: Record<Choice, React.ComponentType<IconProps>> = {
  confirmed: IconCheck,
  rescheduled: IconClock,
  reschedule_required: IconCalendar,
  declined: IconX,
  no_answer: IconPhoneOff,
  call_back: IconPhone,
};

/* Both groups share one column count, so a card sits under the card above it.
   It follows the size of the larger group: four reached options make two rows
   of two on a mid-width sheet and one row of four on a wide one; three stay
   in a row of three, rather than leaving one card alone on a second row. The
   widths are the narrowest at which the longest label ("Reschedule today", 116px)
   still sits on one line beside the icon and the key chip with room to spare:
   a card needs about 230px. */
const COLUMNS: Record<number, string> = {
  3: "grid-cols-1 @min-[700px]:grid-cols-3",
  4: "grid-cols-1 @min-[448px]:grid-cols-2 @min-[940px]:grid-cols-4",
};

/**
 * The call sheet: opened under a row when the desk rings that patient, and
 * where what came of the call is written down.
 *
 * Everything a call can lead to happens here without a dialog — confirming,
 * finding a new slot, letting the booking go — because the person doing it
 * has a patient on the line and a queue of others to ring. The options are
 * grouped by whether the call reached the patient, and each carries a tooltip
 * saying what it does to the booking (lib/follow-up-outcomes.ts). The number keys pick them in the
 * order they are drawn, shown on each card; Escape closes the sheet.
 */
export function FollowUpSheet({
  row, onClose,
}: {
  row: FollowUp;
  onClose: () => void;
}) {
  const { recordFollowUpCall, notify, can, today } = useApp();
  const a = row.appointment;
  const choices = outcomeOptions(canMoveToday(a, today));
  const groups = groupOutcomes(choices);
  const columns = COLUMNS[Math.max(...groups.map((g) => g.options.length))] ?? COLUMNS[4];
  const firstName = a.patient_name.split(" ")[0] ?? a.patient_name;

  const [outcome, setOutcome] = React.useState<Choice | null>(null);
  const [notes, setNotes] = React.useState("");
  const [cancel, setCancel] = React.useState(true);
  const [slot, setSlot] = React.useState<{ doctor: string; date: string; time: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const sheet = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { sheet.current?.focus(); }, []);

  const mayWrite = can("appointment:write");
  const sameDay = outcome === "rescheduled";
  const moving = (outcome === "reschedule_required" || sameDay) && slot !== null;

  const save = async () => {
    if (!outcome || saving || (sameDay && !slot)) return;
    const call: NewFollowUpCall = moving
      ? {
          outcome: "rescheduled",
          notes: notes.trim(),
          new_slot: {
            date: slot.date, time: slot.time,
            doctor_id: slot.doctor !== a.doctor_id ? slot.doctor : undefined,
          },
        }
      : {
          outcome,
          notes: notes.trim(),
          cancel_appointment: outcome === "declined" ? cancel : undefined,
        };
    setSaving(true);
    try {
      await recordFollowUpCall(a.id, call);
      notify(toastFor(call, a.patient_name));
      onClose();
    } catch {
      /* The store already said why in a toast. The sheet stays open, so a slot
         that went while the patient was deciding can be swapped for another. */
    } finally {
      setSaving(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const typing = (e.target as HTMLElement).closest("textarea, input, [role=listbox], [role=combobox]");
    if (e.key === "Escape" && !typing) {
      e.preventDefault();
      onClose();
      return;
    }
    /* a role that cannot log calls cannot pick an option by key either — the
       cards are disabled, and a tick on one would say otherwise */
    if (typing || !mayWrite || e.metaKey || e.ctrlKey || e.altKey) return;
    const picked = outcomeForKey(choices, e.key);
    if (picked) {
      e.preventDefault();
      setOutcome(picked);
    }
  };

  return (
    <div
      ref={sheet}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      role="group"
      aria-label={`Outcome of the call to ${a.patient_name}`}
      className="border-t border-accent-border bg-surface-2 px-4 py-4 outline-none sm:px-5"
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-4">
          <fieldset className="@container">
            <legend className="mb-2.5 text-label font-semibold text-ink">
              What did {firstName} say?
            </legend>
            <div className="space-y-3.5" role="radiogroup" aria-label="Outcome">
              {groups.map((g) => (
                <div key={g.group}>
                  <p className="mb-1.5 text-caption font-medium text-ink-3">{g.caption}</p>
                  <div className={cn("grid gap-2", columns)}>
                    {g.options.map((o) => (
                      <OutcomeCard
                        key={o.value}
                        id={`${a.id}-${o.value}`}
                        option={o}
                        checked={outcome === o.value}
                        disabled={!mayWrite}
                        onPick={() => setOutcome(o.value)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </fieldset>

          {(outcome === "reschedule_required" || sameDay) && (
            <ReschedulePicker row={row} value={slot} onChange={setSlot} todayOnly={sameDay} />
          )}

          {outcome === "declined" && (
            <Checkbox
              checked={cancel}
              onChange={setCancel}
              label="Cancel the appointment"
              description="Frees the slot for someone else, and tells the patient it is cancelled."
            />
          )}

          <div>
            <label htmlFor={`notes-${a.id}`} className="mb-1.5 block text-label font-medium text-ink">
              Notes <span className="font-normal text-ink-3">(optional)</span>
            </label>
            <Textarea
              id={`notes-${a.id}`}
              rows={2}
              maxLength={1000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={NOTE_HINT[outcome ?? "confirmed"]}
            />
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              <IconX size={14} /> Close
            </Button>
            <Button variant="primary" onClick={save} disabled={!outcome || saving || !mayWrite || (sameDay && !slot)}>
              {saving ? <Spinner size={14} /> : <IconCheck size={15} />}
              {saving ? "Saving…" : actionLabel(outcome, moving ? slot : null, cancel)}
            </Button>
          </div>
          {!mayWrite && (
            <p className="text-right text-caption text-ink-3">
              Your role can read the call list but not log calls.
            </p>
          )}
        </div>

        <CallHistory appointmentId={a.id} attempts={row.attempts} />
      </div>
    </div>
  );
}

/* ---- an option -------------------------------------------------------------- */

/**
 * One outcome as a card: an icon and its name, nothing more. What it does to
 * the booking is the card's tooltip — there to be found on hover by anyone
 * unsure how two options differ, not text that every call has to read past.
 * The card is neutral until picked; picked, it takes the accent and a tick in
 * the corner, so the choice is not shown by colour alone. The corner otherwise
 * holds the option's number key, quietly, for the desk that rings all day.
 */
function OutcomeCard({
  id, option, checked, disabled, onPick,
}: {
  id: string;
  option: OutcomeOption;
  checked: boolean;
  disabled: boolean;
  onPick: () => void;
}) {
  const Icon = ICON[option.value];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      aria-labelledby={`${id}-label`}
      aria-keyshortcuts={String(option.key)}
      title={option.hint}
      disabled={disabled}
      onClick={onPick}
      className={cn(
        "flex min-h-[3.25rem] items-center gap-3 rounded-[var(--r)] border px-3 py-2 text-left",
        "transition-colors duration-150 ease-[var(--ease-brand)]",
        disabled
          ? "cursor-not-allowed border-disabled-border bg-disabled-surface text-disabled-ink"
          : checked
            ? "border-accent bg-accent-soft text-ink"
            : "border-line-strong bg-surface text-ink hover:bg-hover",
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--r-sm)] transition-colors duration-150 ease-[var(--ease-brand)]",
          disabled
            ? "bg-disabled-border text-disabled-ink"
            : checked
              ? "bg-surface text-accent-text shadow-[inset_0_0_0_1px_var(--accent-border)]"
              : "bg-surface-3 text-ink-2",
        )}
        aria-hidden
      >
        <Icon size={17} />
      </span>
      <span id={`${id}-label`} className="min-w-0 flex-1 text-label font-medium">
        {option.label}
      </span>
      {checked ? (
        <span className="flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink" aria-hidden>
          <IconCheck size={12} strokeWidth={2.2} />
        </span>
      ) : !disabled && (
        <kbd
          className="hidden h-4.5 min-w-4.5 shrink-0 items-center justify-center rounded-[4px] border border-line px-1 text-micro tnum text-ink-placeholder sm:inline-flex"
          aria-hidden
        >
          {option.key}
        </kbd>
      )}
    </button>
  );
}

/* ---- the new slot ----------------------------------------------------------- */

/**
 * Only what can actually be booked: the days in the next two weeks on which
 * the chosen clinician has a free slot of this visit's length, and on the
 * chosen day, only the free times. The clash check is the diary's own
 * (`conflictsFor`, over the bookings already in cache), so this agrees with the
 * booking dialog; the server checks again, under a lock, when it is saved.
 */
function ReschedulePicker({
  row, value, onChange, todayOnly = false,
}: {
  row: FollowUp;
  value: { doctor: string; date: string; time: string } | null;
  onChange: (slot: { doctor: string; date: string; time: string } | null) => void;
  /** a same-day time change: nothing but today's free times is offered */
  todayOnly?: boolean;
}) {
  const { today, config, conflictsFor } = useApp();
  const { tenant } = useTenant();
  const db = useClinicDb();
  const a = row.appointment;
  const doctors = selectDoctors(db, a.tenant_id);
  const minutes = a.duration_min;

  const [doctor, setDoctor] = React.useState(a.doctor_id);
  const [date, setDate] = React.useState<string | null>(null);
  /* the clinic's clock, read once a minute — a slot at 10:00 stops being
     offered at 10:00, not whenever the sheet happens to re-render */
  const [now, setNow] = React.useState(() => clinicClock(tenant.timezone));
  React.useEffect(() => {
    const tick = setInterval(() => setNow(clinicClock(tenant.timezone)), 60_000);
    return () => clearInterval(tick);
  }, [tenant.timezone]);

  const days = React.useMemo(() => {
    const out: Array<{ date: string; times: string[] }> = [];
    for (let i = 0; i < (todayOnly ? 1 : RESCHEDULE_DAYS); i++) {
      const d = addDays(today, i);
      const times = freeSlots({
        dayStart: config.day_start, dayEnd: config.day_end, minutes, date: d, today, now,
        clashes: (t) => conflictsFor(doctor, d, t, minutes, a.id).length > 0,
      })
        /* where it already is is not somewhere to move it to */
        .filter((t) => !(doctor === a.doctor_id && d === a.date && t === a.time));
      if (times.length) out.push({ date: d, times });
    }
    return out;
  }, [today, now, todayOnly, config.day_start, config.day_end, minutes, doctor, conflictsFor, a.id, a.doctor_id, a.date, a.time]);

  /* Keep the chosen day if it still has room — after a refused booking the
     diary is re-read and the slot that went disappears from the grid. */
  const chosen = days.find((d) => d.date === date) ?? days[0] ?? null;
  React.useEffect(() => {
    if (value && !chosen?.times.includes(value.time)) onChange(null);
    else if (value && (value.date !== chosen?.date || value.doctor !== doctor)) onChange(null);
  }, [chosen, doctor, value, onChange]);

  return (
    <div className="space-y-3 rounded-[var(--r)] border border-line bg-surface p-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[14rem]">
          <label className="mb-1.5 block text-label font-medium text-ink" htmlFor={`doctor-${a.id}`}>
            Clinician
          </label>
          <Select
            id={`doctor-${a.id}`}
            value={doctor}
            onChange={(e) => { setDoctor(e.target.value); setDate(null); }}
            className="h-9"
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}{d.id === a.doctor_id ? " (booked with)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-caption text-ink-3">
          A {formatLength(minutes)} visit, {todayOnly ? "today" : `next ${RESCHEDULE_DAYS} days`}
        </p>
      </div>

      {days.length === 0 ? (
        <p className="rounded-[var(--r-sm)] bg-surface-2 px-3 py-2.5 text-label text-ink-2">
          {todayOnly
            ? <>{userName(db, doctor)} has no free {formatLength(minutes)} slot left today.
                Try another clinician, or choose Needs a new slot to find another day.</>
            : <>{userName(db, doctor)} has no free {formatLength(minutes)} slot in the next {RESCHEDULE_DAYS} days.
                Try another clinician, or save this as needing a reschedule and ring back.</>}
        </p>
      ) : (
        <>
          {!todayOnly && <div>
            <p className="mb-1.5 text-label font-medium text-ink">Day</p>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="radiogroup" aria-label="Day">
              {days.map((d) => {
                const on = d.date === chosen?.date;
                return (
                  <button
                    key={d.date}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => { setDate(d.date); onChange(null); }}
                    className={cn(
                      "flex w-[4.5rem] shrink-0 flex-col items-center rounded-[var(--r-sm)] border py-1.5",
                      "transition-colors duration-150",
                      on
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft",
                    )}
                  >
                    <span className={cn("text-micro", on ? "text-accent-ink" : "text-ink-3")}>
                      {d.date === today ? "Today" : weekdayShort(d.date)}
                    </span>
                    <span className="tnum text-label font-semibold">{Number(d.date.slice(8))}</span>
                    <span className={cn("tnum text-micro", on ? "text-accent-ink" : "text-ink-2")}>
                      {d.times.length} free
                    </span>
                  </button>
                );
              })}
            </div>
          </div>}

          {chosen && (
            <div>
              <p className="mb-1.5 text-label font-medium text-ink">
                Free on {formatDate(chosen.date, "day")}
              </p>
              <SlotGrid
                label={`Free times on ${formatDate(chosen.date, "day")}`}
                times={chosen.times}
                value={value?.time ?? ""}
                onChange={(time) => onChange({ doctor, date: chosen.date, time })}
              />
            </div>
          )}
        </>
      )}
      {!value && days.length > 0 && (
        <p className="text-caption text-ink-3">
          {todayOnly
            ? "Pick the time the patient will come at."
            : "Pick a time to book it now, or save without one if the patient will ring back."}
        </p>
      )}
    </div>
  );
}

/* ---- history ---------------------------------------------------------------- */

function CallHistory({ appointmentId, attempts }: { appointmentId: string; attempts: number }) {
  const { data: calls, isPending } = useFollowUpCalls(attempts > 0 ? appointmentId : null);

  return (
    <section aria-label="Previous calls" className="min-w-0 lg:border-l lg:border-line lg:pl-5">
      <h3 className="mb-2 text-label font-semibold text-ink">
        {attempts === 0 ? "No calls yet" : `Previous calls (${attempts})`}
      </h3>
      {attempts === 0 ? (
        <p className="text-caption text-ink-3">This is the first time anyone has rung about this visit.</p>
      ) : isPending ? (
        <Spinner size={16} />
      ) : (
        <ol className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {(calls ?? []).map((c) => <HistoryItem key={c.id} call={c} />)}
        </ol>
      )}
    </section>
  );
}

function HistoryItem({ call }: { call: FollowUpCall }) {
  return (
    <li className="text-caption">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <StatusPill kind="followUp" status={call.outcome} size="sm" dot={false} />
        <span className="tnum text-ink-2">{formatStamp(call.called_at)}</span>
      </div>
      <p className="mt-1 text-ink-2">{call.called_by_name || "Someone"}</p>
      {call.moved_from && call.moved_to && (
        <p className="mt-0.5 text-ink-2">
          Moved from {formatStamp(call.moved_from)} to {formatStamp(call.moved_to)}
        </p>
      )}
      {call.notes && <p className="mt-0.5 whitespace-pre-line text-ink">{call.notes}</p>}
    </li>
  );
}

/* ---- words ------------------------------------------------------------------ */

const NOTE_HINT: Record<Choice, string> = {
  confirmed: "Anything the clinician should know before the visit",
  reschedule_required: "When suits them, if they said",
  no_answer: "Voicemail left, number unobtainable…",
  declined: "Why, if they said",
  call_back: "When to try again",
  rescheduled: "Why the time changed, if they said",
};

function actionLabel(
  outcome: Choice | null, slot: { date: string; time: string } | null, cancel: boolean,
) {
  switch (outcome) {
    case "confirmed": return "Mark confirmed";
    case "rescheduled":
      return slot ? `Move to ${formatTime12(slot.time)}` : "Choose a new time";
    case "reschedule_required":
      return slot ? `Book ${formatTime12(slot.time)}, ${formatDate(slot.date, "day")}` : "Save, reschedule later";
    case "no_answer": return "Log no answer";
    case "declined": return cancel ? "Log and cancel appointment" : "Log declined";
    case "call_back": return "Log call back";
    default: return "Save outcome";
  }
}

function toastFor(call: NewFollowUpCall, name: string) {
  switch (call.outcome) {
    case "confirmed":
      return { tone: "ok" as const, title: "Appointment confirmed", body: name };
    case "rescheduled":
      return {
        tone: "ok" as const, title: "Appointment moved and confirmed",
        body: `${name}, ${formatDate(call.new_slot!.date, "day")} at ${formatTime12(call.new_slot!.time)}. The patient is sent the new time.`,
      };
    case "no_answer":
      return { tone: "warn" as const, title: "No answer logged", body: `${name} stays on the list to try again.` };
    case "declined":
      return call.cancel_appointment
        ? { tone: "warn" as const, title: "Appointment cancelled", body: `${name} declined. The slot is free again.` }
        : { tone: "warn" as const, title: "Declined logged", body: name };
    case "call_back":
      return { tone: "ok" as const, title: "Call back logged", body: name };
    default:
      return { tone: "warn" as const, title: "Reschedule required", body: `${name} needs a new slot.` };
  }
}

