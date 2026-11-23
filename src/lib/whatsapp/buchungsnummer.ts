// WhatsApp über die Nummer aus der Online-Buchung (Ole, 23.11.2026, Fall Ignasiak): Die Nummer aus dem Meta-Formular hatte
// kein WhatsApp (Meta 131026, Lead.waUnavailableAt), der Lead bucht dann auf /book/<slug> mit einer anderen Handynummer.
// Das Feld heißt dort „Handynummer (für WhatsApp/Anruf)“ und die Seite kündigt die Bestätigung per WhatsApp an: Der Lead
// gibt die neue Nummer also für WhatsApp zu seiner eigenen Anfrage an. Dann gilt diese Nummer als WhatsApp-Kontakt:
//   - Chat (Conversation) für die neue Nummer, mit dem Lead verknüpft, Assistent an, Merker im Chat (WA_NUMMER_KIND).
//     Lead.phone (Nummer aus dem Formular) bleibt unverändert, es gibt kein eigenes Feld für weitere Nummern.
//   - „Kein WhatsApp“ fällt weg (Lead.waUnavailableAt, outreachStatus „no_whatsapp“), die Nur-SMS- bzw. Mail-Strecke stoppt.
//   - Bestätigung, Erinnerungen (laufen über den Chat des Termins) und Nachfass-Abfolgen (waNummerFuerLead) gehen an die
//     neue Nummer. Kommt dort wieder „kein WhatsApp“ (131026) zurück, markiert lib/whatsapp/kein-whatsapp.ts den Lead
//     wie gewohnt (der neue Chat hängt am Lead).
// Nachträglich (Ops-Aktion whatsapp_buchungsnummer): Nummer aus dem Termin bzw. dem Verlauf, danach nach einer Absage das
// Nachfassen „neuer Termin“ über eine freigegebene Vorlage (außerhalb des 24-h-Fensters nur Vorlagen).
//
// Getestet in tests/unit/whatsapp-buchungsnummer.test.ts.

import { prisma } from "@/lib/prisma";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { phoneKey } from "@/lib/vertrieb/dubletten";

/** Merker im Chat der neuen Nummer (interne Nachricht): diese Nummer ist der WhatsApp-Kontakt des Leads. */
export const WA_NUMMER_KIND = "wa_nummer_uebernommen";

/** Strecken-Schritte, die noch laufen (lib/mail-strecke). */
const STRECKE_LAEUFT = ["neu", "erstmail", "sms"];

/** Nachfassen nach einer Absage: Reihenfolge der Vorlagen (erste freigegebene gewinnt). */
export const NACH_ABSAGE_ZWECKE = ["followup_noshow", "followup", "followup_nudge"] as const;

const FERTIG = new Set(["abschluss", "kein interesse", "disqualifiziert"]);

/**
 * Soll die Nummer aus der Buchung der WhatsApp-Kontakt werden? Nur bei anderer, gültiger Nummer und wenn die bisherige
 * Nummer nicht per WhatsApp erreichbar ist (Lead.waUnavailableAt).
 */
export function buchungsnummerUebernehmen(o: { formPhone: string | null | undefined; neu: string | null | undefined; waUnavailableAt: Date | null | undefined }): boolean {
  const neu = phoneKey(o.neu ?? null);
  return !!neu && !!o.waUnavailableAt && neu !== phoneKey(o.formPhone ?? null);
}

/** Letzte abweichende Nummer aus dem Verlauf („Online-Buchung mit abweichender Handynummer +49…“, neueste zuerst). */
export function nummerAusVerlauf(texte: readonly string[]): string | null {
  for (const t of texte) {
    const m = /Online-Buchung mit abweichender Handynummer \+?(\d{8,15})/.exec(t);
    if (m) return normalizePhone(m[1]);
  }
  return null;
}

/** Verlaufseintrag beim Lead (ohne Gedankenstrich). */
export function uebernahmeNotiz(neu: string): string {
  return `WhatsApp jetzt über die Nummer aus der Online-Buchung +${neu.replace(/^\+/, "")}: Die Nummer aus dem Formular hat kein WhatsApp. Bestätigung, Erinnerungen und Assistent laufen über die neue Nummer, die Nummer aus dem Formular bleibt gespeichert.`;
}

export type Uebernahme = { ok: true; conversationId: string; nummer: string; schon: boolean } | { ok: false; grund: "nicht_gefunden" | "nummer_ungueltig" | "gleiche_nummer" | "abgemeldet" | "anderer_lead" };

/**
 * Nummer aus der Buchung als WhatsApp-Kontakt des Leads übernehmen (siehe Kopf). Idempotent: Ist der Merker schon da,
 * passiert außer dem Aufheben einer neuen Sperre nichts doppelt.
 */
export async function uebernimmBuchungsnummer(leadId: string, neuRaw: string, opts: { now?: Date } = {}): Promise<Uebernahme> {
  const now = opts.now ?? new Date();
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, name: true, phone: true, waUnavailableAt: true, outreachStatus: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return { ok: false, grund: "nicht_gefunden" };
  const nummer = normalizePhone(neuRaw);
  if (!nummer || !phoneKey(nummer)) return { ok: false, grund: "nummer_ungueltig" };
  if (phoneKey(nummer) === phoneKey(lead.phone)) return { ok: false, grund: "gleiche_nummer" };
  const vorhanden = await prisma.conversation.findUnique({
    where: { customerId_contactPhone: { customerId: lead.customerId, contactPhone: nummer } },
    select: { id: true, leadId: true, optedOutAt: true },
  });
  if (vorhanden?.optedOutAt) return { ok: false, grund: "abgemeldet" };
  if (vorhanden?.leadId && vorhanden.leadId !== lead.id) return { ok: false, grund: "anderer_lead" };
  const account = await prisma.whatsAppAccount.findUnique({ where: { customerId: lead.customerId }, select: { id: true } });
  const conv = await prisma.conversation.upsert({
    where: { customerId_contactPhone: { customerId: lead.customerId, contactPhone: nummer } },
    create: { customerId: lead.customerId, whatsAppAccountId: account?.id ?? null, contactPhone: nummer, contactName: lead.name, leadId: lead.id, botActive: true },
    update: { leadId: lead.id, botActive: true },
    select: { id: true },
  });
  const schon = (await prisma.message.count({ where: { conversationId: conv.id, kind: WA_NUMMER_KIND } })) > 0;
  if (!schon) {
    await prisma.message.create({
      data: { conversationId: conv.id, direction: "internal", kind: WA_NUMMER_KIND, body: JSON.stringify({ quelle: "online_buchung", formularNummer: lead.phone ? `…${lead.phone.slice(-4)}` : null }), sentBy: "system", createdAt: now },
    });
  }
  // „Kein WhatsApp“ gilt für die Formular-Nummer, nicht mehr für den Lead (Hinweis im Kontakt, Anrufliste, Versandsperre)
  const st = lead.outreachStatus ?? "";
  if (lead.waUnavailableAt || st === "no_whatsapp" || st.startsWith("failed")) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { waUnavailableAt: null, ...(st === "no_whatsapp" || st.startsWith("failed") ? { outreachStatus: "skipped_booked" } : {}) },
    });
  }
  // Nur-SMS- bzw. Mail-Strecke stoppt: ab jetzt läuft der Kontakt über WhatsApp
  await prisma.leadMailStrecke.updateMany({ where: { leadId: lead.id, schritt: { in: STRECKE_LAEUFT } }, data: { schritt: "gestoppt", stopGrund: "whatsapp_buchungsnummer" } });
  if (!schon) {
    const { logLeadHistory } = await import("@/lib/lead-history");
    await logLeadHistory(lead.id, "status", uebernahmeNotiz(nummer), { customerId: lead.customerId, userId: null }).catch(() => null);
  }
  return { ok: true, conversationId: conv.id, nummer, schon };
}

/**
 * WhatsApp-Nummer eines Leads für automatische Nachrichten: die aus der Online-Buchung übernommene (Merker im Chat),
 * sonst Lead.phone.
 */
export async function waNummerFuerLead(lead: { id: string; customerId: string; phone: string | null }): Promise<string | null> {
  try {
    const c = await prisma.conversation.findFirst({
      where: { customerId: lead.customerId, leadId: lead.id, optedOutAt: null, messages: { some: { kind: WA_NUMMER_KIND } } },
      orderBy: { createdAt: "desc" },
      select: { contactPhone: true },
    });
    return c?.contactPhone ?? lead.phone;
  } catch {
    // Ohne Datenbank bzw. bei Fehlern: wie bisher Lead.phone
    return lead.phone;
  }
}

export type Nachfassen = { gesendet: true; zweck: string; modus: "text" | "template" } | { gesendet: false; grund: string };

/**
 * Nachfassen nach einer Absage an die WhatsApp-Nummer: freigegebene Vorlage „Nachfassen nach verpasstem Termin“
 * (followup_noshow: „kein Problem, so etwas passiert … Sollen wir einen neuen Termin mit … finden?“, Knöpfe [Neuer Termin]
 * [Kein Bedarf mehr]); nicht freigegeben: „followup“ mit zwei freien Zeiten, sonst „followup_nudge“. Im offenen Fenster
 * derselbe Text als Freitext (sendWhatsAppNotice wählt). Keine neuen Texte.
 */
export async function nachAbsageNachfassen(lead: { id: string; customerId: string; name: string | null }, to: string): Promise<Nachfassen> {
  const [{ sendWhatsAppNotice, noticeText, firstNameOf, NoTemplateError }, { anspracheOf }, { ansprechpartner }, { zweiTerminvorschlaege }] = await Promise.all([
    import("@/lib/whatsapp/templates"),
    import("@/lib/whatsapp/reminders"),
    import("@/lib/lead-anrede"),
    import("@/lib/whatsapp/termin-vorschlaege"),
  ]);
  const an = await anspracheOf(lead.customerId);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: to, name: lead.name });
  const vorname = firstNameOf(lead.name);
  const basis = { customerId: lead.customerId, to, leadId: lead.id, contactName: lead.name, anrede: who.kontakt };
  const geprueft: string[] = [];
  for (const zweck of NACH_ABSAGE_ZWECKE) {
    let extra: { params: string[]; text: string; buttonPayloads?: string[]; legacyParams?: string[]; textButtons?: string[] };
    if (zweck === "followup") {
      const zeiten = await zweiTerminvorschlaege(lead.customerId, lead.id);
      if (!zeiten) continue;
      extra = { params: [vorname, ...zeiten.labels], text: noticeText("followup", an, who, who.kontakt, zeiten.labels), buttonPayloads: zeiten.payloads, legacyParams: [vorname] };
    } else {
      extra = { params: [vorname], text: noticeText(zweck, an, who, who.kontakt, []), ...(zweck === "followup_nudge" ? { textButtons: [] } : {}) };
    }
    geprueft.push(zweck);
    try {
      const r = await sendWhatsAppNotice({ ...basis, purpose: zweck, ...extra });
      return { gesendet: true, zweck: r.purpose, modus: r.mode };
    } catch (err) {
      if (err instanceof NoTemplateError) continue;
      return { gesendet: false, grund: (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 200) };
    }
  }
  return { gesendet: false, grund: `Keine freigegebene Vorlage (geprüft: ${geprueft.join(", ")})` };
}

export type Nachtrag =
  | { ok: true; nummer: string; uebernommen: boolean; nachricht: "terminbestaetigung" | Nachfassen | null; hinweis?: string }
  | { ok: false; error: string };

/** Nummer aus der Buchung finden: Chat eines Termins des Leads mit anderer Nummer, sonst Verlauf. */
async function buchungsnummerFinden(lead: { id: string; customerId: string; phone: string | null }): Promise<string | null> {
  const termine = await prisma.appointment.findMany({
    where: { leadId: lead.id, customerId: lead.customerId, conversationId: { not: null } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { conversationId: true },
  });
  const ids = [...new Set(termine.map((t) => t.conversationId!).filter(Boolean))];
  if (ids.length) {
    const convs = await prisma.conversation.findMany({ where: { id: { in: ids }, customerId: lead.customerId }, select: { id: true, contactPhone: true } });
    for (const id of ids) {
      const c = convs.find((x) => x.id === id);
      if (c && phoneKey(c.contactPhone) && phoneKey(c.contactPhone) !== phoneKey(lead.phone)) return c.contactPhone;
    }
  }
  const verlauf = await prisma.leadHistory.findMany({ where: { leadId: lead.id, text: { contains: "abweichender Handynummer" } }, orderBy: { createdAt: "desc" }, take: 5, select: { text: true } });
  return nummerAusVerlauf(verlauf.map((h) => h.text));
}

/**
 * Nachträglich (Ops-Aktion): Lead mit „kein WhatsApp“ auf der Formular-Nummer, der online mit anderer Nummer gebucht hat.
 * Nummer übernehmen, dann mit kommendem Termin die Terminbestätigung, nach einer Absage das Nachfassen (Vorlage).
 */
export async function buchungsnummerNachtragen(leadId: string, now = new Date()): Promise<Nachtrag> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, name: true, phone: true, status: true, waUnavailableAt: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return { ok: false, error: "Lead nicht gefunden." };
  const schonNummer = await waNummerFuerLead(lead);
  const schon = !!schonNummer && phoneKey(schonNummer) !== phoneKey(lead.phone);
  if (!schon && !lead.waUnavailableAt) return { ok: false, error: "Lead ist nicht als „kein WhatsApp“ markiert, nichts zu übernehmen." };
  const nummer = schon ? schonNummer! : await buchungsnummerFinden(lead);
  if (!nummer) return { ok: false, error: "Keine abweichende Nummer aus einer Online-Buchung gefunden." };
  const u = await uebernimmBuchungsnummer(lead.id, nummer, { now });
  if (!u.ok) return { ok: false, error: `Nummer nicht übernommen (${u.grund}).` };
  if (FERTIG.has((lead.status ?? "").trim().toLowerCase())) return { ok: true, nummer: u.nummer, uebernommen: !u.schon, nachricht: null, hinweis: `Lead ist abgeschlossen (${lead.status}), keine Nachricht.` };

  const kommend = await prisma.appointment.findFirst({
    where: { leadId: lead.id, status: "booked", startsAt: { gt: now } },
    orderBy: { startsAt: "asc" },
    select: { startsAt: true, mode: true, meetUrl: true, ort: true },
  });
  if (kommend) {
    const { sendBookingConfirmation } = await import("@/lib/whatsapp/reminders");
    await sendBookingConfirmation({ customerId: lead.customerId, to: u.nummer, name: lead.name, leadId: lead.id, startsAt: kommend.startsAt, mode: kommend.mode, meetUrl: kommend.meetUrl, ort: kommend.ort });
    return { ok: true, nummer: u.nummer, uebernommen: !u.schon, nachricht: "terminbestaetigung" };
  }
  const absage = await prisma.appointment.findFirst({
    where: { leadId: lead.id, status: "cancelled", cancelledBy: "lead" },
    orderBy: { cancelledAt: "desc" },
    select: { cancelledAt: true },
  });
  if (!absage) return { ok: true, nummer: u.nummer, uebernommen: !u.schon, nachricht: null, hinweis: "Kein vom Lead abgesagter Termin, keine Nachricht." };
  // Nicht doppelt: nach der Absage schon ein Nachfassen an diese Nummer?
  const seit = absage.cancelledAt ?? new Date(0);
  const doppelt = await prisma.message.count({
    where: { conversationId: u.conversationId, direction: "outbound", createdAt: { gt: seit }, purpose: { in: [...NACH_ABSAGE_ZWECKE] } },
  });
  if (doppelt > 0) return { ok: true, nummer: u.nummer, uebernommen: !u.schon, nachricht: null, hinweis: "Nachfassen nach der Absage ging schon raus." };
  const n = await nachAbsageNachfassen(lead, u.nummer);
  return { ok: true, nummer: u.nummer, uebernommen: !u.schon, nachricht: n };
}
