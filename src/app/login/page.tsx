"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store/app-store";
import { StageLoader } from "@/components/ui/loader";
import {
  EmailField, GlyphBilling, GlyphCalendar, GlyphPatients, GlyphReports, LoginAccent, LoginError,
  LoginLink, LoginNote, LoginScene, PasswordField, RememberRow, SubmitButton, type LoginFeature,
} from "@/components/layout/login-scene";
import background from "../../../public/images/tenant-login-bg.webp";

/* ==========================================================================
   Tenant sign-in — the clinic's own address, in the daytime scene.
   The layout, palette and controls live in the shared login scene; this page
   only brings the clinic's words and the clinic's sign-in.
   ========================================================================== */

const FEATURES: LoginFeature[] = [
  {
    title: "Appointments & Queue",
    body: ["Book visits and see", "who is waiting now"],
    icon: <GlyphCalendar />,
    tile: "bg-[#E4ECFA] text-[#2F62C8]",
  },
  {
    title: "Patient Records",
    body: ["Complete medical history", "at your fingertips"],
    icon: <GlyphPatients />,
    tile: "bg-[#DDF6EC] text-[#10B866]",
  },
  {
    title: "Billing & Payments",
    body: ["Invoices built straight", "from each visit"],
    icon: <GlyphBilling />,
    tile: "bg-[#E6E6FD] text-[#7A4CF6]",
  },
  {
    title: "Reports & Insights",
    body: ["Track visits, revenue", "and patient trends"],
    icon: <GlyphReports />,
    tile: "bg-[#FDECE2] text-[#FB5A12]",
  },
];

/* the address is remembered only when asked, and only on this device */
const REMEMBER_KEY = "astrale.login.email";

export default function LoginPage() {
  const router = useRouter();
  const { hostTenant, hostTenantPending, session, ready, signIn, notify } = useApp();

  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [remember, setRemember] = React.useState(false);
  const [askAdmin, setAskAdmin] = React.useState(false);
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
  if (!ready || hostTenantPending || !hostTenant) {
    return <StageLoader className="!bg-stage" />;
  }

  const tenant = hostTenant;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      setError(result.error);
      setPassword("");
    }
  };

  return (
    <LoginScene
      tone="day"
      background={background}
      pitch={{
        eyebrow: "Better care. Healthier tomorrows.",
        headline: (
          <>
            Everything you need
            <br />
            for <LoginAccent>better patient care</LoginAccent>
          </>
        ),
        lede: (
          <>
            Every patient, every visit, every record —
            <br />
            from first appointment to follow-up.
          </>
        ),
        features: FEATURES,
      }}
      title="Login"
      below={
        <div className="mt-3.5 text-center short:mt-4">
          <LoginLink onClick={() => setAskAdmin((v) => !v)} aria-expanded={askAdmin}>
            Contact your administrator
          </LoginLink>
          {askAdmin && (
            <LoginNote>
              Accounts at {tenant.name} are created by your clinic admin — ask them to send you an
              invitation.
            </LoginNote>
          )}
        </div>
      }
    >
      <form onSubmit={submit} className="mt-5.5 space-y-3 short:mt-5">
        <EmailField
          id="email"
          label="Email address"
          autoComplete="username"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setError(null); }}
          placeholder="Enter your email address"
          invalid={!!error}
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
          trailing={<LoginLink href="/forgot-password">Forgot password?</LoginLink>}
        />
        {error && <LoginError>{error}</LoginError>}
        <SubmitButton busy={busy}>Sign In</SubmitButton>
      </form>
    </LoginScene>
  );
}
