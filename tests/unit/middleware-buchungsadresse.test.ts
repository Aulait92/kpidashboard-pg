import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getRedirectUrl, getRewrittenUrl, isRewrite } from "next/experimental/testing/server";
import { middleware } from "@/middleware";

// Middleware mit echter NextResponse: Buchungsadresse (PUBLIC_BOOKING_URL) und alte App-Links.

const PUB = "https://www.dein-beratungstermin.de";
const saved = process.env.PUBLIC_BOOKING_URL;

function req(url: string, init: { method?: string; host?: string; cookie?: string } = {}) {
  const u = new URL(url);
  const headers = new Headers({ host: init.host ?? u.host });
  if (init.cookie) headers.set("cookie", init.cookie);
  // Hinter Railway kommt die Anfrage intern an (localhost:8080), der Host steht in den Kopfzeilen
  return new NextRequest(`http://localhost:8080${u.pathname}${u.search}`, { method: init.method ?? "GET", headers });
}

beforeEach(() => {
  process.env.PUBLIC_BOOKING_URL = PUB;
  process.env.AUTH_SECRET ||= "localtestsecret_localtestsecret_0123456789";
});
afterEach(() => {
  if (saved === undefined) delete process.env.PUBLIC_BOOKING_URL;
  else process.env.PUBLIC_BOOKING_URL = saved;
});

describe("Middleware: Buchungsadresse", () => {
  it("Kurzlink wird intern auf /book/<slug> umgeschrieben, mit noindex", async () => {
    const res = await middleware(req(`${PUB}/meier-versicherungen?x=1`));
    expect(isRewrite(res)).toBe(true);
    expect(new URL(getRewrittenUrl(res)!).pathname).toBe("/book/meier-versicherungen");
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });

  it("Startseite zeigt die neutrale Seite, /login und /admin sind 404 ohne Markennamen", async () => {
    const root = await middleware(req(`${PUB}/`));
    expect(new URL(getRewrittenUrl(root)!).pathname).toBe("/book");
    for (const p of ["/login", "/admin/kunden", "/buyer", "/api/health"]) {
      const res = await middleware(req(`${PUB}${p}`));
      expect(res.status, p).toBe(404);
      const html = await res.text();
      expect(html).not.toMatch(/performancegrowth/i);
    }
  });

  it("robots.txt sperrt alles", async () => {
    const res = await middleware(req(`${PUB}/robots.txt`));
    expect(await res.text()).toBe("User-agent: *\nDisallow: /\n");
  });

  it("ohne www → 308 auf www mit Pfad und Query", async () => {
    const res = await middleware(req("https://dein-beratungstermin.de/meier?a=1"));
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe(`${PUB}/meier?a=1`);
  });

  it("alte App-Links → 308 auf die Buchungsadresse, Formulare bleiben", async () => {
    const res = await middleware(req("https://app.performancegrowth.de/book/meier?lead=l1"));
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe(`${PUB}/meier?lead=l1`);
    const manage = await middleware(req("https://app.performancegrowth.de/book/manage/tok"));
    expect(getRedirectUrl(manage)).toBe(`${PUB}/book/manage/tok`);
    const post = await middleware(req("https://app.performancegrowth.de/book/meier", { method: "POST" }));
    expect(post.status).toBe(200);
    expect(getRedirectUrl(post)).toBeNull();
  });

  it("ohne PUBLIC_BOOKING_URL: App unverändert", async () => {
    delete process.env.PUBLIC_BOOKING_URL;
    const res = await middleware(req("https://app.performancegrowth.de/book/meier"));
    expect(res.status).toBe(200);
    expect(getRedirectUrl(res)).toBeNull();
    expect(isRewrite(res)).toBe(false);
  });
});

describe("Middleware: www vor der App-Adresse", () => {
  it("www.app.… leitet per 308 auf app.… um, Pfad und Abfrage bleiben; Buchungsadresse unverändert", async () => {
    const res = await middleware(req("https://www.app.performancegrowth.de/buyer/einrichtung?schritt=2"));
    expect(res.status).toBe(308);
    expect(getRedirectUrl(res)).toBe("https://app.performancegrowth.de/buyer/einrichtung?schritt=2");
    const post = await middleware(req("https://www.app.performancegrowth.de/login", { method: "POST" }));
    expect(post.status).toBe(308);
    const booking = await middleware(req(`${PUB}/meier-versicherungen`));
    expect(isRewrite(booking)).toBe(true);
  });
});
