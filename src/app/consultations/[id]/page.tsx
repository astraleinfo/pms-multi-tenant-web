"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, useSchema, usePatient } from "@/lib/query/hooks";
import {
  billedOn, findEncounter, invoiceTotals, selectLabOrders,
  selectPrescriptions, userName, visitInvoices,
} from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { addDays, currency, formatDate, relativeDay } from "@/lib/format";
import { openPdfBlob } from "@/lib/pdf";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, KV } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { StatusPill } from "@/components/domain/status";
import { AllergyFlag, PatientChip } from "@/components/domain/patient";
import { ClinicalExamPanel } from "@/components/domain/clinical-exam";
import { DynamicSummary } from "@/components/domain/dynamic-form";
import { InvoiceComposer } from "@/components/domain/invoice-composer";
import { FollowUpBooking } from "@/components/domain/follow-up-booking";
import {
  IconArrowRight, IconCheck, IconChevronLeft, IconEdit, IconFlask, IconLock, IconPrint, IconReceipt, IconRx,
  IconStethoscope, IconUser,
} from "@/components/ui/icons";

export default function EncounterPage(props: PageProps<"/consultations/[id]">) {
  const { id } = React.use(props.params);
  /* the consultation form sends a just-signed visit here with ?followup=book */
  const sp = React.use(props.searchParams);
  const offerFollowUp = sp.followup === "book";
  const { session } = useApp();
  const db = useClinicDb();
  const encounter = findEncounter(db, session.tenantId, id);

  if (!encounter) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState
          icon={<IconStethoscope size={26} />}
          title="No such encounter in this clinic"
          body="This consultation doesn’t exist, or it has been removed."
          action={<ButtonLink href="/consultations" variant="secondary" size="sm"><IconChevronLeft size={14} /> All consultations</ButtonLink>}
        />
      </Card>
    );
  }
  return <EncounterView id={id} offerFollowUp={offerFollowUp} />;
}

function EncounterView({ id, offerFollowUp }: { id: string; offerFollowUp: boolean }) {
  const { session, updateEncounter, notify } = useApp();
  const db = useClinicDb();
  const { tenant, role } = useTenant();
  const t = session.tenantId;
  const encounter = findEncounter(db, t, id)!;
  const { data: patient } = usePatient(encounter.patient_id);
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  const [billing, setBilling] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const [followUpOffer, setFollowUpOffer] = React.useState(offerFollowUp);

  const printConsultation = async () => {
    setPrinting(true);
    try {
      openPdfBlob(await api.getConsultationPdf(encounter.id));
    } catch {
      notify({ tone: "warn", title: "Could not generate the print PDF" });
    } finally {
      setPrinting(false);
    }
  };

  const { data: allSchema } = useSchema("encounter");
  const schema = allSchema.filter((f) => f.field_key !== "chief_complaint");
  const prescriptions = selectPrescriptions(db, t).filter((r) => r.encounter_id === id);
  const labs = selectLabOrders(db, t).filter((l) => l.encounter_id === id);
  const invoices = visitInvoices(db, t, id);
  /* until the bill is paid, the visit is open to correction */
  const billed = billedOn(db, t, id);

  return (
    <>
      <PageHeader
        back={{ href: "/consultations", label: "Consultations" }}
        eyebrow={formatDate(encounter.date, "long")}
        title={encounter.diagnosis || encounter.chief_complaint}
        status={
          <Badge tone={encounter.status === "signed" ? "ok" : "warn"} size="sm" dot>
            {encounter.status === "signed" ? "Signed" : "Draft"}
          </Badge>
        }
        actions={
          <>
            <Button variant="ghost" onClick={() => void printConsultation()} disabled={printing}>
              <IconPrint size={15} /> {printing ? "Preparing…" : "Print"}
            </Button>
            {billed ? (
              <Badge tone="neutral" size="sm">
                <IconLock size={12} /> Paid on {billed.number} — locked
              </Badge>
            ) : (role === "doctor" || role === "tenant_admin") && (
              <ButtonLink href={`/consultations/${encounter.id}/edit`} variant="secondary">
                <IconEdit size={15} /> Edit
              </ButtonLink>
            )}
            {encounter.status === "draft" && !billed && (
              <Button
                variant="primary"
                onClick={() => {
                  updateEncounter(encounter.id, { sign: true })
                    .then(() => notify({ tone: "ok", title: "Encounter signed" }))
                    .catch(() => { /* useTenantMutation has said why */ });
                }}
              >
                <IconCheck size={15} /> Sign encounter
              </Button>
            )}
            {invoices.length === 0 && (
              <Button variant="secondary" onClick={() => setBilling(true)}>
                <IconReceipt size={15} /> Raise invoice
              </Button>
            )}
          </>
        }
        meta={
          <>
            <span>Recorded by {userName(db, encounter.doctor_id)} · {clinical.label} workflow</span>
            {patient && <AllergyFlag patient={patient} />}
          </>
        }
      />

      {followUpOffer && (
        <FollowUpBooking
          layout="offer"
          patientId={encounter.patient_id}
          doctorId={encounter.doctor_id}
          encounterDate={encounter.date}
          days={encounter.follow_up_days}
          onDismiss={() => setFollowUpOffer(false)}
        />
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader icon={<IconStethoscope size={15} />} tone="info" title="Consultation" subtitle={encounter.chief_complaint} />
            <CardBody className="space-y-5">
              <div>
                <Legend>Clinical notes</Legend>
                <p className="text-body leading-relaxed text-ink">{encounter.notes || "No notes recorded."}</p>
              </div>
              <div>
                <Legend>Assessment</Legend>
                <dl className="grid grid-cols-1 gap-x-4 sm:grid-cols-3">
                  <KV label="Diagnosis" value={encounter.diagnosis || "—"} />
                  <KV label="Follow-up" value={encounter.follow_up_days ? `${encounter.follow_up_days} days` : "None"} />
                  <KV
                    label="Review due"
                    value={encounter.follow_up_days
                      ? `${formatDate(addDays(encounter.date, encounter.follow_up_days), "long")} (${relativeDay(addDays(encounter.date, encounter.follow_up_days))})`
                      : "—"}
                  />
                </dl>
                {!!encounter.follow_up_days && (
                  /* the instruction alone books nothing: it reaches the
                     Follow-ups call list only as an appointment */
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                    <FollowUpBooking
                      patientId={encounter.patient_id}
                      doctorId={encounter.doctor_id}
                      encounterDate={encounter.date}
                      days={encounter.follow_up_days}
                    />
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader icon={<IconStethoscope size={15} />} tone="info" title={clinical.examLabel} hint="What was recorded in the exam at this visit." />
            <CardBody className="space-y-5">
              <ClinicalExamPanel clinicalType={tenant.clinical_type} ext={encounter.clinical_ext} readOnly />
              <div className="border-t border-line-soft pt-4">
                <Legend>Recorded fields</Legend>
                <DynamicSummary fields={schema} values={encounter.clinical_ext} />
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader tone="violet" icon={<IconRx size={16} />} title="Prescriptions raised here" />
            <CardBody className="pt-0">
              {prescriptions.length === 0 ? (
                <EmptyState compact icon={<IconRx size={20} />} title="Nothing prescribed at this visit" />
              ) : (
                prescriptions.map((rx) => (
                  <div key={rx.id} className="mb-3 rounded-[var(--r)] border border-line last:mb-0">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft px-3 py-2.5">
                      <span className="tnum font-mono text-caption text-ink-3">{rx.created_at}</span>
                      <StatusPill kind="prescription" status={rx.status} size="sm" />
                    </div>
                    <TableWrap>
                      <Table>
                        <THead>
                          <tr><TH>Medicine</TH><TH>Directions</TH><TH align="right">Dispensed</TH></tr>
                        </THead>
                        <TBody>
                          {rx.items.map((it) => (
                            <TR key={it.id}>
                              <TD>
                                <span className="block font-medium text-ink">{it.medicine}</span>
                                <span className="block text-caption text-ink-3">{it.strength}</span>
                              </TD>
                              <TD className="text-ink-2">
                                {it.dosage}, {it.frequency}, {it.duration}
                                {it.instructions && <span className="block text-caption text-ink-3">{it.instructions}</span>}
                              </TD>
                              <TD align="right" className="tnum font-mono">{it.dispensed_qty}/{it.qty}</TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </TableWrap>
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader tone="info" icon={<IconFlask size={16} />} title="Lab orders raised here"
                        hint="Results reach the patient record only after verification." />
            <CardBody className="pt-0">
              {labs.length === 0 ? (
                <EmptyState compact icon={<IconFlask size={20} />} title="No tests ordered at this visit" />
              ) : (
                <ul className="space-y-2.5">
                  {labs.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--r)] border border-line px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-label font-medium text-ink">{l.test_name}</p>
                        <p className="truncate text-caption text-ink-3">{l.panel} · {l.test_code}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusPill kind="lab" status={l.status} size="sm" />
                        <ButtonLink href="/lab" variant="ghost" size="sm">Open <IconArrowRight size={13} /></ButtonLink>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <aside className="space-y-5">
          {patient && (
            <Card>
              <CardHeader icon={<IconUser size={15} />} tone="accent" title="Patient" />
              <CardBody className="pt-0">
                <PatientChip patient={patient} size="lg" href={`/patients/${patient.id}`} />
                <dl className="mt-4 grid grid-cols-2 gap-x-3 border-t border-line-soft pt-4">
                  <KV label="Record" value={<span className="tnum font-mono text-label">{patient.mrn}</span>} />
                  <KV label="Phone" value={<span className="tnum font-mono text-label">{patient.phone}</span>} />
                </dl>
                {/* The name above is the link to the record — a button under
                    it to the same URL was the same door twice. This says the
                    thing the chip cannot: how long since they were last in. */}
                <p className="mt-3 text-caption text-ink-3">
                  {patient.last_visit
                    ? `Last seen ${relativeDay(patient.last_visit).toLowerCase()}`
                    : "No previous visit on file"}
                </p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader tone="ok" icon={<IconReceipt size={16} />} title="Billing" />
            <CardBody className="pt-0">
              {invoices.length === 0 ? (
                <>
                  <p className="text-label leading-relaxed text-ink-2">
                    Nothing has been billed for this visit. Line items can be suggested from the consultation,
                    any lab orders and anything dispensed.
                  </p>
                  <Button variant="primary" size="sm" className="mt-3 w-full" onClick={() => setBilling(true)}>
                    Compose invoice
                  </Button>
                </>
              ) : (
                <ul className="space-y-2">
                  {invoices.map((inv) => {
                    const tot = invoiceTotals(inv);
                    return (
                      <li key={inv.id}>
                        <ButtonLink href={`/billing/${inv.id}`} variant="secondary" size="sm" className="w-full justify-between">
                          <span className="tnum font-mono">{inv.number}</span>
                          <span className="tnum font-mono">{currency(tot.total)}</span>
                        </ButtonLink>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      {patient && (
        <InvoiceComposer
          open={billing}
          onClose={() => setBilling(false)}
          patientId={patient.id}
          encounterId={encounter.id}
        />
      )}
    </>
  );
}
