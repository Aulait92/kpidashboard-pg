// Impressum des Vermittlers fehlt (Rechtsvorprüfung 16.11.2026): Fußzeile der Endkundenseiten heißt dann
// „Anbieterangaben (Erstinformation)“, einmalig eine Admin-Aufgabe „Impressum-URL fehlt“ (ohne Doppelungen),
// Nachtragen in der Einrichtung speichert die Adresse und erledigt die Aufgabe.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ after: [] as Array<() => unknown> }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: (fn: () => unknown) => void h.after.push(fn) }));

import { renderToStaticMarkup } from "react-dom/server";
import { prisma } from "@/lib/prisma";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { _resetImpressumFehltCache, IMPRESSUM_FEHLT_TASK, impressumFehltAufgabe, impressumUrlSpeichern } from "@/lib/impressum-fehlt";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const ids: string[] = [];
const tasks = (customerId: string) => prisma.salesTask.findMany({ where: { title: { startsWith: IMPRESSUM_FEHLT_TASK }, note: { contains: `Kunden-ID ${customerId}` } } });

async function kunde(extra: Record<string, unknown> = {}, websiteInfo: Record<string, string> | null = null) {
  const c = await makeCustomer({ name: `Agentur Impressum ${Date.now()}`, ...extra });
  ids.push(c.id);
  await prisma.onboarding.create({ data: { customerId: c.id, ...(websiteInfo ? { websiteInfo } : {}) } });
  return c.id;
}

async function footer(customerId: string) {
  h.after = [];
  const html = renderToStaticMarkup(await LeadLegalFooter({ customerId }));
  for (const fn of h.after) await fn();
  return html;
}

describe("Impressum fehlt", () => {
  beforeAll(() => requireTestDb());
  beforeEach(() => _resetImpressumFehltCache());
  afterAll(async () => {
    for (const id of ids) {
      await prisma.salesTask.deleteMany({ where: { note: { contains: `Kunden-ID ${id}` } } });
      await cleanupCustomer(id);
    }
  });

  it("Fußzeile: „Anbieterangaben (Erstinformation)“ statt „Impressum“, einmalig eine Admin-Aufgabe", async () => {
    const id = await kunde();
    const html = await footer(id);
    expect(html).toContain("Anbieterangaben (Erstinformation)");
    expect(html).not.toContain(">Impressum<");
    expect(html).toMatch(/href="[^"]*\/erstinformation\/[^"]+"/);
    expect(await tasks(id)).toHaveLength(1);
    // weitere Aufrufe, auch gleichzeitig und ohne Merker im Prozess: keine zweite Aufgabe
    _resetImpressumFehltCache();
    await footer(id);
    _resetImpressumFehltCache();
    await Promise.all([impressumFehltAufgabe(id), impressumFehltAufgabe(id), impressumFehltAufgabe(id)]);
    const t = await tasks(id);
    expect(t).toHaveLength(1);
    expect(t[0].title).toMatch(/^Impressum-URL fehlt: Agentur Impressum/);
    // auch nach dem Erledigen nicht noch einmal (einmalig)
    await prisma.salesTask.update({ where: { id: t[0].id }, data: { doneAt: new Date() } });
    _resetImpressumFehltCache();
    expect(await impressumFehltAufgabe(id)).toBe("skipped");
    expect(await tasks(id)).toHaveLength(1);
  });

  it("mit Impressum: Link „Impressum“ zur Seite des Vermittlers, keine Aufgabe", async () => {
    const id = await kunde({}, { impressumUrl: "https://agentur-muster.de/impressum" });
    const html = await footer(id);
    expect(html).toContain('href="https://agentur-muster.de/impressum"');
    expect(html).toContain(">Impressum<");
    expect(html).not.toContain("Anbieterangaben");
    expect(await tasks(id)).toHaveLength(0);
  });

  it("Testkunde: keine Aufgabe", async () => {
    const id = await kunde({ isTest: true });
    expect(await footer(id)).toContain("Anbieterangaben (Erstinformation)");
    expect(await tasks(id)).toHaveLength(0);
  });

  it("Einrichtung: Adresse nachtragen speichert, behält übrige Angaben und erledigt die offene Aufgabe", async () => {
    const id = await kunde({}, { sourceUrl: "https://agentur-muster.de", privacyUrl: "https://agentur-muster.de/datenschutz" });
    await impressumFehltAufgabe(id);
    expect((await tasks(id))[0].doneAt).toBeNull();
    expect(await impressumUrlSpeichern(id, "kein link")).toMatchObject({ ok: false });
    expect(await impressumUrlSpeichern(id, "agentur-muster.de/impressum")).toEqual({ ok: true, url: "https://agentur-muster.de/impressum" });
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId: id } });
    expect(ob.websiteInfo).toMatchObject({ sourceUrl: "https://agentur-muster.de", privacyUrl: "https://agentur-muster.de/datenschutz", impressumUrl: "https://agentur-muster.de/impressum" });
    expect((await tasks(id))[0].doneAt).not.toBeNull();
    expect(await footer(id)).toContain('href="https://agentur-muster.de/impressum"');
  });
});
