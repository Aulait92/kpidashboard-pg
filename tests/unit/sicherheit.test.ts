import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clientIp, hit, LIMITS, limitResponse, resetRateLimits } from "@/lib/rate-limit";
import { contentSecurityPolicy, NOT_EMBEDDABLE_SOURCE, PERMISSIONS_POLICY, securityHeaderRules } from "@/lib/security-headers";
import { parseCspReport } from "@/lib/csp-report";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sessionPayloadFor } from "@/lib/auth";

describe("Rate-Limiter", () => {
  beforeEach(() => resetRateLimits());

  it("lässt bis zum Limit durch, danach 429 mit Retry-After", () => {
    const rule = { limit: 3, windowMs: 60_000 };
    const t = 1_000_000;
    expect([1, 2, 3].map(() => hit("t", "a", rule, t).ok)).toEqual([true, true, true]);
    const r = hit("t", "a", rule, t + 1_000);
    expect(r.ok).toBe(false);
    expect(r.retryAfterSec).toBe(59);
    // anderer Schlüssel und anderer Bereich zählen getrennt
    expect(hit("t", "b", rule, t).ok).toBe(true);
    expect(hit("u", "a", rule, t).ok).toBe(true);
  });

  it("beginnt nach Ablauf des Fensters neu", () => {
    const rule = { limit: 1, windowMs: 10_000 };
    expect(hit("t", "a", rule, 0).ok).toBe(true);
    expect(hit("t", "a", rule, 5_000).ok).toBe(false);
    expect(hit("t", "a", rule, 10_001).ok).toBe(true);
  });

  it("limitResponse liefert eine freundliche 429-Antwort", async () => {
    for (let i = 0; i < LIMITS.cspReport.limit; i++) expect(limitResponse("cspReport", "ip1")).toBeNull();
    const res = limitResponse("cspReport", "ip1");
    expect(res?.status).toBe(429);
    expect(res?.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect((await res!.json()).error).toMatch(/Bitte einen Moment warten/);
  });

  it("Webhooks haben nur eine grobe Obergrenze", () => {
    expect(LIMITS.webhook.limit).toBeGreaterThanOrEqual(1000);
  });

  it("Client-IP: X-Real-IP (Railway) vor X-Forwarded-For, sonst letzter XFF-Eintrag", () => {
    expect(clientIp(new Headers({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "9.9.9.9" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-forwarded-for": "6.6.6.6, 5.5.5.5" }))).toBe("5.5.5.5");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("Sicherheits-Header", () => {
  const rules = securityHeaderRules();
  const all = rules.find((r) => r.source === "/:path*")!;
  const header = (rule: { headers: { key: string; value: string }[] }, key: string) => rule.headers.find((h) => h.key === key)?.value;

  it("setzt HSTS, nosniff, Referrer-Policy, Permissions-Policy für alle Pfade", () => {
    expect(header(all, "Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(header(all, "X-Content-Type-Options")).toBe("nosniff");
    expect(header(all, "Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(PERMISSIONS_POLICY).toContain("microphone=(self)");
    expect(PERMISSIONS_POLICY).toContain("camera=()");
  });

  it("CSP startet als Report-Only und meldet an /api/csp-report", () => {
    const strict = rules.find((r) => r.source === NOT_EMBEDDABLE_SOURCE)!;
    expect(header(strict, "Content-Security-Policy")).toBeUndefined();
    const csp = header(strict, "Content-Security-Policy-Report-Only")!;
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("report-uri /api/csp-report");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(header(strict, "X-Frame-Options")).toBe("DENY");
  });

  it("CSP_ENFORCE schaltet auf erzwingend um", () => {
    const strict = securityHeaderRules({ enforceCsp: true }).find((r) => r.source === NOT_EMBEDDABLE_SOURCE)!;
    expect(header(strict, "Content-Security-Policy")).toBeDefined();
  });

  it("nur /book und /rechner dürfen eingebettet werden", () => {
    const re = (src: string) => new RegExp(`^${src.replace("/:path(", "/(")}$`);
    expect(re(NOT_EMBEDDABLE_SOURCE).test("/login")).toBe(true);
    expect(re(NOT_EMBEDDABLE_SOURCE).test("/angebot/abc")).toBe(true);
    expect(re(NOT_EMBEDDABLE_SOURCE).test("/buyer")).toBe(true);
    expect(re(NOT_EMBEDDABLE_SOURCE).test("/book/mein-kalender")).toBe(false);
    expect(re(NOT_EMBEDDABLE_SOURCE).test("/rechner")).toBe(false);
    const book = rules.find((r) => r.source === "/book/:path*")!;
    expect(header(book, "Content-Security-Policy-Report-Only")).toContain("frame-ancestors 'self' https:");
    expect(header(book, "X-Frame-Options")).toBeUndefined();
  });

  it("im Entwicklungsmodus ist eval für Hot-Reload erlaubt", () => {
    expect(contentSecurityPolicy({ dev: true })).toContain("'unsafe-eval'");
  });
});

describe("CSP-Berichte", () => {
  it("liest klassische und Reporting-API-Berichte datensparsam", () => {
    const classic = parseCspReport({
      "csp-report": { "document-uri": "https://app.example/angebot/abcdefghijklmnopqrstuvwxyz?x=1", "violated-directive": "script-src-elem", "blocked-uri": "https://evil.example/x.js?t=geheim" },
    });
    expect(classic).toEqual([{ directive: "script-src-elem", blocked: "https://evil.example", page: "/angebot/:id" }]);
    const api = parseCspReport([{ type: "csp-violation", body: { documentURL: "https://app.example/buyer", effectiveDirective: "img-src", blockedURL: "inline" } }, { type: "deprecation" }]);
    expect(api).toEqual([{ directive: "img-src", blocked: "inline", page: "/buyer" }]);
    expect(parseCspReport("quatsch")).toEqual([]);
  });
});

describe("Cron-Token", () => {
  const url = "https://app.example/api/whatsapp/cron";
  afterEach(() => {
    delete process.env.CRON_TOKEN_IN_QUERY;
    vi.restoreAllMocks();
  });

  it("akzeptiert Bearer-Header und x-cron-token", () => {
    expect(isCronAuthorized(new Request(url, { headers: { authorization: "Bearer geheim" } }), "geheim", { label: "t" })).toBe(true);
    expect(isCronAuthorized(new Request(url, { headers: { "x-cron-token": "geheim" } }), "geheim", { label: "t" })).toBe(true);
    expect(isCronAuthorized(new Request(url, { headers: { authorization: "Bearer falsch" } }), "geheim", { label: "t" })).toBe(false);
    expect(isCronAuthorized(new Request(url), "geheim", { label: "t" })).toBe(false);
    expect(isCronAuthorized(new Request(url, { headers: { "x-cron-token": "x" } }), undefined, { label: "t" })).toBe(false);
  });

  it("?token= geht im Übergang (mit Warnung) und lässt sich abschalten", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = () => new Request(`${url}?token=geheim`);
    expect(isCronAuthorized(req(), "geheim", { label: "warn-test" })).toBe(true);
    expect(isCronAuthorized(req(), "geheim", { label: "warn-test" })).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1); // gedrosselt
    process.env.CRON_TOKEN_IN_QUERY = "off";
    expect(isCronAuthorized(req(), "geheim", { label: "warn-test" })).toBe(false);
  });

  it("alter Header x-webhook-secret nur wo ausdrücklich erlaubt", () => {
    const req = new Request(url, { headers: { "x-webhook-secret": "geheim" } });
    expect(isCronAuthorized(req, "geheim", { label: "t" })).toBe(false);
    expect(isCronAuthorized(req, "geheim", { label: "t", legacyHeaders: ["x-webhook-secret"] })).toBe(true);
  });
});

describe("Sitzungsversion", () => {
  it("steht im Sitzungsinhalt", () => {
    expect(sessionPayloadFor({ id: "u1", email: "a@b.de", role: "BUYER", customerId: "c1", sessionVersion: 3 })).toEqual({
      userId: "u1",
      email: "a@b.de",
      role: "BUYER",
      customerId: "c1",
      sv: 3,
    });
    expect(sessionPayloadFor({ id: "u2", email: "x@y.de", role: "ADMIN", customerId: null, sessionVersion: 0 })).not.toHaveProperty("customerId");
  });
});
