/* ==========================================================================
   Host-based tenant resolution.

   Mirrors `app/core/tenancy.py` in the API. Three kinds of address, and which
   one you are on decides what the app will even show you:

     admin.astrale.test    the super-admin console
     <slug>.astrale.test   exactly one clinic
     astrale.test          the apex — neither a clinic nor the console

   The tenant is a property of the URL, not something a user picks after
   signing in: `northgate.astrale.test` is Northgate and can never be anything
   else.

   Locally this needs no host file: browsers resolve every *.localhost name to
   127.0.0.1, so `northgate.localhost:3000` and `admin.localhost:3000` both
   just work.
   ========================================================================== */

/** Subdomains that can never belong to a clinic. */
export const RESERVED_SUBDOMAINS = new Set([
  "www", "app", "admin", "administrator", "api", "platform", "static", "assets", "mail",
]);

/** Labels that resolve to the super-admin console rather than to the apex. */
export const ADMIN_SUBDOMAINS = new Set(["admin", "administrator"]);

export type HostKind = "platform" | "admin" | "tenant";

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

/**
 * The apex, when it is not a bare two-label domain — `pms.astraleinfo.com` has
 * three labels, so without this it would read as a clinic called `pms`. The
 * API's APP_DOMAIN, inlined at build time. Unset, the apex is inferred: two
 * labels for a real domain, `localhost` locally.
 */
const APP_DOMAIN = (process.env.NEXT_PUBLIC_APP_DOMAIN ?? "").trim().toLowerCase().replace(/^\.+/, "");

/** Parse a Host header (or `window.location.host`) into a tenancy context. */
export function resolveHost(
  host: string | null | undefined,
  protocol = "http:",
  appDomain = APP_DOMAIN,
): HostContext {
  const raw = (host ?? "").trim().toLowerCase();
  const [hostname = "", port = ""] = raw.split(":");
  const platform = (root: string): HostContext => ({ kind: "platform", slug: null, root, port, protocol });

  /* a reserved label is the console when it names the console, and the apex
     otherwise — `api.` and `www.` are not places anybody signs in */
  const reserved = (slug: string, root: string): HostContext =>
    ADMIN_SUBDOMAINS.has(slug)
      ? { kind: "admin", slug: null, root, port, protocol }
      : platform(root);

  if (!hostname || IPV4.test(hostname) || hostname === "[::1]") return platform(hostname || "localhost");

  /* the configured apex and the single labels under it; anything deeper is
     not an address this deployment hands out, so it gets the apex */
  if (appDomain) {
    if (hostname === appDomain) return platform(appDomain);
    if (hostname.endsWith(`.${appDomain}`)) {
      const slug = hostname.slice(0, -(appDomain.length + 1));
      if (slug.includes(".")) return platform(appDomain);
      return RESERVED_SUBDOMAINS.has(slug)
        ? reserved(slug, appDomain)
        : { kind: "tenant", slug, root: appDomain, port, protocol };
    }
  }

  const labels = hostname.split(".");

  /* localhost and *.localhost */
  if (labels[labels.length - 1] === "localhost") {
    if (labels.length === 1) return platform("localhost");
    const slug = labels[0];
    const root = labels.slice(1).join(".");
    return RESERVED_SUBDOMAINS.has(slug)
      ? reserved(slug, root)
      : { kind: "tenant", slug, root, port, protocol };
  }

  /* a real domain: two labels is the apex, three or more names a tenant */
  if (labels.length <= 2) return platform(hostname);

  const slug = labels[0];
  const root = labels.slice(1).join(".");
  return RESERVED_SUBDOMAINS.has(slug)
    ? reserved(slug, root)
    : { kind: "tenant", slug, root, port, protocol };
}

/** Absolute URL for a clinic, built from wherever the caller is right now. */
export function tenantUrl(slug: string, ctx: HostContext, path = "/") {
  const port = ctx.port ? `:${ctx.port}` : "";
  return `${ctx.protocol}//${slug}.${ctx.root}${port}${path}`;
}

/**
 * Absolute URL for the super-admin console.
 *
 * `admin.<root>` — its own address, not a path on the apex. The API refuses
 * `/platform/*` anywhere else, so a link that pointed at the apex would take
 * somebody to a console that could not talk to anything.
 */
export function adminUrl(ctx: HostContext, path = "/") {
  const port = ctx.port ? `:${ctx.port}` : "";
  return `${ctx.protocol}//admin.${ctx.root}${port}${path}`;
}

/** @deprecated the console moved to its own subdomain — use `adminUrl`. */
export const platformUrl = adminUrl;

/** Absolute URL for the apex: the product's public face. */
export function apexUrl(ctx: HostContext, path = "/") {
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
