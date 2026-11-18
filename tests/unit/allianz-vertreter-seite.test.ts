import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Vertreter-Seite vertretung.allianz.de (Ole, 18.11.2026): „Vertreter-Seite nicht
// gefunden", obwohl die Seite existiert. Ursache: Cloudflare vor der Allianz-Seite
// gab dem Server statt der Seite eine kleine Sperrseite. Hier: echte (anonymisierte)
// Seite wird gelesen, Sperre wird als Sperre erkannt und verständlich gemeldet,
// Logo-Abruf wird für Allianz-Seiten gar nicht erst versucht.
vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { ALLIANZ_BLOCKED_MESSAGE, AllianzCalendarError, __resetAllianzCache, parseVertretungInput, resolveAllianzCalendar, vtnrFromPageHtml } from "@/lib/calendar/allianz-online";
import { BROWSER_UA, fetchPage, looksBlocked } from "@/lib/web-fetch";
import { istAllianzVertreterSeite, logoVonWebseite } from "@/lib/branding-logo";

const fixture = (name: string) => readFileSync(path.join(__dirname, "../fixtures/allianz", name), "utf8");
const SEITE = fixture("vertreter-seite.html");
const SPERRE = fixture("cloudflare-sperre.html");
const JS = `x={clientId:"${"c".repeat(64)}",domain:"https://auth.bookingtime.com"};y=class{constructor(){this.organizationId="${"r".repeat(32)}"}}`;

type Seite = { status: number; body: string; headers?: Record<string, string> };
let seite: Seite;
let calls: Array<{ url: string; headers: Headers }>;

beforeEach(() => {
  __resetAllianzCache();
  calls = [];
  seite = { status: 200, body: SEITE, headers: { "content-type": "text/html;charset=utf-8" } };
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, headers: new Headers(init.headers) });
      if (url.startsWith("https://vertretung.allianz.de/")) return new Response(seite.body, { status: seite.status, headers: seite.headers });
      if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/assets/")) return new Response(JS);
      if (url.startsWith("https://booking.allianz-abv.eps.bookingtime.com/")) return new Response('<script type="module" src="/assets/index-abc.js"></script>');
      if (url.startsWith("https://auth.bookingtime.com/")) return Response.json({ refresh_token: "r", access_token: "a", expires_in: 300 });
      if (url.includes("/identify")) return Response.json({ content: { id: "o".repeat(32), name: "Agentur Max Muster" } });
      if (url.includes("/bookingTemplate/list")) return Response.json({ content: { recordList: [{ id: "t".repeat(32), name: "Online-Beratung", duration: 60 }] } });
      return new Response("?", { status: 404 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Allianz-Vertreter-Seite lesen", () => {
  it("Link in jeder Schreibweise wird zur selben Seite", () => {
    const want = { pageUrl: "https://vertretung.allianz.de/anid.schwarzkopf/" };
    expect(parseVertretungInput("https://vertretung.allianz.de/anid.schwarzkopf/")).toEqual(want);
    expect(parseVertretungInput("https://vertretung.allianz.de/anid.schwarzkopf")).toEqual(want);
    expect(parseVertretungInput("vertretung.allianz.de/anid.schwarzkopf/")).toEqual(want);
    expect(parseVertretungInput("http://vertretung.allianz.de/anid.schwarzkopf/#kontakt")).toEqual(want);
  });

  it("VTNR aus der echten Seitenstruktur (Agenturdaten und Termin-Button)", () => {
    expect(vtnrFromPageHtml(SEITE)).toBe("109999999");
    // Ohne Agenturdaten reicht der Button „Termin vereinbaren"
    const nurButton = SEITE.replace(/agencyKey/g, "x");
    expect(vtnrFromPageHtml(nurButton)).toBe("109999999");
  });

  it("Seite wird mit Browser-Kopfzeilen geladen und aufgelöst", async () => {
    const cal = await resolveAllianzCalendar("https://vertretung.allianz.de/anid.schwarzkopf/");
    expect(cal.vtnr).toBe("109999999");
    expect(cal.templateName).toBe("Online-Beratung");
    const page = calls.find((c) => c.url.startsWith("https://vertretung.allianz.de/"))!;
    expect(page.headers.get("user-agent")).toBe(BROWSER_UA);
    expect(page.headers.get("accept-language")).toContain("de");
  });

  it("Cloudflare-Sperre → verständliche Meldung mit Vertreternummer/ICS, nicht „nicht gefunden“", async () => {
    seite = { status: 403, body: SPERRE, headers: { "content-type": "text/html", "cf-mitigated": "challenge", server: "cloudflare" } };
    const err = await resolveAllianzCalendar("vertretung.allianz.de/anid.schwarzkopf").catch((e) => e);
    expect(err).toBeInstanceOf(AllianzCalendarError);
    expect(err.code).toBe("blocked");
    expect(err.message).toBe(ALLIANZ_BLOCKED_MESSAGE);
    expect(err.message).toContain("Die Allianz lässt den automatischen Abruf gerade nicht zu.");
    expect(err.message).not.toMatch(/[–—]/);
  });

  it("Sperrseite mit Status 200 wird ebenfalls erkannt", async () => {
    seite = { status: 200, body: SPERRE, headers: { "content-type": "text/html" } };
    const err = await resolveAllianzCalendar("vertretung.allianz.de/anid.schwarzkopf").catch((e) => e);
    expect(err.code).toBe("blocked");
  });

  it("echte 404 bleibt „nicht gefunden“", async () => {
    seite = { status: 404, body: "<html><title>Seite nicht gefunden</title></html>" };
    const err = await resolveAllianzCalendar("vertretung.allianz.de/gibt.es.nicht").catch((e) => e);
    expect(err.code).toBe("other");
    expect(err.message).toMatch(/nicht gefunden/);
  });

  it("Vertreternummer braucht die Seite gar nicht", async () => {
    const cal = await resolveAllianzCalendar("109999999");
    expect(cal.vtnr).toBe("109999999");
    expect(calls.some((c) => c.url.startsWith("https://vertretung.allianz.de/"))).toBe(false);
  });
});

describe("Gemeinsamer Seitenabruf", () => {
  it("echte große Seite mit Cloudflare-Skript ist keine Sperre", () => {
    const gross = SEITE + "<script src='/cdn-cgi/challenge-platform/scripts/jsd/main.js'></script>" + " ".repeat(70_000);
    expect(looksBlocked(200, new Headers(), gross)).toBe(false);
    expect(looksBlocked(200, new Headers(), SPERRE)).toBe(true);
    expect(looksBlocked(403, new Headers(), "")).toBe(true);
  });

  it("protokolliert Status und Ziel-Adresse, keine Inhalte", async () => {
    seite = { status: 403, body: SPERRE, headers: { "cf-mitigated": "challenge" } };
    const warn = vi.mocked(console.warn);
    const r = await fetchPage("https://vertretung.allianz.de/anid.schwarzkopf/", { log: "test" });
    expect(r).toMatchObject({ ok: false, reason: "blocked", status: 403 });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).toContain("403");
    expect(logged).toContain("https://vertretung.allianz.de/anid.schwarzkopf/");
    expect(logged).not.toContain("Just a moment");
  });
});

describe("Logo von einer Allianz-Vertreter-Seite", () => {
  it("wird nicht abgerufen, sondern bietet das Hochladen an", async () => {
    expect(istAllianzVertreterSeite("https://vertretung.allianz.de/anid.schwarzkopf/")).toBe(true);
    expect(istAllianzVertreterSeite("vertretung.allianz.de/anid.schwarzkopf")).toBe(true);
    expect(istAllianzVertreterSeite("agentur-muster.de")).toBe(false);
    const r = await logoVonWebseite("https://vertretung.allianz.de/anid.schwarzkopf/");
    expect(r).toEqual({ error: expect.stringContaining("Logo selbst hoch"), hochladen: true });
    expect(calls).toHaveLength(0);
  });
});
