"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { FIELDS, detectMapping, importRows, isBlockedColumn, mappingBlocker, parseFile, undoLastImport, type Mapping } from "@/lib/bestand/import";
import { createCampaign, OCCASIONS, recordEmailReply, type EmailReplyKind, type Occasion, type Segment } from "@/lib/bestand/campaigns";
import { QUOTA_REACHED } from "@/lib/bestand/quota";
import { asChannelMode } from "@/lib/bestand/einwilligung";
import { requestConsent, setConsent } from "@/lib/bestand/einwilligung-server";
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
import { bestandVolumeAdmin } from "@/lib/bestand/volumen";

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
    if (fd.get("befugnis") !== "on") return { error: "Bitte bestätigen, dass Sie diese Kundendaten nutzen dürfen." };
    // „Alle Kunden dieser Liste haben eingewilligt“ je Kanal nur mit ausdrücklicher Bestätigung
    const consent = { email: fd.get("bulk_email") === "on", whatsapp: fd.get("bulk_whatsapp") === "on" };
    if ((consent.email || consent.whatsapp) && fd.get("bulk_confirm") !== "on") return { error: "Bitte bestätigen Sie die Einwilligungen ausdrücklich oder lassen Sie sie auf „unbekannt“." };
    // Import-Lauf festhalten: neu angelegte Kunden tragen seine ID (für „Letzten Import rückgängig machen“)
    const run = await prisma.existingCustomerImport.create({ data: { customerId: ctx.customerId, createdById: ctx.userId, fileName, rows: rows.length } });
    let r;
    try {
      r = await importRows(ctx.customerId, rows, mapping, new Date(), { importId: run.id, consent, actorUserId: ctx.userId });
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
        (r.skipped ? ` ${de(r.skipped)} Zeilen ohne Kundennummer, Telefon und E-Mail übersprungen.` : "") +
        (r.suppressed ? ` ${de(r.suppressed)} Kunden hatten sich früher abgemeldet und bleiben gesperrt.` : ""),
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
  const channelMode = asChannelMode(fd.get("channelMode"));
  const back = (err: string): never =>
    redirect(`/buyer/bestand/kampagne?${new URLSearchParams({ anlass: occasion, segment: JSON.stringify(segment), kanal: channelMode, fehler: err })}`);
  // Ausschließlichkeitsvertreter: Bestätigung beim ersten Kampagnenstart (Daten gehören oft dem Versicherer)
  const cust = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { bestandAgentConfirmedAt: true } });
  if (!cust?.bestandAgentConfirmedAt) {
    if (fd.get("agentConfirm") !== "on") back("Bitte bestätigen Sie, dass Sie die Kundendaten für diese Ansprache nutzen dürfen.");
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandAgentConfirmedAt: new Date(), bestandAgentConfirmedById: ctx.userId } });
    await audit("bestand.agent_confirm", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId });
  }
  let campaignId: string | null = null;
  let failure: string | null = null;
  try {
    const campaign = await createCampaign({
      customerId: ctx.customerId,
      occasion,
      segment,
      topic: String(fd.get("topic") ?? "").trim() || null,
      dailyLimit: Number(fd.get("dailyLimit")) || 150,
      createdById: ctx.userId,
      channelMode,
      mailSubject: String(fd.get("mailSubject") ?? ""),
      mailBody: String(fd.get("mailBody") ?? ""),
    });
    campaignId = campaign.id;
  } catch (err) {
    failure = err instanceof Error ? err.message : "Die Kampagne konnte nicht gestartet werden.";
  }
  if (failure === QUOTA_REACHED) redirect("/buyer/bestand?kontingent=1");
  if (!campaignId) back(failure ?? "Die Kampagne konnte nicht gestartet werden.");
  await audit("bestand.campaign", { entity: "CustomerCampaign", entityId: campaignId, customerId: ctx.customerId, details: { occasion, segment, channelMode } });
  revalidatePath("/buyer/bestand");
  redirect(`/buyer/bestand/kampagnen/${campaignId}?gestartet=1`);
}

// ─── Einwilligungen & Versand (Ole, 14.11.2026) ─────────────────────────

export type SettingsState = { ok?: boolean; error?: string; message?: string };

/** Bestätigung zu § 7 Abs. 3 UWG setzen bzw. zurücknehmen, Pflichtangaben speichern. */
export async function saveBestandRechtAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerCtx();
    const uwg = fd.get("uwg") === "on";
    const imprint = String(fd.get("imprint") ?? "").trim().slice(0, 2000) || null;
    const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { bestandUwgConfirmedAt: true } });
    await prisma.customer.update({
      where: { id: ctx.customerId },
      data: {
        bestandMailImprint: imprint,
        ...(uwg && !c?.bestandUwgConfirmedAt ? { bestandUwgConfirmedAt: new Date(), bestandUwgConfirmedById: ctx.userId } : {}),
        ...(!uwg && c?.bestandUwgConfirmedAt ? { bestandUwgConfirmedAt: null, bestandUwgConfirmedById: null } : {}),
      },
    });
    await audit("bestand.recht", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { uwg, imprint: !!imprint } });
    revalidatePath("/buyer/bestand");
    revalidatePath("/buyer/bestand/einwilligungen");
    return { ok: true, message: "Gespeichert." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/**
 * Altdaten (pauschale Import-Bestätigung „laut Versicherer“): „passt so“ bestätigt den Hinweis, zurücksetzen
 * stellt diese Einwilligungen auf „unbekannt“ (nur Quelle versicherer_pauschal).
 */
export async function legacyConsentAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerCtx();
    const choice = String(fd.get("choice") ?? "");
    if (choice === "ok") {
      await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandLegacyConsentReviewedAt: new Date() } });
      await audit("bestand.altdaten_ok", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId });
      revalidatePath("/buyer/bestand");
      revalidatePath("/buyer/bestand/einwilligungen");
      return { ok: true, message: "Danke, die Einwilligungen bleiben so." };
    }
    if (choice !== "reset_whatsapp" && choice !== "reset_all") return { error: "Bitte eine Auswahl treffen." };
    if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie das Zurücksetzen." };
    const base = { customerId: ctx.customerId };
    const wa = await prisma.existingCustomer.updateMany({
      where: { ...base, whatsappConsentSource: "versicherer_pauschal" },
      data: { whatsappConsent: null, whatsappConsentAt: null, whatsappConsentSource: null },
    });
    const mail =
      choice === "reset_all"
        ? await prisma.existingCustomer.updateMany({ where: { ...base, emailConsentSource: "versicherer_pauschal" }, data: { emailConsent: null, emailConsentAt: null, emailConsentSource: null } })
        : { count: 0 };
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandLegacyConsentReviewedAt: new Date() } });
    await prisma.bestandConsentLog.create({
      data: { customerId: ctx.customerId, channel: "whatsapp", action: "gesetzt", source: "vermittler", actorUserId: ctx.userId, text: `Pauschale Einwilligungen auf unbekannt gesetzt: WhatsApp ${wa.count}, E-Mail ${mail.count}` },
    });
    await audit("bestand.altdaten_reset", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { whatsapp: wa.count, email: mail.count } });
    revalidatePath("/buyer/bestand");
    revalidatePath("/buyer/bestand/einwilligungen");
    const de = (n: number) => n.toLocaleString("de-DE");
    return { ok: true, message: choice === "reset_all" ? `Zurückgesetzt: ${de(wa.count)} WhatsApp- und ${de(mail.count)} E-Mail-Einwilligungen stehen jetzt auf „unbekannt“.` : `Zurückgesetzt: ${de(wa.count)} WhatsApp-Einwilligungen stehen jetzt auf „unbekannt“.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

/** Massenänderung „alle haben eingewilligt“ je Kanal, nur mit ausdrücklicher Bestätigung (überschreibt kein „nein“). */
export async function bulkConsentAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerCtx();
    const channel = fd.get("channel") === "whatsapp" ? "whatsapp" : fd.get("channel") === "email" ? "email" : null;
    if (!channel) return { error: "Bitte den Kanal wählen." };
    if (fd.get("confirm") !== "on") return { error: "Bitte bestätigen Sie die Einwilligungen ausdrücklich." };
    const now = new Date();
    const where = { customerId: ctx.customerId, ...(channel === "email" ? { emailConsent: null, email: { not: null } } : { whatsappConsent: null, phone: { not: null } }) };
    const r = await prisma.existingCustomer.updateMany({
      where,
      data: channel === "email" ? { emailConsent: "ja", emailConsentAt: now, emailConsentSource: "vermittler" } : { whatsappConsent: "ja", whatsappConsentAt: now, whatsappConsentSource: "vermittler" },
    });
    await prisma.bestandConsentLog.create({
      data: {
        customerId: ctx.customerId,
        channel,
        action: "gesetzt",
        source: "vermittler",
        actorUserId: ctx.userId,
        text: `Vermittler bestätigt: Für alle ${r.count} Kunden mit bisher unbekannter Einwilligung liegt eine Einwilligung in Werbung per ${channel === "email" ? "E-Mail" : "WhatsApp"} vor.`,
      },
    });
    await audit("bestand.einwilligung_alle", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { channel, count: r.count } });
    revalidatePath("/buyer/bestand");
    revalidatePath("/buyer/bestand/einwilligungen");
    return { ok: true, message: `${r.count.toLocaleString("de-DE")} Kunden auf „Einwilligung: ja“ gesetzt.` };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

const ISO_DAY = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/;

/** Einwilligung eines Kunden je Kanal setzen (ja, nein, unbekannt) mit optionalem Datum. */
export async function setConsentAction(_prev: SettingsState, fd: FormData): Promise<SettingsState> {
  try {
    const ctx = await ownerCtx();
    const id = String(fd.get("id") ?? "");
    for (const channel of ["email", "whatsapp"] as const) {
      const raw = String(fd.get(channel) ?? "keep");
      if (raw === "keep") continue;
      const value = raw === "ja" ? "ja" : raw === "nein" ? "nein" : null;
      const dateRaw = String(fd.get(`${channel}At`) ?? "");
      const at = ISO_DAY.test(dateRaw) ? new Date(`${dateRaw}T12:00:00Z`) : null;
      await setConsent(id, channel, value, { source: "vermittler", at, actorUserId: ctx.userId, customerId: ctx.customerId });
    }
    revalidatePath("/buyer/bestand");
    return { ok: true, message: "Gespeichert." };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Speichern fehlgeschlagen." };
  }
}

export type ConsentLinkState = { ok?: boolean; error?: string; url?: string; text?: string; mailed?: boolean };

/** Einwilligung einholen: Link und Text zum Kopieren, oder per E-Mail (nur wenn ein anderer Weg zulässig ist). */
export async function requestConsentAction(existingCustomerId: string, byMail: boolean): Promise<ConsentLinkState> {
  try {
    const ctx = await ownerCtx();
    const r = await requestConsent(existingCustomerId, ctx.customerId, { byMail, actorUserId: ctx.userId });
    if (!r.ok) return { error: r.error };
    return { ok: true, url: r.url, text: r.text, mailed: r.mailed };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Das hat nicht geklappt." };
  }
}

export type ReplyState = { ok?: boolean; error?: string; message?: string; leadId?: string | null };

const REPLY_TEXT: Record<EmailReplyKind, string> = {
  interesse: "Als Interesse erkannt: Der Kontakt ist jetzt ein Lead in Ihrer Pipeline.",
  negativ: "Als Absage erkannt: Kein Lead angelegt, der Kunde zählt als „geantwortet“.",
  stop: "Als Abmeldung erkannt: Der Kunde bekommt keine Kampagnen-Mails mehr.",
  auto: "Automatische Antwort (z. B. Abwesenheit): nichts zu tun.",
  bounce: "Unzustellbar: Die Adresse ist vermerkt, der Versand wird bei vielen Fehlern gedrosselt.",
};

/** Antwort auf eine Kampagnen-Mail zuordnen (Absender und Text aus dem eigenen Postfach einfügen). */
export async function recordReplyAction(_prev: ReplyState, fd: FormData): Promise<ReplyState> {
  try {
    const ctx = await ownerCtx();
    const kindRaw = String(fd.get("kind") ?? "");
    const kind = (["interesse", "negativ", "stop", "auto", "bounce"] as const).find((k) => k === kindRaw) ?? null;
    const r = await recordEmailReply(ctx.customerId, {
      recipientId: String(fd.get("recipientId") ?? "") || null,
      fromEmail: String(fd.get("fromEmail") ?? "") || null,
      subject: String(fd.get("subject") ?? "") || null,
      text: String(fd.get("text") ?? "").slice(0, 5000) || null,
      kind,
    });
    if (!r.ok) return { error: r.error };
    await audit("bestand.antwort", { entity: "CampaignRecipient", customerId: ctx.customerId, details: { kind: r.kind } });
    revalidatePath("/buyer/bestand");
    return { ok: true, message: `${r.name}: ${REPLY_TEXT[r.kind]}`, leadId: r.leadId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Das hat nicht geklappt." };
  }
}

export async function toggleCampaignAction(fd: FormData): Promise<void> {
  const ctx = await ownerCtx();
  const c = await prisma.customerCampaign.findFirst({ where: { id: String(fd.get("id") ?? ""), customerId: ctx.customerId } });
  if (!c || c.status === "done") return;
  await prisma.customerCampaign.update({ where: { id: c.id }, data: { status: c.status === "running" ? "paused" : "running", pausedReason: null } });
  revalidatePath("/buyer/bestand");
  revalidatePath(`/buyer/bestand/kampagnen/${c.id}`);
}

export type BookState = { ok?: boolean; error?: string; fallback?: boolean; until?: string };

/** Modul selbst kostenpflichtig buchen (oder Kündigung zurücknehmen) – nur Inhaber, mit Bestätigung. */
export async function bookBestandModuleAction(_prev: BookState, fd: FormData): Promise<BookState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Bitte den Inhaber fragen, nur er kann Module buchen." };
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
  if (ctx.teamRole !== "owner") return { error: "Bitte den Inhaber fragen, nur er kann Module kündigen." };
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
export async function requestBestandModuleAction(_prev?: RequestState, fd?: FormData): Promise<RequestState> {
  const volume = bestandVolumeAdmin(fd?.get("volume"));
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview || !ctx.userId) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann Module anfragen." };
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, existingCustomersEnabled: true, bestandRequestedAt: true } });
  if (!c) return { error: "Konto nicht gefunden." };
  if (c.existingCustomersEnabled) return { ok: true };
  if (!c.bestandRequestedAt) {
    await prisma.customer.update({ where: { id: ctx.customerId }, data: { bestandRequestedAt: new Date() } });
    await audit("bestand.request", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, ...(volume ? { details: { volume } } : {}) });
    await sendToAdmins({
      title: `Modul-Anfrage: ${c.name}`,
      body: `Bestandskunden-Modul (${PRICE_LIST.bestandModuleMonthly} €/Monat) angefragt${volume ? `, geplant: ${volume}` : ""}`,
      url: `/admin/kunden/${ctx.customerId}/abrechnung`,
      tag: `bestand-request:${ctx.customerId}`,
    }).catch(() => {});
    await sendCustomerMail({
      to: process.env.ADMIN_EMAIL?.trim() || PROVIDER.email,
      subject: `Modul-Anfrage: Bestandskunden-Modul für ${c.name}`,
      greeting: "Hallo,",
      paragraphs: [
        `${c.name} (${ctx.email}) möchte das Bestandskunden-Modul buchen (${PRICE_LIST.bestandModuleMonthly} € netto im Monat).`,
        ...(volume ? [`Geplante Kampagnen-Nachrichten im Monat: ${volume}.`] : []),
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
