"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@/generated/prisma/client";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { sendToAdmins } from "@/lib/push";
import { logOfferActivity } from "@/lib/offer-links";
import { bookHelpCall } from "@/lib/help-call";
import { checkMetaAccess, type MetaCheck } from "@/lib/selbst-einrichtung";
import { asAnsprache } from "@/lib/ansprache";
import { STEP_SKIP_KEYS } from "@/lib/onboarding";

/** Gründe fürs Überspringen: Gesellschaft erlaubt es nicht, nutze ich nicht, später selbst. */
const SKIP_REASONS = ["gesellschaft", "nicht_noetig", "spaeter"];
import { vorlagenAufAnsprache } from "@/lib/mail/vorlagen";

export type SetupState = { ok?: boolean; error?: string };

async function requireCustomer() {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) throw new Error("In der Vorschau nicht möglich.");
  if (ctx.teamRole === "advisor") throw new Error("Nur der Inhaber kann das ändern.");
  const ob = await prisma.onboarding.findUnique({ where: { customerId: ctx.customerId }, include: { customer: { select: { name: true } } } });
  if (!ob) throw new Error("Kein Onboarding gefunden.");
  return { ctx, ob };
}

const str = (fd: FormData, k: string, max = 500) => String(fd.get(k) ?? "").trim().slice(0, max);
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);

export async function saveQuestionnaireAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const software = ob.package !== "service";
  const special = str(fd, "special", 1500);
  // Frühere Antworten („Wer ruft zurück“, E-Mail für Termineinladungen) bleiben erhalten, werden aber nicht mehr abgefragt
  const prev = (ob.questionnaire && typeof ob.questionnaire === "object" ? ob.questionnaire : {}) as Record<string, unknown>;
  const data: Record<string, unknown> = { ...prev, special };

  if (software) {
    const formats = ["telefon", "video", "vorOrt"].filter((k) => fd.get(`format_${k}`) === "on");
    if (formats.length === 0) return { error: "Bitte mindestens eine Terminart wählen." };
    const ansprache = asAnsprache(String(fd.get("ansprache") ?? "sie"));
    Object.assign(data, { formats, ansprache });
    // Ansprache gilt sofort für alle Texte an Leads (Ole, 14.11.2026)
    const before = await prisma.customer.findUnique({ where: { id: ob.customerId }, select: { leadAddress: true } });
    if (asAnsprache(before?.leadAddress) !== ansprache) {
      await prisma.customer.update({ where: { id: ob.customerId }, data: { leadAddress: ansprache } });
      await vorlagenAufAnsprache(ob.customerId, ansprache);
    }
  } else {
    const leadEmails = str(fd, "leadEmails", 500)
      .split(/[,;\s]+/)
      .map((s) => s.toLowerCase())
      .filter(Boolean);
    if (leadEmails.length === 0 || !leadEmails.every(isEmail)) return { error: "Bitte mindestens eine gültige E-Mail-Adresse für neue Leads angeben." };
    data.leadEmails = leadEmails;
  }

  const first = !ob.questionnaireAt;
  await prisma.onboarding.update({ where: { id: ob.id }, data: { questionnaire: data as object, questionnaireAt: new Date() } });
  if (first) {
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Fragebogen ausgefüllt");
    await sendToAdmins({ title: `📝 Fragebogen ausgefüllt: ${ob.customer.name}`, body: "Onboarding", url: ob.salesContactId ? `/admin/vertrieb/kontakte/${ob.salesContactId}` : "/admin/vertrieb/kunden" }).catch(() => {});
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

export async function confirmMetaAccessAction(_prev: SetupState, _fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  if (!ob.metaAccessAt) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { metaAccessAt: new Date() } });
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Kunde hat Meta-Zugriff erteilt (bitte prüfen)");
    await sendToAdmins({ title: `🔑 Meta-Zugriff erteilt: ${ob.customer.name}`, body: "Bitte im Business Manager prüfen.", url: ob.salesContactId ? `/admin/vertrieb/kontakte/${ob.salesContactId}` : "/admin/vertrieb/kunden" }).catch(() => {});
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

/**
 * Impressum-Adresse der eigenen Webseite (Rechtsvorprüfung 16.11.2026): Pflichtangabe auf den Seiten für Endkunden.
 * Freiwillig im Ablauf (blockiert die Einrichtung nicht), ohne sie zeigen die Seiten die Erstinformation.
 */
export async function saveImpressumUrlAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const { impressumUrlSpeichern } = await import("@/lib/impressum-fehlt");
  const r = await impressumUrlSpeichern(ob.customerId, str(fd, "impressumUrl", 300));
  if (!r.ok) return { error: r.error };
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

export async function bookHelpCallAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  try {
    const { ctx } = await requireCustomer();
    const res = await bookHelpCall(ctx.customerId, String(fd.get("start") ?? ""), String(fd.get("topic") ?? "").trim().slice(0, 200) || null);
    if (!res.ok) return { error: res.error };
    revalidatePath("/buyer", "layout");
    return { ok: true };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

// ─── Selbst-Einrichtung: Meta-Zugriff prüfen bzw. anfragen, Einwilligung ───

export type MetaSetupState = { ok?: boolean; error?: string; message?: string; check?: MetaCheck };

export async function checkMetaAccessAction(_prev: MetaSetupState, fd: FormData): Promise<MetaSetupState> {
  try {
    const { ctx } = await requireCustomer();
    const r = await checkMetaAccess(ctx.customerId, { adAccount: str(fd, "adAccount", 200) || null, page: str(fd, "page", 300) || null }, { source: "kunde" });
    revalidatePath("/buyer", "layout");
    if (!r.ok) return { error: r.error, check: r.check };
    return r.check.ok
      ? {
          ok: true,
          check: r.check,
          message:
            r.check.dataset?.state === "ok"
              ? "Alles freigegeben, danke! Wir kümmern uns jetzt um die Kampagne."
              : "Werbekonto, Seite und Leads sind freigegeben, danke! Wir kümmern uns jetzt um die Kampagne. Den Datensatz können Sie nachreichen.",
        }
      : { ok: false, check: r.check };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

export async function confirmConsentAction(): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  if (!ob.consentAt) {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { consentAt: new Date() } });
    await logOfferActivity({ dealId: null, salesContactId: ob.salesContactId }, "Onboarding: Kunde hat die Einwilligung im Leadformular bestätigt (bitte prüfen)");
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

/**
 * Schritt ohne Formular abhaken (Ole, 13.11.2026: die ganze Liste muss erledigt werden können):
 * „App ohne Handy“ überspringen bzw. Provisionen „Passt so“ (Standardsätze übernehmen).
 */
export async function skipSetupStepAction(_prev: SetupState, fd: FormData): Promise<SetupState> {
  let ob;
  try {
    ({ ob } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const kind = String(fd.get("kind") ?? "");
  if (kind === "app") {
    await prisma.onboarding.update({ where: { id: ob.id }, data: { appSkippedAt: new Date() } });
  } else if (kind === "provision") {
    await prisma.customer.update({ where: { id: ob.customerId }, data: { provisionCheckedAt: new Date() } });
  } else if (kind === "mailbox_off") {
    // „Meine Gesellschaft erlaubt das nicht“: E-Mail-Funktionen aus, Schritt gilt als erledigt
    await prisma.customer.update({ where: { id: ob.customerId }, data: { mailFeaturesOff: true } });
  } else if (kind.startsWith("skip:")) {
    const [, key, reason] = kind.split(":");
    if (!(STEP_SKIP_KEYS as readonly string[]).includes(key) || !SKIP_REASONS.includes(reason)) return { error: "Unbekannter Schritt." };
    const current = (ob.stepSkips && typeof ob.stepSkips === "object" ? ob.stepSkips : {}) as Record<string, unknown>;
    await prisma.onboarding.update({
      where: { id: ob.id },
      data: { stepSkips: { ...current, [key]: { at: new Date().toISOString(), reason } } as Prisma.InputJsonValue },
    });
  } else {
    return { error: "Unbekannter Schritt." };
  }
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

// ─── Erstinformation (§ 15 VersVermV): Status, Registernummer, PDF oder Link (lib/erstinformation.ts) ───

export type ErstinfoState = { ok?: boolean; error?: string; tippgeber?: boolean };

export async function saveErstinfoAction(_prev: ErstinfoState, fd: FormData): Promise<ErstinfoState> {
  let ctx;
  try {
    ({ ctx } = await requireCustomer());
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
  const file = fd.get("pdf");
  const upload = file && typeof file === "object" && "arrayBuffer" in file && (file as File).size > 0 ? (file as File) : null;
  const { saveErstinfo } = await import("@/lib/erstinformation");
  const res = await saveErstinfo(ctx.customerId, {
    status: str(fd, "status", 40),
    registerNummer: str(fd, "registerNummer", 40),
    name: str(fd, "name", 160),
    firma: str(fd, "firma", 160),
    anschrift: str(fd, "anschrift", 400),
    telefon: str(fd, "telefon", 60),
    email: str(fd, "email", 160),
    versicherer: str(fd, "versicherer", 4000),
    erlaubnis: str(fd, "erlaubnis", 10),
    beratung: fd.get("beratung") !== "nein",
    beteiligungen: fd.get("beteiligungenJa") === "1" ? str(fd, "beteiligungen", 1000) || "Es bestehen Beteiligungen von über 10 %." : null,
    verguetung: fd.getAll("verguetung").map(String),
    zuwendungen: fd.get("zuwendungen") === "1",
    ihk: str(fd, "ihk", 160),
    file: upload ? { name: upload.name, data: new Uint8Array(await upload.arrayBuffer()) } : null,
    removeFile: fd.get("removeFile") === "1",
    userId: ctx.userId,
  });
  if (!res.ok) return res.error === "tippgeber" ? { tippgeber: true } : { error: res.error };
  revalidatePath("/buyer", "layout");
  return { ok: true };
}

// ─── WhatsApp: „Verbindung prüfen“ (lib/whatsapp/dialog360-match.ts) ───

export type WaCheckState = { ok?: boolean; message?: string; error?: string };

/** Nummer bei 360dialog suchen und nachträglich verbinden, falls der Rücksprung ausblieb. */
export async function checkWhatsAppConnectionAction(_prev: WaCheckState, _fd: FormData): Promise<WaCheckState> {
  try {
    const { ctx } = await requireCustomer();
    const { checkConnection } = await import("@/lib/whatsapp/dialog360-match");
    const r = await checkConnection(ctx.customerId, { id: ctx.userId ?? undefined, role: "kunde" });
    revalidatePath("/buyer/einrichtung");
    if (r.status === "connected") return { ok: true, message: `Verbunden${r.phone ? `: +${r.phone.replace(/^\+/, "")}` : ""}. Ihre Vorlagen werden jetzt bei Meta eingereicht.` };
    if (r.status === "pending")
      return {
        ok: true,
        message: r.activation
          ? "Wir haben Ihre Nummer gefunden. Sie wartet noch auf die Freischaltung bei 360dialog, wir kümmern uns darum und melden uns."
          : "Wir haben Ihre Nummer gefunden, sie wird gerade eingerichtet. Das dauert meist nur wenige Minuten.",
      };
    if (r.status === "not_found") return { error: "Wir finden noch keine Nummer zu Ihrem Konto. Haben Sie das Verbinden bis zum Ende durchlaufen? Sonst starten Sie es oben neu oder schreiben Sie uns." };
    if (r.status === "ambiguous") return { error: "Wir haben mehrere passende Nummern gefunden. Wir ordnen sie für Sie zu und melden uns." };
    return { error: "Die Prüfung hat gerade nicht geklappt. Bitte später noch einmal versuchen oder uns schreiben." };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Nicht möglich." };
  }
}

/** Inhaber: halb fertige WhatsApp-Verbindung (Einladung bzw. Einrichtung) verwerfen und neu beginnen. */
export async function resetWhatsAppAction(): Promise<WaCheckState> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.preview) return { error: "In der Vorschau nicht möglich." };
  if (ctx.teamRole !== "owner") return { error: "Nur der Inhaber kann das ändern." };
  const { resetUnfinishedConnection } = await import("@/lib/whatsapp/dialog360-match");
  const r = await resetUnfinishedConnection(ctx.customerId, { id: ctx.userId ?? undefined, role: "kunde" });
  if (r.status === "connected") return { error: "WhatsApp ist schon verbunden." };
  revalidatePath("/buyer/einrichtung");
  revalidatePath("/buyer", "layout");
  return { ok: true, message: "Zurückgesetzt. Sie können jetzt neu beginnen." };
}
