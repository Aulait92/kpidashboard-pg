// Antworten per Schnellantwort-Knopf (Ole, 15.11.2026). Vorlagen und interaktive Nachrichten tragen Knöpfe
// (templates.ts → TEMPLATE_BUTTONS); ein Klick kommt im Webhook als type „button“ (Vorlage) bzw. „interactive“
// (freie Nachricht im 24-h-Fenster) mit Text und Payload an. Verarbeitung in gateway.ts nach STOPP und Kampagnen:
//   „Ja, passt“                 → Termin bestätigt (Appointment.confirmedAt), kurze Antwort, Assistent schweigt
//   „Bitte verschieben“ …       → Assistent mit Hinweis: freie Zeiten holen, verschieben (reschedule_appointment)
//   „Kein Bedarf mehr“, „Nein, danke“ → Lead sauber verloren (Kein Interesse, Grund „kein Bedarf“), Abfolgen stopp, Dank
//   „Ja, neuer Termin“, „Andere Zeit“ → Assistent mit Hinweis: zwei freie Zeiten anbieten
//   „Erste/Zweite Zeit passt“ (Payload slot:<ISO>) → Assistent mit genauer Startzeit, bucht bzw. verschiebt
//   „Eher der Beitrag“/„Eher die Leistung“ (Angebot) → Assistent: Gespräch zum Anpassen anbieten, ohne Beträge
// Termin-Strecke (Ole, 17.11.2026, lib/whatsapp/termin-strecke.ts), immer am Payload erkannt:
//   Zeit-Knopf „Heute 16 Uhr“ (slot:<ISO>)        → die App bucht genau diese Zeit (bot.ts, E-Mail bekannt), sonst Hinweis
//   „Ja, gern“/„Nein, danke“ (komplettcheck:ja|nein) → Komplettcheck am Termin, dann Vertragsfrage bzw. Abschluss
//   „Ja“/„Mache ich gleich“ (kalender:ja|gleich)   → zugesagt, kurze Antwort
//   „Ja“/„Nein“ zu einer Angebotsfrage (folge:<key>:ja|nein) → Assistent mit Hinweis, welche Frage beantwortet ist
// Alle anderen Knöpfe (z. B. „Katze“, „Heute“, „Ja, gern prüfen“) gehen als normale Antwort an den Assistenten.
// Nur echte Knopf-Klicks zählen: getippt „Nein, danke“ kann eine Antwort auf eine ganz andere Frage sein.

import { a, asAnsprache } from "@/lib/ansprache";
import { prisma } from "@/lib/prisma";
import { KNOPF } from "@/lib/whatsapp/templates";
import { WUNSCHZEIT_REGEL } from "@/lib/whatsapp/gespraech";

export type KnopfAktion =
  | { aktion: "bestaetigt" }
  | { aktion: "verschieben" }
  | { aktion: "kein_bedarf" }
  | { aktion: "neuer_termin" }
  | { aktion: "zeit"; start: string | null }
  | { aktion: "andere_zeit" }
  | { aktion: "angebot"; fokus: "beitrag" | "leistung" }
  | { aktion: "komplettcheck"; ja: boolean }
  | { aktion: "kalender"; art: "ja" | "gleich" }
  | { aktion: "folge"; key: string; wert: string };

const norm = (t: string | null | undefined) => (t ?? "").trim().toLowerCase();
const is = (t: string, k: string) => t === k.toLowerCase();

/** Payload für einen Terminvorschlag (Knopf „Erste Zeit passt“). */
export const slotPayload = (startIso: string) => `slot:${startIso}`;

/** Was bedeutet dieser Knopf? null = normale Antwort für den Assistenten (rein, testbar). */
export function knopfAktion(kind: string | null | undefined, text: string | null | undefined, payload?: string | null): KnopfAktion | null {
  if (kind !== "button" && kind !== "interactive") return null;
  const p = (payload ?? "").trim();
  if (p.startsWith("slot:")) {
    const iso = p.slice(5);
    return { aktion: "zeit", start: Number.isNaN(new Date(iso).getTime()) ? null : iso };
  }
  if (p === "komplettcheck:ja" || p === "komplettcheck:nein") return { aktion: "komplettcheck", ja: p.endsWith(":ja") };
  if (p === "kalender:ja" || p === "kalender:gleich") return { aktion: "kalender", art: p.endsWith(":ja") ? "ja" : "gleich" };
  const folge = /^folge:([a-zA-Z]+):(.+)$/.exec(p);
  if (folge) return { aktion: "folge", key: folge[1], wert: (text ?? folge[2]).trim() };
  if (p === "andere_zeit") return { aktion: "andere_zeit" };
  const t = norm(text);
  if (is(t, KNOPF.passt)) return { aktion: "bestaetigt" };
  if (is(t, KNOPF.verschieben) || is(t, KNOPF.terminVerschieben)) return { aktion: "verschieben" };
  if (is(t, KNOPF.keinBedarfMehr) || is(t, KNOPF.neinDanke)) return { aktion: "kein_bedarf" };
  if (is(t, KNOPF.neuerTermin)) return { aktion: "neuer_termin" };
  if (is(t, KNOPF.ersteZeit) || is(t, KNOPF.zweiteZeit)) return { aktion: "zeit", start: null };
  if (is(t, KNOPF.andereZeit)) return { aktion: "andere_zeit" };
  if (is(t, KNOPF.beitrag)) return { aktion: "angebot", fokus: "beitrag" };
  if (is(t, KNOPF.leistung)) return { aktion: "angebot", fokus: "leistung" };
  return null;
}

const TZ = "Europe/Berlin";
const wann = (d: Date) =>
  `${new Intl.DateTimeFormat("de-DE", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d)} Uhr`;

/** Hinweis an den Assistenten zu einem Knopf (rein, testbar). */
export function knopfHinweis(k: KnopfAktion, now = new Date()): string | null {
  switch (k.aktion) {
    case "verschieben":
      return "Der Lead hat per Knopf „Bitte verschieben“ geantwortet: Er möchte den Termin verschieben. Hole mit get_available_slots freie Zeiten, biete zwei konkrete an und verschiebe nach seiner Wahl mit reschedule_appointment. Frag nicht nach dem Grund.";
    case "neuer_termin":
      return "Der Lead hat per Knopf „Ja, neuer Termin“ geantwortet. Hole mit get_available_slots freie Zeiten und biete direkt zwei konkrete an.";
    case "angebot":
      return `Der Lead hat zum Angebot per Knopf geantwortet: Für ihn ist eher ${k.fokus === "beitrag" ? "der Beitrag" : "die Leistung"} entscheidend. Halte das fest (angaben.wunsch). Nenne keine Beträge, Tarife oder Vergleiche: Biete ein kurzes Gespräch an, in dem der Berater das Angebot genau darauf abstimmt, mit zwei freien Zeiten (get_available_slots).`;
    case "andere_zeit":
      return "Der Lead hat per Knopf „Andere Zeit“ geantwortet: die vorgeschlagenen Zeiten passen nicht. Frag kurz, wann es ihm grundsätzlich passt (Tag oder Tageszeit). Nennt er einen Wunsch, hole mit get_available_slots freie Zeiten. " + WUNSCHZEIT_REGEL;
    case "folge":
      return `Der Lead hat per Knopf „${k.wert}“ geantwortet: Das ist die Antwort auf unsere letzte Angebotsfrage (${k.key === "oeffentlicherDienst" ? "öffentlicher Dienst" : k.key}). Halte sie mit record_qualification fest und mach weiter.`;
    case "zeit": {
      const d = k.start ? new Date(k.start) : null;
      if (!d || d.getTime() <= now.getTime() + 15 * 60 * 1000) {
        return "Der Lead hat per Knopf eine der vorgeschlagenen Zeiten gewählt, die genaue Zeit ist aber nicht mehr bekannt oder schon vorbei. Hole mit get_available_slots frische Zeiten und biete zwei an.";
      }
      return `Der Lead hat per Knopf diese Zeit gewählt: ${wann(d)} (start=${k.start}). Hat er schon einen Termin, verschiebe ihn mit reschedule_appointment auf diese Zeit. Sonst buche sie mit book_appointment (modus video) mit genau diesem start-Wert; ist die E-Mail-Adresse nicht bekannt, frag zuerst danach. Ist die Zeit inzwischen belegt, entschuldige dich kurz und nutze termin_vorschlagen.`;
    }
    default:
      return null;
  }
}

/** Lead „verloren“ mit Grund „Kein Interesse“ und Notiz „kein Bedarf“ (wie Verloren im Kontakt, ohne Warnung). */
async function markLostKeinBedarf(leadId: string, now: Date): Promise<boolean> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true, customerId: true, status: true, airtableId: true, erasedAt: true } });
  if (!lead || lead.erasedAt) return false;
  const s = (lead.status ?? "").trim().toLowerCase();
  if (["abschluss", "kein interesse", "disqualifiziert"].includes(s)) return false;
  const status = "Kein Interesse";
  if (lead.airtableId) {
    const { updateLeadEditableFields } = await import("@/lib/airtable-write");
    await updateLeadEditableFields({ airtableId: lead.airtableId, bearbeitungsstatus: status }).catch((e) => console.error("[knopf verloren]", e));
  }
  await prisma.lead.update({
    where: { id: lead.id },
    data: { status, reached: true, closedAt: null, lostReason: "kein_interesse", lostNote: "kein Bedarf (per WhatsApp-Knopf)", lostAt: now, lostEarly: false, disqualifyReason: null },
  });
  const { syncFollowUpWithStatus } = await import("@/lib/lead-followup");
  await syncFollowUpWithStatus(lead.id, status);
  const { stopSequences } = await import("@/lib/lead-sequences");
  await stopSequences(lead.id, "Kein Bedarf (per WhatsApp-Knopf)", { now }).catch(() => 0);
  const { logLeadHistory } = await import("@/lib/lead-history");
  await logLeadHistory(lead.id, "status", "Verloren: Kein Interesse · kein Bedarf (per WhatsApp-Knopf)", { customerId: lead.customerId, userId: null });
  return true;
}

async function reply(conversationId: string, body: string): Promise<void> {
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { customerId: true, contactPhone: true } });
  if (!conv) return;
  const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
  await sendWhatsAppMessage({ customerId: conv.customerId, to: conv.contactPhone, body, sentBy: "system" }).catch((e) => console.error("[knopf antwort]", e));
}

/**
 * Knopf-Antwort verarbeiten. handled = erledigt, der Assistent antwortet nicht; sonst ggf. hint für den Assistenten.
 */
export async function handleButtonReply(
  conversationId: string,
  inbound: { kind: string | null | undefined; text: string | null | undefined; payload?: string | null },
  now = new Date(),
): Promise<{ handled: boolean; hint?: string | null; zeit?: string | null }> {
  const k = knopfAktion(inbound.kind, inbound.text, inbound.payload);
  if (!k) return { handled: false };
  const conv = await prisma.conversation.findUnique({ where: { id: conversationId }, select: { id: true, customerId: true, leadId: true } });
  if (!conv) return { handled: false };
  const an = asAnsprache((await prisma.customer.findUnique({ where: { id: conv.customerId }, select: { leadAddress: true } }))?.leadAddress);

  if (k.aktion === "bestaetigt") {
    const appt = await prisma.appointment.findFirst({
      where: { status: "booked", startsAt: { gt: now }, OR: [{ conversationId }, ...(conv.leadId ? [{ leadId: conv.leadId }] : [])] },
      orderBy: { startsAt: "asc" },
      select: { id: true, startsAt: true },
    });
    if (!appt) return { handled: false };
    await prisma.appointment.update({ where: { id: appt.id }, data: { confirmedAt: now } });
    await prisma.message.create({ data: { conversationId, direction: "internal", kind: "appointment_confirmed", body: JSON.stringify({ appointmentId: appt.id }), sentBy: "system" } });
    await reply(conversationId, a(an, `Super, danke! Dann bis ${wann(appt.startsAt)}.`, `Vielen Dank für die Bestätigung! Dann bis ${wann(appt.startsAt)}.`));
    return { handled: true };
  }

  if (k.aktion === "kein_bedarf") {
    if (conv.leadId) await markLostKeinBedarf(conv.leadId, now);
    await prisma.message.create({ data: { conversationId, direction: "internal", kind: "lead_lost", body: JSON.stringify({ grund: "kein Bedarf", via: "knopf" }), sentBy: "system" } });
    await reply(
      conversationId,
      a(an, "Alles klar, danke für deine Rückmeldung! Wenn sich später etwas ändert, schreib einfach hier.", "Alles klar, vielen Dank für Ihre Rückmeldung! Wenn sich später etwas ändert, schreiben Sie einfach hier."),
    );
    return { handled: true };
  }

  // Termin-Strecke nach der Buchung (lib/whatsapp/termin-strecke.ts): ohne Assistent
  if (k.aktion === "komplettcheck") {
    const { komplettcheckAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await komplettcheckAntwort(conversationId, k.ja, now) };
  }
  if (k.aktion === "kalender") {
    const { kalenderAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await kalenderAntwort(conversationId, k.art, now) };
  }
  // Zeit-Knopf: bot.ts bucht genau diese Zeit selbst (Payload), der Hinweis ist der Rückfall
  return { handled: false, hint: knopfHinweis(k, now), zeit: k.aktion === "zeit" ? k.start : null };
}
