// Vorschau der Nachrichten aus dem Vertrieb (Ole, 22.11.2026: „Vorschau der Mails, die man im Admin-CRM raussenden
// wird, inkl. Templates“). Zwei Wege, beide aus denselben Funktionen wie der Versand (nichts kopiert):
//   1. geplanteVorschau: eine Zeile aus „Geplante Nachrichten“ mit den echten Daten des Kontakts, ohne Seiteneffekte
//      (kein Passwort-Link, keine Rechnung geladen, nichts markiert, nichts gesendet).
//   2. vorlagenKatalog: alle automatischen Mails und WhatsApp-Vorlagen mit Beispieldaten (Einstellungen → Vorlagen).

import { prisma } from "@/lib/prisma";
import { baueAngebotsMail, kundenMailVorschau, willkommensMailInhalt, type CustomerMailOpts } from "@/lib/email";
import { abschlussBonusJetzt, eur } from "@/lib/offer-pricing";
import {
  erinnerungsMail,
  zahlungVorlage,
  ZAHLUNG_TEMPLATE_BODY_DU,
  ZAHLUNG_TEMPLATE_BODY_DU_V2,
  ZAHLUNG_TEMPLATE_BODY_SIE,
  ZAHLUNG_TEMPLATE_BODY_SIE_V2,
  ZAHLUNG_TEMPLATE_DU,
  ZAHLUNG_TEMPLATE_DU_V2,
  ZAHLUNG_TEMPLATE_EXAMPLES,
  ZAHLUNG_TEMPLATE_SIE,
  ZAHLUNG_TEMPLATE_SIE_V2,
} from "@/lib/angebot-zahlungserinnerung";
import { vorlagenAnrede, vorlagenParams, zahlungMailOpts, zahlungsLink } from "@/lib/angebot-zahlungserinnerung-server";
import { BONUS_VORLAGEN, bonusMail, bonusVorlage } from "@/lib/vertrieb/bonus-erinnerung";
import { angebotsLink, bonusMailOpts } from "@/lib/vertrieb/bonus-erinnerung-server";
import { MAHN_VORLAGEN_VORBEREITET, mahnText, rechnungVorlage, STUFEN, eurCent, type StufeKey } from "@/lib/mahnwesen";
import { onboardingChecklist, ONBOARDING_CUSTOMER_INCLUDE, welcomeVorschauOpts } from "@/lib/onboarding";
import { openCustomerSteps, setupReminderInhalt, setupReminderOpts } from "@/lib/selbst-einrichtung";
import { inviteeMail, inviteeMailOpts, manageLink, type InviteeMailKind } from "@/lib/vertrieb/buchung";
import { paragraphize, templateTexts, textToHtml } from "@/lib/vertrieb/followup";
import { AB_ANGEBOT, AB_FOLLOWUP, AB_TERMIN, abHinweis, type VertriebAbTest } from "@/lib/vertrieb/ab-tests";
import { fassung } from "@/lib/vertrieb/ab-tests-server";
import { supportVorlagenNutzbar, TERMIN_VORLAGEN, terminErinnerungInhalt, type Nutzbar } from "@/lib/vertrieb/termin-whatsapp";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import type { Kanal } from "@/lib/vertrieb/geplante-nachrichten";

export type MailTeil = { kanal: "email"; an: string; betreff: string; html: string; anhaenge: string[]; hinweis?: string | null };
export type WhatsAppTeil = { kanal: "whatsapp"; an: string | null; vorlage: string; text: string; hinweis?: string | null };
export type VorschauTeil = MailTeil | WhatsAppTeil;

const NICHT_FREIGEGEBEN = "Vorlage bei Meta noch nicht freigegeben: geht erst nach der Freigabe raus.";

function mailTeil(opts: CustomerMailOpts, hinweis?: string | null): MailTeil {
  const v = kundenMailVorschau(opts);
  return { kanal: "email", an: [opts.to].flat().join(", "), betreff: v.betreff, html: v.html, anhaenge: v.anhaenge, hinweis: hinweis ?? null };
}

/** Vorlage an einen Vertriebskontakt (Zahlung, Bonus, Mahnung): Anrede und Parameter wie sendeVorlageAnKontakt. */
async function kontaktWhatsApp(o: {
  salesContactId: string | null;
  contactName: string;
  du: boolean;
  vorlage: { name: string; body: string } | null;
  ersatz: { name: string; body: string };
  params: (anrede: string) => string[];
}): Promise<WhatsAppTeil> {
  const c = o.salesContactId
    ? await prisma.salesContact.findUnique({ where: { id: o.salesContactId }, select: { phone: true, firstName: true, lastName: true, salutation: true } })
    : null;
  const tpl = o.vorlage ?? o.ersatz;
  const params = vorlagenParams(o.params, vorlagenAnrede(c, o.du, o.contactName));
  return { kanal: "whatsapp", an: c?.phone ? normalizePhone(c.phone) : null, vorlage: tpl.name, text: renderTemplate(tpl.body, params), hinweis: o.vorlage ? null : NICHT_FREIGEGEBEN };
}

// ─── 1. Geplante Nachricht mit echten Daten ──────────────────────────────

/**
 * Vorschau einer geplanten Nachricht (Schlüssel aus lib/vertrieb/geplante-nachrichten-server.ts), so wie sie zum
 * Zeitpunkt `at` rausginge, je Kanal ein Teil. Leere Liste: Datensatz nicht mehr da oder nichts mehr zu senden.
 */
export async function geplanteVorschau(key: string, at: Date, kanaele: Kanal[]): Promise<VorschauTeil[]> {
  const [quelle, id, stufe] = key.split(":");
  const mail = kanaele.includes("email");
  const wa = kanaele.includes("whatsapp");
  const out: VorschauTeil[] = [];
  const nutzbar = wa ? await supportVorlagenNutzbar() : () => false;

  if (quelle === "termin") {
    const art = stufe === "tag" ? "tag" : "gleich";
    if (mail) {
      const m = await inviteeMailOpts(id, art === "tag" ? "reminder" : "soon");
      // A/B-Test nur auf der Erinnerung 24 Stunden vorher: Fassung zeigen, die der Kontakt bekommt (ohne Zuteilung)
      if (m) out.push(mailTeil(m, art === "tag" ? await abVorschau(AB_TERMIN, id) : null));
    }
    if (wa) {
      const m = await prisma.salesMeeting.findUnique({
        where: { id },
        select: {
          title: true,
          startAt: true,
          joinUrl: true,
          location: true,
          manageToken: true,
          rescheduleUrl: true,
          inviteeName: true,
          inviteePhone: true,
          bookingType: { select: { slug: true } },
          contact: { select: { phone: true, firstName: true, lastName: true, salutation: true } },
        },
      });
      if (m) {
        const waArt = art === "tag" ? "erinnerung" : "gleich";
        const echt = terminErinnerungInhalt(m, waArt, at, nutzbar, manageLink);
        const r = echt ?? terminErinnerungInhalt(m, waArt, at, () => true, manageLink);
        if (r) out.push({ kanal: "whatsapp", an: r.phone, vorlage: r.vorlage.name, text: renderTemplate(r.vorlage.body, r.params), hinweis: echt ? null : NICHT_FREIGEGEBEN });
      }
    }
  } else if (quelle === "zahlung") {
    const o = await prisma.offer.findUnique({ where: { id } });
    if (!o) return [];
    const link = zahlungsLink(o.token);
    if (mail && o.email) out.push(mailTeil(await zahlungMailOpts(o, Number(stufe) || 1, link, at), await abVorschau(AB_ANGEBOT, o.id)));
    if (wa) {
      out.push(
        await kontaktWhatsApp({
          salesContactId: o.salesContactId,
          contactName: o.contactName,
          du: o.mailDu,
          vorlage: zahlungVorlage(o.mailDu, nutzbar),
          ersatz: zahlungVorlage(o.mailDu, () => true)!,
          params: (anrede) => [anrede, o.number, link],
        }),
      );
    }
  } else if (quelle === "bonus") {
    const o = await prisma.offer.findUnique({ where: { id } });
    if (!o) return [];
    if (stufe === "whatsapp") {
      const bonus = abschlussBonusJetzt(o, at);
      if (bonus) {
        const v = BONUS_VORLAGEN.find((x) => x.du === o.mailDu && x.spaeter === o.allowPayLater)!;
        out.push(
          await kontaktWhatsApp({
            salesContactId: o.salesContactId,
            contactName: o.contactName,
            du: o.mailDu,
            vorlage: bonusVorlage(o.mailDu, o.allowPayLater, nutzbar),
            ersatz: { name: v.name, body: v.body },
            params: (anrede) => [anrede, eur(bonus.betrag), angebotsLink(o.token)],
          }),
        );
      }
    } else if (stufe === "vorab" || stufe === "letzter") {
      const m = await bonusMailOpts(o, stufe, at);
      if (m) out.push(mailTeil(m, await abVorschau(AB_ANGEBOT, o.id)));
    }
  } else if (quelle === "followup") {
    const f = await prisma.salesFollowup.findUnique({ where: { id }, select: { step: true, body1: true, body2: true, subject: true, contact: { select: { email: true } } } });
    if (!f) return [];
    const body = stufe === "2" ? f.body2 : f.body1;
    out.push({
      kanal: "email",
      an: f.contact.email ?? "",
      betreff: f.subject ?? "Re: Unser Austausch",
      html: body
        ? `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.6;padding:16px">${textToHtml(paragraphize(body))}</div>`
        : `<p style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:#5b5e68;padding:16px">Der Text wird beim nächsten Lauf geschrieben.</p>`,
      anhaenge: [],
      hinweis: [
        "Antwort im bisherigen Verlauf: darunter stehen die Signatur des Postfachs und die zitierte letzte Mail.",
        stufe === "2" ? null : await followupFassung(id),
      ]
        .filter(Boolean)
        .join(" "),
    });
  } else if (quelle === "mahnung") {
    const f = await prisma.mahnfall.findUnique({
      where: { id },
      include: { customer: { select: { id: true, name: true, salesContact: { select: { id: true, name: true } }, users: { where: { role: "BUYER", teamRole: "owner" }, select: { email: true } } } } },
    });
    const s = STUFEN.find((x) => x.nr === Number(stufe));
    if (!f || !s || s.key === "anruf") return [];
    const key = s.key as Exclude<StufeKey, "anruf">;
    if (mail) {
      const m = await mahnMailOptsVorschau(f, key, at);
      if (m) out.push(mailTeil(m));
    }
    if (wa && key === "faellig" && f.hostedUrl) {
      const { vorlageFreigegeben } = await import("@/lib/mahnwesen-server");
      const v = rechnungVorlage(f.art);
      const nummer = f.invoiceNumber ?? f.stripeInvoiceId;
      out.push(
        await kontaktWhatsApp({
          salesContactId: f.customer?.salesContact?.id ?? null,
          contactName: f.customer?.salesContact?.name ?? f.customer?.name ?? "",
          du: false,
          vorlage: (await vorlageFreigegeben(v.name)) ? v : null,
          ersatz: v,
          params: (anrede) => [anrede, nummer, eurCent(f.amountDue), f.hostedUrl!],
        }),
      );
    }
  } else if (quelle === "einrichtung") {
    const ob = await prisma.onboarding.findUnique({ where: { id }, include: { customer: { include: ONBOARDING_CUSTOMER_INCLUDE } } });
    if (!ob) return [];
    const offer = ob.offerId ? await prisma.offer.findUnique({ where: { id: ob.offerId }, select: { paymentStatus: true, paidAt: true, isTest: true } }) : null;
    const open = openCustomerSteps(onboardingChecklist(ob, offer));
    if (open.some((i) => i.key === "login")) {
      const w = await welcomeVorschauOpts(ob.id);
      if (w) {
        const inhalt = willkommensMailInhalt(w);
        out.push({ kanal: "email", an: w.to, betreff: inhalt.subject, html: inhalt.html, anhaenge: [], hinweis: "Noch nicht eingeloggt: Die Willkommens-Mail geht erneut raus, mit frischem Link zum Passwort." });
      }
    } else {
      const m = await setupReminderOpts(ob, open, Number(stufe) || null);
      if (m) out.push(mailTeil(m));
    }
  }
  return out;
}

/** Hinweis zur Fassung im A/B-Test (lib/vertrieb/ab-tests.ts), so wie der Kontakt sie bekommt; legt keine Zuteilung an. */
async function abVorschau(test: VertriebAbTest, einheit: string): Promise<string> {
  return abHinweis(test, await fassung(test, einheit));
}

/** Follow-up: Fassung, mit der Mail 1 geschrieben wurde (Zuteilung beim Schreiben); ohne Zuteilung kein Hinweis. */
async function followupFassung(id: string): Promise<string | null> {
  const z = await prisma.experimentZuteilung.findUnique({ where: { experiment_einheit: { experiment: AB_FOLLOWUP, einheit: id } }, select: { variante: true } });
  return z?.variante === "a" || z?.variante === "b" ? abHinweis(AB_FOLLOWUP, z.variante) : null;
}

async function mahnMailOptsVorschau(...args: Parameters<typeof import("@/lib/mahnwesen-server").mahnMailOpts>) {
  const { mahnMailOpts } = await import("@/lib/mahnwesen-server");
  return mahnMailOpts(args[0], args[1], args[2], { vorschau: true });
}

// ─── 2. Vorlagen-Katalog mit Beispieldaten ───────────────────────────────

export type Ansprache = "sie" | "du";

export type KatalogEintrag = {
  key: string;
  titel: string;
  /** Wann geht sie raus (ein Satz) */
  wann: string;
  /** Gibt es eine Du-Fassung? Sonst immer Sie. */
  du: boolean;
  teile: VorschauTeil[];
  /** Läuft ein A/B-Test (lib/vertrieb/ab-tests.ts)? Dann zeigen die Teile Fassung A und B. */
  abTest?: boolean;
};

export type KatalogGruppe = { key: string; titel: string; eintraege: KatalogEintrag[] };

export type VorlagenStatus = "aktiv" | "wartet" | "abgelehnt" | "werbung" | "fehlt" | "ersetzt";

export type WhatsAppVorlage = { name: string; gruppe: string; text: string; status: VorlagenStatus; du: boolean | null };

const BEISPIEL = {
  name: "Max Mustermann",
  sie: "Herr Mustermann",
  du: "Max",
  email: "max@agentur-mustermann.de",
  angebot: "PG-2026-0007",
  token: "beispiel",
};

const greeting = (an: Ansprache) => (an === "du" ? `Hallo ${BEISPIEL.du},` : `Hallo ${BEISPIEL.sie},`);
const tage = (n: number, von = new Date()) => new Date(von.getTime() + n * 86_400_000);
const beispielMail = (o: Omit<CustomerMailOpts, "to">, hinweis?: string | null): MailTeil => mailTeil({ to: BEISPIEL.email, ...o }, hinweis);

/** Hinweis über einer Fassung im Vorlagen-Katalog. */
function fassungHinweis(test: VertriebAbTest, b: boolean): string {
  return abHinweis(test, b ? "b" : "a", false) + (b ? "" : " Standard.");
}

/** Alle automatischen Mails des Vertriebs mit Beispieldaten, in der Reihenfolge der Kundenreise. */
export function vorlagenKatalog(an: Ansprache, now = new Date()): KatalogGruppe[] {
  const du = an === "du";
  const termin = (kind: InviteeMailKind, vorabFrage?: boolean) =>
    beispielMail(
      inviteeMail(kind, {
        title: "Kennenlerngespräch",
        startAt: tage(1, now),
        joinUrl: "https://meet.google.com/abc-defg-hij",
        inviteeName: BEISPIEL.name,
        manageToken: BEISPIEL.token,
        thanksPage: kind === "booked",
        vorabFrage,
      }),
      vorabFrage === undefined ? null : fassungHinweis(AB_TERMIN, vorabFrage),
    );
  const start = tage(14, now).toISOString().slice(0, 10);
  const zahlung = (stufe: number, b = false) => {
    const t = erinnerungsMail({ number: BEISPIEL.angebot, startIso: start, stufe, du, naechsteSchritte: b });
    return beispielMail({ subject: t.subject, greeting: greeting(an), paragraphs: t.paragraphs, button: { label: t.button, url: zahlungsLink(BEISPIEL.token) } }, fassungHinweis(AB_ANGEBOT, b));
  };
  const bonus = (art: "vorab" | "letzter", b = false) => {
    const t = bonusMail(art, { betrag: 500, fristIso: tage(art === "vorab" ? 1 : 0, now).toISOString().slice(0, 10), number: BEISPIEL.angebot, du, spaeterZahlen: false, naechsteSchritte: b });
    return beispielMail({ subject: t.subject, greeting: greeting(an), paragraphs: t.paragraphs, button: { label: t.button, url: angebotsLink(BEISPIEL.token) } }, fassungHinweis(AB_ANGEBOT, b));
  };
  const mahn = (key: Exclude<StufeKey, "anruf">) => {
    const faellig = key === "erinnerung" ? tage(3, now) : key === "faellig" ? now : key === "mahnung1" ? tage(-7, now) : tage(-14, now);
    const t = mahnText(key, { nummer: "PG-1234-0007", betragCent: 119_000, dueDate: faellig, art: "ueberweisung", now });
    return beispielMail(
      { subject: t.subject, greeting: "Hallo Herr Mustermann,", paragraphs: t.paragraphs, button: { label: t.button, url: "https://invoice.stripe.com/i/beispiel" }, ...(key === "mahnung1" || key === "mahnung2" ? { attachments: [{ filename: "Rechnung-PG-1234-0007.pdf", content: "" }] } : {}) },
    );
  };
  const willkommen = willkommensMailInhalt({
    to: BEISPIEL.email,
    greeting: "Hallo Herr Mustermann,",
    packageType: "software",
    startDate: tage(14, now),
    products: ["Meta-Leads Kfz", "Software"],
    setPasswordUrl: "https://app.performancegrowth.de/passwort/beispiel",
    loginUrl: "https://app.performancegrowth.de/login",
    setupUrl: "https://app.performancegrowth.de/buyer/einrichtung",
    whatsappSelfConnect: true,
  });
  const angebotMail = (b: boolean): MailTeil => {
    const m = baueAngebotsMail({
      greeting: greeting(an),
      number: BEISPIEL.angebot,
      offerUrl: angebotsLink(BEISPIEL.token),
      validUntil: tage(14, now),
      du,
      bonus: { betrag: 500, bis: tage(7, now) },
      naechsteSchritte: b,
    });
    const beispiel = "Beispiel mit Abschlussbonus; Rabatt, Präsentation und Entscheidungs-Call kommen je Angebot dazu.";
    return { kanal: "email", an: BEISPIEL.email, betreff: m.subject, html: m.html, anhaenge: [], hinweis: `${fassungHinweis(AB_ANGEBOT, b)} ${beispiel}` };
  };
  // Später-Follow-up (immer Sie): feste Vorlage als Beispiel; meist schreibt die KI den Text nach derselben Vorgabe
  const followup = (b: boolean): MailTeil => {
    const t = templateTexts({
      greeting: "Guten Tag Herr Mustermann,",
      replyMonth: "im August",
      hasLaterReply: true,
      timing: "ab dem neuen Jahr",
      pitch: "(Satz zum Angebot aus den Einstellungen des Später-Follow-ups)",
      bookingUrl: "https://app.performancegrowth.de/termin?k=beispiel",
      janein: b,
    });
    return {
      kanal: "email",
      an: BEISPIEL.email,
      betreff: "Re: Unser Austausch",
      html: `<div style="font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;line-height:1.6;padding:16px">${textToHtml(paragraphize(t.body1))}</div>`,
      anhaenge: [],
      hinweis: `${fassungHinweis(AB_FOLLOWUP, b)} Feste Vorlage als Beispiel; meist schreibt die KI den Text nach derselben Vorgabe.`,
    };
  };
  const offen = [
    { key: "metaAccess", label: "Meta-Freigabe" },
    { key: "calendar", label: "Kalender" },
  ];
  return [
    {
      key: "termin",
      titel: "Termine",
      eintraege: [
        { key: "termin-bestaetigung", titel: "Terminbestätigung", wann: "Direkt nach der Buchung.", du: false, teile: [termin("booked")] },
        { key: "termin-24h", titel: "Terminerinnerung 24 Stunden vorher", wann: "Einen Tag vorher, wenn mehr als 26 Stunden im Voraus gebucht.", du: false, abTest: true, teile: [termin("reminder", false), termin("reminder", true)] },
        { key: "termin-1h", titel: "Terminerinnerung 1 Stunde vorher", wann: "Eine Stunde vorher, wenn mindestens 3 Stunden im Voraus gebucht.", du: false, teile: [termin("soon")] },
        { key: "termin-verschoben", titel: "Termin verschoben", wann: "Direkt nach dem Verschieben.", du: false, teile: [termin("rescheduled")] },
        { key: "termin-abgesagt", titel: "Termin abgesagt", wann: "Direkt nach der Absage.", du: false, teile: [termin("cancelled")] },
      ],
    },
    {
      key: "angebot",
      titel: "Angebot",
      eintraege: [
        {
          key: "angebot-mail",
          titel: "Angebotsmail",
          wann: "Beim Klick auf „Per E-Mail senden“ am Angebot (dort mit den echten Angaben).",
          du: true,
          abTest: true,
          teile: [angebotMail(false), angebotMail(true)],
        },
        { key: "bonus-vorab", titel: "Bonus-Erinnerung am Tag vor Ablauf", wann: "Am Vortag der Bonusfrist ab 9 Uhr, wenn der Kontakt nicht geantwortet hat.", du: true, abTest: true, teile: [bonus("vorab"), bonus("vorab", true)] },
        { key: "bonus-letzter", titel: "Bonus-Erinnerung am letzten Tag", wann: "Am letzten Tag der Bonusfrist ab 9 Uhr, WhatsApp ab 13 Uhr.", du: true, abTest: true, teile: [bonus("letzter"), bonus("letzter", true)] },
        { key: "zahlung-1", titel: "Zahlungserinnerung", wann: "3 Tage nach der Annahme, wenn die Zahlung noch nicht eingerichtet ist (dazu WhatsApp).", du: true, abTest: true, teile: [zahlung(1), zahlung(1, true)] },
        { key: "zahlung-2", titel: "Weitere Zahlungserinnerungen", wann: "Nach 3 und 7 Tagen (mit Startdatum) bzw. wöchentlich (ohne).", du: true, abTest: true, teile: [zahlung(2), zahlung(2, true)] },
      ],
    },
    {
      key: "nachfassen",
      titel: "Nachfassen",
      eintraege: [
        {
          key: "followup-1",
          titel: "Später-Follow-up, Mail 1",
          wann: "Zum Zeitpunkt, den der Kontakt genannt hat, als Antwort im bisherigen Verlauf (nach Freigabe).",
          du: false,
          abTest: true,
          teile: [followup(false), followup(true)],
        },
      ],
    },
    {
      key: "einrichtung",
      titel: "Neue Kunden",
      eintraege: [
        { key: "willkommen", titel: "Willkommens-Mail", wann: "Beim Start der Einrichtung; erneut, solange sich der Kunde nicht eingeloggt hat.", du: false, teile: [{ kanal: "email", an: BEISPIEL.email, betreff: willkommen.subject, html: willkommen.html, anhaenge: [] }] },
        { key: "einrichtung-1", titel: "Erinnerung an die Einrichtung (Tag 1 und 3)", wann: "Werktags an Tag 1 und 3, solange Schritte offen sind.", du: false, teile: [beispielMail(setupReminderInhalt({ greeting: "Hallo Herr Mustermann,", open: offen, day: 1 }))] },
        { key: "einrichtung-7", titel: "Erinnerung an die Einrichtung (Tag 7)", wann: "Werktags an Tag 7, solange Schritte offen sind.", du: false, teile: [beispielMail(setupReminderInhalt({ greeting: "Hallo Herr Mustermann,", open: offen.slice(0, 1), day: 7 }))] },
      ],
    },
    {
      key: "mahnung",
      titel: "Rechnungen",
      eintraege: STUFEN.filter((s) => s.mail).map((s) => ({
        key: `mahnung-${s.key}`,
        titel: s.label,
        wann: s.tage < 0 ? `${-s.tage} Tage vor Fälligkeit (nur bei Überweisung).` : s.tage === 0 ? "Am Fälligkeitstag (dazu WhatsApp)." : `${s.tage} Tage nach Fälligkeit.`,
        du: false,
        teile: [mahn(s.key as Exclude<StufeKey, "anruf">)],
      })),
    },
  ];
}

/** Alle WhatsApp-Vorlagen der Support-Nummer mit Beispielwerten und Freigabestand bei Meta. */
export async function whatsappVorlagenKatalog(): Promise<WhatsAppVorlage[]> {
  const termin = TERMIN_VORLAGEN.map((v) => ({
    name: v.name,
    body: v.body,
    examples: v.examples,
    version: v.version,
    du: false as boolean | null,
    gruppe: v.art === "termin" ? "Terminbestätigung" : v.art === "erinnerung" ? "Terminerinnerung 24 Stunden vorher" : "Terminerinnerung 1 Stunde vorher",
  }));
  const zahlung = [
    { name: ZAHLUNG_TEMPLATE_SIE_V2, body: ZAHLUNG_TEMPLATE_BODY_SIE_V2, du: false, version: 2 as const },
    { name: ZAHLUNG_TEMPLATE_DU_V2, body: ZAHLUNG_TEMPLATE_BODY_DU_V2, du: true, version: 2 as const },
    { name: ZAHLUNG_TEMPLATE_SIE, body: ZAHLUNG_TEMPLATE_BODY_SIE, du: false, version: 1 as const },
    { name: ZAHLUNG_TEMPLATE_DU, body: ZAHLUNG_TEMPLATE_BODY_DU, du: true, version: 1 as const },
  ].map((v) => ({ ...v, examples: v.du ? ["Max", ...ZAHLUNG_TEMPLATE_EXAMPLES.slice(1)] : ZAHLUNG_TEMPLATE_EXAMPLES, gruppe: "Zahlungserinnerung" }));
  const bonus = BONUS_VORLAGEN.map((v) => ({ name: v.name, body: v.body, examples: [...v.examples], du: v.du as boolean | null, version: 2 as const, gruppe: v.spaeter ? "Bonus-Erinnerung (später zahlen erlaubt)" : "Bonus-Erinnerung" }));
  const mahn = MAHN_VORLAGEN_VORBEREITET.map((v) => ({ name: v.name, body: v.body, examples: [...v.examples], du: false as boolean | null, version: 1 as const, gruppe: "Rechnung fällig bzw. Abbuchung fehlgeschlagen" }));
  const alle = [...termin, ...zahlung, ...bonus, ...mahn];
  const rows = await prisma.messageTemplate.findMany({
    where: { customerId: SUPPORT_CUSTOMER_ID, language: "de", name: { in: alle.map((v) => v.name) } },
    select: { name: true, status: true, category: true },
  });
  const map = new Map(rows.map((r) => [r.name, r]));
  const nutzbar: Nutzbar = (name, version) => {
    const r = map.get(name);
    return r?.status === "approved" && (version === 1 || (r.category ?? "").toLowerCase() !== "marketing");
  };
  // Fassung 1 der Termin- und Zahlungsvorlagen ist abgelöst, sobald die passende Fassung 2 nutzbar ist
  const zahlungAbgeloest = (du: boolean) => nutzbar(du ? ZAHLUNG_TEMPLATE_DU_V2 : ZAHLUNG_TEMPLATE_SIE_V2, 2);
  const terminAbgeloest = (art: string) => TERMIN_VORLAGEN.filter((v) => v.version === 2 && v.art === art).every((v) => nutzbar(v.name, 2));
  return alle.map((v) => {
    const r = map.get(v.name);
    const st = (r?.status ?? "").toLowerCase();
    const werbung = v.version === 2 && st === "approved" && (r?.category ?? "").toLowerCase() === "marketing";
    const art = TERMIN_VORLAGEN.find((x) => x.name === v.name)?.art;
    const ersetzt = v.version === 1 && st === "approved" && (art ? terminAbgeloest(art) : v.gruppe === "Zahlungserinnerung" ? zahlungAbgeloest(!!v.du) : false);
    const status: VorlagenStatus = !r ? "fehlt" : werbung ? "werbung" : ersetzt ? "ersetzt" : st === "approved" ? "aktiv" : st === "rejected" ? "abgelehnt" : "wartet";
    return { name: v.name, gruppe: v.gruppe, du: v.du, text: renderTemplate(v.body, v.examples), status };
  });
}

