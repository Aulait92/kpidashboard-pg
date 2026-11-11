// Bank & Karten: Import, Zuordnung, Abruf über Enable Banking, Kosten je Monat.
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret } from "@/lib/encryption";

/** Session-ID der Verbindung (nur zum Trennen). */
export function sessionIdOf(conn: { sessionEnc: string | null }): string | null {
  return conn.sessionEnc ? decryptSecret(conn.sessionEnc) : null;
}
import { getAppUrl } from "@/lib/email";
import { classify, netCost, type CostAction, type CostPurposeKey, type Rule } from "@/lib/bank/rules";
import type { ParsedTx } from "@/lib/bank/csv";
import * as eb from "@/lib/bank/enable-banking";

const DAY = 86_400_000;
export const BANK_CONSENT_DAYS = 180;
/** Erinnerung so viele Tage vor Ablauf der Bank-Zustimmung. */
export const BANK_REMIND_DAYS = 7;

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

async function ownRules(): Promise<Rule[]> {
  const rows = await prisma.costRule.findMany();
  return rows.map((r) => ({ id: r.id, pattern: r.pattern, action: r.action as CostAction, vatIncluded: r.vatIncluded, label: r.label }));
}

export type ImportStats = { total: number; created: number; existing: number; assigned: number; ignored: number; open: number };

/**
 * Buchungen speichern (idempotent je Konto + externer ID). Neue Buchungen
 * werden über Regeln vorgeschlagen; bestehende bleiben unverändert (auch eine
 * von Hand getroffene Zuordnung).
 */
export async function importTransactions(
  accountKey: string,
  rows: ParsedTx[],
  opts: { source: "enablebanking" | "csv"; connectionId?: string | null },
): Promise<ImportStats> {
  const stats: ImportStats = { total: rows.length, created: 0, existing: 0, assigned: 0, ignored: 0, open: 0 };
  if (!rows.length) return stats;
  const rules = await ownRules();
  const existing = new Set(
    (await prisma.bankTransaction.findMany({ where: { accountKey, externalId: { in: rows.map((r) => r.externalId) } }, select: { externalId: true } })).map((r) => r.externalId),
  );
  const ruleIdByPattern = new Map<string, string>();
  for (const r of rows) {
    if (existing.has(r.externalId)) {
      stats.existing++;
      continue;
    }
    const c = classify(r, rules);
    let ruleId = c.rule?.id ?? null;
    if (c.rule && !ruleId) {
      // Standardregel: als eigene Regel speichern, damit sie sichtbar und änderbar ist
      ruleId = ruleIdByPattern.get(c.rule.pattern) ?? null;
      if (!ruleId) {
        const saved = await prisma.costRule.upsert({
          where: { pattern: c.rule.pattern },
          create: { pattern: c.rule.pattern, action: c.rule.action, vatIncluded: !!c.rule.vatIncluded, label: c.rule.label ?? "Standardregel" },
          update: {},
        });
        ruleId = saved.id;
        ruleIdByPattern.set(c.rule.pattern, ruleId);
      }
    }
    await prisma.bankTransaction
      .create({
        data: {
          accountKey,
          externalId: r.externalId,
          source: opts.source,
          connectionId: opts.connectionId ?? null,
          bookingDate: new Date(`${r.bookingDate}T00:00:00Z`),
          amount: r.amount,
          currency: r.currency || "EUR",
          counterparty: r.counterparty?.slice(0, 200) ?? null,
          purpose: r.purpose?.slice(0, 500) ?? null,
          status: c.status,
          costPurpose: c.costPurpose,
          vatIncluded: c.vatIncluded,
          ruleId: c.status === "neu" ? null : ruleId,
          note: c.reason ?? null,
          assignedAt: c.status === "neu" ? null : new Date(),
        },
      })
      .then(() => {
        stats.created++;
        if (c.status === "zugeordnet") stats.assigned++;
        else if (c.status === "ignoriert") stats.ignored++;
        else stats.open++;
      })
      .catch((err: { code?: string }) => {
        if (err.code === "P2002") stats.existing++; // parallel schon angelegt
        else throw err;
      });
  }
  return stats;
}

/** Buchung zuordnen; mit „immer so“ wird eine Regel angelegt und auf offene Buchungen angewendet. */
export async function assignTransaction(id: string, action: CostAction, opts: { vatIncluded?: boolean; always?: boolean; pattern?: string | null }) {
  const tx = await prisma.bankTransaction.findUniqueOrThrow({ where: { id } });
  let ruleId: string | null = null;
  if (opts.always && opts.pattern?.trim()) {
    const pattern = opts.pattern.trim().toLowerCase().slice(0, 80);
    const rule = await prisma.costRule.upsert({
      where: { pattern },
      create: { pattern, action, vatIncluded: !!opts.vatIncluded, label: tx.counterparty ?? null },
      update: { action, vatIncluded: !!opts.vatIncluded },
    });
    ruleId = rule.id;
  }
  await prisma.bankTransaction.update({
    where: { id },
    data: {
      status: action === "ignore" ? "ignoriert" : "zugeordnet",
      costPurpose: action === "ignore" ? null : (action as CostPurposeKey),
      vatIncluded: action === "ignore" ? false : !!opts.vatIncluded,
      ruleId,
      note: null,
      assignedAt: new Date(),
    },
  });
  let applied = 0;
  if (ruleId) applied = await applyRuleToOpen(ruleId);
  return { applied };
}

/** Regel auf noch offene Buchungen anwenden. */
export async function applyRuleToOpen(ruleId: string): Promise<number> {
  const rule = await prisma.costRule.findUnique({ where: { id: ruleId } });
  if (!rule) return 0;
  const open = await prisma.bankTransaction.findMany({ where: { status: "neu" }, select: { id: true, amount: true, counterparty: true, purpose: true } });
  const r: Rule = { id: rule.id, pattern: rule.pattern, action: rule.action as CostAction, vatIncluded: rule.vatIncluded };
  let n = 0;
  for (const t of open) {
    const c = classify({ amount: Number(t.amount), counterparty: t.counterparty, purpose: t.purpose }, [r], []);
    if (c.rule?.id !== rule.id) continue;
    await prisma.bankTransaction.update({
      where: { id: t.id },
      data: { status: c.status, costPurpose: c.costPurpose, vatIncluded: c.vatIncluded, ruleId: rule.id, assignedAt: new Date() },
    });
    n++;
  }
  return n;
}

/** Netto-Kosten je Monat (YYYY-MM, Berliner Zeit) und Zweck aus zugeordneten Buchungen. */
export async function monthlyBankCosts(from: Date): Promise<Map<string, Record<CostPurposeKey, number>>> {
  const rows = await prisma.bankTransaction.findMany({
    where: { status: "zugeordnet", bookingDate: { gte: from }, amount: { lt: 0 }, costPurpose: { not: null } },
    select: { bookingDate: true, amount: true, costPurpose: true, vatIncluded: true },
  });
  const out = new Map<string, Record<CostPurposeKey, number>>();
  for (const r of rows) {
    const m = r.bookingDate.toISOString().slice(0, 7);
    const cur = out.get(m) ?? { ppl: 0, software: 0, akquise: 0, betrieb: 0 };
    const k = (["ppl", "software", "akquise", "betrieb"].includes(r.costPurpose!) ? r.costPurpose : "betrieb") as CostPurposeKey;
    cur[k] = Math.round((cur[k] + netCost(Number(r.amount), r.vatIncluded)) * 100) / 100;
    out.set(m, cur);
  }
  return out;
}

// ─── Enable Banking: Verbinden und Abrufen ───────────────────────────────

export function bankRedirectUrl(): string {
  return `${getAppUrl().replace(/\/+$/, "")}/api/bank/callback`;
}

/** Weiterleitung zur Bank starten. Gibt die Bank-URL zurück. */
export async function startBankConnection(aspspName: string, userId: string | null): Promise<{ url: string } | { error: string }> {
  if (!eb.enableBankingConfigured()) return { error: "Enable Banking ist noch nicht eingerichtet (Variablen ENABLE_BANKING_APP_ID und ENABLE_BANKING_PRIVATE_KEY in Railway)." };
  const list = await eb.listAspsps("DE");
  const aspsp = eb.findAspsp(list, aspspName);
  if (!aspsp) {
    return {
      error: /american|amex/i.test(aspspName)
        ? "American Express ist über Enable Banking in Deutschland nicht verfügbar. Bitte die Umsätze als CSV hochladen."
        : `„${aspspName}“ wurde bei Enable Banking nicht gefunden.`,
    };
  }
  const psuType = aspsp.psu_types?.includes("business") ? "business" : (aspsp.psu_types?.[0] ?? "personal");
  const maxSec = aspsp.maximum_consent_validity ?? BANK_CONSENT_DAYS * 86400;
  const validUntil = new Date(Date.now() + Math.min(maxSec * 1000, BANK_CONSENT_DAYS * DAY) - 60_000);
  const state = randomBytes(24).toString("hex");
  const conn = await prisma.bankConnection.create({
    data: { aspspName: aspsp.name, aspspCountry: aspsp.country ?? "DE", psuType, stateHash: sha(state), validUntil, status: "pending", createdById: userId },
  });
  try {
    const r = await eb.startAuth({ aspsp: { name: aspsp.name, country: aspsp.country ?? "DE" }, redirectUrl: bankRedirectUrl(), state, validUntil, psuType });
    return { url: r.url };
  } catch (err) {
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "error", lastError: err instanceof Error ? err.message : String(err), stateHash: null } });
    return { error: err instanceof Error ? err.message : "Verbindung konnte nicht gestartet werden." };
  }
}

const maskIban = (iban?: string | null) => (iban ? `${iban.slice(0, 4)} … ${iban.slice(-4)}` : null);

/** Rückkehr von der Bank: Session anlegen, Konten speichern, ersten Abruf starten. */
export async function finishBankConnection(code: string, state: string): Promise<{ ok: true; connectionId: string } | { error: string }> {
  const conn = await prisma.bankConnection.findUnique({ where: { stateHash: sha(state) } });
  if (!conn || conn.status !== "pending") return { error: "Unbekannte oder abgelaufene Verbindungsanfrage. Bitte erneut verbinden." };
  if (Date.now() - conn.createdAt.getTime() > 60 * 60_000) {
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "error", lastError: "Weiterleitung abgelaufen.", stateHash: null } });
    return { error: "Die Anmeldung bei der Bank hat zu lange gedauert. Bitte erneut verbinden." };
  }
  try {
    const s = await eb.createSession(code);
    const accounts = (s.accounts ?? []).map((a) => ({ uid: a.uid, name: a.name ?? a.product ?? null, iban: maskIban(a.account_id?.iban), currency: a.currency ?? null }));
    // Vorherige Verbindung zur selben Bank ersetzen (Neuverbindung nach Ablauf)
    await prisma.bankConnection.updateMany({ where: { aspspName: conn.aspspName, status: { in: ["active", "expired", "error"] }, id: { not: conn.id } }, data: { status: "revoked" } });
    await prisma.bankConnection.update({
      where: { id: conn.id },
      data: {
        status: "active",
        stateHash: null,
        sessionEnc: encryptSecret(s.session_id),
        accounts,
        validUntil: s.access?.valid_until ? new Date(s.access.valid_until) : conn.validUntil,
        lastError: null,
        reminderAt: null,
      },
    });
    return { ok: true, connectionId: conn.id };
  } catch (err) {
    await prisma.bankConnection.update({ where: { id: conn.id }, data: { status: "error", stateHash: null, lastError: err instanceof Error ? err.message : String(err) } });
    return { error: err instanceof Error ? err.message : "Verbindung fehlgeschlagen." };
  }
}

type AccountRef = { uid: string; name?: string | null };

/** Eine Enable-Banking-Buchung in das Import-Format bringen (nur gebuchte). */
export function fromEnableBanking(t: eb.EbTransaction): ParsedTx | null {
  if (t.status && t.status !== "BOOK") return null;
  const date = t.booking_date ?? t.value_date ?? t.transaction_date;
  if (!date) return null;
  const amt = Number(t.transaction_amount?.amount);
  if (!Number.isFinite(amt)) return null;
  const amount = t.credit_debit_indicator === "DBIT" ? -Math.abs(amt) : Math.abs(amt);
  const counterparty = (t.credit_debit_indicator === "DBIT" ? t.creditor?.name : t.debtor?.name) ?? null;
  const purpose = [...(t.remittance_information ?? []), t.note ?? ""].join(" ").replace(/\s+/g, " ").trim() || null;
  const id = t.transaction_id || t.entry_reference || `h:${sha(`${date}|${amount}|${counterparty ?? ""}|${purpose ?? ""}`).slice(0, 24)}`;
  return { externalId: id, bookingDate: date.slice(0, 10), amount, currency: t.transaction_amount?.currency ?? "EUR", counterparty, purpose };
}

/** Eine Verbindung abrufen (ab letztem Abruf minus 5 Tage, beim ersten Mal 90 Tage). */
export async function syncConnection(id: string, now = new Date()): Promise<ImportStats & { error?: string }> {
  const conn = await prisma.bankConnection.findUniqueOrThrow({ where: { id } });
  const empty: ImportStats = { total: 0, created: 0, existing: 0, assigned: 0, ignored: 0, open: 0 };
  if (conn.status !== "active" || !conn.sessionEnc) return { ...empty, error: "Verbindung ist nicht aktiv." };
  if (conn.validUntil && conn.validUntil.getTime() < now.getTime()) {
    await prisma.bankConnection.update({ where: { id }, data: { status: "expired" } });
    return { ...empty, error: "Die Zustimmung bei der Bank ist abgelaufen. Bitte neu verbinden." };
  }
  const since = conn.lastSyncAt ? new Date(conn.lastSyncAt.getTime() - 5 * DAY) : new Date(now.getTime() - 90 * DAY);
  const total: ImportStats = { ...empty };
  try {
    for (const acc of (conn.accounts as AccountRef[] | null) ?? []) {
      const txs = await eb.fetchTransactions(acc.uid, since.toISOString().slice(0, 10));
      const rows = txs.map(fromEnableBanking).filter((r): r is ParsedTx => !!r);
      const s = await importTransactions(acc.uid, rows, { source: "enablebanking", connectionId: conn.id });
      for (const k of Object.keys(total) as (keyof ImportStats)[]) total[k] += s[k];
    }
    await prisma.bankConnection.update({ where: { id }, data: { lastSyncAt: now, lastError: null } });
    return total;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const expired = err instanceof eb.EnableBankingError && (err.status === 401 || err.status === 403) && /session|consent|expired|abgelaufen/i.test(msg);
    await prisma.bankConnection.update({ where: { id }, data: { lastError: msg.slice(0, 500), ...(expired ? { status: "expired" } : {}) } });
    return { ...total, error: msg };
  }
}

/**
 * Täglicher Lauf (WhatsApp-Cron): aktive Verbindungen höchstens alle 20 Stunden
 * abrufen; 7 Tage vor Ablauf der Zustimmung einmal erinnern (Aufgabe + Push).
 */
export async function runBankSync(now = new Date()): Promise<{ synced: number; reminded: number; errors: number }> {
  const res = { synced: 0, reminded: 0, errors: 0 };
  if (process.env.BANK_SYNC === "off") return res;
  const conns = await prisma.bankConnection.findMany({ where: { status: "active" } });
  for (const c of conns) {
    if (c.validUntil && c.validUntil.getTime() - now.getTime() < BANK_REMIND_DAYS * DAY && (!c.reminderAt || now.getTime() - c.reminderAt.getTime() > 6 * DAY)) {
      await remindReconnect(c.aspspName, c.validUntil);
      await prisma.bankConnection.update({ where: { id: c.id }, data: { reminderAt: now } });
      res.reminded++;
    }
    if (!eb.enableBankingConfigured()) continue;
    if (c.lastSyncAt && now.getTime() - c.lastSyncAt.getTime() < 20 * 3600_000) continue;
    const r = await syncConnection(c.id, now).catch((e: unknown) => ({ error: e instanceof Error ? e.message : String(e) }));
    if ("error" in r && r.error) res.errors++;
    else res.synced++;
  }
  return res;
}

async function remindReconnect(bank: string, validUntil: Date) {
  const until = validUntil.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" });
  await prisma.salesTask.create({
    data: {
      type: "SONSTIGES",
      title: `${bank} neu verbinden (Zustimmung endet am ${until})`,
      note: "Einstellungen → Bank & Karten → „Neu verbinden“. Sonst kommen keine Kosten mehr von diesem Konto.",
      dueAt: new Date(validUntil.getTime() - 2 * DAY),
    },
  });
  const { sendToAdmins } = await import("@/lib/push");
  await sendToAdmins({ title: `${bank}: bitte neu verbinden`, body: `Die Zustimmung für den Kontoabruf endet am ${until}.`, url: "/admin/einstellungen/bank" }).catch(() => {});
}

/** Buchungen für „Kosten zuordnen“: offen oder alle der letzten 90 Tage. */
export async function transactionsForReview(view: "offen" | "alle", now = new Date()) {
  return prisma.bankTransaction.findMany({
    where: view === "offen" ? { status: "neu" } : { bookingDate: { gte: new Date(now.getTime() - 90 * DAY) } },
    orderBy: [{ bookingDate: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: { rule: { select: { pattern: true } } },
  });
}
