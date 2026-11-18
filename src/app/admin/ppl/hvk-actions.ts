"use server";

import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import type { HvkProcessResult, HvkReabgleichWeek } from "@/lib/ppl/hvk-abrechnung";

async function requireAdmin() {
  const s = await getCurrentSession();
  if (!s || s.role !== "ADMIN") throw new Error("Nur Admins.");
  return { id: s.userId, email: s.email, role: s.role };
}

/** Kurzfassung je Rechnung für die Vorschau (nur Zahlen, PLZ, Ort und IDs) */
export type HvkRunRow =
  | { ok: true; invoiceNo: string; period: string; status: HvkProcessResult["status"]; delivered: number; billed: number; stornoAuto: number; stornoReview: number; unbilled: number; foreign: number; netCents: number | null; reklamationen: HvkProcessResult["reklamationen"]; warnings: string[] }
  | { ok: false; error: string };
export type HvkRunState = { error?: string; message?: string; rows?: HvkRunRow[]; dryRun?: boolean };

const de = (iso: string) => iso.split("-").reverse().join(".");

function rowsOf(results: { ok: boolean; result?: HvkProcessResult; error?: string }[]): HvkRunRow[] {
  return results.map((r) =>
    r.ok && r.result
      ? {
          ok: true,
          invoiceNo: r.result.invoiceNo,
          period: `${de(r.result.periodStart)} bis ${de(r.result.periodEnd)}`,
          status: r.result.status,
          delivered: r.result.delivered,
          billed: r.result.billed,
          stornoAuto: r.result.stornoAuto,
          stornoReview: r.result.stornoReview,
          unbilled: r.result.unbilled.length,
          foreign: r.result.foreign.length,
          netCents: r.result.netCents,
          reklamationen: r.result.reklamationen,
          warnings: r.result.warnings,
        }
      : { ok: false, error: r.error ?? "Fehler" },
  );
}

/** „Jetzt abrufen“: neue Mails der letzten 3 Wochen übernehmen. */
export async function hvkFetchNowAction(_prev: HvkRunState, _fd: FormData): Promise<HvkRunState> {
  const actor = await requireAdmin();
  const { checkHvkMails } = await import("@/lib/ppl/hvk-abrechnung-server");
  const run = await checkHvkMails(new Date(Date.now() - 21 * 86_400_000), { actor });
  if (!run.ok) return { error: run.error };
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
  const rows = rowsOf(run.results);
  const neu = rows.filter((r) => r.ok && r.status === "neu").length;
  return { rows, message: run.mails ? `${run.mails} Mails geprüft, ${neu} neue Abrechnung${neu === 1 ? "" : "en"} übernommen.` : "Keine Mail „Neue Gutschrift“ in den letzten 3 Wochen." };
}

/** Rückwirkend ab Juli 2026: mode=vorschau (nichts wird geändert) oder mode=uebernehmen. */
export async function hvkBackfillAction(_prev: HvkRunState, fd: FormData): Promise<HvkRunState> {
  const actor = await requireAdmin();
  const dryRun = fd.get("mode") !== "uebernehmen";
  const { hvkBackfill } = await import("@/lib/ppl/hvk-abrechnung-server");
  const run = await hvkBackfill({ dryRun, actor });
  if (!run.ok) return { error: run.error, dryRun };
  if (!dryRun) {
    revalidatePath("/admin/ppl", "layout");
    revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
  }
  const rows = rowsOf(run.results);
  const count = (s: string) => rows.filter((r) => r.ok && r.status === s).length;
  return {
    dryRun,
    rows,
    message: dryRun
      ? `Vorschau: ${run.mails} Mails, ${count("vorschau")} neu, ${count("vorhanden")} schon übernommen. Nichts wurde geändert.`
      : `${count("neu")} Abrechnungen übernommen, ${count("vorhanden")} waren schon da.`,
  };
}

/** PDF von Hand hochladen (falls das Postfach nicht verbunden ist). */
export async function hvkUploadAction(_prev: HvkRunState, fd: FormData): Promise<HvkRunState> {
  const actor = await requireAdmin();
  const file = fd.get("pdf");
  if (!(file instanceof File) || !file.size) return { error: "Bitte ein PDF auswählen." };
  if (file.size > 10 * 1024 * 1024) return { error: "Das PDF ist zu groß (höchstens 10 MB)." };
  const { importHvkPdf } = await import("@/lib/ppl/hvk-abrechnung-server");
  const r = await importHvkPdf(new Uint8Array(await file.arrayBuffer()), { pdfName: file.name, source: "upload" }, { actor });
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
  return { rows: rowsOf([r]), message: r.result.status === "vorhanden" ? `${r.result.invoiceNo} war schon übernommen.` : `${r.result.invoiceNo} übernommen.` };
}

export type HvkReabgleichState = { error?: string; message?: string; dryRun?: boolean; weeks?: HvkReabgleichWeek[] };

/** „Neu abgleichen“: alle übernommenen Rechnungen neu rechnen. mode=vorschau (ändert nichts) oder mode=uebernehmen. */
export async function hvkReabgleichAction(_prev: HvkReabgleichState, fd: FormData): Promise<HvkReabgleichState> {
  const actor = await requireAdmin();
  const dryRun = fd.get("mode") !== "uebernehmen";
  const { reabgleichHvk } = await import("@/lib/ppl/hvk-abrechnung-server");
  try {
    const s = await reabgleichHvk({ dryRun, actor });
    if (!dryRun) {
      revalidatePath("/admin/ppl", "layout");
      revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
    }
    const t = s.totals;
    const stornos = `${t.stornoNew} Storno${t.stornoNew === 1 ? "" : "s"}`;
    return {
      dryRun,
      weeks: s.weeks,
      message: dryRun
        ? `Vorschau: ${t.changed} von ${t.invoices} Wochen ändern sich, ${stornos} aus Reklamationen, ${t.open} bleiben zu prüfen. Nichts wurde geändert.`
        : t.changed
          ? `${t.changed} Wochen neu abgeglichen, ${stornos} eingetragen, ${t.open} bleiben zu prüfen.${t.errors ? ` ${t.errors} Fehler.` : ""}`
          : "Alles war schon aktuell, nichts geändert.",
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), dryRun };
  }
}

export type HvkReklamationState = { error?: string; message?: string };

/** „Storno prüfen“: Reklamation einem Lead zuordnen (Storno eintragen). */
export async function hvkAssignAction(_prev: HvkReklamationState, fd: FormData): Promise<HvkReklamationState> {
  const actor = await requireAdmin();
  const { assignHvkReklamation } = await import("@/lib/ppl/hvk-abrechnung-server");
  const r = await assignHvkReklamation(String(fd.get("reklamationId") ?? ""), String(fd.get("leadId") ?? ""), actor);
  if (!r.ok) return { error: r.error };
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
  return { message: r.message };
}

export async function hvkDiscardAction(fd: FormData): Promise<void> {
  const actor = await requireAdmin();
  const { discardHvkReklamation } = await import("@/lib/ppl/hvk-abrechnung-server");
  await discardHvkReklamation(String(fd.get("reklamationId") ?? ""), actor);
  revalidatePath("/admin/ppl", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Leads › Pay-per-Lead)
}
