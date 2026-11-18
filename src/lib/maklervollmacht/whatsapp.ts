// Maklervollmacht per WhatsApp (Ole, 18.11.2026; nur Makler): Link in den bestehenden Assistenten-Chat, im offenen
// 24-h-Fenster als freie Nachricht, sonst über die freigegebene Vorlage „maklervollmacht“ (UTILITY, je Makler-Kunde
// eingereicht, lib/whatsapp/template-plan.ts MAKLER_PURPOSES). Ohne Fenster und ohne freigegebene Vorlage: kein Versand,
// die Karte bietet die E-Mail an. Genau eine Erinnerung nach 2 Tagen ohne Unterschrift (runVollmachtErinnerungen im
// WhatsApp-Cron), Stopp bei Unterschrift, Widerruf, eigener Vollmacht und Abmeldung.
// Texte: lib/maklervollmacht/texte.ts vollmachtWhatsAppText. Senden: lib/whatsapp/templates.ts sendWhatsAppNotice
// (Nachricht im Chat, Abmeldung und Einwilligung werden dort geprüft).

import { prisma } from "@/lib/prisma";
import { logLeadHistory } from "@/lib/lead-history";
import { asAnsprache } from "@/lib/ansprache";
import { ERINNERUNG_NACH_TAGE } from "@/lib/maklervollmacht/regeln";
import { vollmachtWhatsAppText } from "@/lib/maklervollmacht/texte";
import { istMakler, VV_LINK_TAGE, vollmachtLink } from "@/lib/maklervollmacht/server";

const DAY = 86_400_000;

export type VvWhatsAppStand = {
  /** Der Lead hat einen WhatsApp-Chat (WhatsApp verbunden) */
  chat: boolean;
  /** Jetzt senden möglich (Fenster offen oder Vorlage freigegeben, nicht abgemeldet) */
  moeglich: boolean;
  /** 24-h-Fenster offen */
  offen: boolean;
  /** Fenster zu, Vorlage freigegeben */
  vorlage: boolean;
  /** Warum nicht (für den Hinweis in der Karte) */
  grund: "abgemeldet" | "keine_einwilligung" | "fenster_zu" | null;
};

const LEER: VvWhatsAppStand = { chat: false, moeglich: false, offen: false, vorlage: false, grund: null };

async function chatVon(customerId: string, leadId: string, phone: string | null) {
  return prisma.conversation.findFirst({
    where: { customerId, OR: [{ leadId }, ...(phone ? [{ contactPhone: phone }] : [])] },
    orderBy: { lastMessageAt: "desc" },
    select: { id: true, contactPhone: true, contactName: true, windowExpiresAt: true, optedOutAt: true },
  });
}

/** Kann die Vollmacht diesem Kontakt jetzt per WhatsApp geschickt werden? */
export async function whatsAppStand(leadId: string, customerId: string, opts: { erinnerung?: boolean; now?: Date } = {}): Promise<VvWhatsAppStand> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findFirst({ where: { id: leadId, customerId, erasedAt: null }, select: { phone: true, waConsent: true, waUnavailableAt: true } });
  if (!lead) return LEER;
  const [conv, account] = await Promise.all([chatVon(customerId, leadId, lead.phone), prisma.whatsAppAccount.findUnique({ where: { customerId }, select: { status: true } })]);
  if (!conv?.contactPhone || account?.status !== "connected") return LEER;
  if (conv.optedOutAt) return { chat: true, moeglich: false, offen: false, vorlage: false, grund: "abgemeldet" };
  if (lead.waConsent === "nein" || lead.waUnavailableAt) {
    const wrote = await prisma.message.count({ where: { conversationId: conv.id, direction: "inbound" } });
    if (!wrote) return { chat: true, moeglich: false, offen: false, vorlage: false, grund: "keine_einwilligung" };
  }
  const offen = !!conv.windowExpiresAt && conv.windowExpiresAt.getTime() > now.getTime();
  const vorlage = offen
    ? false
    : await import("@/lib/whatsapp/templates")
        .then((t) => t.pickApprovedTemplate(customerId, opts.erinnerung ? "maklervollmacht_erinnerung" : "maklervollmacht"))
        .then((x) => !!x)
        .catch(() => false);
  return { chat: true, moeglich: offen || vorlage, offen, vorlage, grund: offen || vorlage ? null : "fenster_zu" };
}

export type VvWhatsAppErgebnis = { ok: true } | { ok: false; error: string; grund?: "fenster_zu" | "abgemeldet" | "eigene" | "kein_chat" };

/** Senden (Karte: vom Makler per Klick; Cron: die eine Erinnerung). Die Vollmacht muss offen und gültig sein. */
export async function sendeVollmachtWhatsApp(id: string, customerId: string, opts: { userId?: string | null; erinnerung?: boolean; now?: Date } = {}): Promise<VvWhatsAppErgebnis> {
  const now = opts.now ?? new Date();
  if (!(await istMakler(customerId))) return { ok: false, error: "Die Maklervollmacht gibt es nur für Makler." };
  const v = await prisma.maklervollmacht.findFirst({ where: { id, customerId }, select: { id: true, token: true, status: true, leadId: true, ansprache: true, createdAt: true } });
  if (!v) return { ok: false, error: "Vollmacht nicht gefunden." };
  if (v.status === "eigene") return { ok: false, error: "Für diesen Kunden liegt eine eigene Vollmacht vor.", grund: "eigene" };
  if (v.status !== "offen") return { ok: false, error: "Diese Vollmacht ist nicht mehr offen." };
  if (v.createdAt.getTime() < now.getTime() - VV_LINK_TAGE * DAY) return { ok: false, error: "Der Link ist abgelaufen. Bitte einen neuen anfordern." };
  const lead = await prisma.lead.findFirst({ where: { id: v.leadId, customerId }, select: { name: true, phone: true } });
  const stand = await whatsAppStand(v.leadId, customerId, { erinnerung: opts.erinnerung, now });
  if (!stand.chat || !lead) return { ok: false, error: "Mit diesem Kontakt gibt es keinen WhatsApp-Chat.", grund: "kein_chat" };
  if (stand.grund === "abgemeldet" || stand.grund === "keine_einwilligung") return { ok: false, error: "Ihr Kunde möchte keine WhatsApp-Nachrichten.", grund: "abgemeldet" };
  if (!stand.moeglich) return { ok: false, error: "Per WhatsApp geht das erst, wenn Ihr Kunde wieder schreibt. Bitte per E-Mail senden.", grund: "fenster_zu" };
  const conv = await chatVon(customerId, v.leadId, lead.phone);
  if (!conv?.contactPhone) return { ok: false, error: "Mit diesem Kontakt gibt es keinen WhatsApp-Chat.", grund: "kein_chat" };

  const [templates, { ansprechpartner }, { vermittlerName }, stopp] = await Promise.all([
    import("@/lib/whatsapp/templates"),
    import("@/lib/lead-anrede"),
    import("@/lib/vermittler-nennung"),
    import("@/lib/whatsapp/stopp"),
  ]);
  const an = asAnsprache(v.ansprache);
  const who = await ansprechpartner({ customerId, leadId: v.leadId, phone: conv.contactPhone, name: conv.contactName ?? lead.name });
  const person = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  const link = vollmachtLink(v.token);
  try {
    await templates.sendWhatsAppNotice({
      customerId,
      to: conv.contactPhone,
      purpose: opts.erinnerung ? "maklervollmacht_erinnerung" : "maklervollmacht",
      params: [templates.firstNameOf(conv.contactName ?? lead.name), link],
      text: vollmachtWhatsAppText(an, person.nom, link, !!opts.erinnerung),
      leadId: v.leadId,
      contactName: conv.contactName,
      anrede: who.kontakt,
      // Vom Makler per Klick; die Erinnerung ist automatisch (nur an Leads aus der Pipeline)
      manuell: !opts.erinnerung,
      textButtons: [],
    });
  } catch (err) {
    if (err instanceof templates.NoTemplateError) return { ok: false, error: "Per WhatsApp geht das erst, wenn Ihr Kunde wieder schreibt. Bitte per E-Mail senden.", grund: "fenster_zu" };
    if (err instanceof stopp.WhatsAppOptOutError || err instanceof stopp.WhatsAppNoConsentError || err instanceof stopp.WhatsAppUnavailableError) {
      return { ok: false, error: "Ihr Kunde möchte keine WhatsApp-Nachrichten.", grund: "abgemeldet" };
    }
    console.error("[maklervollmacht] WhatsApp", err instanceof Error ? err.message : err);
    return { ok: false, error: "Senden hat nicht geklappt. Bitte später noch einmal." };
  }
  await prisma.maklervollmacht.update({
    where: { id: v.id },
    data: opts.erinnerung ? { erinnerungAt: now, erinnerungStatus: "gesendet" } : { waSentAt: now },
  });
  await logLeadHistory(v.leadId, "dokument", opts.erinnerung ? "Erinnerung an die Maklervollmacht per WhatsApp gesendet" : "Maklervollmacht per WhatsApp gesendet", {
    customerId,
    userId: opts.userId ?? null,
  });
  return { ok: true };
}

/** Berliner Stunde (Erinnerungen nur tagsüber). */
const berlinStunde = (d: Date) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", hourCycle: "h23" }).format(d));

/**
 * Cron: genau eine Erinnerung 2 Tage nach dem Senden per WhatsApp, solange nicht unterschrieben (Status offen, also
 * nicht nach Unterschrift, Widerruf oder eigener Vollmacht). Nur werktags wie sonntags zwischen 9 und 19 Uhr Berlin.
 * Abgemeldet bzw. kein Chat mehr: gestoppt (nie wieder). Fenster zu ohne freigegebene Vorlage: später noch einmal
 * versuchen, solange der Link gilt.
 */
export async function runVollmachtErinnerungen(now = new Date(), opts: { limit?: number } = {}): Promise<{ gesendet: number; gestoppt: number; wartet: number }> {
  const out = { gesendet: 0, gestoppt: 0, wartet: 0 };
  const h = berlinStunde(now);
  if (h < 9 || h >= 19) return out;
  const kandidaten = await prisma.maklervollmacht.findMany({
    where: {
      status: "offen",
      erinnerungAt: null,
      waSentAt: { lte: new Date(now.getTime() - ERINNERUNG_NACH_TAGE * DAY) },
      createdAt: { gt: new Date(now.getTime() - VV_LINK_TAGE * DAY) },
      customer: { vermittlerTyp: "makler", dormantSince: null },
    },
    select: { id: true, customerId: true, leadId: true },
    orderBy: { waSentAt: "asc" },
    take: opts.limit ?? 50,
  });
  for (const k of kandidaten) {
    const r = await sendeVollmachtWhatsApp(k.id, k.customerId, { erinnerung: true, now }).catch(() => ({ ok: false as const, error: "Fehler", grund: undefined }));
    if (r.ok) {
      out.gesendet++;
      continue;
    }
    if (r.grund === "fenster_zu") {
      out.wartet++;
      continue;
    }
    if (r.grund === "abgemeldet" || r.grund === "kein_chat" || r.grund === "eigene") {
      await prisma.maklervollmacht.update({ where: { id: k.id }, data: { erinnerungAt: now, erinnerungStatus: "gestoppt" } });
      out.gestoppt++;
      continue;
    }
    out.wartet++;
  }
  return out;
}
