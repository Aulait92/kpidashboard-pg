"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/vertrieb/auth";
import { audit } from "@/lib/audit";
import { parseBankCsv, type CsvSource } from "@/lib/bank/csv";
import { COST_ACTIONS, type CostAction } from "@/lib/bank/rules";
import { applyRuleToOpen, assignTransaction, importTransactions, sessionIdOf, startBankConnection, syncConnection } from "@/lib/bank/server";
import { deleteSession } from "@/lib/bank/enable-banking";

export type BankState = { ok?: boolean; message?: string; error?: string } | null;

const refresh = () => {
  revalidatePath("/admin/einstellungen/bank", "layout");
  revalidatePath("/admin/zahlen");
};

export async function connectBankAction(fd: FormData) {
  const session = await requireAuth();
  const aspsp = String(fd.get("aspsp") ?? "").trim();
  const r = await startBankConnection(aspsp || "Commerzbank", session.userId);
  if ("error" in r) redirect(`/admin/einstellungen/bank?fehler=${encodeURIComponent(r.error.slice(0, 200))}`);
  redirect(r.url);
}

export async function syncBankAction(_prev: BankState, fd: FormData): Promise<BankState> {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const r = await syncConnection(id);
  await audit("bank.sync", { entity: "BankConnection", entityId: id, details: { created: r.created, error: r.error ?? null }, actor: { id: session.userId, email: session.email, role: session.role } });
  refresh();
  if (r.error) return { error: r.error };
  return { ok: true, message: `${r.created} neue Buchungen (${r.assigned} zugeordnet, ${r.ignored} ignoriert, ${r.open} offen).` };
}

export async function disconnectBankAction(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const conn = await prisma.bankConnection.findUnique({ where: { id } });
  if (conn) {
    const sid = sessionIdOf(conn);
    if (sid) await deleteSession(sid).catch(() => {}); // Zustimmung bei der Bank beenden (wenn möglich)
    await prisma.bankConnection.update({ where: { id }, data: { status: "revoked", sessionEnc: null } });
    await audit("bank.disconnect", { entity: "BankConnection", entityId: id, details: { bank: conn.aspspName }, actor: { id: session.userId, email: session.email, role: session.role } });
  }
  refresh();
}

export async function uploadCsvAction(_prev: BankState, fd: FormData): Promise<BankState> {
  const session = await requireAuth();
  const file = fd.get("file");
  const source = (String(fd.get("source") ?? "auto") as CsvSource) || "auto";
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine CSV-Datei wählen." };
  if (file.size > 5 * 1024 * 1024) return { error: "Datei ist zu groß (höchstens 5 MB)." };
  if (/\.xlsx?$/i.test(file.name)) return { error: "Bitte als CSV exportieren (nicht Excel). Bei Amex: „Umsätze herunterladen“ → Format „CSV“." };
  const buf = Buffer.from(await file.arrayBuffer());
  // Banken exportieren teils in Windows-1252: ungültiges UTF-8 → latin1 lesen
  let text = buf.toString("utf8");
  if (text.includes("�")) text = buf.toString("latin1");
  const parsed = parseBankCsv(text, source);
  if (parsed.error) return { error: parsed.error };
  if (!parsed.rows.length) return { error: "Keine Buchungen in der Datei gefunden." };
  const accountKey = `csv:${parsed.source}`;
  const r = await importTransactions(accountKey, parsed.rows, { source: "csv" });
  await audit("bank.sync", { details: { csv: parsed.source, rows: parsed.rows.length, created: r.created }, actor: { id: session.userId, email: session.email, role: session.role } });
  refresh();
  const label = parsed.source === "amex" ? "American Express" : parsed.source === "commerzbank" ? "Commerzbank" : "CSV";
  return {
    ok: true,
    message: `${label}: ${parsed.rows.length} Buchungen gelesen, ${r.created} neu (${r.assigned} zugeordnet, ${r.ignored} ignoriert, ${r.open} zum Zuordnen), ${r.existing} schon vorhanden${parsed.skipped ? `, ${parsed.skipped} Zeilen übersprungen` : ""}.`,
  };
}

export async function assignAction(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "") as CostAction;
  if (!COST_ACTIONS.includes(action)) return;
  const always = fd.get("always") === "on";
  const vat = fd.get("vat") === "on";
  const pattern = String(fd.get("pattern") ?? "");
  const r = await assignTransaction(id, action, { vatIncluded: vat, always, pattern });
  await audit("cost.assign", { entity: "BankTransaction", entityId: id, details: { action, vat, rule: always ? pattern : null, applied: r.applied }, actor: { id: session.userId, email: session.email, role: session.role } });
  refresh();
}

export async function saveRuleAction(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  const action = String(fd.get("action") ?? "") as CostAction;
  if (!COST_ACTIONS.includes(action)) return;
  const vat = fd.get("vat") === "on";
  // Bezeichnung = Zeilenname in der BWA (z. B. „Steuerberater“ statt „GC RE PHDRMUELLERSTBG“)
  const label = String(fd.get("label") ?? "").trim().slice(0, 80) || null;
  await prisma.costRule.update({ where: { id }, data: { action, vatIncluded: vat, ...(fd.has("label") ? { label } : {}) } });
  await applyRuleToOpen(id);
  await audit("cost.rule", { entity: "CostRule", entityId: id, details: { action, vat }, actor: { id: session.userId, email: session.email, role: session.role } });
  refresh();
}

export async function deleteRuleAction(fd: FormData) {
  const session = await requireAuth();
  const id = String(fd.get("id") ?? "");
  await prisma.costRule.delete({ where: { id } }).catch(() => null);
  await audit("cost.rule", { entity: "CostRule", entityId: id, details: { deleted: true }, actor: { id: session.userId, email: session.email, role: session.role } });
  refresh();
}
