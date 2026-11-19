// Einladung mit Kalendereintrag, auch ohne Bestätigung der Adresse (Ole, 19.11.2026). Die Einladung geht weiter erst
// raus, wenn der Lead die Adresse bestätigt („Ja, stimmt“) bzw. eine nennt (termin-strecke.ts, lib/calendar/einladung.ts).
// Antwortet er nicht mehr (auch mitten in der Strecke, z. B. beim Komplettcheck oder beim Geburtsdatum), regelt der
// WhatsApp-Cron (alle 5 Min.) den Rückfall:
//   1. Adresse bekannt (Chat bzw. Formular): Einladung an diese Adresse, 30 Min. nach der letzten Nachricht im Chat ohne
//      Antwort (bzw. der Buchung), bei Terminbeginn in unter 3 Std. nach 5 Min., spätestens 60 Min. vor Beginn.
//   2. Keine Adresse (bzw. „Andere Adresse“ gewählt und keine neue genannt): nach derselben Wartezeit der Termin mit
//      Links zum Eintragen per WhatsApp (freie Nachricht, nur im 24-h-Fenster, Mo bis Sa 8 bis 20 Uhr, Assistent aktiv).
//      Nennt der Lead später eine Adresse, geht die Einladung dorthin wie bisher.
//   3. Nie zweimal dieselbe Einladung an dieselbe Adresse: Merkfeld je Termin und Adresse (Appointment.einladungAdressen,
//      der WhatsApp-Link als „wa:<Beginn>“, ein verschobener Termin bekommt also wieder einen Link).
//   4. Frage „Konnten Sie den Termin in Ihrem Kalender eintragen?“ nach „Die Einladung ist unterwegs“ frühestens 10 Min.
//      nach dem Versand (runKalenderFrage), nicht mehr in derselben Minute.
// Nichts bei abgesagtem oder vergangenem Termin, Abmeldung (STOP) und pausierten Nachrichten am Kontakt.

import { prisma } from "@/lib/prisma";
import { a, type Ansprache } from "@/lib/ansprache";
import { adresseFreigeben, adresseVormerken, EINLADUNG_SPAETESTENS_VOR_MIN, EINLADUNG_WARTEN_KURZ_MIN, einladungSenden, KURZFRISTIG_MS } from "@/lib/calendar/einladung";
import { zeitLang } from "@/lib/whatsapp/gespraech";

const MIN = 60 * 1000;
/** Warten ohne Antwort, bevor die Einladung (bzw. der Link) mit dem aktuellen Stand rausgeht. */
export const RUECKFALL_WARTEN_MIN = 30;
/** Frage nach dem Kalendereintrag frühestens so viele Minuten nach dem Versand der Einladung. */
export const KALENDER_FRAGE_NACH_MIN = 10;
/** Merker (interne Nachricht): Termin mit Links zum Eintragen per WhatsApp geschickt (body.appointmentId). */
export const EINLADUNG_LINK = "einladung_link";

/** Merkfeld-Eintrag für den Link per WhatsApp (je Terminbeginn). */
export function waMerker(startsAt: Date): string {
  return `wa:${startsAt.getTime()}`;
}

/** Ist der Rückfall jetzt fällig? Wartezeit ab der letzten Nachricht im Chat (bzw. der Buchung). (rein) */
export function rueckfallFaellig(o: { startsAt: Date; gebuchtAt: Date; letzteNachricht: Date | null; now: Date }): boolean {
  const now = o.now.getTime();
  if (now >= o.startsAt.getTime() - EINLADUNG_SPAETESTENS_VOR_MIN * MIN) return true;
  const warten = (o.startsAt.getTime() - now < KURZFRISTIG_MS ? EINLADUNG_WARTEN_KURZ_MIN : RUECKFALL_WARTEN_MIN) * MIN;
  const basis = Math.max(o.gebuchtAt.getTime(), o.letzteNachricht?.getTime() ?? 0);
  return now - basis >= warten;
}

/** Termin mit Links zum Eintragen (ohne E-Mail-Adresse). Keine Gedankenstriche. */
export function kalenderLinkText(o: { an: Ansprache; start: Date; person: { dat: string }; google?: string | null; ics?: string | null; ort?: string | null }): string {
  const kopf = a(o.an, `Damit du den Termin nicht vergisst: *${zeitLang(o.start)}* mit ${o.person.dat}.`, `Damit Sie den Termin nicht vergessen: *${zeitLang(o.start)}* mit ${o.person.dat}.`);
  const links = [o.google ? `Google-Kalender: ${o.google}` : "", o.ics ? `Apple, Outlook und andere: ${o.ics}` : ""].filter(Boolean);
  return [kopf, o.ort ? `Adresse: ${o.ort}` : "", `Termin in den Kalender eintragen:\n${links.join("\n")}`, "Einfach antippen, dann öffnet sich der Kalendereintrag."]
    .filter(Boolean)
    .join("\n\n");
}

type Chat = {
  id: string;
  customerId: string;
  contactPhone: string;
  contactEmail: string | null;
  botActive: boolean;
  optedOutAt: Date | null;
  windowExpiresAt: Date | null;
  leadId: string | null;
};

/** Darf der Assistent jetzt eine freie Nachricht schicken (aktiv, 24-h-Fenster offen, Mo bis Sa 8 bis 20 Uhr)? */
async function darfSchreiben(conv: Chat, now: Date): Promise<boolean> {
  if (!conv.botActive || conv.optedOutAt || !conv.windowExpiresAt || conv.windowExpiresAt.getTime() <= now.getTime()) return false;
  const { inStreckenFenster } = await import("@/lib/whatsapp/termin-strecke");
  return inStreckenFenster(now);
}

/** Ohne Adresse: Termin mit Links zum Eintragen per WhatsApp (einmal je Termin und Beginn). */
async function linkSenden(t: { id: string; startsAt: Date }, conv: Chat, now: Date): Promise<boolean> {
  if (!(await darfSchreiben(conv, now))) return false;
  const merker = waMerker(t.startsAt);
  if (!(await adresseVormerken(t.id, merker))) return false;
  try {
    const { customerEventById, googleCalendarUrl } = await import("@/lib/calendar/add-to-calendar");
    const ev = await customerEventById(t.id);
    const google = ev ? googleCalendarUrl({ ...ev, description: "" }) : null;
    const ics = ev?.token ? `${ev.manageUrl}/ics` : null;
    const { streckenKontext, merke } = await import("@/lib/whatsapp/termin-strecke");
    const k = await streckenKontext(conv.id, now);
    if ((!google && !ics) || !k) {
      await adresseFreigeben(t.id, merker);
      return false;
    }
    const body = kalenderLinkText({ an: k.an, start: t.startsAt, person: k.person, google, ics, ort: ev?.mode === "onsite" ? ev.ort : null });
    await merke(conv.id, EINLADUNG_LINK, { appointmentId: t.id });
    const { sendWhatsAppMessage } = await import("@/lib/whatsapp/gateway");
    await sendWhatsAppMessage({ customerId: conv.customerId, to: conv.contactPhone, body, sentBy: "bot" });
    return true;
  } catch (err) {
    await adresseFreigeben(t.id, merker).catch(() => null);
    throw err;
  }
}

/**
 * Rückfall ohne Antwort (WhatsApp-Cron): ausstehende Einladungen an die bekannte Adresse, sonst der Link per WhatsApp.
 * Nicht an die bisherige Adresse, solange der Lead „Andere Adresse“ gewählt und noch keine neue genannt hat.
 */
export async function runEinladungRueckfall(now = new Date()): Promise<{ gesendet: number; links: number }> {
  const rows = await prisma.appointment.findMany({
    where: { status: "booked", einladungAt: null, einladungAusstehend: { not: null }, startsAt: { gt: now }, conversationId: { not: null } },
    select: { id: true, startsAt: true, einladungAusstehend: true, conversationId: true, einladungAdressen: true },
    orderBy: { startsAt: "asc" },
    take: 200,
  });
  let gesendet = 0;
  let links = 0;
  for (const t of rows) {
    try {
      const conv = await prisma.conversation.findUnique({
        where: { id: t.conversationId! },
        select: { id: true, customerId: true, contactPhone: true, contactEmail: true, botActive: true, optedOutAt: true, windowExpiresAt: true, leadId: true },
      });
      if (!conv || conv.optedOutAt) continue;
      const lead = conv.leadId ? await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { email: true, nachrichtenPausiertAt: true } }) : null;
      if (lead?.nachrichtenPausiertAt) continue;
      const letzte = await prisma.message.findFirst({
        where: { conversationId: conv.id, direction: { in: ["inbound", "outbound"] } },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      });
      if (!rueckfallFaellig({ startsAt: t.startsAt, gebuchtAt: t.einladungAusstehend!, letzteNachricht: letzte?.createdAt ?? null, now })) continue;
      const merker = await prisma.message.findFirst({
        where: { conversationId: conv.id, direction: "internal", kind: { in: ["email_frage", "email_ok"] }, body: { contains: t.id } },
        orderBy: { createdAt: "desc" },
        select: { kind: true, body: true },
      });
      const andere = merker?.kind === "email_frage" && !!merker.body?.includes('"andere":true');
      const email = andere ? null : conv.contactEmail?.trim() || lead?.email?.trim() || null;
      if (email) {
        // Adresse nur aus dem Formular bekannt: in den Chat übernehmen (wie lib/whatsapp/lead-link.ts), dorthin geht die Einladung
        if (!conv.contactEmail) await prisma.conversation.update({ where: { id: conv.id }, data: { contactEmail: email } });
        if ((await einladungSenden(t.id, now)) === "gesendet") gesendet++;
        continue;
      }
      if (t.einladungAdressen.includes(waMerker(t.startsAt))) continue;
      if (await linkSenden(t, conv, now)) links++;
    } catch (err) {
      console.error("[einladung rueckfall]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gesendet, links };
}

/**
 * „Konnten Sie den Termin in Ihrem Kalender eintragen?“ (termin-strecke.ts eingetragenFragen) erst frühestens 10 Min.
 * nach dem Versand der Einladung bzw. nach „Die Einladung ist unterwegs“ (Adresse bestätigt oder genannt), einmal je Termin.
 */
export async function runKalenderFrage(now = new Date()): Promise<{ gefragt: number }> {
  const bis = new Date(now.getTime() - KALENDER_FRAGE_NACH_MIN * MIN);
  const oks = await prisma.message.findMany({
    where: { direction: "internal", kind: "email_ok", createdAt: { lte: bis, gte: new Date(now.getTime() - 48 * 60 * MIN) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { conversationId: true, body: true, createdAt: true },
  });
  let gefragt = 0;
  const erledigt = new Set<string>();
  for (const m of oks) {
    let appointmentId = "";
    try {
      appointmentId = String((JSON.parse(m.body ?? "{}") as { appointmentId?: unknown }).appointmentId ?? "");
    } catch {
      continue;
    }
    if (!appointmentId || erledigt.has(appointmentId)) continue;
    erledigt.add(appointmentId);
    try {
      const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { status: true, startsAt: true, einladungAt: true } });
      if (!t || t.status !== "booked" || t.startsAt.getTime() <= now.getTime() || !t.einladungAt || t.einladungAt.getTime() > bis.getTime()) continue;
      const schon = await prisma.message.findFirst({ where: { conversationId: m.conversationId, direction: "internal", kind: "eingetragen_frage", body: { contains: appointmentId } }, select: { id: true } });
      if (schon) continue;
      const conv = await prisma.conversation.findUnique({
        where: { id: m.conversationId },
        select: { id: true, customerId: true, contactPhone: true, contactEmail: true, botActive: true, optedOutAt: true, windowExpiresAt: true, leadId: true },
      });
      if (!conv || !(await darfSchreiben(conv, now))) continue;
      if (conv.leadId && (await prisma.lead.findUnique({ where: { id: conv.leadId }, select: { nachrichtenPausiertAt: true } }))?.nachrichtenPausiertAt) continue;
      const { eingetragenFragen, streckenKontext } = await import("@/lib/whatsapp/termin-strecke");
      const k = await streckenKontext(conv.id, now);
      if (!k?.termin || k.termin.id !== appointmentId) continue;
      if (await eingetragenFragen(k, now)) gefragt++;
    } catch (err) {
      console.error("[kalender frage]", err instanceof Error ? err.message.slice(0, 160) : err);
    }
  }
  return { gefragt };
}
