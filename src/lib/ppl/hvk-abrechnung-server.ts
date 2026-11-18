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
  hvkLeadFilter,
  hvkShiftDay,
  hvkStornoReason,
  leadPlzOrt,
  reabgleichHvkInvoices,
  parseHvkInvoiceText,
  processHvkInvoice,
  type HvkDeliveredLead,
  type HvkLeadLink,
  type HvkMatchVia,
  type HvkInvoiceInput,
  type HvkLine,
  type HvkProcessResult,
  type HvkReabgleichStore,
  type HvkReabgleichSummary,
  type HvkStore,
} from "@/lib/ppl/hvk-abrechnung";

type Actor = { id?: string | null; email?: string | null; role?: string | null };
const SYSTEM: Actor = { role: "system", email: "hvk-abrechnung" };

/** Kunde(n) „Heinrich von Kleist“ */
export async function hvkCustomerIds(): Promise<string[]> {
  const rows = await prisma.customer.findMany({ where: { name: { contains: HVK_CUSTOMER_NAME(), mode: "insensitive" } }, select: { id: true } });
  return rows.map((r) => r.id);
}

/** Bedingung „HvK-Lead“ ohne Zeitraum (Regeln: hvkLeadFilter in lib/ppl/hvk-abrechnung.ts). null = kein HvK-Kunde. */
export async function hvkLeadWhere(customerIds?: string[]): Promise<Prisma.LeadWhereInput | null> {
  const ids = customerIds ?? (await hvkCustomerIds());
  if (!ids.length) return null;
  const subs = await prisma.leadSubscription.findMany({ where: { customerId: { in: ids } }, select: { id: true, airtableId: true, productKey: true } });
  return hvkLeadFilter(ids, HVK_PRODUCT(), subs);
}

/**
 * Gelieferte HvK-Leads mit Lieferdatum im Bereich (Berlin, inklusive). Aus der App mit Bezug (deliveredAt) und aus
 * der Airtable-Zeit (Lead.airtableId, Zuweisungsdatum = createdAt). Welche Leads zählen: hvkLeadWhere.
 */
export async function loadHvkLeads(fromDate: string, toDate: string): Promise<HvkDeliveredLead[]> {
  const base = await hvkLeadWhere();
  if (!base) return [];
  const gte = new Date(`${hvkShiftDay(fromDate, -1)}T00:00:00Z`);
  const lt = new Date(`${hvkShiftDay(toDate, 2)}T00:00:00Z`);
  const rows = await prisma.lead.findMany({
    where: {
      AND: [base, { OR: [{ deliveredAt: { gte, lt } }, { deliveredAt: null, createdAt: { gte, lt } }] }],
    },
    select: { id: true, name: true, deliveredAt: true, createdAt: true, stornoState: true, formData: true, contactOverrides: true, hvkLeadId: true },
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
      hvkLeadId: r.hvkLeadId,
      date: berlinDate(r.deliveredAt ?? r.createdAt),
      ...leadPlzOrt({ contactOverrides: r.contactOverrides, formData: r.formData, poolPlz: pool.get(r.id) ?? null }),
    }))
    .filter((l) => l.date >= fromDate && l.date <= toDate);
}

const json = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

/**
 * Lead.hvkLeadId setzen (17.11.2026): nur wo der Lead noch keine ID hat und kein anderer Lead diese ID trägt. Nie
 * überschreiben; idempotent. Gibt die Zahl neu gespeicherter Zuordnungen zurück.
 */
export async function saveHvkLeadIds(links: HvkLeadLink[]): Promise<number> {
  let n = 0;
  const seen = new Set<string>();
  for (const k of links) {
    if (!k.hvkLeadId || seen.has(k.hvkLeadId)) continue;
    seen.add(k.hvkLeadId);
    if (await prisma.lead.findUnique({ where: { hvkLeadId: k.hvkLeadId }, select: { id: true } })) continue;
    try {
      const r = await prisma.lead.updateMany({ where: { id: k.leadId, hvkLeadId: null }, data: { hvkLeadId: k.hvkLeadId } });
      n += r.count;
    } catch (err) {
      // Eindeutigkeit: ein anderer Lead trägt die ID schon, nichts ändern
      if ((err as { code?: string }).code !== "P2002") throw err;
    }
  }
  return n;
}

/** Leads, die schon einer HvK-Reklamation zugeordnet sind (auto/erledigt): Lead-ID → HvK-Lead-ID */
async function takenHvkLeads(): Promise<Map<string, string>> {
  const rows = await prisma.hvkReklamation.findMany({ where: { status: { in: ["auto", "erledigt"] }, leadId: { not: null } }, select: { leadId: true, hvkLeadId: true }, orderBy: { createdAt: "asc" } });
  return new Map(rows.map((r) => [r.leadId!, r.hvkLeadId]));
}

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
            via: auto ? (r.via ?? null) : null,
            decidedAt: auto ? new Date() : null,
          },
          update: {},
        });
      }
      // Ergebnis an der Rechnung aktualisieren (Storno-Ergebnis steht erst nach dem Eintragen fest)
      const r = await prisma.hvkInvoice.findUnique({ where: { id: invoiceId }, select: { result: true } });
      await prisma.hvkInvoice.update({ where: { id: invoiceId }, data: { result: json({ ...((r?.result ?? {}) as object), invoiceId, status: "neu", reklamationen: rows }) } });
    },
    takenLeads: takenHvkLeads,
    saveHvkLeadIds,
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
  // Zuordnung merken, damit spätere Reklamationen derselben HvK-ID direkt passen
  await saveHvkLeadIds([{ hvkLeadId: r.hvkLeadId, leadId: lead.id }]);
  return { ok: true, message: s.already ? "War schon storniert, zugeordnet." : "Storno eingetragen." };
}

export async function discardHvkReklamation(reklamationId: string, actor: Actor): Promise<boolean> {
  const r = await prisma.hvkReklamation.updateMany({ where: { id: reklamationId, status: "offen" }, data: { status: "verworfen", decidedAt: new Date() } });
  if (r.count) await audit("ppl.hvk_reklamation_verworfen", { entity: "HvkReklamation", entityId: reklamationId, actor });
  return r.count > 0;
}

// ─── Neuabgleich (Admin → HvK-Abrechnungen → „Neu abgleichen“, Diagnose q=hvk&neu=1) ──────────

export function prismaHvkReabgleichStore(actor: Actor = SYSTEM): HvkReabgleichStore {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return {
    async invoices() {
      const rows = await prisma.hvkInvoice.findMany({
        orderBy: { periodStart: "asc" },
        select: {
          id: true,
          invoiceNo: true,
          periodStart: true,
          periodEnd: true,
          lines: true,
          result: true,
          deliveredCount: true,
          stornoAuto: true,
          stornoReview: true,
          reklamationen: { orderBy: { createdAt: "asc" }, select: { id: true, hvkLeadId: true, deliveryDate: true, plz: true, ort: true, status: true, leadId: true, candidateIds: true } },
        },
      });
      return rows.map((r) => ({
        id: r.id,
        invoiceNo: r.invoiceNo,
        periodStart: iso(r.periodStart),
        periodEnd: iso(r.periodEnd),
        lines: (Array.isArray(r.lines) ? r.lines : []) as unknown as HvkLine[],
        result: (r.result && typeof r.result === "object" ? r.result : {}) as Partial<HvkProcessResult>,
        deliveredCount: r.deliveredCount,
        stornoAuto: r.stornoAuto,
        stornoReview: r.stornoReview,
        reklamationen: r.reklamationen.map((k) => ({ ...k, date: iso(k.deliveryDate) })),
      }));
    },
    deliveredLeads: loadHvkLeads,
    recordStorno: (leadId, reason, note) => adminRecordStorno(leadId, reason, note, actor, new Date(), { allowAirtableLead: true }),
    async updateInvoice(id, data) {
      await prisma.hvkInvoice.update({ where: { id }, data: { deliveredCount: data.deliveredCount, stornoAuto: data.stornoAuto, stornoReview: data.stornoReview, result: json(data.result) } });
    },
    async updateReklamation(id, data) {
      // Nur offene: ein Admin könnte gleichzeitig entschieden haben
      await prisma.hvkReklamation.updateMany({ where: { id, status: "offen" }, data });
    },
    saveHvkLeadIds,
  };
}

/**
 * Alle übernommenen HvK-Rechnungen neu abgleichen (nach dem Produktfilter-Fehler bis 17.11.2026). dryRun = Vorschau.
 * PDF, Zeilen und Rechnungsdaten bleiben; offene Reklamationen werden neu zugeordnet. Idempotent.
 */
export async function reabgleichHvk(opts: { dryRun: boolean; actor?: Actor }): Promise<HvkReabgleichSummary> {
  const actor = opts.actor ?? SYSTEM;
  const summary = await reabgleichHvkInvoices(prismaHvkReabgleichStore(actor), { dryRun: opts.dryRun });
  if (!opts.dryRun && (summary.totals.changed || summary.totals.linked)) {
    await audit("ppl.hvk_neuabgleich", {
      entity: "HvkInvoice",
      actor,
      details: {
        ...summary.totals,
        wochen: summary.weeks.filter((w) => w.changed).map((w) => ({ invoiceNo: w.invoiceNo, geliefert: w.delivered, vorher: w.deliveredBefore, abgerechnet: w.billed, stornoNeu: w.stornoNew, offen: w.open })),
      },
    });
  }
  return summary;
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
      reklamationen: { orderBy: { createdAt: "asc" }, select: { hvkLeadId: true, plz: true, ort: true, status: true, via: true, leadId: true } },
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
      reklamationen: r.reklamationen.map((k) => ({ hvkLeadId: k.hvkLeadId, plz: k.plz, ort: k.ort, status: k.status, via: (k.via as HvkMatchVia | null) ?? null, leadId: k.leadId })),
      unbilled: res.unbilled ?? [],
      foreign: res.foreign ?? [],
      warnings: res.warnings ?? [],
    };
  });
}

export type HvkInvoiceRow = Awaited<ReturnType<typeof listHvkInvoices>>[number];
