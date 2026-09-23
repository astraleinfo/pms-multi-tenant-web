"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input, PasswordInput } from "@/components/ui/field";
import { AuthStage, ConsolePreview } from "@/components/layout/auth-stage";
import { IconAlert, IconArrowRight, IconLayers, IconLock, IconReceipt, IconShield } from "@/components/ui/icons";

const POINTS = [
  { title: "Onboard clinics", body: "A subdomain, an admin invitation and a staff import in minutes.", icon: <IconLayers size={15} /> },
  { title: "Sell modules", body: "Set prices, grant access and see what each clinic runs.", icon: <IconReceipt size={15} /> },
  { title: "Bill and remind", body: "Monthly bills, reminders, and a hold for anything unpaid.", icon: <IconLock size={15} /> },
  { title: "Stay outside", body: "Platform staff have no clinic of their own and never appear inside one.", icon: <IconShield size={15} /> },
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
      title="The platform console"
      address={`admin.${host.root}${host.port ? `:${host.port}` : ""}`}
      points={POINTS}
      preview={<ConsolePreview />}
      blurb="Above every clinic: onboard them, sell them modules, bill them, and switch them on or off. This address never serves patient data."
    >
      <div className="flex flex-col items-center text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent text-accent-ink">
          <IconShield size={22} />
        </span>
        <h2 className="mt-4 font-display text-h2 font-semibold tracking-[-0.02em] text-ink">
          Platform sign-in
        </h2>
        <p className="mt-1 text-label text-ink-3">Astrale staff only</p>
      </div>

      <form onSubmit={submit} className="mt-7 space-y-4">
        <Field label="Email" required htmlFor="pemail">
          <Input id="pemail" type="email" autoComplete="username" value={email} required
                 onChange={(e) => { setEmail(e.target.value); setError(null); }}
                 placeholder="you@astrale.health" invalid={!!error} />
        </Field>
        <Field label="Password" required htmlFor="ppassword">
          <PasswordInput id="ppassword" autoComplete="current-password" value={password} required
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
          {busy ? "Signing in…" : <>Sign in <IconArrowRight size={16} /></>}
        </Button>
      </form>
    </AuthStage>
  );
}
