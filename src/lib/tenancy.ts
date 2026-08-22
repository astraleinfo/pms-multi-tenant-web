/* ==========================================================================
   Host-based tenant resolution.

   The tenant is a property of the URL the request arrived on, not something a
   user picks after signing in — `northgate.astrale.test` is Northgate and can
   never be anything else. The apex domain is the platform console.

   Locally this needs no host file: browsers resolve every *.localhost name to
   127.0.0.1, so `northgate.localhost:3000` just works.
   ========================================================================== */

/** Subdomains that can never belong to a clinic. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "admin", "api", "platform", "static", "assets", "mail",
]);

export type HostKind = "platform" | "tenant";

export interface HostContext {
  kind: HostKind;
  /** the clinic's subdomain label, null on the platform host */
  slug: string | null;
  /** the apex the app is served from, without a port — e.g. "localhost" */
  root: string;
  /** port, kept so links between hosts survive local development */
  port: string;
  protocol: string;
}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Parse a Host header (or `window.location.host`) into a tenancy context. */
export function resolveHost(host: string | null | undefined, protocol = "http:"): HostContext {
  const raw = (host ?? "").trim().toLowerCase();
  const [hostname = "", port = ""] = raw.split(":");
  const platform = (root: string): HostContext => ({ kind: "platform", slug: null, root, port, protocol });

  if (!hostname || IPV4.test(hostname) || hostname === "[::1]") return platform(hostname || "localhost");

  const labels = hostname.split(".");

  /* localhost and *.localhost */
  if (labels[labels.length - 1] === "localhost") {
    if (labels.length === 1) return platform("localhost");
    const slug = labels[0];
    const root = labels.slice(1).join(".");
    return RESERVED_SUBDOMAINS.has(slug)
      ? platform(root)
      : { kind: "tenant", slug, root, port, protocol };
  }

  /* a real domain: two labels is the apex, three or more names a tenant */
  if (labels.length <= 2) return platform(hostname);

  const slug = labels[0];
  const root = labels.slice(1).join(".");
  return RESERVED_SUBDOMAINS.has(slug)
    ? platform(root)
    : { kind: "tenant", slug, root, port, protocol };
}

/** Absolute URL for a clinic, built from wherever the caller is right now. */
export function tenantUrl(slug: string, ctx: HostContext, path = "/") {
  const port = ctx.port ? `:${ctx.port}` : "";
  return `${ctx.protocol}//${slug}.${ctx.root}${port}${path}`;
}

/** Absolute URL for the platform console. */
export function platformUrl(ctx: HostContext, path = "/platform") {
  const port = ctx.port ? `:${ctx.port}` : "";
  return `${ctx.protocol}//${ctx.root}${port}${path}`;
}

/** Read the context from the browser. Safe to call only on the client. */
export function hostFromWindow(): HostContext {
  return resolveHost(window.location.host, window.location.protocol);
}

/** Turn a clinic name into a candidate subdomain. */
export function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

/** Why a subdomain is unusable, or null when it is fine. */
export function slugProblem(slug: string, taken: string[]) {
  if (!slug) return "Pick a subdomain.";
  if (slug.length < 3) return "Subdomains need at least three characters.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) return "Use lowercase letters, numbers and hyphens.";
  if (RESERVED_SUBDOMAINS.has(slug)) return "That subdomain is reserved by the platform.";
  if (taken.includes(slug)) return "Another clinic already uses that subdomain.";
  return null;
}
