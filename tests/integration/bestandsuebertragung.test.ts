// Bestandsübertragung aus der Maklervollmacht (Ole, 18.11.2026) gegen eine echte Datenbank: Anlage bei Unterschrift,
// idempotent, Beitrag aus dem bisherigen Vertrag, Aufgabe nach 4 Wochen, Bestätigen (mit Monatsbeitrag) und Ablehnen,
// Widerruf, Zählung erst nach Bestätigung, Quote zählt Leads, kein Abschluss-Ereignis an Meta.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { pruefeEingabe } from "@/lib/maklervollmacht/regeln";
import { unterschreiben, vollmachtAnlegen, widerrufen } from "@/lib/maklervollmacht/server";
import { offeneUebertragung, uebertragungAblehnen, uebertragungBestaetigen, uebertragungenAnlegen, uebertragungenFuerVollmacht } from "@/lib/maklervollmacht/uebertragung";
import { aktiviereAufgaben } from "@/lib/lead-aufgaben";
import { listLeadContracts, loadCustomerContracts, syncPrimaryContract } from "@/lib/vertraege";
import { loadErtragData, summarizeProvision } from "@/lib/ertrag";
import { computeKpis } from "@/lib/kpis";
import { detectForCustomer } from "@/lib/capi/server";
import { testPng } from "../helpers/test-png";

const DAY = 86_400_000;
let seq = 0;
const metaId = () => `2${String(Date.now()).slice(-9)}${String(++seq).padStart(6, "0")}`;

const eingabe = (vertraege: { versicherer: string; sparte: string; vertragsnummer: string | null }[]) => {
  const o: Record<string, string> = {
    vorname: "Anna",
    nachname: "Muster",
    strasse: "Hauptstraße 1",
    plz: "80331",
    ort: "München",
    geburtsdatum: "12.03.1980",
    email: "",
    vertraege: JSON.stringify(vertraege),
    zustimmung: "ja",
    gesundheit: "ja",
    unterschrift: testPng(),
  };
  const r = pruefeEingabe((k) => o[k] ?? null);
  if (!r.ok) throw new Error(r.fehler);
  return r.eingabe;
};

const bisher = (gesellschaft: string, beitrag: number) => ({
  quelle: "hand",
  zeigen: null,
  gesellschaft,
  tarif: null,
  katalogId: null,
  werte: {},
  beitrag,
  zahlweise: "monat",
  summe: null,
  sb: null,
  ablauf: null,
  kuendbarZum: null,
  fristMonate: null,
});

describe("Bestandsübertragung (Datenbank)", () => {
  let makler = "";
  const range = { from: new Date(Date.now() - 30 * DAY), to: new Date(Date.now() + 60 * DAY) };

  async function signierterLead(name: string, vertraege: Parameters<typeof eingabe>[0], extra: Record<string, unknown> = {}) {
    const lead = await prisma.lead.create({ data: { customerId: makler, name, status: "Termin vereinbart", externalId: metaId(), ...extra } });
    const a = await vollmachtAnlegen(lead.id, makler);
    if (!a.ok) throw new Error(a.error);
    const r = await unterschreiben(a.vollmacht.token, eingabe(vertraege), { ip: null, ua: null });
    expect(r.ok).toBe(true);
    return { leadId: lead.id, vollmachtId: a.vollmacht.id };
  }

  beforeAll(async () => {
    requireTestDb();
    process.env.ENCRYPTION_KEY ||= Buffer.alloc(32, 7).toString("base64");
    makler = (await makeCustomer({ vermittlerTyp: "makler", leadAddress: "sie" })).id;
  });
  afterAll(async () => {
    await cleanupCustomer(makler);
  });

  it("Unterschrift legt je Vertrag eine laufende Übertragung an (Beitrag aus der Vorbereitung), idempotent, Aufgabe nach 4 Wochen", async () => {
    const lead = await prisma.lead.create({ data: { customerId: makler, name: "Anna Muster", status: "Termin vereinbart", externalId: metaId() } });
    // Bisheriger Vertrag in der Terminvorbereitung: Haftpflicht bei Allianz, 8 € im Monat
    await prisma.appointment.create({
      data: {
        customerId: makler,
        leadId: lead.id,
        mode: "phone",
        startsAt: new Date(Date.now() - DAY),
        tarifauswahl: { v: 1, sparten: [{ key: "haftpflicht", label: "Privathaftpflicht", schema: { merkmale: [], bausteine: [] }, merkmale: [], bausteine: [], empfohlen: null, tarife: [], bisher: bisher("Allianz", 8) }] },
      },
    });
    const a = await vollmachtAnlegen(lead.id, makler);
    if (!a.ok) throw new Error(a.error);
    const r = await unterschreiben(
      a.vollmacht.token,
      eingabe([
        { versicherer: "Allianz", sparte: "haftpflicht", vertragsnummer: "AS-123" },
        { versicherer: "HUK-Coburg", sparte: "bu", vertragsnummer: "B-9" },
      ]),
      { ip: null, ua: null },
    );
    expect(r.ok).toBe(true);
    const v = await prisma.maklervollmacht.findUniqueOrThrow({ where: { id: a.vollmacht.id } });
    const rows = await prisma.leadContract.findMany({ where: { leadId: lead.id }, orderBy: { uebertragungKey: "asc" } });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ herkunft: "uebertragung", insurer: "Allianz", contractNo: "AS-123", sparte: "privatschutz", premiumSource: "angebot", uebertragungBestaetigtAt: null, status: "aktiv", primaryLeadId: null, vollmachtId: v.id });
    expect(Number(rows[0].premium)).toBe(96);
    expect(rows[1]).toMatchObject({ insurer: "HUK-Coburg", sparte: "bu", premium: null, premiumSource: null });
    // Idempotent
    expect(await uebertragungenAnlegen(v.id)).toBe(0);
    expect(await prisma.leadContract.count({ where: { leadId: lead.id } })).toBe(2);
    // Je Versicherer eine Aufgabe, fällig 4 Wochen nach der Unterschrift
    const tasks = await prisma.leadTask.findMany({ where: { leadId: lead.id }, orderBy: { kind: "asc" } });
    expect(tasks.map((t) => [t.kind, t.status, t.note])).toEqual([
      ["uebertragung:allianz", "wartet", "Übertragung bei Allianz bestätigt?"],
      ["uebertragung:huk-coburg", "wartet", "Übertragung bei HUK-Coburg bestätigt?"],
    ]);
    expect(tasks[0].dueAt.getTime() - v.signedAt!.getTime()).toBe(28 * DAY);
    expect(await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { followUpAt: true } })).toEqual({ followUpAt: null });

    // Vor der Bestätigung: zählt nirgends, im Kontakt „läuft“
    expect((await loadCustomerContracts(makler)).filter((c) => c.leadId === lead.id)).toHaveLength(0);
    expect((await computeKpis({ range, customerId: makler })).closedLeads).toBe(0);
    expect((await uebertragungenFuerVollmacht(v.id, makler)).map((g) => [g.versicherer, g.stand, g.beitragFragen])).toEqual([
      ["Allianz", "laeuft", false],
      ["HUK-Coburg", "laeuft", true],
    ]);

    // Nach 4 Wochen: Wiedervorlage „Übertragung bei Allianz bestätigt?“ mit Ein-Klick
    expect(await aktiviereAufgaben(new Date(Date.now() + 29 * DAY), { leadId: lead.id })).toBe(1);
    const l1 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { followUpNote: true } });
    expect(l1.followUpNote).toBe("Übertragung bei Allianz bestätigt?");
    expect(await offeneUebertragung(lead.id, makler, "Allianz")).toEqual({ versicherer: "Allianz", beitragFragen: false });

    // Bestätigt: zählt jetzt, nur Bestandscourtage, Wiedervorlage frei, Lead-Status unverändert
    expect(await uebertragungBestaetigen(makler, lead.id, { versicherer: "Allianz" })).toEqual({ ok: true, vertraege: 1 });
    const l2 = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id }, select: { followUpNote: true, followUpAt: true, status: true, closedAt: true } });
    expect(l2).toEqual({ followUpNote: null, followUpAt: null, status: "Termin vereinbart", closedAt: null });
    expect((await prisma.leadTask.findFirstOrThrow({ where: { leadId: lead.id, kind: "uebertragung:allianz" } })).status).toBe("entfallen");
    expect(await offeneUebertragung(lead.id, makler, "Allianz")).toBeNull();

    let data = await loadErtragData(makler);
    let mine = data.contracts.filter((c) => c.leadId === lead.id);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ uebertragung: true, primary: false });
    let s = summarizeProvision(mine, data.rates, range);
    expect(s).toMatchObject({ abschluss: 0, firstYear: 21.6, uebertragung: { contracts: 1, amount: 21.6, leads: 1 }, crossSell: { contracts: 0 } });

    // Quote zählt den Lead als gewonnen, sichtbar „davon über Übertragung“
    const k = await computeKpis({ range, customerId: makler });
    expect(k.closedLeads).toBe(1);
    expect(k.closedViaUebertragung).toBe(1);

    // HUK ohne Beitrag: Monatsbeitrag beim Bestätigen (BU als Jahresbeitrag gespeichert)
    expect(await offeneUebertragung(lead.id, makler, "HUK-Coburg")).toEqual({ versicherer: "HUK-Coburg", beitragFragen: true });
    expect(await uebertragungBestaetigen(makler, lead.id, { versicherer: "HUK24" }, { monatsbeitrag: 50 })).toEqual({ ok: true, vertraege: 1 });
    const huk = await prisma.leadContract.findFirstOrThrow({ where: { leadId: lead.id, insurer: "HUK-Coburg" } });
    expect(Number(huk.premium)).toBe(600);
    expect(huk.premiumSource).toBe("vermittler");
    expect(huk.uebertragungBestaetigtAt).not.toBeNull();
    data = await loadErtragData(makler);
    mine = data.contracts.filter((c) => c.leadId === lead.id);
    s = summarizeProvision(mine, data.rates, range);
    expect(s.uebertragung.contracts).toBe(2);
    expect(s.abschluss).toBe(0);
    expect((await computeKpis({ range, customerId: makler })).closedLeads).toBe(1); // Leads, nicht Verträge
    // Nochmal bestätigen: nichts mehr offen
    expect(await uebertragungBestaetigen(makler, lead.id, { versicherer: "Allianz" })).toMatchObject({ ok: false });
    // Verlauf
    expect(await prisma.leadHistory.count({ where: { leadId: lead.id, text: { startsWith: "Bestandsübertragung bestätigt" } } })).toBe(2);
    // Vertragsliste im Kontakt: als Übertragung erkennbar
    const view = await listLeadContracts(lead.id, data.rates);
    expect(view.map((c) => c.uebertragungStand)).toEqual(["bestaetigt", "bestaetigt"]);
    expect(view[0].summary).not.toMatch(/Provision ≈/);
  });

  it("Kein Abschluss-Ereignis an Meta für einen Lead, der nur über eine Übertragung Kunde wurde", async () => {
    const { leadId } = await signierterLead("Meta Lead", [{ versicherer: "AXA", sparte: "hausrat", vertragsnummer: null }], { createdAt: new Date(Date.now() - DAY) });
    expect((await uebertragungBestaetigen(makler, leadId, { versicherer: "AXA" })).ok).toBe(true);
    await detectForCustomer(makler);
    const stages = (await prisma.capiEvent.findMany({ where: { leadId }, select: { stage: true } })).map((e) => e.stage);
    expect(stages).toContain("lead");
    expect(stages).not.toContain("abschluss");
    // Gegenprobe: ein echter Abschluss erzeugt das Ereignis
    const won = await prisma.lead.create({ data: { customerId: makler, name: "Echter Abschluss", externalId: metaId(), status: "Abschluss", closedAt: new Date(), createdAt: new Date(Date.now() - DAY) } });
    await detectForCustomer(makler);
    expect((await prisma.capiEvent.findMany({ where: { leadId: won.id }, select: { stage: true } })).map((e) => e.stage)).toContain("abschluss");
  });

  it("Abgelehnt: storniert, zählt nie; im Kontakt als abgelehnt", async () => {
    const { leadId, vollmachtId } = await signierterLead("Bernd Ablehnung", [{ versicherer: "ERGO", sparte: "hausrat", vertragsnummer: "H-1" }]);
    expect(await uebertragungAblehnen(makler, leadId, { versicherer: "ERGO" })).toEqual({ ok: true, vertraege: 1 });
    const c = await prisma.leadContract.findFirstOrThrow({ where: { leadId } });
    expect(c).toMatchObject({ status: "storniert", uebertragungBestaetigtAt: null, cancelReason: null });
    expect((await loadCustomerContracts(makler)).filter((x) => x.leadId === leadId)).toHaveLength(0);
    expect((await uebertragungenFuerVollmacht(vollmachtId, makler))[0].stand).toBe("abgelehnt");
    expect(await prisma.leadTask.findFirstOrThrow({ where: { leadId } })).toMatchObject({ status: "entfallen", endedReason: "Übertragung abgelehnt" });
    // Danach weder bestätigen noch nochmal ablehnen
    expect((await uebertragungBestaetigen(makler, leadId, { versicherer: "ERGO" })).ok).toBe(false);
  });

  it("Bestätigen je Vertrag (vorher im Vertrag) und Widerruf: offene entfallen, bestätigte bleiben", async () => {
    const { leadId, vollmachtId } = await signierterLead("Clara Widerruf", [
      { versicherer: "Gothaer", sparte: "wohngebaeude", vertragsnummer: "W-1" },
      { versicherer: "Gothaer", sparte: "rechtsschutz", vertragsnummer: "R-1" },
      { versicherer: "DEVK", sparte: "kfz", vertragsnummer: "K-1" },
    ]);
    const rows = await prisma.leadContract.findMany({ where: { leadId }, orderBy: { uebertragungKey: "asc" } });
    expect(rows).toHaveLength(3);
    // Vertrag einzeln bestätigen: Aufgabe für Gothaer bleibt, solange der zweite Vertrag läuft
    expect((await uebertragungBestaetigen(makler, leadId, { contractId: rows[0].id })).ok).toBe(true);
    expect((await prisma.leadTask.findFirstOrThrow({ where: { leadId, kind: "uebertragung:gothaer" } })).status).toBe("wartet");
    // Fremder Kunde darf nicht bestätigen
    const fremd = await makeCustomer({ vermittlerTyp: "makler" });
    expect((await uebertragungBestaetigen(fremd.id, leadId, { contractId: rows[1].id })).ok).toBe(false);
    await cleanupCustomer(fremd.id);

    expect(await widerrufen(vollmachtId, makler, null)).toBe(true);
    const rest = await prisma.leadContract.findMany({ where: { leadId } });
    expect(rest.map((r) => r.id)).toEqual([rows[0].id]);
    expect(await prisma.leadTask.count({ where: { leadId } })).toBe(0);
  });

  it("Lead mit Abschluss und Übertragung: ein Kunde, Übertragung kein Cross-Selling; nur Makler", async () => {
    const { leadId } = await signierterLead("Dora Beides", [{ versicherer: "Allianz", sparte: "hausrat", vertragsnummer: null }]);
    await prisma.lead.update({ where: { id: leadId }, data: { status: "Abschluss", closedAt: new Date(), closeValue: 300, source: "Privatschutz" } });
    await syncPrimaryContract(leadId);
    let data = await loadErtragData(makler);
    let mine = data.contracts.filter((c) => c.leadId === leadId);
    expect(mine).toHaveLength(1); // Übertragung noch offen
    await uebertragungBestaetigen(makler, leadId, { versicherer: "Allianz" });
    data = await loadErtragData(makler);
    mine = data.contracts.filter((c) => c.leadId === leadId);
    expect(mine.map((c) => [c.primary, !!c.uebertragung]).sort()).toEqual([
      [false, true],
      [true, false],
    ]);
    const s = summarizeProvision(mine, data.rates, range);
    expect(s.crossSell.contracts).toBe(0);
    expect(s.uebertragung.contracts).toBe(1);

    // Vertreter: keine Übertragungen (Vollmacht nur für Makler)
    const vertreter = await makeCustomer({ vermittlerTyp: "vertreter" });
    const l = await prisma.lead.create({ data: { customerId: vertreter.id, name: "V" } });
    const vv = await prisma.maklervollmacht.create({ data: { customerId: vertreter.id, leadId: l.id, token: `t-${l.id}`, status: "unterschrieben", signedAt: new Date(), vertraege: [{ versicherer: "Allianz", sparte: "hausrat", vertragsnummer: null }] } });
    expect(await uebertragungenAnlegen(vv.id)).toBe(0);
    await cleanupCustomer(vertreter.id);
  });
});
