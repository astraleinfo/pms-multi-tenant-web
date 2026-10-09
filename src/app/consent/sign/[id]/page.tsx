"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { useClinicLogoUrl, usePatientConsent, useTenant } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { openPdfBlob } from "@/lib/pdf";
import { cn } from "@/lib/cn";
import {
  CONSENT_LOOK, PATIENT_DETAILS, blocks, signingProblems, type ConsentContent, type PatientConsent,
} from "@/lib/consent";
import { Monogram } from "@/components/layout/rail";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { StageLoader } from "@/components/ui/loader";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { IconCheck, IconChevronLeft, IconPrint } from "@/components/ui/icons";
import { ConsentBadge, SignaturePad } from "@/components/consent/shared";

/* ==========================================================================
   The patient's screen.

   Handed across the desk on the clinic's own device, so it carries nothing
   of the app — no rail, no search, nothing to wander into — and only this one
   consent. It reads like the paper form: the clinic, the title, who it is
   for, each section in order, then the signatures. Every required thing is
   marked, and the button says what is still missing rather than going grey.
   ========================================================================== */

const RELATIONSHIPS = ["Patient", "Parent", "Guardian", "Carer", "Other representative"];

export default function SignConsentPage(props: PageProps<"/consent/sign/[id]">) {
  const { id } = React.use(props.params);
  const { can } = useApp();
  const { data: record, isPending, isError } = usePatientConsent(id);
  /* Opened on a pending consent, this screen stays the signing screen until it
     has said thank you — the record turning `signed` underneath it is the
     success, not a reason to switch to "already signed". */
  const openedPending = React.useRef(false);
  if (record?.status === "pending") openedPending.current = true;

  if (!can("consent:request")) {
    return <Notice title="Consent cannot be taken from this account"
                   body="Ask a member of staff who can request consent to open this form." />;
  }
  if (isPending) return <StageLoader label="Opening the consent form…" />;
  if (isError || !record || !record.content) {
    return <Notice title="This consent form could not be found" body="It may belong to another clinic, or the link is wrong." />;
  }
  if (record.status !== "pending" && !openedPending.current) return <Answered record={record} />;
  return <Signing record={record} content={record.content} />;
}

/* ---- the frame -------------------------------------------------------------- */

function Masthead({ version, onExit }: { version?: number; onExit?: () => void }) {
  const { tenant } = useTenant();
  const logoUrl = useClinicLogoUrl();
  return (
    <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
        <Monogram name={tenant.name} size={36} logoUrl={logoUrl} />
        <p className="min-w-0 flex-1 truncate text-body font-semibold text-ink">{tenant.name}</p>
        {version !== undefined && <span className="text-caption tabular-nums text-ink-3">Form v{version}</span>}
        {onExit && (
          <Button variant="ghost" size="sm" onClick={onExit} aria-label="Back to the patient record (staff)">
            <IconChevronLeft size={15} /> <span className="hidden sm:inline">Staff: back</span>
          </Button>
        )}
      </div>
    </header>
  );
}

function Notice({ title, body, children }: { title: string; body?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-ground">
      <Masthead />
      <main className="mx-auto max-w-xl px-4 py-14 text-center sm:px-6">
        <h1 className="text-h2 font-semibold text-ink">{title}</h1>
        {body && <p className="mt-2 text-body text-ink-2">{body}</p>}
        {children && <div className="mt-6 flex flex-wrap justify-center gap-2">{children}</div>}
      </main>
    </div>
  );
}

function Answered({ record }: { record: PatientConsent }) {
  const router = useRouter();
  const look = CONSENT_LOOK[record.status];
  const when = record.signed_at ?? record.declined_at;
  return (
    <Notice
      title={record.status === "signed" ? "This consent has already been signed"
        : record.status === "declined" ? "This consent was declined" : "This consent request has expired"}
      body={<>
        <span className="mb-3 flex justify-center"><ConsentBadge status={record.status} /></span>
        {when ? `${look.label} ${formatDate(when.slice(0, 10), "long")}. ` : ""}
        {record.status === "expired" ? "Ask the clinic for a new consent form." : "A signed or declined consent cannot be changed."}
      </>}
    >
      <Button variant="secondary" onClick={() => router.push(`/patients/${record.patient_id}?tab=consent`)}>
        Back to the patient record
      </Button>
      <Button variant="primary" onClick={async () => openPdfBlob(await api.patientConsentPdf(record.id))}>
        <IconPrint size={15} /> Print
      </Button>
    </Notice>
  );
}

/* ---- signing ------------------------------------------------------------------ */

function Signing({ record, content }: { record: PatientConsent; content: ConsentContent }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { session, notify } = useApp();

  const [acknowledged, setAcknowledged] = React.useState<string[]>([]);
  const [signerName, setSignerName] = React.useState(record.patient.full_name ?? "");
  const [relationship, setRelationship] = React.useState("Patient");
  const [patientSig, setPatientSig] = React.useState<string | null>(null);
  const [providerSig, setProviderSig] = React.useState<string | null>(null);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [done, setDone] = React.useState<PatientConsent | null>(null);
  const [now, setNow] = React.useState(() => new Date());

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(t);
  }, []);

  const problems = signingProblems(content, {
    acknowledged, signerName, patientSigned: !!patientSig, providerSigned: !!providerSig,
  });
  const backToRecord = () => router.push(`/patients/${record.patient_id}?tab=consent`);
  const finish = async (next: PatientConsent) => {
    setDone(next);
    queryClient.setQueryData(qk.patientConsent(session.tenantId, record.id), next);
    await queryClient.invalidateQueries({ queryKey: qk.patientConsents(session.tenantId, record.patient_id) });
    window.scrollTo({ top: 0 });
  };

  const submit = async () => {
    setTried(true);
    if (problems.length) return;
    setBusy(true);
    try {
      await finish(await api.signPatientConsent(record.id, {
        signer_name: signerName.trim(), signer_relationship: relationship, acknowledged,
        patient_signature: patientSig!, provider_signature: content.signatures.provider ? providerSig : null,
      }));
    } catch (e) {
      notify({ tone: "critical", title: "The consent was not submitted", body: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await finish(await api.declinePatientConsent(record.id, reason));
      setDeclining(false);
    } catch (e) {
      notify({ tone: "critical", title: "That was not recorded", body: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const signed = done.status === "signed";
    return (
      <Notice
        title={signed ? "Thank you — your consent is recorded" : "Your decision is recorded"}
        body={<>
          <span className={cn("mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full",
            signed ? "bg-ok-soft text-ok-text" : "bg-surface-3 text-ink-2")}>
            <IconCheck size={26} />
          </span>
          Please hand this device back to the clinic staff.
        </>}
      >
        <Button variant="secondary" onClick={async () => openPdfBlob(await api.patientConsentPdf(done.id))}>
          <IconPrint size={15} /> Print a copy
        </Button>
        <Button variant="primary" onClick={backToRecord}>Staff: back to the record</Button>
      </Notice>
    );
  }

  const patientRows = content.patient_fields.map((key) => {
    const label = PATIENT_DETAILS.find((d) => d.key === key)?.label ?? key;
    let value = record.patient[key] ?? "";
    if (key === "dob" && value) value = formatDate(value, "long");
    if (key === "sex" && value) value = value.charAt(0).toUpperCase() + value.slice(1);
    return { label, value: value || "—" };
  });
  const missingAck = (id: string, required: boolean) => tried && required && !acknowledged.includes(id);

  return (
    <div className="min-h-dvh bg-ground pb-32">
      <Masthead version={record.version_number} onExit={backToRecord} />

      <main className="mx-auto max-w-3xl px-4 pt-6 sm:px-6 sm:pt-8">
        <article className="rounded-[var(--r-lg)] border border-line bg-surface px-5 py-6 sm:px-9 sm:py-8">
          <h1 className="text-h2 font-semibold leading-tight text-ink sm:text-h1">{content.title}</h1>
          <p className="mt-1 text-caption text-ink-3">
            Fields marked <span className="text-critical-text">*</span> are required.
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line-soft py-4 sm:grid-cols-3">
            {patientRows.map((r) => (
              <div key={r.label} className="min-w-0">
                <dt className="text-micro font-semibold uppercase tracking-wide text-ink-3">{r.label}</dt>
                <dd className="truncate text-body text-ink">{r.value}</dd>
              </div>
            ))}
            <div>
              <dt className="text-micro font-semibold uppercase tracking-wide text-ink-3">Date</dt>
              <dd className="text-body tabular-nums text-ink">{formatDate(now.toISOString().slice(0, 10), "long")}</dd>
            </div>
          </dl>

          {content.intro && <Prose body={content.intro} className="mt-5" />}

          {content.sections.map((s, i) => (
            <section key={s.id} className="mt-7" aria-labelledby={`sec-${s.id}`}>
              <h2 id={`sec-${s.id}`} className="text-body font-semibold text-ink">
                <span className="mr-2 tabular-nums text-ink-3">{i + 1}.</span>{s.title}
              </h2>
              {s.body && <Prose body={s.body} className="mt-2" />}
              {s.kind === "fields" && (
                <dl className="mt-3 divide-y divide-line-soft rounded-[var(--r)] border border-line-soft">
                  {s.fields.map((f) => (
                    <div key={f.id} className="grid grid-cols-1 gap-1 px-3.5 py-2.5 sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-4">
                      <dt className="text-label text-ink-2">{f.label}</dt>
                      <dd className="whitespace-pre-line text-body text-ink">{record.field_values[f.id] || "—"}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {s.kind === "acknowledgements" && (
                <ul className="mt-3 space-y-2">
                  {s.statements.map((a) => (
                    <li key={a.id}
                        className={cn("rounded-[var(--r)] border px-3.5 py-3 transition-colors",
                          missingAck(a.id, a.required) ? "border-critical bg-critical-soft/40" : "border-line-soft",
                          acknowledged.includes(a.id) && "border-accent-border bg-accent-soft/50")}>
                      <Checkbox
                        checked={acknowledged.includes(a.id)}
                        onChange={(on) => setAcknowledged((xs) => (on ? [...xs, a.id] : xs.filter((x) => x !== a.id)))}
                        label={<span className="text-body text-ink">
                          {a.text}{a.required && <span className="ml-1 text-critical-text" aria-label="required">*</span>}
                        </span>}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <section className="mt-8 border-t border-line pt-6" aria-labelledby="sig-heading">
            <h2 id="sig-heading" className="text-body font-semibold text-ink">Declaration and signature</h2>
            <p className="mt-2 text-body leading-relaxed text-ink-2">{content.signatures.declaration}</p>

            <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name of the person signing" required htmlFor="sg-name"
                     error={tried && !signerName.trim() ? "Required" : undefined}>
                <Input id="sg-name" value={signerName} autoComplete="off" invalid={tried && !signerName.trim()}
                       onChange={(e) => setSignerName(e.target.value)} />
              </Field>
              <Field label="Signing as" htmlFor="sg-rel">
                <Select id="sg-rel" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
                  {RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </Field>
            </div>

            <div className="mt-4 space-y-5">
              <SignaturePad id="sg-patient" required invalid={tried && !patientSig}
                            label={relationship === "Patient" ? "Patient signature" : `Signature (${relationship.toLowerCase()})`}
                            onChange={setPatientSig} />
              {content.signatures.provider && (
                <SignaturePad id="sg-provider" required invalid={tried && !providerSig}
                              label={`Clinician signature${record.provider_name ? ` — ${record.provider_name}` : ""}`}
                              onChange={setProviderSig} />
              )}
            </div>
            <p className="mt-3 text-caption tabular-nums text-ink-3">
              Signed on {formatDate(now.toISOString().slice(0, 10), "long")} at{" "}
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </section>
        </article>
      </main>

      {/* what is still needed, and the two ways out — always in reach */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          {/* a line of its own on a phone, beside the buttons from a tablet up */}
          <p className={cn("min-w-0 basis-full text-caption sm:basis-0 sm:flex-1",
                           problems.length ? (tried ? "text-critical-text" : "text-ink-2") : "text-ok-text")}
             role="status" aria-live="polite">
            {problems.length ? <>Still needed: {problems.join(" · ")}</> : "Ready to submit."}
          </p>
          <div className="ml-auto flex w-full items-center justify-end gap-2 sm:w-auto">
            <Button variant="ghost" onClick={() => setDeclining(true)} disabled={busy}>Decline</Button>
            <Button variant="primary" size="lg" className="flex-1 sm:flex-none" onClick={submit} disabled={busy}>
              {busy ? "Submitting…" : "Sign and submit"}
            </Button>
          </div>
        </div>
      </div>

      <Modal open={declining} onClose={() => setDeclining(false)} title="Decline this consent?" width="sm"
             footer={
               <div className="flex w-full justify-end gap-2">
                 <Button variant="ghost" onClick={() => setDeclining(false)}>Go back</Button>
                 <Button variant="danger" onClick={decline} disabled={busy}>{busy ? "Recording…" : "Decline"}</Button>
               </div>
             }>
        <p className="text-body text-ink-2">The clinic will be told you did not give consent. This cannot be undone; a new form can be requested later.</p>
        <Field className="mt-4" label="Reason (optional)" htmlFor="dc-reason">
          <Textarea id="dc-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </Field>
        {tried && problems.length > 0 && <span className="sr-only">{problems.join(", ")}</span>}
      </Modal>
    </div>
  );
}

function Prose({ body, className }: { body: string; className?: string }) {
  return (
    <div className={cn("space-y-2 text-body leading-relaxed text-ink-2", className)}>
      {blocks(body).map((b, i) =>
        b.kind === "ul" ? (
          <ul key={i} className="list-disc space-y-1 pl-5">{b.lines.map((l, j) => <li key={j}>{l}</li>)}</ul>
        ) : (
          <p key={i}>{b.lines[0]}</p>
        ),
      )}
    </div>
  );
}
