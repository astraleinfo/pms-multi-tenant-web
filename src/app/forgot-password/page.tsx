"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";
import {
  AuthLink, AuthNote, AuthSplit, EmailField, SubmitButton,
} from "@/components/layout/auth-split";

/* ==========================================================================
   "I have forgotten my password."

   The one thing this page must not do is answer the question it is being
   asked. Whether an address has an account at this clinic is exactly what an
   attacker with a list of emails wants to know, so the response is the same
   sentence either way and the only difference is visible in an inbox.

   That is also why there is no error state worth showing: the request cannot
   meaningfully fail from the visitor's side. It is also why the confirmation
   never names the address back — repeating it would turn the screen into the
   oracle the sameness was protecting.
   ========================================================================== */

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Long enough that the button is not a way to send somebody a dozen emails. */
const RESEND_SECONDS = 45;

export default function ForgotPasswordPage() {
  const { hostTenant, hostTenantPending, ready } = useApp();
  const [email, setEmail] = React.useState("");
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  if (!ready || hostTenantPending || !hostTenant) return <StageLoader />;

  const send = async () => {
    setBusy(true);
    /* A failure here is a network problem, not an answer about the address —
       so it is swallowed and the same screen is shown. */
    await api.requestPasswordReset(email.trim()).catch(() => undefined);
    setBusy(false);
    setSent(true);
    setCooldown(RESEND_SECONDS);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError(null);
    await send();
  };

  if (sent) {
    return (
      <AuthSplit
        title="Check your email"
        subtitle="We’ve sent password reset instructions to your registered email address."
        below={
          <div className="mt-6 text-center">
            <AuthLink muted href="/login">← Back to sign in</AuthLink>
          </div>
        }
      >
        <div className="mt-8 space-y-5">
          <EnvelopeMark />
          <p className="text-center text-caption leading-relaxed text-ink-3">
            The link works once and expires in a couple of hours. Nothing has changed yet — your
            current password still works until you use it.
          </p>
          <div className="text-center">
            {cooldown > 0 ? (
              <p className="text-caption text-ink-3">
                Didn’t receive the email? You can resend in {cooldown}s.
              </p>
            ) : (
              <p className="text-caption text-ink-3">
                Didn’t receive the email?{" "}
                <AuthLink onClick={send}>{busy ? "Sending…" : "Resend"}</AuthLink>
              </p>
            )}
          </div>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      title="Forgot your password?"
      subtitle="Enter your email address and we’ll send you instructions to reset your password."
      below={
        <div className="mt-6 text-center">
          <AuthLink muted href="/login">← Back to sign in</AuthLink>
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <EmailField
          id="email"
          label="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(null); }}
          placeholder="Enter your email address"
          error={emailError}
          required
        />
        <SubmitButton busy={busy} busyLabel="Sending…">Send reset link</SubmitButton>
        <AuthNote>
          This page answers the same way whatever you type, so it can’t be used to find out who
          works here.
        </AuthNote>
      </form>
    </AuthSplit>
  );
}

/** A sealed envelope — the one picture this screen needs. */
function EnvelopeMark() {
  return (
    <div className="flex justify-center" aria-hidden>
      <svg width={112} height={84} viewBox="0 0 112 84" fill="none" focusable="false">
        <rect x={6} y={10} width={100} height={68} rx={12} className="fill-accent-soft" />
        <rect x={6} y={10} width={100} height={68} rx={12} className="fill-none stroke-accent-border" strokeWidth={1.5} />
        <path
          d="M16 22 50 47a10 10 0 0 0 12 0l34-25"
          className="stroke-accent" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round"
        />
        <circle cx={90} cy={64} r={14} className="fill-ok" />
        <path d="m84 64 4 4 9-9" className="stroke-surface" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
