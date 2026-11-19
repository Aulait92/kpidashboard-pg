// Angebot als abgelehnt markieren bzw. wieder öffnen (Ole, 18.11.2026). Regeln: lib/vertrieb/angebot-ablehnen.ts.
//
// Ablehnen: Status „declined“ mit Zeitpunkt, Grund, Notiz und Status davor; Eintrag im Verlauf. Damit enden die
// Annahme auf /angebot/[token] (Hinweis statt Formular), Zahlungserinnerungen, Abschlussbonus-Hinweise und alle Listen
// offener Angebote (alle fragen den Status ab). Zusätzlich hier: offene Angebotsaufgaben (Nachfassen, Zahlung offen)
// werden erledigt und ein laufendes Später-Follow-up gestoppt. Optional Kontakt verloren (gleicher Grund, gleiche
// Logik wie „Stufe ändern“, alle offenen Aufgaben erledigt) und „Später erneut ansprechen am …“ (Aufgabe „Wieder
// melden“ wie beim Ergebnis „Später wieder“; das Später-Follow-up per Mail läuft bei Verloren nicht).

import { prisma } from "@/lib/prisma";
import { logOfferActivity } from "@/lib/offer-links";
import { berlinTodayIso, isIsoDate, PRICE_LIST } from "@/lib/offer-pricing";
import { audit } from "@/lib/audit";
import { fmtTag } from "@/lib/angebot-zahlungserinnerung";
import { fromDayKey } from "@/lib/vertrieb/dates";
import { AGAIN_TASK, stopFollowup } from "@/lib/vertrieb/followup";
import { setzeStufe } from "@/lib/vertrieb/stufe";
import { ablehnenPruefen, ablehnGrundLabel, istAblehnGrund, istAngebotsAufgabe, kannWiederOeffnen, statusVorAblehnung } from "@/lib/vertrieb/angebot-ablehnen";

const STATUS_LABEL: Record<string, string> = { draft: "Entwurf", sent: "Verschickt", accepted: "Angenommen" };

export type AblehnenEingabe = {
  grund?: string | null;
  notiz?: string | null;
  /** Vertriebskontakt auch als verloren markieren (Standard im Blatt: ja) */
  kontaktVerloren?: boolean;
  /** YYYY-MM-DD: Aufgabe „Wieder melden“ an dem Tag */
  spaeterAm?: string | null;
};

export type AblehnenErgebnis =
  | { ok: true; aufgaben: number; followupGestoppt: boolean; verloren: boolean; spaeterAm: string | null }
  | { ok: false; error: string };

export async function angebotAblehnen(offerId: string, input: AblehnenEingabe, now = new Date()): Promise<AblehnenErgebnis> {
  const grund = istAblehnGrund(input.grund) ? input.grund : "SONSTIGES";
  const notiz = input.notiz?.trim().slice(0, 1000) || null;
  const spaeterAm = input.spaeterAm?.trim() || null;
  if (spaeterAm && (!isIsoDate(spaeterAm) || spaeterAm <= berlinTodayIso(now))) return { ok: false, error: "„Später erneut ansprechen“ bitte mit einem Datum ab morgen." };

  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  const check = ablehnenPruefen(offer);
  if (!check.ok) return check;
  if (offer.status === "accepted" && (await prisma.onboarding.findFirst({ where: { offerId: offer.id }, select: { id: true } }))) {
    return { ok: false, error: "An diesem Angebot hängt bereits ein Onboarding." };
  }

  // Nur aus dem gelesenen Status heraus (zwei Klicks bzw. Annahme gleichzeitig: nur einer gewinnt)
  const done = await prisma.offer.updateMany({
    where: { id: offer.id, status: offer.status },
    data: { status: "declined", declinedAt: now, declineReason: grund, declineNote: notiz, declinedPrevStatus: offer.status },
  });
  if (done.count !== 1) return { ok: false, error: "Das Angebot wurde gerade geändert. Bitte die Seite neu laden." };

  const contactId = offer.salesContactId;
  const verloren = !!input.kontaktVerloren && !!contactId;
  let aufgaben = 0;
  let followupGestoppt = false;
  if (contactId) {
    // Verloren: alle offenen Aufgaben enden (wie beim Ergebnis „Kein Interesse / Verloren“), sonst die zum Angebot
    const offen = await prisma.salesTask.findMany({ where: { contactId, doneAt: null }, select: { id: true, title: true } });
    const ids = offen.filter((t) => verloren || istAngebotsAufgabe(t.title)).map((t) => t.id);
    if (ids.length) aufgaben = (await prisma.salesTask.updateMany({ where: { id: { in: ids }, doneAt: null }, data: { doneAt: now } })).count;
  }

  const label = ablehnGrundLabel(grund);
  await logOfferActivity(
    offer,
    `Angebot ${offer.number} abgelehnt: ${label}`,
    [
      notiz,
      aufgaben ? `${aufgaben} offene Aufgabe${aufgaben === 1 ? "" : "n"} erledigt.` : null,
      offer.status === "accepted" ? "Zahlungserinnerungen beendet." : null,
      spaeterAm && contactId ? `Später erneut ansprechen am ${fmtTag(spaeterAm)}.` : null,
    ]
      .filter(Boolean)
      .join("\n") || null,
  );
  if (contactId) {
    followupGestoppt = await stopFollowup(contactId, `Angebot ${offer.number} abgelehnt`);
    if (verloren) {
      await setzeStufe(contactId, "VERLOREN", { lossReason: grund });
      // „Kunde: Vertrag“ stimmt nicht mehr, solange noch kein Kundenkonto besteht
      await prisma.salesContact.updateMany({ where: { id: contactId, customerStage: "VERTRAG", customerId: null }, data: { customerStage: null } });
    }
    if (spaeterAm) {
      await prisma.salesTask.create({
        data: { contactId, title: AGAIN_TASK, type: "ANRUF", dueAt: fromDayKey(spaeterAm), note: `Angebot ${offer.number} abgelehnt (${label}). Später erneut ansprechen.` },
      });
    }
  }
  return { ok: true, aufgaben, followupGestoppt, verloren, spaeterAm: contactId ? spaeterAm : null };
}

/** Kontakt wird als verloren markiert und hat ein offenes Angebot: „Offenes Angebot auch als abgelehnt markieren?“ */
export async function offenesAngebotAblehnen(contactId: string, offerId: string, grund: string | null, now = new Date()): Promise<AblehnenErgebnis> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { salesContactId: true } });
  if (!offer || offer.salesContactId !== contactId) return { ok: false, error: "Angebot nicht gefunden." };
  return angebotAblehnen(offerId, { grund, kontaktVerloren: false }, now);
}

export type WiederOeffnenErgebnis = { ok: true; status: string } | { ok: false; error: string };

/**
 * „Wieder öffnen“: vorherigen Status herstellen, solange das Angebot noch gültig wäre.
 * Jahresvorauszahlung (Ole, 19.11.2026): Ein nicht angenommenes Angebot mit 12 Monaten und gespeicherten 2 geschenkten
 * Monaten (Stand bis 18.11.2026) bekommt dabei den aktuellen Standard (3), wie die offenen Angebote in der Migration
 * 20261119000300_jahr_3_monate; Eintrag im Änderungsprotokoll (AuditLog „offer.jahr_3_monate“) und im Verlauf.
 */
export async function angebotWiederOeffnen(offerId: string, now = new Date()): Promise<WiederOeffnenErgebnis> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status !== "declined") return { ok: false, error: "Das Angebot ist nicht abgelehnt." };
  if (!kannWiederOeffnen(offer, now)) return { ok: false, error: "Das Angebot ist abgelaufen. Bitte eine neue Version erstellen." };
  const owner = offer.salesContactId ? { salesContactId: offer.salesContactId } : offer.dealId ? { dealId: offer.dealId } : null;
  if (owner && (await prisma.offer.findFirst({ where: { ...owner, id: { not: offer.id }, createdAt: { gt: offer.createdAt }, status: { not: "superseded" } }, select: { id: true } }))) {
    return { ok: false, error: "Es gibt schon eine neuere Version dieses Angebots." };
  }
  const status = statusVorAblehnung(offer);
  const freiNeu = status !== "accepted" && !offer.acceptedAt && offer.term === "12m" && offer.annualFreeMonths === 2 ? PRICE_LIST.annualFreeMonths : null;
  const done = await prisma.offer.updateMany({
    where: { id: offer.id, status: "declined" },
    data: { status, declinedAt: null, declineReason: null, declineNote: null, declinedPrevStatus: null, ...(freiNeu != null ? { annualFreeMonths: freiNeu } : {}) },
  });
  if (done.count !== 1) return { ok: false, error: "Das Angebot wurde gerade geändert. Bitte die Seite neu laden." };
  if (freiNeu != null) {
    await audit("offer.jahr_3_monate", { entity: "Offer", entityId: offer.id, details: { number: offer.number, alt: 2, neu: freiNeu, anlass: "wieder geöffnet" } });
  }
  await logOfferActivity(
    offer,
    `Angebot ${offer.number} wieder geöffnet`,
    `Status wieder: ${STATUS_LABEL[status]}. Vorher abgelehnt (${ablehnGrundLabel(offer.declineReason)}).${freiNeu != null ? ` Jahreszahlung jetzt mit ${freiNeu} geschenkten Monaten (vorher 2).` : ""}`,
  );
  return { ok: true, status };
}
