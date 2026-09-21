"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { usePlatformSnapshot } from "@/lib/query/hooks";
import * as api from "@/lib/api";
import { CLINICAL_TYPES, FEATURES } from "@/lib/data/catalog";
import { slugProblem, slugify } from "@/lib/tenancy";
import type { ClinicalTypeKey, Id, Tenant } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { KV } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/field";
import { useEnterClinic } from "./chrome";
import { IconArrowRight, IconLock, IconSpark } from "@/components/ui/icons";

/* ==========================================================================
   Creating a clinic.

   The one thing that only exists here: §3.1, performed by the platform rather
   than by a self-service form inside a tenant. It creates the tenant, claims
   its subdomain, seeds the core modules, clones the field set for its clinical
   type and makes its first admin — who is emailed a link to choose a password
   nobody at the platform will ever see.
   ========================================================================== */

/** What the console is told after a clinic is created — never a password. */
export interface CreatedClinic {
  name: string;
  slug: string;
  email: string;
  /** false means the clinic exists but nobody can sign into it yet */
  invitationSent: boolean;
  /** only under the development mail transport; otherwise it is in an inbox */
  invitationUrl: string | null;
  tenantId: Id;
  userId: Id;
  /** the row itself, so the console can enter the clinic it just made */
  tenant: Tenant;
}

/** The form and the receipt that follows it, as one thing a page can open. */
export function CreateClinicFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [created, setCreated] = React.useState<CreatedClinic | null>(null);

  return (
    <>
      <CreateClinic
        open={open}
        onClose={onClose}
        onCreated={(next) => { onClose(); setCreated(next); }}
      />
      <CreatedReceipt created={created} onChange={setCreated} onClose={() => setCreated(null)} />
    </>
  );
}

function CreateClinic({
  open, onClose, onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: CreatedClinic) => void;
}) {
  const { host, createTenant, notify } = useApp();
  const { data: snapshot } = usePlatformSnapshot();
  const [name, setName] = React.useState("");
  const [slug, setSlug] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [city, setCity] = React.useState("");
  const [type, setType] = React.useState<ClinicalTypeKey>("dental");
  const [admin, setAdmin] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setName(""); setSlug(""); setSlugTouched(false); setCity("");
      setType("dental"); setAdmin(""); setEmail(""); setTouched(false);
    }
  }, [open]);

  /* the subdomain follows the name until it is edited by hand */
  const effectiveSlug = slugTouched ? slug : slugify(name);
  const taken = (snapshot?.tenants ?? []).map((r) => r.tenant.slug);

  /* Two checks, and they answer different questions. The local one is instant
     and covers shape and the clinics this console already knows about; the
     server's is authoritative and knows about the ones it does not. Neither
     reserves anything — the unique index settles a real race. */
  const localSlugProblem = effectiveSlug || touched ? slugProblem(effectiveSlug, taken) : null;
  const remote = useSlugCheck(localSlugProblem ? "" : effectiveSlug);
  const slugError = localSlugProblem ?? remote.problem;

  const nameError = touched && !name.trim() ? "A clinic name is required." : null;
  const adminError = touched && !admin.trim() ? "Name the first admin." : null;
  const emailError = touched && !email.trim() ? "An address to send the invitation to." : null;

  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setTouched(true);
    if (!name.trim() || !admin.trim() || !email.trim() || slugProblem(effectiveSlug, taken)) return;

    const adminEmail = email.trim();
    setBusy(true);
    let result;
    try {
      /* The subdomain is claimed by the server, not by this form: two people
         creating "harbour" at once means the second one hears about it here. */
      result = await createTenant({
        name: name.trim(),
        slug: effectiveSlug,
        city: city.trim() || "—",
        clinical_type: type,
        admin_name: admin.trim(),
        admin_email: adminEmail,
      });
    } catch (error) {
      setBusy(false);
      notify({
        tone: "critical",
        title: "That clinic was not created",
        body: error instanceof Error ? error.message : "Try again.",
      });
      return;
    }
    setBusy(false);

    /* A clinic whose admin never got the link exists but cannot be signed
       into, so that is not a success message. */
    notify(
      result.invitationSent
        ? { tone: "ok", title: `${name.trim()} created`, body: `Invitation sent to ${adminEmail}.` }
        : {
          tone: "warn",
          title: `${name.trim()} created, but the invitation did not send`,
          body: "Nobody can sign in until it does. Try Resend.",
        },
    );
    onCreated({
      name: name.trim(),
      slug: effectiveSlug,
      email: adminEmail,
      invitationSent: result.invitationSent,
      invitationUrl: result.invitationUrl,
      tenantId: result.tenantId,
      userId: result.userId,
      tenant: result.tenant,
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a clinic"
      subtitle="Creates the tenant, claims its subdomain, seeds the core modules and makes its first admin."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => { void submit(); }} disabled={busy}>
            <IconSpark size={15} /> {busy ? "Creating…" : "Create clinic"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Clinic name" required className="sm:col-span-2" error={nameError}>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Harbourside Dental" />
        </Field>

        <Field
          label="Subdomain"
          required
          className="sm:col-span-2"
          error={slugError}
          help={!slugError ? "This is the address the clinic signs in at." : undefined}
        >
          <div className="flex items-stretch">
            <Input
              value={effectiveSlug}
              onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }}
              placeholder="harbourside"
              invalid={!!slugError}
              className="rounded-r-none"
            />
            <span className="tnum inline-flex items-center rounded-r-[var(--r)] border border-l-0 border-line-strong bg-surface-2 px-3 font-mono text-label text-ink-3">
              .{host.root}{host.port ? `:${host.port}` : ""}
            </span>
          </div>
        </Field>

        <Field label="City">
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Manchester" />
        </Field>
        <Field label="Clinical type" required help="Decides the exam fields every encounter gets.">
          <Select value={type} onChange={(e) => setType(e.target.value as ClinicalTypeKey)}>
            {CLINICAL_TYPES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </Select>
        </Field>

        <Field label="First admin" required error={adminError}>
          <Input value={admin} onChange={(e) => setAdmin(e.target.value)} placeholder="Their name" />
        </Field>
        <Field
          label="Admin email"
          required
          error={emailError}
          help={!emailError ? "Their username, and where the invitation goes." : undefined}
        >
          <Input
            type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder={`admin@${effectiveSlug || "clinic"}.test`} invalid={!!emailError}
          />
        </Field>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--r)] border border-accent-border bg-accent-soft px-3 py-2.5 text-caption leading-relaxed text-accent-text">
        <IconLock size={13} className="mt-0.5 shrink-0" />
        <span>
          No password is set here, by anyone. The account is created without one and this
          person is emailed a single-use link to choose their own — so the password their
          clinic runs on is one nobody at the platform has ever seen.
        </span>
      </div>

      <div className="mt-4 rounded-[var(--r)] border border-line bg-surface-2 px-3 py-2.5">
        <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Seeded on creation</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {FEATURES.filter((f) => f.is_core).map((f) => (
            <Badge key={f.key} tone="accent" size="sm" dot={false}>{f.name}</Badge>
          ))}
          <span className={cn("text-caption text-ink-3", "self-center")}>
            — paid modules stay off until the platform switches them on
          </span>
        </div>
      </div>
    </Modal>
  );
}

function CreatedReceipt({
  created, onChange, onClose,
}: {
  created: CreatedClinic | null;
  onChange: (next: CreatedClinic) => void;
  onClose: () => void;
}) {
  const { host } = useApp();
  const { enter, entering } = useEnterClinic();

  return (
    <Modal
      open={!!created}
      onClose={onClose}
      width="sm"
      title={created ? `${created.name} is live` : ""}
      subtitle={
        created?.invitationSent
          ? "Its subdomain is serving already, and its first admin has been invited."
          : "Its subdomain is serving, but the invitation did not send."
      }
      footer={
        created && (
          <>
            <Button variant="ghost" onClick={onClose}>Close</Button>
            {/* As support, not as a link. This clinic's admin has not chosen a
                password yet, so its sign-in screen is a door nobody can open —
                including whoever just created it. */}
            <Button
              variant="primary"
              disabled={entering === created.tenantId}
              onClick={() => { void enter({ ...created.tenant }); }}
            >
              {entering === created.tenantId ? "Opening…" : "Open clinic"}
              <IconArrowRight size={15} />
            </Button>
          </>
        )
      }
    >
      {created && (
        <div className="space-y-4">
          <div className="rounded-[var(--r)] border border-line bg-surface-2 p-3.5 text-center">
            <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">Address</p>
            <p className="tnum mt-1.5 break-all font-mono text-body font-medium text-ink">
              {created.slug}.{host.root}{host.port ? `:${host.port}` : ""}
            </p>
          </div>
          <InvitationPanel created={created} onResent={onChange} />
          <dl className="grid grid-cols-2 gap-x-4">
            <KV label="Plan" value="Trial" />
            <KV label="Modules" value="Core loop only" />
          </dl>
          <p className="text-caption leading-relaxed text-ink-2">
            Nothing about this clinic can be reached from another clinic&apos;s address, and its data
            starts empty. Until its administrator follows the link, the account has no password at
            all — so there is nothing to guess and nothing to leak.
          </p>
        </div>
      )}
    </Modal>
  );
}

/**
 * Is this subdomain free?
 *
 * Asked of the server while somebody types, debounced so a name typed at speed
 * is one question rather than twelve. The answer is advisory — it reserves
 * nothing — but it is the same rule the create path enforces, so what the form
 * says here is what the submit will do.
 */
function useSlugCheck(slug: string) {
  const [problem, setProblem] = React.useState<string | null>(null);
  const [checking, setChecking] = React.useState(false);

  React.useEffect(() => {
    if (!slug) { setProblem(null); setChecking(false); return; }

    let cancelled = false;
    setChecking(true);
    const timer = setTimeout(() => {
      api.checkSlug(slug)
        .then((answer) => { if (!cancelled) setProblem(answer.available ? null : answer.problem); })
        .catch(() => { if (!cancelled) setProblem(null); })
        .finally(() => { if (!cancelled) setChecking(false); });
    }, 300);

    return () => { cancelled = true; clearTimeout(timer); };
  }, [slug]);

  return { problem, checking };
}

/**
 * What happened to the invitation, and how to send it again.
 *
 * The link itself only appears under the development mail transport, where
 * there is no inbox to check. With a real transport it exists in exactly one
 * place, which is the point of the whole arrangement.
 */
export function InvitationPanel({
  created, onResent,
}: {
  created: CreatedClinic;
  onResent: (next: CreatedClinic) => void;
}) {
  const { resendTenantInvitation, notify } = useApp();
  const [busy, setBusy] = React.useState(false);

  const resend = async () => {
    setBusy(true);
    try {
      const again = await resendTenantInvitation(created.tenantId, created.userId);
      onResent({ ...created, invitationSent: again.invitationSent, invitationUrl: again.invitationUrl });
      notify(
        again.invitationSent
          ? { tone: "ok", title: "Invitation sent", body: `Another link is on its way to ${created.email}.` }
          : { tone: "critical", title: "Still could not send", body: "Check the mail transport." },
      );
    } catch (error) {
      notify({
        tone: "critical",
        title: "Could not resend",
        body: error instanceof Error ? error.message : "Try again.",
      });
    }
    setBusy(false);
  };

  return (
    <div
      className={cn(
        "rounded-[var(--r)] border p-3.5",
        created.invitationSent
          ? "border-accent-border bg-accent-soft"
          : "border-critical-border bg-critical-soft",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p
            className={cn(
              "text-micro font-semibold uppercase tracking-[0.09em]",
              created.invitationSent ? "text-accent-text" : "text-critical-text",
            )}
          >
            {created.invitationSent ? "Invitation sent" : "Invitation not sent"}
          </p>
          <p className="tnum mt-1 break-all font-mono text-label text-ink">{created.email}</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { void resend(); }} disabled={busy}>
          {busy ? "Sending…" : "Resend"}
        </Button>
      </div>

      <p className="mt-2 text-caption leading-relaxed text-ink-2">
        {created.invitationSent
          ? "They choose their own password from the link. It works once and expires."
          : "Nobody can sign in to this clinic until a link reaches them."}
      </p>

      {created.invitationUrl && (
        <div className="mt-2.5 border-t border-line-soft pt-2.5">
          <p className="text-micro font-semibold uppercase tracking-[0.09em] text-ink-3">
            Development link
          </p>
          <p className="mt-1 text-micro leading-snug text-ink-3">
            Shown only because mail is going to the log. Configure a real transport and this
            disappears — the link then exists in one inbox and nowhere else.
          </p>
          <a
            href={created.invitationUrl}
            className="tnum mt-1.5 block break-all font-mono text-caption text-accent-text underline-offset-4 hover:underline"
          >
            {created.invitationUrl}
          </a>
        </div>
      )}
    </div>
  );
}
