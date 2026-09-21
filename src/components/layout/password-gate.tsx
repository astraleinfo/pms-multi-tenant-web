"use client";

import * as React from "react";
import { useApp } from "@/lib/store/app-store";
import { useSession } from "@/lib/store/session";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthStage } from "@/components/layout/auth-stage";
import { Monogram } from "@/components/layout/rail";
import { IconAlert, IconArrowRight, IconLock, IconShield } from "@/components/ui/icons";

/* ==========================================================================
   The gate in front of a session that is good for exactly one thing.

   Somebody whose password was typed for them by an admin can sign in — refusing
   the sign-in would leave them no way past it — but the session they get is
   held here until they choose their own. The server agrees: `must_change_
   password` comes back on the session and on `/auth/me`, so this is not a
   courtesy of the interface that a hand-written request could step around.

   It is deliberately not a modal over the app. Seeing the dashboard behind a
   dialog would suggest the account is usable, and it is not.
   ========================================================================== */

const MIN_LENGTH = 12;

export function PasswordGate({ children }: { children: React.ReactNode }) {
  const { session, hostTenant, notify, changeOwnPassword } = useApp();
  const { user, clearPasswordHold, signOut } = useSession();

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (!session.signedIn || !session.mustChangePassword) return <>{children}</>;

  const tooShort = touched && next.length < MIN_LENGTH;
  const mismatch = touched && confirm.length > 0 && next !== confirm;
  const reused = touched && next.length > 0 && next === current;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (next.length < MIN_LENGTH || next !== confirm || next === current) return;

    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      clearPasswordHold();
      notify({
        tone: "ok",
        title: "Password changed",
        body: "This one is yours. Everywhere else that was signed in has been signed out.",
      });
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Try again.");
      setBusy(false);
    }
  };

  return (
    <AuthStage
      eyebrow="Choose your own password"
      title={hostTenant?.name ?? "Your account"}
      blurb={
        <>
          The password you signed in with was typed by somebody else, so it is not really
          yours yet — and whoever typed it still knows it. Replace it and this account is
          only reachable by you.
        </>
      }
      points={[
        { title: "Not optional", body: "The server holds this session here too, not just the interface." },
        { title: "Only yours", body: "Nobody at the clinic or the platform sees what you choose." },
        { title: "Clears the rest", body: "Every other session this account has open is signed out." },
        { title: "This tab stays", body: "The browser you are in is spared, so you are not locked out mid-change." },
      ]}
    >
      <div className="flex items-center gap-3">
        <Monogram name={user?.name ?? "?"} size={40} />
        <div className="min-w-0">
          <h2 className="truncate font-display text-title font-semibold text-ink">
            {user?.name}
          </h2>
          <p className="tnum truncate font-mono text-caption text-ink-3">{user?.email}</p>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-[var(--r)] border border-warn-border bg-warn-soft px-3 py-2.5 text-caption leading-snug text-warn-text">
        <IconShield size={14} className="mt-px shrink-0" />
        Until this is done, nothing else in the app will open.
      </div>

      <form onSubmit={submit} className="mt-5 space-y-4">
        <Field label="The password you were given" required htmlFor="current">
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => { setCurrent(e.target.value); setError(null); }}
            placeholder="••••••••"
            invalid={!!error}
            required
          />
        </Field>

        <Field
          label="Your new password"
          required
          htmlFor="new-password"
          error={reused ? "Choose one you have not been using." : tooShort ? `At least ${MIN_LENGTH} characters.` : null}
          help={reused || tooShort ? undefined : `At least ${MIN_LENGTH} characters. Length beats punctuation.`}
        >
          <Input
            id="new-password"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => { setNext(e.target.value); setError(null); }}
            placeholder="••••••••••••"
            invalid={tooShort || reused}
            required
          />
        </Field>

        <Field
          label="Confirm"
          required
          htmlFor="confirm-password"
          error={mismatch ? "These do not match." : null}
        >
          <Input
            id="confirm-password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => { setConfirm(e.target.value); setError(null); }}
            placeholder="••••••••••••"
            invalid={mismatch}
            required
          />
        </Field>

        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-2.5 text-label leading-snug text-critical-text"
          >
            <IconAlert size={15} className="mt-px shrink-0" />
            {error}
          </p>
        )}

        <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
          {busy ? "Saving…" : "Set my password"} <IconArrowRight size={16} />
        </Button>
      </form>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line-soft pt-3 text-caption text-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <IconLock size={13} />
          Held until you choose one
        </span>
        <button
          type="button"
          onClick={() => { void signOut(); }}
          className="font-medium text-accent-text underline-offset-4 hover:underline"
        >
          Sign out instead
        </button>
      </div>
    </AuthStage>
  );
}
