// Tarifkatalog lernt aus Einträgen der Vermittler (Ole, 18.11.2026): Erfassen beim eigenen Tarif und beim bisherigen
// Vertrag (Autosave), nur Katalogbezug, Testkonten zählen nicht, „Empfohlen“ ab 3 Vermittlern, Übernehmen wirkt sofort
// auf Katalog, Vergleichsfolie und gespeicherte Auswahl, Ablehnen, Zurücknehmen, Export, Diagnose.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { eigenenTarifAnlegen, ladeTarifvorbereitung, tarifauswahlSpeichern } from "@/lib/tarifauswahl-server";
import { loadVorbereitung } from "@/lib/termin-vorbereitung-server";
import { sparteNeu, zuAngebote, type Tarifauswahl } from "@/lib/tarifauswahl";
import { bisherHand } from "@/lib/bisheriger-vertrag";
import { folien, markeFuer } from "@/lib/praesentation";
import { ladeTarifkatalogAktuell, ladeVorschlaege, tarifExport, vorschlagAblehnen, vorschlagUebernehmen, vorschlagZuruecknehmen } from "@/lib/tarif-vorschlaege-server";
import { tarifVorschlaegeDiagnose } from "@/lib/ops/tarif-vorschlaege";
import { TARIF_MERKMAL } from "@/lib/tarif-vorschlaege";
import { cleanupCustomer, makeBuyer, makeCustomer, requireTestDb } from "./db";

type Ctx = { customerId: string; userId: string | null; teamRole: "owner" | "advisor" };
const kunden: Ctx[] = [];
let agenturB: Ctx;
const LVM = "lvm/hausrat/meinpremium";

async function vermittler(name: string, extra: Record<string, unknown> = {}): Promise<Ctx> {
  const c = await makeCustomer({ name: `${name} ${Date.now()} ${Math.random()}`, ...extra });
  const u = await makeBuyer(c.id, "owner");
  const ctx = { customerId: c.id, userId: u.id, teamRole: "owner" as const };
  kunden.push(ctx);
  return ctx;
}

async function termin(ctx: Ctx) {
  const lead = await prisma.lead.create({ data: { customerId: ctx.customerId, name: "Verena Martin", source: "Privatschutz", formData: [{ label: "Versicherungsinteresse", value: "Hausrat" }] } });
  return prisma.appointment.create({ data: { customerId: ctx.customerId, leadId: lead.id, mode: "phone", startsAt: new Date(Date.now() + 86400000), status: "booked" } });
}

const eigener = (ctx: Ctx, werte: Record<string, string>, name = "MeinPremium") => eigenenTarifAnlegen(ctx, { sparte: "hausrat", gesellschaft: "LVM", name, werte });

describe("Tarif-Vorschläge der Vermittler (Datenbank)", () => {
  beforeAll(async () => {
    requireTestDb();
    await prisma.tarifKatalogWert.deleteMany({});
    await prisma.tarifVorschlag.deleteMany({});
  });
  afterAll(async () => {
    await prisma.tarifKatalogWert.deleteMany({});
    for (const c of kunden) await cleanupCustomer(c.customerId);
  });

  it("eigener Tarif zu einem Katalogtarif: Vorschläge nur mit Katalogbezug, je Vermittler und Wert einmal", async () => {
    const a = await vermittler("LVM Agentur A");
    await termin(a);
    await eigener(a, { bargeld: "bis 5.000 €", diebstahl: "bis 2.000 €" });
    await eigener(a, { bargeld: "bis 5.000 €" });
    const rows = await prisma.tarifVorschlag.findMany({ where: { customerId: a.customerId }, orderBy: { merkmal: "asc" } });
    expect(rows.map((r) => [r.tarifId, r.merkmal, r.alterWert, r.neuerWert, r.quelle, r.status, r.ungeprueft])).toEqual([
      [LVM, "bargeld", "bis 3.000 €", "bis 5.000 €", "vorbereitung", "offen", true],
      [LVM, "diebstahl", null, "bis 2.000 €", "vorbereitung", "offen", true],
    ]);
    // keine Lead-, Termin- oder Personendaten: nur diese Spalten
    expect(Object.keys(rows[0]).sort()).toEqual(
      ["alterWert", "createdAt", "customerId", "datei", "entschiedenAm", "gesellschaft", "id", "merkmal", "neuerWert", "quelle", "sparte", "status", "tarifId", "ungeprueft", "userId"].sort(),
    );
    expect(JSON.stringify(rows)).not.toMatch(/Verena|Martin/);
  });

  it("Testkonten und fremde Gesellschaften erzeugen nichts", async () => {
    const t = await vermittler("Testagentur", { isTest: true });
    await eigener(t, { bargeld: "bis 9.000 €" });
    const f = await vermittler("Freie Agentur");
    await eigenenTarifAnlegen(f, { sparte: "hausrat", gesellschaft: "Kleine Regionale VVaG", name: "Top", werte: { bargeld: "bis 9.000 €" } });
    expect(await prisma.tarifVorschlag.count({ where: { customerId: { in: [t.customerId, f.customerId] } } })).toBe(0);
  });

  it("bisheriger Vertrag mit „Anderer Tarif“: Tarifname beim Autosave, einmalig; Gesundheitssparte nicht", async () => {
    const b = (agenturB = await vermittler("LVM Agentur B"));
    const appt = await termin(b);
    const k = await ladeTarifkatalogAktuell();
    const sp = sparteNeu(k, "hausrat", { rolle: "vertreter", gesellschaften: ["lvm"] })!;
    sp.bisher = { ...bisherHand(null), gesellschaft: "LVM", tarif: "Hausrat Classic 2019", beitrag: 12 };
    const bu = sparteNeu(k, "bu", { rolle: "vertreter", gesellschaften: ["allianz"] });
    const a: Tarifauswahl = { v: 1, sparten: [sp, ...(bu ? [{ ...bu, bisher: { ...bisherHand(null), gesellschaft: "Allianz", tarif: "BU Alt" } }] : [])] };
    expect((await tarifauswahlSpeichern(appt.id, b, a)).ok).toBe(true);
    expect((await tarifauswahlSpeichern(appt.id, b, a)).ok).toBe(true);
    const rows = await prisma.tarifVorschlag.findMany({ where: { customerId: b.customerId } });
    expect(rows.map((r) => [r.tarifId, r.merkmal, r.neuerWert, r.quelle])).toEqual([["lvm/hausrat/*", TARIF_MERKMAL, "Hausrat Classic 2019", "bisheriger-vertrag"]]);
  });

  it("Admin-Liste: verschiedene Vermittler je Wert, „Empfohlen“ erst ab 3", async () => {
    await eigener(agenturB, { bargeld: "bis 5000 €" });
    let v = await ladeVorschlaege("offen");
    let g = v.gruppen.find((x) => x.key === `${LVM}|bargeld`)!;
    expect(g.werte[0]).toMatchObject({ vermittler: 2, empfohlen: false });
    const c = await vermittler("LVM Agentur C");
    await eigener(c, { bargeld: "bis 5.000 Euro" });
    v = await ladeVorschlaege("offen");
    g = v.gruppen.find((x) => x.key === `${LVM}|bargeld`)!;
    expect(g.werte[0]).toMatchObject({ vermittler: 3, empfohlen: true });
    expect(g.ungeprueft).toBe(true);
    expect(v.gruppen[0].ungeprueft).toBe(true);
    expect(v.anzahl.offen).toBe(v.gruppen.length);
    const d = await tarifVorschlaegeDiagnose();
    expect(d).toMatchObject({ offenEmpfohlen: 1, uebernommeneWerte: 0 });
    expect(JSON.stringify(d)).not.toContain("5.000");
  });

  it("Übernehmen wirkt sofort: Katalog, Vergleichsfolie, gespeicherte Auswahl eines bevorstehenden Termins", async () => {
    const a = kunden[0];
    const appt = await termin(a);
    const vorher = await ladeTarifkatalogAktuell();
    const sp = sparteNeu(vorher, "hausrat", { rolle: "vertreter", gesellschaften: ["lvm"] })!;
    sp.merkmale = ["gf", "wert", "bargeld"];
    expect((await tarifauswahlSpeichern(appt.id, a, { v: 1, sparten: [sp] })).ok).toBe(true);

    expect(await vorschlagUebernehmen({ tarifId: LVM, merkmal: "bargeld", wert: "bis 5.000 €" }, { email: "ole@test.local" })).toEqual({ ok: true });
    const k = await ladeTarifkatalogAktuell();
    const t = k.tarife.find((x) => x.id === LVM)!;
    expect(t.werte.bargeld).toBe("bis 5.000 €");
    expect(t.bestaetigt).toEqual(["bargeld"]);
    expect(await prisma.tarifVorschlag.count({ where: { tarifId: LVM, merkmal: "bargeld", status: "uebernommen" } })).toBe(3);

    // neue Auswahl: Vergleichsfolie zeigt den übernommenen Wert
    const neu = sparteNeu(k, "hausrat", { rolle: "vertreter", gesellschaften: ["lvm"] })!;
    neu.merkmale = ["gf", "wert", "bargeld"];
    const html = folien((await loadVorbereitung(appt.id, a))!, zuAngebote({ v: 1, sparten: [neu] }), markeFuer({ name: "LVM Agentur" }))
      .filter((f) => f.id.startsWith("vergleich-"))
      .map((f) => f.html)
      .join("");
    expect(html).toContain("bis 5.000 €");

    // gespeicherte Auswahl des bevorstehenden Termins wird beim Öffnen aufgefrischt (die Seite speichert gleich mit)
    const tv = (await ladeTarifvorbereitung(appt.id, a, (await loadVorbereitung(appt.id, a))!))!;
    expect(tv.bisherNeu).toBe(true);
    const tw = tv.auswahl.sparten[0].tarife.find((x) => x.id === LVM)!;
    expect(tw.werte.bargeld).toBe("bis 5.000 €");
    expect(tw.werteBestaetigt).toEqual(["bargeld"]);

    // Admin: Gruppe steht unter „Übernommen“, bestätigt statt ungeprüft
    const u = await ladeVorschlaege("uebernommen");
    expect(u.gruppen.find((x) => x.key === `${LVM}|bargeld`)).toMatchObject({ bestaetigt: true, ungeprueft: false });
    const ex = await tarifExport();
    expect(ex.werte).toEqual([expect.objectContaining({ datei: "lvm/hausrat.json", tarifId: LVM, merkmal: "bargeld", wert: "bis 5.000 €", vermittler: 3 })]);
  });

  it("Ablehnen: kein Katalogwert, erneutes Eintragen bleibt abgelehnt; Zurücknehmen öffnet wieder", async () => {
    const a = kunden[0];
    expect((await vorschlagAblehnen({ tarifId: LVM, merkmal: "diebstahl", wert: "bis 2.000 €" })).ok).toBe(true);
    await eigener(a, { diebstahl: "bis 2.000 €" });
    expect(await prisma.tarifVorschlag.findMany({ where: { tarifId: LVM, merkmal: "diebstahl" }, select: { status: true } })).toEqual([{ status: "abgelehnt" }]);
    expect((await ladeTarifkatalogAktuell()).tarife.find((x) => x.id === LVM)!.werte.diebstahl).toBeUndefined();
    expect((await vorschlagAblehnen({ tarifId: LVM, merkmal: "diebstahl", wert: "bis 2.000 €" })).ok).toBe(false);

    // übernommenen Wert zurücknehmen: Datei gilt wieder
    expect((await vorschlagZuruecknehmen({ tarifId: LVM, merkmal: "bargeld", wert: "bis 5.000 €" })).ok).toBe(true);
    expect((await ladeTarifkatalogAktuell()).tarife.find((x) => x.id === LVM)!.werte.bargeld).toBe("bis 3.000 €");
    expect(await prisma.tarifVorschlag.count({ where: { tarifId: LVM, merkmal: "bargeld", status: "offen" } })).toBe(3);
  });

  it("neuer Tarifname: Übernehmen merkt nur für den Export vor, zu lange Werte werden abgelehnt", async () => {
    expect((await vorschlagUebernehmen({ tarifId: "lvm/hausrat/*", merkmal: TARIF_MERKMAL, wert: "Hausrat Classic 2019" })).ok).toBe(true);
    const k = await ladeTarifkatalogAktuell();
    expect(k.tarife.filter((t) => t.gesellschaft === "lvm" && t.sparte === "hausrat").length).toBe(2);
    expect((await tarifExport()).neueTarife).toEqual([expect.objectContaining({ datei: "lvm/hausrat.json", name: "Hausrat Classic 2019" })]);
    const a = kunden[0];
    await eigener(a, { garten: "bis 10.000 €, erhöhbar auf 50.000 €" });
    const r = await vorschlagUebernehmen({ tarifId: LVM, merkmal: "garten", wert: "bis 10.000 €, erhöhbar auf 50.000 €" });
    expect(r.ok).toBe(false);
  });
});
