import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { middleware } from "@/middleware";
import { APP_DEMO_HEADER, signiereDemoMarke } from "@/lib/app-demo/marke";
import { pruefeDemoMarke } from "@/lib/app-demo/marke-pruefen";
import { resetRateLimits } from "@/lib/rate-limit";

// Öffentliche App-Demo (/app-demo) in der echten Middleware: nur GET, signiertes Kennzeichen nur beim Umschreiben,
// keine Cookies, Server Actions erreichen keinen App-Code, Kennzeichen von außen → 400.

const APP = "https://app.performancegrowth.de";
const SECRET = "localtestsecret_localtestsecret_0123456789";
const saved = { ...process.env };

function req(path: string, init: { method?: string; headers?: Record<string, string>; ip?: string } = {}) {
  const headers = new Headers({ host: "app.performancegrowth.de", "x-real-ip": init.ip ?? "203.0.113.7", ...(init.headers ?? {}) });
  return new NextRequest(`http://localhost:8080${path}`, { method: init.method ?? "GET", headers });
}

/** Anfrage-Header, die die Middleware an die Seite weitergibt (NextResponse.rewrite/next mit request.headers). */
function weitergegeben(res: Response): { liste: string[]; get: (n: string) => string | null } {
  const liste = (res.headers.get("x-middleware-override-headers") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return { liste, get: (n) => res.headers.get(`x-middleware-request-${n}`) };
}

beforeEach(() => {
  resetRateLimits();
  process.env.AUTH_SECRET = SECRET;
  process.env.DATABASE_URL = "postgresql://u:p@db:5432/railway";
  process.env.APP_DEMO_DATABASE_URL = "postgresql://u:p@db:5432/appdemo";
  delete process.env.PUBLIC_BOOKING_URL;
  delete process.env.LEGACY_HOSTS;
});
afterEach(() => {
  for (const k of ["AUTH_SECRET", "DATABASE_URL", "APP_DEMO_DATABASE_URL", "PUBLIC_BOOKING_URL", "LEGACY_HOSTS"]) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("Middleware: App-Demo", () => {
  it("GET /app-demo/… → intern /buyer/…, signiertes Kennzeichen, ohne Cookies, noindex", async () => {
    const res = await middleware(req("/app-demo/kontakte?x=1", { headers: { cookie: "kpi_session=echt; other=1", authorization: "Bearer x" } }));
    expect(isRewrite(res)).toBe(true);
    const ziel = new URL(getRewrittenUrl(res)!);
    expect(ziel.pathname).toBe("/buyer/kontakte");
    expect(ziel.search).toBe("?x=1");
    const h = weitergegeben(res);
    expect(pruefeDemoMarke(h.get(APP_DEMO_HEADER), SECRET)).toBe(true);
    expect(h.get("x-app-area")).toBe("buyer");
    // Cookies und Anmeldung des Browsers erreichen die Demo-Seite nicht
    expect(h.liste).not.toContain("cookie");
    expect(h.liste).not.toContain("authorization");
    expect(h.get("cookie")).toBeNull();
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("Kennzeichen von außen wird immer abgelehnt (400), auf jedem Pfad, auch gültig signiert", async () => {
    const echt = (await signiereDemoMarke(SECRET))!;
    for (const p of ["/app-demo", "/app-demo/kontakte", "/buyer", "/buyer/kontakte", "/login", "/api/buyer/search", "/book/x", "/"]) {
      for (const wert of ["1", echt]) {
        const res = await middleware(req(p, { headers: { [APP_DEMO_HEADER]: wert } }));
        expect(res.status, `${p} ${wert}`).toBe(400);
        expect(isRewrite(res)).toBe(false);
      }
      const post = await middleware(req(p, { method: "POST", headers: { [APP_DEMO_HEADER]: echt, "next-action": "abc" } }));
      expect(post.status, p).toBe(400);
    }
  });

  it("Server Action aus der Demo: Antwort direkt aus der Middleware, kein Umschreiben, nichts erreicht die App", async () => {
    const res = await middleware(req("/app-demo/kontakte", { method: "POST", headers: { "next-action": "7f00aa", "content-type": "text/plain;charset=UTF-8", cookie: "kpi_session=echt" } }));
    expect(res.status).toBe(200);
    expect(isRewrite(res)).toBe(false);
    expect(res.headers.get("x-middleware-next")).toBeNull();
    expect(res.headers.get("content-type")).toBe("text/x-component");
    expect(await res.text()).toBe('0:{"a":{"ok":false,"error":"In der Demo wird nichts gespeichert."}}\n');
  });

  it("andere Methoden 405, ohne Umschreiben", async () => {
    for (const m of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await middleware(req("/app-demo", { method: m, headers: { "content-type": "multipart/form-data; boundary=x" } }));
      expect(res.status, m).toBe(405);
      expect(isRewrite(res)).toBe(false);
    }
  });

  it("ausgeblendete Bereiche (Bestand, Empfehlungen, Konto …) → Demo-Start", async () => {
    for (const p of ["/app-demo/bestand", "/app-demo/empfehlungen", "/app-demo/konto/export", "/app-demo/einstellungen"]) {
      const res = await middleware(req(p));
      expect(res.status, p).toBe(307);
      expect(new URL(getRedirectUrl(res)!).pathname).toBe("/app-demo");
    }
  });

  it("ohne Demo-Datenbank (oder gleiche wie die echte): „nicht verfügbar“, nie die echte Datenbank", async () => {
    delete process.env.APP_DEMO_DATABASE_URL;
    let res = await middleware(req("/app-demo"));
    expect(res.status).toBe(503);
    expect(isRewrite(res)).toBe(false);
    expect(await res.text()).toContain("Demo ist gerade nicht verfügbar");
    process.env.APP_DEMO_DATABASE_URL = "postgresql://andere:pw@db:5432/railway";
    res = await middleware(req("/app-demo"));
    expect(res.status).toBe(503);
    delete process.env.AUTH_SECRET;
    process.env.APP_DEMO_DATABASE_URL = "postgresql://u:p@db:5432/appdemo";
    res = await middleware(req("/app-demo"));
    expect(res.status).toBe(503);
  });

  it("Rate-Limit je IP", async () => {
    let letzte = 0;
    for (let i = 0; i < 601; i++) letzte = (await middleware(req("/app-demo", { ip: "198.51.100.9" }))).status;
    expect(letzte).toBe(429);
    expect((await middleware(req("/app-demo", { ip: "198.51.100.10" }))).status).not.toBe(429);
  });

  it("aus der Demo heraus: /api/… gesperrt, /buyer-Links zurück in die Demo", async () => {
    const referer = `${APP}/app-demo/kanban`;
    const api = await middleware(req("/api/buyer/search?q=a", { headers: { referer } }));
    expect(api.status).toBe(403);
    const usage = await middleware(req("/api/usage", { method: "POST", headers: { referer } }));
    expect(usage.status).toBe(403);
    const link = await middleware(req("/buyer/kontakte/abc?f=1", { headers: { referer } }));
    expect(link.status).toBe(307);
    const ziel = new URL(getRedirectUrl(link)!);
    expect(ziel.pathname + ziel.search).toBe("/app-demo/kontakte/abc?f=1");
    // Mit echtem Login (eigener Tab) bleibt /buyer der echte Kundenbereich; fremder Referer ändert nichts
    const fremd = await middleware(req("/buyer/kontakte", { headers: { referer: "https://boese.example/app-demo" } }));
    expect(new URL(getRedirectUrl(fremd)!).pathname).toBe("/login");
  });
});
