"use client";

import * as React from "react";
import * as api from "@/lib/api";
import { useApp } from "@/lib/store/app-store";
import { cn } from "@/lib/cn";
import { IconCheck } from "@/components/ui/icons";
import { StageLoader } from "@/components/ui/loader";
import {
  EmailField, GlyphClock, GlyphPadlock, GlyphShield, GlyphSignOut, LoginAccent, LoginLink,
  LoginNote, LoginScene, SubmitButton, useLoginPalette, type LoginFeature,
} from "@/components/layout/login-scene";
import background from "../../../public/images/tenant-login-bg.webp";

/* ==========================================================================
   "I have forgotten my password."

   The one thing this page must not do is answer the question it is being
   asked. Whether an address has an account at this clinic is exactly what an
   attacker with a list of emails wants to know, so the response is the same
   sentence either way and the only difference is visible in an inbox.

   That is also why there is no error state worth showing: the request cannot
   meaningfully fail from the visitor's side.

   It sits in the clinic sign-in's daytime scene — the same room, one step on.
   ========================================================================== */

const FEATURES: LoginFeature[] = [
  {
    title: "Same Answer",
    body: ["Replies the same whether", "or not you have an account"],
    icon: <GlyphShield />,
    tile: "bg-[#E4ECFA] text-[#2F62C8]",
  },
  {
    title: "Short-lived Link",
    body: ["Expires in a couple of", "hours and works once"],
    icon: <GlyphClock />,
    tile: "bg-[#DDF6EC] text-[#10B866]",
  },
  {
    title: "Signs You Out",
    body: ["Using it ends every", "session, on every device"],
    icon: <GlyphSignOut />,
    tile: "bg-[#E6E6FD] text-[#7A4CF6]",
  },
  {
    title: "Locks Still Hold",
    body: ["A locked account stays", "locked until an admin acts"],
    icon: <GlyphPadlock />,
    tile: "bg-[#FDECE2] text-[#FB5A12]",
  },
];

export default function ForgotPasswordPage() {
  const { hostTenant, hostTenantPending, ready } = useApp();
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  if (!ready || hostTenantPending || !hostTenant) return <StageLoader className="!bg-stage" />;

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
    <LoginScene
      tone="day"
      background={background}
      pitch={{
        eyebrow: "Password reset. Private by design.",
        headline: (
          <>
            Locked out? Get back in
            <br />
            with <LoginAccent>one secure link</LoginAccent>
          </>
        ),
        lede: (
          <>
            A link comes by email and you choose the new
            <br />
            password — nobody at the clinic sees what you pick.
          </>
        ),
        features: FEATURES,
      }}
      title={sent ? "Check your email" : "Forgot password"}
      subtitle={sent ? undefined : "Enter the email you sign in with."}
      below={
        <div className="mt-3.5 text-center short:mt-4">
          <LoginLink href="/login">Back to sign in</LoginLink>
        </div>
      }
    >
      {sent ? (
        <Sent email={email.trim()} clinic={hostTenant.name} />
      ) : (
        <form onSubmit={submit} className="mt-5.5 space-y-3 short:mt-5">
          <EmailField
            id="email"
            label="Email address"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address"
            required
          />
          <SubmitButton busy={busy} busyLabel="Sending…">Send reset link</SubmitButton>
          <LoginNote>
            This page answers the same way whatever you type, so it can’t be used to find out who
            works here.
          </LoginNote>
        </form>
      )}
    </LoginScene>
  );
}

/** The one reply this page ever gives. */
function Sent({ email, clinic }: { email: string; clinic: string }) {
  const p = useLoginPalette();
  return (
    <div className="mt-5.5 space-y-4">
      <p className="flex items-start gap-3 text-[16px] leading-[1.55]">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#10B866] text-white">
          <IconCheck size={15} strokeWidth={2.6} />
        </span>
        <span>
          If <span className="font-medium">{email}</span> has an account at {clinic}, a link is on
          its way. It works once and expires in a couple of hours.
        </span>
      </p>
      <p className={cn("text-[14px] leading-[1.5]", p.muted)}>
        Nothing has changed yet — your current password still works until you use the link.
      </p>
    </div>
  );
}
