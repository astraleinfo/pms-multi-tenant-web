"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useClinicDb } from "@/lib/query/hooks";
import { selectDoctors } from "@/lib/data/repository";
import { formatTime12, formatDate } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ChoiceGroup, Field, Input, Select, Textarea } from "@/components/ui/field";
import { PatientPicker } from "./patient";
import { Badge } from "@/components/ui/badge";
import { IconAlert, IconCheck, IconPlus } from "@/components/ui/icons";

/** Bookable slots come from the clinic's configuration, not a fixed list. */
function slotTimes(start: string, end: string, step: number, duration: number) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const out: string[] = [];
  for (let m = sh * 60 + sm; m + duration <= eh * 60 + em; m += step) {
    out.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
  }
  return out;
}

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
  const SLOT_TIMES = React.useMemo(
    () => slotTimes(config.day_start, config.day_end, config.slot_minutes, config.default_duration),
    [config.day_start, config.day_end, config.slot_minutes, config.default_duration],
  );

  const [patient, setPatient] = React.useState<string | null>(defaultPatient ?? null);
  const [doctor, setDoctor] = React.useState(doctors[0]?.id ?? "");
  const [date, setDate] = React.useState(defaultDate ?? today);
  const [time, setTime] = React.useState("09:00");
  const [duration, setDuration] = React.useState(config.default_duration);
  const [reason, setReason] = React.useState("");
  const [via, setVia] = React.useState<"front_desk" | "online" | "phone">("front_desk");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const doc = doctors[0]?.id ?? "";
    const day = defaultDate ?? today;
    /* open on a slot the clinician can actually take, not a fixed 09:00 */
    const firstFree = SLOT_TIMES.find((t) => conflictsFor(doc, day, t, config.default_duration).length === 0)
      ?? SLOT_TIMES[0];
    setPatient(defaultPatient ?? null);
    setDoctor(doc);
    setDate(day);
    setTime(firstFree);
    setDuration(config.default_duration);
    setReason("");
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
  }, [doctor, date, duration, conflictsFor]);


  const invalid = !patient || !doctor || !reason.trim() || conflicts.length > 0;

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

        <div>
          <p className="mb-2 text-[0.8125rem] font-medium text-ink">Slot</p>
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
                    "tnum rounded-[var(--r-sm)] border px-2.5 py-1.5 font-mono text-[0.75rem] transition-all duration-150",
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
          <Field label="Duration">
            <Select value={String(duration)} onChange={(e) => setDuration(Number(e.target.value))}>
              {[15, 20, 30, 45, 60].map((d) => <option key={d} value={d}>{d} minutes</option>)}
            </Select>
          </Field>
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
            <p className="flex items-center gap-2 text-[0.8125rem] font-semibold text-critical-text">
              <IconAlert size={15} /> That slot is already taken
            </p>
            <ul className="mt-2 space-y-1">
              {conflicts.map((c) => (
                <li key={c.id} className="tnum font-mono text-[0.75rem] text-critical-text">
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
        <p className="rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5 text-[0.75rem] leading-relaxed text-ink-2">
          Walk-ins have no <code className="font-mono text-[0.6875rem]">appointment_id</code>. Everything downstream —
          consultation, prescription, billing — behaves identically either way.
        </p>
      </div>
      {priority === "urgent" && <Badge tone="critical" className="mt-4">Urgent tokens are called before routine ones</Badge>}
    </Modal>
  );
}
