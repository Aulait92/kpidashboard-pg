// Zentrale Funktion für Vorlagen-Mails an einen Lead (Ole, 17.11.2026, Paket M0, docs/plan-mail-vorlagen.md).
// Ein Weg für jede Vorlage aus lib/mail/vorlagen.ts, automatisch (Auslöser kommen mit M3/M4) oder als Vorschau:
//
//   1. Text: Vorlage des Kunden (MailTemplate mit standardKey), sonst die Standardfassung in seiner Ansprache.
//   2. Platzhalter (lib/mail/platzhalter.ts) mit Lead, Vermittler, Terminlink und Zusatzwerten des Anlasses.
//   3. Rahmen (lib/mail/rahmen.ts): Signatur des Versandwegs, Knöpfe, Abmeldelink nur bei werblichen Vorlagen.
//   4. Sperren (lib/mail/sperren.ts), Stufe je Vorlage (Customer.mailAblauf), Idempotenz je Lead/Vorlage/Anlass und
//      höchstens eine automatische Mail je Lead und Berliner Tag (Reservierung in LeadMailVersand).
//   5. Versand über den Lead-Mail-Baustein (lib/mail/lead-versand.ts: Postfach, sonst Resend mit „Name | Agentur“,
//      Reply-To, Signatur, BCC-Kopie), Eintrag im Verlauf mit der Vorlage als Art.

import { prisma } from "@/lib/prisma";
import { asAnsprache, type Ansprache } from "@/lib/ansprache";
import { ansprechpartner } from "@/lib/lead-anrede";
import { bookingPageUrl } from "@/lib/public-url";
import { leadAbmeldeUrl } from "@/lib/bestand/links";
import { leseMailAblauf, WERBLICH } from "@/lib/mail/ablauf";
import { fuelle, fuelleMitSignatur, werteFuer, type Werte } from "@/lib/mail/platzhalter";
import { mailRahmen, SIGNATUR_MARKE, type MailKnopf } from "@/lib/mail/rahmen";
import { ladeSperrDaten, sperrGrund, type SperrGrund } from "@/lib/mail/sperren";
import { STANDARD_VORLAGEN_JE, type VorlageKey } from "@/lib/mail/vorlagen";
import type { LeadSignatur } from "@/lib/mail/lead-absender";
import { leadVersandKontext, sendeLeadMail, type LeadMailAnhang, type LeadMailInhalt, type LeadVersandKontext } from "@/lib/mail/lead-versand";

export type VorlagenText = { subject: string; body: string; eigene: boolean };

/** Text einer Vorlage: die des Kunden (erste mit diesem Schlüssel), sonst die Standardfassung. */
export async function vorlageFuer(customerId: string, key: VorlageKey, an: Ansprache): Promise<VorlagenText> {
  const own = await prisma.mailTemplate.findFirst({ where: { customerId, standardKey: key }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { subject: true, body: true } });
  if (own && own.subject.trim() && own.body.trim()) return { subject: own.subject, body: own.body, eigene: true };
  const std = STANDARD_VORLAGEN_JE[an].find((v) => v.key === key)!;
  return { subject: std.subject, body: std.body, eigene: false };
}

/**
 * Inhalt aus Vorlage und Werten (rein): Betreff, Text und HTML mit der Signatur des Versandwegs. `abmeldeUrl` nur bei
 * werblichen Vorlagen setzen.
 */
export function vorlagenInhalt(v: { subject: string; body: string }, w: Werte, sig: LeadSignatur, o: { knoepfe?: MailKnopf[]; abmeldeUrl?: string | null } = {}): LeadMailInhalt {
  const werte: Werte = { ...w, signatur: SIGNATUR_MARKE };
  const subject = fuelle(v.subject, werte).replace(/\s+/g, " ").trim();
  const text = fuelleMitSignatur(v.body, werte);
  return { subject, ...mailRahmen({ text, signatur: sig, knoepfe: o.knoepfe, abmeldeUrl: o.abmeldeUrl }) };
}

export type VorlagenMailOpts = {
  /** Anlass für die Idempotenz (z. B. Termin-ID, „anruf-2“); ohne Anlass keine Reservierung */
  anlass?: string | null;
  /** Automatisch ausgelöst (Standard); false = vom Vermittler mit einem Tipp */
  automatisch?: boolean;
  /** Pflicht-Mail (z. B. Terminbestätigung): ohne Stufe, Stopp-Regeln und Tageslimit */
  pflicht?: boolean;
  /** Automatisch, aber vom Vermittler angestoßen (z. B. Erinnerung nach seiner Mail): Stufe „ein Tipp“ genügt */
  freigegeben?: boolean;
  /** Vor den Betreff („Erinnerung: “) */
  betreffVorsatz?: string | null;
  /** Stopp, wenn der Lead seitdem per WhatsApp geantwortet hat */
  antwortSeit?: Date | null;
  /** Zusatzwerte des Anlasses ({termin_datum}, {melde_datum} …) */
  werte?: Partial<Werte>;
  knoepfe?: MailKnopf[];
  anhaenge?: LeadMailAnhang[];
  /** Empfänger; Standard: E-Mail des Leads */
  to?: string | null;
  /** Login, der mit einem Tipp sendet (sein Postfach, Antworten an ihn) */
  userId?: string | null;
  now?: Date;
};

export type VorlagenMailVorbereitung = {
  customerId: string;
  to: string | null;
  an: Ansprache;
  kontext: LeadVersandKontext;
  vorlage: VorlagenText;
  werte: Werte;
  abmeldeUrl: string | null;
  /** Inhalt je Signatur (für sendeLeadMail und die Vorschau) */
  inhalt: (sig: LeadSignatur) => LeadMailInhalt;
};

/** Alles für eine Vorlagen-Mail an diesen Lead zusammenstellen (Vorschau und Versand nutzen dasselbe). */
export async function bereiteVorlagenMail(leadId: string, key: VorlageKey, o: VorlagenMailOpts = {}): Promise<VorlagenMailVorbereitung | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      customerId: true,
      name: true,
      source: true,
      email: true,
      customer: { select: { leadAddress: true, calendarConnection: { select: { status: true, bookingSlug: true } } } },
    },
  });
  if (!lead) return null;
  const an = asAnsprache(lead.customer.leadAddress);
  const now = o.now ?? new Date();
  const [who, vorlage, termin] = await Promise.all([
    ansprechpartner({ customerId: lead.customerId, leadId }),
    vorlageFuer(lead.customerId, key, an),
    prisma.appointment.findFirst({ where: { leadId, status: "booked", startsAt: { gt: now } }, select: { id: true } }),
  ]);
  const kontext = await leadVersandKontext(lead.customerId, { leadId, who, schreiber: o.userId ?? null });
  const cal = lead.customer.calendarConnection;
  // Persönlicher Buchungslink nur ohne anstehenden Termin (sonst entfällt der Satz)
  const terminlink = !termin && cal?.status === "connected" && cal.bookingSlug ? bookingPageUrl(cal.bookingSlug, { lead: leadId }) : null;
  const werte: Werte = {
    ...werteFuer({ name: lead.name, source: lead.source, firstName: who.kontakt.firstName, lastName: who.kontakt.lastName, salutation: who.kontakt.salutation }, kontext.daten.name, {
      ansprache: an,
      terminlink,
      now,
    }),
    ...o.werte,
  };
  const abmeldeUrl = WERBLICH.has(key) ? leadAbmeldeUrl(leadId) : null;
  return {
    customerId: lead.customerId,
    to: (o.to ?? lead.email ?? "").trim() || null,
    an,
    kontext,
    vorlage,
    werte,
    abmeldeUrl,
    inhalt: (sig) => {
      const i = vorlagenInhalt(vorlage, werte, sig, { knoepfe: o.knoepfe, abmeldeUrl });
      return o.betreffVorsatz ? { ...i, subject: `${o.betreffVorsatz}${i.subject}` } : i;
    },
  };
}

/** Berliner Kalendertag YYYY-MM-DD. */
export const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export type VorlagenMailErgebnis =
  | { sent: true; via: "postfach" | "resend" }
  | { sent: false; reason: SperrGrund | "schon_gesendet" | "tageslimit" | "nicht_gefunden" | string };

const istEindeutigFehler = (e: unknown) => !!e && typeof e === "object" && (e as { code?: string }).code === "P2002";

/**
 * Vorlagen-Mail an einen Lead senden (zentral, wirft nicht). Prüft Sperren und Stufe, reserviert den Anlass
 * (Idempotenz) und den Tag (automatisch, ohne Pflicht) und gibt die Reservierung frei, wenn der Versand scheitert.
 */
export async function sendeVorlagenMail(leadId: string, key: VorlageKey, o: VorlagenMailOpts = {}): Promise<VorlagenMailErgebnis> {
  const now = o.now ?? new Date();
  const automatisch = o.automatisch ?? true;
  try {
    const d = await ladeSperrDaten(leadId, { to: o.to, antwortSeit: o.antwortSeit });
    if (!d.customerId) return { sent: false, reason: "nicht_gefunden" };
    const c = await prisma.customer.findUnique({ where: { id: d.customerId }, select: { mailAblauf: true } });
    const stufe = leseMailAblauf(c?.mailAblauf).stufen[key];
    const grund = sperrGrund(d, { vorlage: key, automatisch, stufe, pflicht: o.pflicht, freigegeben: o.freigegeben });
    if (grund) return { sent: false, reason: grund };

    // Reservierung: je Lead/Vorlage/Anlass einmal, automatisch höchstens eine je Tag
    const tag = berlinTag(now);
    const tagesSchluessel = automatisch && !o.pflicht ? `${leadId}:${tag}` : null;
    let reservierung: string | null = null;
    if (o.anlass || tagesSchluessel) {
      try {
        const r = await prisma.leadMailVersand.create({
          data: { customerId: d.customerId, leadId, vorlage: key, anlass: (o.anlass ?? `ohne:${now.getTime()}`).slice(0, 200), automatisch, tag, tagesSchluessel, createdAt: now },
          select: { id: true },
        });
        reservierung = r.id;
      } catch (e) {
        if (!istEindeutigFehler(e)) throw e;
        const schon = o.anlass ? await prisma.leadMailVersand.findUnique({ where: { leadId_vorlage_anlass: { leadId, vorlage: key, anlass: o.anlass.slice(0, 200) } }, select: { id: true } }) : null;
        return { sent: false, reason: schon ? "schon_gesendet" : "tageslimit" };
      }
    }

    const vb = await bereiteVorlagenMail(leadId, key, { ...o, now });
    if (!vb?.to) {
      if (reservierung) await prisma.leadMailVersand.delete({ where: { id: reservierung } }).catch(() => null);
      return { sent: false, reason: "keine_adresse" };
    }
    const res = await sendeLeadMail(vb.kontext, {
      to: vb.to,
      inhalt: vb.inhalt,
      attachments: o.anhaenge,
      protokoll: { customerId: vb.customerId, leadId, art: key, automatisch, userId: automatisch ? null : (o.userId ?? null) },
    });
    if (!res.sent) {
      if (reservierung) await prisma.leadMailVersand.delete({ where: { id: reservierung } }).catch(() => null);
      return res;
    }
    if (reservierung) {
      const mail = await prisma.contactMail.findFirst({ where: { leadId, kind: key }, orderBy: { createdAt: "desc" }, select: { id: true } });
      await prisma.leadMailVersand.update({ where: { id: reservierung }, data: { status: "gesendet", contactMailId: mail?.id ?? null } }).catch(() => null);
    }
    return res;
  } catch (err) {
    console.error("[vorlagen-mail]", key, err instanceof Error ? err.message : err);
    return { sent: false, reason: "fehler" };
  }
}
