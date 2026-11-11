import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

// DNS: alle Testdomains lösen auf eine öffentliche Adresse auf (kein Netz nötig)
vi.mock("node:dns/promises", () => ({ lookup: vi.fn(async () => [{ address: "93.184.216.34", family: 4 }]) }));

import { prisma } from "@/lib/prisma";
import { enrichContactAddress, enrichPendingAddresses } from "@/lib/vertrieb/address-enrich";
import { requireTestDb } from "./db";

const html = (body: string) => new Response(`<html><body>${body}</body></html>`, { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });

function mockSites(sites: Record<string, string>) {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL) => {
      const url = String(input);
      calls.push(url);
      const hit = Object.entries(sites).find(([k]) => url.startsWith(k));
      return hit ? html(hit[1]) : new Response("not found", { status: 404, headers: { "content-type": "text/html" } });
    }),
  );
  return calls;
}

const P = "ae-";

describe("Vertrieb: Adresse aus dem Impressum ergänzen", () => {
  beforeAll(async () => {
    requireTestDb();
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: P } } });
  });
  afterEach(() => vi.unstubAllGlobals());
  afterAll(async () => {
    await prisma.salesContact.deleteMany({ where: { id: { startsWith: P } } });
  });

  it("ergänzt fehlende Felder, lässt vorhandene stehen, schreibt Verlauf", async () => {
    await prisma.salesContact.create({ data: { id: `${P}1`, name: "Agentur Muster", email: "info@agentur-muster-test.de", zip: "11111", phone: null } });
    const calls = mockSites({
      "https://agentur-muster-test.de/impressum": "<p>Agentur Muster</p><p>Hauptstraße 12</p><p>12345 Musterstadt</p><p>Telefon: 030 123456</p>",
      "https://agentur-muster-test.de/": '<a href="/impressum">Impressum</a>',
    });
    const r = await enrichContactAddress(`${P}1`);
    expect(r.status).toBe("updated");
    const c = await prisma.salesContact.findUniqueOrThrow({ where: { id: `${P}1` } });
    expect(c).toMatchObject({ street: "Hauptstraße 12", zip: "11111", city: "Musterstadt", phone: "030 123456" });
    expect(c.addressEnrichedAt).not.toBeNull();
    expect(c.addressEnrichTriedAt).not.toBeNull();
    const act = await prisma.salesActivity.findFirst({ where: { contactId: `${P}1` } });
    expect(act?.note).toContain("Adresse von der Website ergänzt");
    expect(act?.note).toContain("https://agentur-muster-test.de/impressum");
    expect(calls).toHaveLength(2);
  });

  it("versucht jeden Kontakt automatisch nur einmal", async () => {
    await prisma.salesContact.create({ data: { id: `${P}2`, name: "Ohne Impressum", email: "info@ohne-impressum-test.de" } });
    const calls = mockSites({});
    expect((await enrichContactAddress(`${P}2`)).status).toBe("not-found");
    expect((await enrichContactAddress(`${P}2`)).status).toBe("nothing-new");
    expect(calls).toHaveLength(1); // zweiter Aufruf ohne Abruf
    mockSites({});
    expect((await enrichContactAddress(`${P}2`, { force: true })).status).toBe("not-found"); // Knopf erzwingt
  });

  it("Freemail ohne Website: kein Abruf", async () => {
    await prisma.salesContact.create({ data: { id: `${P}3`, name: "Freemail", email: "max@gmail.com-ae-test.invalid" } });
    const calls = mockSites({});
    expect((await enrichContactAddress(`${P}3`)).status).toBe("no-source");
    expect(calls).toHaveLength(0);
  });

  it("vollständige Adresse: nichts zu tun", async () => {
    await prisma.salesContact.create({ data: { id: `${P}4`, name: "Komplett", email: "a@komplett-test.de", street: "Weg 1", zip: "12345", city: "Ort" } });
    const calls = mockSites({});
    expect((await enrichContactAddress(`${P}4`)).status).toBe("complete");
    expect(calls).toHaveLength(0);
  });

  it("Nachhol-Lauf beachtet das Limit und nur nie versuchte Kontakte", async () => {
    await prisma.salesContact.updateMany({ where: { addressEnrichTriedAt: null, id: { not: { startsWith: P } } }, data: { addressEnrichTriedAt: new Date() } });
    for (let i = 0; i < 5; i++) {
      await prisma.salesContact.create({ data: { id: `${P}b${i}`, name: `Batch ${i}`, email: `info@batch${i}-test.invalid` } });
    }
    mockSites({});
    const r1 = await enrichPendingAddresses(3);
    expect(r1.tried).toBe(3);
    const r2 = await enrichPendingAddresses(3);
    expect(r2.tried).toBe(2);
    const r3 = await enrichPendingAddresses(3);
    expect(r3.tried).toBe(0);
  });
});
