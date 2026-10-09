"use client";

import * as React from "react";
import Link from "next/link";
import * as api from "@/lib/api";
import { openPdfBlob } from "@/lib/pdf";
import { PatientConsents } from "@/components/consent/patient-consents";
import { useApp, useTenant } from "@/lib/store/app-store";
import { useClinicDb, usePatient, usePatientHistory, usePatientNotes, useSchema } from "@/lib/query/hooks";
import {
  invoiceTotals, selectAppointments, selectEncounters,
  selectInvoices, selectLabOrders, selectPrescriptions, userName,
} from "@/lib/data/repository";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import {
  addDays, age, currency, daysBetween, formatDate, formatTime12, pluralise, relativeDay,
  today as todayIso,
} from "@/lib/format";
import { isBooked, type HistoryEvent, type Patient } from "@/lib/types";
import { PageHeader, MetaItem } from "@/components/ui/page-header";
import { Card, CardBody, CardFooter, CardHeader, Legend } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge, type Tone } from "@/components/ui/badge";
import { Avatar, EmptyState, ScrollArea } from "@/components/ui/misc";
import { Tip } from "@/components/ui/callout";
import { Tabs } from "@/components/ui/tabs";
import { Tooltip } from "@/components/ui/info";
import { Table, TableWrap, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { PageLoader } from "@/components/ui/loader";
import { DynamicForm, summaryRows, validateAgainstSchema, type FormValues } from "@/components/domain/dynamic-form";
import { ActionItem, ActionList, DataList, DataRow } from "@/components/ui/data-list";
import { LabFlag, StatusPill, statusLabel } from "@/components/domain/status";
import { AllergyFlag } from "@/components/domain/patient";
import { PatientAccountSummary } from "@/components/domain/patient-account";
import { AppointmentModal } from "@/components/domain/quick-actions";
import { ClinicalExamPanel } from "@/components/domain/clinical-exam";
import { LatestNote, PatientNotes } from "@/components/domain/patient-notes";
import {
  IconAlert, IconCalendar, IconCard, IconCheck, IconChevronLeft, IconChevronRight, IconClock,
  IconEdit, IconFlask, IconMail, IconNote, IconPhone, IconPin, IconPrint, IconReceipt, IconRx,
  IconShield, IconStethoscope, IconUser, IconUsers,
} from "@/components/ui/icons";

type Tab = "overview" | "history" | "clinical" | "notes" | "orders" | "consent" | "billing" | "edit";

/** Held in the Contact panel instead of among the record's rows. */
const CONTACT_KEYS = new Set(["phone", "email", "address"]);

const TABS: readonly Tab[] = ["overview", "history", "clinical", "notes", "orders", "consent", "billing", "edit"];

export default function PatientPage(props: PageProps<"/patients/[id]">) {
  const { id } = React.use(props.params);
  const sp = React.use(props.searchParams);
  /* a screen that sends someone back here can say which tab — the consent
     signing screen returns to Consent, not to the top of the record */
  const asked = typeof sp.tab === "string" ? sp.tab : "";
  const initial: Tab = (TABS as readonly string[]).includes(asked) ? (asked as Tab) : "overview";
  /* One record, read by id. A patient in another clinic answers 404, which is
     the same answer as one that does not exist — deliberately. */
  const { data: patient, isPending } = usePatient(id);

  if (isPending) return <PageLoader label="Opening the record…" />;
  if (!patient) return <NotHere />;
  return <PatientRecord patient={patient} initial={initial} />;
}

function NotHere() {
  return (
    <Card className="mx-auto max-w-lg">
      <EmptyState
        icon={<IconUser size={26} />}
        title="No such patient in this clinic"
        body="The record either belongs to another tenant or has been removed. Tenant scoping is applied to every read."
        action={<ButtonLink href="/patients" variant="secondary" size="sm"><IconChevronLeft size={14} /> Back to patients</ButtonLink>}
      />
    </Card>
  );
}

/**
 * How the clinic stands with this person, in one word.
 *
 * There is no status column on a patient and there should not be one — nobody
 * sets it, so it would be wrong within a year. It is read off the record
 * instead: somebody seen inside a year is active, somebody registered and
 * never seen is new, and somebody who has not been in for over a year is
 * dormant, which is the one worth saying out loud before a clinician starts
 * reading a history that stops abruptly.
 */
function standing(patient: Patient): { tone: Tone; label: string } {
  if (!patient.last_visit) return { tone: "info", label: "New" };
  return daysBetween(patient.last_visit, todayIso()) > 365
    ? { tone: "neutral", label: "Dormant" }
    : { tone: "ok", label: "Active" };
}

function PatientRecord({ patient, initial }: { patient: Patient; initial: Tab }) {
  const { session, today, updatePatient, notify, can } = useApp();
  const db = useClinicDb();
  const { tenant } = useTenant();
  const t = session.tenantId;
  const id = patient.id;

  const [tab, setTab] = React.useState<Tab>(initial);
  const [booking, setBooking] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);

  /* Not the screen printed: a document drawn on the server from the record,
     on the clinic's letterhead, with only the sections this role may read. */
  const printRecord = async () => {
    setPrinting(true);
    try {
      openPdfBlob(await api.getPatientRecordPdf(id));
    } catch {
      notify({ tone: "warn", title: "Could not prepare the record for printing" });
    } finally {
      setPrinting(false);
    }
  };

  const { data: schema } = useSchema("patient");
  const encounters = selectEncounters(db, t).filter((e) => e.patient_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const prescriptions = selectPrescriptions(db, t).filter((r) => r.patient_id === id);
  const labs = selectLabOrders(db, t).filter((l) => l.patient_id === id);
  const invoices = selectInvoices(db, t).filter((i) => i.patient_id === id);
  const appts = selectAppointments(db, t).filter((a) => a.patient_id === id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const upcoming = appts
    .filter((a) => a.date >= today && isBooked(a.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  /* §3.13 — composed on the server, across every module, in one read. */
  const { data: history = [] } = usePatientHistory(id);
  /* Notes are clinical: read under the consultation's permission, so a role
     that cannot read encounters is not shown the tab or sent the notes. */
  const seesNotes = can("encounter:read");
  const { data: notes = [] } = usePatientNotes(id);

  const owing = invoices.filter((i) => i.status !== "void").reduce((s, i) => s + invoiceTotals(i).balance, 0);
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const state = standing(patient);

  /* values as the dynamic form sees them: top-level columns + clinical_ext */
  const formValues = React.useMemo<FormValues>(() => ({
    full_name: patient.full_name, dob: patient.dob, sex: patient.sex, phone: patient.phone,
    email: patient.email ?? "", address: patient.address ?? "", blood_group: patient.blood_group ?? "",
    allergies: patient.allergies ?? "", ...patient.clinical_ext,
  }), [patient]);

  const [draft, setDraft] = React.useState<FormValues>(formValues);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setDraft(formValues); }, [formValues]);

  /* The record card is two columns and they are not halves of one list: the
     left is who this person is, the right is what this clinic knows about
     them. Splitting a single run of fields down the middle put "blood group"
     under "registered on" for no reason anybody could read off the page. */
  const commonRows = React.useMemo(
    /* Phone, email and address are left out on purpose: they are in the
       Contact panel, where they are dialable and mailable rather than
       printed. Listing them twice made the record longer and neither copy
       better. */
    () => summaryRows(
      schema.filter((f) => f.scope === "common" && !CONTACT_KEYS.has(f.field_key)),
      formValues,
    ),
    [schema, formValues],
  );
  const clinicalRows = React.useMemo(
    () => summaryRows(schema.filter((f) => f.scope !== "common"), formValues),
    [schema, formValues],
  );

  /* What is open on this patient.
     Not a restatement of the tab counts — those say how much is filed, this
     says how much is unfinished, which is the only one of the two that asks
     anybody to do something. Lab and money follow the reader's own
     permissions: a role that cannot read the lab is not loaded its orders,
     and an empty pane would read as "nothing ordered". */
  const followUp = React.useMemo(() => {
    const last = encounters.find((e) => e.follow_up_days);
    if (!last?.follow_up_days) return null;
    const due = addDays(last.date, last.follow_up_days);
    return due <= today ? due : null;
  }, [encounters, today]);

  const unsigned = encounters.filter((e) => e.status === "draft").length;
  const seesLab = can("lab:read");
  const seesBilling = can("billing:read");
  const undispensed = prescriptions.filter((r) => r.status !== "dispensed").length;
  const unverified = labs.filter((l) => l.status !== "verified").length;

  /* Who actually sees this person.
     The visits table names a clinician per row for the last five; this is the
     shape of the whole file — useful to a receptionist booking a follow-up,
     who wants the doctor this patient knows rather than the next free slot. */
  const careTeam = React.useMemo(() => {
    const by = new Map<string, { id: string; visits: number; last: string }>();
    for (const e of encounters) {
      const seen = by.get(e.doctor_id);
      if (seen) { seen.visits += 1; if (e.date > seen.last) seen.last = e.date; }
      else by.set(e.doctor_id, { id: e.doctor_id, visits: 1, last: e.date });
    }
    return [...by.values()].sort((a, b) => b.visits - a.visits || b.last.localeCompare(a.last));
  }, [encounters]);

  const open: Array<{ key: string; icon: React.ReactNode; label: string; tab: Tab }> = [
    ...(followUp && upcoming.length === 0
      ? [{
          key: "follow-up", icon: <IconCalendar size={16} />, tab: "history" as Tab,
          label: `Follow-up was due ${formatDate(followUp)} — nothing booked`,
        }]
      : []),
    ...(unsigned
      ? [{
          key: "unsigned", icon: <IconStethoscope size={16} />, tab: "clinical" as Tab,
          label: `${pluralise(unsigned, "encounter")} still unsigned`,
        }]
      : []),
    ...(undispensed
      ? [{
          key: "rx", icon: <IconRx size={16} />, tab: "orders" as Tab,
          label: `${pluralise(undispensed, "prescription")} awaiting the counter`,
        }]
      : []),
    ...(unverified
      ? [{
          key: "lab", icon: <IconFlask size={16} />, tab: "orders" as Tab,
          label: `${pluralise(unverified, "lab result")} not yet verified`,
        }]
      : []),
    ...(owing > 0.005
      ? [{
          key: "owing", icon: <IconReceipt size={16} />, tab: "billing" as Tab,
          label: `${currency(owing)} outstanding on this account`,
        }]
      : []),
  ];

  const tabs: Array<{ value: Tab; label: string; icon: React.ReactNode; count?: number }> = [
    { value: "overview", label: "Overview", icon: <IconUser size={15} /> },
    { value: "history", label: "History", icon: <IconClock size={15} />, count: history.length },
    { value: "clinical", label: "Encounters", icon: <IconStethoscope size={15} />, count: encounters.length },
    ...(seesNotes
      ? [{ value: "notes" as Tab, label: "Notes", icon: <IconNote size={15} />, count: notes.length }]
      : []),
    { value: "orders", label: "Prescriptions & lab", icon: <IconRx size={15} />, count: prescriptions.length + labs.length },
    ...(can("consent:read")
      ? [{ value: "consent" as Tab, label: "Consent", icon: <IconShield size={15} /> }]
      : []),
    ...(seesBilling
      ? [{ value: "billing" as Tab, label: "Financial", icon: <IconReceipt size={15} />, count: invoices.length }]
      : []),
    { value: "edit", label: "Edit record", icon: <IconEdit size={15} /> },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/patients", label: "Patients" }}
        leading={<Avatar name={patient.full_name} size="xl" tintKey={patient.id} />}
        title={patient.full_name}
        status={<Badge tone={state.tone} size="sm" dot>{state.label}</Badge>}
        actions={
          <>
            {/* Everything the overflow menu used to hold — edit, history,
                orders, invoices — is a tab three inches to the left. Printing
                is the only thing that was not, so it is the only thing left,
                and a one-item menu is just a button. */}
            <Tooltip label={printing ? "Preparing…" : "Print this record"} side="top">
              <Button
                variant="secondary" size="icon" onClick={printRecord} disabled={printing}
                aria-label="Print this record" aria-busy={printing}
              >
                <IconPrint size={17} />
              </Button>
            </Tooltip>
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
            <span className="tnum font-mono text-ink-2">{patient.mrn}</span>
            <span>{age(patient.dob)} years · {patient.sex} · {formatDate(patient.dob, "long")}</span>
            <MetaItem icon={<IconCalendar size={13} />}>
              Registered {formatDate(patient.registered_at, "long")}
              {patient.last_visit ? ` · last seen ${relativeDay(patient.last_visit).toLowerCase()}` : ""}
            </MetaItem>
            <AllergyFlag patient={patient} />
            {patient.tags?.map((tag) => <Badge key={tag} tone="neutral" size="sm">{tag}</Badge>)}
            {/* What is owed is in "Needs attention", where it is a link to the
                account rather than a number to read twice. */}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} tabs={tabs} className="mb-5" />

          {tab === "overview" && (
            <div className="space-y-5">
              <Card>
                <CardHeader
                  icon={<IconUser size={15} />} tone="accent" title="Patient information"
                  hint="Common fields, plus whatever this clinic and clinical type add. Contact details are in the panel beside this one, where they can be dialled."
                />
                <CardBody>
                  <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-2">
                    <DataList>
                      {commonRows.map((r) => <DataRow key={r.key} label={r.label} value={r.value} />)}
                    </DataList>
                    <DataList>
                      <DataRow label="Patient ID" value={patient.mrn} mono />
                      <DataRow label="Registered on" value={formatDate(patient.registered_at, "long")} />
                      <DataRow
                        label="Last seen"
                        value={patient.last_visit ? formatDate(patient.last_visit, "long") : "Never"}
                        hint={patient.last_visit ? `(${relativeDay(patient.last_visit)})` : undefined}
                      />
                      <DataRow label="Total visits" value={encounters.length} mono />
                      {clinicalRows.map((r) => <DataRow key={r.key} label={r.label} value={r.value} />)}
                    </DataList>
                  </div>
                </CardBody>
              </Card>

              <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
                <Card className="overflow-hidden">
                  {/* No "view all": the Encounters tab above is that link, and
                      it already carries the count. */}
                  <CardHeader
                    icon={<IconClock size={15} />} tone="warn" title="Recent visits"
                    subtitle={encounters.length > 5 ? `Latest 5 of ${encounters.length}` : undefined}
                  />
                  {encounters.length === 0 ? (
                    <EmptyState
                      icon={<IconStethoscope size={26} />} title="No consultations yet"
                      body="Nothing has been recorded for this patient. Start one from the button above."
                    />
                  ) : (
                    <TableWrap>
                      {/* No floor. This table sits in a half-width card, and a
                          floor wider than the card scrolls the status out of
                          sight on a screen with room to spare. */}
                      <Table minWidth="0">
                        <THead>
                          <tr>
                            <TH className="px-3">Date</TH>
                            <TH className="px-3">Reason</TH>
                            <TH className="px-3">Provider</TH>
                            <TH align="right" className="px-3">Status</TH>
                          </tr>
                        </THead>
                        <TBody>
                          {encounters.slice(0, 5).map((e) => (
                            <TR key={e.id}>
                              <TD className="tnum whitespace-nowrap px-3 font-mono text-ink-2">{formatDate(e.date)}</TD>
                              {/* `w-full max-w-0` is the table trick for "take
                                  what is left and truncate": a cell cannot be
                                  told to shrink any other way. */}
                              <TD className="w-full max-w-0 px-3">
                                {/* the cell is the link, not the row: a row
                                    with a click handler cannot be reached from
                                    the keyboard or opened in a new tab */}
                                <Link
                                  href={`/consultations/${e.id}`}
                                  className="block truncate font-medium text-ink transition-colors hover:text-accent-text"
                                >
                                  {e.diagnosis || e.chief_complaint}
                                </Link>
                              </TD>
                              <TD className="max-w-[9rem] truncate px-3 text-ink-2">{userName(db, e.doctor_id)}</TD>
                              <TD align="right" className="px-3">
                                <Badge tone={e.status === "signed" ? "ok" : "warn"} size="sm">
                                  {e.status === "signed" ? "Completed" : "Draft"}
                                </Badge>
                              </TD>
                            </TR>
                          ))}
                        </TBody>
                      </Table>
                    </TableWrap>
                  )}
                </Card>

                <Card>
                  <CardHeader
                    icon={<IconCalendar size={15} />} tone="violet" title="Upcoming appointments"
                    subtitle={upcoming.length > 0 ? pluralise(upcoming.length, "booking") : undefined}
                  />
                  <CardBody className="pt-0">
                    {upcoming.length === 0 ? (
                      <EmptyState
                        icon={<IconCalendar size={26} />} title="No upcoming appointments"
                        body="Nothing is scheduled for this patient. Book from the button above."
                      />
                    ) : (
                      <ul className="divide-y divide-line-soft">
                        {upcoming.map((a) => (
                          <li key={a.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                            <span className="tnum w-24 shrink-0 font-mono text-caption text-ink-2">
                              {formatDate(a.date)} {formatTime12(a.time)}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-label text-ink">{a.reason}</span>
                            <StatusPill kind="appointment" status={a.status} size="sm" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </div>

              <Tip dismissKey="patient-record-tabs">
                Use the tabs above for this patient&rsquo;s full history, encounters, prescriptions
                and lab results.
              </Tip>
            </div>
          )}

          {tab === "history" && (
            <Card>
              <CardHeader
                icon={<IconClock size={15} />} tone="warn" title="Everything, chronologically"
                hint="Appointments, tokens, encounters, prescriptions, dispenses, results, invoices and payments — composed at read time."
              />
              <CardBody>
                {history.length === 0 ? (
                  <EmptyState icon={<IconClock size={26} />} title="Nothing recorded yet" />
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
                          {/* The title already says what kind of event it was, so it
                              carries no type pill; it is the link when there is one. */}
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            {h.href ? (
                              <Link href={h.href} className="text-body font-medium text-ink hover:text-accent-text hover:underline">
                                {h.title}
                              </Link>
                            ) : (
                              <p className="text-body font-medium text-ink">{h.title}</p>
                            )}
                            <span className="tnum shrink-0 text-caption text-ink-3">{formatDate(h.at, "long")}</span>
                          </div>
                          {(h.detail || h.meta) && (
                            <p className="mt-1 text-label leading-relaxed text-ink-2">
                              {h.meta && h.detail ? h.detail.replace(/\.$/, "") : h.detail}
                              {h.detail && h.meta && " · "}
                              {h.meta && <span className="text-ink-3">{statusLabel(h.meta)}</span>}
                            </p>
                          )}
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
                <Card>
                  <EmptyState
                    icon={<IconStethoscope size={26} />} title="No encounters"
                    body="Consultations recorded for this patient will appear here."
                  />
                </Card>
              )}
              {encounters.length > 0 && (
                <ScrollArea label="Encounters" className="-mx-0.5 space-y-5 px-0.5">
                  {encounters.map((e) => (
                    <Card key={e.id}>
                      <CardHeader
                        icon={<IconStethoscope size={15} />} tone="info" title={e.diagnosis || e.chief_complaint}
                        subtitle={`${formatDate(e.date, "long")} · ${userName(db, e.doctor_id)}`}
                        actions={
                          <>
                            {e.status !== "signed" && <Badge tone="warn" size="sm" dot>Draft</Badge>}
                            <ButtonLink href={`/consultations/${e.id}`} variant="ghost" size="sm">Open</ButtonLink>
                          </>
                        }
                      />
                      <CardBody className="space-y-4">
                        <div>
                          <Legend>Notes</Legend>
                          <p className="text-body leading-relaxed text-ink">{e.notes}</p>
                        </div>
                        <div>
                          <Legend>{clinical.examLabel}</Legend>
                          <ClinicalExamPanel clinicalType={tenant.clinical_type} ext={e.clinical_ext} readOnly />
                        </div>
                        {e.follow_up_days && (
                          <p className="text-label text-ink-2">
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

          {tab === "notes" && seesNotes && <PatientNotes patient={patient} />}

          {tab === "orders" && (
            <div className="space-y-5">
              <Card>
                <CardHeader tone="violet" icon={<IconRx size={16} />} title="Prescriptions"
                            hint="Written regardless of whether this clinic runs a pharmacy." />
                <CardBody className="pt-0">
                  {prescriptions.length === 0 ? (
                    <EmptyState compact icon={<IconRx size={20} />} title="Nothing prescribed" />
                  ) : (
                    <ScrollArea label="Prescriptions" maxHeight="min(46vh, 28rem)" className="pr-1">
                      <ul className="space-y-3">
                        {prescriptions.map((rx) => (
                          <li key={rx.id} className="rounded-[var(--r)] border border-line p-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-label font-medium text-ink">
                                {formatDate(rx.created_at.slice(0, 10), "long")} · {userName(db, rx.doctor_id)}
                              </p>
                              <StatusPill kind="prescription" status={rx.status} size="sm" />
                            </div>
                            <ul className="mt-2 space-y-1.5">
                              {rx.items.map((it) => (
                                <li key={it.id} className="flex flex-wrap items-baseline justify-between gap-x-3 text-label">
                                  <span className="text-ink">
                                    {it.medicine} <span className="text-ink-3">{it.strength}</span> — {it.dosage}, {it.frequency}, {it.duration}
                                  </span>
                                  <span className="tnum shrink-0 font-mono text-caption text-ink-3">
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

              {seesLab && (
                <Card>
                  <CardHeader tone="info" icon={<IconFlask size={16} />} title="Lab orders"
                              hint="Only verified results are released to the record." />
                  <CardBody className="pt-0">
                    {labs.length === 0 ? (
                      <EmptyState compact icon={<IconFlask size={20} />} title="No tests ordered" />
                    ) : (
                      <ScrollArea label="Lab orders" maxHeight="min(46vh, 28rem)" className="pr-1">
                        <ul className="space-y-3">
                          {labs.map((l) => (
                            <li key={l.id} className="rounded-[var(--r)] border border-line p-3">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-label font-medium text-ink">{l.test_name}</p>
                                <StatusPill kind="lab" status={l.status} size="sm" />
                              </div>
                              <p className="mt-0.5 text-caption text-ink-3">
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
                                            <LabFlag flag={r.flag} />
                                          </TD>
                                        </TR>
                                      ))}
                                    </TBody>
                                  </Table>
                                </TableWrap>
                              ) : (
                                <p className="mt-2 text-caption text-warn-text">
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

          {tab === "consent" && <PatientConsents patient={patient} />}

          {tab === "billing" && (
            <div className="space-y-5">
              <Card>
                <CardHeader icon={<IconCard size={15} />} tone="ok" title="What is owed" hint="Each counter is settled on its own." />
                <CardBody className="pt-1">
                  <PatientAccountSummary patientId={patient.id} />
                </CardBody>
              </Card>

              <Card className="overflow-hidden">
              <CardHeader tone="ok" icon={<IconReceipt size={16} />} title="Invoices"
                          subtitle={`${pluralise(invoices.length, "invoice")} · ${currency(owing)} outstanding`} />
              {invoices.length === 0 ? (
                <EmptyState compact icon={<IconReceipt size={20} />} title="Nothing billed" />
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
                              <Link href={`/billing/${inv.id}`} className="font-medium text-ink hover:text-accent-text hover:underline">
                                {inv.number}
                              </Link>
                            </TD>
                            <TD className="tnum text-label text-ink-2">{formatDate(inv.issued_at)}</TD>
                            <TD align="right">{currency(tot.total)}</TD>
                            <TD align="right" className={tot.paid > 0 ? "text-ink" : "text-ink-3"}>{tot.paid > 0 ? currency(tot.paid) : "—"}</TD>
                            <TD align="right"><StatusPill kind="invoice" status={inv.status} size="sm" dot={false} /></TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </TableWrap>
              )}
              </Card>
            </div>
          )}

          {tab === "edit" && (
            <Card>
              <CardHeader icon={<IconEdit size={15} />} tone="neutral" title="Edit record" hint="Update this patient’s details." />
              <CardBody>
                <DynamicForm
                  fields={schema}
                  values={draft}
                  onChange={(k, v) => {
                    setDraft((prev) => ({ ...prev, [k]: v }));
                    setErrors((prev) => { const n = { ...prev }; delete n[k]; return n; });
                  }}
                  errors={errors}
                />
              </CardBody>
              <CardFooter>
                <p className="text-caption text-ink-3">Changes are held in the browser for this demo.</p>
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

        {/*
          The rail carries what the record does not.

          It used to carry a quick-actions list (book, start a consultation,
          invoices, full history — every one of them a button in the header or
          a tab six inches away), a patient summary (four facts, all four of
          them rows in the card to its left) and a clinical profile (the same
          clinical fields as that card's right column). Three panels, nothing
          in them that was not already on the screen.

          What is left is the two things the record cannot say: what is
          outstanding, and how to reach this person.
        */}
        <aside className="space-y-5">
          <Card>
            <CardHeader
              icon={<IconAlert size={15} />} tone={open.length ? "warn" : "ok"} title="Needs attention"
              hint="Read off this patient's own records: work that is open, not a count of everything filed."
            />
            <CardBody className="pt-0">
              {open.length === 0 ? (
                <p className="flex items-center gap-2 py-1 text-label text-ink-2">
                  <IconCheck size={15} className="shrink-0 text-ok" />
                  Nothing outstanding for this patient.
                </p>
              ) : (
                <ActionList>
                  {open.map((o) => (
                    <ActionItem
                      key={o.key}
                      icon={o.icon}
                      onClick={() => setTab(o.tab)}
                      trailing={<IconChevronRight size={15} />}
                      wrap
                    >
                      {o.label}
                    </ActionItem>
                  ))}
                </ActionList>
              )}
            </CardBody>
          </Card>

          {seesNotes && <LatestNote patient={patient} onOpen={() => setTab("notes")} />}

          <Card>
            <CardHeader icon={<IconPhone size={15} />} tone="info" title="Contact" />
            <CardBody className="pt-0">
              {/* These are links, which is the whole reason they are here and
                  not among the record's rows: a number you can ring and an
                  address you can write to are not the same object as a number
                  printed on a form. */}
              <dl className="space-y-1">
                <a
                  href={`tel:${patient.phone.replace(/[^\d+]/g, "")}`}
                  className="-mx-1.5 flex items-start gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 transition-colors hover:bg-hover"
                >
                  <IconPhone size={15} className="mt-0.5 shrink-0 text-ink-3" />
                  <span className="tnum font-mono text-label text-ink">{patient.phone}</span>
                </a>
                {patient.email && (
                  <a
                    href={`mailto:${patient.email}`}
                    className="-mx-1.5 flex items-start gap-2.5 rounded-[var(--r-sm)] px-1.5 py-1.5 transition-colors hover:bg-hover"
                  >
                    <IconMail size={15} className="mt-0.5 shrink-0 text-ink-3" />
                    <span className="min-w-0 break-all text-label text-ink">{patient.email}</span>
                  </a>
                )}
                {patient.address && (
                  <div className="flex items-start gap-2.5 px-0 py-1.5">
                    <IconPin size={15} className="mt-0.5 shrink-0 text-ink-3" />
                    <span className="text-label leading-snug text-ink-2">{patient.address}</span>
                  </div>
                )}
              </dl>
            </CardBody>
          </Card>

          {careTeam.length > 0 && (
            <Card>
              <CardHeader
                icon={<IconUsers size={15} />} tone="violet" title="Care team"
                hint="Every clinician who has recorded an encounter for this patient, most seen first."
              />
              <CardBody className="pt-0">
                <ul className="space-y-2.5">
                  {careTeam.map((c) => (
                    <li key={c.id} className="flex items-center gap-2.5">
                      <Avatar name={userName(db, c.id)} size="sm" tintKey={c.id} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-label font-medium leading-tight text-ink">
                          {userName(db, c.id)}
                        </p>
                        <p className="truncate text-caption leading-tight text-ink-3">
                          {pluralise(c.visits, "visit")} · last {formatDate(c.last)}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      <AppointmentModal open={booking} onClose={() => setBooking(false)} defaultPatient={patient.id} />
    </>
  );
}
