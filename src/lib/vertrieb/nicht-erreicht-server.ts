// Versand nach „Nicht erreicht“ im Vertriebs-CRM (Ole, 22.11.2026): E-Mail (Angebots-Mailweg, Antwort an Ole) und
// WhatsApp von der Support-Nummer, beide mit persönlichem Buchungslink. Regeln und Texte: lib/vertrieb/nicht-erreicht.ts.

import { prisma } from "@/lib/prisma";
import { sendCustomerMail } from "@/lib/email";
import { reportError } from "@/lib/monitoring";
import { anredeName } from "@/lib/ansprache";
import { sendeVorlageAnKontakt, vorlagenAnrede, vorlagenParams } from "@/lib/angebot-zahlungserinnerung-server";
import { whatsappHindernis } from "@/lib/vertrieb/geplante-nachrichten";
import { normalizePhone } from "@/lib/whatsapp/phone";
import { renderTemplate } from "@/lib/whatsapp/templates";
import { kontaktGesperrt } from "@/lib/vertrieb/sperrliste";
import { whatsappErlaubtStand } from "@/lib/vertrieb/bonus-erinnerung-server";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import {
  NE_AB_TEST,
  NE_FENSTER_STUNDEN,
  NE_GEWINNER,
  NE_MAIL_AKTIVITAET,
  NE_MIN_JE_FASSUNG,
  NE_TEMPLATE_BODY,
  NE_TEMPLATE_BODY_B,
  NE_TEMPLATE_NAME,
  NE_TEMPLATE_NAME_B,
  NE_WA_AKTIVITAET,
  istWarm,
  neFassung,
  neFassungAusNotiz,
  neFassungVermerk,
  nichtErreichtAbStand,
  nichtErreichtMail,
  nichtErreichtStopp,
  type NeEinheit,
  type NeFassung,
} from "@/lib/vertrieb/nicht-erreicht";

export type NichtErreichtErgebnis = { mail: "sent" | string; whatsapp: "sent" | string } | { stopp: string };

/** Was nach „Nicht erreicht“ rausginge (Vorschau im Fenster „Eintragen“, Ole 23.11.2026): je Kanal Text oder Grund. */
export type NichtErreichtVorschau =
  | { stopp: string; hinweis: string }
  | {
      fassung: NeFassung;
      mail: { an: string; betreff: string; text: string; knopf: string | null } | null;
      /** Warum keine Mail (z. B. keine Adresse) */
      mailGrund: string | null;
      whatsapp: { an: string; text: string } | null;
      /** Warum keine WhatsApp (Festnetz, Vorlage nicht freigegeben …) */
      waGrund: string | null;
    };

const WA_GRUND: Record<string, string> = {
  festnetz: "WhatsApp nicht möglich (Festnetz)",
  no_phone: "WhatsApp nicht möglich (keine Nummer)",
  no_template: "WhatsApp wartet auf Freigabe der Vorlage bei Meta",
  no_account: "WhatsApp nicht verbunden",
  opted_out: "WhatsApp abgemeldet",
  kein_buchungslink: "WhatsApp braucht einen Buchungslink",
};

type Plan =
  | { stopp: string }
  | {
      fassung: NeFassung;
      vermerk: string;
      buchungslink: string | null;
      kontakt: { email: string | null; name: string; salutation: string | null; firstName: string | null; lastName: string | null; phone: string | null };
      nutzbar: (name: string, version: 1 | 2) => boolean;
    };

/** Regeln prüfen und Fassung, Buchungslink, Vorlagen bestimmen (gemeinsam für Vorschau und Versand). */
async function plane(contactId: string, now: Date): Promise<Plan> {
  const c = await prisma.salesContact.findUnique({
    where: { id: contactId },
    select: { id: true, email: true, name: true, phone: true, salutation: true, firstName: true, lastName: true, customerSource: true, art17GeloeschtAt: true },
  });
  if (!c) return { stopp: "kein Kontakt" };
  const [gesperrt, inbound, termin, angebot, mailIn, waIn, waErlaubt, letzte] = await Promise.all([
    kontaktGesperrt(contactId),
    prisma.salesInboundLead.findFirst({ where: { contactId }, select: { id: true } }),
    prisma.salesMeeting.findFirst({ where: { contactId }, select: { id: true } }),
    prisma.offer.findFirst({ where: { salesContactId: contactId, isTest: false }, select: { id: true } }),
    prisma.salesEmail.findFirst({ where: { contactId, direction: "IN", isAutoReply: false }, select: { id: true } }),
    prisma.message.findFirst({ where: { direction: "inbound", conversation: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: contactId } }, select: { id: true } }),
    whatsappErlaubtStand(contactId),
    prisma.salesActivity.findFirst({
      where: { contactId, outcome: { in: [NE_MAIL_AKTIVITAET, NE_WA_AKTIVITAET] } },
      orderBy: { occurredAt: "desc" },
      select: { occurredAt: true },
    }),
  ]);
  const warm = istWarm({ inbound: !!inbound, termin: !!termin, angebot: !!angebot, antwort: !!mailIn || !!waIn, whatsappErlaubt: waErlaubt.erlaubt, source: c.customerSource });
  const stopp = nichtErreichtStopp({ gesperrt: gesperrt || !!c.art17GeloeschtAt, warm, letzteNachricht: letzte?.occurredAt ?? null }, now);
  if (stopp) return { stopp };

  const { loadFollowupSettings } = await import("@/lib/vertrieb/followup");
  const { publicSalesBookingUrl, vertriebsLinkFuerKontakt } = await import("@/lib/vertrieb/buchung");
  // Eingestellter Buchungslink (Follow-up-Einstellungen), sonst unsere Buchungsseite; persönlich, wenn online buchbar
  const eingestellt = (await loadFollowupSettings()).bookingUrl?.trim() || publicSalesBookingUrl();
  const buchungslink = await vertriebsLinkFuerKontakt(eingestellt, contactId).catch(() => eingestellt);

  // A/B-Test: Fassung fest je Kontakt, Rückfall auf A, solange nur Vorlage A freigegeben ist (lib/vertrieb/nicht-erreicht.ts)
  const { supportVorlagenNutzbar } = await import("@/lib/vertrieb/termin-whatsapp");
  const nutzbar = await supportVorlagenNutzbar().catch(() => () => false);
  const fassung: NeFassung = neFassung(contactId, { a: nutzbar(NE_TEMPLATE_NAME, 2), b: nutzbar(NE_TEMPLATE_NAME_B, 2) });
  return { fassung, vermerk: neFassungVermerk(fassung), buchungslink, kontakt: c, nutzbar };
}

const mailMoeglich = (email: string | null) => !!email && !email.endsWith("@kontakt.invalid");
const kontaktName = (k: { firstName: string | null; lastName: string | null; name: string }) => [k.firstName, k.lastName].filter(Boolean).join(" ") || k.name;
const vorlageFuer = (fassung: NeFassung) => (fassung === "b" ? { name: NE_TEMPLATE_NAME_B, body: NE_TEMPLATE_BODY_B } : { name: NE_TEMPLATE_NAME, body: NE_TEMPLATE_BODY });

/** Vorschau für das Fenster „Eintragen“: genau die Texte, die beim Speichern rausgingen. Wirft nicht. */
export async function nichtErreichtVorschau(contactId: string, now = new Date()): Promise<NichtErreichtVorschau> {
  try {
    const p = await plane(contactId, now);
    if ("stopp" in p) return { stopp: p.stopp, hinweis: ergebnisText(p) ?? "Keine Nachricht." };
    const k = p.kontakt;
    let mail: Extract<NichtErreichtVorschau, { fassung: NeFassung }>["mail"] = null;
    if (mailMoeglich(k.email)) {
      const t = nichtErreichtMail({ buchungslink: p.buchungslink, fassung: p.fassung });
      const anrede = anredeName("sie", { salutation: k.salutation, firstName: k.firstName, lastName: k.lastName, fullName: null });
      mail = { an: k.email!, betreff: t.subject, text: [anrede ? `Guten Tag ${anrede},` : "Guten Tag,", ...t.paragraphs].join("\n\n"), knopf: t.button?.label ?? null };
    }
    // WhatsApp: dieselben Hürden wie sendeVorlageAnKontakt
    let waGrund: string | null = p.buchungslink ? null : "kein_buchungslink";
    let whatsapp: Extract<NichtErreichtVorschau, { fassung: NeFassung }>["whatsapp"] = null;
    const phone = k.phone ? normalizePhone(k.phone) : null;
    if (!waGrund) {
      const { istFestnetz } = await import("@/lib/telefon-typ");
      const acc = await prisma.whatsAppAccount.findUnique({ where: { customerId: SUPPORT_CUSTOMER_ID }, select: { status: true, apiKeyEnc: true } });
      const v = vorlageFuer(p.fassung);
      const abgemeldet = phone
        ? !!(await prisma.conversation.findUnique({ where: { customerId_contactPhone: { customerId: SUPPORT_CUSTOMER_ID, contactPhone: phone } }, select: { optedOutAt: true } }))?.optedOutAt
        : false;
      waGrund = whatsappHindernis({
        phone,
        festnetz: phone ? await istFestnetz(phone) : false,
        kontoVerbunden: acc?.status === "connected" && !!acc.apiKeyEnc,
        vorlage: p.nutzbar(v.name, 2),
        optedOut: abgemeldet,
      });
      if (!waGrund && phone) {
        const params = vorlagenParams((anrede) => [anrede, p.buchungslink!], vorlagenAnrede(k, false, kontaktName(k)));
        whatsapp = { an: `+${phone}`, text: renderTemplate(v.body, params) };
      }
    }
    return {
      fassung: p.fassung,
      mail,
      mailGrund: mail ? null : "Keine E-Mail-Adresse",
      whatsapp,
      waGrund: waGrund ? (WA_GRUND[waGrund] ?? waGrund) : null,
    };
  } catch (err) {
    reportError(err, "nicht-erreicht-vorschau", { contact: contactId });
    return { stopp: "Fehler", hinweis: "Vorschau gerade nicht möglich." };
  }
}

/**
 * Nach dem Ergebnis „Nicht erreicht“ (Anruf): Mail und WhatsApp senden, wenn die Regeln es erlauben und sie im Fenster
 * angehakt sind (wahl, Standard beide). Wirft nicht.
 */
export async function nachNichtErreicht(contactId: string, now = new Date(), wahl: { mail: boolean; whatsapp: boolean } = { mail: true, whatsapp: true }): Promise<NichtErreichtErgebnis> {
  try {
    if (!wahl.mail && !wahl.whatsapp) return { stopp: "abgewählt" };
    const p = await plane(contactId, now);
    if ("stopp" in p) return p;
    const { fassung, vermerk, buchungslink, kontakt: c, nutzbar } = p;

    // E-Mail
    let mail = wahl.mail ? "keine_adresse" : "abgewaehlt";
    if (wahl.mail && mailMoeglich(c.email)) {
      const text = nichtErreichtMail({ buchungslink, fassung });
      const anrede = anredeName("sie", { salutation: c.salutation, firstName: c.firstName, lastName: c.lastName, fullName: null });
      const r = await sendCustomerMail({
        to: c.email!,
        subject: text.subject,
        greeting: anrede ? `Guten Tag ${anrede},` : "Guten Tag,",
        paragraphs: text.paragraphs,
        ...(text.button ? { button: text.button } : {}),
      });
      mail = r.ok ? "sent" : "failed";
      await prisma.salesActivity.create({
        data: { contactId, type: "EMAIL", outcome: r.ok ? NE_MAIL_AKTIVITAET : "Nicht erreicht: E-Mail fehlgeschlagen", note: r.ok ? `An ${c.email}, Betreff: ${text.subject}, ${vermerk}` : r.error },
      });
    }

    // WhatsApp: nur mit Buchungslink (Pflichtfeld der Vorlage), Mobilnummer und freigegebener Vorlage
    let whatsapp = wahl.whatsapp ? "kein_buchungslink" : "abgewaehlt";
    if (wahl.whatsapp && buchungslink) {
      whatsapp = await sendeVorlageAnKontakt({
        salesContactId: contactId,
        contactName: kontaktName(c),
        du: false,
        vorlage: async () => {
          const v = vorlageFuer(fassung);
          return nutzbar(v.name, 2) ? v : null;
        },
        params: (anrede) => [anrede, buchungslink],
        activity: NE_WA_AKTIVITAET,
        activityNote: `Vorlage ${vorlageFuer(fassung).name}, ${vermerk}`,
        logRef: { dealId: null, salesContactId: contactId },
        errorLabel: "nicht-erreicht-whatsapp",
        now,
      });
    }
    return { mail, whatsapp };
  } catch (err) {
    reportError(err, "nicht-erreicht", { contact: contactId });
    return { stopp: "Fehler" };
  }
}

/**
 * Auswertung des A/B-Tests (Diagnose q=vertrieb-nicht-erreicht, nur Zahlen): je Kontakt die erste „Nicht erreicht“-
 * Nachricht mit vermerkter Fassung (Einträge vor dem Teststart haben keinen Vermerk und zählen nicht), dazu Antworten
 * (Mail IN ohne Abwesenheitsnotiz, WhatsApp eingehend im Support-Chat) und gebuchte Termine (SalesMeeting.createdAt).
 */
export async function nichtErreichtAbDiagnose(now = new Date()) {
  const akt = await prisma.salesActivity.findMany({
    where: { outcome: { in: [NE_MAIL_AKTIVITAET, NE_WA_AKTIVITAET] }, note: { contains: "Fassung " } },
    orderBy: { occurredAt: "asc" },
    select: { contactId: true, occurredAt: true, note: true },
  });
  const erste = new Map<string, { fassung: NeFassung; gesendet: Date }>();
  for (const x of akt) {
    const f = neFassungAusNotiz(x.note);
    if (f && !erste.has(x.contactId)) erste.set(x.contactId, { fassung: f, gesendet: x.occurredAt });
  }
  const ids = [...erste.keys()];
  const ab = new Date(Math.min(now.getTime(), ...[...erste.values()].map((e) => e.gesendet.getTime())));
  const [mails, wa, termine] = ids.length
    ? await Promise.all([
        prisma.salesEmail.findMany({ where: { contactId: { in: ids }, direction: "IN", isAutoReply: false, sentAt: { gte: ab } }, select: { contactId: true, sentAt: true } }),
        prisma.message.findMany({
          where: { direction: "inbound", createdAt: { gte: ab }, conversation: { customerId: SUPPORT_CUSTOMER_ID, salesContactId: { in: ids } } },
          select: { createdAt: true, conversation: { select: { salesContactId: true } } },
        }),
        prisma.salesMeeting.findMany({ where: { contactId: { in: ids }, createdAt: { gte: ab } }, select: { contactId: true, createdAt: true } }),
      ])
    : [[], [], []];
  const einheiten: NeEinheit[] = ids.map((id) => ({
    ...erste.get(id)!,
    antworten: [...mails.filter((m) => m.contactId === id).map((m) => m.sentAt), ...wa.filter((m) => m.conversation.salesContactId === id).map((m) => m.createdAt)],
    termine: termine.filter((t) => t.contactId === id).map((t) => t.createdAt),
  }));
  const st = nichtErreichtAbStand(einheiten, now);
  const pct = (x: number) => Math.round(x * 1000) / 10;
  return {
    test: NE_AB_TEST,
    regeln: { treffer: `Antwort oder Termin gebucht binnen ${NE_FENSTER_STUNDEN} h`, minJeFassung: NE_MIN_JE_FASSUNG, alpha: 0.01, minTrefferUndNichtTreffer: 10 },
    gewinnerImCode: NE_GEWINNER,
    datenschutz: "Nur Anzahlen und Quoten je Fassung, keine Kontakt-IDs.",
    fassungA: { kontakte: st.a.n, treffer: st.a.treffer, quoteProzent: pct(st.quoteA), termin: st.a.termin, terminProzent: pct(st.terminQuoteA) },
    fassungB: { kontakte: st.b.n, treffer: st.b.treffer, quoteProzent: pct(st.quoteB), termin: st.b.termin, terminProzent: pct(st.terminQuoteB) },
    nochNicht72h: st.unreif,
    p: Number(st.p.toFixed(4)),
    terminP: Number(st.terminP.toFixed(4)),
    stand:
      st.entscheidung.reason === "entschieden"
        ? `Fassung ${st.entscheidung.winner?.toUpperCase()} liegt klar vorn: Gewinner in NE_GEWINNER eintragen, Lernbuch nachtragen, nächsten Test anlegen`
        : st.entscheidung.reason === "zu_wenig"
          ? `läuft (ab ${NE_MIN_JE_FASSUNG} Kontakten und je 10 Treffern bzw. Nicht-Treffern je Fassung)`
          : "läuft (noch kein klarer Unterschied)",
  };
}

/** Kurzer Satz fürs Fenster nach dem Speichern bzw. den Verlauf. */
export function ergebnisText(r: NichtErreichtErgebnis): string | null {
  if ("stopp" in r) {
    if (r.stopp === "Kaltkontakt") return "Keine Nachricht: Kaltkontakt ohne Einwilligung.";
    if (r.stopp === "schon gesendet") return "Keine Nachricht: in den letzten 7 Tagen schon gesendet.";
    if (r.stopp === "gesperrt") return "Keine Nachricht: Kontakt gesperrt.";
    return null;
  }
  const teile = [r.mail === "sent" ? "E-Mail" : null, r.whatsapp === "sent" ? "WhatsApp" : null].filter(Boolean);
  const mailGrund = r.mail === "failed" ? "E-Mail fehlgeschlagen" : r.mail === "keine_adresse" ? "keine E-Mail-Adresse" : null;
  const extra = [mailGrund, r.whatsapp !== "sent" ? WA_GRUND[r.whatsapp] : null].filter(Boolean).join(", ");
  const haupt = teile.length ? `${teile.join(" und ")} gesendet.` : "Keine Nachricht gesendet.";
  return extra ? `${haupt} ${extra[0].toUpperCase()}${extra.slice(1)}.` : haupt;
}
