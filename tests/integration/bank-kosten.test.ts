import { generateKeyPairSync } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { parseBankCsv } from "@/lib/bank/csv";
import { assignTransaction, finishBankConnection, importTransactions, monthlyBankCosts, runBankSync, syncConnection } from "@/lib/bank/server";
import { loadCosts, loadKpiSettings } from "@/lib/zahlen";
import { requireTestDb } from "./db";

// Bank & Karten gegen die Datenbank: Import idempotent, Regeln, Zuordnung → Zahlen-Seite,
// Enable-Banking-Verbindung (gemockter Dienst) mit state-Prüfung und Erinnerung vor Ablauf.
const tag = Math.random().toString(36).slice(2, 8);
const acc = `csv:test-${tag}`;
const M = "2031-05";

describe("Bank & Karten", () => {
  const connIds: string[] = [];
  beforeAll(async () => {
    requireTestDb();
    await prisma.bankTransaction.deleteMany({ where: { bookingDate: { gte: new Date("2031-05-01"), lt: new Date("2031-06-01") } } });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  afterAll(async () => {
    await prisma.bankTransaction.deleteMany({ where: { OR: [{ accountKey: acc }, { accountKey: { startsWith: `eb-${tag}` } }] } });
    await prisma.bankConnection.deleteMany({ where: { id: { in: connIds } } });
    await prisma.costRule.deleteMany({ where: { pattern: { in: [`baeckerei ${tag}`] } } });
    await prisma.salesTask.deleteMany({ where: { title: { contains: `Testbank ${tag}` } } });
  });

  const csv = [
    "Buchungstag;Wertstellung;Umsatzart;Buchungstext;Betrag;Währung",
    `03.05.2031;03.05.2031;Lastschrift;ANTHROPIC PBC 4711;-119,00;EUR`,
    `04.05.2031;04.05.2031;Lastschrift;Baeckerei ${tag} 1;-11,90;EUR`,
    `05.05.2031;05.05.2031;Lastschrift;Baeckerei ${tag} 2;-23,80;EUR`,
    `06.05.2031;06.05.2031;Lastschrift;FACEBK ADS 99;-500,00;EUR`,
    `07.05.2031;07.05.2031;Gutschrift;Stripe Auszahlung;2.000,00;EUR`,
  ].join("\n");

  it("Import: Regeln greifen, zweiter Import legt nichts doppelt an", async () => {
    const rows = parseBankCsv(csv).rows;
    const a = await importTransactions(acc, rows, { source: "csv" });
    expect(a).toMatchObject({ total: 5, created: 5, assigned: 1, ignored: 2, open: 2 });
    const b = await importTransactions(acc, rows, { source: "csv" });
    expect(b).toMatchObject({ created: 0, existing: 5 });
    expect(await prisma.costRule.findUnique({ where: { pattern: "anthropic" } })).toMatchObject({ action: "software" });
  });

  it("Zuordnen mit „immer so“ legt Regel an und ordnet offene gleiche Buchungen mit zu", async () => {
    const t = await prisma.bankTransaction.findFirstOrThrow({ where: { accountKey: acc, purpose: { endsWith: " 1" }, status: "neu" } });
    const r = await assignTransaction(t.id, "betrieb", { always: true, pattern: `Baeckerei ${tag}`, vatIncluded: true });
    expect(r.applied).toBe(1);
    expect(await prisma.bankTransaction.count({ where: { accountKey: acc, status: "neu" } })).toBe(0);
  });

  it("Zugeordnete Ausgaben fließen netto je Zweck in die Zahlen-Seite", async () => {
    const bank = (await monthlyBankCosts(new Date("2031-05-01"))).get(M)!;
    expect(bank.software).toBe(119); // Anthropic ohne deutsche USt (Standardregel)
    expect(bank.betrieb).toBe(30); // 11,90 + 23,80 brutto → 10 + 20 netto
    expect(bank.akquise).toBe(0); // Meta ignoriert (kommt per API)
    const { costs } = await loadCosts([M], await loadKpiSettings(), new Date("2031-06-15T12:00:00Z"));
    expect(costs[0].bank).toBe(149);
    expect(costs[0].software).toBeGreaterThanOrEqual(119);
    expect(costs[0].betrieb).toBeGreaterThanOrEqual(30);
  });

  it("Enable Banking: Verbindung nur mit passendem state, Abruf importiert, Erinnerung vor Ablauf", async () => {
    const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    vi.stubEnv("ENABLE_BANKING_APP_ID", "app-test");
    vi.stubEnv("ENABLE_BANKING_PRIVATE_KEY", privateKey.export({ type: "pkcs8", format: "pem" }).toString());
    vi.stubEnv("ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
    const { createHash } = await import("node:crypto");
    const state = `state-${tag}`;
    const conn = await prisma.bankConnection.create({
      data: { aspspName: `Testbank ${tag}`, stateHash: createHash("sha256").update(state).digest("hex"), validUntil: new Date(Date.now() + 5 * 86400000) },
    });
    connIds.push(conn.id);
    expect(await finishBankConnection("code", "falscher-state")).toMatchObject({ error: expect.any(String) });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/sessions"))
          return new Response(JSON.stringify({ session_id: "sess-geheim", accounts: [{ uid: `eb-${tag}-1`, name: "Geschäftskonto", account_id: { iban: "DE89370400440532013000" } }], access: { valid_until: new Date(Date.now() + 5 * 86400000).toISOString() } }), { status: 200 });
        if (url.includes("/transactions"))
          return new Response(
            JSON.stringify({
              transactions: [
                { transaction_id: "tx1", transaction_amount: { amount: "97.00", currency: "EUR" }, credit_debit_indicator: "DBIT", status: "BOOK", booking_date: "2031-05-10", creditor: { name: "Instantly" } },
                { transaction_id: "tx2", transaction_amount: { amount: "50.00", currency: "EUR" }, credit_debit_indicator: "DBIT", status: "PDNG", booking_date: "2031-05-11", creditor: { name: "Offen" } },
              ],
            }),
            { status: 200 },
          );
        return new Response("{}", { status: 404 });
      }),
    );
    const ok = await finishBankConnection("code", state);
    expect(ok).toMatchObject({ ok: true });
    const saved = await prisma.bankConnection.findUniqueOrThrow({ where: { id: conn.id } });
    expect(saved.status).toBe("active");
    expect(saved.sessionEnc).not.toContain("sess-geheim"); // verschlüsselt
    expect(JSON.stringify(saved.accounts)).not.toContain("0532013000"); // IBAN gekürzt
    expect(await finishBankConnection("code", state)).toMatchObject({ error: expect.any(String) }); // state nur einmal

    const s = await syncConnection(conn.id);
    expect(s).toMatchObject({ created: 1, assigned: 1 }); // nur gebuchte, Instantly → Kundengewinnung
    const r = await runBankSync(new Date());
    expect(r.reminded).toBeGreaterThanOrEqual(1);
    expect(await prisma.salesTask.count({ where: { title: { contains: `Testbank ${tag} neu verbinden` } } })).toBe(1);
    // Zweiter Lauf: keine zweite Erinnerung, kein erneuter Abruf (höchstens alle 20 Stunden)
    const again = await runBankSync(new Date());
    expect(await prisma.salesTask.count({ where: { title: { contains: `Testbank ${tag} neu verbinden` } } })).toBe(1);
    expect(again.synced).toBe(0);
  });
});
