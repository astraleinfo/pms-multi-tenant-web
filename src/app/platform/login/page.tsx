"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";
import {
  EmailField, GlyphBilling, GlyphClinic, GlyphModules, GlyphShield, LoginAccent, LoginError,
  LoginScene, PasswordField, RememberRow, SubmitButton, type LoginFeature,
} from "@/components/layout/login-scene";
import background from "../../../../public/images/admin-login-bg.webp";

/* ==========================================================================
   Platform sign-in — the console's own address, in the night scene.
   Same room, same layout as a clinic's sign-in, lit for after hours: the
   people here work above every clinic, not inside one. There is no password
   reset for platform staff from this page, so no link offers one.
   ========================================================================== */

const FEATURES: LoginFeature[] = [
  {
    title: "Onboard Clinics",
    body: ["A subdomain, an admin", "invite and staff import"],
    icon: <GlyphClinic />,
    tile: "bg-[#16326E] text-[#8FB2FF]",
  },
  {
    title: "Modules & Pricing",
    body: ["Set prices and choose", "what each clinic runs"],
    icon: <GlyphModules />,
    tile: "bg-[#0F4540] text-[#4ADE9B]",
  },
  {
    title: "Billing & Reminders",
    body: ["Monthly bills, reminders", "and holds when unpaid"],
    icon: <GlyphBilling />,
    tile: "bg-[#2E2766] text-[#B7A2FF]",
  },
  {
    title: "Kept Outside",
    body: ["Platform staff never", "appear inside a clinic"],
    icon: <GlyphShield />,
    tile: "bg-[#4A2A1E] text-[#FF9A5C]",
  },
];

/* kept apart from the clinic sign-in's key: one browser may hold both */
const REMEMBER_KEY = "astrale.platform-login.email";

export default function PlatformLoginPage() {
  const router = useRouter();
  const { platformSession, ready, platformSignIn } = useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
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

  if (!ready) return <StageLoader className="!bg-stage" />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setError(result.error);
      setPassword("");
    }
  };

  return (
    <LoginScene
      tone="night"
      background={background}
      pitch={{
        eyebrow: "The platform console. Astrale staff only.",
        headline: (
          <>
            Every clinic on Astrale,
            <br />
            run from <LoginAccent>one console</LoginAccent>
          </>
        ),
        lede: (
          <>
            Onboard clinics, sell modules and send the bills —
            <br />
            patient data never passes through here.
          </>
        ),
        features: FEATURES,
      }}
      title="Platform Login"
      subtitle=""
    >
      <form onSubmit={submit} className="mt-5.5 space-y-3 short:mt-5">
        <EmailField
          id="pemail"
          label="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="you@astrale.health"
          invalid={!!error}
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
        {error && <LoginError>{error}</LoginError>}
        <SubmitButton busy={busy}>Sign In</SubmitButton>
      </form>
    </LoginScene>
  );
}
