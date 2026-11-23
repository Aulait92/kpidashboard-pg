// Testlead (Ole, 17.11.2026, lib/testlead.ts): Produktauswahl (Testkunden und interne Kunden: alle aktiven Produkte,
// bekannte zuerst), Schutz bei echten Kunden (Action lehnt ohne Bestätigung ab), echte Leads mit derselben Nummer
// beim Testkunden werden zum Test, eingehende Chats beim Testkunden legen Testleads an. Prisma gemockt.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Fn = ReturnType<typeof vi.fn>;
const db = vi.hoisted(() => ({ models: {} as Record<string, Record<string, Fn>> }));

vi.mock("@/lib/prisma", () => {
  const defaults: Record<string, unknown> = { findUnique: null, findFirst: null, findMany: [], count: 0, create: { id: "neu" }, update: {}, updateMany: { count: 0 }, deleteMany: { count: 0 }, delete: {} };
  const model = (name: string) =>
    (db.models[name] ??= new Proxy({} as Record<string, Fn>, {
      get: (t, m: string) => (t[m] ??= vi.fn(async () => defaults[m] ?? null)),
    }));
  const prisma = new Proxy({} as Record<string, unknown>, {
    get: (_t, k: string) => (k === "$transaction" ? async (ops: unknown[]) => Promise.all(ops) : model(k)),
  });
  return { prisma };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
const session = vi.hoisted(() => ({ current: { userId: "a1", email: "ole@test.local", role: "ADMIN" } as null | { userId: string; email: string; role: string } }));
vi.mock("@/lib/auth", () => ({ getCurrentSession: async () => session.current }));
const audits = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/lib/audit", () => ({ audit: async (...a: unknown[]) => void audits.calls.push(a) }));
const processed = vi.hoisted(() => ({ ids: [] as string[] }));
vi.mock("@/lib/lead-intake", () => ({ processNewLead: async (id: string) => void processed.ids.push(id) }));
vi.mock("@/lib/whatsapp/lead-link", () => ({ linkLeadToConversation: async () => {} }));
vi.mock("@/lib/team", () => ({ assignLead: async () => {} }));
vi.mock("@/lib/lead-history", () => ({ logLeadHistory: async () => {} }));

import { prisma } from "@/lib/prisma";
import { inboundLeadIsTest, isTestLeadSandbox, mergeProductNames, testLeadProducts } from "@/lib/testlead";
import { sendTestLeadAction } from "@/app/admin/kunden/[id]/leads/testlead-actions";
import { alsLeadUebernehmen } from "@/lib/whatsapp/nur-leads";

const m = (name: string) => (prisma as unknown as Record<string, Record<string, Fn>>)[name];
const CATALOG = ["PKV Wechsel", "PKV-Tarifoptimierung", "Katzenkrankenversicherung", "Zahnzusatz"].map((name) => ({ name }));

function setupProducts(customer: { isTest: boolean; plan: string }, known: string[]) {
  m("customer").findUnique.mockResolvedValue(customer);
  m("customerProduct").findMany.mockResolvedValue(known.map((name) => ({ product: { name } })));
  m("leadSource").findMany.mockResolvedValue([{ productKey: "pkv wechsel" }]);
  m("lead").findMany.mockResolvedValue([]);
  m("product").findMany.mockResolvedValue(CATALOG);
  m("leadSubscription").findMany.mockResolvedValue([]);
  m("onboarding").findUnique.mockResolvedValue(null);
}

beforeEach(() => {
  for (const model of Object.values(db.models)) for (const fn of Object.values(model)) fn.mockReset();
  audits.calls = [];
  processed.ids = [];
  session.current = { userId: "a1", email: "ole@test.local", role: "ADMIN" };
  vi.spyOn(console, "log").mockImplementation(() => {});
});

describe("Testkunde oder intern", () => {
  it("isTest oder plan internal; echte Kunden und fehlende Kunden nicht", () => {
    expect(isTestLeadSandbox({ isTest: true, plan: "software" })).toBe(true);
    expect(isTestLeadSandbox({ isTest: false, plan: "internal" })).toBe(true);
    expect(isTestLeadSandbox({ isTest: false, plan: "software" })).toBe(false);
    expect(isTestLeadSandbox(null)).toBe(false);
  });
});

describe("Produktauswahl", () => {
  it("führt zusammen: Reihenfolge bleibt, leer und doppelt (Groß-/Kleinschreibung) fallen weg", () => {
    expect(mergeProductNames(["PKV Wechsel", " ", "pkv wechsel"], ["Zahnzusatz", "PKV Wechsel "])).toEqual(["PKV Wechsel", "Zahnzusatz"]);
  });

  it("Testkunde: bekannte Produkte zuerst, dann alle übrigen aktiven", async () => {
    setupProducts({ isTest: true, plan: "software" }, ["PKV Wechsel"]);
    expect(await testLeadProducts("c1")).toEqual(["PKV Wechsel", "PKV-Tarifoptimierung", "Katzenkrankenversicherung", "Zahnzusatz"]);
    expect(m("product").findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }));
  });

  it("interner Kunde: ebenso alle aktiven Produkte", async () => {
    setupProducts({ isTest: false, plan: "internal" }, ["Zahnzusatz"]);
    expect(await testLeadProducts("c1")).toEqual(["Zahnzusatz", "pkv wechsel", "PKV-Tarifoptimierung", "Katzenkrankenversicherung"]);
  });

  it("echter Kunde: nur seine bekannten Produkte, ohne bekannte alle aktiven (wie bisher)", async () => {
    setupProducts({ isTest: false, plan: "software" }, ["PKV Wechsel"]);
    expect(await testLeadProducts("c1")).toEqual(["PKV Wechsel"]);
    expect(m("product").findMany).not.toHaveBeenCalled();

    setupProducts({ isTest: false, plan: "software" }, []);
    m("leadSource").findMany.mockResolvedValue([]);
    expect(await testLeadProducts("c1")).toEqual(CATALOG.map((p) => p.name));
  });
});

describe("Testlead mit gebuchtem Produkt (Ole, 21.11.2026)", () => {
  beforeEach(() => {
    for (const model of Object.values(db.models)) for (const fn of Object.values(model)) fn.mockReset();
  });

  it("echter Kunde: nur gebuchte Produkte (Bezug, Angebot), nicht zuletzt genutzte oder der Katalog", async () => {
    setupProducts({ isTest: false, plan: "ppl_software" }, []);
    m("leadSource").findMany.mockResolvedValue([]);
    m("leadSubscription").findMany.mockResolvedValue([{ productKey: "Privatschutz" }]);
    m("onboarding").findUnique.mockResolvedValue({ offerId: "o1" });
    m("offer").findUnique.mockResolvedValue({ products: [], pplProductKey: null, pplProdukte: [{ name: "Kindersparplan", preis: 65, menge: 23 }] });
    m("lead").findMany.mockResolvedValue([{ source: "TKV-Katze" }]);
    expect(await testLeadProducts("c1")).toEqual(["Privatschutz", "Kindersparplan"]);
    expect(m("product").findMany).not.toHaveBeenCalled();
  });

  it("Produkt aus dem Angebot (Kampagnen) zählt als gebucht", async () => {
    setupProducts({ isTest: false, plan: "software" }, []);
    m("leadSource").findMany.mockResolvedValue([]);
    m("onboarding").findUnique.mockResolvedValue({ offerId: "o1" });
    m("offer").findUnique.mockResolvedValue({ products: [{ name: "Zahnzusatz", dailyBudget: 20 }], pplProductKey: null, pplProdukte: null });
    m("lead").findMany.mockResolvedValue([{ source: "PKV Wechsel" }]);
    expect(await testLeadProducts("c1")).toEqual(["Zahnzusatz"]);
  });
});

describe("Schutz bei echten Kunden", () => {
  const input = { customerId: "c1", name: "Test", product: "PKV Wechsel", phone: "015112345678" };

  it("Action lehnt ohne Bestätigung ab, es entsteht kein Lead", async () => {
    m("customer").findUnique.mockResolvedValue({ id: "c1", isTest: false, plan: "software", dormantSince: null, leadAddress: "sie" });
    for (const confirmed of [undefined, false]) {
      const r = await sendTestLeadAction({ ...input, confirmed });
      expect(r).toEqual({ ok: false, error: "Echter Kunde: Bitte „Verstanden, an echten Kunden senden“ anhaken.", needsConfirm: true });
    }
    expect(m("lead").create).not.toHaveBeenCalled();
    expect(processed.ids).toHaveLength(0);
  });

  it("echter Kunde, Nummer eines echten Leads: bleibt gesperrt, auch mit Bestätigung", async () => {
    m("customer").findUnique.mockResolvedValue({ id: "c1", isTest: false, plan: "software", dormantSince: null, leadAddress: "sie" });
    m("lead").findMany.mockResolvedValue([{ id: "echt1", name: "Echt" }]);
    const r = await sendTestLeadAction({ ...input, confirmed: true });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/echten Lead/) });
    expect(m("lead").update).not.toHaveBeenCalled();
    expect(m("lead").create).not.toHaveBeenCalled();
  });

  it("Testkunde ohne Bestätigung, Produkt ohne Buchung: Lead mit Formularangaben des Produkts; echter Lead derselben Nummer wird Test und ersetzt", async () => {
    m("customer").findUnique.mockResolvedValue({ id: "c1", isTest: true, plan: "software", dormantSince: null, leadAddress: "sie" });
    m("lead").findMany.mockImplementation(async (a: { where: { isTest?: boolean } }) => (a.where.isTest === false ? [{ id: "echt1", name: "Echt" }] : [{ id: "echt1" }]));
    m("lead").findUnique.mockImplementation(async (a: { where: { id: string } }) => (a.where.id === "echt1" ? { id: "echt1", customerId: "c1", isTest: true, name: "Echt" } : { outreachStatus: "sent" }));
    m("lead").create.mockResolvedValue({ id: "t1" });
    const r = await sendTestLeadAction({ ...input, product: "Katzenkrankenversicherung" });
    expect(r).toMatchObject({ ok: true, leadId: "t1" });
    expect(m("lead").update).toHaveBeenCalledWith({ where: { id: "echt1" }, data: { isTest: true } });
    expect(audits.calls.map((c) => c[0])).toEqual(expect.arrayContaining(["lead.test_mark", "lead.test_delete", "lead.test_create"]));
    expect(m("lead").delete).toHaveBeenCalledWith({ where: { id: "echt1" } });
    const data = m("lead").create.mock.calls[0][0].data;
    expect(data).toMatchObject({ customerId: "c1", isTest: true, source: "Katzenkrankenversicherung" });
    expect(data.formData).toEqual(expect.arrayContaining([{ label: "Tierart", value: "Katze" }]));
    // keine Abrechnung, keine Buchung, kein anderer Kunde
    expect(m("customerProduct").create).not.toHaveBeenCalled();
    expect(m("revenue").create).not.toHaveBeenCalled();
    for (const c of m("lead").create.mock.calls) expect(c[0].data.customerId).toBe("c1");
    expect(processed.ids).toEqual(["t1"]);
  });
});

describe("eingehende Chats beim Testkunden", () => {
  it("inboundLeadIsTest folgt Testkunde bzw. intern", async () => {
    m("customer").findUnique.mockResolvedValueOnce({ isTest: true, plan: "software" });
    expect(await inboundLeadIsTest("c1")).toBe(true);
    m("customer").findUnique.mockResolvedValueOnce({ isTest: false, plan: "internal" });
    expect(await inboundLeadIsTest("c1")).toBe(true);
    m("customer").findUnique.mockResolvedValueOnce({ isTest: false, plan: "software" });
    expect(await inboundLeadIsTest("c1")).toBe(false);
  });

  it.each([
    [{ isTest: true, plan: "software" }, true],
    [{ isTest: false, plan: "software" }, false],
  ])("„Als Lead übernehmen“ (%o) legt den Lead mit isTest=%s an", async (customer, isTest) => {
    m("conversation").findFirst.mockResolvedValue({ id: "conv1", leadId: null, contactPhone: "4915112345678", contactName: "Ole", contactEmail: null });
    m("customer").findUnique.mockResolvedValue(customer);
    m("lead").create.mockResolvedValue({ id: "l9" });
    const r = await alsLeadUebernehmen({ conversationId: "conv1", customerId: "c-sandbox", userId: null });
    expect(r).toEqual({ ok: true, leadId: "l9" });
    expect(m("lead").create.mock.calls[0][0].data).toMatchObject({ customerId: "c-sandbox", isTest });
  });
});
