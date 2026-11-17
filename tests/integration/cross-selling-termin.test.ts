// Cross-Selling im Termin (Ole, 16.11.2026) mit Datenbank: Vorschlag „Ihr Schutz im Überblick“ beim ersten Laden
// (Formular, Chat, Verträge bei uns), Speichern mit Kombi-Regeln, Präsentation mit Überblick und Kombi-Rabatt,
// „Mit anschauen“ im Termin; ältere ausgelesene Angebote bleiben ohne Überblick.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import { ladeTarifvorbereitung, tarifauswahlSpeichern } from "@/lib/tarifauswahl-server";
import { loadPraesentation, loadVorbereitung, sparteUmschalten } from "@/lib/termin-vorbereitung-server";
import { beitragAus, cleanAngebote } from "@/lib/angebote-daten";
import { sparteNeu, type Tarifauswahl } from "@/lib/tarifauswahl";
import { demoTarife } from "@/lib/demo-beratung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

/** Empfehlung je Sparte auf Komfort (zählt zum Kombi-Rabatt der Allianz) */
const komfort = (a: Tarifauswahl) => a.sparten.forEach((sp) => (sp.empfohlen = sp.tarife.find((t) => t.kurz === "Komfort")!.id));

async function termin(extra: Record<string, unknown> = {}) {
  const lead = await prisma.lead.create({
    data: {
      customerId,
      name: "Dominik Schmid",
      source: "Privatschutz",
      formData: [
        { label: "Versicherungsinteresse", value: "Haftpflicht, Hausrat" },
        { label: "Bestehende Versicherungen", value: "Rechtsschutz bei ARAG" },
      ],
    },
  });
  const appt = await prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "video", startsAt: new Date(Date.now() + 86400000), status: "booked", ...extra } });
  return { appt, lead };
}

describe("Cross-Selling im Termin (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Allianz Agentur Kombi ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(() => cleanupCustomer(customerId));

  it("erster Aufruf schlägt den Überblick vor (woanders, Vertrag bei uns, prüfen); gespeichert mit Kombi-Regel und Überblick", async () => {
    const { appt, lead } = await termin();
    await prisma.leadContract.create({ data: { leadId: lead.id, customerId, sparte: "unfall", signedAt: new Date("2026-03-10T10:00:00Z"), status: "aktiv" } });
    const d = (await loadVorbereitung(appt.id, ctx))!;
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.schutzNeu).toBe(true);
    const st = Object.fromEntries((tv.auswahl.schutz ?? []).map((s) => [s.key, s.status]));
    expect(st).toMatchObject({ haftpflicht: "pruefen", hausrat: "pruefen", rechtsschutz: "woanders", unfall: "bei-uns" });
    expect(tv.auswahl.schutz?.slice(0, 2).map((s) => s.key)).toEqual(["haftpflicht", "hausrat"]);

    // Beiträge der Komfort-Empfehlungen (die Testdaten empfehlen bei Haftpflicht Smart, das zählt nicht): 2 Verträge = 5 %
    const a = tv.auswahl;
    komfort(a);
    for (const [i, b] of [8.4, 9.8].entries()) a.sparten[i].tarife.find((t) => t.id === a.sparten[i].empfohlen)!.beitrag = b;
    expect((await tarifauswahlSpeichern(appt.id, ctx, a)).ok).toBe(true);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true, tarifauswahl: true } });
    const ang = cleanAngebote(row.offersJson);
    expect(ang.kombi?.map((r) => [r.gruppe, r.name])).toEqual([["allianz", "Allianz PrivatSchutz"]]);
    expect(ang.schutz?.map((z) => z.key)).toEqual(expect.arrayContaining(["haftpflicht", "hausrat", "rechtsschutz", "unfall"]));
    expect(beitragAus(ang)).toMatchObject({ einzelSumme: 18.2, rabatt: { prozent: 5, euro: 0.91 }, endbeitrag: 17.29 });

    // zweiter Aufruf: gespeicherter Überblick, kein neuer Vorschlag
    const tv2 = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv2.schutzNeu).toBe(false);

    // Präsentation: Überblick vor dem Beitrag, Beitrag mit Kombi-Rabatt und § 7a VVG
    const p = (await loadPraesentation(appt.id, ctx))!;
    const ids = p.folien.map((f) => f.id);
    expect(ids.indexOf("ueberblick")).toBe(ids.indexOf("beitrag") - 1);
    const u = p.folien.find((f) => f.id === "ueberblick")!.html;
    expect(u).toContain('data-schutz="rechtsschutz" data-status="woanders"');
    expect(u).toContain("Wechsel-Service");
    expect(u).toContain('data-schutz="unfall" data-status="bei-uns"');
    const b = p.folien.find((f) => f.id === "beitrag")!.html;
    expect(b).toContain("17,29");
    expect(b).toContain("Allianz PrivatSchutz: Kombi-Rabatt ab 2 Verträgen der Linie Komfort oder Premium, Laufzeit 3 Jahre. Die Versicherungen sind auch einzeln abschließbar.");
  });

  it("„bei Bedarf“ vorbereitete Sparte: erst im Überblick, „Mit anschauen“ im Termin nimmt sie in Vergleich und Rabatt", async () => {
    const { appt } = await termin();
    const d = (await loadVorbereitung(appt.id, ctx))!;
    const a = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!.auswahl;
    const rs = sparteNeu(k, "rechtsschutz", { rolle: "vertreter", gesellschaften: ["allianz"] })!;
    rs.zusatz = true;
    a.sparten.push(rs);
    komfort(a);
    for (const sp of a.sparten) sp.tarife.find((t) => t.id === sp.empfohlen)!.beitrag = { haftpflicht: 8.4, hausrat: 9.8, rechtsschutz: 18.03 }[sp.key] ?? null;
    await tarifauswahlSpeichern(appt.id, ctx, a);
    const vorher = (await loadPraesentation(appt.id, ctx))!;
    expect(vorher.folien.some((f) => f.id.startsWith("vergleich-rechtsschutz"))).toBe(false);
    expect(vorher.folien.find((f) => f.id === "ueberblick")!.html).toContain("Mit anschauen");
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } });
    const idx = cleanAngebote(row.offersJson).items.findIndex((i) => i.sparte === "Rechtsschutz");
    const nachher = (await sparteUmschalten(appt.id, ctx, idx))!;
    expect(nachher.folien.some((f) => f.id.startsWith("vergleich-rechtsschutz"))).toBe(true);
    const ang = cleanAngebote((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { offersJson: true } })).offersJson);
    expect(beitragAus(ang)).toMatchObject({ einzelSumme: 36.23, rabatt: { prozent: 10, euro: 3.63 }, endbeitrag: 32.6 });
  });

  it("älterer Termin mit ausgelesenen Angeboten: kein Überblick, Präsentation unverändert", async () => {
    const { appt } = await termin({ offersJson: demoTarife(), offersConfirmedAt: new Date() });
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, (await loadVorbereitung(appt.id, ctx))!, k))!;
    expect(tv.quelle).toBe("angebote");
    expect(tv.schutzNeu).toBe(false);
    expect(tv.auswahl.schutz).toBeUndefined();
    expect((await loadPraesentation(appt.id, ctx))!.folien.some((f) => f.id === "ueberblick")).toBe(false);
  });
});
