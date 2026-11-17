// Diagnose der WhatsApp-Nachrichten zu Vertriebsterminen (Ole, 17.11.2026), nur lesend, für /api/ops/diagnose?q=vertrieb-termine.
// Grundlage sind die tatsächlich gesendeten Vorlagen im Support-Chat (Message, Status aus den Webhooks von 360dialog).
// Die Art (Bestätigung, 24 h, 1 h) ergibt sich aus dem Text der Vorlage, der Termin aus Uhrzeit im Text, Kontakt,
// Nummer und der Markierung am Termin (waConfirmAt, waReminderAt, waSoonAt).
// Ausgabe ohne Telefonnummern, Nachnamen, Nachrichteninhalte und Links bzw. Tokens; nur IDs, Vorname, Zeiten, Status.

import { prisma } from "@/lib/prisma";
import { phoneKey } from "@/lib/vertrieb/dubletten";
import { TERMIN_VORLAGEN, type TerminArtKey } from "@/lib/vertrieb/termin-whatsapp";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { isStopMessage } from "@/lib/whatsapp/stopp";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

const MIN = 60_000;
const HOUR = 60 * MIN;
/** Spielraum für „später als geplant“ (Cron alle 5 Minuten). */
const SPAET = 15 * MIN;

const ART_LABEL: Record<TerminArtKey, string> = { termin: "bestaetigung", erinnerung: "24h", gleich: "1h" };
const FIELD: Record<TerminArtKey, "waConfirmAt" | "waReminderAt" | "waSoonAt"> = { termin: "waConfirmAt", erinnerung: "waReminderAt", gleich: "waSoonAt" };

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Erkennungsmuster je Vorlage (Fassung 1 und 2): Platzhalter werden zu Gruppen. */
const MUSTER = TERMIN_VORLAGEN.map((v) => ({
  v,
  re: new RegExp(`^${escape(v.body).replace(/\\\{\\\{\d+\\\}\\\}/g, "([\\s\\S]*?)")}$`),
}));

/** Vorlage und Parameter aus einem gesendeten Text (null: keine Terminvorlage, z. B. Zahlungserinnerung). */
export function erkenneTerminVorlage(body: string | null | undefined): { name: string; art: TerminArtKey; version: 1 | 2; zeit: string | null; link: string | null } | null {
  if (!body) return null;
  for (const { v, re } of MUSTER) {
    const m = re.exec(body);
    if (!m) continue;
    const vals = Object.fromEntries(v.params.map((p, i) => [p, m[i + 1] ?? null]));
    return { name: v.name, art: v.art, version: v.version, zeit: vals.zeit ?? null, link: vals.link ?? vals.linkV1 ?? null };
  }
  return null;
}

const berlinZeit = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);

/** Telefonnummern aus Fehlertexten entfernen (360dialog nennt teils den Empfänger). */
const ohneNummern = (s: string | null | undefined) => (s ? s.replace(/\+?\d[\d\s/().-]{5,}\d/g, "[Nummer]").slice(0, 200) : null);

const vornameOf = (first: string | null | undefined, invitee: string | null | undefined) =>
  first?.trim().split(/\s+/)[0] || invitee?.trim().replace(/^(herrn?|frau)\s+/i, "").split(/\s+/)[0] || null;

type Meeting = Awaited<ReturnType<typeof ladeTermine>>[number];

function ladeTermine(seit: Date) {
  return prisma.salesMeeting.findMany({
    where: { OR: [{ waConfirmAt: { gte: seit } }, { waReminderAt: { gte: seit } }, { waSoonAt: { gte: seit } }, { startAt: { gte: seit } }, { createdAt: { gte: seit } }] },
    select: {
      id: true,
      contactId: true,
      startAt: true,
      createdAt: true,
      status: true,
      calendlyUri: true,
      manageToken: true,
      rescheduleUrl: true,
      utmSource: true,
      inviteeName: true,
      inviteePhone: true,
      waConfirmStatus: true,
      waConfirmAt: true,
      waConfirmError: true,
      waReminderAt: true,
      waSoonAt: true,
      waReminderStatus: true,
      waReminderError: true,
      waReminderTries: true,
      waSoonStatus: true,
      waSoonError: true,
      waSoonTries: true,
      contact: { select: { firstName: true, phone: true } },
    },
    take: 2000,
  });
}

const quelleOf = (m: Pick<Meeting, "calendlyUri" | "manageToken" | "utmSource">) =>
  m.calendlyUri ? "calendly" : m.manageToken ? (m.utmSource === "admin" ? "team" : "buchungsseite") : "von_hand";

const phoneOf = (m: Meeting) => (m.inviteePhone ? normalizePhone(m.inviteePhone) : null) ?? (m.contact.phone ? normalizePhone(m.contact.phone) : null);

export type DiagnoseZeile = {
  terminId: string | null;
  terminZeit: string | null;
  terminStatus: string | null;
  quelle: string | null;
  art: string;
  vorlage: string;
  gesendetAt: string;
  zustellung: string | null;
  fehler: string | null;
  kontaktId: string | null;
  vorname: string | null;
};

/** Auswertung für /api/ops/diagnose?q=vertrieb-termine[&seit=YYYY-MM-DD][&link=1]. */
export async function diagnoseVertriebTermine(opts: { seit: Date; link?: boolean; now?: Date }) {
  const now = opts.now ?? new Date();
  const { seit } = opts;
  const msgs = await prisma.message.findMany({
    where: { direction: "outbound", kind: "template", createdAt: { gte: seit }, conversation: { customerId: SUPPORT_CUSTOMER_ID } },
    select: {
      id: true,
      body: true,
      status: true,
      errorCode: true,
      errorTitle: true,
      createdAt: true,
      conversation: { select: { id: true, contactPhone: true, salesContactId: true, optedOutAt: true } },
    },
    orderBy: { createdAt: "asc" },
    take: 2000,
  });
  const meetings = await ladeTermine(seit);
  const byId = new Map(meetings.map((m) => [m.id, m]));

  type Sent = { msg: (typeof msgs)[number]; art: TerminArtKey; name: string; link: string | null; meeting: Meeting | null };
  const sent: Sent[] = [];
  for (const msg of msgs) {
    const e = erkenneTerminVorlage(msg.body);
    if (!e) continue;
    const t = msg.createdAt.getTime();
    let best: { m: Meeting; score: number; dist: number } | null = null;
    for (const m of meetings) {
      const mark = m[FIELD[e.art]];
      const dist = mark ? Math.abs(t - mark.getTime()) : Infinity;
      let score = 0;
      if (e.zeit && e.zeit === berlinZeit(m.startAt)) score += 3;
      if (mark && mark.getTime() >= t - 15 * MIN && mark.getTime() <= t + MIN) score += 3;
      if (msg.conversation.salesContactId === m.contactId) score += 2;
      if (phoneOf(m) === msg.conversation.contactPhone) score += 2;
      if (score >= 5 && (!best || score > best.score || (score === best.score && dist < best.dist))) best = { m, score, dist };
    }
    sent.push({ msg, art: e.art, name: e.name, link: e.link, meeting: best?.m ?? null });
  }

  const rows: DiagnoseZeile[] = sent.map(({ msg, art, name, meeting: m }) => ({
    terminId: m?.id ?? null,
    terminZeit: m?.startAt.toISOString() ?? null,
    terminStatus: m?.status ?? null,
    quelle: m ? quelleOf(m) : null,
    art: ART_LABEL[art],
    vorlage: name,
    gesendetAt: msg.createdAt.toISOString(),
    zustellung: msg.status,
    fehler: msg.errorCode || msg.errorTitle ? `${msg.errorCode ?? ""} ${ohneNummern(msg.errorTitle) ?? ""}`.trim() : null,
    kontaktId: m?.contactId ?? msg.conversation.salesContactId ?? null,
    vorname: m ? vornameOf(m.contact.firstName, m.inviteeName) : null,
  }));

  // ─── Auffälligkeiten ───
  const doppelt = Object.entries(
    sent.reduce<Record<string, number>>((acc, s) => {
      if (s.meeting) acc[`${s.meeting.id}|${ART_LABEL[s.art]}`] = (acc[`${s.meeting.id}|${ART_LABEL[s.art]}`] ?? 0) + 1;
      return acc;
    }, {}),
  )
    .filter(([, n]) => n > 1)
    .map(([k, n]) => ({ terminId: k.split("|")[0], art: k.split("|")[1], anzahl: n }));

  // Gleiche Nummer, gleiche Art, gleiche Terminzeit über verschiedene Termine (z. B. Calendly und eigene Seite)
  const proNummer = new Map<string, Set<string>>();
  for (const s of sent) {
    if (!s.meeting) continue;
    const k = `${s.msg.conversation.id}|${s.art}|${s.meeting.startAt.toISOString()}`;
    proNummer.set(k, (proNummer.get(k) ?? new Set()).add(s.meeting.id));
  }
  const doppeltUeberTermine = [...proNummer.entries()]
    .filter(([, ids]) => ids.size > 1)
    .map(([k, ids]) => ({ art: ART_LABEL[k.split("|")[1] as TerminArtKey], terminZeit: k.split("|")[2], terminIds: [...ids] }));

  const zuSpaet = sent
    .filter((s) => s.meeting)
    .flatMap((s) => {
      const m = s.meeting!;
      const t = s.msg.createdAt.getTime();
      const start = m.startAt.getTime();
      const geplant = s.art === "termin" ? m.createdAt.getTime() : s.art === "erinnerung" ? start - 24 * HOUR : start - HOUR;
      if (t >= start) return [{ terminId: m.id, art: ART_LABEL[s.art], grund: "nach Terminbeginn", minutenNachGeplant: Math.round((t - geplant) / MIN) }];
      if (t > geplant + SPAET) return [{ terminId: m.id, art: ART_LABEL[s.art], grund: "später als geplant", minutenNachGeplant: Math.round((t - geplant) / MIN) }];
      return [];
    });

  // Empfänger ist Lead eines Vermittlers oder importierter Bestandskunde (Abgleich über den Ziffernschlüssel)
  const convs = new Map(sent.map((s) => [s.msg.conversation.id, s]));
  const fremdeEmpfaenger: { kontaktId: string | null; terminIds: string[]; leads: number; bestandskunden: number; kundenIds: string[] }[] = [];
  for (const [convId, s] of convs) {
    const key = phoneKey(`+${s.msg.conversation.contactPhone}`);
    if (!key) continue;
    const [leads, bestand] = await Promise.all([
      prisma.lead.findMany({ where: { phoneDigits: key, customerId: { not: SUPPORT_CUSTOMER_ID } }, select: { customerId: true }, take: 20 }),
      prisma.existingCustomer.findMany({ where: { phoneDigits: key }, select: { customerId: true }, take: 20 }),
    ]);
    if (!leads.length && !bestand.length) continue;
    const ids = [...new Set(sent.filter((x) => x.msg.conversation.id === convId && x.meeting).map((x) => x.meeting!.id))];
    fremdeEmpfaenger.push({
      kontaktId: s.meeting?.contactId ?? s.msg.conversation.salesContactId,
      terminIds: ids,
      leads: leads.length,
      bestandskunden: bestand.length,
      kundenIds: [...new Set([...leads, ...bestand].map((x) => x.customerId))],
    });
  }

  // STOPP: Sperre am Chat oder ein Stopp-Wort vom Kontakt vor dem Versand (die Support-Nummer setzt die Sperre bisher nicht)
  const stoppTexte = await prisma.message.findMany({
    where: { direction: "inbound", conversationId: { in: [...convs.keys()] } },
    select: { conversationId: true, body: true, createdAt: true },
  });
  const nachStopp = sent.flatMap((s) => {
    const t = s.msg.createdAt.getTime();
    const sperre = !!s.msg.conversation.optedOutAt && s.msg.conversation.optedOutAt.getTime() <= t;
    const stoppWort = stoppTexte.some((x) => x.conversationId === s.msg.conversation.id && x.createdAt.getTime() < t && isStopMessage(x.body));
    return sperre || stoppWort ? [{ terminId: s.meeting?.id ?? null, art: ART_LABEL[s.art], gesendetAt: s.msg.createdAt.toISOString(), sperreGesetzt: sperre, stoppGeschrieben: stoppWort }] : [];
  });

  // Gleicher Kontakt (oder gleiche Nummer) mit Calendly- und eigenem Termin zur selben Zeit (höchstens 60 Minuten auseinander)
  const calendlyUndEigen: { kontaktId: string; calendlyTerminId: string; eigenerTerminId: string; calendlyStatus: string; eigenerStatus: string; abstandMin: number }[] = [];
  const cal = meetings.filter((m) => m.calendlyUri);
  const own = meetings.filter((m) => m.manageToken);
  for (const a of cal) {
    for (const b of own) {
      const same = a.contactId === b.contactId || (!!phoneOf(a) && phoneOf(a) === phoneOf(b));
      const diff = Math.abs(a.startAt.getTime() - b.startAt.getTime());
      if (same && diff <= HOUR) {
        calendlyUndEigen.push({ kontaktId: a.contactId, calendlyTerminId: a.id, eigenerTerminId: b.id, calendlyStatus: a.status, eigenerStatus: b.status, abstandMin: Math.round(diff / MIN) });
      }
    }
  }

  // Markiert, aber keine Nachricht (übersprungen: kurzfristig gebucht, ohne Nummer, Sperre, Fehler beim Senden)
  const gesendet = new Set(sent.filter((s) => s.meeting).map((s) => `${s.meeting!.id}|${s.art}`));
  const markiertOhneNachricht = meetings.flatMap((m) =>
    (["erinnerung", "gleich"] as const).flatMap((art) => {
      const mark = m[FIELD[art]];
      if (!mark || mark < seit || gesendet.has(`${m.id}|${art}`)) return [];
      const [status, fehler, versuche] = art === "erinnerung" ? [m.waReminderStatus, m.waReminderError, m.waReminderTries] : [m.waSoonStatus, m.waSoonError, m.waSoonTries];
      return [{ terminId: m.id, art: ART_LABEL[art], markiertAt: mark.toISOString(), status: status ?? "unbekannt", fehler: ohneNummern(fehler), versuche }];
    }),
  );
  const bestaetigungen = meetings
    .filter((m) => m.waConfirmAt && m.waConfirmAt >= seit)
    .reduce<Record<string, number>>((acc, m) => ((acc[m.waConfirmStatus ?? "?"] = (acc[m.waConfirmStatus ?? "?"] ?? 0) + 1), acc), {});
  const bestaetigungFehler = meetings
    .filter((m) => m.waConfirmAt && m.waConfirmAt >= seit && m.waConfirmStatus !== "sent")
    .map((m) => ({ terminId: m.id, quelle: quelleOf(m), status: m.waConfirmStatus, fehler: ohneNummern(m.waConfirmError) }));

  const zaehlung = rows.reduce<Record<string, Record<string, number>>>((acc, r) => {
    acc[r.art] ??= {};
    acc[r.art][r.zustellung ?? "?"] = (acc[r.art][r.zustellung ?? "?"] ?? 0) + 1;
    return acc;
  }, {});

  const out: Record<string, unknown> = {
    seit: seit.toISOString(),
    anzahl: rows.length,
    ohneTermin: rows.filter((r) => !r.terminId).length,
    zaehlung,
    bestaetigungen,
    rows,
    auffaelligkeiten: {
      doppelt,
      doppeltUeberTermine,
      zuSpaet,
      fremdeEmpfaenger,
      nachStopp,
      calendlyUndEigen,
      markiertOhneNachricht,
      bestaetigungFehler,
    },
  };

  if (opts.link) {
    // Letzte 3 Termine: Link aus der zuletzt gesendeten Nachricht prüfen (nur gültig ja/nein, kein Token)
    const letzte: Sent[] = [];
    for (const s of [...sent].reverse()) {
      if (s.meeting && !letzte.some((x) => x.meeting!.id === s.meeting!.id)) letzte.push(s);
      if (letzte.length === 3) break;
    }
    out.links = await Promise.all(
      letzte.map(async (s) => {
        const m = s.meeting!;
        const token = s.link ? /\/termin\/verwalten\/([A-Za-z0-9_-]+)/.exec(s.link)?.[1] ?? null : null;
        if (token) {
          const hit = await prisma.salesMeeting.findUnique({ where: { manageToken: token }, select: { id: true, status: true, startAt: true } });
          const current = byId.get(m.id);
          return {
            terminId: m.id,
            art: ART_LABEL[s.art],
            linkArt: "buchungsseite",
            tokenGueltig: !!hit,
            gehoertZumTermin: hit?.id === m.id,
            terminOffen: !!hit && hit.status === "GEPLANT" && hit.startAt.getTime() > now.getTime(),
            aktuellerToken: !!current?.manageToken && current.manageToken === token,
          };
        }
        const calendly = !!s.link && /calendly\.com/.test(s.link);
        return {
          terminId: m.id,
          art: ART_LABEL[s.art],
          linkArt: calendly ? "calendly" : s.link ? "anderer" : "keiner",
          tokenGueltig: null,
          gleicherLinkWieAmTermin: calendly ? s.link === m.rescheduleUrl : null,
          terminOffen: m.status === "GEPLANT" && m.startAt.getTime() > now.getTime(),
        };
      }),
    );
  }
  return out;
}
