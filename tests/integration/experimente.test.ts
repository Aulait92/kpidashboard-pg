// Splittests der Lead-Reise (lib/experimente.ts) gegen die Datenbank: Zuteilung einmal je Einheit, Ereignisse nur mit
// Zuteilung, Ziel für alle Tests eines Leads, automatischer Gewinner mit Audit, Diagnose ohne Einheiten-IDs; dazu die
// Diagnose q=journey.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ereignis, experimenteCacheLeeren, experimentStats, experimenteDiagnose, experimenteUebersicht, promoteExperimentWinners, variante, zielErreicht, zuteilen } from "@/lib/experimente";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { journeyDiagnose } from "@/lib/ops/journey";

const leer = async () => {
  await prisma.experimentEreignis.deleteMany({});
  await prisma.experimentZuteilung.deleteMany({});
  await prisma.experiment.deleteMany({});
  experimenteCacheLeeren();
};

describe("Experimente (Datenbank)", () => {
  beforeAll(() => requireTestDb());
  beforeEach(leer);
  afterAll(leer);

  it("variante: fest, einmal zugeteilt; merken: false schreibt nichts; unbekannt bzw. ohne Einheit: a", async () => {
    const v = await variante("komplettcheck_text", "lead_x");
    expect(v).toBe(zuteilen("komplettcheck_text", "lead_x"));
    expect(await variante("komplettcheck_text", "lead_x")).toBe(v);
    expect(await prisma.experimentZuteilung.count({ where: { experiment: "komplettcheck_text" } })).toBe(1);
    await variante("komplettcheck_text", "lead_y", { merken: false });
    expect(await prisma.experimentZuteilung.count({ where: { einheit: "lead_y" } })).toBe(0);
    expect(await variante("gibt_es_nicht", "lead_x")).toBe("a");
    expect(await variante("komplettcheck_text", null)).toBe("a");
  });

  it("ereignis nur mit Zuteilung und einmal je Ziel; zielErreicht für alle passenden Tests", async () => {
    await ereignis("komplettcheck_text", "lead_ohne", "komplettcheck_ja");
    expect(await prisma.experimentEreignis.count()).toBe(0);
    await variante("komplettcheck_text", "lead_1");
    await variante("terminvorschlag_kostenlos", "lead_1");
    await zielErreicht(["lead_1", null], "termin_gebucht");
    await zielErreicht(["lead_1"], "termin_gebucht");
    await zielErreicht(["lead_1"], "komplettcheck_ja");
    const e = await prisma.experimentEreignis.findMany({ orderBy: { experiment: "asc" }, select: { experiment: true, ziel: true } });
    expect(e).toEqual([
      { experiment: "komplettcheck_text", ziel: "komplettcheck_ja" },
      { experiment: "terminvorschlag_kostenlos", ziel: "termin_gebucht" },
    ]);
  });

  it("Stats, Gewinner mit Audit, danach alle mit dem Gewinner", async () => {
    // 60 Einheiten je Fassung: a 20 %, b 60 % Komplettcheck ja
    const ids = Array.from({ length: 400 }, (_, i) => `l${i}`);
    const a = ids.filter((id) => zuteilen("komplettcheck_text", id) === "a").slice(0, 60);
    const b = ids.filter((id) => zuteilen("komplettcheck_text", id) === "b").slice(0, 60);
    for (const id of [...a, ...b]) await variante("komplettcheck_text", id);
    for (const id of [...a.slice(0, 12), ...b.slice(0, 36)]) await ereignis("komplettcheck_text", id, "komplettcheck_ja");
    const s = await experimentStats("komplettcheck_text");
    expect(s).toEqual({ a: { n: 60, ziel: 12 }, b: { n: 60, ziel: 36 } });
    const r = await promoteExperimentWinners(new Date());
    expect(r).toEqual([{ key: "komplettcheck_text", winner: "b" }]);
    expect(await promoteExperimentWinners(new Date())).toEqual([]);
    const log = await prisma.auditLog.findFirst({ where: { action: "experiment.gewinner", entityId: "komplettcheck_text" } });
    expect(log).not.toBeNull();
    // Nach der Entscheidung: alle bekommen b, ohne neue Zuteilung
    const vorher = await prisma.experimentZuteilung.count();
    expect(await variante("komplettcheck_text", a[0])).toBe("b");
    expect(await variante("komplettcheck_text", "ganz_neu")).toBe("b");
    expect(await prisma.experimentZuteilung.count()).toBe(vorher);
    const d = await experimenteDiagnose();
    const k = d.experimente.find((x) => x.key === "komplettcheck_text")!;
    expect(k.fassungB.quoteProzent).toBe(60);
    expect(k.stand).toBe("entschieden: B");
    expect(JSON.stringify(d)).not.toMatch(/"l\d+"/);
  });
});

describe("Diagnose q=journey (Datenbank)", () => {
  let customerId = "";
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
    const l1 = await prisma.lead.create({ data: { customerId, name: "Lea Lead", phone: "+491511111111", source: "Privatschutz", status: "Neuer Lead" } });
    await prisma.lead.create({ data: { customerId, name: "Ohne Antwort", phone: "+491511111112", source: "Privatschutz", status: "Neuer Lead" } });
    const conv = await prisma.conversation.create({ data: { customerId, contactPhone: "+491511111111", leadId: l1.id } });
    await prisma.message.createMany({
      data: [
        { conversationId: conv.id, direction: "inbound", body: "Hallo" },
        { conversationId: conv.id, direction: "internal", kind: "termin_vorschlag", body: "{}" },
      ],
    });
    await prisma.appointment.create({ data: { customerId, leadId: l1.id, conversationId: conv.id, mode: "video", startsAt: new Date(Date.now() + 86_400_000), bookedVia: "bot", komplettcheck: true } });
  });
  afterAll(async () => {
    await prisma.appointment.deleteMany({ where: { customerId } });
    await prisma.conversation.deleteMany({ where: { customerId } });
    await prisma.lead.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  it("zählt die Stufen je Vermittler, ohne Namen oder Nummern", async () => {
    const d = await journeyDiagnose(new URLSearchParams("tage=7"));
    const v = d.jeVermittler.find((x) => x.customerId === customerId)!;
    expect([v.leads, v.ersteAntwort, v.vorschlagErhalten, v.gebucht, v.komplettcheckJa]).toEqual([2, 1, 1, 1, 1]);
    expect(v.quoten.terminJeLead).toBe(50);
    const json = JSON.stringify(d);
    expect(json).not.toContain("Lea Lead");
    expect(json).not.toContain("+49151");
  });
});

describe("Reife-Filter termin_zusage (nur Termine, die mindestens 1 Tag vorbei oder abgesagt sind)", () => {
  let customerId = "";
  const DAY = 86_400_000;
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer()).id;
  });
  beforeEach(leer);
  afterAll(async () => {
    await leer();
    await prisma.appointment.deleteMany({ where: { customerId } });
    await prisma.lead.deleteMany({ where: { customerId } });
    await cleanupCustomer(customerId);
  });

  /** Lead in Fassung v mit Termin (startsIn relativ zu jetzt, Status), zugeteilt wie bei der Buchung im Chat. */
  async function leadMitTermin(v: "a" | "b", startsIn: number | null, status = "booked", isTest = false) {
    let id = "";
    do id = `reif${Math.random().toString(36).slice(2, 12)}`;
    while (zuteilen("termin_zusage", id) !== v);
    await prisma.lead.create({ data: { id, customerId, name: "Lea Reif", phone: `+4915${Math.floor(Math.random() * 1e9)}`, source: "Privatschutz", status: "Termin", isTest } });
    expect(await variante("termin_zusage", id)).toBe(v);
    if (startsIn !== null) await prisma.appointment.create({ data: { customerId, leadId: id, mode: "video", status, startsAt: new Date(Date.now() + startsIn), bookedVia: "bot" } });
    return id;
  }

  it("künftige und weniger als 1 Tag alte Termine zählen nicht; vorbei bzw. abgesagt zählen; Testleads nie", async () => {
    const vorbeiDa = await leadMitTermin("a", -2 * DAY);
    await zielErreicht([vorbeiDa], "erschienen");
    await leadMitTermin("a", -3 * DAY); // vorbei, nicht erschienen
    await leadMitTermin("a", 2 * DAY); // kommt noch: zählt nicht (sonst „nicht erschienen“)
    await leadMitTermin("a", -12 * 3600_000); // erst 12 Std. vorbei: zählt noch nicht
    await leadMitTermin("b", 5 * DAY, "cancelled"); // abgesagt: zählt sofort (nicht erschienen)
    await leadMitTermin("b", -2 * DAY, "no_show");
    const daB = await leadMitTermin("b", -2 * DAY, "completed");
    await zielErreicht([daB], "erschienen");
    await leadMitTermin("b", null); // ohne Termin: zählt nicht
    await leadMitTermin("b", -2 * DAY, "booked", true); // Testlead: nie
    expect(await prisma.experimentZuteilung.count({ where: { experiment: "termin_zusage" } })).toBe(9);
    expect(await experimentStats("termin_zusage")).toEqual({ a: { n: 2, ziel: 1 }, b: { n: 3, ziel: 1 } });
    // Drei Tage später ist der künftige Termin 1 Tag vorbei (ohne erschienen), der 12-Stunden-Termin auch
    expect(await experimentStats("termin_zusage", new Date(Date.now() + 3 * DAY + 3600_000))).toEqual({ a: { n: 4, ziel: 1 }, b: { n: 3, ziel: 1 } });
    // Verschoben: alter Termin abgesagt, neuer kommt noch → nicht reif
    const verschoben = await leadMitTermin("b", 5 * DAY, "cancelled");
    await prisma.appointment.create({ data: { customerId, leadId: verschoben, mode: "video", status: "booked", startsAt: new Date(Date.now() + 6 * DAY), bookedVia: "bot" } });
    expect((await experimentStats("termin_zusage")).b.n).toBe(3);
    // Entscheidung und Admin-Übersicht zählen dieselben Einheiten
    const u = (await experimenteUebersicht()).find((e) => e.key === "termin_zusage")!;
    expect(u.stats).toEqual({ a: { n: 2, ziel: 1 }, b: { n: 3, ziel: 1 } });
    expect(u.min).toBe(150);
    expect(await promoteExperimentWinners(new Date())).toEqual([]);
  });

  it("Gewinner erst mit genug reifen Einheiten: 150 je Fassung mit künftigen Terminen entscheiden nichts", async () => {
    for (let i = 0; i < 150; i++) await leadMitTermin("a", 3 * DAY);
    for (let i = 0; i < 150; i++) {
      const id = await leadMitTermin("b", 3 * DAY);
      if (i < 120) await zielErreicht([id], "erschienen");
    }
    expect(await experimentStats("termin_zusage")).toEqual({ a: { n: 0, ziel: 0 }, b: { n: 0, ziel: 0 } });
    expect(await promoteExperimentWinners(new Date())).toEqual([]);
  }, 120_000);
});
