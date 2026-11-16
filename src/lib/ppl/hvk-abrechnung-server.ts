// HvK-Abrechnung mit Datenbank, Postfach und PDF (Regeln und Abgleich: lib/ppl/hvk-abrechnung.ts).
//   - importHvkPdf: PDF lesen, je Rechnungsnummer einmal übernehmen (oder Probelauf)
//   - checkHvkMails: neue Mails „Neue Gutschrift“ abrufen (Cron Mo–Mi, „Jetzt abrufen“, Rückwirkend ab Juli)
//   - Reklamationen ohne eindeutigen Lead: Admin → Pay-per-Lead → „Storno prüfen“ (zuordnen oder verwerfen)

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { sendToAdmins } from "@/lib/push";
import { adminRecordStorno } from "@/lib/ppl/storno";
import { pdfText, looksLikePdf } from "@/lib/ppl/hvk-pdf-text";
import { listGutschriftMails, pdfAttachments } from "@/lib/ppl/hvk-mail";
import {
  HVK_BACKFILL_FROM,
  HVK_CUSTOMER_NAME,
  HVK_PRODUCT,
  berlinDate,
  hvkShiftDay,
  hvkStornoReason,
  leadPlzOrt,
  parseHvkInvoiceText,
  processHvkInvoice,
  type HvkDeliveredLead,
  type HvkInvoiceInput,
  type HvkProcessResult,
  type HvkStore,
} from "@/lib/ppl/hvk-abrechnung";

type Actor = { id?: string | null; email?: string | null; role?: string | null };
const SYSTEM: Actor = { role: "system", email: "hvk-abrechnung" };

/** Kunde(n) „Heinrich von Kleist“ */
export async function hvkCustomerIds(): Promise<string[]> {
  const rows = await prisma.customer.findMany({ where: { name: { contains: HVK_CUSTOMER_NAME(), mode: "insensitive" } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/**
 * Gelieferte HvK-Leads (Produkt PKV-Tarifoptimierung) mit Lieferdatum im Bereich (Berlin, inklusive). Aus der App mit
 * Bezug (deliveredAt) und aus der Airtable-Zeit (Lead.airtableId, Zuweisungsdatum = createdAt).
 */
export async function loadHvkLeads(fromDate: string, toDate: string): Promise<HvkDeliveredLead[]> {
  const customerIds = await hvkCustomerIds();
  if (!customerIds.length) return [];
  const gte = new Date(`${hvkShiftDay(fromDate, -1)}T00:00:00Z`);
  const lt = new Date(`${hvkShiftDay(toDate, 2)}T00:00:00Z`);
  const rows = await prisma.lead.findMany({
    where: {
      customerId: { in: customerIds },
      source: { equals: HVK_PRODUCT(), mode: "insensitive" },
      OR: [{ deliveredAt: { gte, lt } }, { deliveredAt: null, createdAt: { gte, lt } }],
    },
    select: { id: true, name: true, deliveredAt: true, createdAt: true, stornoState: true, formData: true, contactOverrides: true },
    orderBy: [{ deliveredAt: "asc" }, { createdAt: "asc" }],
  });
  const pool = new Map(
    (await prisma.poolLead.findMany({ where: { leadId: { in: rows.map((r) => r.id) } }, select: { leadId: true, plz: true } })).map((p) => [p.leadId, p.plz]),
  );
  return rows
    .map((r) => ({
      id: r.id,
      name: r.name,
      stornoState: r.stornoState,
      date: berlinDate(r.deliveredAt ?? r.createdAt),
      ...leadPlzOrt({ contactOverrides: r.contactOverrides, formData: r.formData, poolPlz: pool.get(r.id) ?? null }),
    }))
    .filter((l) => l.date >= fromDate && l.date <= toDate);
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export function prismaHvkStore(actor: Actor = SYSTEM): HvkStore {
  return {
    findInvoice: (invoiceNo) => prisma.hvkInvoice.findUnique({ where: { invoiceNo }, select: { id: true } }),
    deliveredLeads: loadHvkLeads,
    async createInvoice(input: HvkInvoiceInput, result: HvkProcessResult) {
      const p = input.parsed;
      try {
        return await prisma.hvkInvoice.create({
          data: {
            invoiceNo: p.invoiceNo,
            periodStart: new Date(`${p.periodStart}T00:00:00Z`),
            periodEnd: new Date(`${p.periodEnd}T00:00:00Z`),
            invoiceDate: p.invoiceDate ? new Date(`${p.invoiceDate}T00:00:00Z`) : null,
            brokerId: p.brokerId,
            netCents: p.netCents ?? p.lines.reduce((n, l) => n + l.cents, 0),
            vatCents: p.vatCents,
            grossCents: p.grossCents,
            boughtCount: result.billed,
            reklamationCount: result.reklamationen.length,
            lines: json(p.lines),
            result: json(result),
            deliveredCount: result.delivered,
            stornoAuto: result.stornoAuto,
            stornoReview: result.stornoReview,
            pdf: new Uint8Array(input.pdf),
            pdfName: input.pdfName,
            mailMessageId: input.mailMessageId,
            receivedAt: input.receivedAt,
            source: input.source,
          },
          select: { id: true },
        });
      } catch (err) {
        if ((err as { code?: string }).code === "P2002") return "exists";
        throw err;
      }
    },
    recordStorno: (leadId, reason, note) => adminRecordStorno(leadId, reason, note, actor, new Date(), { allowAirtableLead: true }),
    async saveReklamationen(invoiceId, rows) {
      for (const r of rows) {
        const auto = r.outcome === "eindeutig" && r.storno !== "fehler";
        await prisma.hvkReklamation.upsert({
          where: { invoiceId_hvkLeadId: { invoiceId, hvkLeadId: r.hvkLeadId } },
          create: {
            invoiceId,
            hvkLeadId: r.hvkLeadId,
            deliveryDate: new Date(`${r.date}T00:00:00Z`),
            plz: r.plz,
            ort: r.ort,
            cents: r.cents,
            status: auto ? "auto" : "offen",
            leadId: r.leadId,
            candidateIds: r.candidateIds,
            decidedAt: auto ? new Date() : null,
          },
          update: {},
        });
      }
      // Ergebnis an der Rechnung aktualisieren (Storno-Ergebnis steht erst nach dem Eintragen fest)
      const r = await prisma.hvkInvoice.findUnique({ where: { id: invoiceId }, select: { result: true } });
      await prisma.hvkInvoice.update({ where: { id: invoiceId }, data: { result: json({ ...((r?.result ?? {}) as object), invoiceId, status: "neu", reklamationen: rows }) } });
    },
  };
}

export type HvkImportOutcome = { ok: true; result: HvkProcessResult } | { ok: false; error: string; name?: string };

/** Ein PDF übernehmen (oder Probelauf). */
export async function importHvkPdf(
  pdf: Uint8Array,
  meta: { pdfName: string | null; mailMessageId?: string | null; receivedAt?: Date | null; source: HvkInvoiceInput["source"] },
  opts: { dryRun?: boolean; actor?: Actor } = {},
): Promise<HvkImportOutcome> {
  if (!looksLikePdf(pdf)) return { ok: false, error: "Keine PDF-Datei.", name: meta.pdfName ?? undefined };
  let text: string;
  try {
    text = await pdfText(pdf);
  } catch (err) {
    return { ok: false, error: `PDF nicht lesbar: ${err instanceof Error ? err.message.slice(0, 120) : "unbekannter Fehler"}`, name: meta.pdfName ?? undefined };
  }
  const parsed = parseHvkInvoiceText(text);
  if (!parsed) return { ok: false, error: "Keine HvK-Abrechnung erkannt (Rechnungsnummer oder Zeitraum fehlt).", name: meta.pdfName ?? undefined };
  const result = await processHvkInvoice(
    { parsed, pdf, pdfName: meta.pdfName, mailMessageId: meta.mailMessageId ?? null, receivedAt: meta.receivedAt ?? null, source: meta.source },
    prismaHvkStore(opts.actor ?? SYSTEM),
    { dryRun: opts.dryRun },
  );
  if (result.status === "neu") {
    await audit("ppl.hvk_abrechnung", {
      entity: "HvkInvoice",
      entityId: result.invoiceId ?? null,
      actor: opts.actor ?? SYSTEM,
      details: { invoiceNo: result.invoiceNo, source: meta.source, stornoAuto: result.stornoAuto, stornoReview: result.stornoReview },
    });
  }
  return { ok: true, result };
}

export type HvkMailRun = { ok: true; mails: number; results: HvkImportOutcome[] } | { ok: false; error: string };

/**
 * Mails „Neue Gutschrift“ seit `since` verarbeiten. Schon übernommene Mails (gleiche Graph-ID) werden nicht erneut
 * geladen; jede Rechnung zählt nur einmal (Rechnungsnummer). dryRun = Vorschau ohne Schreiben.
 */
export async function checkHvkMails(since: Date, opts: { dryRun?: boolean; source?: HvkInvoiceInput["source"]; actor?: Actor } = {}): Promise<HvkMailRun> {
  let mails;
  try {
    mails = await listGutschriftMails(since);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  const known = new Map(
    (await prisma.hvkInvoice.findMany({ where: { mailMessageId: { in: mails.map((m) => m.id) } }, select: { mailMessageId: true, result: true } })).map((r) => [
      r.mailMessageId!,
      r.result as unknown as HvkProcessResult,
    ]),
  );
  const results: HvkImportOutcome[] = [];
  for (const m of mails) {
    const seen = known.get(m.id);
    if (seen) {
      results.push({ ok: true, result: { ...seen, status: "vorhanden" } });
      continue;
    }
    try {
      const pdfs = await pdfAttachments(m.id);
      if (!pdfs.length) {
        results.push({ ok: false, error: `Mail vom ${berlinDate(m.receivedAt)} ohne PDF.` });
        continue;
      }
      for (const f of pdfs) {
        results.push(await importHvkPdf(f.data, { pdfName: f.name, mailMessageId: m.id, receivedAt: m.receivedAt, source: opts.source ?? "mail" }, { dryRun: opts.dryRun, actor: opts.actor }));
      }
    } catch (err) {
      results.push({ ok: false, error: `Mail vom ${berlinDate(m.receivedAt)}: ${err instanceof Error ? err.message.slice(0, 160) : String(err)}` });
    }
  }
  return { ok: true, mails: mails.length, results };
}

/** Rückwirkend ab Juli 2026 (Vorschau oder Übernehmen) */
export const hvkBackfill = (opts: { dryRun: boolean; actor?: Actor }) =>
  checkHvkMails(new Date(`${HVK_BACKFILL_FROM}T00:00:00Z`), { dryRun: opts.dryRun, source: "backfill", actor: opts.actor });

/** Cron (Mo–Mi stündlich): die letzten 3 Wochen prüfen, bei Neuem Push an die Admins. */
export async function runHvkCron(now = new Date()) {
  const box = await prisma.adminMailbox.findUnique({ where: { purpose: "hvk-abrechnung" }, select: { id: true } });
  if (!box) return { skipped: "nicht verbunden" };
  const run = await checkHvkMails(new Date(now.getTime() - 21 * 86_400_000));
  if (!run.ok) return run;
  const fresh = run.results.flatMap((r) => (r.ok && r.result.status === "neu" ? [r.result] : []));
  for (const r of fresh) {
    const diff = r.unbilled.length + r.foreign.length;
    await sendToAdmins({
      title: `🧾 HvK-Abrechnung ${r.invoiceNo}`,
      body: [`${r.billed} abgerechnet, ${r.delivered} geliefert`, r.stornoReview ? `${r.stornoReview} Reklamation prüfen` : null, diff ? `${diff} Abweichung` : null].filter(Boolean).join(" · "),
      url: r.stornoReview ? "/admin/ppl?ansicht=storno" : "/admin/ppl?ansicht=hvk",
      tag: `hvk-abrechnung:${r.invoiceNo}`,
    }).catch(() => {});
  }
  const failed = run.results.filter((r) => !r.ok);
  return { mails: run.mails, neu: fresh.length, fehler: failed.length };
}

// ─── Reklamationen von Hand entscheiden („Storno prüfen“) ────────────────────

export async function openHvkReklamationen() {
  const rows = await prisma.hvkReklamation.findMany({
    where: { status: "offen" },
    orderBy: { createdAt: "asc" },
    include: { invoice: { select: { invoiceNo: true } } },
  });
  const ids = [...new Set(rows.flatMap((r) => r.candidateIds))];
  const leads = new Map(
    (await prisma.lead.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, deliveredAt: true, createdAt: true, stornoState: true, phone: true } })).map((l) => [l.id, l]),
  );
  return rows.map((r) => ({ ...r, candidates: r.candidateIds.map((id) => leads.get(id)).filter((l): l is NonNullable<typeof l> => !!l) }));
}

export async function assignHvkReklamation(reklamationId: string, leadId: string, actor: Actor): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  const r = await prisma.hvkReklamation.findUnique({ where: { id: reklamationId }, include: { invoice: { select: { invoiceNo: true } } } });
  if (!r || r.status !== "offen") return { ok: false, error: "Schon entschieden." };
  const customerIds = await hvkCustomerIds();
  const lead = await prisma.lead.findUnique({ where: { id: leadId.trim() }, select: { id: true, customerId: true } });
  if (!lead || !customerIds.includes(lead.customerId)) return { ok: false, error: "Kein Lead von Heinrich von Kleist mit dieser ID." };
  const note = `HvK Lead ID ${r.hvkLeadId}, ${r.plz} ${r.ort}, geliefert ${berlinDate(r.deliveryDate)}, von Hand zugeordnet`;
  const s = await adminRecordStorno(lead.id, hvkStornoReason(r.invoice.invoiceNo), note, actor, new Date(), { allowAirtableLead: true });
  if (!s.ok) return s;
  await prisma.hvkReklamation.update({ where: { id: r.id }, data: { status: "erledigt", leadId: lead.id, decidedAt: new Date() } });
  return { ok: true, message: s.already ? "War schon storniert, zugeordnet." : "Storno eingetragen." };
}

export async function discardHvkReklamation(reklamationId: string, actor: Actor): Promise<boolean> {
  const r = await prisma.hvkReklamation.updateMany({ where: { id: reklamationId, status: "offen" }, data: { status: "verworfen", decidedAt: new Date() } });
  if (r.count) await audit("ppl.hvk_reklamation_verworfen", { entity: "HvkReklamation", entityId: reklamationId, actor });
  return r.count > 0;
}

// ─── Übersicht ──────────────────────────────────────────────────────────────

export async function listHvkInvoices(take = 30) {
  const rows = await prisma.hvkInvoice.findMany({
    orderBy: { periodStart: "desc" },
    take,
    select: {
      id: true,
      invoiceNo: true,
      periodStart: true,
      periodEnd: true,
      netCents: true,
      boughtCount: true,
      deliveredCount: true,
      result: true,
      pdfName: true,
      reklamationen: { select: { status: true } },
    },
  });
  return rows.map((r) => {
    const res = r.result as unknown as Partial<HvkProcessResult>;
    return {
      id: r.id,
      invoiceNo: r.invoiceNo,
      periodStart: r.periodStart.toISOString().slice(0, 10),
      periodEnd: r.periodEnd.toISOString().slice(0, 10),
      netCents: r.netCents,
      billed: r.boughtCount,
      delivered: r.deliveredCount,
      stornoAuto: r.reklamationen.filter((x) => x.status === "auto" || x.status === "erledigt").length,
      stornoOpen: r.reklamationen.filter((x) => x.status === "offen").length,
      unbilled: res.unbilled ?? [],
      foreign: res.foreign ?? [],
      warnings: res.warnings ?? [],
    };
  });
}

export type HvkInvoiceRow = Awaited<ReturnType<typeof listHvkInvoices>>[number];
