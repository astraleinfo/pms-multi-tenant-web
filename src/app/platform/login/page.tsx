"use client";

import * as React from "react";
import { useRouter } from "@/lib/navigation";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";
import {
  AuthError, AuthNote, AuthSplit, EmailField, PasswordField, RememberRow, SubmitButton,
  type ShowcaseSlide,
} from "@/components/layout/auth-split";

/* ==========================================================================
   Platform sign-in — the console's own address.

   The same window as a clinic's sign-in, because it is the same product, and
   marked at the wordmark as the console, because it is not the same job: the
   people here work above every clinic rather than inside one. The showcase
   opposite is the console's own work, not the clinical modules — a super
   admin never opens a queue or writes a prescription.

   There is no password reset for platform staff from this page, so no link
   offers one.
   ========================================================================== */

const CONSOLE: ShowcaseSlide[] = [
  {
    key: "console.onboard",
    name: "Onboard clinics",
    blurb: "A subdomain, an admin invite and a staff import — a clinic live in one sitting.",
  },
  {
    key: "console.modules",
    name: "Modules & pricing",
    blurb: "Set what each module costs and choose which of them a clinic runs.",
  },
  {
    key: "console.billing",
    name: "Billing & reminders",
    blurb: "Monthly bills, reminders before they fall due, and holds when they go unpaid.",
  },
  {
    key: "console.apart",
    name: "Kept outside",
    blurb: "Platform staff never appear inside a clinic, and patient data never passes through here.",
  },
];

/* kept apart from the clinic sign-in's key: one browser may hold both */
const REMEMBER_KEY = "astrale.platform-login.email";

const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GENERIC = /invalid|incorrect|credential|do(es)? not match|not found|no account|unauthor/i;

export default function PlatformLoginPage() {
  const router = useRouter();
  const { platformSession, ready, platformSignIn } = useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [emailError, setEmailError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (ready && platformSession.signedIn) router.replace("/platform");
  }, [ready, platformSession.signedIn, router]);

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

  if (!ready) return <StageLoader />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!LOOKS_LIKE_EMAIL.test(email.trim())) {
      setEmailError("Please enter a valid email address.");
      return;
    }
    setEmailError(null);
    setBusy(true);
    const result = await platformSignIn(email, password);
    setBusy(false);
    if (result.ok) {
      try {
        if (remember) localStorage.setItem(REMEMBER_KEY, email);
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* storage blocked — sign-in still stands */
      }
      setError(null);
      router.replace("/platform");
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
      slides={CONSOLE}
      badge="Console"
      tone="console"
      title="Platform sign-in"
      subtitle="Astrale staff only. This is the console that runs every clinic."
      below={
        <AuthNote>
          Platform accounts are issued by Astrale, and there is no self-service reset for them —
          ask another super admin.
        </AuthNote>
      }
    >
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <EmailField
          id="pemail"
          label="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setEmailError(null); setError(null); }}
          placeholder="you@astrale.health"
          error={emailError}
          required
        />
        <PasswordField
          id="ppassword"
          label="Password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder="Enter your password"
          invalid={!!error}
          required
        />
        <RememberRow checked={remember} onChange={setRemember} />
        {error && <AuthError>{error}</AuthError>}
        <SubmitButton busy={busy}>Sign in</SubmitButton>
      </form>
    </AuthSplit>
  );
}
