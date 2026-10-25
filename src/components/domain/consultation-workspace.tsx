"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, useSchema, usePatient } from "@/lib/query/hooks";
import { selectDoctors, selectEncounters, selectQueue } from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { applySeed, seedFromQueue } from "@/lib/encounter-prefill";
import type { Encounter, Prescription, PrescriptionItem } from "@/lib/types";
import { age, formatDate, relativeDay } from "@/lib/format";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, Numeral } from "@/components/ui/badge";
import { KV } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DynamicField } from "@/components/domain/dynamic-form";
import { AllergyFlag, PatientChip, PatientPicker } from "@/components/domain/patient";
import { ClinicalExamPanel } from "@/components/domain/clinical-exam";
import { PrescriptionEditor, emptyRxItem, type DraftRxItem } from "@/components/domain/prescription-editor";
import { LabOrderPicker, type DraftLabTest } from "@/components/domain/lab-order-picker";
import { FollowUpBooking, useFollowUpState } from "@/components/domain/follow-up-booking";
import {
  IconBookmark, IconCheck, IconFlask, IconRx, IconStethoscope, IconUser,
} from "@/components/ui/icons";

const FOLLOW_UP_PRESETS = [7, 14, 21, 28, 42, 90, 180];

const toDraft = (it: PrescriptionItem): DraftRxItem => ({
  ...emptyRxItem(),
  item_id: it.item_id ?? null, medicine: it.medicine, strength: it.strength, dosage: it.dosage,
  frequency: it.frequency, duration: it.duration, instructions: it.instructions ?? "", qty: it.qty,
});

/** What a prescription line says, without the row key the editor adds — two
 *  lists that read the same are the same prescription. */
const rxShape = (items: DraftRxItem[]) =>
  JSON.stringify(items.map((r) => [
    r.item_id ?? null, r.medicine.trim(), r.strength.trim(), r.dosage.trim(), r.frequency.trim(),
    r.duration.trim(), r.instructions.trim(), r.qty,
  ]));

/**
 * §3.7 — the consultation workspace. Records a new encounter, or, given
 * `editing`, corrects one that has not been billed yet: the same form, filled
 * in, saving over what is there instead of beside it.
 */
export function ConsultationWorkspace({
  queueId, patientId, focus, editing,
}: {
  queueId?: string;
  patientId?: string;
  focus?: "prescription" | "lab";
  editing?: { encounter: Encounter; prescription: Prescription | null };
}) {
  const router = useRouter();
  const {
    session, today, notify, createEncounter, updateEncounter, createPrescription, replacePrescription, createLabOrder,
  } = useApp();
  const original = editing?.encounter;
  /* stock already handed over: the prescription is a record of that now */
  const rxDispensed = !!editing?.prescription?.items.some((it) => it.dispensed_qty > 0);
  const db = useClinicDb();
  const { tenant, user, role } = useTenant();
  const t = session.tenantId;

  const queueEntry = queueId && !editing ? selectQueue(db, t).find((q) => q.id === queueId) ?? null : null;
  const [patient, setPatient] = React.useState<string | null>(original?.patient_id ?? queueEntry?.patient_id ?? patientId ?? null);
  const doctors = selectDoctors(db, t);
  const [doctor, setDoctor] = React.useState(
    original?.doctor_id ?? queueEntry?.doctor_id ?? (role === "doctor" ? user.id : doctors[0]?.id ?? ""),
  );

  const { data: schema } = useSchema("encounter");
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  /* Once, on arrival. Not `scrollIntoView` on every render — the reader may
     well have scrolled somewhere else by then. */
  React.useEffect(() => {
    if (!focus) return;
    document.getElementById(focus)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);

  const [complaint, setComplaint] = React.useState(original?.chief_complaint ?? queueEntry?.reason ?? "");

  /* The queue loads after this form can mount (a fresh tab, a stale cache), so
     the initial state above may have missed the entry. Fill in whatever is
     still empty once it shows up — never over what has been typed. */
  const seededFor = React.useRef<string | null>(queueEntry?.id ?? null);
  React.useEffect(() => {
    if (editing || !queueEntry || seededFor.current === queueEntry.id) return;
    seededFor.current = queueEntry.id;
    const next = applySeed({ patient, doctor, complaint }, seedFromQueue(queueEntry));
    setPatient(next.patient);
    setDoctor(next.doctor);
    setComplaint(next.complaint);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seeds once per entry
  }, [queueEntry?.id, editing]);
  const [notes, setNotes] = React.useState(original?.notes ?? "");
  const [diagnosis, setDiagnosis] = React.useState(original?.diagnosis ?? "");
  const savedFollowUp = original?.follow_up_days ?? null;
  const [followUp, setFollowUp] = React.useState<string>(
    savedFollowUp == null ? "" : FOLLOW_UP_PRESETS.includes(savedFollowUp) ? String(savedFollowUp) : "custom",
  );
  const [followUpCustom, setFollowUpCustom] = React.useState<string>(
    savedFollowUp != null && !FOLLOW_UP_PRESETS.includes(savedFollowUp) ? String(savedFollowUp) : "",
  );
  const [ext, setExt] = React.useState<Record<string, unknown>>(original?.clinical_ext ?? {});
  const [rx, setRx] = React.useState<DraftRxItem[]>(() => editing?.prescription?.items.map(toDraft) ?? []);
  const [saving, setSaving] = React.useState(false);
  const [tests, setTests] = React.useState<DraftLabTest[]>([]);
  const [labNote, setLabNote] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  const { data: record } = usePatient(patient ?? "");
  const past = record ? selectEncounters(db, t).filter((e) => e.patient_id === record.id && e.id !== original?.id).sort((a, b) => b.date.localeCompare(a.date)) : [];

  /* chief_complaint is a common encounter field — it is driven from its own control */
  const extraFields = schema.filter((f) => f.field_key !== "chief_complaint" && f.field_key !== "bp" && f.field_key !== "pulse");
  const vitalFields = schema.filter((f) => f.field_key === "bp" || f.field_key === "pulse");

  const followUpDays = followUp === "custom" ? (followUpCustom ? Number(followUpCustom) : null) : followUp ? Number(followUp) : null;
  const visitDate = original?.date ?? today;
  const followUpNow = useFollowUpState(patient, visitDate, followUpDays);
  /* Signed with a follow-up nobody has booked: the visit's page opens with
     the offer to book it. Never in the way of signing — only after it. */
  const afterSave = (id: string, sign: boolean) =>
    sign && followUpNow.kind === "open" ? `/consultations/${id}?followup=book` : `/consultations/${id}`;

  const save = async (sign: boolean) => {
    setTouched(true);
    if (!patient || !complaint.trim()) {
      notify({ tone: "warn", title: "A patient and a chief complaint are required" });
      return;
    }
    const usableRx = rx.filter((r) => r.medicine.trim());
    const rxLines = usableRx.map((r) => ({
      item_id: r.item_id,
      medicine: r.medicine.trim(), strength: r.strength.trim(), dosage: r.dosage.trim(),
      frequency: r.frequency.trim(), duration: r.duration.trim(),
      instructions: r.instructions.trim() || undefined, qty: r.qty,
    }));

    if (original) {
      setSaving(true);
      try {
        await updateEncounter(original.id, {
          chief_complaint: complaint.trim(),
          notes: notes.trim(),
          diagnosis: diagnosis.trim(),
          follow_up_days: followUpDays,
          clinical_ext: ext,
          ...(sign ? { sign: true } : {}),
        });
        /* only when it changed: an untouched prescription is not rewritten */
        if (!rxDispensed && rxShape(usableRx) !== rxShape((editing?.prescription?.items ?? []).map(toDraft))) {
          await replacePrescription(original.id, rxLines);
        }
        if (tests.length) {
          createLabOrder(original.id, patient, doctor, tests.map((x) => ({ ...x, note: labNote.trim() || undefined })));
        }
      } catch {
        /* useTenantMutation has said why — most likely paid meanwhile */
        setSaving(false);
        return;
      }
      notify({ tone: "ok", title: sign ? "Encounter signed" : "Consultation updated" });
      router.push(afterSave(original.id, sign));
      return;
    }

    const encounterId = await createEncounter({
      patient_id: patient,
      queue_entry_id: queueEntry?.id ?? null,
      doctor_id: doctor,
      date: today,
      chief_complaint: complaint.trim(),
      notes: notes.trim(),
      diagnosis: diagnosis.trim(),
      follow_up_days: followUpDays,
      clinical_ext: ext,
    }, sign);

    if (usableRx.length) {
      createPrescription(encounterId, patient, doctor, rxLines);
    }

    if (tests.length) {
      createLabOrder(encounterId, patient, doctor, tests.map((x) => ({ ...x, note: labNote.trim() || undefined })));
    }

    notify({
      tone: "ok",
      title: sign ? "Encounter signed" : "Draft saved",
      body: [
        usableRx.length ? `${usableRx.length} prescription line${usableRx.length === 1 ? "" : "s"}` : null,
        tests.length ? `${tests.length} lab order${tests.length === 1 ? "" : "s"}` : null,
        sign && queueEntry ? "queue token closed" : null,
      ].filter(Boolean).join(" · ") || undefined,
    });

    router.push(afterSave(encounterId, sign));
  };

  return (
    <>
      <PageHeader
        back={original
          ? { href: `/consultations/${original.id}`, label: "Consultation" }
          : { href: "/consultations", label: "Consultations" }}
        eyebrow={original
          ? `Editing · ${formatDate(original.date, "long")}`
          : queueEntry ? `Token ${String(queueEntry.token_no).padStart(2, "0")}` : "New encounter"}
        title={record ? record.full_name : "Consultation"}
        description={`Record what happened at this visit — the ${clinical.examLabel.toLowerCase()}, the diagnosis, and any prescription or tests.`}
        meta={record ? <AllergyFlag patient={record} /> : undefined}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader icon={<IconStethoscope size={15} />} tone="info" title="Visit" hint="Who is in the chair and what brought them in." />
            <CardBody className="space-y-4">
              {original ? (
                record && <PatientChip patient={record} size="lg" />
              ) : queueEntry ? (
                <div className="flex flex-wrap items-center gap-3 rounded-[var(--r)] border border-accent-border bg-accent-soft/50 p-3">
                  <Numeral tone="accent">{String(queueEntry.token_no).padStart(2, "0")}</Numeral>
                  {record && <PatientChip patient={record} className="flex-1" sub={queueEntry.reason} />}
                  <Badge tone={queueEntry.appointment_id ? "info" : "neutral"} size="sm">
                    {queueEntry.appointment_id ? "Booked" : "Walk-in"}
                  </Badge>
                </div>
              ) : (
                <Field label="Patient" required error={touched && !patient ? "Choose a patient." : null}>
                  <PatientPicker value={patient} onChange={setPatient} />
                </Field>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Clinician" required>
                  <Select value={doctor} onChange={(e) => setDoctor(e.target.value)} disabled={!!original}>
                    {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </Select>
                </Field>
                <Field label="Date">
                  <Input value={formatDate(original?.date ?? today, "long")} disabled />
                </Field>
              </div>

              <Field label="Chief complaint" required error={touched && !complaint.trim() ? "Record why they came." : null}>
                <Input value={complaint} onChange={(e) => setComplaint(e.target.value)}
                       placeholder={clinical.complaintExample} />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconStethoscope size={15} />} tone="info" title="Observations" hint="Common vitals, then whatever this clinical type asks for." />
            <CardBody className="space-y-5">
              <div>
                <Legend>Vitals</Legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {vitalFields.map((f) => (
                    <DynamicField
                      key={f.id}
                      def={f}
                      value={ext[f.field_key]}
                      onChange={(v) => setExt((p) => ({ ...p, [f.field_key]: v }))}
                    />
                  ))}
                </div>
              </div>

              {extraFields.length > 0 && (
                <div>
                  <Legend>{clinical.label} assessment</Legend>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {extraFields.map((f) => (
                      <DynamicField
                        key={f.id}
                        def={f}
                        value={ext[f.field_key]}
                        onChange={(v) => setExt((p) => ({ ...p, [f.field_key]: v }))}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <Legend>{clinical.examLabel}</Legend>
                <ClinicalExamPanel
                  clinicalType={tenant.clinical_type}
                  ext={ext}
                  onChange={(patch) => setExt((p) => ({ ...p, ...patch }))}
                />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconStethoscope size={15} />} tone="info" title="Assessment" hint="What you concluded and what happens next." />
            <CardBody className="space-y-4">
              <Field label="Diagnosis">
                <Input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)}
                       placeholder="Dentine hypersensitivity" />
              </Field>
              <Field label="Clinical notes">
                <Textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)}
                          placeholder="What you saw, what you did, what you advised." />
              </Field>
              <Field label="Follow-up" help={followUpDays ? undefined : "Leave blank if no review is needed."}>
                <div className="flex gap-2">
                  <Select
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    className={followUp === "custom" ? "w-1/2" : undefined}
                  >
                    <option value="">No follow-up</option>
                    {FOLLOW_UP_PRESETS.map((d) => <option key={d} value={d}>In {d} days</option>)}
                    <option value="custom">Custom…</option>
                  </Select>
                  {followUp === "custom" && (
                    <Input
                      type="number"
                      min={0}
                      max={3650}
                      value={followUpCustom}
                      onChange={(e) => setFollowUpCustom(e.target.value)}
                      placeholder="Days"
                      className="w-1/2"
                    />
                  )}
                </div>
                <FollowUpBooking
                  layout="hint"
                  patientId={patient}
                  doctorId={doctor}
                  encounterDate={visitDate}
                  days={followUpDays}
                />
              </Field>
            </CardBody>
          </Card>

          <Card id="prescription" className="scroll-mt-20">
            <CardHeader tone="violet" icon={<IconRx size={16} />} title="Prescription"
                        hint="Core — available whether or not this clinic sells medicines." />
            <CardBody className="pt-0">
              {rxDispensed ? (
                <p className="text-label leading-relaxed text-ink-2">
                  The pharmacy has already dispensed from this prescription, so it stays as it was written.
                </p>
              ) : (
                <PrescriptionEditor items={rx} onChange={setRx} />
              )}
            </CardBody>
          </Card>

          <Card id="lab" className="scroll-mt-20">
            <CardHeader tone="info" icon={<IconFlask size={16} />} title={original ? "Add lab orders" : "Lab orders"}
                        hint={original
                          ? "Tests already ordered stay as they are; anything picked here is ordered in addition."
                          : "Tests are ordered from the encounter and travel with it."} />
            <CardBody className="pt-0">
              <LabOrderPicker selected={tests} onChange={setTests} note={labNote} onNote={setLabNote} />
            </CardBody>
          </Card>
        </div>

        {/* context rail */}
        <aside className="space-y-5">
          <div className="lg:sticky lg:top-[calc(var(--topbar-h)+1.25rem)] space-y-5">
            <Card>
              <CardHeader icon={<IconCheck size={15} />} tone="ok" title="Save"
                          hint={original
                            ? "Open to correction until the bill is paid."
                            : "Signing closes the token and releases the record."} />
              <CardBody className="space-y-2.5 pt-0">
                {original?.status === "signed" ? (
                  <Button variant="primary" className="w-full" onClick={() => void save(false)} disabled={saving}>
                    <IconCheck size={15} /> {saving ? "Saving…" : "Save changes"}
                  </Button>
                ) : (
                  <>
                    <Button variant="primary" className="w-full" onClick={() => void save(true)} disabled={saving}>
                      <IconCheck size={15} /> Sign and complete
                    </Button>
                    <Button variant="secondary" className="w-full" onClick={() => void save(false)} disabled={saving}>
                      <IconBookmark size={15} /> Save as draft
                    </Button>
                  </>
                )}
                <ul className="mt-2 space-y-1.5 border-t border-line-soft pt-3 text-caption leading-snug text-ink-2">
                  {rx.filter((r) => r.medicine.trim()).length > 0 && (
                    <li>· Prescription with {rx.filter((r) => r.medicine.trim()).length} line{rx.filter((r) => r.medicine.trim()).length === 1 ? "" : "s"}.</li>
                  )}
                  {tests.length > 0 && <li>· {tests.length} lab order{tests.length === 1 ? "" : "s"} raised.</li>}
                  {queueEntry && <li>· Token {String(queueEntry.token_no).padStart(2, "0")} marked completed on sign.</li>}
                </ul>
              </CardBody>
            </Card>

            {record && (
              <Card>
                <CardHeader icon={<IconUser size={15} />} tone="accent" title="Patient context" subtitle={`${record.mrn} · ${age(record.dob)} years`} />
                <CardBody className="pt-0">
                  <AllergyFlag patient={record} />
                  <dl className="mt-3 grid grid-cols-2 gap-x-3">
                    <KV label="Blood group" value={record.blood_group ?? "—"} />
                    <KV label="Last seen" value={record.last_visit ? relativeDay(record.last_visit) : "Never"} />
                  </dl>
                  {past.length > 0 && (
                    <>
                      <Legend className="mt-4">Previously</Legend>
                      <ul className="space-y-2">
                        {past.slice(0, 3).map((e) => (
                          <li key={e.id} className="text-caption leading-snug">
                            <span className="tnum font-mono text-ink-3">{formatDate(e.date)}</span>
                            <span className="ml-2 text-ink">{e.diagnosis || e.chief_complaint}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </CardBody>
              </Card>
            )}

          </div>
        </aside>
      </div>
    </>
  );
}
