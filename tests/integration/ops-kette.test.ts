// Diagnose-Abfrage „kette“ (Ole, 17.11.2026, Bestandsaufnahme Datenbasis): nur Zahlen je Stufe, Kunden mit ID und Name,
// keine Personendaten der Leads (Name, Telefon, E-Mail, Formularangaben, Notizen, Vertragsnummer, Lead-IDs).
// Testleads und Testkunden zählen nicht.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ops/diagnose/route";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const TOKEN = "test-read-token-0123456789-0123456789-kette1";
const req = (q: string) => new Request(`https://app.test/api/ops/diagnose?q=${q}`, { headers: { authorization: `Bearer ${TOKEN}` } });
const D = 86_400_000;

type Pct = { n: number; pct: number | null };
type Stufe = { erreicht: number; felder: Record<string, Pct>; zahlen?: Record<string, number | null> };
type Gruppe = { leads: number; herkunft: Record<string, number>; stufen: Record<string, Stufe> };

const PII = {
  name: "Erika Mustermann-Kettentest",
  phone: "4915199887766",
  email: "erika.kettentest@example.org",
  notes: "Notiz-Kettentest-geheim",
  formValue: "Formularwert-Kettentest",
  contractNo: "VN-KETTE-998877",
  history: "Angebot gesendet an Erika Mustermann-Kettentest",
};

describe("Diagnose: Kette je Lead", () => {
  const before = process.env.OPS_READ_TOKEN;
  const customers: string[] = [];
  const leadIds: string[] = [];
  let kundeId = "";
  let pplKundeId = "";
  let testKundeId = "";

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_READ_TOKEN = TOKEN;
    const now = Date.now();
    const c = await makeCustomer();
    const ppl = await makeCustomer();
    const t = await makeCustomer({ isTest: true });
    kundeId = c.id;
    pplKundeId = ppl.id;
    testKundeId = t.id;
    customers.push(c.id, ppl.id, t.id);

    const created = new Date(now - 10 * D);
    const base = { customerId: c.id, name: PII.name, phone: PII.phone, email: PII.email, notes: PII.notes, formData: [{ label: "Frage", value: PII.formValue }] };
    // 1) Meta-Lead mit Formular, Erstkontakt, Termin (erschienen), Angebot, Abschluss mit Vertrag
    const l1 = await prisma.lead.create({
      data: {
        ...base,
        externalId: `1${now}00`,
        source: "Hausrat",
        adChannel: "Meta",
        adPlatform: "fb",
        adCampaignId: "c-kampagne",
        adSetId: "c-gruppe",
        adId: "c-anzeige",
        consentData: { formId: "123456789", at: created.toISOString() },
        createdAt: created,
        firstContactAt: new Date(created.getTime() + 30 * 60_000),
        reached: true,
        status: "Abschluss",
        closedAt: new Date(created.getTime() + 3 * D),
        closeValue: 240,
      },
    });
    await prisma.appointment.create({ data: { customerId: c.id, leadId: l1.id, mode: "phone", startsAt: new Date(created.getTime() + 2 * D), status: "completed", createdAt: new Date(created.getTime() + D) } });
    await prisma.leadHistory.create({ data: { leadId: l1.id, customerId: c.id, kind: "anruf", text: PII.history } });
    await prisma.leadContract.create({
      data: { leadId: l1.id, customerId: c.id, primaryLeadId: l1.id, sparte: "hausrat", premium: 240, insurer: "Allianz", contractNo: PII.contractNo, signedAt: new Date(created.getTime() + 3 * D) },
    });
    await prisma.leadContract.create({ data: { leadId: l1.id, customerId: c.id, sparte: "unfall", signedAt: new Date(created.getTime() + 4 * D), status: "storniert", cancelledAt: new Date(now - D), cancelReason: "kunde" } });
    // 2) Neuer Lead ohne alles
    const l2 = await prisma.lead.create({ data: { ...base, source: "Hausrat", createdAt: new Date(now - 2 * D), status: "Neuer Lead" } });
    // Airtable-Eingang beim Vermittler-Kunden ohne Bezug: bleibt Vermittler (Einstufung korrigiert 18.11.2026)
    await prisma.pplIntake.create({ data: { airtableId: `rec_kette_${now}`, receivedAt: new Date(now - 2 * D), productKey: "Hausrat", outcome: "geliefert", leadId: l2.id } });
    // 3) Testlead beim echten Kunden: zählt nicht
    const l3 = await prisma.lead.create({ data: { ...base, isTest: true, status: "Abschluss", closedAt: new Date() } });
    // 4) Pay-per-Lead per E-Mail geliefert, Storno genehmigt
    const sub = await prisma.leadSubscription.create({ data: { customerId: ppl.id, productKey: "PKV-Tarifoptimierung", price: 50, delivery: "email" } });
    const l4 = await prisma.lead.create({
      data: { ...base, customerId: ppl.id, source: "PKV-Tarifoptimierung", subscriptionId: sub.id, deliveredAt: new Date(now - 5 * D), createdAt: new Date(now - 5 * D), status: "Neuer Lead", stornoState: "approved", stornoReason: "falsche Nummer", stornoRequestedAt: new Date(now - 4 * D), stornoDecidedAt: new Date(now - 4 * D), creditAmount: 50 },
    });
    // 5) Lead beim Testkunden
    const l5 = await prisma.lead.create({ data: { ...base, customerId: t.id, status: "Neuer Lead" } });
    leadIds.push(l1.id, l2.id, l3.id, l4.id, l5.id);
  });

  afterAll(async () => {
    await prisma.pplIntake.deleteMany({ where: { leadId: { in: leadIds } } });
    for (const id of customers) await cleanupCustomer(id);
    process.env.OPS_READ_TOKEN = before;
  });

  const assertOhnePersonendaten = (text: string) => {
    for (const v of Object.values(PII)) expect(text).not.toContain(v);
    for (const id of leadIds) expect(text).not.toContain(id);
    expect(text).not.toContain("123456789");
  };

  it("je Kunde: Stufen und Abdeckung, ohne Testlead, ohne Personendaten", async () => {
    const r = await GET(req(`kette&kunde=${kundeId}`));
    expect(r.status).toBe(200);
    const text = await r.text();
    assertOhnePersonendaten(text);
    const j = JSON.parse(text) as { data: { kunden: { id: string; name: string; kundenart: string; zeitraeume: Record<string, { alle: Gruppe; vermittler: Gruppe; ppl: Gruppe }> }[]; fehlendeFelder: Record<string, string[]> } };
    expect(j.data.kunden).toHaveLength(1);
    const k = j.data.kunden[0];
    expect(k).toMatchObject({ id: kundeId, kundenart: "vermittler" });
    expect(Object.keys(k).sort()).toEqual(["archiviert", "id", "kundenart", "name", "paket", "zeitraeume"]);
    const g = k.zeitraeume.gesamt.alle;
    expect(g.leads).toBe(2);
    expect(g.herkunft.meta).toBe(1);
    expect(g.stufen.anzeige.felder.formular).toEqual({ n: 1, pct: 50 });
    expect(g.stufen.ersterKontakt.erreicht).toBe(1);
    expect(g.stufen.termin.felder.terminZeile.n).toBe(1);
    expect(g.stufen.terminStatus.zahlen?.erschienen).toBe(1);
    expect(g.stufen.angebot.felder.zeitpunkt.n).toBe(1);
    expect(g.stufen.abschluss.erreicht).toBe(1);
    expect(g.stufen.abschluss.felder.gesellschaft).toEqual({ n: 1, pct: 100 });
    expect(g.stufen.abschluss.felder.vertragsnummer.n).toBe(1);
    expect(g.stufen.storno.erreicht).toBe(1);
    expect(k.zeitraeume.d30.alle.leads).toBe(2);
    expect(g.stufen.anzeige.felder.kampagne).toEqual({ n: 1, pct: 50 });
    expect(g.stufen.anzeige.felder.anzeige).toEqual({ n: 1, pct: 50 });
    expect(j.data.fehlendeFelder.anzeige).toBeUndefined();
    expect(k.zeitraeume.gesamt.ppl.leads).toBe(0);
  });

  it("Gesamtsicht: Pay-per-Lead getrennt, Testkunde fehlt, keine Personendaten", async () => {
    const r = await GET(req("kette"));
    expect(r.status).toBe(200);
    const text = await r.text();
    assertOhnePersonendaten(text);
    const j = JSON.parse(text) as { data: { kunden: { id: string; kundenart: string; zeitraeume: Record<string, { leads: number; stufen: Record<string, number>; abdeckung: Record<string, number | null> }> }[]; zeitraeume: Record<string, { ppl: Gruppe }> } };
    expect(j.data.kunden.some((k) => k.id === testKundeId)).toBe(false);
    const p = j.data.kunden.find((k) => k.id === pplKundeId)!;
    expect(p.kundenart).toBe("ppl");
    expect(p.zeitraeume.gesamt.stufen.lieferung).toBe(1);
    expect(p.zeitraeume.gesamt.abdeckung["pplStorno.grund"]).toBe(100);
    expect(j.data.zeitraeume.gesamt.ppl.stufen.kaeuferRueckmeldung.zahlen?.lieferweg_email).toBeGreaterThanOrEqual(1);
    expect(j.data.kunden.find((k) => k.id === kundeId)?.zeitraeume.gesamt.leads).toBe(2);
  });

  it("Testkunde direkt abgefragt: kein Ergebnis", async () => {
    const j = (await (await GET(req(`kette&kunde=${testKundeId}`))).json()) as { data: { fehler?: string } };
    expect(j.data.fehler).toBeTruthy();
  });
});
