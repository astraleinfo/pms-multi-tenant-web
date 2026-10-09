"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { useConsentForm, useConsentForms, useDoctors, usePatientConsents } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { CONSENT_LOOK, missingFields, personName, type PatientConsent } from "@/lib/consent";
import type { Patient } from "@/lib/types";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { IconEye, IconPlus, IconShield } from "@/components/ui/icons";
import { ConsentBadge, DocumentPreview } from "./shared";

/* ==========================================================================
   A patient's consents: what they have been asked, against which version,
   and what they said. Asking for a new one, and taking the signature — on
   this device, or on paper — start here.
   ========================================================================== */

export function PatientConsents({ patient }: { patient: Patient }) {
  const { can } = useApp();
  const router = useRouter();
  const mayRequest = can("consent:request");
  const { data: records, isPending, isError, error, refetch } = usePatientConsents(patient.id);
  const [asking, setAsking] = React.useState(false);
  const [preview, setPreview] = React.useState<PatientConsent | null>(null);

  return (
    <Card className="overflow-hidden">
      <CardHeader
        icon={<IconShield size={15} />}
        tone="accent"
        title="Consent"
        subtitle="Each consent keeps the exact version of the form the patient was asked."
        actions={mayRequest && (
          <Button size="sm" variant="primary" onClick={() => setAsking(true)}>
            <IconPlus size={14} /> Request consent
          </Button>
        )}
      />
      {isPending && <div className="space-y-2 px-4 pb-4">{[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>}
      {isError && (
        <div className="px-4 pb-4">
          <Callout tone="critical" title="Consents could not be loaded"
                   action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>}>
            {error instanceof Error ? error.message : "Something went wrong."}
          </Callout>
        </div>
      )}
      {records && records.length === 0 && (
        <EmptyState compact icon={<IconShield size={20} />} title="No consents yet"
                    body={mayRequest ? "Request one before a procedure — the patient can sign on this device or on paper." : undefined} />
      )}
      {records && records.length > 0 && (
        <ul className="divide-y divide-line-soft border-t border-line-soft">
          {records.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-label font-semibold text-ink">{r.title}</p>
                  <span className="text-caption tabular-nums text-ink-3">v{r.version_number}</span>
                  <ConsentBadge status={r.status} />
                </div>
                <p className="mt-0.5 text-caption text-ink-3">
                  {describe(r)}
                </p>
              </div>
              <div className="flex shrink-0 gap-1.5">
                <Button size="sm" variant="ghost" onClick={() => setPreview(r)}>
                  <IconEye size={14} /> {r.status === "pending" ? "Print" : "View"}
                </Button>
                {mayRequest && r.status === "pending" && (
                  <Button size="sm" variant="secondary" onClick={() => router.push(`/consent/sign/${r.id}`)}>
                    Sign on this device
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <DocumentPreview
          open
          onClose={() => setPreview(null)}
          title={preview.title}
          subtitle={`${patient.full_name} · version ${preview.version_number} · ${CONSENT_LOOK[preview.status].hint}`}
          load={() => api.patientConsentPdf(preview.id)}
          filename={`Consent ${patient.mrn} v${preview.version_number}.pdf`}
        />
      )}
      {mayRequest && (
        <RequestConsent open={asking} onClose={() => setAsking(false)} patient={patient}
                        onPrint={(r) => setPreview(r)} />
      )}
    </Card>
  );
}

function describe(r: PatientConsent): string {
  const asked = `Requested ${formatDate(r.requested_at.slice(0, 10))} by ${personName(r.requested_by)}`;
  if (r.status === "signed" && r.signed_at) {
    return `Signed ${formatDate(r.signed_at.slice(0, 10))} by ${r.signer_name}`
      + (r.signer_relationship && r.signer_relationship !== "Patient" ? ` (${r.signer_relationship.toLowerCase()})` : "")
      + (r.provider_name ? ` · clinician ${r.provider_name}` : "");
  }
  if (r.status === "declined" && r.declined_at) {
    return `Declined ${formatDate(r.declined_at.slice(0, 10))}${r.decline_reason ? ` — “${r.decline_reason}”` : ""}`;
  }
  if (r.status === "expired") return `${asked} · expired ${formatDate(r.expires_at.slice(0, 10))}`;
  return `${asked} · open until ${formatDate(r.expires_at.slice(0, 10))}`;
}

/* ---- asking for consent ---------------------------------------------------- */

function RequestConsent({
  open, onClose, patient, onPrint,
}: {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  onPrint: (r: PatientConsent) => void;
}) {
  const { session, notify } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: forms, isPending: formsPending } = useConsentForms();
  const usable = React.useMemo(() => (forms ?? []).filter((f) => f.published), [forms]);
  const { data: doctors = [] } = useDoctors();

  const [formId, setFormId] = React.useState("");
  const [providerId, setProviderId] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [created, setCreated] = React.useState<PatientConsent | null>(null);
  const [tried, setTried] = React.useState(false);

  /* the first usable form, and the signed-in clinician when they are one */
  React.useEffect(() => {
    if (!open) return;
    setCreated(null);
    setValues({});
    setTried(false);
    setFormId((id) => id || usable[0]?.id || "");
    setProviderId((id) => id || (doctors.some((d) => d.id === session.userId) ? session.userId : doctors[0]?.id ?? ""));
  }, [open, usable, doctors, session.userId]);

  const { data: form, isPending: formPending } = useConsentForm(formId);
  const content = form?.published?.content ?? null;
  const missing = content ? missingFields(content, values) : [];
  const needsProvider = !!content?.signatures.provider;

  const submit = async () => {
    setTried(true);
    if (!content || missing.length || (needsProvider && !providerId)) return;
    setBusy(true);
    try {
      const record = await api.requestPatientConsent({
        patient_id: patient.id, form_id: formId, provider_id: providerId || null, field_values: values,
      });
      await queryClient.invalidateQueries({ queryKey: qk.patientConsents(session.tenantId, patient.id) });
      setCreated(record);
    } catch (e) {
      notify({ tone: "critical", title: "Consent was not requested", body: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    return (
      <Modal open={open} onClose={onClose} title="Consent requested" width="sm"
             subtitle={`${created.title}, version ${created.version_number}, for ${patient.full_name}.`}
             footer={
               <div className="flex w-full flex-wrap justify-end gap-2">
                 <Button variant="ghost" onClick={onClose}>Done</Button>
                 <Button variant="secondary" onClick={() => { onClose(); onPrint(created); }}>Print to sign on paper</Button>
                 <Button variant="primary" onClick={() => router.push(`/consent/sign/${created.id}`)}>Sign on this device</Button>
               </div>
             }>
        <p className="text-body text-ink-2">
          Hand this device to the patient to read and sign now, or print the form for them to sign by hand.
          It stays open until {formatDate(created.expires_at.slice(0, 10), "long")}.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request consent"
      subtitle={`For ${patient.full_name} · ${patient.mrn}`}
      width="lg"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={busy || !content}>
            {busy ? "Requesting…" : "Request consent"}
          </Button>
        </div>
      }
    >
      {formsPending ? (
        <Skeleton className="h-10 w-full" />
      ) : usable.length === 0 ? (
        <Callout tone="warn" title="No published consent form">
          A practice admin needs to publish a consent form in Settings before patients can be asked.
        </Callout>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Consent form" required htmlFor="rc-form">
              <Select id="rc-form" value={formId} onChange={(e) => { setFormId(e.target.value); setValues({}); }}>
                {usable.map((f) => <option key={f.id} value={f.id}>{f.name} (v{f.published!.number})</option>)}
              </Select>
            </Field>
            <Field label="Clinician" required={needsProvider} htmlFor="rc-provider"
                   error={tried && needsProvider && !providerId ? "Choose the clinician who will countersign." : undefined}>
              <Select id="rc-provider" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                {!needsProvider && <option value="">None</option>}
                {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </Field>
          </div>

          {formPending && <Skeleton className="h-24 w-full" />}
          {content && content.sections.filter((s) => s.kind === "fields").map((s) => (
            <fieldset key={s.id} className="rounded-[var(--r)] border border-line px-4 pb-4 pt-3">
              <legend className="px-1 text-label font-semibold text-ink">{s.title}</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {s.fields.map((f) => {
                  const empty = !values[f.id]?.trim();
                  const error = tried && f.required && empty ? "Required" : undefined;
                  const id = `rc-${f.id}`;
                  return (
                    <Field key={f.id} label={f.label} required={f.required} htmlFor={id} error={error}
                           className={f.multiline ? "sm:col-span-2" : undefined}>
                      {f.multiline
                        ? <Textarea id={id} rows={2} value={values[f.id] ?? ""} invalid={!!error}
                                    onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} />
                        : <Input id={id} value={values[f.id] ?? ""} invalid={!!error}
                                 onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))} />}
                    </Field>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {tried && missing.length > 0 && (
            <Callout tone="warn" title="Still to fill in">{missing.join(", ")}.</Callout>
          )}
          {content && (
            <p className="text-caption text-ink-3">
              The patient will be asked to sign version {form?.published?.number}. If the form is changed later,
              this consent keeps the wording it was given.
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
