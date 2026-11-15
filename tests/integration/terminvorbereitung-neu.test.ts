// Neue Terminvorbereitung (Ole, 15.11.2026): Laden (Vorauswahl bzw. ältere Angebote), Autosave mit Angeboten für die
// Präsentation, „Meine Merkmale“, abgehakte Punkte, Gesellschaft, eigene Tarife; ältere Abläufe setzen zurück.
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { ladeTarifkatalog } from "@/lib/tarifkatalog-laden";
import {
  eigenenTarifAnlegen,
  gesellschaftenSpeichern,
  klaerenSpeichern,
  ladeTarifvorbereitung,
  tarifauswahlSpeichern,
  vertriebFuer,
} from "@/lib/tarifauswahl-server";
import { angeboteSpeichern, loadPraesentation, loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { demoAngebote } from "@/lib/demo-beratung";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

const k = ladeTarifkatalog(path.join(__dirname, "..", "fixtures", "tarifkatalog"));
let customerId = "";
let ctx: { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };

async function termin(extra: Record<string, unknown> = {}) {
  const lead = await prisma.lead.create({
    data: { customerId, name: "Verena Martin", source: "Privatschutz", formData: [{ label: "Versicherungsinteresse", value: "Hausrat, Rechtsschutz" }] },
  });
  return prisma.appointment.create({ data: { customerId, leadId: lead.id, mode: "phone", startsAt: new Date(Date.now() + 86400000), status: "booked", ...extra } });
}

describe("Neue Terminvorbereitung (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    customerId = (await makeCustomer({ name: `Allianz Agentur Test ${Date.now()}` })).id;
    const u = await makeBuyer(customerId, "owner");
    ctx = { customerId, userId: u.id, teamRole: "owner" };
  });
  afterAll(() => cleanupCustomer(customerId));

  it("Vertreter: Gesellschaft aus dem Namen, sonst einmal gewählt; Makler ohne feste Gesellschaft", async () => {
    expect(await vertriebFuer(customerId)).toEqual({ vertrieb: { rolle: "vertreter", gesellschaften: ["allianz"] }, gesellschaftFehlt: false });
    const ohne = await makeCustomer({ name: `Agentur Ohne ${Date.now()}` });
    expect((await vertriebFuer(ohne.id)).gesellschaftFehlt).toBe(true);
    await gesellschaftenSpeichern({ customerId: ohne.id, userId: null, teamRole: "owner" }, ["axa", "Unsinn!"]);
    expect((await vertriebFuer(ohne.id)).vertrieb.gesellschaften).toEqual(["axa"]);
    const makler = await makeCustomer({ name: `Makler ${Date.now()}`, vermittlerTyp: "makler" });
    expect((await vertriebFuer(makler.id)).vertrieb).toEqual({ rolle: "makler", gesellschaften: [] });
    await cleanupCustomer(ohne.id);
    await cleanupCustomer(makler.id);
  });

  it("neuer Termin: Vorauswahl aus dem Formular; Autosave schreibt Auswahl, Angebote und „Meine Merkmale“", async () => {
    const appt = await termin();
    const d = (await loadVorbereitung(appt.id, ctx))!;
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv.quelle).toBe("neu");
    expect(tv.auswahl.sparten.map((s) => s.key)).toEqual(["hausrat", "rechtsschutz"]);
    expect(tv.auswahl.sparten[0].tarife.map((t) => t.kurz)).toEqual(["Smart", "Komfort", "Premium"]);
    expect(tv.katalog.tarife.every((t) => t.gesellschaft === "allianz")).toBe(true);

    const a = tv.auswahl;
    a.sparten[0].tarife[1].beitrag = 11.4;
    a.sparten[0].merkmale = ["online-betrug", "elementar"];
    const r = await tarifauswahlSpeichern(appt.id, ctx, a);
    expect(r.ok).toBe(true);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { tarifauswahl: true, offersJson: true, offersConfirmedAt: true } });
    expect(row.offersConfirmedAt).not.toBeNull();
    expect((row.offersJson as { items: { tarif: string; beitragMonat: number | null; empfohlen: boolean }[] }).items.filter((i) => i.empfohlen).map((i) => [i.tarif, i.beitragMonat])).toEqual([
      ["Komfort", 11.4],
      ["Komfort", null],
    ]);
    // erneut laden: gespeicherter Stand
    const tv2 = (await ladeTarifvorbereitung(appt.id, ctx, d, k))!;
    expect(tv2.quelle).toBe("gespeichert");
    expect(tv2.auswahl.sparten[0].tarife[1].beitrag).toBe(11.4);
    // nächster Termin: „Meine Merkmale“ als Vorauswahl
    expect(tv2.meine.hausrat?.merkmale).toEqual(["online-betrug", "elementar"]);
    const appt2 = await termin();
    const tv3 = (await ladeTarifvorbereitung(appt2.id, ctx, (await loadVorbereitung(appt2.id, ctx))!, k))!;
    expect(tv3.auswahl.sparten[0].merkmale).toEqual(["online-betrug", "elementar"]);
    // Präsentation zeigt den gespeicherten Stand
    const p = (await loadPraesentation(appt.id, ctx))!;
    expect(p.angeboteBestaetigt).toBe(true);
    expect(p.folien.some((f) => f.id.startsWith("vergleich-hausrat") && f.html.includes("11,40"))).toBe(true);
  });

  it("älterer Termin mit ausgelesenen Angeboten: wird gelesen, nicht überschrieben; Präsentation unverändert", async () => {
    const alt = demoAngebote();
    const appt = await termin({ offersJson: alt, offersConfirmedAt: new Date() });
    const vorher = (await loadPraesentation(appt.id, ctx))!.folien.map((f) => f.html);
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, (await loadVorbereitung(appt.id, ctx))!, k))!;
    expect(tv.quelle).toBe("angebote");
    expect(tv.auswahl.sparten.map((s) => s.tarife.length)).toEqual([3, 2, 4]);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { tarifauswahl: true, offersJson: true } });
    expect(row.tarifauswahl).toBeNull();
    expect(row.offersJson).toEqual(JSON.parse(JSON.stringify(alt)));
    expect((await loadPraesentation(appt.id, ctx))!.folien.map((f) => f.html)).toEqual(vorher);
  });

  it("alter Angebote-Editor speichert: Tarifauswahl gilt nicht mehr", async () => {
    const appt = await termin();
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, (await loadVorbereitung(appt.id, ctx))!, k))!;
    await tarifauswahlSpeichern(appt.id, ctx, tv.auswahl);
    await angeboteSpeichern(appt.id, ctx, demoAngebote(), true);
    const row = await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id }, select: { tarifauswahl: true } });
    expect(row.tarifauswahl).toBeNull();
  });

  it("abgehakte Punkte, eigene Tarife; fremde Termine bleiben unberührt", async () => {
    const appt = await termin();
    expect(await klaerenSpeichern(appt.id, ctx, ["Adresse und PLZ", "Adresse und PLZ"])).toBe(true);
    expect((await prisma.appointment.findUniqueOrThrow({ where: { id: appt.id } })).klaerenErledigt).toEqual(["Adresse und PLZ"]);
    const e = await eigenenTarifAnlegen(ctx, { sparte: "hausrat", gesellschaft: "Uelzener", name: "Hausrat Exklusiv Plus Komfort", werte: { elementar: "ja", unbekannt: "x" } }, k);
    expect(e).toMatchObject({ gesellschaft: "Uelzener", werte: { elementar: "ja" } });
    expect(e!.kurz.length).toBeLessThanOrEqual(18);
    const tv = (await ladeTarifvorbereitung(appt.id, ctx, (await loadVorbereitung(appt.id, ctx))!, k))!;
    expect(tv.eigene.map((x) => x.id)).toContain(e!.id);
    expect(tv.klaerenErledigt).toEqual(["Adresse und PLZ"]);

    const fremd = await makeCustomer();
    const fctx = { customerId: fremd.id, userId: null, teamRole: "owner" as const };
    expect(await klaerenSpeichern(appt.id, fctx, ["x"])).toBe(false);
    expect((await tarifauswahlSpeichern(appt.id, fctx, tv.auswahl)).ok).toBe(false);
    expect(await ladeTarifvorbereitung(appt.id, fctx, (await loadVorbereitung(appt.id, ctx))!, k)).toBeNull();
    await cleanupCustomer(fremd.id);
  });
});
