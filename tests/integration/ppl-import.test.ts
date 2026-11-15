import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Airtable-Tabellen werden im Test vorgegeben (kein Netz).
const tables = vi.hoisted(() => ({ current: {} as Record<string, { id: string; fields: Record<string, unknown>; createdTime: string }[]> }));
vi.mock("@/lib/airtable", () => ({ fetchAllRecords: vi.fn(async (t: string) => tables.current[t] ?? []) }));

import { prisma } from "@/lib/prisma";
import { importDuplicateHistory, importSubscriptions, planReimport } from "@/lib/ppl/import-airtable";
import { cleanupCustomer, makeCustomer, requireTestDb } from "./db";

const tag = Math.random().toString(36).slice(2, 8);
const recBezug = `recBezug${tag}`;
const recKunde = `recKunde${tag}`;
const recProdukt = `recProdukt${tag}`;
const product = `PKV-Import-${tag}`;
const now = new Date().toISOString();

function airtable(customerName: string, bezug: Record<string, unknown> = {}) {
  tables.current = {
    "Kunden-Produkt-Bezug": [
      {
        id: recBezug,
        createdTime: now,
        fields: {
          Kunde: [recKunde],
          Produkt: [recProdukt],
          aktiv: true,
          Abrechnungsmodus: "monatlich",
          Leadziel: 40,
          "Preis netto": 45,
          plz_bereiche: "20000-22999",
          schwach_grenze: 450,
          "Storno-Fenster (Tage)": 7,
          "Erlaubte Stornogründe": ["recGrund1"],
          ...bezug,
        },
      },
    ],
    Kunden: [{ id: recKunde, createdTime: now, fields: { Name: customerName, Liefermethode: "E-Mail", "Empfaenger E-Mail": "leads@pivacom.example" } }],
    Produkte: [{ id: recProdukt, createdTime: now, fields: { Name: product } }],
    Stornogründe: [{ id: "recGrund1", createdTime: now, fields: { Grund: "Falsche Nummer" } }],
  };
}

describe("Pay-per-Lead: Import aus Airtable (wiederholbar, App-Einstellungen bleiben)", () => {
  let customerId = "";
  let customerName = "";
  beforeAll(async () => {
    requireTestDb();
    const c = await makeCustomer();
    customerId = c.id;
    customerName = c.name;
  });
  afterAll(async () => {
    await prisma.poolLead.deleteMany({ where: { productKey: product } });
    await cleanupCustomer(customerId);
  });

  it("Vorschau ändert nichts, Übernehmen legt den Bezug an", async () => {
    airtable(customerName);
    const preview = await importSubscriptions({ dryRun: true });
    expect(preview).toHaveLength(1);
    expect(preview[0]).toMatchObject({ action: "neu", delivery: "E-Mail (leads@pivacom.example)", changes: [], kept: [] });
    expect(await prisma.leadSubscription.count({ where: { airtableId: recBezug } })).toBe(0);

    await importSubscriptions({ dryRun: false });
    const sub = await prisma.leadSubscription.findUniqueOrThrow({ where: { airtableId: recBezug } });
    expect(sub).toMatchObject({ customerId, productKey: product, period: "month", goal: 40, delivery: "email", deliveryEmail: "leads@pivacom.example", weakThreshold: 450, stornoDays: 7, stornoReasons: ["Falsche Nummer"] });
    expect(Number(sub.price)).toBe(45);
  });

  it("erneutes Übernehmen behält Lieferweg, Zeitraum, Vorlage, Gebiete und „immer anerkennen“", async () => {
    const sub = await prisma.leadSubscription.findUniqueOrThrow({ where: { airtableId: recBezug } });
    // In der App eingestellt (Pilot / HvK-Vorlage)
    await prisma.leadSubscription.update({
      where: { id: sub.id },
      data: {
        period: "week",
        label: "HvK Hamburg",
        delivery: "email",
        deliveryEmail: "leads@pivacom.com",
        emailSubject: "Neuer Lead - Performancegrowth",
        emailTemplate: "Name: {nachname}\nLeadgen_ID: {id}",
        stornoAutoApprove: true,
      },
    });
    await prisma.subscriptionArea.create({ data: { subscriptionId: sub.id, label: "Hamburg", plzRanges: "20000-22999", quantity: 5 } });

    // Airtable: neuer Preis/Ziel, Lieferung inzwischen Webhook
    airtable(customerName, { "Preis netto": 50, Leadziel: 60 });
    tables.current.Kunden[0].fields = { Name: customerName, Liefermethode: "Webhook", "Webhook Url": "https://hook.example/x" };

    const preview = await importSubscriptions({ dryRun: true });
    expect(preview[0].action).toBe("aktualisieren");
    expect(preview[0].changes).toEqual(expect.arrayContaining(["Preis: 45 → 50", "Ziel: 40 → 60"]));
    expect(preview[0].changes.join(" ")).not.toMatch(/Lieferung|Zeitraum/);
    expect(preview[0].kept).toEqual(expect.arrayContaining(["Zeitraum: bleibt week (Airtable: month)", "Lieferung: bleibt email (Airtable: webhook)"]));
    expect(preview[0].delivery).toBe("E-Mail (leads@pivacom.com)");
    // Vorschau hat nichts geschrieben
    expect(Number((await prisma.leadSubscription.findUniqueOrThrow({ where: { id: sub.id } })).price)).toBe(45);

    await importSubscriptions({ dryRun: false });
    const after = await prisma.leadSubscription.findUniqueOrThrow({ where: { id: sub.id }, include: { areas: true } });
    expect(Number(after.price)).toBe(50);
    expect(after.goal).toBe(60);
    expect(after).toMatchObject({
      period: "week",
      label: "HvK Hamburg",
      delivery: "email",
      deliveryEmail: "leads@pivacom.com",
      emailSubject: "Neuer Lead - Performancegrowth",
      emailTemplate: "Name: {nachname}\nLeadgen_ID: {id}",
      webhookUrl: null,
      stornoAutoApprove: true,
    });
    expect(after.areas).toHaveLength(1);
    expect(await prisma.leadSubscription.count({ where: { customerId } })).toBe(1);

    // ohne Änderungen in Airtable: unverändert
    expect((await importSubscriptions({ dryRun: true }))[0]).toMatchObject({ action: "unverändert", changes: [] });
  });

  it("verknüpft einen in der App angelegten Bezug statt einen zweiten anzulegen", async () => {
    await prisma.leadSubscription.deleteMany({ where: { customerId } });
    const own = await prisma.leadSubscription.create({ data: { customerId, productKey: product, price: 39, period: "week", delivery: "app" } });
    airtable(customerName);
    const preview = await importSubscriptions({ dryRun: true });
    expect(preview[0]).toMatchObject({ action: "verknüpfen", delivery: "Kundenbereich" });
    expect(preview[0].changes).toContain("Preis: 39 → 45");
    await importSubscriptions({ dryRun: false });
    const subs = await prisma.leadSubscription.findMany({ where: { customerId } });
    expect(subs).toHaveLength(1);
    expect(subs[0]).toMatchObject({ id: own.id, airtableId: recBezug, period: "week", delivery: "app" });
  });

  it("überspringt, wenn mehrere unverknüpfte Bezüge für Kunde und Produkt da sind", async () => {
    await prisma.leadSubscription.deleteMany({ where: { customerId } });
    await prisma.leadSubscription.createMany({ data: [1, 2].map(() => ({ customerId, productKey: product, price: 39, period: "week" })) });
    airtable(customerName);
    expect((await importSubscriptions({ dryRun: false }))[0].action).toBe("übersprungen");
    expect(await prisma.leadSubscription.count({ where: { customerId } })).toBe(2);
    await prisma.leadSubscription.deleteMany({ where: { customerId } });
  });

  it("planReimport trennt übernommene und behaltene Felder", () => {
    const plan = planReimport({ period: "week", delivery: "app", price: 10, goal: null }, { period: "month", delivery: "email", price: 10, goal: 5, airtableId: "rec" });
    expect(plan.data).toEqual({ price: 10, goal: 5 });
    expect(plan.changes).toEqual(["Ziel: leer → 5"]);
    expect(plan.kept).toHaveLength(2);
  });

  it("Dubletten-Historie lässt sich gefahrlos wiederholen", async () => {
    tables.current = {
      Produkte: [{ id: recProdukt, createdTime: now, fields: { Name: product } }],
      Leads: [
        { id: `recLead1${tag}`, createdTime: now, fields: { "Produkt (Eingang)": [recProdukt], Telefonnummer: "0151 99887766", "E-Mail": "Hist@Test.local" } },
        { id: `recLead2${tag}`, createdTime: now, fields: { "Produkt (Eingang)": [recProdukt], Telefonnummer: "0151 1", Dublette: true } },
        { id: `recLead3${tag}`, createdTime: new Date(Date.now() - 40 * 86_400_000).toISOString(), fields: { "Produkt (Eingang)": [recProdukt], Telefonnummer: "0151 22" } },
      ],
    };
    expect(await importDuplicateHistory()).toBe(1);
    expect(await importDuplicateHistory()).toBe(1);
    const rows = await prisma.poolLead.findMany({ where: { productKey: product } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phone: "4915199887766", email: "hist@test.local", status: "delivered" });
  });
});
