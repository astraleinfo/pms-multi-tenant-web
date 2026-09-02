"use client";

/* ==========================================================================
   The HTTP client.

   One place that knows about the network: the base URL, the access token, the
   refresh dance, and the error shape. Everything above `lib/api` sees plain
   promises and typed rows.

   The access token lives in this module — in memory, never in localStorage, so
   script injected into the page has nothing to read and a closed tab is a
   closed session. The refresh token is an HttpOnly cookie the browser holds and
   this code never touches.
   ========================================================================== */

const BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api";

let accessToken: string | null = null;
let onSignedOut: (() => void) | null = null;

export const setAccessToken = (token: string | null) => { accessToken = token; };
export const getAccessToken = () => accessToken;

/** The provider registers what to do when the session is definitively over. */
export const onSessionLost = (handler: () => void) => { onSignedOut = handler; };

/** The clinic this tab is on, as a header for development proxies (see next.config.ts). */
function tenantHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const [label, ...rest] = window.location.hostname.split(".");
  return rest.length > 0 ? { "X-Tenant-Slug": label } : { "X-Platform-Console": "1" };
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: Record<string, unknown> };
  request_id?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;
  readonly requestId: string;

  constructor(status: number, body: Partial<ApiErrorBody> | null, fallback: string) {
    super(body?.error?.message ?? fallback);
    this.name = "ApiError";
    this.status = status;
    this.code = body?.error?.code ?? "error";
    this.details = body?.error?.details ?? {};
    this.requestId = body?.request_id ?? "";
  }

  /** Field-level messages from a 422, keyed by field. */
  get fieldErrors(): Record<string, string> {
    const fields = this.details.fields as Array<{ field: string; message: string }> | undefined;
    return Object.fromEntries((fields ?? []).map((f) => [f.field, f.message]));
  }
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

interface RequestOptions {
  method?: Method;
  body?: unknown;
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Auth calls opt out of the refresh-and-retry, or it would recurse. */
  retryOnExpiry?: boolean;
}

function url(path: string, query?: RequestOptions["query"]) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== "") search.set(key, String(value));
  }
  const qs = search.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ""}`;
}

/** What `/v1/auth/refresh` and the two login endpoints return. */
export interface SessionResponse {
  access_token: string;
  expires_in: number;
  user?: unknown;
  platform_user?: unknown;
  tenant_id?: string | null;
  permissions?: string[];
  preferences?: unknown;
}

let refreshing: Promise<SessionResponse | null> | null = null;

/**
 * Exchange the refresh cookie for a new access token.
 *
 * One at a time: several queries failing together share a single refresh, so a
 * page-load's worth of 401s cannot rotate the token half a dozen times — which
 * the server would read as replay and treat as theft.
 */
export function refreshSession(): Promise<SessionResponse | null> {
  refreshing ??= (async () => {
    try {
      const response = await fetch(url("/v1/auth/refresh"), {
        method: "POST",
        credentials: "include",
        headers: { ...tenantHeaders() },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as SessionResponse;
      setAccessToken(body.access_token);
      return body;
    } catch {
      return null;
    } finally {
      /* let the next 401 start a fresh attempt */
      queueMicrotask(() => { refreshing = null; });
    }
  })();
  return refreshing;
}

/** For endpoints that answer with a file rather than JSON — a PDF, say. Same
 *  auth/refresh dance as `request`, but resolves to a `Blob` instead of
 *  parsing the body. */
export async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { method = "GET", query, retryOnExpiry = true } = options;

  const send = async () => {
    const headers: Record<string, string> = { ...tenantHeaders() };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    return fetch(url(path, query), { method, headers, credentials: "include" });
  };

  let response = await send();

  if (response.status === 401 && retryOnExpiry) {
    const recovered = await refreshSession();
    if (recovered) {
      response = await send();
    } else {
      setAccessToken(null);
      onSignedOut?.();
    }
  }

  if (!response.ok) {
    let parsed: Partial<ApiErrorBody> | null = null;
    try { parsed = JSON.parse(await response.text()) as ApiErrorBody; } catch { /* not JSON */ }
    throw new ApiError(response.status, parsed, "Something went wrong.");
  }

  return response.blob();
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, retryOnExpiry = true } = options;

  const send = async () => {
    const headers: Record<string, string> = { Accept: "application/json", ...tenantHeaders() };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    return fetch(url(path, query), {
      method,
      headers,
      credentials: "include",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await send();

  /* An expired access token is ordinary: refresh once, quietly, and carry on. */
  if (response.status === 401 && retryOnExpiry) {
    const recovered = await refreshSession();
    if (recovered) {
      response = await send();
    } else {
      setAccessToken(null);
      onSignedOut?.();
    }
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const parsed = text ? (JSON.parse(text) as unknown) : null;

  if (!response.ok) {
    if (response.status === 401) {
      setAccessToken(null);
      onSignedOut?.();
    }
    throw new ApiError(response.status, parsed as ApiErrorBody, "Something went wrong.");
  }

  return parsed as T;
}

export const get = <T>(path: string, query?: RequestOptions["query"]) => request<T>(path, { query });
export const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body });
export const patch = <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body });
export const del = <T>(path: string) => request<T>(path, { method: "DELETE" });

/** Where the queue socket lives. Same host as the app unless told otherwise. */
export function socketUrl(path: string, token: string) {
  const configured = process.env.NEXT_PUBLIC_API_WS_ORIGIN;
  const origin = configured
    ? configured
    : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}${BASE}`;
  const slug = tenantHeaders()["X-Tenant-Slug"];
  const suffix = slug ? `&tenant=${encodeURIComponent(slug)}` : "";
  return `${origin}${path}?access_token=${encodeURIComponent(token)}${suffix}`;
}
