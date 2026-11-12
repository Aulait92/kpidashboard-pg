import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// DNS: Testdomains lösen auf eine öffentliche Adresse auf (kein Netz nötig)
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

import { prisma } from "@/lib/prisma";
import { enrichContact, enrichPendingContacts } from "@/lib/vertrieb/contact-enrich";
import { requireTestDb } from "./db";

// Erfundene Agenturen (keine echten Kontaktdaten)
const P = "ka-";
const html = (body: string) => new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

type PlaceStub = Record<string, unknown>;
let places: PlaceStub[] = [];
let googleCalls = 0;

function mockNet(sites: Record<string, string>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith("https://places.googleapis.com/")) {
        googleCalls++;
        return new Response(JSON.stringify({ places }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const hit = Object.entries(sites).find(([k]) => url.startsWith(k));
      return hit ? html(hit[1]) : new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    }),
  );
}

const SITE = {
  "https://agentur-alpha-test.de/impressum":
    "<p>Agentur Alpha</p><p>Inhaber: Anna Alpha</p><p>Alphaweg 3</p><p>12345 Alphastadt</p><p>Telefon: 030 5550001</p><p>Fax: 030 5550002</p><p>Versicherungsmakler nach § 34d Abs. 1 GewO</p>",
  "https://agentur-alpha-test.de/":
    '<a href="/impressum">Impressum</a><a href="https://www.facebook.com/agentur.alpha.test">FB</a><p>Öffnungszeiten</p><p>Mo - Fr 08:30 - 16:00 Uhr</p>',
};

const alphaPlace = {
  id: "place-alpha",
  displayName: { text: "Agentur Alpha" },
  websiteUri: "https://www.agentur-alpha-test.de/",
  googleMapsUri: "https://maps.google.com/?cid=1",
  rating: 4.86,
  userRatingCount: 37,
  regularOpeningHours: { weekdayDescriptions: ["Montag: 08:30–16:00", "Dienstag: 08:30–16:00"] },
  businessStatus: "OPERATIONAL",
  addressComponents: [
    { longText: "12345", types: ["postal_code"] },
    { longText: "Alphastadt", types: ["locality"] },
  ],
};

describe("Vertriebskontakte maximal anreichern", () => {
  beforeAll(async () => {
    requireTestDb();
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: P } } });
  });
  beforeEach(async () => {
    places = [];
    googleCalls = 0;
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    delete process.env.GOOGLE_PLACES_MAX_PER_DAY;
    await prisma.placesUsage.deleteMany({});
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: P } } });
    await prisma.placesUsage.deleteMany({});
  });

  it("Website + plausibler Google-Treffer: füllt leere Felder, Bewertung und Maps-Link, Verlauf", async () => {
    await prisma.salesContact.create({ data: { id: `${P}1`, name: "Agentur Alpha", email: "info@agentur-alpha-test.de", lastName: "Alpha" } });
    mockNet(SITE);
    places = [alphaPlace];
    const r = await enrichContact(`${P}1`);
    expect(r.web).toBe("updated");
    expect(r.google).toBe("updated");
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}1` } });
    expect(c).toMatchObject({
      street: "Alphaweg 3",
      zip: "12345",
      city: "Alphastadt",
      phone: "030 5550001",
      fax: "030 5550002",
      leaderNames: "Anna Alpha",
      insurer: "Makler",
      facebookUrl: "https://www.facebook.com/agentur.alpha.test",
      ratingValue: 4.9,
      ratingCount: 37,
      googlePlaceId: "place-alpha",
      googleMapsUrl: "https://maps.google.com/?cid=1",
      businessStatus: "OPERATIONAL",
    });
    // Öffnungszeiten zuerst von der Website, dann frischer aus Google (automatische Quelle → darf ersetzen)
    expect(c.openingHours).toBe("Montag: 08:30–16:00\nDienstag: 08:30–16:00");
    expect(c.webEnrichAt).not.toBeNull();
    expect(c.googleCheckedAt).not.toBeNull();
    expect((c.enrichment as { google?: { placeId?: string } }).google?.placeId).toBe("place-alpha");
    const act = await prisma.salesActivity.findFirst({ where: { contactId: `${P}1`, note: { startsWith: "Automatisch ergänzt" } } });
    expect(act?.note).toContain("Fax");
    expect(act?.note).toContain("(Google)");
    // Zweiter Lauf: nichts fällig, keine weitere Google-Anfrage
    googleCalls = 0;
    expect(await enrichContact(`${P}1`)).toMatchObject({ web: "skipped", google: "skipped" });
    expect(googleCalls).toBe(0);
  });

  it("unplausibler Treffer: nichts übernommen", async () => {
    await prisma.salesContact.create({ data: { id: `${P}2`, name: "Agentur Beta", email: "info@agentur-beta-test.de", city: "Betastadt", zip: "54321", lastName: "Beta" } });
    mockNet({});
    places = [{ ...alphaPlace, id: "place-fremd", displayName: { text: "Ganz andere Agentur" }, websiteUri: "https://andere-test.de" }];
    const r = await enrichContact(`${P}2`);
    expect(r.google).toMatch(/^unsure/);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}2` } });
    expect(c.ratingValue).toBeNull();
    expect(c.googlePlaceId).toBeNull();
    expect(c.googleCheckedAt).not.toBeNull();
  });

  it("überschreibt keine manuell gepflegten Felder (Telefon, Öffnungszeiten)", async () => {
    await prisma.salesContact.create({
      data: { id: `${P}3`, name: "Agentur Alpha", email: "kontakt@agentur-alpha-test.de", phone: "0170 1111111", openingHours: "nur nach Termin", lastName: "Alpha", city: "Alphastadt" },
    });
    mockNet(SITE);
    places = [alphaPlace];
    await enrichContact(`${P}3`);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}3` } });
    expect(c.phone).toBe("0170 1111111");
    expect(c.openingHours).toBe("nur nach Termin");
    expect(c.ratingValue).toBe(4.9); // Bewertung kommt immer aus Google
  });

  it("Tageslimit: danach keine Google-Anfrage mehr", async () => {
    process.env.GOOGLE_PLACES_MAX_PER_DAY = "1";
    await prisma.salesContact.create({ data: { id: `${P}4`, name: "Agentur Gamma", email: "a@gamma-test.invalid", city: "Gammastadt", lastName: "Gamma" } });
    await prisma.salesContact.create({ data: { id: `${P}5`, name: "Agentur Delta", email: "a@delta-test.invalid", city: "Deltastadt", lastName: "Delta" } });
    mockNet({});
    places = [];
    expect((await enrichContact(`${P}4`)).google).toBe("not-found");
    expect((await enrichContact(`${P}5`)).google).toBe("limit");
    expect(googleCalls).toBe(1);
    expect((await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}5` } })).googleCheckedAt).toBeNull();
  });

  it("ohne Schlüssel: Google wird übersprungen, Website trotzdem ausgewertet; Cron holt neue Kontakte", async () => {
    delete process.env.GOOGLE_PLACES_API_KEY;
    await prisma.salesContact.create({ data: { id: `${P}6`, name: "Agentur Alpha", email: "neu@agentur-alpha-test.de" } });
    mockNet(SITE);
    const r = await enrichPendingContacts(50);
    expect(r.tried).toBeGreaterThan(0);
    expect(googleCalls).toBe(0);
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}6` } });
    expect(c.webEnrichAt).not.toBeNull();
    expect(c.openingHours).toBe("Mo - Fr 08:30 - 16:00 Uhr");
    expect(c.googleCheckedAt).toBeNull();
  });
});
