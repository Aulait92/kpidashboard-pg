// Geplante Nachrichten im Vertrieb laden (Regeln und Anzeige-Helfer: lib/vertrieb/geplante-nachrichten.ts).
// Je Quelle eine begrenzte Abfrage (Zeitraum, Stückzahl wie im Cron), Prüfungen gesammelt für alle Datensätze
// (Sperrliste, „STOPP“, Antworten, Festnetz, Vorlagen): feste Zahl von Abfragen, keine Abfrage je Zeile.

import { prisma } from "@/lib/prisma";
import type { SalesStage } from "@/generated/prisma/enums";
import { neuerPfad } from "@/lib/admin-neu/umzug";
import { berlinYmd, addDaysYmd } from "@/lib/absence";
import { mahnwesenAktiv, naechsteStufe, mahnStoppGrund, rechnungVorlage, VERSAND_AB_STUNDE as MAHN_AB, VERSAND_BIS_STUNDE as MAHN_BIS } from "@/lib/mahnwesen";
import { istErsetzt, naechsteErinnerung, zahlungVorlage, VERSAND_AB_STUNDE, VERSAND_BIS_STUNDE } from "@/lib/angebot-zahlungserinnerung";
import { OFFEN_WHERE } from "@/lib/angebot-zahlungserinnerung-server";
import { onboardingChecklist, ONBOARDING_CUSTOMER_INCLUDE } from "@/lib/onboarding";
import { GESCHAEFTSZEIT } from "@/lib/onboarding-cron";
import { abschlussBonusJetzt } from "@/lib/offer-pricing";
import { dueReminder, openCustomerSteps, REMINDER_DAYS, setupBase } from "@/lib/selbst-einrichtung";
import { istFestnetz } from "@/lib/telefon-typ";
import { bonusErinnerungStopp, bonusPlan, bonusVorlage, whatsappErlaubtAus, type BonusSchritt } from "@/lib/vertrieb/bonus-erinnerung";
import { bonusOffenWhere } from "@/lib/vertrieb/bonus-erinnerung-server";
import { kontaktPfad, V } from "@/components/admin-neu/vertrieb/listen";
import { followupStoppGrund } from "@/lib/vertrieb/followup-regeln";
import { gesperrteKontakte } from "@/lib/vertrieb/sperrliste";
import { isWorkdayKey, SENDEFENSTER } from "@/lib/vertrieb/spaeter";
import { terminKurz } from "@/lib/vertrieb/entscheidungs-call";
import { direktNachBestaetigung, erinnerungsZeit, TERMIN_ERINNERUNGEN, vorlaufOk, type TerminErinnerungArt } from "@/lib/vertrieb/termin-erinnerungen";
import { supportVorlagenNutzbar, terminModus, terminThema, waehleTerminVorlage, type Nutzbar } from "@/lib/vertrieb/termin-whatsapp";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { imFenster, kanaeleAus, montagBisFreitag, naechsteEinrichtungsErinnerung, sortiere, whatsappHindernis, type GeplanteNachricht } from "@/lib/vertrieb/geplante-nachrichten";

const DAY = 86_400_000;
/** Standard-Zeitraum der Übersicht */
export const TAGE_STANDARD = 14;

type Opts = { now?: Date; tage?: number; contactId?: string };

type Ctx = {
  now: Date;
  bis: Date;
  konto: boolean;
  nutzbar: Nutzbar;
  gesperrt: Set<string>;
  /** normalisierte Nummer → Festnetz */
  festnetz: Map<string, boolean>;
  /** normalisierte Nummern mit „STOPP“ auf der Support-Nummer */
  optedOut: Set<string>;
};

const kurzName = (s: string | null | undefined) => (s ?? "").trim();
const kundenPfad = (id: string, unter = "") => neuerPfad(`/admin/kunden/${id}${unter}`, { nurFertige: false }) ?? `/admin/kunden/${id}${unter}`;
const telefon = (p: string | null | undefined) => (p ? normalizePhone(p) : null);

/**
 * Nächste automatische Nachrichten an Vertriebskontakte und Neukunden, chronologisch, bis `tage` Tage voraus.
 * Mit `contactId` nur die eines Kontakts (Kontaktakte).
 */
export async function ladeGeplanteNachrichten(opts: Opts = {}): Promise<GeplanteNachricht[]> {
  const now = opts.now ?? new Date();
  const bis = new Date(now.getTime() + (opts.tage ?? TAGE_STANDARD) * DAY);
  const cid = opts.contactId;
  const [konto, nutzbar, meetings, zahlung, bonus, followups, settings, mahnfaelle, onboardings] = await Promise.all([
    prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { status: true, apiKeyEnc: true } }),
    supportVorlagenNutzbar(),
    prisma.salesMeeting.findMany({
      where: { status: "GEPLANT", startAt: { gt: new Date(now.getTime() + TERMIN_ERINNERUNGEN.gleich.bisVorher), lte: new Date(bis.getTime() + TERMIN_ERINNERUNGEN.tag.vorher) }, ...(cid ? { contactId: cid } : {}) },
      select: {
        id: true,
        title: true,
        startAt: true,
        createdAt: true,
        rescheduledFromId: true,
        joinUrl: true,
        location: true,
        manageToken: true,
        bookingTypeId: true,
        inviteeEmail: true,
        inviteePhone: true,
        reminderSentAt: true,
        soonReminderSentAt: true,
        waReminderAt: true,
        waSoonAt: true,
        waConfirmStatus: true,
        waConfirmAt: true,
        contactId: true,
        bookingType: { select: { slug: true } },
        contact: { select: { name: true, phone: true } },
      },
      orderBy: { startAt: "asc" },
      take: 200,
    }),
    prisma.offer.findMany({ where: { ...OFFEN_WHERE, ...(cid ? { salesContactId: cid } : {}) }, orderBy: { acceptedAt: "asc" }, take: 200 }),
    prisma.offer.findMany({ where: { ...bonusOffenWhere(now, new Date(bis.getTime() + DAY)), ...(cid ? { salesContactId: cid } : {}) }, orderBy: { abschlussBonusBis: "asc" }, take: 200 }),
    prisma.salesFollowup.findMany({
      where: { status: "GEPLANT", activeFor: { not: null }, step: { lt: 2 }, nextAt: { lte: bis }, ...(cid ? { contactId: cid } : {}) },
      select: { id: true, contactId: true, step: true, nextAt: true, replyEmailId: true, mail1SentAt: true, createdAt: true, contact: { select: { name: true, stage: true } } },
      orderBy: { nextAt: "asc" },
      take: 200,
    }),
    prisma.salesFollowupSettings.findUnique({ where: { id: "default" }, select: { enabled: true } }),
    mahnwesenAktiv()
      ? prisma.mahnfall.findMany({
          where: { status: "offen", ...(cid ? { customer: { salesContact: { is: { id: cid } } } } : {}) },
          include: {
            customer: {
              select: { id: true, name: true, isTest: true, mahnStopp: true, salesContact: { select: { id: true, name: true, phone: true } }, users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } } },
            },
          },
          orderBy: { dueDate: "asc" },
          take: 300,
        })
      : Promise.resolve([]),
    prisma.onboarding.findMany({
      where: { status: "running", liveAt: null, createdAt: { gt: new Date(now.getTime() - 21 * DAY) }, ...(cid ? { salesContactId: cid } : {}) },
      include: { customer: { include: ONBOARDING_CUSTOMER_INCLUDE } },
      take: 100,
    }),
  ]);

  // Kontakte, Nummern und Sperren gesammelt
  const contactIds = new Set<string>();
  for (const m of meetings) contactIds.add(m.contactId);
  for (const o of [...zahlung, ...bonus]) if (o.salesContactId) contactIds.add(o.salesContactId);
  for (const f of followups) contactIds.add(f.contactId);
  for (const f of mahnfaelle) if (f.customer?.salesContact) contactIds.add(f.customer.salesContact.id);
  const kontakte = contactIds.size
    ? await prisma.salesContact.findMany({ where: { id: { in: [...contactIds] } }, select: { id: true, name: true, phone: true, firstName: true, lastName: true, whatsappErlaubt: true } })
    : [];
  const kontakt = new Map(kontakte.map((c) => [c.id, c]));
  const phones = new Set<string>();
  for (const c of kontakte) {
    const p = telefon(c.phone);
    if (p) phones.add(p);
  }
  for (const m of meetings) {
    const p = telefon(m.inviteePhone);
    if (p) phones.add(p);
  }
  const [gesperrt, optedOutRows, festnetzListe] = await Promise.all([
    gesperrteKontakte([...contactIds]),
    phones.size
      ? prisma.conversation.findMany({ where: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: { in: [...phones] }, optedOutAt: { not: null } }, select: { contactPhone: true } })
      : Promise.resolve([]),
    Promise.all([...phones].map(async (p) => [p, await istFestnetz(p)] as const)),
  ]);
  const ctx: Ctx = {
    now,
    bis,
    konto: konto?.status === "connected" && !!konto.apiKeyEnc,
    nutzbar,
    gesperrt,
    festnetz: new Map(festnetzListe),
    optedOut: new Set(optedOutRows.map((r) => r.contactPhone)),
  };
  const waMoeglich = (phone: string | null, vorlage: boolean) =>
    whatsappHindernis({ phone, festnetz: !!phone && !!ctx.festnetz.get(phone), kontoVerbunden: ctx.konto, vorlage, optedOut: !!phone && ctx.optedOut.has(phone) }) === null;

  const items: GeplanteNachricht[] = [
    ...(await terminNachrichten(meetings, ctx, waMoeglich)),
    ...(await zahlungNachrichten(zahlung, ctx, kontakt, waMoeglich)),
    ...(await bonusNachrichten(bonus, ctx, kontakt, waMoeglich)),
    ...(await followupNachrichten(followups, ctx, settings?.enabled ?? false)),
    ...(await mahnNachrichten(mahnfaelle, ctx, waMoeglich)),
    ...(await einrichtungNachrichten(onboardings, ctx)),
  ];
  return sortiere(items, bis);
}

// ─── Termine ───────────────────────────────────────────────────────────

type MeetingRow = {
  id: string;
  title: string;
  startAt: Date;
  createdAt: Date;
  rescheduledFromId: string | null;
  joinUrl: string | null;
  location: string | null;
  manageToken: string | null;
  bookingTypeId: string | null;
  inviteeEmail: string | null;
  inviteePhone: string | null;
  reminderSentAt: Date | null;
  soonReminderSentAt: Date | null;
  waReminderAt: Date | null;
  waSoonAt: Date | null;
  waConfirmStatus: string | null;
  waConfirmAt: Date | null;
  contactId: string;
  bookingType: { slug: string } | null;
  contact: { name: string; phone: string | null };
};

/** Ursprüngliche Buchung je Termin (erster der Verschiebe-Kette, wie urspruenglichGebucht), höchstens 10 Runden. */
async function urspruenglichMap(meetings: { id: string; createdAt: Date; rescheduledFromId: string | null }[]): Promise<Map<string, Date>> {
  const out = new Map<string, Date>();
  const stand = new Map(meetings.map((m) => [m.id, { at: m.createdAt, prev: m.rescheduledFromId }]));
  for (let i = 0; i < 10; i++) {
    const offen = [...new Set([...stand.values()].map((s) => s.prev).filter((x): x is string => !!x))];
    if (!offen.length) break;
    const rows = await prisma.salesMeeting.findMany({ where: { id: { in: offen } }, select: { id: true, createdAt: true, rescheduledFromId: true } });
    const byId = new Map(rows.map((r) => [r.id, r]));
    for (const s of stand.values()) {
      if (!s.prev) continue;
      const p = byId.get(s.prev);
      if (!p) {
        s.prev = null;
        continue;
      }
      s.at = p.createdAt;
      s.prev = p.rescheduledFromId;
    }
  }
  for (const [id, s] of stand) out.set(id, s.at);
  return out;
}

async function terminNachrichten(meetings: MeetingRow[], ctx: Ctx, waMoeglich: (phone: string | null, vorlage: boolean) => boolean): Promise<GeplanteNachricht[]> {
  if (!meetings.length) return [];
  const urspr = await urspruenglichMap(meetings);
  const out: GeplanteNachricht[] = [];
  for (const m of meetings) {
    const urspruenglich = urspr.get(m.id) ?? m.createdAt;
    const phone = [m.inviteePhone, m.contact.phone].map(telefon).find(Boolean) ?? null;
    for (const art of ["tag", "gleich"] as TerminErinnerungArt[]) {
      const zeit = erinnerungsZeit(art, m.startAt, ctx.now);
      if (!zeit) continue;
      const v = { startAt: m.startAt, gebucht: m.createdAt, urspruenglich };
      // E-Mail: nur eigene Buchungsseite (Calendly erinnert selbst), mit Adresse, je Art einmal
      const mail = !!m.bookingTypeId && !!m.manageToken && !!m.inviteeEmail && !(art === "tag" ? m.reminderSentAt : m.soonReminderSentAt) && vorlaufOk(art, "email", v);
      // WhatsApp: Support-Nummer, passende Vorlage, nicht gesperrt, je Art einmal
      const waArt = art === "tag" ? "erinnerung" : "gleich";
      const morgen = berlinYmd(m.startAt) === addDaysYmd(berlinYmd(zeit.at), 1);
      const vorlage = !!waehleTerminVorlage(waArt, { thema: terminThema(m), modus: terminModus({ joinUrl: m.joinUrl, locType: m.location, location: m.location }), morgen }, ctx.nutzbar);
      const wa =
        !(art === "tag" ? m.waReminderAt : m.waSoonAt) &&
        vorlaufOk(art, "whatsapp", v) &&
        !(art === "tag" && direktNachBestaetigung({ status: m.waConfirmStatus, at: m.waConfirmAt }, zeit.at)) &&
        !ctx.gesperrt.has(m.contactId) &&
        waMoeglich(phone, vorlage);
      const kanaele = kanaeleAus({ email: mail, whatsapp: wa });
      if (!kanaele.length) continue;
      out.push({
        key: `termin:${m.id}:${art}`,
        quelle: "termin",
        at: zeit.at,
        sofort: zeit.sofort,
        art: TERMIN_ERINNERUNGEN[art].label,
        kanaele,
        empfaenger: m.contact.name,
        bezug: `Termin ${terminKurz(m.startAt)}`,
        href: kontaktPfad(m.contactId),
        contactId: m.contactId,
      });
    }
  }
  return out;
}

// ─── Angebote: Zahlungs- und Bonus-Erinnerung ──────────────────────────

type OfferRow = Awaited<ReturnType<typeof prisma.offer.findMany>>[number];
type KontaktRow = { id: string; name: string; phone: string | null; whatsappErlaubt: boolean | null };

/** Neuere Versionen der Angebote (gleicher Kontakt bzw. Deal) in einer Abfrage. */
async function ersetzteAngebote(offers: OfferRow[]): Promise<Set<string>> {
  const kontakte = [...new Set(offers.map((o) => o.salesContactId).filter((x): x is string => !!x))];
  const deals = [...new Set(offers.filter((o) => !o.salesContactId && o.dealId).map((o) => o.dealId!))];
  if (!kontakte.length && !deals.length) return new Set();
  const andere = await prisma.offer.findMany({
    where: { OR: [...(kontakte.length ? [{ salesContactId: { in: kontakte } }] : []), ...(deals.length ? [{ dealId: { in: deals } }] : [])] },
    select: { id: true, createdAt: true, status: true, salesContactId: true, dealId: true },
  });
  return new Set(offers.filter((o) => istErsetzt(o, andere)).map((o) => o.id));
}

const angebotPfad = (o: { salesContactId: string | null }) => (o.salesContactId ? kontaktPfad(o.salesContactId) : `${V}/angebote`);

async function zahlungNachrichten(
  offers: OfferRow[],
  ctx: Ctx,
  kontakt: Map<string, KontaktRow>,
  waMoeglich: (phone: string | null, vorlage: boolean) => boolean,
): Promise<GeplanteNachricht[]> {
  if (!offers.length) return [];
  const ersetzt = await ersetzteAngebote(offers);
  const out: GeplanteNachricht[] = [];
  for (const o of offers) {
    const e = naechsteErinnerung(o, ctx.now, { ersetzt: ersetzt.has(o.id) });
    if (!e) continue;
    // Abgemeldet: der Lauf vermerkt nur „nicht gesendet“
    if (o.salesContactId && ctx.gesperrt.has(o.salesContactId)) continue;
    const c = o.salesContactId ? kontakt.get(o.salesContactId) : undefined;
    const wa = !!c && waMoeglich(telefon(c.phone), !!zahlungVorlage(o.mailDu, ctx.nutzbar));
    const kanaele = kanaeleAus({ email: !!o.email, whatsapp: wa });
    if (!kanaele.length) continue;
    const zeit = imFenster(e.faelligAb, ctx.now, { von: VERSAND_AB_STUNDE, bis: VERSAND_BIS_STUNDE });
    out.push({
      key: `zahlung:${o.id}:${e.stufe}`,
      quelle: "zahlung",
      at: zeit.at,
      sofort: zeit.sofort,
      art: e.stufe > 1 ? `${e.stufe}. Zahlungserinnerung` : "Zahlungserinnerung",
      kanaele,
      empfaenger: kurzName(o.company) || o.contactName,
      bezug: `Angebot ${o.number}`,
      href: angebotPfad(o),
      contactId: o.salesContactId,
    });
  }
  return out;
}

/** Antworten seit dem Versand (Mail oder WhatsApp auf der Support-Nummer) und „WhatsApp erlaubt“, gesammelt. */
async function bonusKontext(contactIds: string[], kontakt: Map<string, KontaktRow>) {
  if (!contactIds.length) return { letzteMail: new Map<string, Date>(), letzteWa: new Map<string, Date>(), erlaubt: new Set<string>() };
  const [mails, convs, terminWa] = await Promise.all([
    prisma.salesEmail.groupBy({ by: ["contactId"], where: { contactId: { in: contactIds }, direction: "IN", isAutoReply: false }, _max: { sentAt: true } }),
    prisma.conversation.findMany({ where: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: { in: contactIds } }, select: { id: true, salesContactId: true } }),
    prisma.salesMeeting.findMany({
      where: { contactId: { in: contactIds }, OR: [{ waConfirmStatus: "sent" }, { waReminderStatus: "sent" }, { waSoonStatus: "sent" }] },
      select: { contactId: true },
      distinct: ["contactId"],
    }),
  ]);
  const eingehend = convs.length
    ? await prisma.message.groupBy({ by: ["conversationId"], where: { conversationId: { in: convs.map((c) => c.id) }, direction: "inbound" }, _max: { createdAt: true } })
    : [];
  const letzteMail = new Map<string, Date>();
  for (const m of mails) if (m.contactId && m._max.sentAt) letzteMail.set(m.contactId, m._max.sentAt);
  const convKontakt = new Map(convs.map((c) => [c.id, c.salesContactId]));
  const letzteWa = new Map<string, Date>();
  for (const e of eingehend) {
    const id = convKontakt.get(e.conversationId);
    const at = e._max.createdAt;
    if (!id || !at) continue;
    const alt = letzteWa.get(id);
    if (!alt || alt < at) letzteWa.set(id, at);
  }
  const mitTermin = new Set(terminWa.map((t) => t.contactId));
  const erlaubt = new Set<string>();
  for (const id of contactIds) {
    // Wie whatsappErlaubtStand (lib/vertrieb/bonus-erinnerung-server.ts)
    const r = whatsappErlaubtAus({ manuell: kontakt.get(id)?.whatsappErlaubt ?? null, terminWhatsApp: mitTermin.has(id), eingehend: letzteWa.has(id) });
    if (r.erlaubt) erlaubt.add(id);
  }
  return { letzteMail, letzteWa, erlaubt };
}

const BONUS_ART: Record<Exclude<BonusSchritt, "push">, { art: string; kanal: "email" | "whatsapp" }> = {
  vorab: { art: "Bonus-Erinnerung, Tag vor Ablauf", kanal: "email" },
  letzter: { art: "Bonus-Erinnerung, letzter Tag", kanal: "email" },
  whatsapp: { art: "Bonus-Erinnerung, letzter Tag", kanal: "whatsapp" },
};

async function bonusNachrichten(
  offers: OfferRow[],
  ctx: Ctx,
  kontakt: Map<string, KontaktRow>,
  waMoeglich: (phone: string | null, vorlage: boolean) => boolean,
): Promise<GeplanteNachricht[]> {
  if (!offers.length) return [];
  const ids = [...new Set(offers.map((o) => o.salesContactId).filter((x): x is string => !!x))];
  const [ersetzt, k] = await Promise.all([ersetzteAngebote(offers), bonusKontext(ids, kontakt)]);
  const out: GeplanteNachricht[] = [];
  for (const o of offers) {
    // Abmeldung: gar nichts (wie runBonusErinnerungen)
    if (o.salesContactId && ctx.gesperrt.has(o.salesContactId)) continue;
    const seit = o.sentAt ?? o.createdAt;
    const antwort = !!o.salesContactId && [k.letzteMail.get(o.salesContactId), k.letzteWa.get(o.salesContactId)].some((d) => !!d && d > seit);
    // Antwort stoppt Mail und WhatsApp (nur der Push an Ole bleibt, der ist keine Nachricht an den Kontakt)
    if (antwort) continue;
    const c = o.salesContactId ? kontakt.get(o.salesContactId) : undefined;
    // Gleicher Tag, gleiche Uhrzeit: Mail und WhatsApp in einer Zeile
    const jeZeit = new Map<string, GeplanteNachricht>();
    for (const s of bonusPlan(o, ctx.now)) {
      if (s.schritt === "push" || s.bis.getTime() <= ctx.now.getTime()) continue;
      const at = s.ab.getTime() > ctx.now.getTime() ? s.ab : ctx.now;
      if (bonusErinnerungStopp(o, at, { ersetzt: ersetzt.has(o.id) })) continue;
      const b = BONUS_ART[s.schritt];
      const ok =
        b.kanal === "email"
          ? !!o.email && !!abschlussBonusJetzt(o, at)
          : !!c && k.erlaubt.has(c.id) && waMoeglich(telefon(c.phone), !!bonusVorlage(o.mailDu, o.allowPayLater, ctx.nutzbar));
      if (!ok) continue;
      const key = `${s.schritt === "vorab" ? "vorab" : "letzter"}:${at.getTime()}`;
      const da = jeZeit.get(key);
      if (da) {
        if (!da.kanaele.includes(b.kanal)) da.kanaele.push(b.kanal);
        continue;
      }
      jeZeit.set(key, {
        key: `bonus:${o.id}:${s.schritt}`,
        quelle: "bonus",
        at,
        sofort: at === ctx.now,
        art: b.art,
        kanaele: [b.kanal],
        empfaenger: kurzName(o.company) || o.contactName,
        bezug: `Angebot ${o.number}`,
        href: angebotPfad(o),
        contactId: o.salesContactId,
      });
    }
    out.push(...jeZeit.values());
  }
  return out;
}

// ─── Später-Follow-up ──────────────────────────────────────────────────

type FollowupRow = {
  id: string;
  contactId: string;
  step: number;
  nextAt: Date;
  replyEmailId: string | null;
  mail1SentAt: Date | null;
  createdAt: Date;
  contact: { name: string; stage: SalesStage };
};

async function followupNachrichten(followups: FollowupRow[], ctx: Ctx, enabled: boolean): Promise<GeplanteNachricht[]> {
  // Versand nur mit eingeschalteter Automatik und Instantly-Anbindung (wie runFollowups)
  if (!followups.length || !enabled || !process.env.INSTANTLY_API_KEY || process.env.INSTANTLY_AUTO_SYNC !== "1") return [];
  // Anker wie im Versand: Mail 1, sonst die Später-Antwort des Kontakts, sonst Anlage
  const replyIds = followups.map((f) => f.replyEmailId).filter((x): x is string => !!x);
  const replies = replyIds.length ? await prisma.salesEmail.findMany({ where: { id: { in: replyIds } }, select: { id: true, sentAt: true } }) : [];
  const replyAt = new Map(replies.map((r) => [r.id, r.sentAt]));
  const anker = new Map(followups.map((f) => [f.id, f.mail1SentAt ?? (f.replyEmailId ? replyAt.get(f.replyEmailId) : null) ?? f.createdAt]));
  const fruehester = new Date(Math.min(...[...anker.values()].map((d) => d.getTime())));
  const antworten = await prisma.salesEmail.findMany({
    where: { contactId: { in: followups.map((f) => f.contactId) }, direction: "IN", isAutoReply: false, sentAt: { gt: fruehester } },
    select: { id: true, contactId: true, sentAt: true },
  });
  const out: GeplanteNachricht[] = [];
  for (const f of followups) {
    const a = anker.get(f.id)!;
    const beantwortet = antworten.some((x) => x.contactId === f.contactId && x.sentAt > a && x.id !== f.replyEmailId);
    const gesperrt = ctx.gesperrt.has(f.contactId);
    if (followupStoppGrund({ stage: f.contact.stage, abgemeldet: gesperrt, gesperrt, beantwortet })) continue;
    const zeit = imFenster(f.nextAt, ctx.now, { von: SENDEFENSTER.von, bis: SENDEFENSTER.bis, tag: isWorkdayKey });
    out.push({
      key: `followup:${f.id}:${f.step + 1}`,
      quelle: "followup",
      at: zeit.at,
      sofort: zeit.sofort,
      art: `Später-Follow-up, Mail ${f.step + 1}`,
      kanaele: ["email"],
      empfaenger: f.contact.name,
      bezug: null,
      href: kontaktPfad(f.contactId),
      contactId: f.contactId,
      stoppHref: `${kontaktPfad(f.contactId)}#follow-up`,
      hinweis: "frühestens, je Postfach begrenzt",
    });
  }
  return out;
}

// ─── Mahnwesen ─────────────────────────────────────────────────────────

type MahnRow = Awaited<ReturnType<typeof prisma.mahnfall.findMany>>[number] & {
  customer: { id: string; name: string; isTest: boolean; mahnStopp: boolean; salesContact: { id: string; name: string; phone: string | null } | null; users: { email: string }[] } | null;
};

async function mahnNachrichten(faelle: MahnRow[], ctx: Ctx, waMoeglich: (phone: string | null, vorlage: boolean) => boolean): Promise<GeplanteNachricht[]> {
  if (!faelle.length) return [];
  const { vorlageFreigegeben } = await import("@/lib/mahnwesen-server");
  const arten = [...new Set(faelle.map((f) => rechnungVorlage(f.art).name))];
  const freigegeben = new Set((await Promise.all(arten.map(async (n) => ((await vorlageFreigegeben(n)) ? n : null)))).filter(Boolean));
  const out: GeplanteNachricht[] = [];
  for (const f of faelle) {
    const n = naechsteStufe(f, ctx.now, { gestoppt: !!mahnStoppGrund(f.customer) });
    // „Kunde anrufen“ ist eine Aufgabe, keine Nachricht
    if (!n || !n.stufe.mail) continue;
    const zeit = imFenster(n.faelligAb, ctx.now, { von: MAHN_AB, bis: MAHN_BIS });
    if (zeit.at.getTime() > ctx.bis.getTime()) continue;
    const contact = f.customer?.salesContact ?? null;
    const mail = !!f.email || !!f.customer?.users.length;
    const wa = n.stufe.key === "faellig" && !!f.hostedUrl && !!contact && waMoeglich(telefon(contact.phone), freigegeben.has(rechnungVorlage(f.art).name));
    const kanaele = kanaeleAus({ email: mail, whatsapp: wa });
    if (!kanaele.length) continue;
    out.push({
      key: `mahnung:${f.id}:${n.stufe.nr}`,
      quelle: "mahnung",
      at: zeit.at,
      sofort: zeit.sofort,
      art: n.stufe.label,
      kanaele,
      empfaenger: f.customer?.name ?? f.email ?? "Unbekannt",
      bezug: `Rechnung ${f.invoiceNumber ?? f.stripeInvoiceId}`,
      href: f.customer ? kundenPfad(f.customer.id) : "/admin/neu/zahlen/offene-posten",
      contactId: contact?.id ?? null,
      stoppHref: f.customer ? kundenPfad(f.customer.id, "/abrechnung") : null,
    });
  }
  return out;
}

// ─── Einrichtung (neue Kunden) ─────────────────────────────────────────

type OnboardingRow = Parameters<typeof onboardingChecklist>[0];

async function einrichtungNachrichten(onboardings: OnboardingRow[], ctx: Ctx): Promise<GeplanteNachricht[]> {
  if (!onboardings.length) return [];
  const offerIds = onboardings.map((o) => o.offerId).filter((x): x is string => !!x);
  const offers = offerIds.length ? await prisma.offer.findMany({ where: { id: { in: offerIds } }, select: { id: true, paymentStatus: true, paidAt: true, isTest: true, email: true } }) : [];
  const offer = new Map(offers.map((o) => [o.id, o]));
  const out: GeplanteNachricht[] = [];
  for (const ob of onboardings) {
    const o = ob.offerId ? offer.get(ob.offerId) ?? null : null;
    const open = openCustomerSteps(onboardingChecklist(ob, o));
    if (!open.length) continue;
    // Ohne Login: Willkommensmail erneut (an Login bzw. Angebotsadresse), sonst Erinnerung an alle Logins
    const login = open.some((i) => i.key === "login");
    if (!(login ? ob.customer.users[0]?.email || o?.email : ob.customer.users.length)) continue;
    const sent = (ob.setupReminders && typeof ob.setupReminders === "object" ? ob.setupReminders : {}) as Record<string, string>;
    const base = setupBase(ob);
    const n = naechsteEinrichtungsErinnerung(base, ctx.now, sent, REMINDER_DAYS, dueReminder(base, ctx.now, sent));
    if (!n) continue;
    const zeit = imFenster(n.ab, ctx.now, { von: GESCHAEFTSZEIT.von, bis: GESCHAEFTSZEIT.bis, tag: montagBisFreitag });
    // Läuft nur in den ersten 21 Tagen nach Anlage
    if (zeit.at.getTime() >= ob.createdAt.getTime() + 21 * DAY) continue;
    out.push({
      key: `einrichtung:${ob.id}:${n.tag}`,
      quelle: "einrichtung",
      at: zeit.at,
      sofort: zeit.sofort,
      art: `Erinnerung an die Einrichtung, Tag ${n.tag}`,
      kanaele: ["email"],
      empfaenger: ob.customer.name,
      bezug: `${open.length} Schritt${open.length === 1 ? "" : "e"} offen`,
      href: kundenPfad(ob.customerId),
      contactId: ob.salesContactId,
    });
  }
  return out;
}
