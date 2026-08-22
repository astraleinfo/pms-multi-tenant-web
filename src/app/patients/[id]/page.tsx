"use client";

import * as React from "react";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, usePatient, usePatientHistory, useSchema } from "@/lib/query/hooks";
import {
  invoiceTotals, selectAppointments, selectEncounters,
  selectInvoices, selectLabOrders, selectPrescriptions, userName,
} from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { age, currency, formatDate, formatTime12, pluralise, relativeDay } from "@/lib/format";
import type { HistoryEvent, Patient } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Avatar, EmptyState, KV, ScrollArea } from "@/components/ui/misc";
import { Tabs } from "@/components/ui/tabs";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/loader";
import { DynamicForm, DynamicSummary, validateAgainstSchema, type FormValues } from "@/components/domain/dynamic-form";
import { StatusPill } from "@/components/domain/status";
import { AllergyFlag } from "@/components/domain/patient";
import { AppointmentModal } from "@/components/domain/quick-actions";
import { ClinicalExamPanel } from "@/components/domain/clinical-exam";
import {
  IconCalendar, IconCheck, IconChevronLeft, IconFlask, IconMail, IconPhone, IconPin,
  IconReceipt, IconRx, IconStethoscope,
} from "@/components/ui/icons";

type Tab = "overview" | "history" | "clinical" | "orders" | "billing" | "edit";

const KIND_TONE: Record<string, Tone> = {
  registration: "neutral", appointment: "info", queue: "accent", encounter: "accent",
  prescription: "accent", lab: "warn", dispense: "ok", invoice: "warn", payment: "ok",
};

export default function PatientPage(props: PageProps<"/patients/[id]">) {
  const { id } = React.use(props.params);
  /* One record, read by id. A patient in another clinic answers 404, which is
     the same answer as one that does not exist — deliberately. */
  const { data: patient, isPending } = usePatient(id);

  if (isPending) return <PageLoader label="Opening the record…" />;
  if (!patient) return <NotHere />;
  return <PatientRecord patient={patient} />;
}

function NotHere() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        title="No such patient in this clinic"
        body="The record either belongs to another tenant or has been removed. Tenant scoping is applied to every read."
        action={<ButtonLink href="/patients" variant="secondary" size="sm"><IconChevronLeft size={14} /> Back to patients</ButtonLink>}
      />
    </Card>
  );
}

function PatientRecord({ patient }: { patient: Patient }) {
  const { session, today, updatePatient, notify, hasFeature } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const t = session.tenantId;
  const id = patient.id;

  const [tab, setTab] = React.useState<Tab>("overview");
  const [booking, setBooking] = React.useState(false);

  const { data: schema } = useSchema("patient");
  const encounters = selectEncounters(db, t).filter((e) => e.patient_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const prescriptions = selectPrescriptions(db, t).filter((r) => r.patient_id === id);
  const labs = selectLabOrders(db, t).filter((l) => l.patient_id === id);
  const invoices = selectInvoices(db, t).filter((i) => i.patient_id === id);
  const appts = selectAppointments(db, t).filter((a) => a.patient_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  /* §3.13 — composed on the server, across every module, in one read. */
  const { data: history = [] } = usePatientHistory(id);

  const owing = invoices.filter((i) => i.status !== "void").reduce((s, i) => s + invoiceTotals(i).balance, 0);
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;

  /* values as the dynamic form sees them: top-level columns + clinical_ext */
  const formValues = React.useMemo<FormValues>(() => ({
    full_name: patient.full_name, dob: patient.dob, sex: patient.sex, phone: patient.phone,
    email: patient.email ?? "", address: patient.address ?? "", blood_group: patient.blood_group ?? "",
    allergies: patient.allergies ?? "", ...patient.clinical_ext,
  }), [patient]);

  const [draft, setDraft] = React.useState<FormValues>(formValues);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setDraft(formValues); }, [formValues]);

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: "overview", label: "Overview" },
    { value: "history", label: "History", count: history.length },
    { value: "clinical", label: "Encounters", count: encounters.length },
    { value: "orders", label: "Prescriptions & lab", count: prescriptions.length + labs.length },
    ...(hasFeature("billing") ? [{ value: "billing" as Tab, label: "Billing", count: invoices.length }] : []),
    { value: "edit", label: "Edit record" },
  ];

  return (
    <>
      <PageHeader
        eyebrow={<span className="tnum font-mono">{patient.mrn}</span>}
        title={patient.full_name}
        description={`${age(patient.dob)} years · ${patient.sex} · registered ${formatDate(patient.registered_at, "long")}${patient.last_visit ? ` · last seen ${relativeDay(patient.last_visit).toLowerCase()}` : ""}`}
        actions={
          <>
            <Button variant="secondary" onClick={() => setBooking(true)}>
              <IconCalendar size={15} /> Book
            </Button>
            <ButtonLink href={`/consultations/new?patient=${patient.id}`} variant="primary">
              <IconStethoscope size={15} /> Start consultation
            </ButtonLink>
          </>
        }
        meta={
          <>
            <AllergyFlag patient={patient} />
            {patient.tags?.map((tag) => <Badge key={tag} tone="neutral" size="sm">{tag}</Badge>)}
            {owing > 0.005 && <Badge tone="warn" size="sm">{currency(owing)} outstanding</Badge>}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} tabs={tabs} className="mb-5" />

          {tab === "overview" && (
            <div className="space-y-5">
              <Card>
                <CardHeader title="Record" subtitle="Common fields, plus whatever this clinic and clinical type add." />
                <CardBody>
                  <DynamicSummary fields={schema} values={formValues} />
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <Card>
                  <CardHeader title="Recent visits" />
                  <CardBody className="pt-0">
                    {encounters.length === 0 ? (
                      <EmptyState compact title="No consultations yet" body="Nothing has been recorded for this patient." />
                    ) : (
                      <ul className="divide-y divide-line-soft">
                        {encounters.slice(0, 4).map((e) => (
                          <li key={e.id} className="py-2.5 first:pt-0 last:pb-0">
                            <div className="flex items-baseline justify-between gap-3">
                              <p className="truncate text-[0.8438rem] font-medium text-ink">{e.diagnosis || e.chief_complaint}</p>
                              <span className="tnum shrink-0 font-mono text-[0.75rem] text-ink-3">{formatDate(e.date)}</span>
                            </div>
                            <p className="mt-0.5 truncate text-[0.75rem] text-ink-3">{userName(db, e.doctor_id)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>

                <Card>
                  <CardHeader title="Upcoming" />
                  <CardBody className="pt-0">
                    {appts.filter((a) => a.date >= today && a.status === "scheduled").length === 0 ? (
                      <EmptyState compact title="Nothing booked"
                                  action={<Button size="sm" onClick={() => setBooking(true)}>Book a slot</Button>} />
                    ) : (
                      <ul className="divide-y divide-line-soft">
                        {appts.filter((a) => a.date >= today && a.status === "scheduled").map((a) => (
                          <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                            <span className="tnum w-20 shrink-0 font-mono text-[0.75rem] text-ink-2">
                              {formatDate(a.date)} {formatTime12(a.time)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{a.reason}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>
            </div>
          )}

          {tab === "history" && (
            <Card>
              <CardHeader
                title="Everything, chronologically"
                subtitle="Appointments, tokens, encounters, prescriptions, dispenses, results, invoices and payments — composed at read time."
              />
              <CardBody>
                {history.length === 0 ? (
                  <EmptyState title="Nothing recorded yet" />
                ) : (
                  <ScrollArea label={`History for ${patient.full_name}`} className="pr-1">
                    <ol className="relative space-y-4 pl-6">
                      <span className="absolute bottom-2 left-[5px] top-2 w-px bg-line" aria-hidden />
                      {history.map((h: HistoryEvent) => (
                        <li key={h.id} className="relative">
                          <span
                            className="absolute -left-6 top-1.5 h-[11px] w-[11px] rounded-full border-2 border-surface"
                            style={{ background: `var(--${h.tone ?? "neutral"})` }}
                            aria-hidden
                          />
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="text-[0.875rem] font-medium text-ink">{h.title}</p>
                            <span className="tnum shrink-0 font-mono text-[0.75rem] text-ink-3">{formatDate(h.at, "long")}</span>
                          </div>
                          {h.detail && <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-2">{h.detail}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <Badge tone={KIND_TONE[h.kind] ?? "neutral"} size="sm">{h.kind}</Badge>
                            {h.meta && <span className="text-[0.75rem] text-ink-3">{h.meta}</span>}
                            {h.href && (
                              <ButtonLink href={h.href} variant="ghost" size="sm" className="h-6 px-2 text-[0.75rem]">
                                Open
                              </ButtonLink>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </ScrollArea>
                )}
              </CardBody>
            </Card>
          )}

          {tab === "clinical" && (
            <div className="space-y-5">
              {encounters.length === 0 && (
                <Card><EmptyState icon={<IconStethoscope size={20} />} title="No encounters"
                                  body="Consultations recorded for this patient will appear here with their clinical payload." /></Card>
              )}
              {encounters.length > 0 && (
                <ScrollArea label="Encounters" className="-mx-0.5 space-y-5 px-0.5">
                  {encounters.map((e) => (
                    <Card key={e.id}>
                      <CardHeader
                        title={e.diagnosis || e.chief_complaint}
                        subtitle={`${formatDate(e.date, "long")} · ${userName(db, e.doctor_id)}`}
                        actions={
                          <>
                            <Badge tone={e.status === "signed" ? "ok" : "warn"} size="sm">{e.status}</Badge>
                            <ButtonLink href={`/consultations/${e.id}`} variant="ghost" size="sm">Open</ButtonLink>
                          </>
                        }
                      />
                      <CardBody className="space-y-4">
                        <div>
                          <Legend>Notes</Legend>
                          <p className="text-[0.875rem] leading-relaxed text-ink">{e.notes}</p>
                        </div>
                        <div>
                          <Legend>{clinical.examLabel}</Legend>
                          <ClinicalExamPanel clinicalType={tenant.clinical_type} ext={e.clinical_ext} readOnly />
                        </div>
                        {e.follow_up_days && (
                          <p className="text-[0.8125rem] text-ink-2">
                            Follow-up in {e.follow_up_days} days — due {formatDate(new Date(Date.parse(e.date) + e.follow_up_days * 86400000).toISOString().slice(0, 10), "long")}.
                          </p>
                        )}
                      </CardBody>
                    </Card>
                  ))}
                </ScrollArea>
              )}
            </div>
          )}

          {tab === "orders" && (
            <div className="space-y-5">
              <Card>
                <CardHeader icon={<IconRx size={16} />} title="Prescriptions"
                            subtitle="Written regardless of whether this clinic runs a pharmacy." />
                <CardBody className="pt-0">
                  {prescriptions.length === 0 ? (
                    <EmptyState compact title="Nothing prescribed" />
                  ) : (
                    <ScrollArea label="Prescriptions" maxHeight="min(46vh, 28rem)" className="pr-1">
                      <ul className="space-y-3">
                        {prescriptions.map((rx) => (
                          <li key={rx.id} className="rounded-[var(--r)] border border-line p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-[0.8438rem] font-medium text-ink">
                                {formatDate(rx.created_at.slice(0, 10), "long")} · {userName(db, rx.doctor_id)}
                              </p>
                              <StatusPill kind="prescription" status={rx.status} size="sm" />
                            </div>
                            <ul className="mt-2 space-y-1.5">
                              {rx.items.map((it) => (
                                <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-[0.8125rem]">
                                  <span className="text-ink">
                                    {it.medicine} <span className="text-ink-3">{it.strength}</span> — {it.dosage}, {it.frequency}, {it.duration}
                                  </span>
                                  <span className="tnum shrink-0 font-mono text-[0.75rem] text-ink-3">
                                    {it.dispensed_qty}/{it.qty}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ul>
                    </ScrollArea>
                  )}
                </CardBody>
              </Card>

              {hasFeature("lab") && (
                <Card>
                  <CardHeader icon={<IconFlask size={16} />} title="Lab orders"
                              subtitle="Only verified results are released to the record." />
                  <CardBody className="pt-0">
                    {labs.length === 0 ? (
                      <EmptyState compact title="No tests ordered" />
                    ) : (
                      <ScrollArea label="Lab orders" maxHeight="min(46vh, 28rem)" className="pr-1">
                        <ul className="space-y-3">
                          {labs.map((l) => (
                            <li key={l.id} className="rounded-[var(--r)] border border-line p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[0.8438rem] font-medium text-ink">{l.test_name}</p>
                                <StatusPill kind="lab" status={l.status} size="sm" />
                              </div>
                              <p className="mt-0.5 text-[0.75rem] text-ink-3">
                                {l.panel} · ordered {formatDate(l.ordered_at.slice(0, 10), "long")} by {userName(db, l.ordered_by)}
                              </p>
                              {l.status === "verified" ? (
                                <TableWrap className="mt-2.5">
                                  <Table>
                                    <THead>
                                      <tr><TH>Analyte</TH><TH>Value</TH><TH>Reference</TH><TH align="right">Flag</TH></tr>
                                    </THead>
                                    <TBody>
                                      {l.results.map((r) => (
                                        <TR key={r.analyte}>
                                          <TD>{r.analyte}</TD>
                                          <TD className="tnum font-mono">{r.value} {r.unit}</TD>
                                          <TD className="text-ink-3">{r.reference}</TD>
                                          <TD align="right">
                                            <Badge tone={r.flag === "normal" ? "ok" : r.flag === "high" ? "critical" : "warn"} size="sm">
                                              {r.flag}
                                            </Badge>
                                          </TD>
                                        </TR>
                                      ))}
                                    </TBody>
                                  </Table>
                                </TableWrap>
                              ) : (
                                <p className="mt-2 text-[0.75rem] text-warn-text">
                                  Results are withheld from the record until a technician verifies them.
                                </p>
                              )}
                            </li>
                          ))}
                        </ul>
                      </ScrollArea>
                    )}
                  </CardBody>
                </Card>
              )}
            </div>
          )}

          {tab === "billing" && (
            <Card className="overflow-hidden">
              <CardHeader icon={<IconReceipt size={16} />} title="Invoices"
                          subtitle={`${pluralise(invoices.length, "invoice")} · ${currency(owing)} outstanding`} />
              {invoices.length === 0 ? (
                <EmptyState compact title="Nothing billed" />
              ) : (
                <TableWrap maxHeight="min(62vh, 40rem)">
                  <Table>
                    <THead sticky>
                      <tr><TH>Invoice</TH><TH>Issued</TH><TH align="right">Total</TH><TH align="right">Paid</TH><TH align="right">Status</TH></tr>
                    </THead>
                    <TBody>
                      {invoices.map((inv) => {
                        const tot = invoiceTotals(inv);
                        return (
                          <TR key={inv.id}>
                            <TD>
                              <ButtonLink href={`/billing/${inv.id}`} variant="ghost" size="sm" className="h-7 px-2 font-mono text-[0.8125rem]">
                                {inv.number}
                              </ButtonLink>
                            </TD>
                            <TD className="tnum font-mono text-[0.8125rem] text-ink-2">{formatDate(inv.issued_at)}</TD>
                            <TD align="right" className="tnum font-mono">{currency(tot.total)}</TD>
                            <TD align="right" className="tnum font-mono text-ok-text">{currency(tot.paid)}</TD>
                            <TD align="right"><StatusPill kind="invoice" status={inv.status} size="sm" dot={false} /></TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
            </Card>
          )}

          {tab === "edit" && (
            <Card>
              <CardHeader title="Edit record" subtitle="Same resolved schema as registration — nothing here is hard coded." />
              <CardBody>
                <DynamicForm
                  fields={schema}
                  values={draft}
                  onChange={(k, v) => {
                    setDraft((prev) => ({ ...prev, [k]: v }));
                    setErrors((prev) => { const n = { ...prev }; delete n[k]; return n; });
                  }}
                  errors={errors}
                  showScopes
                />
              </CardBody>
              <CardFooter>
                <p className="text-[0.75rem] text-ink-3">Changes are held in the browser for this demo.</p>
                <div className="flex items-center gap-2.5">
                  <Button variant="ghost" onClick={() => setDraft(formValues)}>Reset</Button>
                  <Button
                    variant="primary"
                    onClick={() => {
                      const errs = validateAgainstSchema(schema, draft);
                      setErrors(errs);
                      if (Object.keys(errs).length) {
                        notify({ tone: "warn", title: "Required fields are blank" });
                        return;
                      }
                      updatePatient(patient.id, draft);
                      notify({ tone: "ok", title: "Record updated" });
                      setTab("overview");
                    }}
                  >
                    <IconCheck size={15} /> Save record
                  </Button>
                </div>
              </CardFooter>
            </Card>
          )}
        </div>

        {/* identity card */}
        <aside className="space-y-5">
          <Card>
            <CardBody className="pt-5">
              <div className="flex items-center gap-3">
                <Avatar name={patient.full_name} size="xl" tintKey={patient.id} />
                <div className="min-w-0">
                  <p className="truncate text-[1rem] font-semibold text-ink">{patient.full_name}</p>
                  <p className="tnum font-mono text-[0.75rem] text-ink-3">{patient.mrn}</p>
                </div>
              </div>

              <dl className="mt-4 space-y-3 border-t border-line-soft pt-4">
                <div className="flex items-start gap-2.5">
                  <IconPhone size={15} className="mt-0.5 shrink-0 text-ink-3" />
                  <span className="tnum font-mono text-[0.8125rem] text-ink">{patient.phone}</span>
                </div>
                {patient.email && (
                  <div className="flex items-start gap-2.5">
                    <IconMail size={15} className="mt-0.5 shrink-0 text-ink-3" />
                    <span className="min-w-0 break-all text-[0.8125rem] text-ink">{patient.email}</span>
                  </div>
                )}
                {patient.address && (
                  <div className="flex items-start gap-2.5">
                    <IconPin size={15} className="mt-0.5 shrink-0 text-ink-3" />
                    <span className="text-[0.8125rem] leading-snug text-ink">{patient.address}</span>
                  </div>
                )}
              </dl>

              <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-line-soft pt-4">
                <KV label="Date of birth" value={formatDate(patient.dob, "long")} />
                <KV label="Blood group" value={patient.blood_group ?? "—"} />
                <KV label="Visits" value={encounters.length} />
                <KV label="Last seen" value={patient.last_visit ? formatDate(patient.last_visit) : "Never"} />
              </dl>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Clinical profile" subtitle={clinical.label} />
            <CardBody className="pt-0">
              <DynamicSummary
                className="!grid-cols-1"
                fields={schema.filter((f) => f.scope !== "common")}
                values={formValues}
              />
            </CardBody>
          </Card>
        </aside>
      </div>

      <AppointmentModal open={booking} onClose={() => setBooking(false)} defaultPatient={patient.id} />
    </>
  );
}
