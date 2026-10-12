import { describe, expect, it } from "vitest";

import { adminUrl, apexUrl, resolveHost, tenantUrl } from "./tenancy";

describe("resolveHost with a configured apex", () => {
  const apex = "pms.astraleinfo.com";
  const at = (host: string) => resolveHost(host, "https:", apex);

  it("reads the three-label apex as the apex, not as a clinic", () => {
    expect(at("pms.astraleinfo.com")).toMatchObject({ kind: "platform", slug: null, root: apex });
  });

  it("reads the console", () => {
    expect(at("admin.pms.astraleinfo.com")).toMatchObject({ kind: "admin", slug: null, root: apex });
  });

  it("reads a clinic", () => {
    expect(at("demo.pms.astraleinfo.com")).toMatchObject({ kind: "tenant", slug: "demo", root: apex });
  });

  it("sends a reserved label to the apex", () => {
    expect(at("www.pms.astraleinfo.com")).toMatchObject({ kind: "platform", root: apex });
  });

  it("gives anything deeper the apex rather than a clinic", () => {
    expect(at("a.b.pms.astraleinfo.com")).toMatchObject({ kind: "platform", root: apex });
  });

  it("builds links on the configured apex", () => {
    const ctx = at("pms.astraleinfo.com");
    expect(adminUrl(ctx)).toBe("https://admin.pms.astraleinfo.com/");
    expect(tenantUrl("demo", ctx)).toBe("https://demo.pms.astraleinfo.com/");
    expect(apexUrl(at("demo.pms.astraleinfo.com"))).toBe("https://pms.astraleinfo.com/");
  });
});

describe("resolveHost without one", () => {
  const at = (host: string) => resolveHost(host, "http:", "");

  it("still serves local development", () => {
    expect(at("localhost:3000")).toMatchObject({ kind: "platform", root: "localhost" });
    expect(at("admin.localhost:3000")).toMatchObject({ kind: "admin", root: "localhost" });
    expect(at("northgate.localhost:3000")).toMatchObject({ kind: "tenant", slug: "northgate" });
  });

  it("infers a two-label apex", () => {
    expect(at("astrale.health")).toMatchObject({ kind: "platform", root: "astrale.health" });
    expect(at("northgate.astrale.health")).toMatchObject({ kind: "tenant", slug: "northgate", root: "astrale.health" });
  });
});
