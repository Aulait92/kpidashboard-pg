"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { FIELDS, detectMapping, importRows, isBlockedColumn, mappingBlocker, parseFile, undoLastImport, type Mapping } from "@/lib/bestand/import";
import { createCampaign, OCCASIONS, type Occasion, type Segment } from "@/lib/bestand/campaigns";
import { bestandQuota } from "@/lib/bestand/quota";
import { PRICE_LIST } from "@/lib/offer-pricing";
import { PROVIDER } from "@/lib/legal-texts";
import { sendCustomerMail } from "@/lib/email";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";
import { selfBookBestand, selfCancelBestand } from "@/lib/bestand/self-service";
import { purchasePack, requestLargePack, setAutoTopUp } from "@/lib/bestand/packs";
import { loadSettings, referralLinkFor, referralLinkOf } from "@/lib/empfehlung/requests";
import { firstName, isOccasion as isReferralOccasion, OCCASIONS as REFERRAL_OCCASIONS, renderText } from "@/lib/empfehlung/shared";
import type { ShareState } from "@/app/buyer/empfehlungen/actions";
import { advisorDisplayName } from "@/lib/whatsapp/template-plan";

const MAX_BYTES = 15 * 1024 * 1024;

async function ownerCtx() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole !== "owner") throw new Error("Nur der Inhaber kann Bestandskunden verwalten.");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } });
  if (!c?.existingCustomersEnabled) throw new Error("Das Modul ist für Sie noch nicht freigeschaltet.");
  return ctx;
}

async function readUpload(fd: FormData) {
  const file = fd.get("file");
  if (!(file instanceof File) || !file.size) throw new Error("Bitte eine Excel- oder CSV-Datei wählen.");
  if (file.size > MAX_BYTES) throw new Error("Die Datei ist zu groß (max. 15 MB).");
  if (!/\.(xlsx|csv|txt)$/i.test(file.name)) throw new Error("Bitte als .xlsx oder .csv speichern.");
  return { ...(await parseFile(Buffer.from(await file.arrayBuffer()), file.name)), fileName: file.name.slice(0, 200) };
}

export type AnalyzeState = {
  error?: string;
  headers?: string[];
  mapping?: Mapping;
  preview?: Record<string, string>[];
  total?: number;
  blocked?: string[];
  /** Alle Zeilen ohne gesperrte Spalten – für die Live-Vorschau „Zeilen → Kunden → Verträge“ (bis 20.000 Zeilen). */
  rows?: Record<string, string>[];
};

const PREVIEW_ROW_LIMIT = 20_000;

export async function analyzeImportAction(_prev: AnalyzeState, fd: FormData): Promise<AnalyzeState> {
  try {
    await ownerCtx();
    const { headers, rows } = await readUpload(fd);
    if (!rows.length) return { error: "In der Datei wurden keine Zeilen gefunden." };
    const allowed = headers.filter((h) => !isBlockedColumn(h));
    const strip = (r: Record<string, string>) => Object.fromEntries(allowed.map((h) => [h, r[h] ?? ""]));
    return {
      headers: allowed,
      blocked: headers.filter(isBlockedColumn),
      mapping: detectMapping(headers),
      preview: rows.slice(0, 5).map(strip),
      total: rows.length,
      rows: rows.length <= PREVIEW_ROW_LIMIT ? rows.map(strip) : undefined,
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Die Datei konnte nicht gelesen werden." };
  }
}

export type ImportState = { error?: string; message?: string };

export async function runImportAction(_prev: ImportState, fd: FormData): Promise<ImportState> {
  try {
    const ctx = await ownerCtx();
    const { rows, fileName } = await readUpload(fd);
    const mapping: Mapping = {};
    for (const key of Object.keys(FIELDS) as (keyof typeof FIELDS)[]) {
      const col = String(fd.get(`map_${key}`) ?? "");
      if (col && !isBlockedColumn(col)) mapping[key] = col;
    }
    // Name ist kein Pflichtfeld (Ole, 14.11.2026): Ein Merkmal zum Wiedererkennen reicht
    if (!mapping.phone && !mapping.email && !mapping.externalNo) return { error: "Bitte mindestens Telefon/Mobil, E-Mail oder Kundennummer zuordnen." };
    const blocker = mappingBlocker(rows, mapping);
    if (blocker) return { error: blocker };
    if (fd.get("consent") !== "on") return { error: "Bitte bestätigen, dass die Einwilligungen vorliegen." };
    // Import-Lauf festhalten: neu angelegte Kunden tragen seine ID (für „Letzten Import rückgängig machen“)
    const run = await prisma.existingCustomerImport.create({ data: { customerId: ctx.customerId, createdById: ctx.userId, fileName, rows: rows.length } });
    let r;
    try {
      r = await importRows(ctx.customerId, rows, mapping, new Date(), { importId: run.id });
    } catch (err) {
      // Nichts angelegt → Lauf wieder weg; teilweise angelegt → Lauf bleibt (lässt sich rückgängig machen)
      if (!(await prisma.existingCustomer.count({ where: { customerId: ctx.customerId, importId: run.id } }))) {
        await prisma.existingCustomerImport.delete({ where: { id: run.id } }).catch(() => {});
      }
      throw err;
    }
    await prisma.existingCustomerImport.update({ where: { id: run.id }, data: { created: r.created, updated: r.updated, contracts: r.contracts } });
    await audit("bestand.import", { entity: "ExistingCustomerImport", entityId: run.id, customerId: ctx.customerId, details: { ...r } });
    revalidatePath("/buyer/bestand");
    const de = (n: number) => n.toLocaleString("de-DE");
    return {
      message:
        `${de(r.customers)} Kunden übernommen (${de(r.created)} neu, ${de(r.updated)} aktualisiert) mit ${de(r.contracts)} Verträgen, ${de(r.withPhone)} mit Mobilnummer.` +
        (r.inactiveContracts ? ` ${de(r.inactiveContracts)} Verträge sind storniert oder ruhend und zählen nicht für Chancen.` : "") +
        (r.skipped ? ` ${de(r.skipped)} Zeilen ohne Kundennummer, Telefon und E-Mail übersprungen.` : ""),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Import fehlgeschlagen." };
  }
}

export type UndoState = { ok?: boolean; error?: string; message?: string };

/** „Letzten Import rückgängig machen“ (nur Inhaber): löscht nur die Kunden, die dieser Import angelegt hat. */
export async function undoImportAction(_prev: UndoState, fd: FormData): Promise<UndoState> {
  try {
    const ctx = await ownerCtx();
    if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie das Rückgängigmachen." };
    const r = await undoLastImport(ctx.customerId, ctx.userId);
    if (!r.ok) return { error: r.error };
    await audit("bestand.import_undo", { entity: "ExistingCustomerImport", customerId: ctx.customerId, details: { removed: r.removed, kept: r.kept } });
    revalidatePath("/buyer/bestand");
    const de = (n: number) => n.toLocaleString("de-DE");
    return {
      ok: true,
      message:
        `${de(r.removed)} Kunden aus dem Import vom ${r.at.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })} entfernt.` +
        (r.kept ? ` ${de(r.kept)} bleiben, weil sie schon angeschrieben wurden oder gesperrt sind.` : ""),
    };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Rückgängig machen fehlgeschlagen." };
  }
}

export async function startCampaignAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const occasion = String(fd.get("occasion")) as Occasion;
  if (!(occasion in OCCASIONS)) throw new Error("Unbekannter Anlass.");
  if (occasion === "empfehlung") {
    const m = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true } });
    if (!m?.empfehlungEnabled) redirect("/buyer/konto?modul=empfehlung#zusatzmodule");
  }
  const segment = JSON.parse(String(fd.get("segment") ?? "{}")) as Segment;
  const quota = await bestandQuota(ctx.customerId);
  if (quota.remaining <= 0) redirect("/buyer/bestand?kontingent=1");
  const campaign = await createCampaign({
    customerId: ctx.customerId,
    occasion,
    segment,
    topic: String(fd.get("topic") ?? "").trim() || null,
    dailyLimit: Number(fd.get("dailyLimit")) || 150,
    createdById: ctx.userId,
  });
  await audit("bestand.campaign", { entity: "CustomerCampaign", entityId: campaign.id, customerId: ctx.customerId, details: { occasion, segment } });
  revalidatePath("/buyer/bestand");
  redirect("/buyer/bestand?gestartet=1");
}

export async function toggleCampaignAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const c = await prisma.customerCampaign.findFirst({ where: { id: String(fd.get("id") ?? ""), customerId: ctx.customerId } });
  if (!c || c.status === "done") return;
  await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: c.status === "running" ? "paused" : "running", pausedReason: null } });
  revalidatePath("/buyer/bestand");
}

export type BookState = { ok?: boolean; error?: string; fallback?: boolean; until?: string };

/** Modul selbst kostenpflichtig buchen (oder Kündigung zurücknehmen) – nur Inhaber, mit Bestätigung. */
export async function bookBestandModuleAction(_prev: BookState, fd: FormData): Promise<BookState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Bitte den Inhaber fragen – nur er kann Module buchen." };
  if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie die kostenpflichtige Buchung." };
  const res = await selfBookBestand(ctx.customerId, { id: ctx.userId, email: ctx.email ?? null, role: "kunde" });
  revalidatePath("/buyer/bestand");
  revalidatePath("/buyer/konto");
  if (!res.ok) return { error: res.error, fallback: res.fallback };
  return { ok: true };
}

/** Modul selbst zum Ende des Abrechnungszeitraums kündigen – nur Inhaber. */
export async function cancelBestandModuleAction(_prev: BookState, fd: FormData): Promise<BookState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Bitte den Inhaber fragen – nur er kann Module kündigen." };
  if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie die Kündigung." };
  const res = await selfCancelBestand(ctx.customerId, { id: ctx.userId, email: ctx.email ?? null, role: "kunde" });
  revalidatePath("/buyer/bestand");
  revalidatePath("/buyer/konto");
  if (!res.ok) return { error: res.error };
  return { ok: true, until: res.until.toISOString() };
}

export type RequestState = { ok?: boolean; error?: string };

/** Modul im Kundenbereich anfragen (kein Self-Checkout): Mail + Push an uns, Eintrag in Admin „Heute“. */
// Wird über useActionState aufgerufen; Formularinhalt und Vorzustand werden nicht gebraucht.
export async function requestBestandModuleAction(): Promise<RequestState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann Module anfragen." };
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, existingCustomersEnabled: true, bestandRequestedAt: true } });
  if (!c) return { error: "Konto nicht gefunden." };
  if (c.existingCustomersEnabled) return { ok: true };
  if (!c.bestandRequestedAt) {
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandRequestedAt: new Date() } });
    await audit("bestand.request", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId });
    await sendToAdmins({
      title: `Modul-Anfrage: ${c.name}`,
      body: `Bestandskunden-Modul (${PRICE_LIST.bestandModuleMonthly} €/Monat) angefragt`,
      url: `/admin/kunden/${ctx.customerId}/abrechnung`,
      tag: `bestand-request:${ctx.customerId}`,
    }).catch(() => {});
    await sendCustomerMail({
      to: process.env.ADMIN_EMAIL?.trim() || PROVIDER.email,
      subject: `Modul-Anfrage: Bestandskunden-Modul für ${c.name}`,
      greeting: "Hallo,",
      paragraphs: [
        `${c.name} (${ctx.email}) möchte das Bestandskunden-Modul buchen (${PRICE_LIST.bestandModuleMonthly} € netto im Monat).`,
        "Buchen in der Kundenakte unter „Abrechnung“. Dabei wird das Stripe-Abo angepasst.",
      ],
      signature: PROVIDER.brand,
      replyTo: ctx.email ?? null,
    }).catch((err) => reportError(err, "bestand-request-mail"));
  }
  revalidatePath("/buyer/bestand");
  revalidatePath("/buyer/konto");
  return { ok: true };
}

// ─── Zusatzpakete (Ole, 14.11.2026): nur Inhaber ─────────────────────────

export type PackState = { ok?: boolean; error?: string; fallback?: boolean; message?: string };

async function ownerForPacks() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." } as const;
  if (ctx.teamRole !== "owner") return { error: "Bitte den Inhaber fragen: Nur er kann Pakete buchen." } as const;
  return { ctx, userId: ctx.userId } as const;
}

/** Zusatzpaket buchen (Einmalposten, sofort freigeschaltet). */
export async function bookPackAction(_prev: PackState, fd: FormData): Promise<PackState> {
  const o = await ownerForPacks();
  if ("error" in o) return { error: o.error };
  if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie die kostenpflichtige Buchung." };
  const r = await purchasePack(o.ctx.customerId, Number(fd.get("messages")), { actor: { id: o.userId, email: o.ctx.email ?? null, role: "kunde" } });
  revalidatePath("/buyer/bestand");
  if (!r.ok) return { error: r.error, fallback: r.fallback };
  return {
    ok: true,
    message: `${r.messages.toLocaleString("de-DE")} Nachrichten sind freigeschaltet, gültig bis ${r.expiresAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}. Eine Bestätigung kommt per E-Mail.`,
  };
}

/** Großes bzw. individuelles Paket anfragen (Aufgabe für uns). Auch Rückfall, wenn online buchen nicht geht. */
export async function requestPackAction(_prev: PackState, fd: FormData): Promise<PackState> {
  const o = await ownerForPacks();
  if ("error" in o) return { error: o.error };
  const n = Number(String(fd.get("messagesPerMonth") ?? "").replace(/\D/g, ""));
  const note = String(fd.get("note") ?? "").trim().slice(0, 500) || null;
  await requestLargePack(o.ctx.customerId, { messagesPerMonth: n > 0 ? n : null, note, actor: { id: o.userId, email: o.ctx.email ?? null, role: "kunde" } });
  return { ok: true, message: "Danke, Ihre Anfrage ist bei uns. Wir melden uns mit einem Angebot." };
}

/** „Automatisch nachbuchen“ ein/aus mit Höchstbetrag je Monat. */
export async function saveAutoTopUpAction(_prev: PackState, fd: FormData): Promise<PackState> {
  const o = await ownerForPacks();
  if ("error" in o) return { error: o.error };
  const on = fd.get("enabled") === "on";
  const max = Number(String(fd.get("max") ?? "").replace(",", "."));
  const r = await setAutoTopUp(o.ctx.customerId, on ? max : null, { id: o.userId, email: o.ctx.email ?? null, role: "kunde" });
  revalidatePath("/buyer/bestand");
  if (!r.ok) return { error: r.error };
  return { ok: true, message: r.max == null ? "Automatisch nachbuchen ist aus." : `Gespeichert: höchstens ${r.max.toLocaleString("de-DE")} € netto im Monat.` };
}

// ─── Empfehlungslink: Vorschau für den Dialog in der Kundenliste ─────────

export type ReferralPreview = { ok: boolean; error?: string; hasPhone?: boolean; texts?: Record<string, string> };

/**
 * Vorschau der Texte je Anlass ("" = ohne Anlass) für einen Bestandskunden. Rendert wie das Senden
 * (lib/empfehlung/requests.ts, sendReferralLinkNow) mit renderText und OCCASIONS; der Link ist ein Platzhalter.
 */
export async function referralPreviewAction(existingCustomerId: string): Promise<ReferralPreview> {
  const ctx = await getBuyerContext();
  if (!ctx) return { ok: false, error: "Nicht angemeldet." };
  if (ctx.teamRole !== "owner") return { ok: false, error: "Nur der Inhaber kann Bestandskunden verwalten." };
  const e = await prisma.existingCustomer.findFirst({ where: { id: existingCustomerId, customerId: ctx.customerId }, select: { firstName: true, lastName: true, phone: true } });
  if (!e) return { ok: false, error: "Kontakt nicht gefunden." };
  const [settings, cust] = await Promise.all([loadSettings(ctx.customerId), prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } })]);
  const vars = { vorname: firstName([e.firstName, e.lastName].filter(Boolean).join(" ") || null), link: "[persönlicher Link]", vertreter: advisorDisplayName(cust?.name ?? "") };
  const texts: Record<string, string> = { "": renderText(settings.texts.referral, vars) };
  for (const [k, o] of Object.entries(REFERRAL_OCCASIONS)) texts[k] = renderText(o.text, vars);
  return { ok: true, hasPhone: !!e.phone, texts };
}

/** Text und persönlichen Link zum Kopieren erstellen (ohne zu senden), z. B. für Kunden ohne Mobilnummer. */
export async function referralCopyAction(existingCustomerId: string, occasion: string): Promise<ShareState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann Bestandskunden verwalten." };
  const m = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { empfehlungEnabled: true, name: true } });
  if (!m?.empfehlungEnabled) return { error: "Dafür braucht es das Modul „Empfehlungen & Bewertungen“." };
  const e = await prisma.existingCustomer.findFirst({ where: { id: existingCustomerId, customerId: ctx.customerId }, select: { firstName: true, lastName: true, optOutAt: true } });
  if (!e) return { error: "Kontakt nicht gefunden." };
  if (e.optOutAt) return { error: "Dieser Kunde möchte keine Nachrichten mehr." };
  const link = await referralLinkOf({ customerId: ctx.customerId, existingCustomerId });
  const url = referralLinkFor(link.token);
  const settings = await loadSettings(ctx.customerId);
  const o = isReferralOccasion(occasion) ? REFERRAL_OCCASIONS[occasion] : null;
  const text = renderText(o ? o.text : settings.texts.referral, {
    vorname: firstName([e.firstName, e.lastName].filter(Boolean).join(" ") || null),
    link: url,
    vertreter: advisorDisplayName(m.name),
  });
  return { ok: false, link: url, text };
}
