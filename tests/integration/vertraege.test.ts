// Cross-Selling (Ole, 14.11.2026): Migration bestehender Abschlüsse, Verträge je Lead, Storno,
// Bestand ohne Doppelung mit dem Import, Erinnerung ohne doppelte Aufgaben, Quoten nur aus
// bezahlten Leads, Kollegen-Gutschrift im Gewinn, eine Empfehlungsanfrage je Lead.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { addLeadContract, loadCustomerContracts, runCrossSellReminders, setLeadContractStatus, syncLeadToBestand, syncPrimaryContract } from "@/lib/vertraege";
import { importRows } from "@/lib/bestand/import";
import { computeKpis } from "@/lib/kpis";
import { ertragForRange, loadErtragData, summarizeProvision } from "@/lib/ertrag";

const DAY = 86_400_000;
const ids: string[] = [];

async function runMigrationData() {
  const sql = readFileSync(path.join(__dirname, "../../prisma/migrations/20261118530000_lead_vertraege/migration.sql"), "utf8");
  const part = sql.slice(sql.indexOf("CREATE OR REPLACE FUNCTION pg_temp.sparte_of"));
  const [fn, insert] = [part.slice(0, part.indexOf("$$ LANGUAGE sql IMMUTABLE;") + "$$ LANGUAGE sql IMMUTABLE;".length), part.slice(part.indexOf("INSERT INTO"))];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(fn);
    await tx.$executeRawUnsafe(insert);
  });
}

describe("Verträge je Lead", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Migration: bestehende Abschlüsse werden zum ersten Vertrag", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const closedAt = new Date("2026-10-10T10:00:00Z");
    const tkv = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt, closeValue: 400 } });
    const kiga = await prisma.lead.create({ data: { customerId: c.id, source: "Kindersparplan", status: "Abschluss", closedAt, closeValue: 500 } });
    const open = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Neuer Lead" } });
    // Empfehlung: Sparte aus dem Produkt des Empfehlers
    const recommender = await prisma.lead.create({ data: { customerId: c.id, source: "Allianz Privatschutz", status: "Abschluss", closedAt } });
    const link = await prisma.referralLink.create({ data: { customerId: c.id, leadId: recommender.id, token: `t${Math.random().toString(36).slice(2)}`, kind: "contact" } });
    const emp = await prisma.lead.create({ data: { customerId: c.id, source: "Empfehlung", adChannel: "Empfehlung", referralLinkId: link.id, status: "Abschluss", closedAt, closeValue: 300 } });
    const empNoLink = await prisma.lead.create({ data: { customerId: c.id, source: "Empfehlung", adChannel: "Empfehlung", status: "Abschluss", closedAt } });

    await runMigrationData();
    await runMigrationData(); // idempotent
    const rows = await prisma.leadContract.findMany({ where: { customerId: c.id } });
    const of = (id: string) => rows.find((r) => r.leadId === id);
    expect(rows).toHaveLength(5);
    expect(of(open.id)).toBeUndefined();
    expect(of(tkv.id)).toMatchObject({ primaryLeadId: tkv.id, sparte: "katze", provisionValue: null, status: "aktiv" });
    expect(Number(of(tkv.id)!.premium)).toBe(400);
    expect(of(tkv.id)!.signedAt.toISOString()).toBe(closedAt.toISOString());
    // Bisher frei eingegebener Wert bleibt als fester Provisionswert
    expect(of(kiga.id)).toMatchObject({ sparte: "kindersparplan", premium: null });
    expect(Number(of(kiga.id)!.provisionValue)).toBe(500);
    expect(of(emp.id)!.sparte).toBe("privatschutz");
    expect(of(empNoLink.id)!.sparte).toBe("sonstiges");
    // closedAt am Lead bleibt
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: tkv.id } })).closedAt?.toISOString()).toBe(closedAt.toISOString());

    // Zahlen unverändert für die alten Werte: Kindersparplan 500 €, TKV 55 % von 400 €
    const data = await loadErtragData(c.id);
    const byLead = (id: string) => summarizeProvision(data.contracts.filter((x) => x.leadId === id), data.rates, { from: new Date(0), to: new Date() }).firstYear;
    expect(byLead(kiga.id)).toBe(500);
    expect(byLead(tkv.id)).toBe(220);
  });

  it("Abschluss legt den ersten Vertrag an, Cross-Selling, Storno nimmt ihn raus", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const lead = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", phone: "4915100000001", name: "Erika Muster", status: "Abschluss", closedAt: new Date(), closeValue: 400 } });
    await syncPrimaryContract(lead.id);
    await syncPrimaryContract(lead.id); // kein zweiter
    expect(await prisma.leadContract.count({ where: { leadId: lead.id } })).toBe(1);
    const add = await addLeadContract(lead.id, c.id, { sparte: "privatschutz", premium: 600, signedAt: new Date(), insurer: "Allianz", contractNo: "PS-1", fileId: null }, null);
    expect(add.ok).toBe(true);
    const range = { from: new Date(Date.now() - DAY), to: new Date(Date.now() + DAY) };
    let data = await loadErtragData(c.id);
    let s = summarizeProvision(data.contracts, data.rates, range);
    expect(s).toMatchObject({ firstYear: 220 + 330, contracts: 2, leads: 1, crossSell: { contracts: 1, amount: 330 } });
    // Abschlussquote zählt weiter Leads
    const k = await computeKpis({ range, customerId: c.id, origin: "paid" });
    expect(k.closedLeads).toBe(1);
    // Storno
    if (!add.ok) throw new Error();
    await setLeadContractStatus(add.id, c.id, "storniert");
    data = await loadErtragData(c.id);
    s = summarizeProvision(data.contracts, data.rates, range);
    expect(s.firstYear).toBe(220);
    // Ein aus „Abschluss“ zurückgezogener Lead trägt nichts mehr
    await prisma.lead.update({ where: { id: lead.id }, data: { status: "Angebot gesendet", closedAt: null } });
    expect(await loadCustomerContracts(c.id)).toHaveLength(0);
    // Pro Lead weiterhin höchstens eine Empfehlungsanfrage: Verträge legen keine an
    expect(await prisma.reviewRequest.count({ where: { leadId: lead.id } })).toBe(0);
  });

  it("Bestand: Kunde mit allen Verträgen, ohne Doppelung mit dem Import", async () => {
    const c = await makeCustomer({ existingCustomersEnabled: true });
    ids.push(c.id);
    const lead = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", phone: "4915100000002", name: "Max Beispiel", status: "Abschluss", closedAt: new Date(), closeValue: 350 } });
    await syncPrimaryContract(lead.id);
    await addLeadContract(lead.id, c.id, { sparte: "hausrat", premium: 200, signedAt: new Date(), insurer: null, contractNo: "H-9", fileId: null }, null);
    await syncLeadToBestand(lead.id);
    let ec = await prisma.existingCustomer.findMany({ where: { customerId: c.id }, include: { contracts: true } });
    expect(ec).toHaveLength(1);
    expect(ec[0].leadId).toBe(lead.id);
    expect(ec[0].lines.sort()).toEqual(["Hausrat", "Tier"]);
    expect(ec[0].contracts).toHaveLength(2);
    // Import desselben Kunden (gleiche Nummer, mit Kundennummer) → derselbe Eintrag; Hausrat kommt aus dem Import
    await importRows(
      c.id,
      [
        { Name: "Max Beispiel", Telefon: "+49 151 00000002", Kundennr: "K-1", Sparte: "Hausrat", Vertragsnummer: "H-9", Beitrag: "210" },
        { Name: "Max Beispiel", Telefon: "+49 151 00000002", Kundennr: "K-1", Sparte: "KFZ", Vertragsnummer: "K-7", Beitrag: "500" },
      ],
      { fullName: "Name", phone: "Telefon", externalNo: "Kundennr", line: "Sparte", contractNo: "Vertragsnummer", annualPremium: "Beitrag" },
    );
    ec = await prisma.existingCustomer.findMany({ where: { customerId: c.id }, include: { contracts: true } });
    expect(ec).toHaveLength(1);
    expect(ec[0].externalNo).toBe("K-1");
    const lines = ec[0].contracts.map((x) => `${x.line}:${x.contractNo}:${x.leadContractId ? "app" : "import"}`).sort();
    expect(lines).toEqual(["Hausrat:H-9:import", "KFZ:K-7:import", "Tier:null:app"]);
    // Erneuter Abgleich legt keinen zweiten Hausrat-Spiegel an
    await syncLeadToBestand(lead.id);
    expect(await prisma.existingContract.count({ where: { existingCustomerId: ec[0].id } })).toBe(3);
    expect((await prisma.existingCustomer.findUniqueOrThrow({ where: { id: ec[0].id } })).lines.sort()).toEqual(["Hausrat", "KFZ", "Tier"]);
  });

  it("Erinnerung „Weiteres Produkt anbieten?“ einmal, nicht bei weiterem Vertrag, abschaltbar", async () => {
    const c = await makeCustomer();
    const off = await makeCustomer({ crossSellReminder: false });
    ids.push(c.id, off.id);
    const now = new Date();
    const closedAt = new Date(now.getTime() - 43 * DAY);
    const a = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt } });
    const b = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt } });
    const old = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt: new Date(now.getTime() - 90 * DAY) } });
    const lost = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Kein Interesse", closedAt } });
    const o = await prisma.lead.create({ data: { customerId: off.id, source: "TKV-Katze", status: "Abschluss", closedAt } });
    for (const l of [a, b, old, o]) await syncPrimaryContract(l.id);
    await addLeadContract(b.id, c.id, { sparte: "privatschutz", premium: 600, signedAt: now, insurer: null, contractNo: null, fileId: null }, null);
    await runCrossSellReminders(now);
    await runCrossSellReminders(now);
    const got = await prisma.lead.findMany({ where: { id: { in: [a.id, b.id, old.id, lost.id, o.id] } }, select: { id: true, followUpNote: true, crossSellRemindedAt: true } });
    const note = (id: string) => got.find((g) => g.id === id)?.followUpNote ?? null;
    expect(note(a.id)).toBe("Weiteres Produkt anbieten? Naheliegend: Privatschutz/Haftpflicht, Unfall");
    expect(note(b.id)).toBeNull();
    expect(note(old.id)).toBeNull();
    expect(note(lost.id)).toBeNull();
    expect(note(o.id)).toBeNull();
    // Erledigt → kommt nicht wieder
    await prisma.lead.update({ where: { id: a.id }, data: { followUpAt: null, followUpNote: null } });
    await runCrossSellReminders(new Date(now.getTime() + 2 * DAY));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).followUpNote).toBeNull();
  });

  it("Erinnerung nennt die erkannten Lücken aus der Terminvorbereitung (Cross-Selling A6)", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const now = new Date();
    const closedAt = new Date(now.getTime() - 43 * DAY);
    const l = await prisma.lead.create({ data: { customerId: c.id, source: "Privatschutz", status: "Abschluss", closedAt } });
    await syncPrimaryContract(l.id);
    const tarifauswahl = {
      v: 1,
      sparten: [{ key: "haftpflicht", label: "Privathaftpflicht", schema: { merkmale: [], bausteine: [] }, merkmale: [], bausteine: [], empfohlen: null, tarife: [] }],
      schutz: [
        { key: "haftpflicht", label: "Privathaftpflicht", status: "woanders" },
        { key: "unfall", label: "Unfall", status: "luecke" },
        { key: "hausrat", label: "Hausrat", status: "bei-uns" },
        { key: "rechtsschutz", label: "Rechtsschutz", status: "pruefen" },
      ],
    };
    await prisma.appointment.create({ data: { customerId: c.id, leadId: l.id, mode: "video", startsAt: new Date(closedAt.getTime() - DAY), status: "completed", tarifauswahl } });
    await runCrossSellReminders(now);
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: l.id } })).followUpNote).toBe("Weiteres Produkt anbieten? Aus dem Termin: Unfall (Lücke), Rechtsschutz (prüfen)");
  });

  it("Quoten nur aus bezahlten Leads; Empfehlungen zählen in den Gewinn; Kollegen-Gutschrift mindert die Agenturkosten", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const now = new Date();
    const range = { from: new Date(now.getTime() - 5 * DAY), to: new Date(now.getTime() + DAY) };
    await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", adChannel: "Meta", status: "Neuer Lead" } });
    const paid = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", adChannel: "Meta", status: "Abschluss", closedAt: now, closeValue: 400 } });
    const emp = await prisma.lead.create({ data: { customerId: c.id, source: "Empfehlung", adChannel: "Empfehlung", status: "Abschluss", closedAt: now } });
    await syncPrimaryContract(paid.id);
    await syncPrimaryContract(emp.id, { sparte: "hund" });
    const all = await computeKpis({ range, customerId: c.id });
    const onlyPaid = await computeKpis({ range, customerId: c.id, origin: "paid" });
    expect(all.closedLeads).toBe(2);
    expect(onlyPaid.nettoLeads).toBe(2);
    expect(onlyPaid.closedLeads).toBe(1);
    expect(onlyPaid.closingRate).toBe(0.5);

    await prisma.colleagueReferral.create({
      data: { referrerId: c.id, consentAt: now, consentText: "ok", rewardStatus: "credited", rewardAmount: 100, rewardedAt: new Date(now.getTime() - DAY) },
    });
    const data = await loadErtragData(c.id);
    const e = await ertragForRange(c.id, data, range, now, 50);
    expect(e.provision.firstYear).toBe(220 + 192.5);
    expect(e.provision.byOrigin.empfehlung.amount).toBe(192.5);
    expect(e.agency.gutschrift).toBe(119);
    expect(e.gewinn).toBe(Math.round((412.5 - 50 + 119) * 100) / 100);
  });
});
