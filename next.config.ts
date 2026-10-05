import path from "node:path";
import type { NextConfig } from "next";

/**
 * The API is reached at `/api/*` on whatever host the browser is already on, so
 * `northgate.localhost:3000/api/v1/patients` is a Northgate request. In
 * development that is a rewrite to the FastAPI process; in production put the
 * same path on the same host at the edge, and nothing in the app changes.
 *
 * Next rewrites replace the Host header with the destination's, so locally the
 * slug travels in `X-Tenant-Slug` instead (the API accepts that only when
 * ALLOW_TENANT_HEADER is on, and never in production).
 */
const API_ORIGIN = process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  /* a self-contained server.js plus only the node_modules it traces — what the
     Docker image ships, instead of the whole dependency tree */
  output: "standalone",

  /* Node >= 22.12 resolves require("@swc/helpers/...") through the package's
     `module-sync` export to its esm/ files, but the tracer only copies cjs/ —
     so server.js dies on start without these. */
  outputFileTracingIncludes: {
    "/*": ["node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },

  /* pin the workspace root so Turbopack does not walk up into the home directory */
  turbopack: {
    root: path.resolve("."),
  },

  /* the default bottom-left indicator sits on top of the app rail */
  devIndicators: {
    position: "bottom-right",
  },

  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_ORIGIN}/:path*` }];
  },
};

export default nextConfig;
