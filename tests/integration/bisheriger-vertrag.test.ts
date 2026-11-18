// Vergleich mit dem bisherigen Vertrag (Paket P3b) mit Datenbank: Vorschlag aus Chat (Lead.vorvertraege) und Police
// (PolicenAuszug), Speichern mit Spalte in den Angeboten, Präsentation mit Beitragsunterschied und Kündigung, von Hand
// Eingetragenes bleibt, gelöschte Unterlage nimmt die Spalte heraus, Gesundheitssparten erst nach Freischaltung.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { ladeTarifvorbereitung, tarifauswahlSpeichern } from "@/lib/tarifauswahl-server";
import { loadPraesentation, loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { cleanAngebote } from "@/lib/angebote-daten";
import { cleanTarifauswahl, sparteNeu } from "@/lib/tarifauswahl";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };
const nb = (s: string) => s.replace(/ /g, " ");

async function termin(vorvertraege?: unknown) {
  const lead = await prisma.lead.create({
    data: {
      customerId,
      name: "Julia Becker",
      source: "Privatschutz",
      formData: [{ label: "Versicherungsinteresse", value: "Hausrat" }],
      ...(vorvertraege ? { vorvertraege: vorvertraege as object } : {}),
    },
  });
  const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date("2026-11-20T09:00:00Z"), status: "booked" } });
  return { appt, lead };
}

async function police(leadId: string, sparte: string, felder: Record<string, string | number | boolean>) {
  const doc = await prisma.leadDocument.create({ data: { customerId, leadId, status: "gespeichert", mimeType: "application/pdf", fileName: "police.pdf", size: 1, sparte } });
  await prisma.policenAuszug.create({
    data: {
      customerId,
      leadId,
      documentId: doc.id,
      status: "ausgelesen",
      sparte,
      versuche: 1,
      ausgelesenAt: new Date(),
      felder: Object.fromEntries(Object.entries(felder).map(([key, w]) => [key, { w, s: "ok" }])),
    },
  });
  return doc;
}

describe("Bisheriger Vertrag (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Allianz Agentur Bisher ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(() => cleanupCustomer(customerId));

  it("ohne Police: Tarif aus dem Chat mit Katalog-Treffer, dann die Police; gespeichert und auf der Folie", async () => {
    const { appt, lead } = await termin({ at: "2026-11-17T10:00:00Z", liste: [{ sparte: "Hausrat", gesellschaft: "AXA", tarif: "Komfort" }] });
    const d = (await loadVorbereitung(appt.id, ctx))!;
    let tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.bisherNeu).toBe(true);
    expect(tv.gesundheitFrei).toBe(false);
    const hausrat = tv.auswahl.sparten.find((s) => s.key === "hausrat")!;
    expect(hausrat.bisher).toMatchObject({ quelle: "chat", gesellschaft: "AXA", katalogId: "axa/hausrat/komfort", beitrag: null });

    // Police kommt: Werte der Police gehen vor, Katalog-Treffer bleibt
    await police(lead.id, "hausrat", { versicherer: "AXA Versicherung AG", tarifname: "Hausrat Komfort", beitrag: 120, zahlweise: "jaehrlich", selbstbeteiligung: 150, ablauf: "2025-03-01", kuendigungsfrist_monate: 3 });
    tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.bisherNeu).toBe(true);
    const a = tv.auswahl;
    const sp = a.sparten.find((s) => s.key === "hausrat")!;
    expect(sp.bisher).toMatchObject({ quelle: "police", katalogId: "axa/hausrat/komfort", beitrag: 120, zahlweise: "jahr", sb: 150, ungeprueft: true });
    sp.tarife.forEach((t, i) => (t.beitrag = 8 + i));
    expect((await tarifauswahlSpeichern(appt.id, ctx, a)).ok).toBe(true);

    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } });
    expect(cleanAngebote(row.offersJson).bisher?.[0]).toMatchObject({ sparte: "Hausrat", gesellschaft: "AXA", tarif: "Komfort", beitragMonat: 10 });
    // zweiter Aufruf: nichts Neues
    expect((await ladeTarifvorbereitung(appt.id, ctx, d, k))!.bisherNeu).toBe(false);

    const p = (await loadPraesentation(appt.id, ctx))!;
    const f = p.folien.find((x) => x.id.startsWith("vergleich-"))!;
    const html = nb(f.html);
    expect(html).toContain("Ihr bisheriger Vertrag");
    expect(html).toMatch(/Ihr gewählter Tarif: <b>[\d,]+ € (weniger|mehr) im Jahr als bisher<\/b>/);
    expect(html).toContain("kündbar zum 01.03.2027 (Kündigung bis 01.12.2026)");
    expect(html).not.toMatch(/[–—]/);
  });

  it("von Hand eingetragen bleibt; ausgeblendet bleibt aus; gelöschte Unterlage nimmt die Spalte aus der Police heraus", async () => {
    const { appt, lead } = await termin();
    const d = (await loadVorbereitung(appt.id, ctx))!;
    const doc = await police(lead.id, "hausrat", { versicherer: "VHV", beitrag: 9, zahlweise: "monatlich" });
    let tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    const a = tv.auswahl;
    a.sparten[0].bisher!.zeigen = false;
    expect((await tarifauswahlSpeichern(appt.id, ctx, a)).ok).toBe(true);
    tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.auswahl.sparten[0].bisher).toMatchObject({ quelle: "police", zeigen: false });
    expect(cleanAngebote((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } })).offersJson).bisher).toBeUndefined();

    // Unterlage gelöscht (Löschfrist): Spalte aus der Police verschwindet
    await prisma.leadDocument.delete({ where: { id: doc.id } });
    tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.bisherNeu).toBe(true);
    expect(tv.auswahl.sparten[0].bisher).toBeUndefined();

    // von Hand: bleibt, auch wenn wieder eine Police kommt
    const b = tv.auswahl;
    b.sparten[0].bisher = { quelle: "hand", zeigen: null, gesellschaft: "DEVK", tarif: null, katalogId: null, werte: {}, beitrag: 14, zahlweise: "monat", summe: 50000, sb: null, ablauf: null, kuendbarZum: null, fristMonate: null };
    expect((await tarifauswahlSpeichern(appt.id, ctx, b)).ok).toBe(true);
    await police(lead.id, "hausrat", { versicherer: "VHV", beitrag: 9, zahlweise: "monatlich" });
    tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.bisherNeu).toBe(false);
    expect(tv.auswahl.sparten[0].bisher).toMatchObject({ quelle: "hand", gesellschaft: "DEVK", beitrag: 14 });
  });

  it("Gesundheitssparte: ohne Freischaltung wird der bisherige Vertrag nicht gespeichert, mit Freischaltung schon", async () => {
    const { appt } = await termin();
    const d = (await loadVorbereitung(appt.id, ctx))!;
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    const a = tv.auswahl;
    const bu = sparteNeu(ladeTarifkatalog(), "bu", { rolle: "vertreter", gesellschaften: ["allianz"] })!;
    bu.bisher = { quelle: "hand", zeigen: null, gesellschaft: "Alte Leipziger", tarif: null, katalogId: null, werte: {}, beitrag: 80, zahlweise: "monat", summe: null, sb: null, ablauf: null, kuendbarZum: null, fristMonate: null };
    a.sparten.push(bu);
    const ohne = await tarifauswahlSpeichern(appt.id, ctx, a);
    expect(ohne.ok && ohne.auswahl.sparten.find((s) => s.key === "bu")?.bisher).toBeUndefined();

    await prisma.customer.update({ where: { id: customerId }, data: { policenIntern: true } });
    const mit = await tarifauswahlSpeichern(appt.id, ctx, a);
    expect(mit.ok && mit.auswahl.sparten.find((s) => s.key === "bu")?.bisher?.beitrag).toBe(80);
    const gespeichert = cleanTarifauswahl((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { tarifauswahl: true } })).tarifauswahl)!;
    expect(gespeichert.sparten.find((s) => s.key === "bu")?.bisher?.gesellschaft).toBe("Alte Leipziger");
    await prisma.customer.update({ where: { id: customerId }, data: { policenIntern: false } });
  });
});
