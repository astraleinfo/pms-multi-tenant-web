"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthStage } from "@/components/layout/auth-stage";
import { IconArrowRight, IconCheck, IconLock } from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";

/* ==========================================================================
   "I have forgotten my password."

   The one thing this page must not do is answer the question it is being
   asked. Whether an address has an account at this clinic is exactly what an
   attacker with a list of emails wants to know, so the response is the same
   sentence either way and the only difference is visible in an inbox.

   That is also why there is no error state worth showing: the request cannot
   meaningfully fail from the visitor's side.
   ========================================================================== */

export default function ForgotPasswordPage() {
  const { host, hostTenant, hostTenantPending, ready } = useApp();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  if (!ready || hostTenantPending || !hostTenant) return <StageLoader className="!bg-stage" />;

  const address = `${hostTenant.slug}.${host.root}${host.port ? `:${host.port}` : ""}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    /* A failure here is a network problem, not an answer about the address —
       so it is swallowed and the same screen is shown. */
    await api.requestPasswordReset(email.trim()).catch(() => undefined);
    setBusy(false);
    setSent(true);
  };

  return (
    <AuthStage
      eyebrow="Forgotten password"
      title={hostTenant.name}
      address={address}
      blurb={
        <>
          A link comes by email and you choose a new password yourself. Nobody at the clinic
          can see what you pick, and nobody has to hand you a temporary one on the way.
        </>
      }
      points={[
        { title: "Same answer", body: "This page replies identically whether or not the address has an account." },
        { title: "Short-lived", body: "The link expires in a couple of hours and works exactly once." },
        { title: "Ends sessions", body: "Using it signs the account out everywhere, on every device." },
        { title: "Still locked", body: "An account an admin locked stays locked. A link does not release it." },
      ]}
    >
      {sent ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ok-soft text-ok-text">
            <IconCheck size={20} />
          </span>
          <div>
            <h2 className="font-display text-title font-semibold text-ink">
              Check your email
            </h2>
            <p className="mt-2 text-label leading-relaxed text-ink-2">
              If <span className="tnum font-mono text-ink">{email.trim()}</span> has an account at{" "}
              {hostTenant.name}, a link is on its way. It works once and expires in a couple of
              hours.
            </p>
          </div>
          <p className="text-caption leading-relaxed text-ink-3">
            Nothing has changed yet — your current password still works until you use the link.
          </p>
          <a
            href="/login"
            className="block text-center text-label text-accent-text underline-offset-4 hover:underline"
          >
            Back to sign in
          </a>
        </div>
      ) : (
        <>
          <h2 className="font-display text-title font-semibold text-ink">
            Send me a link
          </h2>
          <p className="mt-1 text-label leading-relaxed text-ink-2">
            The address you sign in to {hostTenant.name} with.
          </p>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field label="Email" required htmlFor="email">
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@clinic.example"
                required
              />
            </Field>

            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
              {busy ? "Sending…" : "Send reset link"} <IconArrowRight size={16} />
            </Button>
          </form>

          <div className="mt-4 border-t border-line-soft pt-3">
            <a
              href="/login"
              className="text-label text-accent-text underline-offset-4 hover:underline"
            >
              Back to sign in
            </a>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-micro leading-snug text-ink-3">
            <IconLock size={12} className="mt-px shrink-0" />
            This page answers the same way whatever you type, so it cannot be used to find out
            who works here.
          </p>
        </>
      )}
    </AuthStage>
  );
}
