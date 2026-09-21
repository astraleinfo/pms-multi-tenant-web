"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { AuthStage } from "@/components/layout/auth-stage";
import { Monogram } from "@/components/layout/rail";
import { IconAlert, IconArrowRight, IconCheck, IconLock } from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";

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

export function ChoosePassword({ mode }: { mode: "invite" | "reset" }) {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const { host, hostTenant, hostTenantPending, ready, notify } = useApp();

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

  if (!ready || hostTenantPending || !preview) return <StageLoader className="!bg-stage" />;

  /* The server's word for what this link is, not the route it arrived on. */
  const kind = preview.valid ? (preview.purpose === "reset" ? "reset" : "invite") : mode;
  const clinicName = preview.clinic || hostTenant?.name || "this clinic";
  const address = hostTenant
    ? `${hostTenant.slug}.${host.root}${host.port ? `:${host.port}` : ""}`
    : undefined;

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
      notify({
        tone: "ok",
        title: "Password set",
        body: "Sign in with it and you are in.",
      });
      /* Straight to sign-in: they have no session, and giving them one here
         would skip the step that proves the password works. */
      setTimeout(() => router.replace("/login"), 900);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "That did not work. Ask for a new link.");
      setBusy(false);
    }
  };

  return (
    <AuthStage
      eyebrow={kind === "invite" ? "Set up your account" : "Reset your password"}
      title={clinicName}
      address={address}
      blurb={
        kind === "invite" ? (
          <>
            Your account exists but has no password yet — not a temporary one, not one anybody
            handed you. The one you choose here is the first this account has ever had, and
            nobody at {clinicName} or on the platform has seen it.
          </>
        ) : (
          <>
            Choosing a new password ends every session this account had, on every device.
            That is the point: the usual reason for a reset is that somebody else knew the
            old one.
          </>
        )
      }
      points={[
        { title: "One use", body: "This link stops working the moment it is used, or when a newer one is sent." },
        { title: "One clinic", body: "It was minted for this address and is inert at any other." },
        { title: "Not stored", body: "The server keeps a hash of the link, never the link itself." },
        { title: "Yours", body: "No password is ever set for you, so none can be leaked before you arrive." },
      ]}
    >
      {!preview.valid ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2.5 rounded-[var(--r)] border border-critical-border bg-critical-soft px-3 py-3 text-label leading-snug text-critical-text">
            <IconAlert size={16} className="mt-px shrink-0" />
            <div>
              <p className="font-medium">This link cannot be used.</p>
              <p className="mt-1">{preview.problem}</p>
            </div>
          </div>
          <p className="text-label leading-relaxed text-ink-2">
            Links expire, and sending a new one retires the old. Ask for another and use the
            most recent email.
          </p>
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={() => router.push("/forgot-password")}
          >
            Send me a new link <IconArrowRight size={16} />
          </Button>
          <a
            href="/login"
            className="block text-center text-label text-accent-text underline-offset-4 hover:underline"
          >
            Back to sign in
          </a>
        </div>
      ) : done ? (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-ok-soft text-ok-text">
            <IconCheck size={20} />
          </span>
          <h2 className="font-display text-title font-semibold text-ink">
            Your password is set
          </h2>
          <p className="text-label leading-relaxed text-ink-2">
            Taking you to sign in.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Monogram name={clinicName} size={40} />
            <div className="min-w-0">
              <h2 className="truncate font-display text-title font-semibold text-ink">
                {preview.name}
              </h2>
              <p className="tnum truncate font-mono text-caption text-ink-3">{preview.email}</p>
            </div>
          </div>

          <form onSubmit={submit} className="mt-5 space-y-4">
            <Field
              label="New password"
              required
              htmlFor="password"
              error={tooShort ? `At least ${MIN_LENGTH} characters.` : null}
              help={tooShort ? undefined : `At least ${MIN_LENGTH} characters. Length beats punctuation.`}
            >
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(null); }}
                placeholder="••••••••••••"
                invalid={tooShort || !!error}
                required
              />
            </Field>

            <Field
              label="Confirm password"
              required
              htmlFor="confirm"
              error={mismatch ? "These do not match." : null}
            >
              <Input
                id="confirm"
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
              {busy ? "Setting…" : kind === "invite" ? "Set password" : "Reset password"}{" "}
              <IconArrowRight size={16} />
            </Button>
          </form>

          <p className="mt-4 flex items-start gap-1.5 border-t border-line-soft pt-3 text-micro leading-snug text-ink-3">
            <IconLock size={12} className="mt-px shrink-0" />
            This link works once. After you use it, it is spent — and so is every other link
            this account was sent.
          </p>
        </>
      )}
    </AuthStage>
  );
}
