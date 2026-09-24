"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/lib/navigation";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import { IconCheck, IconLock } from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";
import {
  AuthError, AuthLink, AuthSplit, PasswordField, SubmitButton,
} from "@/components/layout/auth-split";

/* ==========================================================================
   "Choose a password" — the page behind an invitation or a reset link.

   Both links land here; only the wording differs, and it comes from the
   server's answer rather than from which route was used, so a link cannot be
   made to describe itself as something it is not.

   Nothing on this page is behind a session, because the person using it does
   not have one — that is the situation it exists for. What stands in for a
   session is the token in the URL: single-use, short-lived, and bound to one
   clinic. The clinic itself comes from the address, exactly as it does for
   sign-in.

   No session is handed back at the end either. They sign in with the password
   they just chose, which is the only proof that it went in as they intended.
   ========================================================================== */

/** The API will not accept a shorter one, so the form does not pretend it might. */
const MIN_LENGTH = 12;

/**
 * What the checklist shows. Only the first is a rule — it is the server's,
 * and the form is gated on it. The other three are advice, marked as such,
 * because a client that refused a password the server would have taken would
 * be inventing a policy of its own.
 */
const CHECKS: Array<{ label: string; required?: boolean; met: (v: string) => boolean }> = [
  { label: `At least ${MIN_LENGTH} characters`, required: true, met: (v) => v.length >= MIN_LENGTH },
  { label: "One uppercase letter", met: (v) => /[A-Z]/.test(v) },
  { label: "One number", met: (v) => /\d/.test(v) },
  { label: "One special character", met: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function ChoosePassword({ mode }: { mode: "invite" | "reset" }) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { hostTenant, hostTenantPending, ready, notify } = useApp();

  const [preview, setPreview] = React.useState<api.InvitationPreview | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!token) {
      setPreview({ valid: false, purpose: "", name: "", email: "", clinic: "", problem: "This link is incomplete." });
      return;
    }
    api.inspectInvitation(token)
      .then((answer) => { if (!cancelled) setPreview(answer); })
      .catch(() => {
        if (!cancelled) {
          setPreview({
            valid: false, purpose: "", name: "", email: "", clinic: "",
            problem: "That link could not be checked. Try again in a moment.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [token]);

  if (!ready || hostTenantPending || !preview) return <StageLoader />;

  /* The server's word for what this link is, not the route it arrived on. */
  const kind = preview.valid ? (preview.purpose === "reset" ? "reset" : "invite") : mode;
  const clinicName = preview.clinic || hostTenant?.name || "this clinic";

  const tooShort = touched && password.length < MIN_LENGTH;
  const mismatch = touched && confirm.length > 0 && password !== confirm;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (password.length < MIN_LENGTH || password !== confirm) return;

    setBusy(true);
    try {
      await api.acceptPasswordReset(token, password);
      setDone(true);
      notify({ tone: "ok", title: "Password set", body: "Sign in with it and you are in." });
      /* Straight to sign-in: they have no session, and giving them one here
         would skip the step that proves the password works. */
      setTimeout(() => router.replace("/login"), 2500);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Ask for a new link.");
      setBusy(false);
    }
  };

  if (!preview.valid) {
    return (
      <AuthSplit
        title="This link cannot be used"
        subtitle={preview.problem}
        below={
          <div className="mt-6 text-center">
            <AuthLink muted href="/login">← Back to sign in</AuthLink>
          </div>
        }
      >
        <div className="mt-8 space-y-5">
          <p className="text-body leading-relaxed text-ink-2">
            Links expire, and sending a new one retires the old. Ask for another and use the most
            recent email.
          </p>
          <form onSubmit={(e) => { e.preventDefault(); router.push("/forgot-password"); }}>
            <SubmitButton busy={false}>Send me a new link</SubmitButton>
          </form>
        </div>
      </AuthSplit>
    );
  }

  if (done) {
    return (
      <AuthSplit
        title="Password updated"
        subtitle="Your password has been successfully updated."
        below={
          <p className="mt-4 text-center text-caption text-ink-3">
            Taking you to sign in…
          </p>
        }
      >
        <div className="mt-8 space-y-6">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-ok-soft text-ok-text">
            <IconCheck size={26} strokeWidth={2.4} />
          </span>
          <form onSubmit={(e) => { e.preventDefault(); router.replace("/login"); }}>
            <SubmitButton busy={false}>Return to sign in</SubmitButton>
          </form>
        </div>
      </AuthSplit>
    );
  }

  return (
    <AuthSplit
      title={kind === "invite" ? "Set your password" : "Create a new password"}
      subtitle={
        <>
          Choose a strong password for your Astrale account at{" "}
          <span className="font-medium text-ink">{clinicName}</span>.
        </>
      }
      below={
        <p className="mt-6 flex items-start justify-center gap-1.5 text-caption leading-snug text-ink-3">
          <IconLock size={13} className="mt-0.5 shrink-0" />
          This link works once. After you use it, it is spent — and so is every other link this
          account was sent.
        </p>
      }
    >
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        <PasswordField
          id="password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(null); }}
          placeholder="Enter a new password"
          error={tooShort ? `Use at least ${MIN_LENGTH} characters.` : null}
          required
        />

        <Requirements value={password} />

        <PasswordField
          id="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => { setConfirm(e.target.value); setError(null); }}
          placeholder="Enter it again"
          error={mismatch ? "These two do not match." : null}
          required
        />

        {error && <AuthError>{error}</AuthError>}

        <SubmitButton busy={busy} busyLabel="Setting…">
          {kind === "invite" ? "Set password" : "Reset password"}
        </SubmitButton>
      </form>
    </AuthSplit>
  );
}

/**
 * The checklist. Each row says in words whether it is met, so the tick is
 * never the only thing carrying the answer.
 */
function Requirements({ value }: { value: string }) {
  return (
    <ul className="space-y-1.5">
      {CHECKS.map((c) => {
        const met = c.met(value);
        return (
          <li key={c.label} className="flex items-center gap-2 text-caption">
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
                met ? "bg-ok text-ink-on" : "border border-line-strong bg-surface",
              )}
            >
              {met && <IconCheck size={10} strokeWidth={3} />}
            </span>
            <span className={met ? "text-ink-2" : "text-ink-3"}>
              {c.label}
              {!c.required && <span className="text-ink-3"> (recommended)</span>}
            </span>
            <span className="sr-only">{met ? " — met" : " — not yet met"}</span>
          </li>
        );
      })}
    </ul>
  );
}
