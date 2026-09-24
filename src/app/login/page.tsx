"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";
import {
  AuthError, AuthLink, AuthNote, AuthSplit, EmailField, PasswordField, RememberRow, SubmitButton,
} from "@/components/layout/auth-split";

/* ==========================================================================
   Tenant sign-in — the clinic's own address.

   The window is split: the module carousel on the left, this form on the
   right. Layout, drawings and controls live in the shared shell; this page
   brings the clinic's words and the clinic's sign-in.
   ========================================================================== */

/* the address is remembered only when asked, and only on this device */
const REMEMBER_KEY = "astrale.login.email";

/* Deliberately loose. The field's job is to catch a typo like a missing @,
   not to adjudicate RFC 5322 — the server is the one that knows whether an
   address exists, and a clever pattern here only ever rejects real people. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The sentence shown when a sign-in is refused. The server's own wording is
 * kept whenever it is saying something specific — an account locked, a clinic
 * suspended — because that is information the person needs. Only the generic
 * "those were the wrong details" case is replaced, where the server is terse
 * by design and the screen can afford to be kind.
 */
const GENERIC = /invalid|incorrect|credential|do(es)? not match|not found|no account|unauthor/i;

export default function LoginPage() {
  const router = useRouter();
  const { hostTenant, hostTenantPending, session, ready, signIn, notify } = useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [askAdmin, setAskAdmin] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  /* already signed in? the login page has nothing to offer */
  React.useEffect(() => {
    if (ready && session.signedIn) router.replace("/dashboard");
  }, [ready, session.signedIn, router]);

  React.useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {
      /* storage blocked — nothing to restore */
    }
  }, []);

  /* the clinic behind this address is a public read — the one thing the API
     answers without a session */
  if (!ready || hostTenantPending || !hostTenant) return <StageLoader />;

  const tenant = hostTenant;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError(null);
    setBusy(true);
    const result = await signIn(email, password);
    setBusy(false);
    if (result.ok) {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage blocked — sign-in still stands */
      }
      setError(null);
      notify({ tone: "ok", title: "Signed in", body: `Welcome back to ${tenant.name}.` });
      router.replace("/dashboard");
    } else {
      setError(
        GENERIC.test(result.error)
          ? "We couldn’t sign you in with those credentials. Please check your email and password and try again."
          : result.error,
      );
      setPassword("");
    }
  };

  return (
    <AuthSplit
      title="Welcome back"
      subtitle={<>Sign in to <span className="font-medium text-ink">{tenant.name}</span>.</>}
      below={
        <div className="mt-6 text-center">
          <AuthLink muted onClick={() => setAskAdmin((v) => !v)} aria-expanded={askAdmin}>
            Contact your administrator
          </AuthLink>
          {askAdmin && (
            <AuthNote>
              Accounts at {tenant.name} are created by your clinic admin — ask them to send you an
              invitation.
            </AuthNote>
          )}
        </div>
      }
    >
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <EmailField
          id="email"
          label="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(null); setError(null); }}
          placeholder="Enter your email address"
          error={emailError}
          required
        />
        <PasswordField
          id="password"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder="Enter your password"
          invalid={!!error}
          required
        />
        <RememberRow
          checked={remember}
          onChange={setRemember}
          trailing={<AuthLink href="/forgot-password">Forgot password?</AuthLink>}
        />
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </AuthSplit>
  );
}
