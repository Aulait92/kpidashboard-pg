import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { customerSetupOpenCount, openSetupForExisting, restartSetup } from "@/lib/onboarding";
import { requireTestDb } from "./db";

// Einrichtung auch für Bestandskunden ohne Onboarding und nach dem Livegang (Ole, 13.11.2026)
const tag = Math.random().toString(36).slice(2, 8);
const ids: string[] = [];

describe("Einrichtung für Bestandskunden", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  });

  it("ohne Onboarding: nichts offen; nach dem Freischalten offen: Kalender, WhatsApp, Einwilligung – ohne erneutes Anlegen", async () => {
    const c = await prisma.customer.create({ data: { name: `Bestand ${tag}`, plan: "software" } });
    ids.push(c.id);
    expect(await customerSetupOpenCount(c.id)).toBe(0);
    expect(await openSetupForExisting(c.id)).toEqual({ ok: true, created: true });
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(ob.liveAt).not.toBeNull(); // keine Erinnerungen / keine „hängt“-Hinweise
    const open = await customerSetupOpenCount(c.id);
    expect(open).toBeGreaterThanOrEqual(2); // Kalender + Einwilligung (+ WhatsApp, wenn Selbst-Verbinden aktiv)
    expect(open).toBeLessThanOrEqual(3);
    expect(await openSetupForExisting(c.id)).toEqual({ ok: true, created: false });
  });

  it("Nur-Betreuung: nach dem Livegang nichts offen", async () => {
    const c = await prisma.customer.create({ data: { name: `Service ${tag}`, plan: "service" } });
    ids.push(c.id);
    await openSetupForExisting(c.id);
    expect(await customerSetupOpenCount(c.id)).toBe(0);
  });
});

describe("Einrichtung neu starten (Paketwechsel)", () => {
  const ids2: string[] = [];
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    await prisma.customer.deleteMany({ where: { id: { in: ids2 } } });
  });

  it("Fragebogen und Einwilligung wieder offen, Meta/Kampagne/Livegang bleiben, Kunde sieht offene Schritte", async () => {
    const c = await prisma.customer.create({ data: { name: `Neustart ${Math.random().toString(36).slice(2, 8)}`, plan: "software" } });
    ids2.push(c.id);
    const done = new Date("2026-10-01");
    await prisma.onboarding.create({
      data: {
        customerId: c.id, package: "software", status: "running", welcomeSentAt: done, questionnaireAt: done, metaAccessAt: done,
        websiteCheckedAt: done, campaignReadyAt: done, testLeadAt: done, liveAt: done, consentAt: done,
      },
    });
    const vorher = await customerSetupOpenCount(c.id);
    expect(await restartSetup(c.id)).toEqual({ ok: true });
    const ob = await prisma.onboarding.findUniqueOrThrow({ where: { customerId: c.id } });
    expect(ob.questionnaireAt).toBeNull();
    expect(ob.consentAt).toBeNull();
    expect(ob.metaAccessAt?.toISOString()).toBe(done.toISOString());
    expect(ob.liveAt?.toISOString()).toBe(done.toISOString());
    // Fragebogen + Einwilligung kommen dazu (Kalender/WhatsApp waren schon offen)
    expect(await customerSetupOpenCount(c.id)).toBe(vorher + 2);
  });
});
