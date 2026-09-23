"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { AuthStage, ClinicPreview } from "@/components/layout/auth-stage";
import { Monogram } from "@/components/layout/rail";
import {
  IconAlert, IconArrowRight, IconCalendar, IconLayers, IconLock, IconReceipt, IconStethoscope,
} from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";

/* What the people signing in actually do here — in their terms, not ours. */
const POINTS = [
  {
    title: "The day at a glance",
    body: "Appointments, walk-ins and the waiting room on one screen.",
    icon: <IconCalendar size={15} />,
  },
  {
    title: "Notes that fit your speciality",
    body: "Tooth charts, refraction, lesion maps — the exam your discipline needs.",
    icon: <IconStethoscope size={15} />,
  },
  {
    title: "Billing without re-typing",
    body: "Invoices built from the visit, with pharmacy and lab on the same account.",
    icon: <IconReceipt size={15} />,
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { host, hostTenant, hostTenantPending, session, ready, signIn, consoleUrl, notify } = useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* already signed in? the login page has nothing to offer */
  React.useEffect(() => {
    if (ready && session.signedIn) router.replace("/dashboard");
  }, [ready, session.signedIn, router]);

  /* the clinic behind this address is a public read — the one thing the API
     answers without a session */
  if (!ready || hostTenantPending || !hostTenant) {
    return <StageLoader className="!bg-stage" />;
  }

  const tenant = hostTenant;
  const clinical = CLINICAL_TYPES.find((c) => c.key === tenant.clinical_type)!;
  const address = `${tenant.slug}.${host.root}${host.port ? `:${host.port}` : ""}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) {
      setError(null);
      notify({ tone: "ok", title: "Signed in", body: `Welcome back to ${tenant.name}.` });
      router.replace("/dashboard");
    } else {
      setError(result.error);
      setPassword("");
    }
  };

  return (
    <AuthStage
      eyebrow={`${clinical.label} practice`}
      title={<>Welcome back to<br />{tenant.name}</>}
      address={address}
      points={POINTS}
      preview={<ClinicPreview />}
      blurb="Everything your team needs for the day ahead — the diary, the queue, the notes and the bills — in one place, and only ever this clinic's."
    >
      <div className="flex flex-col items-center text-center">
        <Monogram name={tenant.name} size={48} />
        <h2 className="mt-4 font-display text-h2 font-semibold tracking-[-0.02em] text-ink">
          Sign in
        </h2>
        <p className="mt-1 text-label text-ink-3">
          to <span className="font-medium text-ink-2">{tenant.name}</span>
        </p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Email" required htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setError(null); }}
            placeholder="you@clinic.example"
            invalid={!!error}
            required
          />
        </Field>

        <Field
          label="Password"
          required
          htmlFor="password"
          hint={
            <a href="/forgot-password" className="font-normal text-accent-text underline-offset-4 hover:underline">
              Forgotten it?
            </a>
          }
        >
          <PasswordInput
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setError(null); }}
            placeholder="••••••••"
            invalid={!!error}
            required
          />
        </Field>

        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label leading-snug text-critical-text">
            <IconAlert size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? "Signing in…" : <>Sign in <IconArrowRight size={16} /></>}
        </Button>
      </form>

      <div className="mt-8 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-4 text-caption text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <IconLayers size={13} />
          {clinical.label} workflow
        </span>
        <a href={consoleUrl()} className="font-medium text-accent-text underline-offset-4 hover:underline">
          Platform console
        </a>
      </div>

      <p className="mt-3 flex items-start gap-1.5 text-micro leading-snug text-ink-3">
        <IconLock size={12} className="mt-px shrink-0" />
        Five wrong attempts lock the account until a practice admin releases it.
      </p>
    </AuthStage>
  );
}
