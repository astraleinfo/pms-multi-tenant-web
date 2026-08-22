"use client";

import * as React from "react";
import type { HostContext } from "@/lib/tenancy";
import { hostFromWindow, platformUrl, resolveHost, tenantUrl } from "@/lib/tenancy";
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
const SIGNED_OUT: Session = { tenantId: "", userId: "", signedIn: false };

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
  platformSignIn: (email: string, password: string) => Promise<api.PlatformAuthResult>;
  platformSignOut: () => Promise<void>;
  /** the API told us this session is over — drop it without a round trip */
  endSession: () => void;

  theme: "light" | "dark";
  toggleTheme: () => void;

  toasts: Toast[];
  notify: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;

  clinicUrl: (slug: string, path?: string) => string;
  consoleUrl: () => string;
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
      /* Was this tab already signed in? The refresh cookie is the only place
         that answer can come from. */
      const resumed = await refreshSession();
      if (cancelled) return;

      if (resumed?.user) {
        const resumedUser = resumed.user as User;
        setUser(resumedUser);
        setPermissions(resumed.permissions ?? []);
        setPreferences((resumed.preferences as api.UserPreferences) ?? api.NO_PREFERENCES);
        setSession({ tenantId: resumedUser.tenant_id, userId: resumedUser.id, signedIn: true });
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
      setSession({ tenantId: result.user.tenant_id, userId: result.user.id, signedIn: true });
      const who = await api.me().catch(() => null);
      if (who) {
        setPermissions(who.permissions);
        setPreferences(who.preferences);
      }
    }
    return result;
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
  const consoleUrl = React.useCallback(() => platformUrl(hostRef.current), []);

  const value = React.useMemo<SessionContextValue>(() => ({
    ready, host,
    session, user, permissions, preferences, savePreferences,
    platformSession, platformUser,
    signIn, signOut, platformSignIn, platformSignOut, endSession,
    theme, toggleTheme, toasts, notify, dismissToast,
    clinicUrl, consoleUrl,
  }), [
    ready, host, session, user, permissions, preferences, savePreferences,
    platformSession, platformUser,
    signIn, signOut, platformSignIn, platformSignOut, endSession,
    theme, toggleTheme, toasts, notify, dismissToast, clinicUrl, consoleUrl,
  ]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = React.useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
