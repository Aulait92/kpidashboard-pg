// Eigener PKV-Funnel gegen die Datenbank (lib/funnel): Messung je Schritt mit Zuteilung, Absenden erzeugt einen
// PPL-Lead mit den Perspective-Feldnamen, Besucher → Lead, Fehler und Abbruch ohne Lead, Ergebnis beim Abnehmer erst
// nach 14 Tagen (erreicht, unbekannt), Reife-Filter und „ohneEreignis“ in experimentStats, Kennzahlen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { absenden, ereignisMerken, funnelReifePruefen } from "@/lib/funnel/server";
import { funnelKennzahlen, funnelDiagnose } from "@/lib/funnel/auswertung";
import { experimenteCacheLeeren, experimentStats, zuteilen } from "@/lib/experimente";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const DAY = 86_400_000;
const run = Math.random().toString(36).slice(2, 8);
const produkt = `PKV-Funnel-Test-${run}`;
const tel = (n: number) => `01512${String(Math.floor(Math.random() * 1e6)).padStart(6, "0")}${n}`;
const antworten = (n: number, extra: Record<string, string> = {}) => ({
  versichert: "Privat",
  versicherung: "Barmenia",
  situation: "Selbstständig",
  dauer: "6 bis 10 Jahre",
  beitrag: "950",
  geburtsdatum: "02.05.1980",
  plz: "50667",
  ort: "Köln",
  vorname: "Testa",
  nachname: `Funnel${"abcdefghij"[n]}`,
  email: `funnel${n}-${run}@test.local`,
  telefon: tel(n),
  ...extra,
});
const bid = (n: number) => `${run}-besuch-0000-${String(n).padStart(4, "0")}`;
const EXP = "funnel_pkv_beispiel";

describe("PKV-Funnel (Datenbank)", () => {
  let appKunde = "";
  let mailKunde = "";
  const vorher = process.env.PKV_FUNNEL_PRODUKT;

  beforeAll(async () => {
    requireTestDb();
    process.env.PKV_FUNNEL_PRODUKT = produkt;
    appKunde = (await makeCustomer()).id;
    mailKunde = (await makeCustomer()).id;
    await prisma.leadSubscription.create({ data: { customerId: appKunde, productKey: produkt, price: 55, period: "month", goal: 3, delivery: "app" } });
    // Beispiel-Test für diese Datei einschalten (Zeile in „Experiment“ hat Vorrang vor aktiv: false im Code)
    await prisma.experiment.upsert({ where: { key: EXP }, create: { key: EXP, ziel: "ppl_erreicht", aktiv: true }, update: { aktiv: true, winner: null } });
    experimenteCacheLeeren();
  });

  afterAll(async () => {
    const ids = Array.from({ length: 20 }, (_, i) => bid(i));
    await prisma.funnelEreignis.deleteMany({ where: { besuchId: { in: ids } } });
    await prisma.funnelBesuch.deleteMany({ where: { id: { in: ids } } });
    await prisma.experimentEreignis.deleteMany({ where: { einheit: { in: ids } } });
    await prisma.experimentZuteilung.deleteMany({ where: { einheit: { in: ids } } });
    await prisma.experiment.deleteMany({ where: { key: EXP } });
    experimenteCacheLeeren();
    await prisma.poolLead.deleteMany({ where: { productKey: produkt } });
    await cleanupCustomer(appKunde);
    await cleanupCustomer(mailKunde);
    if (vorher === undefined) delete process.env.PKV_FUNNEL_PRODUKT;
    else process.env.PKV_FUNNEL_PRODUKT = vorher;
  });

  it("Messung: Ereignis einmal je Schritt und Art, Zuteilung beim ersten Ansehen des Test-Schritts, Herkunft ohne Personendaten", async () => {
    const r = await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(1), schritt: "start", art: "angesehen", quelle: { utm_source: "facebook", utm_campaign: "Test", email: "nein@x.de", fbclid: "IwAR0abcdefgh" } });
    expect(r.ok).toBe(true);
    expect(r.variante).toBe(zuteilen(EXP, bid(1)));
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(1), schritt: "start", art: "angesehen" });
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(1), schritt: "start", art: "abbruch", grund: "gesetzlich" });
    expect(await prisma.funnelEreignis.count({ where: { besuchId: bid(1) } })).toBe(2);
    expect(await prisma.experimentZuteilung.count({ where: { einheit: bid(1), experiment: EXP } })).toBe(1);
    const b = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(1) } });
    expect(b.quelle).toEqual({ utm_source: "facebook", utm_campaign: "Test", fbclid: true });
    expect((await ereignisMerken({ funnel: "gibt-es-nicht", besuchId: bid(1), schritt: "start", art: "angesehen" })).ok).toBe(false);
    expect((await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(1), schritt: "start", art: "hack" })).ok).toBe(false);
  });

  it("Absenden: PPL-Lead mit den Perspective-Feldnamen, geliefert, Besucher verknüpft, Ziel funnel_lead, zweites Absenden kein neuer Lead", async () => {
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(2), schritt: "start", art: "angesehen", quelle: { utm_source: "fb", utm_campaign: "120200000000001", utm_content: "Anzeige A" } });
    const r = await absenden({ funnel: "pkv-beitrag", besuchId: bid(2), antworten: antworten(2), eventId: "evt-12345678", metaEinwilligung: false });
    expect(r).toMatchObject({ ok: true, lead: true, status: "delivered" });
    if (!r.ok) return;
    expect(r.meta).toBeNull(); // ohne Einwilligung keine Conversions API
    const b = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(2) } });
    expect(b.poolLeadId).toBeTruthy();
    expect(b.metaFbc).toBeNull();
    const pool = await prisma.poolLead.findUniqueOrThrow({ where: { id: b.poolLeadId! } });
    expect(pool).toMatchObject({ productKey: produkt, via: "funnel", externalId: `funnel:pkv-beitrag:${bid(2)}`, name: "Testa Funnelc", plz: "50667", insurer: "Barmenia", contribution: 950, civilServant: false, status: "delivered" });
    expect(pool.adInfo).toMatchObject({ adPlatform: "fb", adCampaignId: "120200000000001", adName: "Anzeige A" });
    const labels = (pool.answers as { label: string }[]).map((x) => x.label);
    expect(labels).toEqual(expect.arrayContaining(["Geburtsdatum", "Postleitzahl", "Ort", "Aktuelle Versicherung", "Wie lange in PKV?", "Monatlicher Beitrag", "Situation", "Gesetzlich oder privat?"]));
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: pool.leadId! } });
    expect(lead).toMatchObject({ customerId: appKunde, source: produkt, adCampaignId: "120200000000001" });
    expect(await prisma.experimentEreignis.count({ where: { einheit: bid(2), ziel: "funnel_lead" } })).toBe(1);
    expect(await prisma.funnelEreignis.count({ where: { besuchId: bid(2), schritt: "kontakt", art: "abgeschickt" } })).toBe(1);
    const nochmal = await absenden({ funnel: "pkv-beitrag", besuchId: bid(2), antworten: antworten(2), eventId: "evt-12345678", metaEinwilligung: true });
    expect(nochmal).toMatchObject({ ok: true, lead: false });
    expect(await prisma.poolLead.count({ where: { productKey: produkt } })).toBe(1);
  });

  it("mit Einwilligung: Conversions-API-Aufruf vorbereitet, fbc aus fbclid gespeichert", async () => {
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(3), schritt: "start", art: "angesehen" });
    const r = await absenden({ funnel: "pkv-beitrag", besuchId: bid(3), antworten: antworten(3), eventId: "evt-87654321", metaEinwilligung: true, fbclid: "IwAR0abcdefghijk", fbp: "fb.1.1700000000000.123456" });
    expect(r).toMatchObject({ ok: true, lead: true });
    if (r.ok) expect(typeof r.meta).toBe("function");
    const b = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(3) } });
    expect(b).toMatchObject({ metaEinwilligung: true, metaFbp: "fb.1.1700000000000.123456", metaEventId: "evt-87654321" });
    expect(b.metaFbc).toMatch(/^fb\.1\.\d+\.IwAR0abcdefghijk$/);
  });

  it("Fehler und Abbruch: kein Lead", async () => {
    const vor = await prisma.poolLead.count({ where: { productKey: produkt } });
    expect(await absenden({ funnel: "pkv-beitrag", besuchId: bid(4), antworten: antworten(4, { telefon: "0151 1111111" }) })).toMatchObject({ ok: false, schritt: "kontakt", fehler: { telefon: expect.any(String) } });
    expect(await absenden({ funnel: "pkv-beitrag", besuchId: bid(4), antworten: antworten(4, { versichert: "Gesetzlich" }) })).toMatchObject({ ok: false, abbruch: "gesetzlich" });
    expect(await absenden({ funnel: "pkv-beitrag", besuchId: bid(4), antworten: antworten(4, { beitrag: "600" }) })).toMatchObject({ ok: false, abbruch: "unter_650" });
    expect(await absenden({ funnel: "pkv-beitrag", besuchId: bid(4), antworten: antworten(4, { email: "kaputt" }) })).toMatchObject({ ok: false, fehler: { email: expect.any(String) } });
    expect(await prisma.poolLead.count({ where: { productKey: produkt } })).toBe(vor);
  });

  it("Ergebnis beim Abnehmer erst nach 14 Tagen; E-Mail-Abnehmer = unbekannt; Reife-Filter in experimentStats", async () => {
    // Lead 2 (App-Abnehmer) hat der Vermittler erreicht; Lead 5 geht an einen Abnehmer per E-Mail
    const b2 = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(2) } });
    const p2 = await prisma.poolLead.findUniqueOrThrow({ where: { id: b2.poolLeadId! } });
    await prisma.lead.update({ where: { id: p2.leadId! }, data: { status: "Im Gespräch", reached: true } });
    const mailSub = await prisma.leadSubscription.create({ data: { customerId: mailKunde, productKey: `${produkt}-mail`, price: 40, period: "month", goal: 5, delivery: "email", deliveryEmail: "abnehmer@test.local" } });
    const l5 = await prisma.lead.create({ data: { customerId: mailKunde, source: produkt, name: "Mail Lead", status: "Im Gespräch", subscriptionId: mailSub.id, deliveredAt: new Date() } });
    await prisma.revenue.create({ data: { customerId: mailKunde, leadId: l5.id, amount: 40 } });
    const p5 = await prisma.poolLead.create({ data: { productKey: produkt, via: "funnel", status: "delivered", leadId: l5.id, deliveredAt: new Date() } });
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(5), schritt: "start", art: "angesehen" });
    await prisma.funnelBesuch.update({ where: { id: bid(5) }, data: { poolLeadId: p5.id, leadAt: new Date() } });
    await ereignisMerken({ funnel: "pkv-beitrag", besuchId: bid(2), schritt: "start", art: "angesehen" });

    // Noch keine 14 Tage: nichts bewertet
    await funnelReifePruefen(new Date());
    expect((await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(2) } })).reifGeprueftAt).toBeNull();
    const spaeter = new Date(Date.now() + 15 * DAY);
    const r = await funnelReifePruefen(spaeter);
    expect(r.geprueft).toBeGreaterThanOrEqual(3); // gemeinsame Test-DB: ggf. weitere fällige Besuche
    expect(r.unbekannt).toBeGreaterThanOrEqual(1);
    const nach2 = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(2) } });
    expect(nach2).toMatchObject({ rueckmeldungMoeglich: true, rueckmeldung: true, erreicht: true, termin: false, abschluss: false, reif: true, reifUmsatzCent: 5500 });
    const nach5 = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(5) } });
    expect(nach5.rueckmeldungMoeglich).toBe(false);
    const ziele = async (id: string) => (await prisma.experimentEreignis.findMany({ where: { einheit: id }, select: { ziel: true } })).map((x) => x.ziel).sort();
    expect(await ziele(bid(2))).toEqual(["funnel_lead", "ppl_erreicht", "ppl_umsatz"]);
    expect(await ziele(bid(5))).toEqual(["ppl_erreicht", "ppl_umsatz", "ppl_unbekannt"]);
    // Besucher 3: geliefert an App-Abnehmer, keine Rückmeldung → nicht erreicht
    expect(await ziele(bid(3))).toEqual(["funnel_lead", "ppl_umsatz"]);

    // Nachprüfung: Termin kommt später dazu
    const b3 = await prisma.funnelBesuch.findUniqueOrThrow({ where: { id: bid(3) } });
    const p3 = await prisma.poolLead.findUniqueOrThrow({ where: { id: b3.poolLeadId! } });
    await prisma.lead.update({ where: { id: p3.leadId! }, data: { status: "Termin vereinbart" } });
    const r2 = await funnelReifePruefen(new Date(spaeter.getTime() + 60_000));
    expect(r2.nachgeprueft).toBeGreaterThanOrEqual(1);
    expect(await ziele(bid(3))).toEqual(["funnel_lead", "ppl_erreicht", "ppl_termin", "ppl_umsatz"]);

    // Reife-Filter: Zuteilungen jünger als 14 Tage zählen nicht
    experimenteCacheLeeren();
    const jung = await experimentStats(EXP);
    expect(jung.a.n + jung.b.n).toBe(0);
    await prisma.experimentZuteilung.updateMany({ where: { experiment: EXP, einheit: { in: [bid(1), bid(2), bid(3), bid(5)] } }, data: { createdAt: new Date(Date.now() - 20 * DAY) } });
    await prisma.experimentEreignis.updateMany({ where: { experiment: EXP, einheit: { in: [bid(1), bid(2), bid(3), bid(5)] } }, data: { createdAt: new Date(Date.now() - 19 * DAY) } });
    const reif = await experimentStats(EXP);
    // Besucher 1 (kein Lead, zählt als 0), 2 und 3 (erreicht); 5 ist unbekannt und fällt heraus
    expect(reif.a.n + reif.b.n).toBe(3);
    expect(reif.a.ziel + reif.b.ziel).toBe(2);
    const leads = await experimentStats(EXP, { ziel: "funnel_lead", ohneReife: true });
    expect(leads.a.ziel + leads.b.ziel).toBe(2);
  });

  it("Kennzahlen und Diagnose: Trichter und Kette, nur Zahlen", async () => {
    const k = await funnelKennzahlen("pkv-beitrag", 30);
    expect(k.besucher).toBeGreaterThanOrEqual(4);
    expect(k.leads).toBeGreaterThanOrEqual(3);
    expect(k.geliefert).toBeGreaterThanOrEqual(3);
    expect(k.unbekannt).toBeGreaterThanOrEqual(1);
    expect(k.erreicht).toBeGreaterThanOrEqual(2);
    expect(k.termin).toBeGreaterThanOrEqual(1);
    expect(k.abbrueche.gesetzlich).toBeGreaterThanOrEqual(1);
    expect(k.schritte[0]).toMatchObject({ id: "start", name: "Privat oder gesetzlich" });
    const d = await funnelDiagnose(new URLSearchParams("tage=30"));
    const json = JSON.stringify(d);
    expect(json).not.toContain(run);
    expect(json).not.toMatch(/test\.local|Testa/);
  });
});
