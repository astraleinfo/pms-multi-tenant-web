"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { CLINICAL_TYPES } from "@/lib/data/catalog";
import { demoAccountsFor } from "@/lib/demo-accounts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthStage, DemoCredentials } from "@/components/layout/auth-stage";
import { Monogram } from "@/components/layout/rail";
import { IconAlert, IconArrowRight, IconLayers, IconLock } from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";

const POINTS = [
  { title: "Tenant", body: "Fixed by the address you came in on. Nothing in the app can change it." },
  { title: "Clinical type", body: "Which exam fields and charts a visit gets — dental, eye, skin." },
  { title: "Entitlement", body: "What the clinic has bought. Locks whole modules, not fields." },
  { title: "Customisation", body: "The clinic's own extra fields, layered on top of the rest." },
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
  const accounts = demoAccountsFor(tenant.slug);
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
      eyebrow="Clinic sign-in"
      title={tenant.name}
      address={address}
      points={POINTS}
      blurb={
        <>
          This address <em className="not-italic text-stage-ink">is</em> the tenant. Every query made after you sign in
          is scoped to {tenant.name} because of the host it arrived on — there is no clinic selector inside the app to
          get that wrong.
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Monogram name={tenant.name} size={40} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-title font-semibold text-ink">
            Sign in
          </h2>
          <p className="truncate text-caption text-ink-3">
            {clinical.label}
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
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

        <Field label="Password" required htmlFor="password">
          <Input
            id="password"
            type="password"
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
          Sign in <IconArrowRight size={16} />
        </Button>

        <p className="text-center text-label text-ink-3">
          <a href="/forgot-password" className="text-accent-text underline-offset-4 hover:underline">
            Forgotten your password?
          </a>
        </p>
      </form>

      <DemoCredentials
        className="mt-4"
        accounts={accounts}
        onPick={(e, p) => { setEmail(e); setPassword(p); setError(null); }}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-caption text-ink-3">
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
