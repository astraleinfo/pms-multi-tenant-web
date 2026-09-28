"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { selectDoctors } from "@/lib/data/repository";
import { formatTime12, formatDate } from "@/lib/format";
import { appointmentTypes, formatLength, slotTimes } from "@/lib/appointment-types";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PatientPicker } from "./patient";
import { Badge } from "@/components/ui/badge";
import { IconAlert, IconCheck, IconPlus } from "@/components/ui/icons";


/** §3.5 — book an appointment, with the doctor-availability check in front of it. */
export function AppointmentModal({
  open, onClose, defaultDate, defaultPatient,
}: {
  open: boolean;
  onClose: () => void;
  defaultDate?: string;
  defaultPatient?: string;
}) {
  const { session, today, config, createAppointment, conflictsFor, notify } = useApp();
  const db = useClinicDb();
  const doctors = selectDoctors(db, session.tenantId);
  /* The type decides the length and the interval together: a 45-minute visit
     is offered at 45-minute steps, so every slot on screen is one it fits. */
  const types = appointmentTypes(config);
  const [typeId, setTypeId] = React.useState(types[0]?.id ?? "");
  const type = types.find((t) => t.id === typeId) ?? types[0];
  const duration = type?.minutes ?? config.default_duration;
  const SLOT_TIMES = React.useMemo(
    () => slotTimes(config.day_start, config.day_end, duration),
    [config.day_start, config.day_end, duration],
  );

  const [patient, setPatient] = React.useState<string | null>(defaultPatient ?? null);
  const [doctor, setDoctor] = React.useState(doctors[0]?.id ?? "");
  const [date, setDate] = React.useState(defaultDate ?? today);
  const [time, setTime] = React.useState("09:00");
  const [reason, setReason] = React.useState("");
  const [via, setVia] = React.useState<"front_desk" | "online" | "phone">("front_desk");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const doc = doctors[0]?.id ?? "";
    const day = defaultDate ?? today;
    /* open on a slot the clinician can actually take, not a fixed 09:00 */
    const first = types[0];
    const times = slotTimes(config.day_start, config.day_end, first?.minutes ?? duration);
    const firstFree = times.find((t) => conflictsFor(doc, day, t, first?.minutes ?? duration).length === 0)
      ?? times[0] ?? "";
    setPatient(defaultPatient ?? null);
    setDoctor(doc);
    setDate(day);
    setTypeId(first?.id ?? "");
    setTime(firstFree);
    setReason(first?.name ?? "");
    setTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* The clinician list arrives with the rest of the clinic. Opening the dialog
     before it lands used to leave the field empty and post an empty doctor_id,
     so adopt the first one as soon as there is one to adopt. */
  React.useEffect(() => {
    if (!open || doctor) return;
    const first = doctors[0]?.id;
    if (first) setDoctor(first);
  }, [open, doctor, doctors]);

  const conflicts = doctor && date && time ? conflictsFor(doctor, date, time, duration) : [];
  const taken = React.useMemo(() => {
    const set = new Set<string>();
    for (const t of SLOT_TIMES) if (conflictsFor(doctor, date, t, duration).length) set.add(t);
    return set;
  }, [doctor, date, duration, conflictsFor, SLOT_TIMES]);

  /* Changing the type moves the grid. Keep the chosen time if it is still on
     it and free; otherwise take the first free slot of the new grid. The
     reason follows the type until someone types their own. */
  const chooseType = (id: string) => {
    const next = types.find((t) => t.id === id);
    if (!next) return;
    const times = slotTimes(config.day_start, config.day_end, next.minutes);
    const free = (t: string) => conflictsFor(doctor, date, t, next.minutes).length === 0;
    if (!times.includes(time) || !free(time)) setTime(times.find(free) ?? times[0] ?? "");
    if (!reason.trim() || types.some((t) => t.name === reason.trim())) setReason(next.name);
    setTypeId(id);
  };


  const invalid = !patient || !doctor || !time || !reason.trim() || conflicts.length > 0;

  return (
    <Modal
      open={open}
      onClose={onClose}
      width="lg"
      title="Book an appointment"
      subtitle="Availability is checked against the doctor's existing bookings before the slot is held."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            /* a clash is not a validation message you can dismiss — the slot is gone */
            disabled={conflicts.length > 0 || saving}
            onClick={async () => {
              setTouched(true);
              if (invalid || saving) return;
              /* The confirmation has to follow the server, not the click: a
                 clash or a lost slot must not leave a "booked" toast behind. */
              setSaving(true);
              try {
                await createAppointment({
                  patient_id: patient!, doctor_id: doctor, date, time,
                  duration_min: duration, reason: reason.trim(), created_via: via,
                });
                notify({ tone: "ok", title: "Appointment booked", body: `${formatDate(date, "day")} at ${formatTime12(time)}.` });
                onClose();
              } catch {
                /* useTenantMutation already said why; the dialog stays open so
                   the slot can be changed without retyping everything. */
              } finally {
                setSaving(false);
              }
            }}
          >
            <IconCheck size={15} /> {saving ? "Booking…" : "Book slot"}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Patient" required error={touched && !patient ? "Choose a patient." : null}>
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Clinician" required>
            <Select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}{d.speciality ? ` — ${d.speciality}` : ""}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>

        <Field label="Appointment type" required>
          <ChoiceGroup
            value={type?.id ?? ""}
            onChange={chooseType}
            columns={types.length > 2 ? 3 : 2}
            options={types.map((t) => ({ value: t.id, label: t.name, description: formatLength(t.minutes) }))}
          />
        </Field>

        <div>
          <p className="mb-2 flex items-baseline justify-between gap-2 text-label font-medium text-ink">
            Slot
            <span className="text-caption font-normal text-ink-2">
              every {formatLength(duration)}{time ? ` · ${formatTime12(time)}–${formatTime12(addMinutes(time, duration))}` : ""}
            </span>
          </p>
          {SLOT_TIMES.length === 0 && (
            <p className="text-label text-critical-text">
              A {formatLength(duration)} visit doesn’t fit between the clinic’s opening and closing times.
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {SLOT_TIMES.map((t) => {
              const busy = taken.has(t);
              const on = t === time;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTime(t)}
                  className={[
                    "tnum rounded-[var(--r-sm)] border px-2.5 py-1.5 text-caption transition-all duration-150",
                    /* busy survives selection: picking a taken slot must still look taken */
                    busy
                      ? on
                        ? "border-critical bg-critical-soft text-critical-text line-through"
                        : "border-line bg-surface-2 text-ink-3 line-through"
                      : on
                        ? "border-accent bg-accent text-accent-ink"
                        : "border-line-strong bg-surface text-ink hover:border-accent hover:bg-accent-soft",
                  ].join(" ")}
                  title={busy ? "Clashes with an existing booking" : undefined}
                >
                  {formatTime12(t)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Booked via">
            <Select value={via} onChange={(e) => setVia(e.target.value as typeof via)}>
              <option value="front_desk">Front desk</option>
              <option value="phone">Phone</option>
              <option value="online">Online</option>
            </Select>
          </Field>
        </div>

        <Field label="Reason for visit" required error={touched && !reason.trim() ? "Say what the visit is for." : null}>
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                    placeholder="e.g. Six-month recall, upper left sensitivity" />
        </Field>

        {conflicts.length > 0 && (
          <div className="rounded-[var(--r)] border border-critical-border bg-critical-soft p-3">
            <p className="flex items-center gap-2 text-label font-semibold text-critical-text">
              <IconAlert size={15} /> That slot is already taken
            </p>
            <ul className="mt-2 space-y-1">
              {conflicts.map((c) => (
                <li key={c.id} className="tnum font-mono text-caption text-critical-text">
                  {formatTime12(c.time)}–{formatTime12(addMinutes(c.time, c.duration_min))} · {c.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}

function addMinutes(hhmm: string, mins: number) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** §3.5 — a walk-in skips Appointment entirely and lands straight in the queue. */
export function WalkInModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session, addWalkIn, notify } = useApp();
  const db = useClinicDb();
  const doctors = selectDoctors(db, session.tenantId);
  const [patient, setPatient] = React.useState<string | null>(null);
  const [doctor, setDoctor] = React.useState(doctors[0]?.id ?? "");
  const [reason, setReason] = React.useState("");
  const [priority, setPriority] = React.useState<"routine" | "urgent">("routine");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) { setPatient(null); setDoctor(doctors[0]?.id ?? ""); setReason(""); setPriority("routine"); setTouched(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add a walk-in"
      subtitle="Creates a queue entry directly — no appointment row, next token in today's sequence."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            onClick={() => {
              setTouched(true);
              if (!patient || !reason.trim()) return;
              addWalkIn({ patient_id: patient, doctor_id: doctor, reason: reason.trim(), priority });
              notify({ tone: "ok", title: "Token issued", body: "The patient is in the waiting room queue." });
              onClose();
            }}
          >
            <IconPlus size={15} /> Issue token
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Patient" required error={touched && !patient ? "Choose a patient." : null}>
          <PatientPicker value={patient} onChange={setPatient} />
        </Field>
        <Field label="Send to" required>
          <Select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
            {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Reason" required error={touched && !reason.trim() ? "Say what brought them in." : null}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Walk-in — chipped incisor" />
        </Field>
        <Field label="Priority">
          <ChoiceGroup
            value={priority}
            onChange={setPriority}
            options={[
              { value: "routine", label: "Routine", description: "Joins the queue in token order." },
              { value: "urgent", label: "Urgent", description: "Floats to the top of the board." },
            ]}
          />
        </Field>
        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-caption leading-relaxed text-ink-2">
          Walk-ins have no <code className="font-mono text-micro">appointment_id</code>. Everything downstream —
          consultation, prescription, billing — behaves identically either way.
        </p>
      </div>
      {priority === "urgent" && <Badge tone="critical" className="mt-4">Urgent tokens are called before routine ones</Badge>}
    </Modal>
  );
}
