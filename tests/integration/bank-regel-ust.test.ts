// Ops-Aktionen bank_regel_ust und bank_ruecklastschriften_verrechnen, Diagnose bank-regeln, BWA-Zeile Steuerberater
// (Ole, 25.11.2026). Gemeinsame Test-DB → nur eigene Posten (Konto/Muster mit Zufallskennung) prüfen.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { POST } from "@/app/api/ops/aktion/route";
import { bankRegeln } from "@/lib/ops/bank-regeln";
import { loadBwa } from "@/lib/bwa";
import { importTransactions } from "@/lib/bank/server";
import { requireTestDb } from "./db";

const TOKEN = "a".repeat(40);
const post = (body: unknown) =>
  POST(new Request("http://x/api/ops/aktion", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` }, body: JSON.stringify(body) }));
const tag = Math.random().toString(36).slice(2, 8);
const acct = `csv:rust${tag}`;
const MUSTER = `gc re phdrmuellerstbg ${tag}`;
const d = (s: string) => new Date(`${s}T00:00:00Z`);
const NOW = new Date("2026-11-20T12:00:00Z");

describe("Bankregel USt, Rücklastschriften, Steuerberater-Zeile", () => {
  let ruleId = "";
  let googleId = "";

  beforeAll(async () => {
    requireTestDb();
    process.env.OPS_ACTION_TOKEN = TOKEN;
    ruleId = (await prisma.costRule.create({ data: { pattern: MUSTER, action: "betrieb", vatIncluded: false, label: `GC RE PHDRMUELLERSTBG ${tag}` } })).id;
    googleId = (await prisma.costRule.create({ data: { pattern: `google cloud emea ${tag}`, action: "software", vatIncluded: false, label: "Google Cloud EMEA Limited" } })).id;
    const cp = `GC RE PHDRMUELLERSTBG ${tag}`;
    const base = { accountKey: acct, source: "csv", counterparty: cp, status: "zugeordnet", costPurpose: "betrieb", vatIncluded: false, ruleId };
    await prisma.bankTransaction.createMany({
      data: [
        { ...base, externalId: "1", bookingDate: d("2026-05-04"), amount: -297.5, purpose: `Lastschrift End-to-End-Ref.: D-${tag}-1` },
        { ...base, externalId: "2", bookingDate: d("2026-05-18"), amount: -297.5, purpose: `Lastschrift End-to-End-Ref.: D-${tag}-2` },
        { ...base, externalId: "3", bookingDate: d("2026-05-04"), amount: -160.65, purpose: `Lastschrift End-to-End-Ref.: D-${tag}-3` },
        { ...base, externalId: "4", bookingDate: d("2026-05-18"), amount: -160.65, purpose: `Lastschrift End-to-End-Ref.: D-${tag}-4` },
        // Überweisung an die Kanzlei, von Hand zugeordnet (ohne Regel)
        { ...base, externalId: "5", bookingDate: d("2026-05-13"), amount: -3430.98, counterparty: `PhDr. Mueller Treuhand GmbH ${tag}`, purpose: "RE 2026-17", ruleId: null, vatIncluded: true },
        { accountKey: acct, source: "csv", externalId: "6", bookingDate: d("2026-05-07"), amount: -8.1, counterparty: `Google Cloud EMEA Limited ${tag}`, status: "zugeordnet", costPurpose: "software", ruleId: googleId },
      ],
    });
  });

  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { accountKey: acct } });
    await prisma.costRule.deleteMany({ where: { id: { in: [ruleId, googleId] } } });
    await prisma.auditLog.deleteMany({ where: { action: "bank.regel_ust", entityId: ruleId } });
  });

  it("Diagnose bank-regeln: Verdacht für Steuerberater ohne USt, nicht für Google Cloud EMEA", async () => {
    const r = await bankRegeln(new URLSearchParams());
    const stb = r.regeln.find((x) => x.muster === MUSTER)!;
    expect(stb).toMatchObject({ quelle: "db", inklUst: false, buchungen: 4, verdacht: true, summe2026: { brutto: 916.3, netto: 916.3 } });
    expect(stb.beispiele).toEqual([`GC RE PHDRMUELLERSTBG ${tag}`]);
    const g = r.regeln.find((x) => x.muster === `google cloud emea ${tag}`)!;
    expect(g.verdacht).toBe(false);
    expect(g.grund).toMatch(/Reverse Charge/);
    expect(r.regeln.some((x) => x.quelle === "standard")).toBe(true);
    expect(JSON.stringify(r)).not.toMatch(/DE\d{20}/);
  });

  it("bank_regel_ust: Vorschau ändert nichts, echter Lauf setzt Regel und Buchungen (297,50 → 250,00; 160,65 → 135,00)", async () => {
    const v = await (await post({ aktion: "bank_regel_ust", muster: MUSTER, inklUst: true, vorschau: true })).json();
    expect(v.ok).toBe(true);
    expect(v.daten).toMatchObject({ vorschau: true, buchungen: 4, geaendert: 4, nettoVorher: 916.3, nettoNachher: 770, differenz: -146.3 });
    expect(v.daten.jahr2026).toEqual({ nettoVorher: 916.3, nettoNachher: 770, differenz: -146.3 });
    expect(v.daten.jeMonat).toEqual([{ monat: "2026-05", anzahl: 4, brutto: 916.3, nettoVorher: 916.3, nettoNachher: 770 }]);
    expect((await prisma.costRule.findUnique({ where: { id: ruleId } }))?.vatIncluded).toBe(false);
    expect(await prisma.bankTransaction.count({ where: { ruleId, vatIncluded: true } })).toBe(0);

    // Teil des Musters reicht, wenn eindeutig
    const e = await (await post({ aktion: "bank_regel_ust", muster: `phdrmuellerstbg ${tag}`, inklUst: true })).json();
    expect(e.ok).toBe(true);
    expect(e.daten).toMatchObject({ vorschau: false, nettoNachher: 770 });
    expect((await prisma.costRule.findUnique({ where: { id: ruleId } }))?.vatIncluded).toBe(true);
    const rows = await prisma.bankTransaction.findMany({ where: { ruleId }, select: { vatIncluded: true, status: true, costPurpose: true } });
    expect(rows.every((r) => r.vatIncluded && r.status === "zugeordnet" && r.costPurpose === "betrieb")).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "bank.regel_ust", entityId: ruleId, actorEmail: "ops-aktion (Claude)" } })).toBe(1);

    const b = await loadBwa("2026", NOW);
    const mine = b.items.filter((i) => i.label.includes(tag) && i.month === "2026-05");
    const nets = mine.filter((i) => i.line === "betrieb:Steuerberater").map((i) => i.net).sort((x, y) => x - y);
    expect(nets).toEqual([135, 135, 250, 250, 2883.18]);

    expect((await (await post({ aktion: "bank_regel_ust", muster: "gc", inklUst: true })).json()).ok).toBe(false);
  });

  it("Rücklastschriften: Import verknüpft Rückbuchung und Lastschrift; Ops-Aktion findet bestehende Paare", async () => {
    // bestehende Rückbuchung wie in Produktion: als Einnahme ignoriert
    await prisma.bankTransaction.create({
      data: { accountKey: acct, source: "csv", externalId: "7", bookingDate: d("2026-05-08"), amount: 297.5, counterparty: `GC RE PHDRMUELLERSTBG ${tag}`, purpose: `Rückgabegrund: MD06 End-to-End-Ref.: D-${tag}-1`, status: "ignoriert", note: "Einnahme" },
    });
    // BWA zählt die zurückgegebene Lastschrift schon vor dem Verrechnen nicht
    let b = await loadBwa("2026", NOW);
    expect(b.items.filter((i) => i.label.includes(tag) && i.line === "betrieb:Steuerberater").map((i) => i.net).sort((x, y) => x - y)).toEqual([135, 135, 250, 2883.18]);

    const v = await (await post({ aktion: "bank_ruecklastschriften_verrechnen", vorschau: true })).json();
    const meins = v.daten.liste.filter((x: { gegenpartei: string }) => x.gegenpartei?.includes(tag));
    expect(meins).toEqual([{ lastschrift: "2026-05-04", rueckbuchung: "2026-05-08", betrag: 297.5, gegenpartei: `GC RE PHDRMUELLERSTBG ${tag}`, ueber: "referenz", statusVorher: "zugeordnet", nettoBisher: 250 }]);
    expect((await prisma.bankTransaction.findFirst({ where: { accountKey: acct, externalId: "1" } }))?.status).toBe("zugeordnet");

    expect((await (await post({ aktion: "bank_ruecklastschriften_verrechnen" })).json()).ok).toBe(true);
    const l = await prisma.bankTransaction.findFirst({ where: { accountKey: acct, externalId: "1" } });
    const r = await prisma.bankTransaction.findFirst({ where: { accountKey: acct, externalId: "7" } });
    expect(l).toMatchObject({ status: "ignoriert", costPurpose: null });
    expect(l?.note).toMatch(/^zurückgegeben/);
    expect(r?.note).toMatch(/^Rücklastschrift zu Lastschrift/);

    // Import: neue Rückbuchung (vor ihrer Lastschrift im CSV) wird sofort verrechnet
    const s = await importTransactions(
      acct,
      [
        { externalId: "9", bookingDate: "2026-05-22", amount: 160.65, currency: "EUR", counterparty: `GC RE PHDRMUELLERSTBG ${tag}`, purpose: `Rückgabegrund: AC04 End-to-End-Ref.: D-${tag}-8` },
        { externalId: "8", bookingDate: "2026-05-20", amount: -160.65, currency: "EUR", counterparty: `GC RE PHDRMUELLERSTBG ${tag}`, purpose: `Lastschrift End-to-End-Ref.: D-${tag}-8` },
        { externalId: "10", bookingDate: "2026-05-22", amount: -1.9, currency: "EUR", counterparty: "Commerzbank", purpose: "BENACHRICHTIGUNGSENTGELT RUECKGABE VON LASTSCHRIFTEN" },
      ],
      { source: "csv" },
    );
    expect(s.created).toBe(3);
    const neu = await prisma.bankTransaction.findMany({ where: { accountKey: acct, externalId: { in: ["8", "9", "10"] } }, orderBy: { externalId: "asc" } });
    const by = Object.fromEntries(neu.map((t) => [t.externalId, t]));
    expect(by["8"]).toMatchObject({ status: "ignoriert" });
    expect(by["8"].note).toMatch(/^zurückgegeben/);
    expect(by["9"].note).toMatch(/^Rücklastschrift zu Lastschrift/);
    expect(by["10"].status).not.toBe("ignoriert");

    b = await loadBwa("2026", NOW);
    expect(b.items.filter((i) => i.label.includes(tag) && i.line === "betrieb:Steuerberater").map((i) => i.net).sort((x, y) => x - y)).toEqual([135, 135, 250, 2883.18]);
    const diag = await bankRegeln(new URLSearchParams({ regel: MUSTER }));
    expect((diag.einzeln as { bwaZeile: string | null }[]).filter((x) => x.bwaZeile).every((x) => x.bwaZeile === "betrieb:Steuerberater")).toBe(true);
    expect(diag.steuerberater.buchungen.filter((x) => x.gegenpartei?.includes(tag) && x.bwaZeile).length).toBe(4);
  });
});
