// Antworten per Schnellantwort-Knopf (Ole, 15.11.2026). Vorlagen und interaktive Nachrichten tragen Knöpfe
// (templates.ts → TEMPLATE_BUTTONS); ein Klick kommt im Webhook als type „button“ (Vorlage) bzw. „interactive“
// (freie Nachricht im 24-h-Fenster) mit Text und Payload an. Verarbeitung in gateway.ts nach STOPP und Kampagnen:
//   „Ja, passt“                 → Termin bestätigt (Appointment.confirmedAt), kurze Antwort, Assistent schweigt
//   „Bitte verschieben“ …       → Assistent mit Hinweis: freie Zeiten holen, verschieben (reschedule_appointment);
//                                 keine weiteren Erinnerungen zur alten Zeit (Appointment.rescheduleRequestedAt)
//   „Kein Bedarf mehr“, „Nein, danke“ → Lead sauber verloren (Kein Interesse, Grund „kein Bedarf“), Abfolgen stopp, Dank
//   „Ja, neuer Termin“, „Andere Zeit“ → Assistent mit Hinweis: zwei freie Zeiten anbieten; ab dem 2. „Andere Zeit“ im
//                                 Chat schickt die App selbst den Buchungslink (lib/whatsapp/buchungslink.ts), Assistent schweigt
//   „Erste/Zweite Zeit passt“ (Payload slot:<ISO>) → Assistent mit genauer Startzeit, bucht bzw. verschiebt
//   „Eher der Beitrag“/„Eher die Leistung“ (Angebot) → Assistent: Gespräch zum Anpassen anbieten, ohne Beträge
// Termin-Strecke (Ole, 17.11.2026, lib/whatsapp/termin-strecke.ts), immer am Payload erkannt:
//   Zeit-Knopf „Heute 16 Uhr“ (slot:<ISO>)        → die App bucht genau diese Zeit (bot.ts, E-Mail bekannt), sonst Hinweis
//   „Ja, sicher“/„Lieber andere Zeit“ (zusage:ja|andere, Splittest termin_zusage Fassung b) → zugesagt, dann Komplettcheck
//                                                    bzw. Tierfrage mit „Super, danke!“; bzw. wie „Bitte verschieben“
//   „Ja, gern“/„Nein, danke“ (komplettcheck:ja|nein) → Komplettcheck am Termin, dann Vertragsfrage bzw. Abschluss
//   „Ja, gemeinsam“/„Nein, ich allein“ (partner:ja|nein) → wer mitentscheidet (Ole, 21.11.2026), dann die erste Angebotsfrage;
//                                                    vor dem Terminvorschlag (noch kein Termin): bot.ts, dann der Terminvorschlag
//   Zeit mit 45 Min. (lang:<ISO>) / „Zeit behalten“ (lang:behalten) → Komplettcheck-Termin verlegen bzw. behalten
//   „Schicke ich gleich“/„Nicht zur Hand“ (policenbitte:<Titel>) → Reaktion auf die Policen-Bitte, dann der Schluss
//   „Ja, stimmt“/„Andere Adresse“ (email:ja|andere) → Einladung (einmal) bzw. Frage nach der neuen Adresse
//   „Ja, eingetragen“/„Nein, bitte nochmal“ (eingetragen:ja|nein) → kurzer Dank bzw. Termin mit Kalender-Links nochmal
//   „Ja“/„Mache ich gleich“ (kalender:ja|gleich, frühere Kalenderfrage) → zugesagt, kurze Antwort
//   „Ja“/„Nein“ zu einer Angebotsfrage (folge:<key>:ja|nein) → Assistent mit Hinweis, welche Frage beantwortet ist
//   Tierfrage (TKV, tier:<key>:<wert>, z. B. „Ja, gesund“/„War in Behandlung“) → speichern, nächste Tierfrage bzw. Komplettcheck
//   „Ja, gern“/„Lieber im Termin“ unter der Bestätigung ab v5 bzw. der Nachfrage am Folgetag (vorbereitung:ja|termin,
//                                                    Ole 26.11.2026) → Strecke starten bzw. „Alles klar, bis Montag!“
//   Antwort auf eine Frage der Fragen-Engine (vf:<sparte>.<frage>:<option>, „Rest im Termin“ vf:rest, lib/vorbereitung)
// Bedenkzeit zum Angebot (Paket P5, lib/bedenkzeit-server.ts):
//   „1 Woche“/„2 Wochen“/„Ende des Monats“ (bedenkzeit:1w|2w|monatsende) → eintragen, kurze Bestätigung, Assistent schweigt
// Erstanschreiben v10/v11 (Ole, 19.11.2026, erstanschreiben.ts ERSTANSCHREIBEN_V10): Knopf auf die feste erste Frage
//   (Vorlage oder Freitext, Fassung a oder b) → Antwort sofort im Feld der Frage festhalten (TKV „Nur Operationen“ →
//   tarifwunsch „nur OP-Schutz“), der Assistent bekommt einen Hinweis, bestätigt kurz und fragt nicht erneut.
// Alle anderen Knöpfe (z. B. „Katze“, „Ja, gern prüfen“) gehen als normale Antwort an den Assistenten.
// Nur echte Knopf-Klicks zählen: getippt „Nein, danke“ kann eine Antwort auf eine ganz andere Frage sein.

import { a, asAnsprache } from "@/lib/ansprache";
import { prisma } from "@/lib/prisma";
import { KNOPF, OUTREACH_PURPOSES } from "@/lib/whatsapp/templates";
import { payloadLesen } from "@/lib/vorbereitung/fragen";
import { erstfrageFreitextWert, erstfrageKnopfWert } from "@/lib/whatsapp/erstanschreiben";
export { ERSTFRAGE_HINWEIS_RE } from "@/lib/whatsapp/erstanschreiben";
import { mergeQualificationData } from "@/lib/whatsapp/qualification";
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
  | { aktion: "zusage"; ja: boolean }
  | { aktion: "partner"; ja: boolean }
  | { aktion: "kalender"; art: "ja" | "gleich" }
  | { aktion: "email"; art: "ja" | "andere" }
  | { aktion: "eingetragen"; ja: boolean }
  | { aktion: "lang"; wahl: string }
  | { aktion: "policenbitte"; titel: string }
  | { aktion: "folge"; key: string; wert: string }
  | { aktion: "tier"; key: string; wert: string; titel: string }
  | { aktion: "bedenkzeit"; wahl: "1w" | "2w" | "monatsende" }
  | { aktion: "vorbereitung"; art: "ja" | "termin" }
  | { aktion: "angabe"; knopf: { id: string; option: string } | { rest: true } };

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
  if (p === "vorbereitung:ja" || p === "vorbereitung:termin") return { aktion: "vorbereitung", art: p.endsWith(":ja") ? "ja" : "termin" };
  const vf = payloadLesen(p);
  if (vf) return { aktion: "angabe", knopf: vf };
  if (p === "zusage:ja" || p === "zusage:andere") return { aktion: "zusage", ja: p.endsWith(":ja") };
  if (p === "partner:ja" || p === "partner:nein") return { aktion: "partner", ja: p.endsWith(":ja") };
  if (p === "kalender:ja" || p === "kalender:gleich") return { aktion: "kalender", art: p.endsWith(":ja") ? "ja" : "gleich" };
  if (p === "email:ja" || p === "email:andere") return { aktion: "email", art: p.endsWith(":ja") ? "ja" : "andere" };
  if (p === "eingetragen:ja" || p === "eingetragen:nein") return { aktion: "eingetragen", ja: p.endsWith(":ja") };
  if (p.startsWith("lang:")) {
    const w = p.slice(5);
    if (w === "behalten" || !Number.isNaN(new Date(w).getTime())) return { aktion: "lang", wahl: w };
  }
  if (p.startsWith("policenbitte:")) return { aktion: "policenbitte", titel: p.slice(13) || (text ?? "") };
  if (p === "bedenkzeit:1w" || p === "bedenkzeit:2w" || p === "bedenkzeit:monatsende") return { aktion: "bedenkzeit", wahl: p.slice(11) as "1w" | "2w" | "monatsende" };
  const tier = /^tier:([a-zA-Z]+):([a-z]+)$/.exec(p);
  if (tier) return { aktion: "tier", key: tier[1], wert: tier[2], titel: (text ?? "").trim() };
  const folge = /^folge:([a-zA-Z]+):(.+)$/.exec(p);
  if (folge) return { aktion: "folge", key: folge[1], wert: (text ?? folge[2]).trim() };
  if (p === "andere_zeit") return { aktion: "andere_zeit" };
  const t = norm(text);
  if (is(t, KNOPF.passt)) return { aktion: "bestaetigt" };
  // Vorlage ohne Payload (z. B. von Hand angelegt): „Lieber im Termin“ gibt es nur unter der Frage nach der Vorbereitung
  if (is(t, KNOPF.imTermin)) return { aktion: "vorbereitung", art: "termin" };
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

/** Hinweis an den Assistenten nach einem Knopf auf die feste erste Frage (v10/v11, rein, testbar). */
export function erstfrageHinweis(e: { feld: string; wert: string; frage: string; knopf: string }): string {
  return `Der Lead hat per Knopf „${e.knopf}“ auf unsere erste Frage („${e.frage}“) geantwortet. Schon festgehalten: angaben.${e.feld} = „${e.wert}“. Bestätige kurz, frag das nicht erneut und mach mit dem Frageplan weiter.`;
}

/**
 * Knopf auf die feste erste Frage des Erstanschreibens (v10/v11, Ole 19.11.2026): am Erstanschreiben des Chats erkennen,
 * Antwort im Feld der Frage speichern (wie record_qualification) und den Hinweis für den Assistenten liefern.
 * null = kein Knopf dieser Frage.
 */
async function erstfrageKnopf(conversationId: string, text: string | null | undefined): Promise<string | null> {
  const erst = await prisma.message.findFirst({
    where: { conversationId, direction: "outbound", purpose: { in: [...OUTREACH_PURPOSES] } },
    orderBy: { createdAt: "desc" },
    select: { body: true, purpose: true },
  });
  const e = erst ? erstfrageKnopfWert(erst.body, text, erst.purpose) : null;
  if (!e) return null;
  const prev = (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { qualificationData: true } }))?.qualificationData;
  const data = mergeQualificationData(prev, { [e.feld]: e.wert });
  if (data) await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: data } });
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben: { [e.feld]: e.wert }, via: "erstfrage_knopf" }), sentBy: "system" } });
  return erstfrageHinweis(e);
}

/** Hinweis an den Assistenten nach einer freien Antwort auf die feste erste Frage (Kfz, rein, testbar). */
export function erstfrageFreitextHinweis(e: { feld: string; wert: string; frage: string }): string {
  return `Der Lead hat frei auf unsere erste Frage („${e.frage}“) geantwortet. Schon festgehalten: angaben.${e.feld} = „${e.wert}“. Bestätige kurz, frag das nicht erneut und mach mit dem Frageplan weiter.`;
}

/**
 * Freie Antwort auf die feste erste Frage (Kfz, Ole 21.11.2026: „Ende Dezember“ = „Zum Jahresende“): nur, wenn unsere
 * letzte Nachricht im Chat das Erstanschreiben war (danach nur die Erstinformation als PDF). Antwort wie beim Knopf
 * speichern und den Hinweis für den Assistenten liefern. null = keine solche Frage bzw. Antwort unklar.
 */
export async function erstfrageFreitext(conversationId: string, text: string | null | undefined): Promise<string | null> {
  if (!text?.trim()) return null;
  const letzte = await prisma.message.findMany({
    where: { conversationId, direction: "outbound" },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { body: true, purpose: true, kind: true },
  });
  const erst = letzte.find((m) => m.kind !== "document" && !/^Erstinformation zu /.test(m.body ?? ""));
  if (!erst?.purpose || !(OUTREACH_PURPOSES as readonly string[]).includes(erst.purpose)) return null;
  const e = erstfrageFreitextWert(erst.body, text, erst.purpose);
  if (!e) return null;
  const prev = (await prisma.conversation.findUnique({ where: { id: conversationId }, select: { qualificationData: true } }))?.qualificationData;
  const data = mergeQualificationData(prev, { [e.feld]: e.wert });
  if (data) await prisma.conversation.update({ where: { id: conversationId }, data: { qualificationData: data } });
  await prisma.message.create({ data: { conversationId, direction: "internal", kind: "qualification", body: JSON.stringify({ angaben: { [e.feld]: e.wert }, via: "erstfrage_freitext" }), sentBy: "system" } });
  return erstfrageFreitextHinweis(e);
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

/**
 * Buchungslink ab dem 2. „Andere Zeit“ senden (lib/whatsapp/buchungslink.ts). false = nichts gesendet: erstes Mal, schon
 * ein kommender Termin, keine Buchungsseite (kein Kurzname oder Kalender nicht verbunden) bzw. Fehler.
 */
/**
 * Buchungslink nach einer Absage ohne Wunschzeit (absageOhneWunsch, Ole 22.11.2026), einmal je Chat (kein zweites Mal,
 * wenn der Link schon draußen ist). true = gesendet.
 */
export async function buchungslinkNachAbsage(conversationId: string, now = new Date()): Promise<boolean> {
  try {
    const b = await import("@/lib/whatsapp/buchungslink");
    const { streckenKontext } = await import("@/lib/whatsapp/termin-strecke");
    const k = await streckenKontext(conversationId, now);
    if (!k || k.termin) return false;
    const cal = await prisma.calendarConnection.findUnique({ where: { customerId: k.customerId }, select: { bookingSlug: true, status: true } });
    const url = cal?.status === "connected" ? b.chatBuchungUrl(cal.bookingSlug, conversationId) : null;
    if (!url) return false;
    const schon = await prisma.message.count({ where: { conversationId, direction: "outbound", body: { contains: `/book/${cal!.bookingSlug}` } } });
    const kurz = await prisma.message.count({ where: { conversationId, direction: "outbound", body: { contains: `?c=${b.chatBuchungToken(conversationId)}` } } });
    if (schon + kurz > 0) return false;
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body: b.buchungslinkText(k.an, k.person, url, "a"), sentBy: "bot" });
    return true;
  } catch (e) {
    console.error("[knopf buchungslink absage]", e instanceof Error ? e.message.slice(0, 120) : e);
    return false;
  }
}

export async function buchungslinkSenden(conversationId: string, now = new Date()): Promise<boolean> {
  try {
    const b = await import("@/lib/whatsapp/buchungslink");
    // „Andere Zeit“ und getippte Absagen auf einen Terminvorschlag (Ole, 22.11.2026: „passt nicht“ zählt mit)
    const verlauf = await prisma.message.findMany({
      where: { conversationId, OR: [{ direction: "inbound" }, { direction: "internal", kind: "termin_vorschlag" }] },
      orderBy: { createdAt: "asc" },
      select: { direction: true, kind: true, body: true },
    });
    if (!b.buchungslinkFaellig(b.abgelehnteRunden(verlauf))) return false;
    const { streckenKontext } = await import("@/lib/whatsapp/termin-strecke");
    const k = await streckenKontext(conversationId, now);
    if (!k || k.termin) return false;
    const cal = await prisma.calendarConnection.findUnique({ where: { customerId: k.customerId }, select: { bookingSlug: true, status: true } });
    const url = cal?.status === "connected" ? b.chatBuchungUrl(cal.bookingSlug, conversationId) : null;
    if (!url) return false;
    const { variante } = await import("@/lib/experimente");
    const v = await variante(b.BUCHUNGSLINK_EXPERIMENT, k.leadId ?? conversationId);
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    await sendWhatsAppMessage({ customerId: k.customerId, to: k.phone, body: b.buchungslinkText(k.an, k.person, url, v), sentBy: "bot" });
    return true;
  } catch (e) {
    console.error("[knopf buchungslink]", e instanceof Error ? e.message.slice(0, 120) : e);
    return false;
  }
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
  if (!k) {
    // Knopf auf die feste erste Frage (v10/v11): festhalten, der Assistent antwortet mit Hinweis
    if (inbound.kind !== "button" && inbound.kind !== "interactive") return { handled: false };
    // „Ja, gern“ ohne Payload unter der Frage nach der Vorbereitung (nur, wenn sie unsere letzte Nachricht war)
    if (norm(inbound.text) === KNOPF.gern.toLowerCase()) {
      const { vorbereitungFreitext } = await import("@/lib/whatsapp/termin-strecke");
      if (await vorbereitungFreitext(conversationId, inbound.text, now)) return { handled: true };
    }
    const hint = await erstfrageKnopf(conversationId, inbound.text);
    return hint ? { handled: false, hint } : { handled: false };
  }
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
    // „Ja, passt“ nach „Bitte verschieben“: es bleibt bei der Zeit, Erinnerungen laufen wieder
    await prisma.appointment.update({ where: { id: appt.id }, data: { confirmedAt: now, rescheduleRequestedAt: null } });
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

  // Zusage-Frage unter der Buchungsbestätigung (Splittest termin_zusage, Fassung b): „Ja, sicher“ ohne Assistent;
  // „Lieber andere Zeit“ wie „Bitte verschieben“ (Assistent bietet zwei freie Zeiten an und verlegt)
  if (k.aktion === "zusage") {
    const { zusageAntwort } = await import("@/lib/whatsapp/termin-strecke");
    if (k.ja) return { handled: await zusageAntwort(conversationId, "ja", now) };
    await zusageAntwort(conversationId, "andere", now);
    const v: KnopfAktion = { aktion: "verschieben" };
    await prisma.appointment.updateMany({
      where: { status: "booked", startsAt: { gt: now }, rescheduleRequestedAt: null, OR: [{ conversationId }, ...(conv.leadId ? [{ leadId: conv.leadId }] : [])] },
      data: { rescheduleRequestedAt: now },
    });
    return { handled: false, hint: knopfHinweis(v, now)?.replace("„Bitte verschieben“", "„Lieber andere Zeit“") ?? null, zeit: null };
  }
  // Frage nach der Vorbereitung (Bestätigung ab v5, Nachfrage am Folgetag) und Fragen-Engine: ohne Assistent
  if (k.aktion === "vorbereitung") {
    const { vorbereitungAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await vorbereitungAntwort(conversationId, k.art, now) };
  }
  if (k.aktion === "angabe") {
    const { angabeAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await angabeAntwort(conversationId, null, k.knopf, now) };
  }
  // Termin-Strecke nach der Buchung (lib/whatsapp/termin-strecke.ts): ohne Assistent
  if (k.aktion === "komplettcheck") {
    const { komplettcheckAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await komplettcheckAntwort(conversationId, k.ja, now) };
  }
  if (k.aktion === "partner") {
    // Nach der Buchung (Frage nach dem Komplettcheck) bzw. Frage vor dem Terminvorschlag, inzwischen gebucht; sonst
    // (noch kein Termin) übernimmt bot.ts: Antwort speichern, dann der Terminvorschlag (Ole, 21.11.2026 spät)
    const { partnerAntwort, partnerVorNachBuchung } = await import("@/lib/whatsapp/termin-strecke");
    if (await partnerAntwort(conversationId, k.ja ? "mit" : "allein", now)) return { handled: true };
    return { handled: await partnerVorNachBuchung(conversationId, k.ja ? "mit" : "allein", now) };
  }
  if (k.aktion === "kalender") {
    const { kalenderAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await kalenderAntwort(conversationId, k.art, now) };
  }
  if (k.aktion === "email") {
    const s = await import("@/lib/whatsapp/termin-strecke");
    return { handled: k.art === "ja" ? await s.emailBestaetigt(conversationId, now) : await s.emailAndere(conversationId, now) };
  }
  if (k.aktion === "eingetragen") {
    const { eingetragenAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await eingetragenAntwort(conversationId, k.ja, now) };
  }
  if (k.aktion === "lang") {
    const { langeZeitAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await langeZeitAntwort(conversationId, k.wahl, now) };
  }
  if (k.aktion === "policenbitte") {
    // Einwilligungsknöpfe (Gesundheitsunterlagen) verarbeitet das Policen-Modul
    const { istPolicenEinwilligungsKnopf } = await import("@/lib/policen/bitte");
    if (istPolicenEinwilligungsKnopf(k.titel)) return { handled: false };
    const s = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await s.policenBitteAntwort(conversationId, s.policenKnopfArt(k.titel), now) };
  }
  if (k.aktion === "tier") {
    const { tierAntwort } = await import("@/lib/whatsapp/termin-strecke");
    return { handled: await tierAntwort(conversationId, k.titel, { key: k.key, wert: k.wert }, now) };
  }
  if (k.aktion === "bedenkzeit") {
    const { bedenkzeitKnopf } = await import("@/lib/bedenkzeit-server");
    return { handled: await bedenkzeitKnopf(conversationId, k.wahl, now) };
  }
  // Zweites „Andere Zeit“ im selben Chat (Ole, 20.11.2026, lib/whatsapp/buchungslink.ts): die App schickt selbst den
  // Buchungslink mit der Bitte um den Wunschtag, der Assistent schweigt. Erstes Mal bzw. ohne Buchungsseite: wie bisher.
  if (k.aktion === "andere_zeit" && (await buchungslinkSenden(conversationId, now))) return { handled: true };
  // „Bitte verschieben“ (Show-up-Paket, Ole 17.11.2026): keine weiteren Erinnerungen zur alten Zeit; das Verschieben
  // selbst übernimmt der Assistent wie bisher (reschedule_appointment legt einen neuen Termin an)
  if (k.aktion === "verschieben") {
    await prisma.appointment.updateMany({
      where: { status: "booked", startsAt: { gt: now }, rescheduleRequestedAt: null, OR: [{ conversationId }, ...(conv.leadId ? [{ leadId: conv.leadId }] : [])] },
      data: { rescheduleRequestedAt: now },
    });
  }
  // Zeit-Knopf: bot.ts bucht genau diese Zeit selbst (Payload), der Hinweis ist der Rückfall
  return { handled: false, hint: knopfHinweis(k, now), zeit: k.aktion === "zeit" ? k.start : null };
}
