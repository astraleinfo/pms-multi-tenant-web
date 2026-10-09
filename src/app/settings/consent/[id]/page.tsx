"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { useConsentForm } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/cn";
import {
  PATIENT_DETAILS, contentProblems, freshId, allIds, move, newSection, personName,
  type ConsentContent, type ConsentForm, type ConsentSection, type ConsentSectionKind, type ConsentVersion,
} from "@/lib/consent";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { PageLoader } from "@/components/ui/loader";
import { Checkbox, Field, Input, NumberInput, Switch, Textarea } from "@/components/ui/field";
import {
  IconArrowDown, IconArrowUp, IconEdit, IconEye, IconList, IconPlus, IconRefresh, IconShield, IconTrash,
} from "@/components/ui/icons";
import { DocumentFrame, DocumentPreview, VersionBadge } from "@/components/consent/shared";

/* ==========================================================================
   One consent form: what patients sign now, the draft being prepared, and
   every version there has been.

   Structured editing, not a page builder. A form is a title, an introduction,
   the patient details to print, an ordered list of sections — text, fields the
   clinic fills in for the patient, statements the patient ticks — and the
   signatures. Each is edited where it sits; the document itself is one click
   away in Preview, and it is the same file that prints.
   ========================================================================== */

export default function ConsentFormPage(props: PageProps<"/settings/consent/[id]">) {
  const { id } = React.use(props.params);
  const { data: form, isPending, isError, error } = useConsentForm(id);
  const { can } = useApp();

  if (!can("consent:read")) {
    return <EmptyState icon={<IconShield size={24} />} title="Not available to your role"
                       body="Consent forms are managed by the practice admin." />;
  }
  if (isPending) return <PageLoader label="Opening the consent form…" />;
  if (isError || !form) {
    return (
      <Card className="mx-auto max-w-lg">
        <EmptyState icon={<IconShield size={24} />} title="No such consent form in this clinic"
                    body={error instanceof Error && !/not found|no such/i.test(error.message) ? error.message : undefined} />
      </Card>
    );
  }
  return <Workspace form={form} />;
}

function Workspace({ form }: { form: ConsentForm }) {
  const { can, notify, session } = useApp();
  const manage = can("consent:manage");
  const queryClient = useQueryClient();
  const refresh = (next: ConsentForm) => {
    queryClient.setQueryData(qk.consentForm(session.tenantId, form.id), next);
    void queryClient.invalidateQueries({ queryKey: qk.consentForms(session.tenantId) });
  };

  const draft = form.draft;
  const [content, setContent] = React.useState<ConsentContent | null>(draft?.content ?? null);
  const [dirty, setDirty] = React.useState(false);
  const [busy, setBusy] = React.useState<null | "start" | "save" | "publish" | "discard" | "reset" | number>(null);
  const [preview, setPreview] = React.useState<ConsentVersion | null>(null);
  const [confirm, setConfirm] = React.useState<null | "publish" | "discard" | "reset" | { restore: number }>(null);

  /* the server's draft is the starting point whenever it changes underneath */
  const draftKey = draft ? `${draft.id}:${draft.updated_at}` : "none";
  React.useEffect(() => {
    setContent(draft?.content ?? null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  /* leaving with unsaved edits asks first */
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const problems = content ? contentProblems(content) : [];
  const edit = (next: ConsentContent) => { setContent(next); setDirty(true); };

  const run = async (what: NonNullable<typeof busy>, task: () => Promise<ConsentForm>, done: string, failed: string) => {
    setBusy(what);
    try {
      const next = await task();
      refresh(next);
      notify({ tone: "ok", title: done });
      return next;
    } catch (e) {
      notify({ tone: "critical", title: failed, body: e instanceof Error ? e.message : "Try again." });
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = () => content && run("save", () => api.saveConsentDraft(form.id, content),
    "Draft saved", "The draft was not saved");

  const publish = async () => {
    if (!content) return;
    setConfirm(null);
    if (dirty) {
      const saved = await run("save", () => api.saveConsentDraft(form.id, content), "Draft saved", "The draft was not saved");
      if (!saved) return;
    }
    await run("publish", () => api.publishConsentForm(form.id),
      `Version ${draft?.number} published`, "The form was not published");
  };

  const latest = draft ?? form.published;

  return (
    <>
      <PageHeader
        back={{ href: "/settings?tab=consent", label: "Consent forms" }}
        eyebrow={`From “${form.template_label}”`}
        title={form.name}
        status={
          <span className="flex flex-wrap items-center gap-1.5">
            {form.published && <VersionBadge status="published" number={form.published.number} />}
            {draft && <VersionBadge status="draft" number={draft.number} />}
          </span>
        }
        meta={
          form.published
            ? <span>Patients are asked to sign version {form.published.number}
                {form.published.published_at && `, published ${formatDate(form.published.published_at.slice(0, 10), "long")}`}.</span>
            : <span className="text-warn-text">Nothing is published yet — this form cannot be used with patients.</span>
        }
        actions={
          <>
            {latest && (
              <Button variant="secondary" onClick={() => setPreview(latest)} disabled={dirty}
                      title={dirty ? "Save the draft to preview it" : undefined}>
                <IconEye size={15} /> Preview{draft ? " draft" : ""}
              </Button>
            )}
            {manage && !draft && (
              <Button variant="primary" disabled={busy !== null}
                      onClick={() => run("start", () => api.startConsentDraft(form.id),
                        "Draft started — the published version is unchanged", "Could not start a draft")}>
                <IconEdit size={15} /> {busy === "start" ? "Starting…" : "Edit"}
              </Button>
            )}
            {manage && draft && (
              <>
                <Button variant="secondary" onClick={save} disabled={!dirty || busy !== null || problems.length > 0}>
                  {busy === "save" ? "Saving…" : dirty ? "Save draft" : "Saved"}
                </Button>
                <Button variant="primary" onClick={() => setConfirm("publish")}
                        disabled={busy !== null || problems.length > 0}>
                  {busy === "publish" ? "Publishing…" : `Publish v${draft.number}`}
                </Button>
              </>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-block xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-block">
          {draft && content && manage ? (
            <>
              {problems.length > 0 && (
                <Callout tone="warn" title="Before this can be saved">
                  <ul className="mt-1 list-disc pl-4">{problems.map((p) => <li key={p}>{p}</li>)}</ul>
                </Callout>
              )}
              <Editor content={content} onChange={edit} />
            </>
          ) : form.published ? (
            <DocumentFrame
              title={form.name}
              version={form.published.id}
              load={() => api.consentVersionPdf(form.id, form.published!.number)}
            />
          ) : (
            <Card><EmptyState icon={<IconShield size={24} />} title="No published version"
                              body={manage ? "Edit the form and publish it to start using it with patients." : "Ask the practice admin to publish this form."} /></Card>
          )}
        </div>

        <aside className="min-w-0 space-y-block">
          <History form={form} manage={manage} busy={busy}
                   onPreview={setPreview} onRestore={(n) => setConfirm({ restore: n })} />
          {manage && (
            <Card>
              <CardHeader icon={<IconRefresh size={15} />} title="Start again" />
              <CardBody className="space-y-3 pt-0">
                <p className="text-caption text-ink-2">
                  Put the platform's template back in the draft. Nothing patients see changes until you publish.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => setConfirm("reset")}>
                    Reset to default
                  </Button>
                  {draft && (
                    <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setConfirm("discard")}>
                      <IconTrash size={14} /> Discard draft
                    </Button>
                  )}
                </div>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>

      {preview && (
        <DocumentPreview
          open
          onClose={() => setPreview(null)}
          title={`${form.name} — version ${preview.number}`}
          subtitle={preview.status === "draft" ? "Draft — printed marked as a draft" : `${preview.status === "published" ? "Published" : "Archived"} version`}
          load={() => api.consentVersionPdf(form.id, preview.number)}
          filename={`${form.name} v${preview.number}.pdf`}
        />
      )}

      <Modal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={
          confirm === "publish" ? `Publish version ${draft?.number}?`
            : confirm === "discard" ? "Discard the draft?"
              : confirm === "reset" ? "Reset the draft to the template?"
                : confirm ? `Copy version ${confirm.restore} into the draft?` : ""
        }
        width="sm"
        footer={
          <div className="flex w-full justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>Cancel</Button>
            {confirm === "publish" && <Button variant="primary" onClick={publish}>Publish</Button>}
            {confirm === "discard" && (
              <Button variant="danger" onClick={() => { setConfirm(null); void run("discard", () => api.discardConsentDraft(form.id), "Draft discarded", "The draft was not discarded"); }}>
                Discard
              </Button>
            )}
            {confirm === "reset" && (
              <Button variant="primary" onClick={() => { setConfirm(null); void run("reset", () => api.resetConsentForm(form.id), "The draft is the template again", "The form was not reset"); }}>
                Reset draft
              </Button>
            )}
            {confirm && typeof confirm === "object" && (
              <Button variant="primary" onClick={() => {
                const n = confirm.restore;
                setConfirm(null);
                void run(n, () => api.startConsentDraft(form.id, n), `Version ${n} copied into the draft`, "That version was not copied");
              }}>
                Copy into draft
              </Button>
            )}
          </div>
        }
      >
        <p className="text-body text-ink-2">
          {confirm === "publish" && (
            <>Patients asked from now on will sign version {draft?.number}.
              {form.published && <> Version {form.published.number} is archived — every consent already given against it keeps it, unchanged.</>}</>
          )}
          {confirm === "discard" && "Your unpublished changes are deleted. The published version is not affected."}
          {confirm === "reset" && "The draft is replaced with the platform's template. Your published version stays as it is until you publish."}
          {confirm && typeof confirm === "object" && (
            <>The draft is replaced with version {confirm.restore}'s wording, as a new version. The old version itself is never changed.</>
          )}
        </p>
      </Modal>
    </>
  );
}

/* ---- version history -------------------------------------------------------- */

function History({
  form, manage, busy, onPreview, onRestore,
}: {
  form: ConsentForm;
  manage: boolean;
  busy: unknown;
  onPreview: (v: ConsentVersion) => void;
  onRestore: (n: number) => void;
}) {
  return (
    <Card>
      <CardHeader icon={<IconList size={15} />} title="Versions" subtitle={`${form.versions.length} in all`} />
      <ol className="divide-y divide-line-soft border-t border-line-soft">
        {form.versions.map((v) => (
          <li key={v.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <VersionBadge status={v.status} number={v.number} />
              <span className="text-caption tabular-nums text-ink-3">
                {v.consents > 0 ? `${v.consents} consent${v.consents === 1 ? "" : "s"}` : "No consents"}
              </span>
            </div>
            <p className="mt-1.5 text-caption text-ink-2">
              {v.status === "draft"
                ? <>Edited by {personName(v.updated_by)} · {formatDate(v.updated_at.slice(0, 10))}</>
                : <>Published by {personName(v.published_by)} · {v.published_at ? formatDate(v.published_at.slice(0, 10)) : "—"}</>}
            </p>
            {v.status === "archived" && v.archived_at && (
              <p className="text-caption text-ink-3">Archived {formatDate(v.archived_at.slice(0, 10))}</p>
            )}
            <div className="mt-2 flex gap-1.5">
              <Button size="sm" variant="ghost" onClick={() => onPreview(v)}><IconEye size={14} /> View</Button>
              {manage && v.status !== "draft" && (
                <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => onRestore(v.number)}>
                  {busy === v.number ? "Copying…" : "Copy to draft"}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* ---- the editor --------------------------------------------------------------- */

const KIND_LABEL: Record<ConsentSectionKind, string> = {
  text: "Text",
  fields: "Fields to fill in",
  acknowledgements: "Statements to acknowledge",
};

function Editor({ content, onChange }: { content: ConsentContent; onChange: (c: ConsentContent) => void }) {
  const set = <K extends keyof ConsentContent>(key: K, value: ConsentContent[K]) => onChange({ ...content, [key]: value });
  const setSection = (i: number, next: ConsentSection) =>
    set("sections", content.sections.map((s, j) => (j === i ? next : s)));

  return (
    <>
      <Card>
        <CardHeader title="The form" subtitle="What the patient reads first. Your logo and clinic name are added on their own." />
        <CardBody className="grid grid-cols-1 gap-4 pt-0 md:grid-cols-[minmax(0,1fr)_10rem]">
          <Field label="Title" required htmlFor="cf-title">
            <Input id="cf-title" value={content.title} invalid={!content.title.trim()}
                   onChange={(e) => set("title", e.target.value)} maxLength={160} />
          </Field>
          <Field label="Request stays open" htmlFor="cf-days" help="days, then it expires">
            <NumberInput id="cf-days" value={content.validity_days} min={1} max={365}
                         onChange={(v) => set("validity_days", v)} />
          </Field>
          <Field label="Introduction" htmlFor="cf-intro" className="md:col-span-2"
                 help="Shown under the title. A blank line starts a new paragraph.">
            <Textarea id="cf-intro" rows={3} value={content.intro} onChange={(e) => set("intro", e.target.value)} />
          </Field>
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-label font-medium text-ink">Patient details printed on the form</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2.5">
              {PATIENT_DETAILS.map((d) => (
                <Checkbox
                  key={d.key}
                  label={d.label}
                  checked={content.patient_fields.includes(d.key)}
                  disabled={d.key === "full_name"}
                  onChange={(on) => set("patient_fields", on
                    ? [...content.patient_fields, d.key]
                    : content.patient_fields.filter((k) => k !== d.key))}
                />
              ))}
            </div>
          </fieldset>
        </CardBody>
      </Card>

      {content.sections.map((section, i) => (
        <SectionEditor
          key={section.id}
          index={i}
          count={content.sections.length}
          section={section}
          content={content}
          onChange={(next) => setSection(i, next)}
          onMove={(by) => set("sections", move(content.sections, i, by))}
          onRemove={() => set("sections", content.sections.filter((_, j) => j !== i))}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-[var(--r-lg)] border border-dashed border-line-strong px-4 py-3">
        <span className="mr-1 text-label font-medium text-ink-2">Add a section</span>
        {(Object.keys(KIND_LABEL) as ConsentSectionKind[]).map((kind) => (
          <Button key={kind} size="sm" variant="secondary"
                  onClick={() => set("sections", [...content.sections, newSection(kind, content)])}>
            <IconPlus size={14} /> {KIND_LABEL[kind]}
          </Button>
        ))}
      </div>

      <Card>
        <CardHeader title="Signatures" subtitle="Printed at the end, after every section." />
        <CardBody className="space-y-4 pt-0">
          <Field label="Declaration above the patient's signature" required htmlFor="cf-decl">
            <Textarea id="cf-decl" rows={3} value={content.signatures.declaration}
                      invalid={!content.signatures.declaration.trim()}
                      onChange={(e) => set("signatures", { ...content.signatures, declaration: e.target.value })} />
          </Field>
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            <Switch label="Patient signature (always)" checked disabled onChange={() => undefined} />
            <Switch label="Clinician countersigns" checked={content.signatures.provider}
                    onChange={(v) => set("signatures", { ...content.signatures, provider: v })} />
            <Switch label="Staff witness line" checked={content.signatures.witness}
                    onChange={(v) => set("signatures", { ...content.signatures, witness: v })} />
          </div>
        </CardBody>
      </Card>
    </>
  );
}

function SectionEditor({
  index, count, section, content, onChange, onMove, onRemove,
}: {
  index: number;
  count: number;
  section: ConsentSection;
  content: ConsentContent;
  onChange: (s: ConsentSection) => void;
  onMove: (by: -1 | 1) => void;
  onRemove: () => void;
}) {
  const patch = (p: Partial<ConsentSection>) => onChange({ ...section, ...p });
  const base = `cf-${section.id}`;

  return (
    <Card as="section" aria-labelledby={`${base}-title`}>
      <div className="flex items-center gap-2 border-b border-line-soft px-4 py-2.5">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-surface-3 text-caption font-semibold tabular-nums text-ink-2">
          {index + 1}
        </span>
        <Badge size="sm">{KIND_LABEL[section.kind]}</Badge>
        <div className="ml-auto flex items-center gap-0.5">
          <Button variant="ghost" size="icon-sm" aria-label="Move section up" disabled={index === 0} onClick={() => onMove(-1)}>
            <IconArrowUp size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Move section down" disabled={index === count - 1} onClick={() => onMove(1)}>
            <IconArrowDown size={15} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Remove section" disabled={count === 1} onClick={onRemove}>
            <IconTrash size={15} />
          </Button>
        </div>
      </div>
      <div className="space-y-4 px-4 py-4">
        <Field label="Section title" required htmlFor={`${base}-title`}>
          <Input id={`${base}-title`} value={section.title} invalid={!section.title.trim()}
                 onChange={(e) => patch({ title: e.target.value })} maxLength={160} />
        </Field>
        <Field label={section.kind === "text" ? "Text" : "Description (optional)"} htmlFor={`${base}-body`}
               help="A blank line starts a new paragraph. Start a line with “- ” for a bullet point.">
          <Textarea id={`${base}-body`} rows={section.kind === "text" ? 5 : 2} value={section.body}
                    onChange={(e) => patch({ body: e.target.value })} />
        </Field>

        {section.kind === "fields" && (
          <div>
            <p className="mb-2 text-label font-medium text-ink">Fields</p>
            <p className="mb-3 text-caption text-ink-3">Filled in by staff when consent is requested, and shown to the patient.</p>
            <ul className="space-y-2">
              {section.fields.map((f, j) => (
                <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[var(--r)] bg-surface-2 px-3 py-2.5">
                  <Input aria-label={`Field ${j + 1} label`} className="min-w-[14rem] flex-1" value={f.label}
                         invalid={!f.label.trim()}
                         onChange={(e) => patch({ fields: section.fields.map((x, k) => (k === j ? { ...x, label: e.target.value } : x)) })} />
                  <Checkbox label="Required" checked={f.required}
                            onChange={(v) => patch({ fields: section.fields.map((x, k) => (k === j ? { ...x, required: v } : x)) })} />
                  <Checkbox label="Several lines" checked={f.multiline}
                            onChange={(v) => patch({ fields: section.fields.map((x, k) => (k === j ? { ...x, multiline: v } : x)) })} />
                  <Button variant="ghost" size="icon-sm" aria-label={`Remove field ${f.label}`}
                          disabled={section.fields.length === 1}
                          onClick={() => patch({ fields: section.fields.filter((_, k) => k !== j) })}>
                    <IconTrash size={14} />
                  </Button>
                </li>
              ))}
            </ul>
            <Button className="mt-2" size="sm" variant="ghost"
                    onClick={() => patch({ fields: [...section.fields, { id: freshId("field", allIds(content)), label: "New field", required: false, multiline: false }] })}>
              <IconPlus size={14} /> Add a field
            </Button>
          </div>
        )}

        {section.kind === "acknowledgements" && (
          <div>
            <p className="mb-2 text-label font-medium text-ink">Statements</p>
            <p className="mb-3 text-caption text-ink-3">The patient ticks each one. A required statement must be ticked before they can sign.</p>
            <ul className="space-y-2">
              {section.statements.map((a, j) => (
                <li key={a.id} className={cn("rounded-[var(--r)] bg-surface-2 px-3 py-2.5")}>
                  <Textarea aria-label={`Statement ${j + 1}`} rows={2} value={a.text} invalid={!a.text.trim()}
                            onChange={(e) => patch({ statements: section.statements.map((x, k) => (k === j ? { ...x, text: e.target.value } : x)) })} />
                  <div className="mt-2 flex items-center justify-between">
                    <Checkbox label="Required" checked={a.required}
                              onChange={(v) => patch({ statements: section.statements.map((x, k) => (k === j ? { ...x, required: v } : x)) })} />
                    <Button variant="ghost" size="sm" disabled={section.statements.length === 1}
                            onClick={() => patch({ statements: section.statements.filter((_, k) => k !== j) })}>
                      <IconTrash size={14} /> Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Button className="mt-2" size="sm" variant="ghost"
                    onClick={() => patch({ statements: [...section.statements, { id: freshId("ack", allIds(content)), text: "", required: true }] })}>
              <IconPlus size={14} /> Add a statement
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
