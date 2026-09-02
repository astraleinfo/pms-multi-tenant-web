import { NextResponse, type NextRequest } from "next/server";
import { resolveHost } from "@/lib/tenancy";

/**
 * Routes by host before anything renders:
 *   admin.apex  → the super-admin console, and nothing else
 *   <slug>.apex → the clinic app, and never the console
 *   apex        → neither; the product's public face
 *
 * This mirrors the API, which refuses `/platform/*` anywhere but the admin
 * host. Serving the console page on an address the API will not talk to would
 * produce a screen that looks right and cannot do anything, so the two agree
 * here rather than leaving the browser to discover it.
 *
 * The resolved tenancy is forwarded as request headers so server components can
 * read it without re-parsing the Host header.
 */
export function proxy(request: NextRequest) {
  const ctx = resolveHost(request.headers.get("host"), request.nextUrl.protocol);
  const path = request.nextUrl.pathname;

  /* `/api/*` is the backend, on whichever host the browser is already on — the
     console's calls live on the admin host and a clinic's on its subdomain.
     Host routing is about pages, so it must not touch them: redirecting an API
     call to /platform would turn a sign-in into a 200 with an HTML body. */
  if (path === "/api" || path.startsWith("/api/")) return NextResponse.next();

  const onConsole = path === "/platform" || path.startsWith("/platform/");

  /* The console lives at the root of its own address. */
  if (ctx.kind === "admin" && !onConsole) {
    return NextResponse.redirect(new URL("/platform", request.url));
  }

  /* A clinic address never serves the console. */
  if (ctx.kind === "tenant" && onConsole) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  /* The apex serves neither. It used to serve the console, so a bookmark
     pointing at `/platform` here is plausible — it goes to the apex page,
     which says where the console actually is rather than 404ing. */
  if (ctx.kind === "platform" && onConsole) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const headers = new Headers(request.headers);
  headers.set("x-astrale-host-kind", ctx.kind);
  headers.set("x-astrale-tenant", ctx.slug ?? "");
  return NextResponse.next({ request: { headers } });
}

export const config = {
  /* everything except build output, the image optimiser and static assets */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
