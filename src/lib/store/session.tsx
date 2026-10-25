"use client";

import * as React from "react";
import type { HostContext } from "@/lib/tenancy";
import { adminUrl, apexUrl, hostFromWindow, resolveHost, tenantUrl } from "@/lib/tenancy";
import * as api from "@/lib/api";
import { onSessionLost, refreshSession, setAccessToken } from "@/lib/api/client";
import type { Id, User } from "@/lib/types";

/* ==========================================================================
   Session-level state: which host this tab is on, who is signed in, the theme,
   and the toast queue. No clinic data lives here — that is the API's job,
   cached by TanStack Query.

   The session itself is the server's. On load this asks the API to exchange
   its refresh cookie for an access token; if that works, the tab was already
   signed in. Nothing about the session is kept in localStorage: the access
   token stays in memory (see lib/api/client.ts) and the refresh token is an
   HttpOnly cookie this code cannot read.
   ========================================================================== */

export interface Session {
  /** the clinic this session belongs to — the server decided it, not this tab */
  tenantId: Id;
  userId: Id;
  signedIn: boolean;
  /**
   * They are using a password somebody else chose. The session is real, but it
   * is good for one thing until they replace it — see `<PasswordGate>`.
   */
  mustChangePassword: boolean;
  /**
   * Platform staff working inside this clinic, opened from the console. The
   * banner says so; the audit trail already knows.
   */
  impersonated: boolean;
}

export interface PlatformSession {
  userId: Id | null;
  signedIn: boolean;
}

export interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "ok" | "warn" | "critical" | "accent";
}

const THEME_KEY = "astrale-pms.theme";
const SIGNED_OUT: Session = {
  tenantId: "", userId: "", signedIn: false, mustChangePassword: false, impersonated: false,
};

/**
 * Where a support session arrives.
 *
 * The console hands the token over in the URL fragment: browsers do not send
 * a fragment to a server, and it does not end up in a proxy log the way a
 * query string does. This reads it once, wipes it from the address bar, and
 * from then on it is an ordinary in-memory access token.
 */
const SUPPORT_FRAGMENT = "support_token";

/**
 * The support token, lifted out of the URL and held outside React.
 *
 * The fragment can only be read once: taking it means wiping it from the
 * address bar, or it would sit in the URL for the life of the tab and end up
 * in a screenshot or a shared link. But an effect in React is not guaranteed
 * to run once — StrictMode deliberately runs it twice in development, and Fast
 * Refresh re-runs it on every edit. A second run would find the fragment
 * already gone, conclude there was no session, and send the tab to a sign-in
 * screen that platform staff have no account for.
 *
 * So the token is taken exactly once, into a module variable that survives
 * every remount, and stays there until it has actually been exchanged.
 */
let heldSupportToken: string | null = null;

function takeSupportToken(): string | null {
  if (heldSupportToken) return heldSupportToken;
  if (typeof window === "undefined") return null;

  const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const token = fragment.get(SUPPORT_FRAGMENT);
  if (!token) return null;

  fragment.delete(SUPPORT_FRAGMENT);
  const rest = fragment.toString();
  window.history.replaceState(
    null, "", `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ""}`,
  );

  heldSupportToken = token;
  return token;
}

interface SessionContextValue {
  ready: boolean;
  host: HostContext;

  session: Session;
  user: User | null;
  permissions: string[];
  /** this person's own interface state — theirs, not the browser's */
  preferences: api.UserPreferences;
  savePreferences: (patch: Partial<api.UserPreferences>) => Promise<void>;
  platformSession: PlatformSession;
  platformUser: api.PlatformStaff | null;

  signIn: (email: string, password: string) => Promise<api.AuthResult>;
  signOut: () => Promise<void>;
  /** The password has been replaced, so the one-thing-only session is over. */
  clearPasswordHold: () => void;
  platformSignIn: (email: string, password: string) => Promise<api.PlatformAuthResult>;
  platformSignOut: () => Promise<void>;
  /** the API told us this session is over — drop it without a round trip */
  endSession: () => void;
  /** Re-read who this tab is acting as, and what they may do. For a refusal
      the screen did not expect: the role may have been changed since sign-in,
      or a quiet token refresh may have picked up another sign-in's cookie. */
  reloadIdentity: () => Promise<void>;

  theme: "light" | "dark";
  toggleTheme: () => void;

  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  clinicUrl: (slug: string, path?: string) => string;
  consoleUrl: () => string;
  apexHomeUrl: () => string;
}

const SessionContext = React.createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [host, setHost] = React.useState<HostContext>(() => resolveHost(""));
  const [session, setSession] = React.useState<Session>(SIGNED_OUT);
  const [user, setUser] = React.useState<User | null>(null);
  const [permissions, setPermissions] = React.useState<string[]>([]);
  const [preferences, setPreferences] = React.useState<api.UserPreferences>(api.NO_PREFERENCES);
  const [platformSession, setPlatformSession] = React.useState<PlatformSession>({ userId: null, signedIn: false });
  const [platformUser, setPlatformUser] = React.useState<api.PlatformStaff | null>(null);
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  const [ready, setReady] = React.useState(false);
  const toastSeq = React.useRef(0);
  const hostRef = React.useRef(host);
  hostRef.current = host;

  const endSession = React.useCallback(() => {
    setAccessToken(null);
    setSession(SIGNED_OUT);
    setUser(null);
    setPermissions([]);
    setPreferences(api.NO_PREFERENCES);
    setPlatformSession({ userId: null, signedIn: false });
    setPlatformUser(null);
  }, []);

  /* the client calls this when a refresh fails: the session is over, wherever
     in the app that happened */
  React.useEffect(() => { onSessionLost(endSession); }, [endSession]);

  React.useEffect(() => {
    const ctx = hostFromWindow();
    setHost(ctx);

    let cancelled = false;

    (async () => {
      /* A support session arrives in the fragment. It has no refresh cookie,
         so it is deliberately not resumable: when it runs out, it is opened
         again from the console. */
      const supportToken = takeSupportToken();
      if (supportToken) {
        setAccessToken(supportToken);
        const who = await api.me().catch(() => null);

        /* Note there is no `cancelled` bail before this point. The token has
           already left the URL, so an effect that gave up here would throw the
           only copy of the session away — and the remount that cancelled it is
           about to look for a fragment that is no longer there. */
        if (who?.user) {
          heldSupportToken = null;
          setUser(who.user);
          setPermissions(who.permissions);
          setPreferences(who.preferences);
          setSession({
            tenantId: who.user.tenant_id,
            userId: who.user.id,
            signedIn: true,
            mustChangePassword: false,
            impersonated: true,
          });
          setReady(true);
          return;
        }

        /* The token was refused — expired, or minted for another clinic. Drop
           it rather than retrying it on every remount. */
        heldSupportToken = null;
        setAccessToken(null);
        if (cancelled) return;
      }

      /* Was this tab already signed in? The refresh cookie is the only place
         that answer can come from. */
      const resumed = await refreshSession();
      if (cancelled) return;

      if (resumed?.user) {
        const resumedUser = resumed.user as User;
        setUser(resumedUser);
        setPermissions(resumed.permissions ?? []);
        setPreferences((resumed.preferences as api.UserPreferences) ?? api.NO_PREFERENCES);
        setSession({
          tenantId: resumedUser.tenant_id,
          userId: resumedUser.id,
          signedIn: true,
          mustChangePassword: resumed.must_change_password === true,
          impersonated: false,
        });
      } else if (resumed?.platform_user) {
        const staff = resumed.platform_user as api.PlatformStaff;
        setPlatformUser(staff);
        setPlatformSession({ userId: staff.id, signedIn: true });
      }

      try {
        const stored = localStorage.getItem(THEME_KEY);
        if (stored === "dark" || stored === "light") setTheme(stored);
      } catch {
        /* storage blocked — the default is fine */
      }

      setReady(true);
    })();

    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    if (ready) { try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ } }
  }, [theme, ready]);

  const signIn = React.useCallback(async (email: string, password: string) => {
    const result = await api.authenticate(email, password);
    if (result.ok) {
      setUser(result.user);
      setSession({
        tenantId: result.user.tenant_id,
        userId: result.user.id,
        signedIn: true,
        mustChangePassword: result.mustChangePassword,
        impersonated: false,
      });
      const who = await api.me().catch(() => null);
      if (who) {
        setPermissions(who.permissions);
        setPreferences(who.preferences);
      }
    }
    return result;
  }, []);

  /* They chose their own password, so the hold is over. The server already
     agrees — this is the local half, so the gate lifts without a round trip. */
  const clearPasswordHold = React.useCallback(() => {
    setSession((current) => ({ ...current, mustChangePassword: false }));
    setUser((current) => (current ? { ...current, must_change_password: false } : current));
  }, []);

  const signOut = React.useCallback(async () => {
    await api.signOut();
    endSession();
  }, [endSession]);

  const platformSignIn = React.useCallback(async (email: string, password: string) => {
    const result = await api.authenticatePlatform(email, password);
    if (result.ok) {
      setPlatformUser(result.user);
      setPlatformSession({ userId: result.user.id, signedIn: true });
    }
    return result;
  }, []);

  const platformSignOut = React.useCallback(async () => {
    /* The jobs section may have left a cookie that opens Flower's own pages.
       It is short-lived and scoped to that one route, but a browser holding a
       key to the monitor after its owner signed out is not what "sign out"
       means. Handing it back first, and never letting it fail the sign-out. */
    await api.closeFlowerSession();
    await api.signOut();
    endSession();
  }, [endSession]);

  /**
   * Optimistic, and deliberately quiet: nothing on screen should wait for a
   * preference to be written, and a failed write is not worth interrupting
   * anyone over — they will simply be offered the tour again.
   */
  const savePreferences = React.useCallback(async (patch: Partial<api.UserPreferences>) => {
    setPreferences((current) => ({ ...current, ...patch }));
    try {
      const saved = await api.savePreferences(patch);
      setPreferences(saved);
    } catch {
      /* left as it was on the server; the local state is close enough */
    }
  }, []);

  const reloadIdentity = React.useCallback(async () => {
    const who = await api.me().catch(() => null);
    const fresh = who?.user;
    if (!fresh) return;
    setUser(fresh);
    setPermissions(who.permissions);
    setSession((current) =>
      current.signedIn ? { ...current, userId: fresh.id, tenantId: fresh.tenant_id } : current);
  }, []);

  const notify = React.useCallback((t: Omit<Toast, "id">) => {
    const id = ++toastSeq.current;
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4600);
  }, []);

  const dismissToast = React.useCallback((id: number) => setToasts((p) => p.filter((t) => t.id !== id)), []);
  const toggleTheme = React.useCallback(() => setTheme((t) => (t === "light" ? "dark" : "light")), []);

  const clinicUrl = React.useCallback(
    (slug: string, path = "/") => tenantUrl(slug, hostRef.current, path), [],
  );
  const consoleUrl = React.useCallback(() => adminUrl(hostRef.current), []);
  const apexHomeUrl = React.useCallback(() => apexUrl(hostRef.current), []);

  const value = React.useMemo<SessionContextValue>(() => ({
    ready, host,
    session, user, permissions, preferences, savePreferences,
    platformSession, platformUser,
    signIn, signOut, clearPasswordHold, platformSignIn, platformSignOut, endSession, reloadIdentity,
    theme, toggleTheme, toasts, notify, dismissToast,
    clinicUrl, consoleUrl, apexHomeUrl,
  }), [
    ready, host, session, user, permissions, preferences, savePreferences,
    platformSession, platformUser,
    signIn, signOut, clearPasswordHold, platformSignIn, platformSignOut, endSession, reloadIdentity,
    theme, toggleTheme, toasts, notify, dismissToast, clinicUrl, consoleUrl, apexHomeUrl,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
