// Provision, Bestand und Gewinn (Ole, 14.11.2026) mit Datenbank: Datenmigration (Tarifoptimierung behält
// ihren Wert, BU als eigene Sparte, PKV-Deckel 9,9, Sach ohne 0-€-Beitrag), „Vertrag gekündigt bzw.
// storniert“ mit Rückbelastung und Rücknahme, Altfälle ohne Grund, Stornoquote aus „Meine Provisionen“
// und die Aufgabe „Police da und erste Zahlung erfolgt?“ ohne Doppelungen.
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";
import { addLeadContract, cancelLeadContract, loadCustomerContracts, runPoliceReminders, setLeadContractStatus, syncPrimaryContract, POLICE_TODO } from "@/lib/vertraege";
import { bestandOf, ertragForRange, loadErtragData, summarizeProvision } from "@/lib/ertrag";
import { loadCustomerProvision, saveCustomerProvision, saveStornoQuote } from "@/lib/provision-server";

const DAY = 86_400_000;
const ids: string[] = [];

/** Datenteil der Migration 20261118670000 (ohne ALTER TABLE), Anweisung für Anweisung. */
async function runDataMigration() {
  const sql = readFileSync(path.join(__dirname, "../../prisma/migrations/20261118670000_provision_rechenarten_storno/migration.sql"), "utf8");
  const data = sql.slice(sql.indexOf("-- ─── Datenmigration"));
  const statements = data
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n")
    .split(/;\s*\n/)
    .map((x) => x.trim())
    .filter(Boolean);
  await prisma.$transaction(async (tx) => {
    for (const st of statements) await tx.$executeRawUnsafe(st);
  });
}

describe("Rechenarten, Kündigung, Stornoquote", () => {
  beforeAll(() => requireTestDb());
  afterAll(async () => {
    for (const id of ids) await cleanupCustomer(id);
  });

  it("Datenmigration: Tarifoptimierung behält den Wert, BU eigene Sparte, PKV ≤ 9,9, Sach-Beitrag statt 0 €", async () => {
    const c = await makeCustomer({
      vermittlerTyp: "makler",
      provisionRates: {
        pkv: { kind: "monthly", months: 12, fallbackAmount: 3000 },
        hausrat: { kind: "percent", rate: 0, trail: 0.2, defaultPremium: 0 },
        leben_bu: { kind: "percent", rate: 0.55, trail: 0.1, defaultPremium: 0 },
      },
    });
    const plain = await makeCustomer();
    ids.push(c.id, plain.id);
    const closedAt = new Date("2026-10-10T10:00:00Z");
    const mk = (customerId: string, source: string, closeValue: number | null) =>
      prisma.lead.create({ data: { customerId, source, status: "Abschluss", closedAt, closeValue } });
    const tarif = await mk(c.id, "PKV-Tarifoptimierung", 300);
    const tarifOhne = await mk(c.id, "PKV-Wechsel", null);
    const wechsel = await mk(plain.id, "Wechsel", 1500);
    const bu = await mk(plain.id, "BU-Absicherung", 960);
    const neu = await mk(plain.id, "PKV-Neugeschäft", 400);
    // Zustand vor der Migration (wie aus 20261118530000): Tarifoptimierung als „pkv“, Wechsel als „sonstiges“ mit festem Wert
    const contract = (leadId: string, customerId: string, sparte: string, premium: number | null, provisionValue: number | null) =>
      prisma.leadContract.create({ data: { leadId, customerId, primaryLeadId: leadId, sparte, premium, provisionValue, signedAt: closedAt } });
    await contract(tarif.id, c.id, "pkv", 300, null);
    await contract(tarifOhne.id, c.id, "pkv", null, null);
    await contract(wechsel.id, plain.id, "sonstiges", null, 1500);
    await contract(bu.id, plain.id, "leben_bu", 960, null);
    await contract(neu.id, plain.id, "pkv", 400, null);

    await runDataMigration();
    await runDataMigration(); // wiederholbar

    const rows = await prisma.leadContract.findMany({ where: { customerId: { in: [c.id, plain.id] } } });
    const of = (id: string) => rows.find((r) => r.leadId === id)!;
    // 12 eigene Monatsbeiträge × 300 € = 3.600 € bleiben als fester Wert
    expect(of(tarif.id)).toMatchObject({ sparte: "pkv_tarif", premium: null });
    expect(Number(of(tarif.id).provisionValue)).toBe(3600);
    expect(Number(of(tarifOhne.id).provisionValue)).toBe(3000);
    expect(of(wechsel.id).sparte).toBe("pkv_tarif");
    expect(Number(of(wechsel.id).provisionValue)).toBe(1500);
    expect(of(bu.id).sparte).toBe("bu");
    expect(Number(of(bu.id).premium)).toBe(960);
    expect(of(neu.id).sparte).toBe("pkv");

    const cust = await prisma.customer.findUniqueOrThrow({ where: { id: c.id }, select: { provisionRates: true } });
    const r = cust.provisionRates as Record<string, Record<string, unknown>>;
    expect(r.pkv.months).toBe(9.9);
    expect(r.hausrat.defaultPremium).toBe(120);
    expect(r.leben_bu).toBeUndefined();

    // Zahlen: Tarifoptimierung unverändert, als Honorar gezählt; Ansicht und Abgleich überschreiben den Wert nicht
    await syncPrimaryContract(tarif.id);
    const data = await loadErtragData(c.id);
    const byLead = (id: string) => summarizeProvision(data.contracts.filter((x) => x.leadId === id), data.rates, { from: new Date(0), to: new Date() });
    expect(byLead(tarif.id)).toMatchObject({ firstYear: 3600, honorar: 3600 });
    const p = await loadErtragData(plain.id);
    // BU: 80 € × 12 × 30 Jahre = 28.800 € → 720 € + 14,40 € Bestand im 1. Jahr
    expect(summarizeProvision(p.contracts.filter((x) => x.leadId === bu.id), p.rates, { from: new Date(0), to: new Date() }).firstYear).toBe(734.4);
  });

  it("Vertrag gekündigt bzw. storniert: Rückbelastung im Monat der Kündigung, Bestand raus, rückgängig machbar; Altfälle zählen nicht", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    const now = new Date();
    const signedAt = new Date(now.getTime() - 400 * DAY);
    const lead = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt: signedAt, closeValue: 400, createdAt: signedAt } });
    await syncPrimaryContract(lead.id);
    const add = await addLeadContract(lead.id, c.id, { sparte: "hausrat", premium: 200, signedAt, insurer: null, contractNo: null, fileId: null }, null);
    if (!add.ok) throw new Error(add.error);
    let data = await loadErtragData(c.id);
    expect(bestandOf(data, now).perYear).toBe(40 + 20);

    const res = await cancelLeadContract(add.id, c.id, { cancelledAt: new Date(now.getTime() - DAY), reason: "kunde", chargeback: 50 });
    expect(res.ok).toBe(true);
    data = await loadErtragData(c.id);
    expect(data.contracts.find((x) => x.id === add.id)).toMatchObject({ status: "storniert", cancelReason: "kunde", chargeback: 50 });
    expect(bestandOf(data, now).perYear).toBe(40);
    const thisMonth = { from: new Date(now.getTime() - 5 * DAY), to: now };
    const e = await ertragForRange(c.id, data, thisMonth, now, 0);
    expect(e.provision.chargeback).toBe(50);
    expect(e.provision.firstYear).toBe(-50);
    // Abschlussprovision bleibt im Abschlusszeitraum
    const then = summarizeProvision(data.contracts, data.rates, { from: new Date(signedAt.getTime() - DAY), to: new Date(signedAt.getTime() + DAY) }, { now });
    expect(then.firstYear).toBe(220 + 110);
    // Bestandsspiegel: storniert
    expect((await prisma.existingContract.findUnique({ where: { leadContractId: add.id } }))?.status).toBe("storniert");

    // Rückgängig
    await setLeadContractStatus(add.id, c.id, "aktiv");
    const back = await prisma.leadContract.findUniqueOrThrow({ where: { id: add.id } });
    expect(back).toMatchObject({ status: "aktiv", cancelledAt: null, cancelReason: null, chargeback: null });

    // Altfall (storniert ohne Grund, wie vor dem 14.11.2026): zählt gar nicht
    await setLeadContractStatus(add.id, c.id, "storniert");
    expect((await loadCustomerContracts(c.id)).some((x) => x.id === add.id)).toBe(false);
  });

  it("Stornoquote aus „Meine Provisionen“ fließt in die Prognosen; Standard wird nicht gespeichert", async () => {
    const c = await makeCustomer();
    ids.push(c.id);
    expect(await loadCustomerProvision(c.id)).toMatchObject({ storno: 0.1, stornoCustom: false });
    expect(await saveCustomerProvision(c.id, { typ: "vertreter", rates: {}, storno: 0.6 })).toMatchObject({ ok: false });
    expect(await saveCustomerProvision(c.id, { typ: "vertreter", rates: { pkv: { kind: "monthly", months: 10, fallbackAmount: 2500 } }, storno: 0.05 })).toMatchObject({ ok: false });
    expect(await saveCustomerProvision(c.id, { typ: "vertreter", rates: {}, storno: 0.05 })).toMatchObject({ ok: true });
    expect(await loadCustomerProvision(c.id)).toMatchObject({ storno: 0.05, stornoCustom: true });
    const lead = await prisma.lead.create({ data: { customerId: c.id, source: "TKV-Katze", status: "Abschluss", closedAt: new Date(), closeValue: 400 } });
    await syncPrimaryContract(lead.id);
    const data = await loadErtragData(c.id);
    expect(data.storno).toBe(0.05);
    expect(bestandOf(data, new Date()).storno).toBe(0.05);
    await saveStornoQuote(c.id, 0.1);
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: c.id } })).stornoQuote).toBeNull();
  });

  it("Aufgabe „Police da und erste Zahlung erfolgt?“: einmal, nicht bei Police, nicht über offene Wiedervorlage, abschaltbar", async () => {
    const c = await makeCustomer();
    const off = await makeCustomer({ policeReminder: false });
    ids.push(c.id, off.id);
    const now = new Date();
    const closedAt = new Date(now.getTime() - 15 * DAY);
    const mk = (customerId: string, extra: Record<string, unknown> = {}) =>
      prisma.lead.create({ data: { customerId, source: "TKV-Katze", status: "Abschluss", closedAt, ...extra } });
    const a = await mk(c.id);
    const withPolice = await mk(c.id);
    const open = await mk(c.id, { followUpAt: now, followUpNote: "Police fertig machen" });
    const old = await mk(c.id, { closedAt: new Date(now.getTime() - 60 * DAY) });
    const o = await mk(off.id);
    for (const l of [a, withPolice, open, old, o]) await syncPrimaryContract(l.id);
    const file = await prisma.leadFile.create({ data: { leadId: withPolice.id, customerId: c.id, fileName: "police.pdf", kind: "police", contentType: "application/pdf", size: 1, data: Buffer.from("x") } });
    await prisma.leadContract.updateMany({ where: { primaryLeadId: withPolice.id }, data: { fileId: file.id } });

    await runPoliceReminders(now);
    await runPoliceReminders(now);
    const got = await prisma.lead.findMany({ where: { id: { in: [a.id, withPolice.id, open.id, old.id, o.id] } }, select: { id: true, followUpNote: true } });
    const note = (id: string) => got.find((g) => g.id === id)?.followUpNote ?? null;
    expect(note(a.id)).toBe(POLICE_TODO);
    expect(note(withPolice.id)).toBeNull();
    expect(note(open.id)).toBe("Police fertig machen");
    expect(note(old.id)).toBeNull();
    expect(note(o.id)).toBeNull();
    // erledigt → kommt nicht wieder
    await prisma.lead.update({ where: { id: a.id }, data: { followUpAt: null, followUpNote: null } });
    await runPoliceReminders(new Date(now.getTime() + DAY));
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: a.id } })).followUpNote).toBeNull();
  });
});
