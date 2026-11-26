// Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026, docs/plan-mailstrecke-dsgvo-investoren.md E0 bis E4, E7 und
// Nachtrag SMS/Takt). Gilt nur für Leads ohne WhatsApp, der WhatsApp-Weg bleibt unverändert.
//
//   E0 Auslöser   Status 131026/1013 auf das Erstanschreiben (lib/whatsapp/kein-whatsapp.ts markLeadNoWhatsApp, sofort)
//                 sowie per Minuten-Cron (app/api/mail-strecke/cron): keine Nummer, Festnetz, waConsent „nein“. Nicht
//                 131050 (Abmeldung von WhatsApp). Nur mit eingeschaltetem Assistenten und Erstanschreiben des Kunden,
//                 offenem Lead mit E-Mail-Adresse, nicht ruhend, E-Mail-Funktionen an. Schalter MAIL_STRECKE=aus.
//   E2 Erstmail   sofort (Tag 1), über den zentralen Versandweg (lib/mail/lead-versand.ts sendeLeadMail) mit den Sperren
//                 (lib/mail/sperren.ts) und Idempotenz (LeadMailVersand je Lead und Anlass). Reply-To immer die
//                 Antwortadresse, wenn der Eingang an ist (Arbeitsannahme 1), auch bei verbundenem Postfach.
//   Takt          Tag 1 Erstmail und SMS, Tag 2 Mail mit zwei neuen Zeiten, Tag 4 SMS, Tag 6 Mail mit Nutzen und Zeiten,
//                 Tag 10 letzte Mail. Höchstens 2 SMS (nur Handynummer, Schalter MAIL_STRECKE_SMS), nichts zwischen 20
//                 und 8 Uhr. Stopp bei jeder Reaktion: Seite im Browser geöffnet, Antwort, Buchung, Antwort per Mail,
//                 Anruf erreicht, Abmeldung, Lead nicht mehr offen.
//   Nur SMS       (Ole, 22.11.2026, lib/mail-strecke/nur-sms.ts) E-Mail-Funktionen beim Kunden aus und Nummer nicht bei
//                 WhatsApp: statt nichts höchstens 2 SMS an die Handynummer, nur zu Geschäftszeiten (sonst wartet die
//                 SMS bis zum nächsten Fenster), die zweite nach 2 Geschäftstagen; Rückruf zu Geschäftszeiten in der SMS.
//                 Gleiche Sperren und Stopps wie oben, Festnetz nie. Schalter STRECKE_NUR_SMS=aus.
//   Erst-SMS      (Ole, 25.11.2026, Auswertung Lohmann: 9 von 18 Erstnachrichten mit 131026, nur 3 bekamen eine SMS)
//                 Bei „kein WhatsApp“ auf das Erstanschreiben läuft die Nur-SMS-Strecke auch ohne gültige E-Mail-Adresse
//                 und wenn die Erstmail nicht raus konnte (Sperre der Adresse, Versandfehler). Der Minuten-Cron holt
//                 Starts nach, die im Status-Webhook ausfielen (48 Stunden, nur Handynummern).
//   E3/E4 Seite   app/t/[token]: Antworten und Buchung nur per POST (Server-Aktion) nach Klick im Browser; Termin über
//                 bookAppointment (Kalender sofort geblockt, Zeit beim Klick neu geprüft). Danach Komplettcheck,
//                 Angebotsfragen, Bereitlegen, Adresse, Einladung genau einmal (lib/calendar/einladung.ts).

import { NUR_PPL_WHERE, istNurPayPerLead } from "@/lib/customer-package";
import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { asAnsprache, anredeName, anredeZeile, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { vermittlerName, type VermittlerName } from "@/lib/vermittler-nennung";
import { logLeadHistory } from "@/lib/lead-history";
import { formularAus } from "@/lib/whatsapp/gespraech";
import { streckenToken, streckenUrl, streckenBasis } from "@/lib/mail-strecke/token";
import {
  erstmailInhalt,
  faelligerSchritt,
  mailAnrede,
  MAX_SMS,
  oeffnungsfrage,
  sendeFenster,
  smsAbsenderFuer,
  smsStreckeAn,
  smsText,
  TAKT,
  type Ausloeser,
  type MailArtStrecke,
  type Oeffnungsfrage,
} from "@/lib/mail-strecke/texte";
import type { LeadMailAnhang } from "@/lib/mail/lead-versand";
import { GESCHAEFTSZEITEN_STANDARD, geschaeftszeitenAusPlan, geschaeftszeitText, imGeschaeftsfenster, nurSmsAn, nurSmsText, smsFuerVerlauf, zweiteSmsFaellig, type Geschaeftszeiten } from "@/lib/mail-strecke/nur-sms";
import { istFestnetz, istMobil } from "@/lib/telefon-typ";

const OFFEN = new Set(["", "neuer lead", "nicht erreicht", "im gespräch"]);
const istOffen = (status: string | null | undefined) => OFFEN.has((status ?? "").trim().toLowerCase());
const istEindeutigFehler = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Gründe, aus denen die Erstmail nicht raus ging und auch keine Ersatz-SMS gehen darf (Abmeldung, Status, Antwort …). */
const KEIN_SMS_ERSATZ = new Set(["abgemeldet", "geloescht", "ruhend", "status", "antwort", "stufe", "schon_gesendet", "nicht_gefunden"]);

/** Mail-Strecke an? (Standard an; MAIL_STRECKE=aus schaltet alles ab.) */
export function streckeAn(env: Record<string, string | undefined> = process.env): boolean {
  return !/^(0|aus|off|false|nein)$/i.test((env.MAIL_STRECKE ?? "").trim());
}

// Art der Nummer (rein, lib/telefon-typ.ts); hier weiter exportiert, der Vertrieb importiert sie von hier
export { istFestnetz, istMobil };

/** Daten-Sperre nach Betroffenenrechten (lib/dsgvo): Adresse bzw. Nummer gesperrt? */
async function gesperrt(customerId: string, email: string | null, phone: string | null): Promise<boolean> {
  const { sperreFuer } = await import("@/lib/dsgvo/server");
  return !!(await sperreFuer(customerId, { email, phone }));
}

export type StartErgebnis = { ergebnis: "gestartet" | "schon" | "nicht_moeglich"; grund?: string; gesendet?: boolean; /** „sms“ = nur SMS (E-Mail-Funktionen aus) */ kanal?: "email" | "sms" };

/** Geschäftszeiten des Kunden (Zeiten des Agentur-Kalenders für Leads, sonst Mo bis Fr 9 bis 18 Uhr). */
export async function geschaeftszeitenFuer(customerId: string): Promise<Geschaeftszeiten> {
  const row = await prisma.calendarLeadTimes.findUnique({ where: { calendarKey: customerId }, select: { schedule: true } }).catch(() => null);
  if (!row?.schedule) return GESCHAEFTSZEITEN_STANDARD;
  const { parseSchedule } = await import("@/lib/calendar/lead-times");
  const p = parseSchedule(row.schedule);
  return geschaeftszeitenAusPlan(p && "schedule" in p ? p.schedule : null);
}

/** Nummer auf der Sperrliste des Kunden (Abmeldung für alle Kanäle)? */
async function nummerAbgemeldet(customerId: string, phone: string): Promise<boolean> {
  const { optOutHash } = await import("@/lib/bestand/links");
  return (await prisma.bestandOptOut.count({ where: { customerId, kind: "phone", hash: optOutHash("phone", phone), scope: "all" } })) > 0;
}

/**
 * Strecke für einen Lead starten (idempotent je Lead) und die Erstmail senden. Wirft nicht.
 */
export async function starteMailStrecke(leadId: string, ausloeser: Ausloeser, opts: { now?: Date } = {}): Promise<StartErgebnis> {
  const now = opts.now ?? new Date();
  try {
    if (!streckeAn()) return { ergebnis: "nicht_moeglich", grund: "aus" };
    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      select: {
        id: true,
        customerId: true,
        email: true,
        phone: true,
        status: true,
        erasedAt: true,
        airtableId: true,
        externalId: true,
        formData: true,
        source: true,
        customer: { select: { dormantSince: true, dataDeletedAt: true, mailFeaturesOff: true, plan: true, retainerMonthly: true, onboarding: { select: { id: true } }, agentConfig: { select: { active: true, outreachEnabled: true } } } },
      },
    });
    if (!lead || lead.erasedAt) return { ergebnis: "nicht_moeglich", grund: "nicht_gefunden" };
    // Nur SMS (Ole, 22.11.2026): E-Mail-Funktionen aus und Nummer nicht bei WhatsApp (Festnetz kann keine SMS).
    // Erst-SMS (Ole, 25.11.2026, Auswertung Lohmann): auch ohne gültige E-Mail-Adresse geht bei „kein WhatsApp“ die SMS
    // statt gar nichts (bisher Abbruch „keine_adresse“, der Lead bekam keine Nachricht).
    const ohneAdresse = !EMAIL_RE.test(lead.email?.trim() ?? "");
    const nurSms = ausloeser === "kein_whatsapp" && (!!lead.customer.mailFeaturesOff || ohneAdresse);
    if (!nurSms && ohneAdresse) return { ergebnis: "nicht_moeglich", grund: "keine_adresse" };
    if (!istOffen(lead.status)) return { ergebnis: "nicht_moeglich", grund: "status" };
    // Rechtsgrundlage wie beim WhatsApp-Erstkontakt (lib/lead-manual.ts startLeadChat): nur eigene Anfrage des Leads
    // (Formular, Meta, Empfehlung); von Hand angelegte Kontakte nicht. Bei „kein WhatsApp“ lief das Erstanschreiben schon.
    if (ausloeser !== "kein_whatsapp" && !(lead.airtableId || lead.externalId || lead.formData)) return { ergebnis: "nicht_moeglich", grund: "keine_anfrage" };
    const c = lead.customer;
    // Pay-per-Lead (Ole, 18.11.2026): Leads der PPL-Kunden kontaktieren wir nie (weder Mail noch SMS)
    if (istNurPayPerLead(c)) return { ergebnis: "nicht_moeglich", grund: "pay_per_lead" };
    // Produkt ohne automatische Nachrichten (Ole, 20.11.2026: PKV-Tarifoptimierung, lib/lead-kontakt-sperre.ts)
    if (ohneAutoNachrichten(lead.source)) return { ergebnis: "nicht_moeglich", grund: "produkt" };
    if (c.dormantSince || c.dataDeletedAt) return { ergebnis: "nicht_moeglich", grund: "ruhend" };
    if (c.mailFeaturesOff && !nurSms) return { ergebnis: "nicht_moeglich", grund: "mail_aus" };
    if (nurSms && !nurSmsAn()) return { ergebnis: "nicht_moeglich", grund: c.mailFeaturesOff ? "mail_aus" : "keine_adresse" };
    if (!c.agentConfig?.active || !c.agentConfig.outreachEnabled) return { ergebnis: "nicht_moeglich", grund: "assistent_aus" };
    const termin = await prisma.appointment.count({ where: { leadId, status: "booked", startsAt: { gt: now } } });
    if (termin) return { ergebnis: "nicht_moeglich", grund: "termin" };
    if (await gesperrt(lead.customerId, lead.email, lead.phone)) return { ergebnis: "nicht_moeglich", grund: "gesperrt" };
    if (nurSms) {
      if (!lead.phone || !(await istMobil(lead.phone))) return { ergebnis: "nicht_moeglich", grund: "keine_handynummer" };
      if (await nummerAbgemeldet(lead.customerId, lead.phone)) return { ergebnis: "nicht_moeglich", grund: "gesperrt" };
      const { smsAktiv } = await import("@/lib/sms/seven");
      if (!smsAktiv()) return { ergebnis: "nicht_moeglich", grund: "sms_aus" };
    }

    let id: string;
    try {
      id = (await prisma.leadMailStrecke.create({ data: { customerId: lead.customerId, leadId, ausloeser, createdAt: now, ...(nurSms ? { nurSms: true, schritt: "sms" } : {}) }, select: { id: true } })).id;
    } catch (e) {
      if (istEindeutigFehler(e)) return { ergebnis: "schon" };
      throw e;
    }
    if (nurSms) {
      const gz = await geschaeftszeitenFuer(lead.customerId);
      await logLeadHistory(
        leadId,
        "status",
        `SMS-Strecke gestartet (Nummer nicht bei WhatsApp, ${c.mailFeaturesOff ? "E-Mail-Funktionen aus" : "keine E-Mail-Adresse"}): bis zu 2 SMS mit Terminlink und Ihrer Nummer für den Rückruf, nur zu Geschäftszeiten (${geschaeftszeitText(gz)}).`,
        { customerId: lead.customerId, userId: null },
      ).catch(() => null);
      // Sofort, wenn Geschäftszeit ist; sonst zum nächsten Fenster per Cron
      const r = await sendeStreckenSms(id, "erst", now);
      return { ergebnis: "gestartet", kanal: "sms", gesendet: r === "sent", ...(r === "sent" ? {} : { grund: r }) };
    }
    await logLeadHistory(leadId, "status", `E-Mail-Strecke gestartet (${(await import("@/lib/mail-strecke/texte")).AUSLOESER_LABEL[ausloeser]}): erste E-Mail mit Terminvorschlägen an den Lead.`, { customerId: lead.customerId, userId: null }).catch(() => null);
    const r = await sendeStreckenMail(id, "erst", now);
    // Tag 1: SMS sofort mit (nur Handynummer, nur mit Schalter, nicht in der Ruhezeit; sonst morgens per Cron)
    if (r.sent) await sendeStreckenSms(id, "erst", now).catch(() => null);
    // Erst-SMS (Ole, 25.11.2026): Erstmail bei „kein WhatsApp“ nicht raus (Sperre der Adresse, Fehler beim Versand):
    // weiter als Nur-SMS-Strecke, damit der Lead trotzdem den Terminlink bekommt (nur Handynummer, Schalter STRECKE_NUR_SMS)
    else if (ausloeser === "kein_whatsapp" && !KEIN_SMS_ERSATZ.has(r.reason) && nurSmsAn() && lead.phone && (await istMobil(lead.phone)) && !(await nummerAbgemeldet(lead.customerId, lead.phone))) {
      await prisma.leadMailStrecke.update({ where: { id }, data: { nurSms: true, schritt: "sms" } });
      await logLeadHistory(leadId, "status", "Die E-Mail an den Lead ging nicht raus: stattdessen bis zu 2 SMS mit Terminlink, nur zu Geschäftszeiten.", { customerId: lead.customerId, userId: null }).catch(() => null);
      const sms = await sendeStreckenSms(id, "erst", now);
      return { ergebnis: "gestartet", kanal: "sms", gesendet: sms === "sent", ...(sms === "sent" ? {} : { grund: sms }) };
    }
    return { ergebnis: "gestartet", kanal: "email", gesendet: r.sent, ...(r.sent ? {} : { grund: r.reason }) };
  } catch (err) {
    console.error("[mail-strecke] Start", err instanceof Error ? err.message.slice(0, 160) : err);
    return { ergebnis: "nicht_moeglich", grund: "fehler" };
  }
}

/** Alles für Texte an diesen Lead (Anrede, Vermittler, Formular). */
async function leadKontext(streckeId: string) {
  const s = await prisma.leadMailStrecke.findUnique({
    where: { id: streckeId },
    include: {
      lead: {
        select: {
          id: true,
          customerId: true,
          name: true,
          email: true,
          weitereEmails: true,
          phone: true,
          source: true,
          status: true,
          formData: true,
          needData: true,
          tkvUmfang: true,
          erasedAt: true,
          reached: true,
          waUnavailableAt: true,
          customer: { select: { leadAddress: true, name: true, onboarding: { select: { websiteInfo: true } }, calendarConnection: { select: { status: true, bookingSlug: true } } } },
        },
      },
    },
  });
  if (!s) return null;
  const lead = s.lead;
  const an = asAnsprache(lead.customer.leadAddress);
  const who = await ansprechpartner({ customerId: lead.customerId, leadId: lead.id, phone: lead.phone, name: lead.name });
  const person: VermittlerName = vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.advisor || who.firm });
  const formular = formularAus(lead.formData);
  return { s, lead, an, who, person, formular };
}

type MailErgebnis = { sent: true } | { sent: false; reason: string };

/** Zwei freie Zeiten (ohne die schon angebotenen, wenn möglich). */
async function zweiZeiten(customerId: string, leadId: string, ohne: string[] = []): Promise<string[]> {
  const { zweiTerminvorschlaege } = await import("@/lib/whatsapp/termin-vorschlaege");
  if (ohne.length) {
    const { noch2FreieZeiten } = await import("@/lib/whatsapp/termin-strecke");
    const neu = await noch2FreieZeiten(customerId, leadId, ohne).catch(() => null);
    if (neu) return [...neu];
  }
  const v = await zweiTerminvorschlaege(customerId, leadId);
  return v ? [...v.starts] : [];
}

/** Buchungsseite mit Lead-Kontext („Andere Zeit“). */
export function andereZeitUrl(slug: string | null | undefined, streckeId: string): string | null {
  if (!slug) return null;
  return `${streckenBasis()}/book/${slug}?t=${encodeURIComponent(streckenToken(streckeId))}`;
}

/**
 * Mail der Strecke senden (Erstmail bzw. Takt). Prüft Sperren, reserviert je Lead und Anlass (Idempotenz) und gibt die
 * Reservierung frei, wenn der Versand scheitert. Wirft nicht.
 */
export async function sendeStreckenMail(streckeId: string, art: MailArtStrecke, now = new Date()): Promise<MailErgebnis> {
  const k = await leadKontext(streckeId);
  if (!k) return { sent: false, reason: "nicht_gefunden" };
  const { s, lead, an, who, person, formular } = k;
  const { ladeSperrDaten, sperrGrund } = await import("@/lib/mail/sperren");
  const d = await ladeSperrDaten(lead.id);
  const grund = sperrGrund(d, { vorlage: null, automatisch: true });
  if (grund) {
    await prisma.leadMailStrecke.update({
      where: { id: s.id },
      data: art === "erst" ? { erstmailGrund: grund, ...(grund === "abgemeldet" ? { schritt: "abgemeldet", stopGrund: grund } : {}) } : { schritt: grund === "abgemeldet" ? "abgemeldet" : "gestoppt", stopGrund: grund },
    });
    return { sent: false, reason: grund };
  }

  const anlass = art === "erst" ? "erstmail" : `takt-${art}`;
  let reservierung: string | null = null;
  const tag = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  try {
    reservierung = (
      await prisma.leadMailVersand.create({
        data: { customerId: lead.customerId, leadId: lead.id, vorlage: "mail_strecke", anlass, automatisch: true, tag, tagesSchluessel: art === "erst" ? null : `${lead.id}:${tag}`, createdAt: now },
        select: { id: true },
      })
    ).id;
  } catch (e) {
    if (istEindeutigFehler(e)) return { sent: false, reason: "schon_gesendet" };
    throw e;
  }
  const freigeben = () => (reservierung ? prisma.leadMailVersand.delete({ where: { id: reservierung } }).catch(() => null) : null);

  try {
    const cal = lead.customer.calendarConnection;
    const kalender = cal?.status === "connected";
    const zeiten = art === "schliessen" || !kalender ? [] : await zweiZeiten(lead.customerId, lead.id, art === "erst" ? [] : s.zeiten);
    const frage: Oeffnungsfrage | null = art === "erst" ? oeffnungsfrage(lead.source, formular, an) : null;
    const { leadVersandKontext, sendeLeadMail } = await import("@/lib/mail/lead-versand");
    const kontext = await leadVersandKontext(lead.customerId, { leadId: lead.id, who });
    // Arbeitsannahme 1: Reply-To immer die Antwortadresse, auch mit verbundenem Postfach (nur diese Strecke)
    const { antwortEingangAn, antwortAdresseFuer } = await import("@/lib/mail/antwort-adresse");
    if (antwortEingangAn()) {
      const adr = await antwortAdresseFuer(lead.id, { speichern: true }).catch(() => null);
      if (adr) {
        kontext.postfach = null;
        kontext.antwortAdresse = adr;
      }
    }
    const { leadLegalLinks } = await import("@/components/lead-legal-footer");
    const legal = leadLegalLinks(lead.customer.onboarding?.websiteInfo);
    const { leadAbmeldeUrl } = await import("@/lib/bestand/links");
    const { slotLabel } = await import("@/lib/whatsapp/termin-vorschlaege");
    // Erstinformation als PDF (§ 16 VersVermV) nur an der Erstmail
    let anhaenge: LeadMailAnhang[] = [];
    if (art === "erst") {
      try {
        const { erstinfoBereit, erstinfoDokument } = await import("@/lib/erstinformation");
        if (await erstinfoBereit(lead.customerId)) {
          const doc = await erstinfoDokument({ customerId: lead.customerId });
          if (doc) anhaenge = [{ fileName: doc.fileName, contentType: "application/pdf", data: Buffer.from(doc.bytes) }];
        }
      } catch (err) {
        console.error("[mail-strecke] Erstinformation", err instanceof Error ? err.message : err);
      }
    }
    let nutzen: string | null = null;
    if (art === "nutzen") {
      const { terminNutzenSatz } = await import("@/lib/whatsapp/gespraech");
      nutzen = terminNutzenSatz({ source: lead.source, formular, angaben: lead.needData, an, person, video: true, tkvUmfang: lead.tkvUmfang });
    }
    const kontakt = who.kontakt;
    const res = await sendeLeadMail(kontext, {
      to: lead.email!.trim(),
      inhalt: (sig) =>
        erstmailInhalt({
          an,
          anrede: mailAnrede(an, kontakt, anredeZeile),
          betreffName: an === "sie" && !kontakt.salutation ? null : anredeName(an, kontakt),
          person,
          source: lead.source,
          formular,
          ausloeser: s.ausloeser as Ausloeser,
          frage,
          antwortLinks: frage ? frage.knoepfe.map((_, i) => streckenUrl(s.id, { a: i })) : [],
          zeiten: zeiten.map((z, i) => ({ label: slotLabel(z), url: streckenUrl(s.id, { z: i }) })),
          andereZeit: kalender ? andereZeitUrl(cal?.bookingSlug, s.id) : null,
          seite: streckenUrl(s.id),
          erstinfoPdf: anhaenge.length > 0,
          erstinfoUrl: kontext.daten.erstinfoUrl,
          impressumUrl: legal.imprint,
          datenschutzUrl: legal.privacy,
          abmeldeUrl: leadAbmeldeUrl(lead.id),
          signatur: sig,
          art,
          nutzen,
        }),
      attachments: anhaenge,
      protokoll: { customerId: lead.customerId, leadId: lead.id, art: art === "erst" ? "mail_strecke" : "mail_strecke_nachfassen", automatisch: true },
      ohneKopie: art !== "erst",
    });
    if (!res.sent) {
      await freigeben();
      if (art === "erst") await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { erstmailGrund: res.reason } });
      return { sent: false, reason: res.reason };
    }
    const mail = await prisma.contactMail.findFirst({ where: { leadId: lead.id }, orderBy: { createdAt: "desc" }, select: { id: true } });
    await prisma.leadMailVersand.update({ where: { id: reservierung! }, data: { status: "gesendet", contactMailId: mail?.id ?? null } }).catch(() => null);
    await prisma.leadMailStrecke.update({
      where: { id: s.id },
      data:
        art === "erst"
          ? { schritt: "erstmail", erstmailAt: now, erstmailGrund: null, zeiten: zeiten.length ? zeiten : s.zeiten }
          : { ...(zeiten.length ? { zeiten } : {}), ...(art === "schliessen" ? { schritt: "fertig" } : {}) },
    });
    // Für die bisherige Anzeige „Eine E-Mail mit Ihrem Terminlink ist raus“ (kein WhatsApp)
    if (art === "erst") await prisma.lead.updateMany({ where: { id: lead.id, waUnavailableMailAt: null, waUnavailableAt: { not: null } }, data: { waUnavailableMailAt: now } });
    return { sent: true };
  } catch (err) {
    await freigeben();
    console.error("[mail-strecke] Versand", art, err instanceof Error ? err.message.slice(0, 160) : err);
    return { sent: false, reason: "fehler" };
  }
}

/**
 * SMS der Strecke (Tag 1 bzw. Tag 4) über seven.io: nur mit Schalter MAIL_STRECKE_SMS, nur an Handynummern, höchstens 2,
 * nicht zwischen 20 und 8 Uhr, nicht nach Abmeldung bzw. Sperre. Nur-SMS-Strecke (nurSms): Schalter STRECKE_NUR_SMS,
 * nur zu Geschäftszeiten des Kunden, Text mit Rückruf zu Geschäftszeiten (lib/mail-strecke/nur-sms.ts). Wirft nicht.
 */
export async function sendeStreckenSms(streckeId: string, art: "erst" | "erinnerung", now = new Date()): Promise<"sent" | "aus" | "keine_nummer" | "ruhezeit" | "max" | "gesperrt" | "fehler"> {
  try {
    const k = await leadKontext(streckeId);
    if (!k) return "fehler";
    const { s, lead, an, who, person } = k;
    const nur = s.nurSms === true;
    if (nur ? !nurSmsAn() : !smsStreckeAn()) return "aus";
    const gz = nur ? await geschaeftszeitenFuer(lead.customerId) : null;
    if (gz ? !imGeschaeftsfenster(now, gz) : !sendeFenster(now)) return "ruhezeit";
    if (s.smsZahl >= MAX_SMS || ["abgemeldet", "gestoppt", "fertig", "gebucht"].includes(s.schritt)) return "max";
    if (!lead.phone || !(await istMobil(lead.phone))) return "keine_nummer";
    if (lead.erasedAt || (await gesperrt(lead.customerId, lead.email, lead.phone))) return "gesperrt";
    const { istAbgemeldet } = await import("@/lib/mail/sperren");
    if (lead.email && (await istAbgemeldet(lead.customerId, lead.email, lead.id))) return "gesperrt";
    if (nur && (await nummerAbgemeldet(lead.customerId, lead.phone))) return "gesperrt";
    const { sendSms, smsAktiv } = await import("@/lib/sms/seven");
    if (!smsAktiv()) return "aus";
    // Je Strecke höchstens MAX_SMS: Zähler vorher belegen (parallele Läufe)
    const claim = await prisma.leadMailStrecke.updateMany({ where: { id: s.id, smsZahl: s.smsZahl }, data: { smsZahl: { increment: 1 }, smsAt: now } });
    if (!claim.count) return "max";
    const telefon = (await prisma.erstinformation.findUnique({ where: { customerId: lead.customerId }, select: { telefon: true } }).catch(() => null))?.telefon ?? null;
    const name = an === "sie" && !who.kontakt.salutation ? null : anredeName(an, who.kontakt);
    // Nur SMS: zwei freie Zeiten auf der Antwortseite (Termin mit einem Klick), wenn der Kalender verbunden ist
    if (nur && lead.customer.calendarConnection?.status === "connected") {
      const zeiten = await zweiZeiten(lead.customerId, lead.id, s.zeiten).catch(() => [] as string[]);
      if (zeiten.length) await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { zeiten } }).catch(() => null);
    }
    const text = gz
      ? nurSmsText({ an, anredeName: name, person, source: lead.source, link: streckenUrl(s.id), art, telefon, zeiten: gz })
      : smsText({ an, anredeName: name, person, source: lead.source, link: streckenUrl(s.id), abmelden: `${streckenUrl(s.id)}?ab=1`, art, telefon });
    const r = await sendSms(lead.phone, text, { from: smsAbsenderFuer(who.vermittler.name ?? who.advisor) });
    if (r.status !== "sent" && r.status !== "blocked") {
      await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { smsZahl: { decrement: 1 } } }).catch(() => null);
      return "fehler";
    }
    if (nur && s.smsZahl + 1 >= MAX_SMS) await prisma.leadMailStrecke.updateMany({ where: { id: s.id, schritt: "sms" }, data: { schritt: "fertig" } }).catch(() => null);
    await logLeadHistory(
      lead.id,
      "status",
      nur ? `SMS an den Lead (${art === "erst" ? "erste Nachricht" : "Erinnerung"}): ${smsFuerVerlauf(text)}` : `SMS an den Lead (${art === "erst" ? "erste Nachricht" : "Erinnerung"}) mit Link zur Terminwahl.`,
      { customerId: lead.customerId, userId: null },
    ).catch(() => null);
    return "sent";
  } catch (err) {
    console.error("[mail-strecke] SMS", err instanceof Error ? err.message.slice(0, 160) : err);
    return "fehler";
  }
}

/** Reaktion des Leads vermerken (stoppt das Nachfassen). */
export async function merkeReaktion(streckeId: string, now = new Date()): Promise<void> {
  await prisma.leadMailStrecke.updateMany({ where: { id: streckeId, reaktionAt: null }, data: { reaktionAt: now } });
}

/** Grund, warum das Nachfassen jetzt stoppt (null = weiter). */
async function stoppGrund(
  s: { id: string; leadId: string; reaktionAt: Date | null; appointmentId: string | null; erstmailAt: Date | null; schritt: string; nurSms?: boolean; createdAt?: Date },
  now: Date,
): Promise<string | null> {
  if (s.reaktionAt) return "reaktion";
  if (s.appointmentId) return "gebucht";
  // Antworten zählen ab der Erstmail bzw. (nur SMS) ab dem Start
  const seit = s.erstmailAt ?? (s.nurSms ? (s.createdAt ?? null) : null);
  const lead = await prisma.lead.findUnique({ where: { id: s.leadId }, select: { status: true, reached: true, erasedAt: true, customerId: true, email: true, phone: true, source: true } });
  if (!lead || lead.erasedAt) return "geloescht";
  if (ohneAutoNachrichten(lead.source)) return "produkt";
  if (await prisma.customer.count({ where: { id: lead.customerId, ...NUR_PPL_WHERE } })) return "pay_per_lead";
  if (!istOffen(lead.status)) return "status";
  if (lead.reached) return "anruf_erreicht";
  if (await prisma.appointment.count({ where: { leadId: s.leadId, status: "booked", startsAt: { gt: now } } })) return "gebucht";
  const { hatMailAntwort } = await import("@/lib/mail/kontakt-mail");
  if (s.erstmailAt && (await hatMailAntwort(s.leadId, s.erstmailAt))) return "mail_antwort";
  if (seit && (await prisma.message.count({ where: { direction: "inbound", createdAt: { gt: seit }, conversation: { leadId: s.leadId } } }))) return "whatsapp_antwort";
  if (await gesperrt(lead.customerId, lead.email, lead.phone)) return "gesperrt";
  if (s.nurSms) {
    // Nur SMS: auch Abmeldung der Nummer, ruhender Kunde und ausgeschalteter Assistent stoppen
    if (lead.phone && (await nummerAbgemeldet(lead.customerId, lead.phone))) return "gesperrt";
    const c = await prisma.customer.findUnique({ where: { id: lead.customerId }, select: { dormantSince: true, dataDeletedAt: true, agentConfig: { select: { active: true, outreachEnabled: true } } } });
    if (!c || c.dormantSince || c.dataDeletedAt) return "ruhend";
    if (!c.agentConfig?.active || !c.agentConfig.outreachEnabled) return "assistent_aus";
  }
  return null;
}

export type CronErgebnis = { gestartet: number; kandidaten: number; mails: number; sms: number; gestoppt: number; einladungen: number; fehler: string[] };

/** Minuten-Cron: Auslöser finden und starten, Takt abarbeiten, ausstehende Einladungen nachholen. */
export async function runMailStrecke(now = new Date()): Promise<CronErgebnis> {
  const out: CronErgebnis = { gestartet: 0, kandidaten: 0, mails: 0, sms: 0, gestoppt: 0, einladungen: 0, fehler: [] };
  if (!streckeAn()) return out;
  // 1. Auslöser (E0): neue Leads ohne Nummer, ohne Einwilligung in WhatsApp oder mit Festnetznummer
  const basis = {
    erasedAt: null,
    email: { not: null },
    mailStrecke: { is: null },
    OR: [{ status: null }, { status: "" }, { status: "Neuer Lead" }],
    // Pay-per-Lead-Kunden nie (Ole, 18.11.2026): deren Leads kontaktieren wir nicht
    customer: { dormantSince: null, dataDeletedAt: null, mailFeaturesOff: false, agentConfig: { is: { active: true, outreachEnabled: true } }, NOT: NUR_PPL_WHERE },
  };
  const [ohne, mitNummer] = await Promise.all([
    prisma.lead.findMany({
      where: { ...basis, createdAt: { gte: new Date(now.getTime() - 48 * 3600_000) }, AND: [{ OR: [{ phone: null }, { phone: "" }, { waConsent: "nein" }] }] },
      select: { id: true, phone: true, waConsent: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    }),
    prisma.lead.findMany({
      where: { ...basis, createdAt: { gte: new Date(now.getTime() - 6 * 3600_000) }, phone: { not: null }, waUnavailableAt: null, AND: [{ OR: [{ waConsent: null }, { waConsent: { not: "nein" } }] }] },
      select: { id: true, phone: true },
      orderBy: { createdAt: "asc" },
      take: 300,
    }),
  ]);
  const kandidaten: { id: string; ausloeser: Ausloeser }[] = ohne.map((l) => ({ id: l.id, ausloeser: !l.phone?.trim() ? "keine_nummer" : "keine_einwilligung" }));
  for (const l of mitNummer) if (await istFestnetz(l.phone)) kandidaten.push({ id: l.id, ausloeser: "festnetz" });
  // 1b. Erst-SMS nachholen (Ole, 25.11.2026, Auswertung Lohmann): Lead seit höchstens 48 Stunden „kein WhatsApp“
  //     (Meta 131026), Handynummer, aber keine Strecke (Start im Status-Webhook ausgefallen oder verpasst). Gleiche
  //     Prüfungen wie beim Start (starteMailStrecke: offen, kein Termin, Sperren, Pay-per-Lead, Assistent an).
  const ohneStart = await prisma.lead.findMany({
    where: {
      erasedAt: null,
      mailStrecke: { is: null },
      phone: { not: null },
      waUnavailableAt: { gte: new Date(now.getTime() - 48 * 3600_000), lte: new Date(now.getTime() - 60_000) },
      OR: [{ status: null }, { status: { in: ["", "Neuer Lead", "Nicht erreicht", "Im Gespräch"] } }],
      appointments: { none: { status: "booked", startsAt: { gt: now } } },
      customer: { dormantSince: null, dataDeletedAt: null, agentConfig: { is: { active: true, outreachEnabled: true } }, NOT: NUR_PPL_WHERE },
    },
    select: { id: true, phone: true },
    orderBy: { waUnavailableAt: "asc" },
    take: 50,
  });
  for (const l of ohneStart) if (!(await istFestnetz(l.phone)) && (await istMobil(l.phone))) kandidaten.push({ id: l.id, ausloeser: "kein_whatsapp" });
  out.kandidaten = kandidaten.length;
  for (const c of kandidaten) {
    const r = await starteMailStrecke(c.id, c.ausloeser, { now });
    if (r.ergebnis === "gestartet") out.gestartet++;
  }

  // 2. Takt (Tag 1 SMS nachholen, Tag 2 bis 10)
  const laufend = await prisma.leadMailStrecke.findMany({
    where: { schritt: "erstmail", erstmailAt: { not: null, gt: new Date(now.getTime() - 14 * 86_400_000) } },
    select: { id: true, leadId: true, reaktionAt: true, appointmentId: true, erstmailAt: true, schritt: true, stufe: true, smsZahl: true },
    take: 500,
  });
  for (const s of laufend) {
    try {
      const stopp = await stoppGrund(s, now);
      if (stopp) {
        await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { schritt: stopp === "gebucht" ? "gebucht" : stopp === "gesperrt" ? "abgemeldet" : "gestoppt", stopGrund: stopp } });
        out.gestoppt++;
        continue;
      }
      if (!sendeFenster(now)) continue;
      // Tag 1: SMS, falls die Erstmail in der Ruhezeit kam (nur am selben bzw. nächsten Tag vor dem Takt)
      if (s.smsZahl === 0 && s.stufe === 0 && now.getTime() - s.erstmailAt!.getTime() < 20 * 3600_000) {
        if ((await sendeStreckenSms(s.id, "erst", now)) === "sent") out.sms++;
      }
      const schritt = faelligerSchritt({ start: s.erstmailAt!, stufe: s.stufe, now });
      if (!schritt) continue;
      // Schritt belegen (parallele Läufe), dann senden
      const claim = await prisma.leadMailStrecke.updateMany({ where: { id: s.id, stufe: s.stufe }, data: { stufe: { increment: 1 }, stufeAt: now } });
      if (!claim.count) continue;
      if (schritt.kanal === "sms") {
        if ((await sendeStreckenSms(s.id, "erinnerung", now)) === "sent") out.sms++;
      } else {
        const r = await sendeStreckenMail(s.id, schritt.art as MailArtStrecke, now);
        if (r.sent) out.mails++;
        else if (r.reason === "fehler" || r.reason === "not_configured") {
          // Nicht verloren: Schritt erneut versuchen
          await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { stufe: s.stufe } });
        }
      }
      if (s.stufe + 1 >= TAKT.length) await prisma.leadMailStrecke.updateMany({ where: { id: s.id, schritt: "erstmail" }, data: { schritt: "fertig" } });
    } catch (err) {
      out.fehler.push(`${s.id}: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
    }
  }

  // 2b. Nur SMS (E-Mail-Funktionen aus): erste SMS zur nächsten Geschäftszeit, zweite nach 2 Geschäftstagen
  out.sms += await nurSmsTakt(now, out);

  // 3. Einladung ohne Antwort nachholen (Termin über die Seite, ausstehend bis Adresse und Komplettcheck feststehen)
  out.einladungen = await einladungenNachholen(now);
  return out;
}

/** Erste SMS höchstens so lange nach dem Start nachholen (Wochenende mit Feiertagen). */
const NUR_SMS_ERSTE_BIS_MS = 5 * 86_400_000;

/**
 * Takt der Nur-SMS-Strecke (Cron): Stopp bei Reaktion, Buchung, Abmeldung, Status usw. (stoppGrund); sonst zur
 * Geschäftszeit die erste SMS (falls der Start außerhalb lag) bzw. die zweite ab dem zweiten Geschäftstag. Liefert die
 * Zahl gesendeter SMS.
 */
export async function nurSmsTakt(now: Date, out?: Pick<CronErgebnis, "gestoppt" | "fehler">): Promise<number> {
  const rows = await prisma.leadMailStrecke.findMany({
    where: { nurSms: true, schritt: "sms", createdAt: { gt: new Date(now.getTime() - 14 * 86_400_000) } },
    select: { id: true, leadId: true, customerId: true, reaktionAt: true, appointmentId: true, erstmailAt: true, schritt: true, smsZahl: true, smsAt: true, createdAt: true, nurSms: true },
    take: 500,
  });
  const zeiten = new Map<string, Geschaeftszeiten>();
  let n = 0;
  for (const s of rows) {
    try {
      const stopp = await stoppGrund(s, now);
      if (stopp) {
        await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { schritt: stopp === "gebucht" ? "gebucht" : stopp === "gesperrt" ? "abgemeldet" : "gestoppt", stopGrund: stopp } });
        if (out) out.gestoppt++;
        continue;
      }
      if (s.smsZahl >= MAX_SMS) {
        await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { schritt: "fertig" } });
        continue;
      }
      let gz = zeiten.get(s.customerId);
      if (!gz) zeiten.set(s.customerId, (gz = await geschaeftszeitenFuer(s.customerId)));
      if (!imGeschaeftsfenster(now, gz)) continue;
      if (s.smsZahl === 0) {
        if (now.getTime() - s.createdAt.getTime() > NUR_SMS_ERSTE_BIS_MS) {
          await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { schritt: "gestoppt", stopGrund: "abgelaufen" } });
          continue;
        }
        if ((await sendeStreckenSms(s.id, "erst", now)) === "sent") n++;
      } else if (s.smsAt && zweiteSmsFaellig(s.smsAt, now, gz)) {
        if ((await sendeStreckenSms(s.id, "erinnerung", now)) === "sent") n++;
      }
    } catch (err) {
      out?.fehler.push(`${s.id}: ${err instanceof Error ? err.message.slice(0, 120) : String(err)}`);
    }
  }
  return n;
}

/** Ausstehende Einladungen der Strecke: 15 Min. nach der letzten Antwort (kurzfristig 5), spätestens 60 Min. vorher. */
export async function einladungenNachholen(now = new Date()): Promise<number> {
  const rows = await prisma.leadMailStrecke.findMany({
    where: { appointmentId: { not: null }, schritt: "gebucht" },
    select: { appointmentId: true, antwortAt: true, gebuchtAt: true },
    take: 200,
  });
  if (!rows.length) return 0;
  const { einladungFaellig, einladungSenden } = await import("@/lib/calendar/einladung");
  let n = 0;
  for (const r of rows) {
    const t = await prisma.appointment.findUnique({ where: { id: r.appointmentId! }, select: { id: true, status: true, startsAt: true, einladungAt: true, einladungAusstehend: true } });
    if (!t || t.status !== "booked" || t.einladungAt || !t.einladungAusstehend || t.startsAt.getTime() <= now.getTime()) continue;
    if (!einladungFaellig({ startsAt: t.startsAt, gebuchtAt: t.einladungAusstehend, letzteAntwort: r.antwortAt, now })) continue;
    if ((await einladungSenden(t.id, now)) === "gesendet") n++;
  }
  return n;
}

// ─── Antwortseite (E3/E4) ────────────────────────────────────────────────────────────────

export type SeitenStand = {
  streckeId: string;
  token: string;
  an: Ansprache;
  advisor: string;
  person: VermittlerName;
  customerId: string;
  leadName: string | null;
  frage: Oeffnungsfrage | null;
  antwort: string | null;
  zeiten: string[];
  kalender: boolean;
  andereZeitUrl: string | null;
  durationMin: number;
  abgemeldet: boolean;
  hatTelefon: boolean;
  /** Telefon als Terminart freigegeben (AgentConfig.allowPhone); sonst nur Video (Ole, 26.11.2026) */
  telefonErlaubt: boolean;
  termin: { id: string; startsAt: Date; mode: string; meetUrl: string | null; manageToken: string | null; komplettcheck: boolean | null; einladungAt: Date | null } | null;
  /** Nächster Schritt nach der Buchung */
  nach: "komplettcheck" | "angaben" | "adresse" | "fertig" | null;
  folgefragen: { key: string; text: string; knoepfe?: string[] }[];
  bereitlegen: string[];
  email: string | null;
  familie: boolean;
  komplettcheckText: string;
};

type Antworten = { oeffnung?: { frage: string; antwort: string; feld: string; at: string }; angabenAt?: string; adresseAt?: string; komplettcheckAt?: string };
const antwortenAus = (raw: unknown): Antworten => (raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Antworten) : {});

/** Stand für die Seite (nur lesen, keine Änderung, auch nicht beim ersten Aufruf). */
export async function seitenStand(streckeId: string, now = new Date()): Promise<SeitenStand | null> {
  const k = await leadKontext(streckeId);
  if (!k || k.lead.erasedAt) return null;
  const { s, lead, an, person, formular } = k;
  const antworten = antwortenAus(s.antworten);
  const cal = lead.customer.calendarConnection;
  const kalender = cal?.status === "connected";
  const { bookingDurationMin } = await import("@/lib/calendar");
  const durationMin = kalender ? await bookingDurationMin(lead.customerId, lead.id).catch(() => 30) : 30;
  const appt = s.appointmentId
    ? await prisma.appointment.findUnique({ where: { id: s.appointmentId }, select: { id: true, status: true, startsAt: true, mode: true, meetUrl: true, manageToken: true, komplettcheck: true, einladungAt: true } })
    : await prisma.appointment.findFirst({
        where: { leadId: lead.id, status: "booked", startsAt: { gt: now } },
        orderBy: { startsAt: "asc" },
        select: { id: true, status: true, startsAt: true, mode: true, meetUrl: true, manageToken: true, komplettcheck: true, einladungAt: true },
      });
  const termin = appt && appt.status === "booked" ? appt : null;
  const { folgefragen, spartenDesLeads } = await import("@/lib/preise/rechner-angaben");
  const { istFamilie, bereitlegenFuerLead, komplettcheckFrage } = await import("@/lib/whatsapp/gespraech");
  const quelle = { formular, angaben: lead.needData };
  const ff = antworten.angabenAt ? [] : folgefragen(spartenDesLeads(lead.source, quelle), quelle).slice(0, 5);
  const familie = istFamilie(formular, lead.needData);
  const nach: SeitenStand["nach"] = !termin
    ? null
    : termin.komplettcheck == null
      ? "komplettcheck"
      : ff.length
        ? "angaben"
        : !antworten.adresseAt && !termin.einladungAt
          ? "adresse"
          : "fertig";
  const { istAbgemeldet } = await import("@/lib/mail/sperren");
  return {
    streckeId: s.id,
    token: streckenToken(s.id),
    an,
    advisor: lead.customer.name,
    person,
    customerId: lead.customerId,
    leadName: lead.name,
    frage: oeffnungsfrage(lead.source, formular, an),
    antwort: antworten.oeffnung?.antwort ?? null,
    zeiten: s.zeiten.filter((z) => new Date(z).getTime() > now.getTime() + 30 * 60_000),
    kalender,
    andereZeitUrl: kalender ? andereZeitUrl(cal?.bookingSlug, s.id) : null,
    durationMin,
    abgemeldet: s.schritt === "abgemeldet" || (!!lead.email && (await istAbgemeldet(lead.customerId, lead.email, lead.id))),
    hatTelefon: !!lead.phone,
    telefonErlaubt: (await import("@/lib/termin-formate-server").then((m) => m.loadTerminFormate(lead.customerId)).catch(() => ({ telefon: false }))).telefon,
    termin: termin ? { id: termin.id, startsAt: termin.startsAt, mode: termin.mode, meetUrl: termin.meetUrl, manageToken: termin.manageToken, komplettcheck: termin.komplettcheck, einladungAt: termin.einladungAt } : null,
    nach,
    folgefragen: ff.map((f) => ({ key: f.key, text: an === "du" ? f.du : f.sie, ...(f.knoepfe ? { knoepfe: f.knoepfe } : {}) })),
    bereitlegen: termin ? bereitlegenFuerLead({ source: lead.source, formular, angaben: lead.needData, an, komplettcheck: termin.komplettcheck === true }) : [],
    email: lead.email,
    familie,
    // Splittest komplettcheck_text (lib/experimente.ts): hier nur lesen (GET); zugeteilt wird beim Buchen (terminFestmachen)
    komplettcheckText: komplettcheckFrage(an, person, familie, nach === "komplettcheck" ? await import("@/lib/experimente").then((m) => m.variante("komplettcheck_text", lead.id, { merken: false })).catch(() => "a" as const) : "b"),
  };
}

/** Seite wurde im Browser geöffnet (Aufruf aus dem Browser, nicht beim Abruf): zählt als Reaktion. */
export async function seiteGeoeffnet(streckeId: string, now = new Date()): Promise<void> {
  await merkeReaktion(streckeId, now);
}

/** Antwort auf die Öffnungsfrage speichern (POST). */
export async function antwortSpeichern(streckeId: string, index: number, now = new Date()): Promise<{ ok: boolean }> {
  const k = await leadKontext(streckeId);
  if (!k || k.lead.erasedAt) return { ok: false };
  const { s, lead, an, formular } = k;
  const frage = oeffnungsfrage(lead.source, formular, an);
  const antwort = frage.knoepfe[index];
  if (!antwort) return { ok: false };
  const antworten = antwortenAus(s.antworten);
  if (antworten.oeffnung?.antwort === antwort) return { ok: true };
  const { mergeQualificationData } = await import("@/lib/whatsapp/qualification");
  const { neutralZahnAngaben } = await import("@/lib/whatsapp/erstanschreiben");
  const neu = neutralZahnAngaben({ [frage.feld]: antwort }) as Record<string, string>;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { needData: mergeQualificationData(lead.needData, neu) ?? undefined } }),
    prisma.leadMailStrecke.update({
      where: { id: s.id },
      data: { antworten: { ...antworten, oeffnung: { frage: frage.text, antwort, feld: frage.feld, at: now.toISOString() } }, antwortAt: now, reaktionAt: s.reaktionAt ?? now },
    }),
  ]);
  if (!antworten.oeffnung) {
    await logLeadHistory(lead.id, "status", `Antwort per E-Mail-Strecke: „${frage.text}“ ${antwort}.`, { customerId: lead.customerId, userId: null }).catch(() => null);
    const { recordLeadProgress } = await import("@/lib/lead-progress");
    await recordLeadProgress(lead.id, "replied");
  }
  return { ok: true };
}

export type BuchErgebnis = { ok: true; appointmentId: string; schon?: boolean } | { ok: false; grund: "vergeben" | "zeit" | "laeuft" | "telefon" | "fehler" | "nicht_gefunden" };

/**
 * Termin festmachen (POST nach Klick auf „Termin festmachen“): Zeit muss angeboten sein, wird beim Klick neu geprüft
 * (bookAppointment → findFreeCalendar), Kalender sofort geblockt. Doppelklick bzw. zweiter Tab: genau ein Termin.
 * Vergeben: zwei neue Zeiten an der Strecke, Ergebnis „vergeben“.
 */
export async function terminFestmachen(streckeId: string, o: { start: string; mode: "video" | "phone"; phone?: string | null }, now = new Date()): Promise<BuchErgebnis> {
  const k = await leadKontext(streckeId);
  if (!k || k.lead.erasedAt) return { ok: false, grund: "nicht_gefunden" };
  const { s, lead } = k;
  // Schon gebucht (auch über einen anderen Weg): kein zweiter Termin
  const vorhanden = await prisma.appointment.findFirst({ where: { leadId: lead.id, status: "booked", startsAt: { gt: now } }, select: { id: true } });
  if (vorhanden) {
    if (!s.appointmentId) await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { appointmentId: vorhanden.id, schritt: "gebucht", reaktionAt: s.reaktionAt ?? now } });
    return { ok: true, appointmentId: vorhanden.id, schon: true };
  }
  const start = new Date(o.start);
  if (Number.isNaN(start.getTime()) || !s.zeiten.includes(start.toISOString())) return { ok: false, grund: "zeit" };
  // Video ist Standard; Telefon nur, wenn der Vermittler es freigegeben hat (Ole, 26.11.2026)
  const { loadTerminFormate } = await import("@/lib/termin-formate-server");
  const { buchungsModus } = await import("@/lib/termin-formate");
  o = { ...o, mode: buchungsModus(o.mode, await loadTerminFormate(lead.customerId).catch(() => ({ telefon: false, vorOrt: false }))) === "phone" ? "phone" : "video" };
  // Telefon nur mit Nummer (vorhanden oder neu eingegeben)
  const { normalizePhone } = await import("@/lib/whatsapp/phone");
  const neueNummer = o.phone ? normalizePhone(o.phone) : null;
  if (o.mode === "phone" && !lead.phone && !neueNummer) return { ok: false, grund: "telefon" };
  // Sperre gegen Doppelklick: nur ein Lauf zur Zeit (nach 2 Min. frei, falls ein Lauf abgebrochen ist)
  const claim = await prisma.leadMailStrecke.updateMany({
    where: { id: s.id, appointmentId: null, OR: [{ buchungAt: null }, { buchungAt: { lt: new Date(now.getTime() - 120_000) } }] },
    data: { buchungAt: now },
  });
  if (!claim.count) {
    const neu = await prisma.leadMailStrecke.findUnique({ where: { id: s.id }, select: { appointmentId: true } });
    return neu?.appointmentId ? { ok: true, appointmentId: neu.appointmentId, schon: true } : { ok: false, grund: "laeuft" };
  }
  try {
    if (neueNummer && !lead.phone) await prisma.lead.update({ where: { id: lead.id }, data: { phone: neueNummer } });
    // Andere Nummer und die bisherige hat kein WhatsApp (Ole, 23.11.2026): neue Nummer als WhatsApp-Kontakt
    // (übernommen wird erst nach erfolgreicher Buchung, lib/whatsapp/buchungsnummer.ts)
    const bn = await import("@/lib/whatsapp/buchungsnummer");
    const uebernehmen = !!neueNummer && !!lead.phone && bn.buchungsnummerUebernehmen({ formPhone: lead.phone, neu: neueNummer, waUnavailableAt: lead.waUnavailableAt });
    const phone = uebernehmen ? neueNummer : (lead.phone ?? neueNummer);
    const conv = phone ? await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: lead.customerId, contactPhone: phone } }, select: { id: true } }) : null;
    const { bookAppointment } = await import("@/lib/calendar");
    const { buildEventDescription, eventSummary } = await import("@/lib/whatsapp/event-text");
    const name = lead.name?.trim() || "Lead";
    const res = await bookAppointment({
      customerId: lead.customerId,
      leadId: lead.id,
      conversationId: conv?.id ?? null,
      start: start.toISOString(),
      mode: o.mode,
      summary: eventSummary(o.mode, name, lead.source),
      description: buildEventDescription({ name, phone: phone ?? "", email: lead.email, product: lead.source, mode: o.mode, summary: null, conversationId: conv?.id ?? null, bookedVia: "mail_strecke" }),
      leadName: name,
      leadPhone: phone,
      // Einladung erst, wenn Adresse und Komplettcheck feststehen (lib/calendar/einladung.ts)
      notifyLead: false,
      bookedVia: "mail_strecke",
    });
    const u = uebernehmen ? await bn.uebernimmBuchungsnummer(lead.id, neueNummer!, { now }).catch(() => null) : null;
    await prisma.appointment.update({ where: { id: res.appointmentId }, data: { einladungAusstehend: now, ...(u?.ok && !conv ? { conversationId: u.conversationId } : {}) } });
    await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { appointmentId: res.appointmentId, gebuchtAt: now, buchungAt: null, schritt: "gebucht", antwortAt: now, reaktionAt: s.reaktionAt ?? now } });
    const { slotLabel } = await import("@/lib/whatsapp/termin-vorschlaege");
    await logLeadHistory(lead.id, "status", `Termin über die E-Mail-Strecke gebucht: ${slotLabel(res.start)}, ${o.mode === "video" ? "Video" : "Telefon"}.`, { customerId: lead.customerId, userId: null }).catch(() => null);
    // Als Nächstes zeigt die Seite die Komplettcheck-Frage: Zuteilung im Splittest jetzt (Klick, kein Link-Scanner)
    await import("@/lib/experimente").then((m) => m.variante("komplettcheck_text", lead.id)).catch(() => null);
    return { ok: true, appointmentId: res.appointmentId };
  } catch (err) {
    const { SlotBusyError } = await import("@/lib/calendar");
    if (err instanceof SlotBusyError) {
      const neu = await zweiZeiten(lead.customerId, lead.id, [start.toISOString(), ...s.zeiten]).catch(() => []);
      await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { buchungAt: null, zeiten: neu } });
      return { ok: false, grund: "vergeben" };
    }
    await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { buchungAt: null } }).catch(() => null);
    console.error("[mail-strecke] Buchung", err instanceof Error ? err.message.slice(0, 160) : err);
    return { ok: false, grund: "fehler" };
  }
}

/** Einladen, sobald Adresse und Komplettcheck feststehen (genau einmal, lib/calendar/einladung.ts). */
async function einladungPruefen(streckeId: string, now: Date): Promise<void> {
  const s = await prisma.leadMailStrecke.findUnique({ where: { id: streckeId }, select: { appointmentId: true, antworten: true } });
  if (!s?.appointmentId) return;
  const t = await prisma.appointment.findUnique({ where: { id: s.appointmentId }, select: { komplettcheck: true } });
  const { einladungWennFertig } = await import("@/lib/calendar/einladung");
  await einladungWennFertig(s.appointmentId, { adresseFest: !!antwortenAus(s.antworten).adresseAt, komplettFest: t?.komplettcheck != null }, now);
}

/** Komplettcheck nach der Buchung (Ja: Termin verlängern, wenn frei; sonst Hinweis an den Vermittler). */
export async function komplettcheckSetzen(streckeId: string, ja: boolean, now = new Date()): Promise<{ ok: boolean }> {
  const s = await prisma.leadMailStrecke.findUnique({ where: { id: streckeId }, select: { id: true, appointmentId: true, antworten: true, leadId: true, customerId: true } });
  if (!s?.appointmentId) return { ok: false };
  const r = await prisma.appointment.updateMany({ where: { id: s.appointmentId, komplettcheck: null, status: "booked" }, data: { komplettcheck: ja } });
  await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { antwortAt: now, antworten: { ...antwortenAus(s.antworten), komplettcheckAt: now.toISOString() } } });
  if (r.count) {
    await logLeadHistory(s.leadId, "status", ja ? "Komplettcheck gewünscht (über die E-Mail-Strecke)." : "Kein Komplettcheck gewünscht (über die E-Mail-Strecke).", { customerId: s.customerId, userId: null }).catch(() => null);
    if (ja) await import("@/lib/komplettcheck-dauer").then((m) => m.komplettcheckVerlaengern(s.appointmentId!, { now })).catch(() => null);
    if (ja) await import("@/lib/experimente").then((m) => m.zielErreicht([s.leadId], "komplettcheck_ja")).catch(() => null);
  }
  await einladungPruefen(s.id, now);
  return { ok: true };
}

/** Angaben fürs Angebot (nur die gefragten, leere übersprungen) in Lead.needData. */
export async function angabenSpeichern(streckeId: string, werte: Record<string, string>, now = new Date()): Promise<{ ok: boolean }> {
  const k = await leadKontext(streckeId);
  if (!k) return { ok: false };
  const { s, lead, formular } = k;
  const { folgefragen, spartenDesLeads } = await import("@/lib/preise/rechner-angaben");
  const quelle = { formular, angaben: lead.needData };
  const ff = folgefragen(spartenDesLeads(lead.source, quelle), quelle).slice(0, 5);
  const neu: Record<string, string> = {};
  for (const f of ff) {
    let v = (werte[f.key] ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
    if (!v) continue;
    // Wohnfläche als Zahl („ca. 75 qm“ → „75 m²“, Spanne → „ca. 70 m²“); Unklares bleibt wie eingegeben
    if (f.key === "wohnflaeche") {
      const { qmText, wohnflaecheLesen } = await import("@/lib/wohnflaeche");
      const r = wohnflaecheLesen(v);
      if (r?.art === "zahl") v = qmText(r.qm);
      else if (r?.art === "spanne") v = `ca. ${qmText(r.qm)}`;
      else if (r?.art === "weiss_nicht") continue;
    }
    neu[f.feld] = neu[f.feld] ? `${neu[f.feld]}; ${v}` : v;
  }
  const { mergeQualificationData, cleanQualificationData } = await import("@/lib/whatsapp/qualification");
  const alt = cleanQualificationData(lead.needData) as Record<string, string>;
  const zusammen: Record<string, string> = { ...neu };
  for (const [key, v] of Object.entries(neu)) if (alt[key] && !alt[key].includes(v)) zusammen[key] = `${alt[key]}; ${v}`;
  await prisma.$transaction([
    prisma.lead.update({ where: { id: lead.id }, data: { needData: mergeQualificationData(lead.needData, zusammen) ?? undefined } }),
    prisma.leadMailStrecke.update({ where: { id: s.id }, data: { antwortAt: now, antworten: { ...antwortenAus(s.antworten), angabenAt: now.toISOString() } } }),
  ]);
  if (Object.keys(neu).length) await logLeadHistory(lead.id, "status", `Angaben fürs Angebot über die E-Mail-Strecke: ${Object.values(neu).join(", ").slice(0, 300)}.`, { customerId: lead.customerId, userId: null }).catch(() => null);
  return { ok: true };
}

/** Adresse für die Einladung bestätigen bzw. ändern; danach geht die Einladung (genau einmal). */
export async function adresseSetzen(streckeId: string, o: { email?: string | null }, now = new Date()): Promise<{ ok: boolean; fehler?: "email" }> {
  const k = await leadKontext(streckeId);
  if (!k) return { ok: false };
  const { s, lead } = k;
  const neu = (o.email ?? "").trim().toLowerCase();
  if (neu) {
    if (!EMAIL_RE.test(neu) || neu.length > 200) return { ok: false, fehler: "email" };
    if (neu !== (lead.email ?? "").trim().toLowerCase()) {
      const { mitNeuerEmail } = await import("@/lib/lead-emails");
      const m = mitNeuerEmail({ alt: lead.email, weitere: lead.weitereEmails, neu });
      await prisma.lead.update({ where: { id: lead.id }, data: { email: m.email, weitereEmails: m.weitereEmails } });
      await logLeadHistory(lead.id, "stammdaten", "Neue E-Mail-Adresse über die E-Mail-Strecke angegeben.", { customerId: lead.customerId, userId: null }).catch(() => null);
    }
  }
  await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { antwortAt: now, antworten: { ...antwortenAus(s.antworten), adresseAt: now.toISOString() } } });
  await einladungPruefen(s.id, now);
  return { ok: true };
}

/** Abmelden von der Seite (SMS-Link bzw. Knopf): keine E-Mails und SMS mehr aus der Strecke. */
export async function streckeAbmelden(streckeId: string, now = new Date()): Promise<{ ok: boolean }> {
  const s = await prisma.leadMailStrecke.findUnique({ where: { id: streckeId }, select: { id: true, leadId: true, customerId: true, nurSms: true, schritt: true } });
  if (!s) return { ok: false };
  const { leadAbmelden } = await import("@/lib/bestand/abmelden");
  await leadAbmelden(s.leadId, s.customerId, now);
  if (s.nurSms && s.schritt !== "abgemeldet") await logLeadHistory(s.leadId, "status", "Hat sich über den Link in der SMS abgemeldet: keine weiteren SMS.", { customerId: s.customerId, userId: null }).catch(() => null);
  await prisma.leadMailStrecke.update({ where: { id: s.id }, data: { schritt: "abgemeldet", stopGrund: "abgemeldet", reaktionAt: now } });
  return { ok: true };
}

/** Bereitlegen und Komplettcheck für Termin-Mails ohne Chat (lib/calendar/lead-email.ts). */
export async function vorbereitungOhneChat(leadId: string, appointmentId: string): Promise<{ bereitlegen: string[]; komplettcheck: boolean; familie: boolean } | null> {
  const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { source: true, formData: true, needData: true, customer: { select: { leadAddress: true } } } });
  const t = await prisma.appointment.findUnique({ where: { id: appointmentId }, select: { komplettcheck: true } });
  if (!lead || !t) return null;
  const { bereitlegenFuerLead, istFamilie } = await import("@/lib/whatsapp/gespraech");
  const formular = formularAus(lead.formData);
  const an = asAnsprache(lead.customer.leadAddress);
  return { bereitlegen: bereitlegenFuerLead({ source: lead.source, formular, angaben: lead.needData, an, komplettcheck: t.komplettcheck === true }), komplettcheck: t.komplettcheck === true, familie: istFamilie(formular, lead.needData) };
}
