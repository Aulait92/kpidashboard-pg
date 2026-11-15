import { afterEach, describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";
import { RESERVED_SEGMENTS, decidePublicHost, isShortSlug, parseBookingUrl, publicPathFor, requestHost } from "@/lib/public-booking-host";
import { bookingPageUrl, manageUrlFor, publicBaseOrNull, publicUrl, publicUrlOr } from "@/lib/public-url";
import { leadLegalLinks } from "@/components/lead-legal-footer";

// Eigene Buchungsadresse für Endkunden (Ole, 15.11.2026): Entscheidungen der Middleware und Link-Bau.

const WWW = "https://www.dein-beratungstermin.de";
const decide = (host: string, pathname: string, extra: Partial<Parameters<typeof decidePublicHost>[0]> = {}) =>
  decidePublicHost({ host, pathname, search: "", method: "GET", bookingUrl: WWW, ...extra });

describe("parseBookingUrl", () => {
  it("liest Adresse mit und ohne www, Gegenstück wird umgeleitet", () => {
    expect(parseBookingUrl(WWW)).toEqual({ origin: WWW, host: "www.dein-beratungstermin.de", alternate: "dein-beratungstermin.de" });
    expect(parseBookingUrl("https://dein-beratungstermin.de/")).toEqual({
      origin: "https://dein-beratungstermin.de",
      host: "dein-beratungstermin.de",
      alternate: "www.dein-beratungstermin.de",
    });
    expect(parseBookingUrl("dein-beratungstermin.de")?.origin).toBe("https://dein-beratungstermin.de");
  });
  it("leer oder ungültig: null", () => {
    expect(parseBookingUrl(undefined)).toBeNull();
    expect(parseBookingUrl("")).toBeNull();
    expect(parseBookingUrl("localhost")).toBeNull();
  });
});

describe("decidePublicHost: Buchungsadresse", () => {
  it("ohne PUBLIC_BOOKING_URL ändert sich nichts", () => {
    expect(decide("www.dein-beratungstermin.de", "/login", { bookingUrl: undefined })).toEqual({ kind: "pass" });
    expect(decide("app.performancegrowth.de", "/book/meier", { bookingUrl: "" })).toEqual({ kind: "pass" });
  });

  it("Endkunden-Seiten und ihre Endpunkte werden ausgeliefert", () => {
    for (const p of [
      "/book",
      "/book/meier",
      "/book/manage/abc123",
      "/book/manage/abc123/ics",
      "/empfehlung/tok123456789",
      "/empfehlung/tok123456789/kontakt",
      "/empfehlung/g/tok123456789",
      "/einwilligung/e123.sig",
      "/einwilligung/bestaetigen/tok",
      "/abmelden/r123.sig",
      "/api/abmelden/r123.sig",
      "/erstinformation/tok123",
      "/erstinformation/tok123/pdf",
      "/_next/static/chunks/a.js",
      "/icon/192",
      "/apple-icon",
      "/favicon.ico",
      "/monitoring",
      "/api/csp-report",
    ]) {
      expect(decide("www.dein-beratungstermin.de", p), p).toEqual({ kind: "serve" });
    }
  });

  it("alles andere: 404, keine Weiterleitung in die App", () => {
    for (const p of ["/login", "/logout", "/forgot-password", "/status", "/sicherheit", "/admin", "/admin/kunden", "/buyer", "/buyer/kalender", "/api/auth/logout", "/api/whatsapp/webhook", "/api/health", "/rechner", "/angebot/abc", "/manifest.webmanifest", "/sw.js", "/a/b", "/meier/x", "/foo.php"]) {
      expect(decide("www.dein-beratungstermin.de", p), p).toEqual({ kind: "not_found" });
    }
  });

  it("Startseite: neutrale Seite, robots.txt sperrt alles", () => {
    expect(decide("www.dein-beratungstermin.de", "/")).toEqual({ kind: "rewrite", pathname: "/book" });
    expect(decide("www.dein-beratungstermin.de", "/robots.txt")).toEqual({ kind: "robots" });
  });

  it("Kurzlink /<slug> → /book/<slug>", () => {
    expect(decide("www.dein-beratungstermin.de", "/meier-versicherungen")).toEqual({ kind: "rewrite", pathname: "/book/meier-versicherungen" });
    expect(decide("www.dein-beratungstermin.de", "/meier-versicherungen/")).toEqual({ kind: "rewrite", pathname: "/book/meier-versicherungen" });
    expect(decide("www.dein-beratungstermin.de", "/Ab_c-9")).toEqual({ kind: "rewrite", pathname: "/book/Ab_c-9" });
    // reservierte Namen (Bereiche der App) sind keine Kurzlinks
    expect(decide("www.dein-beratungstermin.de", "/api")).toEqual({ kind: "not_found" });
    expect(decide("www.dein-beratungstermin.de", "/login")).toEqual({ kind: "not_found" });
  });

  it("Host mit Port und Großschreibung wird erkannt", () => {
    expect(decide("WWW.Dein-Beratungstermin.de:443", "/book/meier")).toEqual({ kind: "serve" });
  });

  it("Gegenstück (ohne www) → 308 auf die eingestellte Adresse, Pfad und Query bleiben", () => {
    expect(decide("dein-beratungstermin.de", "/meier", { search: "?x=1" })).toEqual({ kind: "redirect", location: `${WWW}/meier?x=1` });
    expect(decide("dein-beratungstermin.de", "/")).toEqual({ kind: "redirect", location: `${WWW}/` });
    // umgekehrt eingerichtet: www → ohne www
    expect(decide("www.dein-beratungstermin.de", "/book/manage/t", { bookingUrl: "https://dein-beratungstermin.de" })).toEqual({
      kind: "redirect",
      location: "https://dein-beratungstermin.de/book/manage/t",
    });
  });
});

describe("decidePublicHost: alte Links auf der App-Adresse", () => {
  const app = "app.performancegrowth.de";
  it("GET-Seiten der Endkunden → 308 auf die Buchungsadresse (Buchungsseite als Kurzlink)", () => {
    expect(decide(app, "/book/meier", { search: "?lead=l1" })).toEqual({ kind: "redirect", location: `${WWW}/meier?lead=l1` });
    expect(decide(app, "/book/manage/tok")).toEqual({ kind: "redirect", location: `${WWW}/book/manage/tok` });
    expect(decide(app, "/book/manage/tok/ics")).toEqual({ kind: "redirect", location: `${WWW}/book/manage/tok/ics` });
    expect(decide(app, "/empfehlung/tok123456789/kontakt", { search: "?ok=1" })).toEqual({ kind: "redirect", location: `${WWW}/empfehlung/tok123456789/kontakt?ok=1` });
    expect(decide(app, "/einwilligung/e1.sig")).toEqual({ kind: "redirect", location: `${WWW}/einwilligung/e1.sig` });
    expect(decide(app, "/abmelden/r1.sig")).toEqual({ kind: "redirect", location: `${WWW}/abmelden/r1.sig` });
    expect(decide(app, "/erstinformation/tok/pdf", { method: "HEAD" })).toEqual({ kind: "redirect", location: `${WWW}/erstinformation/tok/pdf` });
    // Slug, der kein Kurzlink sein kann: bleibt unter /book/
    expect(decide(app, "/book/api")).toEqual({ kind: "redirect", location: `${WWW}/book/api` });
  });

  it("Formulare (POST), API, App-Seiten und /book ohne Slug bleiben auf der App", () => {
    expect(decide(app, "/book/meier", { method: "POST" })).toEqual({ kind: "pass" });
    expect(decide(app, "/einwilligung/e1.sig", { method: "POST" })).toEqual({ kind: "pass" });
    expect(decide(app, "/api/abmelden/r1.sig", { method: "POST" })).toEqual({ kind: "pass" });
    expect(decide(app, "/api/abmelden/r1.sig")).toEqual({ kind: "pass" });
    expect(decide(app, "/buyer/kalender")).toEqual({ kind: "pass" });
    expect(decide(app, "/empfehlen/code")).toEqual({ kind: "pass" });
    expect(decide(app, "/book")).toEqual({ kind: "pass" });
    expect(decide(app, "/login")).toEqual({ kind: "pass" });
  });

  it("Berater mit Login bucht für einen Lead (?lead=): bleibt auf der App", () => {
    expect(decide(app, "/book/meier", { search: "?lead=l1", hasSession: true })).toEqual({ kind: "pass" });
    expect(decide(app, "/book/meier", { hasSession: true })).toEqual({ kind: "redirect", location: `${WWW}/meier` });
  });
});

describe("Hilfsfunktionen", () => {
  it("jeder Ordner unter src/app ist reserviert (kein Kurzlink überdeckt einen Bereich der App)", () => {
    const dirs = readdirSync(path.resolve(__dirname, "../../src/app"), { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("(") && !d.name.startsWith("["))
      .map((d) => d.name);
    expect(dirs.length).toBeGreaterThan(5);
    for (const d of dirs) expect(RESERVED_SEGMENTS.has(d), d).toBe(true);
  });
  it("Kurzlink nur für einfache, nicht reservierte Slugs", () => {
    expect(isShortSlug("meier-versicherungen")).toBe(true);
    expect(isShortSlug("book")).toBe(false);
    expect(isShortSlug("API")).toBe(false);
    expect(isShortSlug("a.b")).toBe(false);
    expect(publicPathFor("/book/meier")).toBe("/meier");
    expect(publicPathFor("/book/manage/t")).toBe("/book/manage/t");
    expect(publicPathFor("/empfehlung/t")).toBe("/empfehlung/t");
  });
  it("Host aus x-forwarded-host, sonst host", () => {
    const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
    expect(requestHost(h({ "x-forwarded-host": "www.dein-beratungstermin.de, proxy", host: "localhost:8080" }))).toBe("www.dein-beratungstermin.de");
    expect(requestHost(h({ host: "App.Performancegrowth.de" }))).toBe("app.performancegrowth.de");
  });
});

describe("publicUrl und Links für Endkunden", () => {
  const saved = { app: process.env.APP_URL, pub: process.env.PUBLIC_BOOKING_URL, rw: process.env.RAILWAY_PUBLIC_DOMAIN };
  afterEach(() => {
    process.env.APP_URL = saved.app;
    process.env.PUBLIC_BOOKING_URL = saved.pub;
    process.env.RAILWAY_PUBLIC_DOMAIN = saved.rw;
    if (saved.app === undefined) delete process.env.APP_URL;
    if (saved.pub === undefined) delete process.env.PUBLIC_BOOKING_URL;
    if (saved.rw === undefined) delete process.env.RAILWAY_PUBLIC_DOMAIN;
  });

  it("ohne PUBLIC_BOOKING_URL: App-Adresse wie bisher", () => {
    process.env.APP_URL = "https://app.performancegrowth.de/";
    delete process.env.PUBLIC_BOOKING_URL;
    expect(publicUrl("/book/meier")).toBe("https://app.performancegrowth.de/book/meier");
    expect(bookingPageUrl("meier", { lead: "l1" })).toBe("https://app.performancegrowth.de/book/meier?lead=l1");
    expect(manageUrlFor("tok")).toBe("https://app.performancegrowth.de/book/manage/tok");
    expect(publicBaseOrNull()).toBe("https://app.performancegrowth.de");
  });

  it("mit PUBLIC_BOOKING_URL: Buchungsadresse, Buchungsseite als Kurzlink", () => {
    process.env.APP_URL = "https://app.performancegrowth.de";
    process.env.PUBLIC_BOOKING_URL = `${WWW}/`;
    expect(publicUrl("/book/meier")).toBe(`${WWW}/meier`);
    expect(publicUrl("/book/meier?lead=l1")).toBe(`${WWW}/meier?lead=l1`);
    expect(bookingPageUrl("meier", { lead: "l1" })).toBe(`${WWW}/meier?lead=l1`);
    expect(bookingPageUrl("book")).toBe(`${WWW}/book/book`);
    expect(manageUrlFor("tok")).toBe(`${WWW}/book/manage/tok`);
    expect(publicUrl("/erstinformation/abc")).toBe(`${WWW}/erstinformation/abc`);
    expect(publicBaseOrNull()).toBe(WWW);
  });

  it("ohne jede Adresse: publicUrl wirft wie getAppUrl, publicUrlOr nimmt die Standardadresse", () => {
    delete process.env.APP_URL;
    delete process.env.PUBLIC_BOOKING_URL;
    delete process.env.RAILWAY_PUBLIC_DOMAIN;
    expect(() => publicUrl("/abmelden/x")).toThrow();
    expect(publicUrlOr("/abmelden/x")).toBe("https://app.performancegrowth.de/abmelden/x");
    expect(bookingPageUrl("meier")).toBeNull();
    expect(publicBaseOrNull()).toBeNull();
  });
});

describe("Fußzeile der Endkunden-Seiten", () => {
  it("Impressum und Datenschutz des Vermittlers, dazu unser Hinweis als Dienstleister", () => {
    expect(leadLegalLinks({ impressumUrl: "https://meier.de/impressum", privacyUrl: "https://meier.de/datenschutz" })).toEqual({
      imprint: "https://meier.de/impressum",
      privacy: "https://meier.de/datenschutz",
      processor: process.env.BOOKING_PRIVACY_URL ?? "https://performancegrowth.de/datenschutz",
    });
  });
  it("ohne Angaben des Vermittlers: allgemeine Links des Betreibers", () => {
    const l = leadLegalLinks(null);
    expect(l.imprint).toBe("https://performancegrowth.de/impressum");
    expect(l.processor).toBeNull();
    expect(leadLegalLinks({ impressumUrl: "javascript:alert(1)" }).imprint).toBe("https://performancegrowth.de/impressum");
  });
});
