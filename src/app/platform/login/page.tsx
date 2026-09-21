"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { DEMO_PLATFORM_ACCOUNTS } from "@/lib/demo-accounts";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthStage, DemoCredentials } from "@/components/layout/auth-stage";
import { IconAlert, IconArrowRight, IconShield } from "@/components/ui/icons";

const POINTS = [
  { title: "Create clinics", body: "Each one gets its own subdomain the moment it exists." },
  { title: "Hand over the keys", body: "The first admin account is created with the tenant." },
  { title: "Lock and release", body: "Suspending a clinic takes its subdomain offline immediately." },
  { title: "Stay outside", body: "Platform staff have no tenant and never appear inside one." },
];

export default function PlatformLoginPage() {
  const router = useRouter();
  const { host, platformSession, ready, platformSignIn } = useApp();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (ready && platformSession.signedIn) router.replace("/platform");
  }, [ready, platformSession.signedIn, router]);

  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const result = await platformSignIn(email, password);
    setBusy(false);
    if (result.ok) {
      setError(null);
      router.replace("/platform");
    } else {
      setError(result.error);
      setPassword("");
    }
  };

  return (
    <AuthStage
      eyebrow="Platform"
      title="Super admin console"
      address={`${host.root}${host.port ? `:${host.port}` : ""}`}
      points={POINTS}
      blurb="Above every clinic: create tenants, hand them a subdomain, and switch them on or off. This host never serves patient data."
    >
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-accent text-accent-ink">
          <IconShield size={19} />
        </span>
        <div className="min-w-0">
          <h2 className="truncate font-display text-title font-semibold text-ink">
            Platform sign-in
          </h2>
          <p className="truncate text-caption text-ink-3">Astrale staff only</p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="Email" required htmlFor="pemail">
          <Input id="pemail" type="email" autoComplete="username" value={email} required
                 onChange={(e) => { setEmail(e.target.value); setError(null); }}
                 placeholder="you@astrale.health" invalid={!!error} />
        </Field>
        <Field label="Password" required htmlFor="ppassword">
          <Input id="ppassword" type="password" autoComplete="current-password" value={password} required
                 onChange={(e) => { setPassword(e.target.value); setError(null); }}
                 placeholder="••••••••" invalid={!!error} />
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
      </form>

      <DemoCredentials
        className="mt-4"
        accounts={DEMO_PLATFORM_ACCOUNTS}
        onPick={(e, p) => { setEmail(e); setPassword(p); setError(null); }}
      />
    </AuthStage>
  );
}
