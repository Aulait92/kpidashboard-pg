// Messung der Beratungspräsentation (Ole, 19.11.2026) mit Datenbank: Folie erreicht und Zusage je Termin nur einmal,
// Variante fest je Lead, Zusage auf der Folie und im Kundenlink, Abschlussquote je Präsentation.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { demoAngebote } from "@/lib/demo-beratung";
import { abschlussquoteLaden, ereignisSpeichern, zusageAm } from "@/lib/praesentation-messung";
import { kundenlinkErstellen, kundenlinkPaketWaehlen, kundenlinkTermin, loadKundenPraesentation, loadPraesentation, paketUmschalten } from "@/lib/termin-vorbereitung-server";
import { experimenteCacheLeeren, experimentStats, zuteilen } from "@/lib/experimente";
import { PRAESENTATION_EXPERIMENT } from "@/lib/praesentation-variante";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

// Fassung vor dem 19.11.2026: nur Haftpflicht im Vergleich, die übrigen Sparten per „Mit anschauen“ (diese Tests prüfen
// Paketwahl und Reihenfolge der hinzugefügten Sparten; die Live-Demo hat seitdem drei Sparten im Vergleich)
const nurHaftpflicht = () => {
  const d = demoAngebote();
  return { ...d, items: d.items.map((i) => (i.kombi?.sparte !== "haftpflicht" ? { ...i, zusatz: true, gewaehlt: false } : i)) };
};

let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

async function termin(name = "Dominik Schmid") {
  const lead = await prisma.lead.create({ data: { customerId, name, source: "Privatschutz" } });
  const appt = await prisma.appointment.create({
    data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() - 3600_000), status: "booked", offersJson: nurHaftpflicht() as unknown as Prisma.InputJsonValue, offersConfirmedAt: new Date() },
  });
  return { lead, appt };
}

describe("Präsentation: Messung und Zusage (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    // Diese Tests prüfen Fassung B: Splittest angehalten (Zeile aktiv = false), wie nach „Anhalten“
    await prisma.experiment.upsert({ where: { key: PRAESENTATION_EXPERIMENT }, create: { key: PRAESENTATION_EXPERIMENT, ziel: "zusage", aktiv: false }, update: { aktiv: false } });
    experimenteCacheLeeren();
    customerId = (await makeCustomer({ name: `Agentur Messung ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(async () => {
    await prisma.experiment.deleteMany({ where: { key: PRAESENTATION_EXPERIMENT } });
    experimenteCacheLeeren();
    await cleanupCustomer(customerId);
  });

  it("Folie und Zusage je Termin nur einmal, Variante fest je Lead", async () => {
    const { lead, appt } = await termin();
    const t = { customerId, appointmentId: appt.id, leadId: lead.id };
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "empfehlung" })).toBe(true);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "empfehlung" })).toBe(false);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "<script>" })).toBe(false);
    expect(await zusageAm(appt.id)).toBeNull();
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" })).toBe(true);
    expect(await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" })).toBe(false);
    expect(await zusageAm(appt.id)).toBeInstanceOf(Date);
    const rows = await prisma.praesentationEreignis.findMany({ where: { appointmentId: appt.id } });
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((r) => r.variante))).toEqual(new Set(["B"]));
    // Test „praesentation“ angehalten: keine Zuteilung, alle B, die Zusage zählt nicht
    expect(await prisma.experimentZuteilung.count({ where: { experiment: "praesentation" } })).toBe(0);
  });

  it("Präsentation und Kundenlink kennen Variante, Zusage und Abschluss-Daten", async () => {
    const { lead, appt } = await termin("Julia Neu");
    const p = (await loadPraesentation(appt.id, ctx))!;
    expect(p.variante).toBe("B");
    expect(p.einwaende).toHaveLength(4);
    expect(p.abschluss.produkte).toEqual(["Haftpflicht Komfort"]);
    expect(p.abschluss.summe).toBe(8.4);
    expect(p.folien.map((f) => f.id).includes("risiken")).toBe(false);
    const link = (await kundenlinkErstellen(appt.id, ctx))!;
    const t = (await kundenlinkTermin(link.token))!;
    expect(t).toMatchObject({ appointmentId: appt.id, customerId, leadId: lead.id });
    expect(await kundenlinkTermin("x".repeat(30))).toBeNull();
    await ereignisSpeichern({ ...t, quelle: "kundenlink", art: "zusage" });
    const k = (await loadKundenPraesentation(link.token))!;
    expect(k.zugesagtAm).toBeInstanceOf(Date);
    // Kundenlink ohne Sprechhinweise
    expect(k.folien.every((f) => !("hinweis" in f))).toBe(true);
    expect(k.variante).toBe("B");
    expect(k.folien.find((f) => f.id === "entscheidung")!.html).toContain("✓ Zugesagt");
  });

  it("Abschlussquote je Präsentation: Zusage oder abgeschlossener Kontakt", async () => {
    const { lead, appt } = await termin("Klaus Abschluss");
    await ereignisSpeichern({ customerId, appointmentId: appt.id, leadId: lead.id, quelle: "termin", art: "folie", folie: "beitrag" });
    await prisma.lead.update({ where: { id: lead.id }, data: { closedAt: new Date() } });
    const { appt: ohne, lead: l2 } = await termin("Petra Offen");
    await ereignisSpeichern({ customerId, appointmentId: ohne.id, leadId: l2.id, quelle: "termin", art: "folie", folie: "beitrag" });
    const r = (await abschlussquoteLaden(new Date(Date.now() - 86400_000), customerId))[customerId];
    const summe = (k: "praesentationen" | "abschluesse") => r.A[k] + r.B[k];
    // Termin 1 (Zusage), Klaus (abgeschlossen), Petra (offen); Julia nur Zusage im Link ohne gezeigte Folie
    expect(summe("praesentationen")).toBe(3);
    expect(summe("abschluesse")).toBe(2);
  });
});

describe("Splittest B gegen C (Datenbank)", () => {
  const aus = async () => {
    await prisma.experimentEreignis.deleteMany({ where: { experiment: PRAESENTATION_EXPERIMENT } });
    await prisma.experimentZuteilung.deleteMany({ where: { experiment: PRAESENTATION_EXPERIMENT } });
    await prisma.experiment.deleteMany({ where: { key: PRAESENTATION_EXPERIMENT } });
    experimenteCacheLeeren();
  };
  const anhalten = async () => {
    await prisma.experiment.create({ data: { key: PRAESENTATION_EXPERIMENT, ziel: "zusage", aktiv: false } });
    experimenteCacheLeeren();
  };
  /** Lead, den das Experiment der Fassung b (= C) bzw. a (= B) zuteilt. */
  async function terminFuer(fassung: "a" | "b") {
    for (let k = 0; k < 40; k++) {
      const t = await termin(`Kunde ${fassung} ${k}`);
      if (zuteilen(PRAESENTATION_EXPERIMENT, t.lead.id) === fassung) return t;
    }
    throw new Error("keine Zuteilung gefunden");
  }
  let customerId2 = "";
  let ctx2: typeof ctx;
  beforeAll(async () => {
    requireTestDb();
    await aus();
    customerId = customerId2 = (await makeCustomer({ name: `Agentur Splittest ${Date.now()}` })).id;
    const u = await makeBuyer(customerId2, "owner");
    ctx = ctx2 = { customerId: customerId2, userId: u.id, teamRole: "owner" };
  });
  afterAll(async () => {
    await aus();
    await cleanupCustomer(customerId2);
  });

  it("angehalten (Zeile aktiv = false): alle B, keine Zuteilung", async () => {
    await anhalten();
    const { lead, appt } = await terminFuer("b");
    expect((await loadPraesentation(appt.id, ctx2))!.variante).toBe("B");
    await ereignisSpeichern({ customerId: customerId2, appointmentId: appt.id, leadId: lead.id, quelle: "termin", art: "folie", folie: "empfehlung" });
    expect(await prisma.experimentZuteilung.count({ where: { experiment: PRAESENTATION_EXPERIMENT } })).toBe(0);
    await aus();
  });

  it("ab dem Deploy aktiv (ohne Zeile): C je nach Lead, Zuteilung erst ab gezeigter Folie, Zusage zählt als Ziel", async () => {
    const c = await terminFuer("b");
    const p = (await loadPraesentation(c.appt.id, ctx2))!;
    expect(p.variante).toBe("C");
    expect(p.folien.map((f) => f.id)).not.toContain("beitrag");
    expect(p.folien.find((f) => f.id === "entscheidung")!.html).toContain('data-pakete="2"');
    // Laden und Einstieg teilen nicht zu
    const t = { customerId: customerId2, appointmentId: c.appt.id, leadId: c.lead.id };
    await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "situation" });
    expect(await prisma.experimentZuteilung.count({ where: { experiment: PRAESENTATION_EXPERIMENT, einheit: c.lead.id } })).toBe(0);
    await ereignisSpeichern({ ...t, quelle: "termin", art: "folie", folie: "empfehlung" });
    await ereignisSpeichern({ ...t, quelle: "termin", art: "zusage" });
    const rows = await prisma.praesentationEreignis.findMany({ where: { appointmentId: c.appt.id } });
    expect(new Set(rows.map((r) => r.variante))).toEqual(new Set(["C"]));
    // Fassung a: Standard B
    const b = await terminFuer("a");
    expect((await loadPraesentation(b.appt.id, ctx2))!.variante).toBe("B");
    await ereignisSpeichern({ customerId: customerId2, appointmentId: b.appt.id, leadId: b.lead.id, quelle: "termin", art: "folie", folie: "beitrag" });
    expect(await experimentStats(PRAESENTATION_EXPERIMENT)).toEqual({ a: { n: 1, ziel: 0 }, b: { n: 1, ziel: 1 } });
    // Kundenlink zeigt dieselbe Fassung
    const link = (await kundenlinkErstellen(c.appt.id, ctx2))!;
    expect((await loadKundenPraesentation(link.token))!.variante).toBe("C");
    // Notschalter: alle B
    process.env.EXPERIMENTE_AUS = "1";
    try {
      expect((await loadPraesentation(c.appt.id, ctx2))!.variante).toBe("B");
    } finally {
      delete process.env.EXPERIMENTE_AUS;
    }
  });

  it("Paket wählen im Termin: Auswahl und Kundenlink folgen", async () => {
    const c = await terminFuer("b");
    const vorher = (await loadPraesentation(c.appt.id, ctx2))!;
    expect(vorher.abschluss.produkte).toEqual(["Haftpflicht Komfort"]);
    // Haftpflicht Smart ist Index 1 in den Demo-Angeboten
    const p = (await paketUmschalten(c.appt.id, ctx2, [1]))!;
    expect(p.abschluss.produkte).toEqual(["Haftpflicht Smart"]);
    expect(p.abschluss.summe).toBe(5.9);
    expect(p.folien.find((f) => f.id === "entscheidung")!.html).toContain('data-paket="1" data-paket-art="guenstiger" aria-pressed="true"');
    // Unfall ist nicht gewählt (Cross-Selling): kein Paket
    expect(await paketUmschalten(c.appt.id, ctx2, [9])).toBeNull();
  });

  it("Kundenlink (C): Paket wählen vor der Zusage, nur gezeigte Pakete, nach der Zusage gesperrt, nicht in B", async () => {
    const c = await terminFuer("b");
    const link = (await kundenlinkErstellen(c.appt.id, ctx2))!;
    // nur die gezeigten Pakete (Empfehlung 2, günstiger 1), keine freie Wahl (Basis 0)
    expect(await kundenlinkPaketWaehlen(link.token, [0])).toBeNull();
    expect(await kundenlinkPaketWaehlen("x".repeat(30), [1])).toBeNull();
    const k = (await kundenlinkPaketWaehlen(link.token, [1]))!;
    expect(k.abschluss).toEqual({ summe: 5.9, produkte: ["Haftpflicht Smart"] });
    expect(k.folien.find((f) => f.id === "entscheidung")!.html).toContain('data-paket="1" data-paket-art="guenstiger" aria-pressed="true"');
    // zurück zur Empfehlung geht vor der Zusage
    expect((await kundenlinkPaketWaehlen(link.token, [2]))!.abschluss.produkte).toEqual(["Haftpflicht Komfort"]);
    await kundenlinkPaketWaehlen(link.token, [1]);
    const t = (await kundenlinkTermin(link.token))!;
    await ereignisSpeichern({ ...t, quelle: "kundenlink", art: "zusage" });
    expect(await kundenlinkPaketWaehlen(link.token, [2])).toBeNull();
    // Fassung B: keine Paketwahl im Link
    const b = await terminFuer("a");
    const lb = (await kundenlinkErstellen(b.appt.id, ctx2))!;
    expect(await kundenlinkPaketWaehlen(lb.token, [1])).toBeNull();
  });
});
