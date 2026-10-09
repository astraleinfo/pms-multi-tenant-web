import type { Tone } from "@/components/ui/badge";

/* ==========================================================================
   Consent forms — the shapes the API speaks, and the small rules the screens
   share. The server enforces every one of these again; they live here so a
   person is told before they press the button, not after.
   ========================================================================== */

export type ConsentSectionKind = "text" | "fields" | "acknowledgements";

export interface ConsentField { id: string; label: string; required: boolean; multiline: boolean }
export interface ConsentStatement { id: string; text: string; required: boolean }

export interface ConsentSection {
  id: string;
  kind: ConsentSectionKind;
  title: string;
  body: string;
  fields: ConsentField[];
  statements: ConsentStatement[];
}

export interface ConsentContent {
  title: string;
  intro: string;
  patient_fields: PatientDetail[];
  sections: ConsentSection[];
  signatures: { declaration: string; provider: boolean; witness: boolean };
  validity_days: number;
}

export type PatientDetail = "full_name" | "mrn" | "dob" | "sex" | "phone" | "email" | "address";

export const PATIENT_DETAILS: { key: PatientDetail; label: string }[] = [
  { key: "full_name", label: "Name" },
  { key: "mrn", label: "Patient ID" },
  { key: "dob", label: "Date of birth" },
  { key: "sex", label: "Sex" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
];

export type VersionStatus = "draft" | "published" | "archived";
export type ConsentStatus = "pending" | "signed" | "declined" | "expired";

export interface ConsentVersion {
  id: string;
  number: number;
  status: VersionStatus;
  created_by: string;
  created_at: string;
  updated_by: string;
  updated_at: string;
  published_by: string;
  published_at: string | null;
  archived_at: string | null;
  consents: number;
  content: ConsentContent | null;
}

export interface ConsentForm {
  id: string;
  name: string;
  template_key: string;
  template_label: string;
  created_by: string;
  created_at: string;
  published: ConsentVersion | null;
  draft: ConsentVersion | null;
  versions: ConsentVersion[];
}

export interface ConsentTemplate {
  key: string;
  label: string;
  clinical_type: string | null;
  description: string;
}

export interface PatientConsent {
  id: string;
  patient_id: string;
  form_id: string;
  form_name: string;
  title: string;
  version_number: number;
  status: ConsentStatus;
  requested_by: string;
  requested_at: string;
  expires_at: string;
  provider_id: string | null;
  provider_name: string;
  signer_name: string;
  signer_relationship: string;
  signed_at: string | null;
  witnessed_by: string;
  declined_at: string | null;
  decline_reason: string;
  has_patient_signature: boolean;
  has_provider_signature: boolean;
  acknowledged: string[];
  field_values: Record<string, string>;
  patient: Record<string, string | null>;
  content: ConsentContent | null;
}

/* ---- how each state reads ------------------------------------------------ */

/** A status as a word and a tone — the same wherever a status appears. */
export const VERSION_LOOK: Record<VersionStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "warn" },
  published: { label: "Published", tone: "ok" },
  archived: { label: "Archived", tone: "neutral" },
};

export const CONSENT_LOOK: Record<ConsentStatus, { label: string; tone: Tone; hint: string }> = {
  pending: { label: "Pending", tone: "info", hint: "Waiting for the patient to sign" },
  signed: { label: "Signed", tone: "ok", hint: "Signed — final, and kept as signed" },
  declined: { label: "Declined", tone: "critical", hint: "The patient declined" },
  expired: { label: "Expired", tone: "neutral", hint: "Lapsed unsigned — request a new one" },
};

/** A person as a page shows them: "Hema Nair <admin@…>" → "Hema Nair". */
export function personName(label: string): string {
  return label.split("<")[0].trim() || label;
}

/* ---- editing ------------------------------------------------------------- */

/** An id that is not already used in this form — lowercase, as the server wants. */
export function freshId(prefix: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let n = 1; ; n++) {
    const id = `${prefix}-${n}`;
    if (!used.has(id)) return id;
  }
}

export function allIds(content: ConsentContent): string[] {
  return content.sections.flatMap((s) => [s.id, ...s.fields.map((f) => f.id), ...s.statements.map((a) => a.id)]);
}

export function newSection(kind: ConsentSectionKind, content: ConsentContent): ConsentSection {
  const ids = allIds(content);
  const id = freshId("section", ids);
  const titles: Record<ConsentSectionKind, string> = {
    text: "New section",
    fields: "Details for this patient",
    acknowledgements: "Acknowledgements",
  };
  return {
    id, kind, title: titles[kind], body: "",
    fields: kind === "fields" ? [{ id: freshId("field", ids), label: "New field", required: false, multiline: false }] : [],
    statements: kind === "acknowledgements"
      ? [{ id: freshId("ack", ids), text: "I understand and agree.", required: true }]
      : [],
  };
}

/** Move one item up or down a list, returning a new list. */
export function move<T>(list: T[], index: number, by: -1 | 1): T[] {
  const to = index + by;
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

/**
 * What stops this content from being saved — the same rules the server
 * applies, in words an administrator can act on. Empty when it is fine.
 */
export function contentProblems(content: ConsentContent): string[] {
  const out: string[] = [];
  if (!content.title.trim()) out.push("The form needs a title.");
  if (!content.signatures.declaration.trim()) out.push("The signature declaration cannot be empty.");
  if (content.sections.length === 0) out.push("The form needs at least one section.");
  content.sections.forEach((s, i) => {
    const name = s.title.trim() || `Section ${i + 1}`;
    if (!s.title.trim()) out.push(`Section ${i + 1} needs a title.`);
    if (s.kind === "fields") {
      if (s.fields.length === 0) out.push(`“${name}” needs at least one field.`);
      if (s.fields.some((f) => !f.label.trim())) out.push(`Every field in “${name}” needs a label.`);
    }
    if (s.kind === "acknowledgements") {
      if (s.statements.length === 0) out.push(`“${name}” needs at least one statement.`);
      if (s.statements.some((a) => !a.text.trim())) out.push(`Every statement in “${name}” needs wording.`);
    }
  });
  if (content.validity_days < 1 || content.validity_days > 365) {
    out.push("A request must stay open for between 1 and 365 days.");
  }
  return out;
}

/* ---- asking and signing ---------------------------------------------------- */

export function requiredFields(content: ConsentContent): ConsentField[] {
  return content.sections.flatMap((s) => s.fields.filter((f) => f.required));
}

export function requiredStatements(content: ConsentContent): ConsentStatement[] {
  return content.sections.flatMap((s) => s.statements.filter((a) => a.required));
}

/** The labels of required fields still empty — what the request dialog lists. */
export function missingFields(content: ConsentContent, values: Record<string, string>): string[] {
  return requiredFields(content).filter((f) => !values[f.id]?.trim()).map((f) => f.label);
}

/** Everything still needed before a signature can be submitted. */
export function signingProblems(
  content: ConsentContent,
  state: { acknowledged: string[]; signerName: string; patientSigned: boolean; providerSigned: boolean },
): string[] {
  const out: string[] = [];
  const unticked = requiredStatements(content).filter((a) => !state.acknowledged.includes(a.id)).length;
  if (unticked) out.push(`${unticked} required statement${unticked === 1 ? "" : "s"} still to tick`);
  if (!state.signerName.trim()) out.push("The name of the person signing");
  if (!state.patientSigned) out.push("The patient's signature");
  if (content.signatures.provider && !state.providerSigned) out.push("The clinician's signature");
  return out;
}

/**
 * Plain text from the editor as the document reads it — the same rule the PDF
 * uses: blank lines separate paragraphs, consecutive "- " lines are one list,
 * and other consecutive lines join into one paragraph.
 */
export function blocks(body: string): Array<{ kind: "p" | "ul"; lines: string[] }> {
  const out: Array<{ kind: "p" | "ul"; lines: string[] }> = [];
  for (const block of body.trim().split(/\n\s*\n/)) {
    let current: { kind: "p" | "ul"; lines: string[] } | null = null;
    for (const raw of block.split("\n")) {
      const line = raw.trim();
      if (!line) continue;
      const kind = /^[-•]\s+/.test(line) ? "ul" : "p";
      const text = line.replace(/^[-•]\s+/, "");
      if (current && current.kind === kind) current.lines.push(text);
      else out.push((current = { kind, lines: [text] }));
    }
  }
  return out.map((b) => (b.kind === "p" ? { kind: "p", lines: [b.lines.join(" ")] } : b));
}
