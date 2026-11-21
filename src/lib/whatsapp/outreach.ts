// WhatsApp-Erstanschreiben + Rückrufliste.
//
// Ablauf je neuem Lead eines Kunden mit aktivem Agenten + outreachEnabled:
//   1. Wartezeit (outreachDelayMin) → Lead kann zuerst selbst über die
//      Buchungsseite einen Termin wählen.
//   2. Termin vorhanden        → kein Anschreiben (skipped_booked)
//      Lead hat selbst geschrieben → kein Anschreiben (skipped_contact)
//      sonst                   → Vorlage „outreach" senden, Konversation mit
//                                Lead verknüpfen, der Assistent übernimmt bei Antwort.
//      Ohne Häkchen zur Einwilligung im Leadformular (Lead.waConsent = "nein") → kein WhatsApp
//      (skipped_no_consent), der Lead steht auf der Rückrufliste (E-Mail/Telefon).
//      Nummer hat „STOPP“ geschrieben → kein Anschreiben (skipped_optout).
//   3. Rückrufliste: offene Leads ohne Termin, bei denen das Anschreiben nicht
//      möglich war oder 24 h danach noch kein Termin steht.

import { CALL_PAUSE_MAX_MS } from "@/lib/telefonat";
import { recordLeadProgress } from "@/lib/lead-progress";
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { ohneAutoNachrichten } from "@/lib/lead-kontakt-sperre";
import { ErstinfoPdfFehltError, firstNameOf, NoTemplateError, outreachMaxVersion, sendWhatsAppNotice, type NoticePurpose } from "@/lib/whatsapp/templates";
import {
  ersteFrageKnoepfe,
  erstanschreibenText,
  erstanschreibenV6Params,
  erstanschreibenZweck,
  erstanschreibenV8Params,
  erstanschreibenV9Params,
  erstanschreibenV10Params,
  outreachProdukt,
  tierWort,
  v10Moeglich,
  type Herkunft,
} from "@/lib/whatsapp/erstanschreiben";
import { vermittlerName } from "@/lib/whatsapp/gespraech";
import { abVariantFor } from "@/lib/whatsapp/ab-test";
import { restartSilentSequence } from "@/lib/lead-sequences";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { anspracheOf } from "@/lib/whatsapp/reminders";
import { ansprechpartner } from "@/lib/lead-anrede";
import type { Ansprache } from "@/lib/ansprache";
import { EMPFEHLUNG_SOURCE } from "@/lib/lead-herkunft";
import { empfehlungReason, gespraechsEinstieg } from "@/lib/empfehlung/shared";
import { erstinfoUrlFor } from "@/lib/erstinformation";
import { sendErstinfo } from "@/lib/whatsapp/erstinfo-pdf";
import { KEIN_WHATSAPP_REASON } from "@/lib/whatsapp/kein-whatsapp";
import { FESTNETZ_REASON } from "@/lib/whatsapp/festnetz";
import { istFestnetz } from "@/lib/telefon-typ";
import { WhatsAppUnavailableError } from "@/lib/whatsapp/stopp";
import { logTestLead } from "@/lib/testlead";
import { splitHealthAnswers } from "@/lib/gesundheitsdaten";

/** formData-JSON des Leads defensiv als Label/Wert-Paare. */
function asFormAnswers(raw: unknown): { label: string; value: string }[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((x) => (x && typeof x === "object" && typeof x.label === "string" && typeof x.value === "string" ? [{ label: x.label, value: x.value }] : []));
}

/**
 * Erstanschreiben (v5, Ole 16.11.2026, lib/whatsapp/erstanschreiben.ts): eine Begrüßung, Dank mit Produkt,
 * „digitaler KI-Assistent von <Vorname>“ mit Nutzen, erste Frage fett als letzte Zeile. Im offenen Fenster als
 * Freitext, danach sofort das PDF der Erstinformation als Dokument (Nachricht 2). Sonst Vorlage je Produkt mit dem
 * PDF im Kopf (§ 16 VersVermV; nur vollständige Erstinformation).
 * paramsFor: Parameter je freigegebener Fassung, bis v5 freigegeben ist (v4: Vorname, Produkt; v3: Vorname, Link).
 */
export async function outreachMessage(opts: { customerId: string; leadId: string; phone: string; name: string | null; an: Ansprache; source?: string | null }) {
  const who = await ansprechpartner({ customerId: opts.customerId, leadId: opts.leadId, phone: opts.phone, name: opts.name });
  const url = await erstinfoUrlFor(opts.customerId);
  const produkt = outreachProdukt(opts.source);
  const rest = produkt ? [produkt.produkt] : [];
  // PDF der Erstinformation (Ole, 17.11.2026: Erstanschreiben NIE ohne Erstinformation): vollständig in den Kopf der
  // Vorlage, sonst im aktuellen Stand (templates.ts rankOutreach); gar keins → nicht senden (ErstinfoPdfFehltError)
  let document: { link: string; filename: string } | null = null;
  let documentEntwurf: { link: string; filename: string } | null = null;
  let pdfGrund = "";
  try {
    const { erstinfoPdfStand } = await import("@/lib/erstinformation");
    const pdf = await erstinfoPdfStand(opts.customerId);
    if (pdf?.vollstaendig) document = { link: pdf.link, filename: pdf.filename };
    else if (pdf) documentEntwurf = { link: pdf.link, filename: pdf.filename };
    pdfGrund = !pdf ? "nicht_erzeugbar" : pdf.vollstaendig ? "" : `unvollstaendig fehlt=${pdf.fehlt.join(",")}`;
  } catch (err) {
    pdfGrund = `fehler ${(err instanceof Error ? err.message : String(err)).replace(/\d{6,}/g, "#").slice(0, 120)}`;
    console.error("[outreach] Erstinformation als PDF", err instanceof Error ? err.message : err);
  }
  // Diagnose (ohne Personendaten): welcher Stand der Erstinformation ins Erstanschreiben geht und warum
  console.info(`[outreach] Erstinformation customer=${opts.customerId} pdf=${document ? "vollstaendig" : documentEntwurf ? "entwurf" : "keins"}${pdfGrund ? ` grund=${pdfGrund}` : ""}`);
  // Hat der Kontakt uns schon geschrieben (offenes Fenster)? Dann „danke für Ihre Nachricht“, sonst „Anfrage“
  const herkunft: Herkunft = (await prisma.message
    .count({ where: { direction: "inbound", conversation: { customerId: opts.customerId, contactPhone: opts.phone } } })
    .catch(() => 0))
    ? "nachricht"
    : "anfrage";
  // Angaben aus dem Leadformular: der Freitext fragt nicht, was schon bekannt ist (Gesundheitsangaben nie)
  const formular = splitHealthAnswers(
    asFormAnswers((await prisma.lead.findUnique({ where: { id: opts.leadId }, select: { formData: true } }).catch(() => null))?.formData),
  ).normal;
  // Vorlage je Produkt; nur Hausrat angefragt: eigene Fassung „zu Ihrer Hausratversicherung“ (Ole, 18.11.2026)
  // Schon gebucht (Dankeseite des Meta-Formulars): Erstnachricht trotzdem, aber nie mit einer Terminfrage (Ole, 18.11.2026)
  const conv0 = await prisma.conversation
    .findUnique({ where: { customerId_contactPhone: { customerId: opts.customerId, contactPhone: opts.phone } }, select: { id: true } })
    .catch(() => null);
  const gebucht = await hasAppointment(opts.leadId, conv0?.id).catch(() => false);
  const purpose: NoticePurpose = erstanschreibenZweck(opts.source, formular);
  const variant = await abVariantFor(purpose, opts.leadId);
  const kurz = who.kurz || who.firm;
  const first = firstNameOf(opts.name);
  // v6 (Ole, 17.11.2026): Vermittler als Person im Dativ („von Herrn Kannapinn“, Du Vorname), Rückfall Agentur
  const person = (an: Ansprache) => vermittlerName(an, { name: who.vermittler.name, anrede: who.vermittler.anrede, fallback: who.firm || kurz });
  // v10 (Ole, 19.11.2026): feste Frage je Zweck. Beantwortet das Formular genau diese Frage schon (bzw. allgemein: schon
  // gebucht), bekommt der Lead weiter v9 mit der ersten offenen Frage als Platzhalter (maxVersion)
  const v10 = v10Moeglich(opts.source, formular, { gebucht });
  // Parameter je gewählter Vorlage: v10/v11 nur das Tier (TKV); v9 erste offene Frage (ohne „?“), TKV mit Tier davor;
  // v8 Vermittler, erste offene Frage; v6/v7 Thema, Vermittler, Frage; Produkt
  // (v5 mit Tier, v4) bzw. allgemeine Fassung (nur Name), v3 mit Link. Maßgeblich ist der Zweck der gewählten Vorlage
  // (Rückfall auf die allgemeine Fassung hat kein Tier)
  const paramsFor = (p: { version: number; ansprache: Ansprache; purpose?: NoticePurpose }): string[] => {
    if (p.version >= 10) return [first, ...erstanschreibenV10Params({ source: opts.source, an: p.ansprache, formular, purpose: p.purpose ?? purpose })];
    if (p.version >= 9) return [first, ...erstanschreibenV9Params({ source: opts.source, an: p.ansprache, formular, person: person(p.ansprache), kurz, gebucht, purpose: p.purpose ?? purpose })];
    if (p.version >= 8) return [first, ...erstanschreibenV8Params({ source: opts.source, an: p.ansprache, formular, person: person(p.ansprache), kurz, gebucht })];
    if (p.version >= 6) {
      return [first, ...erstanschreibenV6Params({ source: opts.source, an: p.ansprache, formular, person: person(p.ansprache), kurz, gebucht })];
    }
    if ((p.purpose ?? purpose) === "outreach") return p.version >= 4 ? [first] : [first, url];
    if (p.version >= 5) return [first, ...rest, ...(produkt?.purpose === "outreach_tkv" ? [tierWort(produkt.tier, p.ansprache)] : [])];
    if (p.version === 4) return [first, ...rest];
    return [first, url];
  };
  // Höchste Textversion je Zweck (templates.ts rankOutreach): ohne v10 höchstens v9; mit v10 nie die allgemeine
  // Telefonatsfrage für einen Produkt-Lead (Rückfall „outreach“ höchstens v9; reine Hausrat-Leads dürfen die v10 des
  // Privatschutzes bekommen, deren Frage nach bestehenden Verträgen passt)
  const maxVersion = outreachMaxVersion(purpose, v10);
  return {
    who,
    purpose,
    variant,
    v10,
    maxVersion,
    params: paramsFor({ version: v10 ? 10 : 9, ansprache: opts.an }),
    paramsFor,
    legacyParams: [first, url],
    // Knöpfe im offenen Fenster nur, wenn sie zur gestellten Frage passen (v10 feste Frage, sonst Frage 1 bzw. Telefonat)
    textButtons: ersteFrageKnoepfe(opts.source, formular, { gebucht, herkunft }),
    document,
    documentEntwurf,
    pdfGrund,
    herkunft,
    // Freitext im offenen Fenster: v10 bzw. v11 (zugeteilte Fassung) mit denselben Knöpfen, sonst v9
    text: erstanschreibenText({ an: opts.an, kontakt: who.kontakt, name: kurz, vermittler: person(opts.an).dat, vermittlerNom: person(opts.an).nom, source: opts.source, herkunft, formular, gebucht, variant }),
  };
}

/**
 * Erstanschreiben senden (Ole, 17.11.2026): die neueste freigegebene Fassung, beim Produkt vor der allgemeinen
 * (templates.ts rankOutreach). Nie zurück auf eine ältere Fassung (v3 „Ich bin kein Mensch …“), solange eine neuere
 * freigegeben ist. Nach Freitext bzw. einer Vorlage ohne PDF folgt die Erstinformation, sobald das Fenster offen ist.
 */
export async function sendOutreach(opts: { customerId: string; leadId: string; phone: string; name: string | null; an: Ansprache; source: string | null }) {
  const m = await outreachMessage(opts);
  // Ohne jedes PDF der Erstinformation kein Erstanschreiben, auch nicht im offenen Fenster (Ole, 17.11.2026)
  if (!m.document && !m.documentEntwurf) throw new ErstinfoPdfFehltError();
  const notice = await sendWhatsAppNotice({
    customerId: opts.customerId,
    to: opts.phone,
    purpose: m.purpose,
    params: m.params,
    paramsFor: m.paramsFor,
    legacyParams: m.legacyParams,
    textButtons: m.textButtons,
    text: m.text,
    leadId: opts.leadId,
    contactName: opts.name,
    anrede: m.who.kontakt,
    document: m.document,
    // Reine Hausrat-Leads: bis outreach_hausrat freigegeben ist, die allgemeine bzw. die Privatschutz-Fassung
    outreach: {
      fallbackPurposes: m.purpose === "outreach" ? [] : m.purpose === "outreach_hausrat" ? ["outreach", "outreach_privatschutz"] : ["outreach"],
      documentEntwurf: m.documentEntwurf,
      maxVersion: m.maxVersion,
    },
    variant: m.variant,
  });
  // Fenster offen (Freitext): Erstinformation unmittelbar als PDF hinterher (Nachricht 2, § 16 VersVermV; unvollständig
  // im aktuellen Stand, Rückfall Link). Als Vorlage geht das Erstanschreiben nur mit dem PDF im Kopf (rankOutreach).
  if (notice.mode === "text") {
    await sendErstinfo({ conversationId: notice.conversationId, an: opts.an, advisorName: vermittlerName(opts.an, { name: m.who.vermittler.name, anrede: m.who.vermittler.anrede, fallback: m.who.advisor || m.who.firm }).dat });
  }
  return notice;
}

/** Nur frische, noch unbearbeitete Leads anschreiben. */
const OUTREACH_STATUSES = [null, "Neuer Lead"];
const OUTREACH_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/** Ab hier gilt ein Lead ohne Termin als Rückruf-Fall. */
export const CALLBACK_AFTER_MS = 24 * 60 * 60 * 1000;
const CALLBACK_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const CALLBACK_STATUSES = ["Neuer Lead", "Nicht erreicht", "Im Gespräch"];

async function hasAppointment(leadId: string, conversationId?: string | null) {
  const n = await prisma.appointment.count({
    where: {
      status: "booked",
      OR: [
        { leadId },
        ...(conversationId ? [{ conversationId }] : []),
      ],
    },
  });
  return n > 0;
}

export type OutreachResult = {
  customers: number;
  candidates: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

/**
 * Optional nur für einen Kunden (z. B. direkt nach einem neuen Lead).
 * only: nur diese Leads, ohne Alters- und Phasengrenze und ohne Wartezeit (erneut eingetragen ohne bisheriges
 * Gespräch, lib/lead-erneut.ts); source = Produkt der neuen Einsendung fürs Erstanschreiben.
 */
export async function runOutreach(onlyCustomerId?: string, only?: { leadIds: string[]; source?: string | null }): Promise<OutreachResult> {
  const result: OutreachResult = {
    customers: 0,
    candidates: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };
  const agents = await prisma.agentConfig.findMany({
    // Ruhende Konten (Vertrag beendet, lib/ruhend.ts) schreiben niemanden an
    where: { active: true, outreachEnabled: true, customer: { dormantSince: null }, ...(onlyCustomerId ? { customerId: onlyCustomerId } : {}) },
    select: { customerId: true, outreachDelayMin: true },
  });

  for (const agent of agents) {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { customerId: agent.customerId },
      select: { status: true },
    });
    if (account?.status !== "connected") continue;
    result.customers++;

    const now = Date.now();
    const leads = await prisma.lead.findMany({
      where: only
        ? { customerId: agent.customerId, phone: { not: null }, outreachAt: null, erasedAt: null, id: { in: only.leadIds } }
        : {
            customerId: agent.customerId,
            phone: { not: null },
            outreachAt: null,
            createdAt: {
              gte: new Date(now - OUTREACH_MAX_AGE_MS),
              lte: new Date(now - agent.outreachDelayMin * 60 * 1000),
            },
            OR: OUTREACH_STATUSES.map((s) => ({ status: s })),
            // Vermittler telefoniert gerade bzw. Ergebnis fehlt noch (lib/telefonat.ts): Erstanschreiben wartet
            AND: [{ OR: [{ callStartedAt: null }, { callStartedAt: { lt: new Date(now - CALL_PAUSE_MAX_MS) } }] }],
          },
      select: { id: true, name: true, phone: true, waConsent: true, source: true, waUnavailableAt: true, isTest: true },
      take: 50,
    });

    // Freitext (offenes Fenster) = Text der aktuellen Outreach-Vorlage mit Anrede nach Regel;
    // Vorlage passend zu Ansprache und Kontakt (sendWhatsAppNotice → rankTemplates)
    const an = await anspracheOf(agent.customerId);

    for (const lead of leads) {
      result.candidates++;
      const phone = lead.phone!;
      const source = only?.source ?? lead.source;
      const conv = await prisma.conversation.findUnique({
        where: {
          customerId_contactPhone: { customerId: agent.customerId, contactPhone: phone },
        },
        select: { id: true, leadId: true, optedOutAt: true, _count: { select: { messages: true } } },
      });

      // Produkt ohne automatische Nachrichten (Ole, 20.11.2026: PKV-Tarifoptimierung, lib/lead-kontakt-sperre.ts)
      if (ohneAutoNachrichten(source)) {
        logTestLead(lead, "outreach skipped", { reason: "produkt_ohne_nachrichten" });
        await prisma.lead.update({ where: { id: lead.id }, data: { outreachAt: new Date(), outreachStatus: "skipped_produkt" } });
        result.skipped++;
        continue;
      }
      // Nummer schon als „kein WhatsApp“ bekannt (lib/whatsapp/kein-whatsapp.ts): nicht anschreiben, steht oben auf der Anrufliste
      if (lead.waUnavailableAt) {
        logTestLead(lead, "outreach skipped", { reason: "no_whatsapp" });
        await prisma.lead.update({ where: { id: lead.id }, data: { outreachAt: new Date(), outreachStatus: "no_whatsapp" } });
        result.skipped++;
        continue;
      }
      // Einwilligungs-Häkchen im Formular fehlt bzw. „STOPP“: kein WhatsApp (nur E-Mail/Telefon zur Anfrage)
      if (lead.waConsent === "nein" || conv?.optedOutAt) {
        logTestLead(lead, "outreach skipped", { reason: lead.waConsent === "nein" ? "no_consent" : "optout" });
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: lead.waConsent === "nein" ? "skipped_no_consent" : "skipped_optout" },
        });
        result.skipped++;
        continue;
      }

      // Schon über die Buchungsseite (z. B. Dankeseite des Meta-Formulars) gebucht: Erstnachricht trotzdem (Ole,
      // 18.11.2026: Daten und Komplettcheck werden noch abgefragt), aber ohne Terminfrage (outreachMessage, gebucht);
      // nach der Antwort bereitet der Assistent den Termin vor (bot.ts, Strecke nach der Buchung)
      const booked = await hasAppointment(lead.id, conv?.id);
      // Testlead (lib/testlead.ts): der Chat wurde vorher frisch begonnen; schreibt der Admin dazwischen selbst, kommt
      // das Erstanschreiben trotzdem (Ziel ist, den ganzen Ablauf zu erleben).
      if (conv && conv._count.messages > 0 && !lead.isTest) {
        // Lead hat schon selbst geschrieben → der Assistent ist bereits im Gespräch (bzw. übernimmt jetzt).
        await prisma.lead.update({
          where: { id: lead.id },
          data: { outreachAt: new Date(), outreachStatus: "skipped_contact" },
        });
        if (!conv.leadId) {
          await prisma.conversation.update({
            where: { id: conv.id },
            data: { leadId: lead.id },
          });
          // Bisher „Neuer Kontakt“ ohne Assistent: jetzt Lead-Chat, offene Nachricht beantworten (lib/whatsapp/nur-leads.ts)
          const { nachLeadZuordnung } = await import("@/lib/whatsapp/nur-leads");
          await nachLeadZuordnung(conv.id, { antworten: true }).catch((e) => console.error("[outreach] Assistent", e));
        }
        result.skipped++;
        continue;
      }

      try {
        const notice = await sendOutreach({ customerId: agent.customerId, leadId: lead.id, phone, name: lead.name, an, source });
        logTestLead(lead, "outreach sent", { mode: notice.mode, waMessageId: notice.messageId ?? "none", conversation: notice.conversationId, variant: notice.variant, pdfHeader: notice.documentHeader, purpose: notice.purpose, version: notice.version, pdf: notice.pdf });
        // Kam der Status „kein WhatsApp“ schon während des Sendens (Webhook), bleibt „no_whatsapp“ stehen
        await prisma.lead.updateMany({
          where: { id: lead.id, waUnavailableAt: null },
          data: { outreachAt: new Date(), outreachStatus: booked ? "sent_booked" : "sent" },
        });
        // WhatsApp-Erstanschreiben = Kontaktversuch (Zeit bis Erstkontakt).
        await recordLeadProgress(lead.id, "contact_attempt");
        // Keine Antwort → nach wenigen Stunden nachfassen (lib/lead-sequences.ts, „Chat ruht“)
        await restartSilentSequence(lead.id).catch((e) => console.error("[lead-sequences silent]", e));
        result.sent++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logTestLead(lead, "outreach failed", { reason: err instanceof NoTemplateError ? "no_template" : err instanceof ErstinfoPdfFehltError ? "no_pdf" : msg.replace(/\d{6,}/g, "#").slice(0, 120) });
        if (err instanceof WhatsAppUnavailableError) {
          // Festnetznummer (lib/whatsapp/festnetz.ts) bzw. inzwischen „kein WhatsApp“: nichts gesendet, kein neuer Versuch.
          // markLeadNoWhatsApp hat outreachStatus „no_whatsapp“ gesetzt; sonst hier nachtragen.
          await prisma.lead.updateMany({ where: { id: lead.id, outreachAt: null }, data: { outreachAt: new Date(), outreachStatus: "no_whatsapp" } });
          result.skipped++;
          continue;
        }
        if (err instanceof ErstinfoPdfFehltError) {
          // PDF der Erstinformation nicht erzeugbar: nicht senden, erneut versuchen, Vermittler und Admin einmal je Lead
          // Bescheid geben („Erstinformation vervollständigen“)
          const vorher = await prisma.lead.findUnique({ where: { id: lead.id }, select: { outreachStatus: true } }).catch(() => null);
          await prisma.lead.update({ where: { id: lead.id }, data: { outreachStatus: "no_pdf" } });
          if (vorher?.outreachStatus !== "no_pdf") await meldeErstinfoFehlt(agent.customerId).catch((e) => console.error("[outreach] Hinweis Erstinformation", e));
        } else if (err instanceof NoTemplateError) {
          // Kein outreachAt → wird erneut versucht, sobald die Vorlage da ist.
          await prisma.lead.update({
            where: { id: lead.id },
            data: { outreachStatus: "no_template" },
          });
        } else {
          await prisma.lead.update({
            where: { id: lead.id },
            data: { outreachAt: new Date(), outreachStatus: `failed: ${msg.slice(0, 180)}` },
          });
        }
        result.failed++;
        result.errors.push(`${lead.id}: ${msg}`);
      }
    }
  }
  return result;
}

/**
 * Erstanschreiben wartet, weil die Erstinformation nicht als PDF erzeugbar ist: Push an den Vermittler und die Admins
 * mit der nächsten Handlung (Erstinformation vervollständigen). Ohne Personendaten des Leads.
 */
export async function meldeErstinfoFehlt(customerId: string): Promise<void> {
  const { sendToAdmins, sendToBuyersOfCustomer } = await import("@/lib/push");
  const customer = await prisma.customer.findUnique({ where: { id: customerId }, select: { name: true } });
  const tag = `erstinfo-fehlt:${customerId}`;
  await sendToBuyersOfCustomer(customerId, {
    title: "Erstinformation vervollständigen",
    body: "Ein neuer Lead wartet: Die erste WhatsApp geht erst mit Ihrer Erstinformation raus.",
    url: "/buyer/einrichtung?schritt=erstinfo#erstinfo",
    tag,
  }).catch(() => {});
  await sendToAdmins({
    title: `Erstinformation fehlt: ${customer?.name ?? customerId}`,
    body: "Erstanschreiben wartet, weil kein PDF der Erstinformation erzeugbar ist.",
    url: `/admin/neu/kunden/${customerId}`,
    tag,
  }).catch(() => {});
}

/** Grund auf der Anrufliste, wenn kein WhatsApp-Erstanschreiben läuft: neuer Lead, sofort anrufen. */
export const NEUER_LEAD_REASON = "Neuer Lead, noch nicht kontaktiert";

export type CallbackLead = {
  id: string;
  name: string | null;
  phone: string | null;
  source: string | null;
  createdAt: Date;
  reason: string;
  replied: boolean;
  /** Konversation zum Nachlesen vor dem Anruf (falls vorhanden). */
  conversationId: string | null;
  /** Sofort anrufen (kein WhatsApp): steht ganz oben auf Heute/Anrufliste. */
  urgent?: boolean;
  /** Empfohlene Person, noch nicht angerufen: ganz oben, mit Gesprächseinstieg (Modul Empfehlungen & Bewertungen) */
  empfehlung?: { einstieg: string };
};

/** Hat dieser Kunde den WhatsApp-Agenten mit Erstanschreiben aktiv? */
export async function hasWhatsAppOutreach(customerId: string): Promise<boolean> {
  const agent = await prisma.agentConfig.findUnique({
    where: { customerId },
    select: { active: true, outreachEnabled: true },
  });
  return !!agent?.active && !!agent.outreachEnabled;
}

/**
 * Leads, die der Kunde selbst anrufen sollte: offen, kein gebuchter Termin
 * und WhatsApp hat nicht zum Termin geführt (nicht zustellbar oder 24 h nach
 * dem Anschreiben bzw. Eingang noch kein Termin).
 */
export async function getCallbackLeads(customerId: string, scope?: Prisma.LeadWhereInput): Promise<CallbackLead[]> {
  const now = Date.now();
  const leads = await prisma.lead.findMany({
    where: {
      ...(scope ?? {}),
      customerId,
      createdAt: { gte: new Date(now - CALLBACK_WINDOW_MS) },
      AND: [
        { OR: [{ status: null }, { status: { in: CALLBACK_STATUSES } }] },
        // „Nicht erreicht" geklickt → bis zum nächsten Tag ausgeblendet.
        { OR: [{ callbackSnoozedUntil: null }, { callbackSnoozedUntil: { lt: new Date(now) } }] },
      ],
      appointments: { none: { status: "booked" } },
    },
    orderBy: { createdAt: "asc" },
    take: 200,
    select: {
      id: true,
      name: true,
      phone: true,
      source: true,
      createdAt: true,
      firstContactAt: true,
      callStartedAt: true,
      referralLink: { select: { kind: true, lead: { select: { name: true } }, existingCustomer: { select: { firstName: true } } } },
      outreachAt: true,
      outreachStatus: true,
      waConsent: true,
      waUnavailableAt: true,
      // Mail-Strecke (lib/mail-strecke): ohne Nummer läuft der Kontakt per E-Mail, nicht über die Anrufliste
      mailStrecke: { select: { schritt: true } },
      // Letzte Absage (Lead/Berater) → sofort zurückrufen statt 24 h warten.
      appointments: {
        where: {
          OR: [
            { status: "cancelled", cancelledBy: { in: ["lead", "advisor"] } },
            { status: "no_show" },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { cancelledBy: true, status: true },
      },
      conversations: {
        select: {
          id: true,
          _count: { select: { messages: { where: { direction: "inbound" } } } },
        },
      },
    },
  });

  // Ohne WhatsApp-Erstanschreiben (Assistent oder Erstanschreiben aus) schreibt niemand den Lead an: dann sofort anrufen
  // statt erst nach 24 Stunden (Nacht-QA 17.11.2026: neue Leads standen sonst einen Tag lang nirgends auf „Heute“).
  const outreachOn = leads.some((l) => !l.outreachAt) ? await hasWhatsAppOutreach(customerId) : true;
  const out: CallbackLead[] = [];
  for (const l of leads) {
    // Termine, die nur an der Konversation hängen (Altfälle), ebenfalls prüfen.
    const convIds = l.conversations.map((c) => c.id);
    if (convIds.length > 0) {
      const booked = await prisma.appointment.count({
        where: { status: "booked", conversationId: { in: convIds } },
      });
      if (booked > 0) continue;
    }
    // Ohne Nummer und mit laufender Mail-Strecke: kein Anruf möglich, die Strecke meldet sich (Anrufplan nur mit Nummer)
    if (!l.phone && l.mailStrecke && ["neu", "erstmail"].includes(l.mailStrecke.schritt)) continue;
    const replied = l.conversations.some((c) => c._count.messages > 0);
    const status = l.outreachStatus ?? "";

    let reason: string | null = null;
    let urgent = false;
    let empfehlung: CallbackLead["empfehlung"];
    const lastCancel = l.appointments[0]?.cancelledBy;
    if (l.source === EMPFEHLUNG_SOURCE && l.referralLink && l.phone && !l.firstContactAt && !l.callStartedAt && !l.appointments[0]) {
      // Empfehlung: jetzt anrufen (höchste Abschlussquote, Zeit bis zum ersten Anruf zählt). Bis zum ersten Anruf ganz oben.
      const von = l.referralLink.kind === "general" ? null : (l.referralLink.lead?.name ?? l.referralLink.existingCustomer?.firstName ?? null);
      reason = empfehlungReason(von);
      urgent = true;
      empfehlung = { einstieg: gespraechsEinstieg(von) };
    } else if (l.waUnavailableAt && !replied) {
      // Nummer nicht per WhatsApp erreichbar (lib/whatsapp/kein-whatsapp.ts): sofort, ganz oben
      reason = (await istFestnetz(l.phone)) ? FESTNETZ_REASON : KEIN_WHATSAPP_REASON;
      urgent = true;
    } else if (l.appointments[0]?.status === "no_show") {
      reason = "Nicht zum Termin erschienen, neuen Termin vereinbaren";
    } else if (lastCancel === "advisor") {
      reason = "Sie haben den Termin abgelehnt, bitte neuen Termin vereinbaren";
    } else if (lastCancel === "lead") {
      reason = "Lead hat den Termin abgesagt, kurz nachfassen";
    } else if (!l.phone) {
      reason = "Keine Handynummer, bitte per E-Mail/Telefon nachfassen";
    } else if (l.waConsent === "nein" || status === "skipped_no_consent") {
      reason = "Ohne WhatsApp-Einwilligung im Formular: bitte anrufen oder per E-Mail melden";
    } else if (status === "skipped_optout") {
      reason = "Möchte keine WhatsApp-Nachrichten („STOPP“): bitte anrufen oder per E-Mail melden";
    } else if (status.startsWith("failed")) {
      reason = "WhatsApp nicht zustellbar";
    } else if (l.source === EMPFEHLUNG_SOURCE && status === "skipped_contact" && now - l.createdAt.getTime() >= CALLBACK_AFTER_MS) {
      // Empfehlung ohne Erstanschreiben (Rückruf angefordert bzw. selbst geschrieben), schon angerufen, noch kein Termin
      reason = "Empfehlung, noch kein Termin: nachfassen";
    } else if (l.outreachAt && now - l.outreachAt.getTime() >= CALLBACK_AFTER_MS) {
      reason = replied
        ? "Hat im Chat geantwortet, aber keinen Termin gebucht"
        : "Keine Reaktion auf WhatsApp";
    } else if (!l.outreachAt && !outreachOn && !replied && now - l.createdAt.getTime() < CALLBACK_AFTER_MS) {
      reason = NEUER_LEAD_REASON;
      urgent = true;
    } else if (!l.outreachAt && now - l.createdAt.getTime() >= CALLBACK_AFTER_MS) {
      reason = "Nicht per WhatsApp angeschrieben";
    }
    if (reason) {
      out.push({
        id: l.id,
        name: l.name,
        phone: l.phone,
        source: l.source,
        createdAt: l.createdAt,
        reason,
        replied,
        conversationId: l.conversations[0]?.id ?? null,
        ...(urgent ? { urgent: true } : {}),
        ...(empfehlung ? { empfehlung } : {}),
      });
    }
  }
  // Empfehlungen ganz oben, dann „Kein WhatsApp“ (jeweils jüngster oben), sonst wie bisher nach Eingang
  const top = out.filter((c) => c.urgent).sort((x, y) => Number(!!y.empfehlung) - Number(!!x.empfehlung) || y.createdAt.getTime() - x.createdAt.getTime());
  return [...top, ...out.filter((c) => !c.urgent)];
}
