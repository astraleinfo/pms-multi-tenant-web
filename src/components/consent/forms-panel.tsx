"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { useConsentForms, useConsentTemplates } from "@/lib/query/hooks";
import { qk } from "@/lib/query/keys";
import { formatDate } from "@/lib/format";
import { personName, type ConsentForm } from "@/lib/consent";
import { SettingsSection } from "@/components/ui/settings";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { Callout } from "@/components/ui/callout";
import { IconArrowRight, IconEye, IconPlus, IconShield } from "@/components/ui/icons";
import { DocumentPreview, VersionBadge } from "./shared";

/* ==========================================================================
   Settings → Consent forms.

   One row per form the clinic uses, each saying the only two things that
   matter at a glance: which version patients are signing now, and whether an
   edit is waiting to be published. Everything else is one click in.
   ========================================================================== */

export function ConsentFormsPanel() {
  const { session, can } = useApp();
  const manage = can("consent:manage");
  const { data: forms, isPending, isError, error, refetch } = useConsentForms();
  const [adding, setAdding] = React.useState(false);
  const [preview, setPreview] = React.useState<ConsentForm | null>(null);

  if (!can("consent:read")) {
    return (
      <SettingsSection title="Consent forms">
        <EmptyState icon={<IconShield size={24} />} title="Not available to your role"
                    body="Ask a practice admin if you need to see the clinic's consent forms." />
      </SettingsSection>
    );
  }

  return (
    <div className="space-y-block">
      <SettingsSection
        title="Consent forms"
        hint="Your clinic's own copies of the platform's templates. Edits are saved as a draft and only reach patients when you publish them; every version patients signed is kept."
        actions={manage && (
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <IconPlus size={14} /> Add a form
          </Button>
        )}
      >
        {isPending && (
          <div className="space-y-3 px-4 py-4" aria-busy="true">
            {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        )}
        {isError && (
          <div className="p-4">
            <Callout tone="critical" title="Consent forms could not be loaded"
                     action={<Button size="sm" variant="secondary" onClick={() => refetch()}>Try again</Button>}>
              {error instanceof Error ? error.message : "Something went wrong."}
            </Callout>
          </div>
        )}
        {forms && forms.length === 0 && (
          <EmptyState icon={<IconShield size={24} />} title="No consent form configured"
                      body="Add one from a template to start asking patients for consent."
                      action={manage && <Button variant="primary" size="sm" onClick={() => setAdding(true)}>Add a form</Button>} />
        )}
        {forms && forms.length > 0 && (
          <ul className="divide-y divide-line-soft">
            {forms.map((form) => (
              <li key={form.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-body font-semibold text-ink">{form.name}</p>
                    {form.published
                      ? <VersionBadge status="published" number={form.published.number} />
                      : <span className="text-caption text-warn-text">No published version</span>}
                    {form.draft && <VersionBadge status="draft" number={form.draft.number} />}
                  </div>
                  <p className="mt-0.5 truncate text-caption text-ink-3">
                    From “{form.template_label}”
                    {form.published?.published_at && (
                      <> · published {formatDate(form.published.published_at.slice(0, 10), "long")}
                        {form.published.published_by && ` by ${personName(form.published.published_by)}`}</>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {form.published && (
                    <Button variant="ghost" size="sm" onClick={() => setPreview(form)}>
                      <IconEye size={14} /> Preview
                    </Button>
                  )}
                  <ButtonLink href={`/settings/consent/${form.id}`} variant="secondary" size="sm">
                    {manage ? (form.draft ? "Continue editing" : "Open") : "View"} <IconArrowRight size={14} />
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SettingsSection>

      <p className="px-1 text-caption text-ink-3">
        Your logo and clinic name are added to every printed form automatically —{" "}
        <Link href="/settings?tab=practice" className="font-medium text-accent hover:underline">change them in Practice</Link>.
      </p>

      {preview?.published && (
        <DocumentPreview
          open
          onClose={() => setPreview(null)}
          title={preview.name}
          subtitle={`Version ${preview.published.number} — what patients are asked to sign`}
          load={() => api.consentVersionPdf(preview.id, preview.published!.number)}
          filename={`${preview.name} v${preview.published.number}.pdf`}
        />
      )}
      {manage && <AddForm open={adding} onClose={() => setAdding(false)} tenantId={session.tenantId} />}
    </div>
  );
}

function AddForm({ open, onClose, tenantId }: { open: boolean; onClose: () => void; tenantId: string }) {
  const { notify } = useApp();
  const queryClient = useQueryClient();
  const { data: templates, isPending, isError } = useConsentTemplates();
  const [busy, setBusy] = React.useState<string | null>(null);

  const add = async (key: string) => {
    setBusy(key);
    try {
      const form = await api.createConsentForm(key);
      await queryClient.invalidateQueries({ queryKey: qk.consentForms(tenantId) });
      notify({ tone: "ok", title: `${form.name} added`, body: "Published as version 1 — ready to use, or to edit first." });
      onClose();
    } catch (e) {
      notify({ tone: "critical", title: "That form was not added", body: e instanceof Error ? e.message : "Try again." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Add a consent form"
           subtitle="Start from one of the platform's templates. You get your own copy — the template itself never changes.">
      {isPending && <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>}
      {isError && <Callout tone="critical" title="No templates available">They could not be loaded. Try again shortly.</Callout>}
      {templates && (
        <ul className="divide-y divide-line-soft rounded-[var(--r)] border border-line">
          {templates.map((t) => (
            <li key={t.key} className="flex items-center gap-3 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold text-ink">{t.label}</p>
                <p className="text-caption text-ink-3">{t.description}</p>
              </div>
              <Button size="sm" variant="secondary" disabled={!!busy} onClick={() => add(t.key)}>
                {busy === t.key ? "Adding…" : "Add"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
