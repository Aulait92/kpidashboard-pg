"use server";

import { entscheidungsCallStand } from "@/lib/vertrieb/entscheidungs-call-server";
import { entscheidungsCallHinweis, type EntscheidungsCall } from "@/lib/vertrieb/entscheidungs-call";
import { revalidatePath } from "next/cache";
import { getCurrentSession } from "@/lib/auth";
import { baueAngebotsMail, getAppUrl, sendOfferEmail, type AngebotsMailInhalt } from "@/lib/email";
import { createOffer, updateDraftOffer, type OfferFormInput } from "@/lib/offers";
import { abschlussBonusJetzt, berlinTagesendeIso, berlinTodayIso, isIsoDate, offerSetupDiscount, prepayPossible } from "@/lib/offer-pricing";
import { prisma } from "@/lib/prisma";
import { nachtraeglichErsteIso } from "@/lib/vertrag-laufzeit";
import { ersteWocheAus, ersteWocheName } from "@/lib/ppl/erste-woche-shared";
import { customerGreeting, logOfferActivity, offerAdminHref, type OfferTarget } from "@/lib/offer-links";
import { AUDIENCE_LABEL, getPresentation, isAudience, rechnerUrl, type Audience } from "@/lib/vertrieb/praesentationen";
import { aktiverVerkaufsLink, verkaufsLinkErstellen } from "@/lib/vertrieb/verkaufspraesentation-server";

/** Extras der Angebotsmail: Rechner-Link und/oder Präsentation (PDF) der gewählten Zielgruppe. */
/** praesentationLink: Link zur Web-Präsentation (/praesentation/<token>, 14 Tage), nur bei Vertriebskontakten. */
export type OfferMailExtras = { rechner?: boolean; praesentation?: boolean; praesentationLink?: boolean; audience?: Audience; du?: boolean; ohneEntscheidungsCall?: boolean };

async function requireAdmin() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN")
    throw new Error("Nicht berechtigt.");
  return session;
}

export type OfferActionResult =
  | { ok: true; offerId?: string; /** Angebotsmail: welche Variante zum Entscheidungs-Call rausging */ hinweis?: string }
  | { ok: false; error: string };

/** Konditionen eines Angebots als Zeile im Verlauf (Erstellen, Bearbeiten). */
function konditionenZeile(offer: { setupFee: unknown; setupDiscount: unknown; setupDiscountLabel: string | null; monthlyFee: unknown; abschlussBonus: unknown }) {
  return `${Number(offer.setupFee).toLocaleString("de-DE")} € Setup${offer.setupDiscount != null ? ` (nach ${offer.setupDiscountLabel ?? "Empfehlungsrabatt"})` : ""} · ${Number(offer.monthlyFee).toLocaleString("de-DE")} € / Monat (netto)${
    offer.abschlussBonus != null ? ` · Abschlussbonus ${Number(offer.abschlussBonus).toLocaleString("de-DE")} €` : ""
  }`;
}

export async function createOfferAction(
  target: OfferTarget,
  input: OfferFormInput,
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  try {
    const offer = await createOffer(target, input, session.userId);
    await logOfferActivity(
      offer,
      `Angebot ${offer.number} erstellt`,
      konditionenZeile(offer),
      session.userId,
    );
    revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote)
    return { ok: true, offerId: offer.id };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Angebot konnte nicht erstellt werden.",
    };
  }
}

/**
 * Entwurf bearbeiten (Ole, 20.11.2026): gleiche Nummer, gleicher Link, gleiche Version. Nur solange das Angebot noch ein
 * Entwurf ist (lib/offers.ts updateDraftOffer prüft das atomar beim Speichern).
 */
export async function updateOfferDraftAction(offerId: string, input: OfferFormInput): Promise<OfferActionResult> {
  const session = await requireAdmin();
  try {
    const offer = await updateDraftOffer(offerId, input);
    await logOfferActivity(
      offer,
      `Angebot ${offer.number} bearbeitet`,
      konditionenZeile(offer),
      session.userId,
    );
    revalidatePath(offerAdminHref(offer));
    revalidatePath(`/angebot/${offer.token}`);
    revalidatePath("/admin/kunden", "layout");
    revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote)
    return { ok: true, offerId: offer.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Angebot konnte nicht gespeichert werden." };
  }
}

export async function markOfferSentAction(
  offerId: string,
): Promise<OfferActionResult> {
  await requireAdmin();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, dealId: true, salesContactId: true, number: true, status: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "draft") {
    await prisma.offer.update({
      where: { id: offer.id },
      data: { status: "sent", sentAt: new Date() },
    });
  }
  if (offer.salesContactId) await logOfferActivity(offer, `Angebot ${offer.number} als verschickt markiert`);
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote)
  return { ok: true };
}

type AngebotsMailVorbereitet = {
  offer: NonNullable<Awaited<ReturnType<typeof prisma.offer.findUnique>>> & { email: string };
  audience: Audience;
  rechner: string | null;
  praesentationUrl: string | null;
  attachment: { filename: string; content?: Buffer } | null;
  ohneCall: boolean;
  entscheidungsCall: EntscheidungsCall | null;
  inhalt: Omit<AngebotsMailInhalt, "attachment">;
  hinweise: string[];
};

/**
 * Prüfungen und Inhalt der Angebotsmail, gemeinsam für Versand und Vorschau (Ole, 20.11.2026).
 * „vorschau“: ohne Seiteneffekte. Kein Präsentations-Link wird erstellt oder verlängert (bestehender aktiver Link
 * bzw. Platzhalter), die PDF wird nicht geladen (nur der Dateiname), nichts wird gespeichert.
 */
async function angebotsMailVorbereiten(
  offerId: string,
  extras: OfferMailExtras,
  userId: string,
  modus: "senden" | "vorschau",
): Promise<{ ok: true; m: AngebotsMailVorbereitet } | { ok: false; error: string }> {
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (!offer.email)
    return {
      ok: false,
      error: "Im Angebot ist keine E-Mail-Adresse hinterlegt.",
    };
  if (offer.status === "superseded" || offer.status === "accepted") {
    return { ok: false, error: "Dieses Angebot ist nicht mehr offen." };
  }
  // „Nie kontaktieren“ bzw. Sperrliste (Ole, 19.11.2026): keine Mail aus der App, auch keine Angebotsmail
  if (offer.salesContactId && (await import("@/lib/vertrieb/sperrliste").then((m) => m.kontaktGesperrt(offer.salesContactId)))) {
    return { ok: false, error: "Dieser Kontakt möchte nicht mehr angeschrieben werden (Kontaktakte → Nie kontaktieren)." };
  }
  const hinweise: string[] = [];
  // Pay-per-Lead + Software: immer die eigene Präsentation (Ole, 20.11.2026)
  const audience: Audience = offer.package === "ppl_software" ? "ppl" : isAudience(extras.audience) ? extras.audience : "vertreter";
  let attachment: { filename: string; content?: Buffer } | null = null;
  if (extras.praesentation) {
    const nichtDa = `Für ${AUDIENCE_LABEL[audience]} ist noch keine PDF-Präsentation hinterlegt (Vertrieb → Unterlagen).`;
    const mitPdf = (name: string) => (name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`);
    if (modus === "senden") {
      const file = await getPresentation(audience, "pdf");
      if (!file) return { ok: false, error: nichtDa };
      attachment = { filename: mitPdf(file.fileName), content: Buffer.from(file.data) };
    } else {
      // Vorschau: nur den Dateinamen lesen, nicht die PDF
      const file = await prisma.salesPresentation.findUnique({ where: { audience_format: { audience, format: "pdf" } }, select: { fileName: true } });
      if (!file) return { ok: false, error: nichtDa };
      attachment = { filename: mitPdf(file.fileName) };
    }
  }
  const rechner = extras.rechner && audience !== "ppl" ? rechnerUrl(getAppUrl(), audience, offer.products) : null;
  // Link zur Präsentation: aktiven Link verlängern bzw. neu erstellen (Fassung wie gewählt)
  let praesentationUrl: string | null = null;
  if (extras.praesentationLink) {
    if (!offer.salesContactId) return { ok: false, error: "Den Präsentations-Link gibt es nur bei Vertriebskontakten." };
    if (modus === "senden") {
      const link = await verkaufsLinkErstellen(offer.salesContactId, audience, userId);
      if (!link) return { ok: false, error: "Kontakt nicht gefunden." };
      praesentationUrl = `${getAppUrl()}/praesentation/${link.token}`;
    } else {
      // Vorschau: nichts anlegen; bestehenden aktiven Link zeigen, sonst Platzhalter (wird beim Senden erstellt)
      const aktiv = await aktiverVerkaufsLink(offer.salesContactId);
      praesentationUrl = `${getAppUrl()}/praesentation/${aktiv ? aktiv.token : "neuer-link"}`;
      if (!aktiv) hinweise.push("Der Präsentations-Link wird beim Senden erstellt.");
    }
  }
  // Entscheidungs-Call (Ole, 17.11.2026), geprüft beim Versand: schon gebucht → Termin mit Link zum Verschieben,
  // sonst persönlicher Buchungslink (signiert, hängt direkt am Kontakt), solange online buchbar
  // Bitte um den Entscheidungs-Call weglassen (Ole, 18.11.2026): Häkchen im Versand, gilt dann auch für Seite und Erinnerung
  const ohneCall = !!extras.ohneEntscheidungsCall;
  const entscheidungsCall = offer.salesContactId && !ohneCall ? await entscheidungsCallStand(offer.salesContactId) : null;
  const disc = offerSetupDiscount(offer);
  const inhalt: Omit<AngebotsMailInhalt, "attachment"> = {
    entscheidungsCall,
    discount: disc
      ? { label: offer.setupDiscountLabel || "Empfehlungsrabatt", discount: disc.discount, list: disc.list, fee: Number(offer.setupFee), anyTerm: offer.customerChoosesTerm }
      : null,
    bonus: offer.isTest ? null : abschlussBonusJetzt(offer),
    bonusSpaeter: offer.allowPayLater,
    // Vorauszahlung vereinbart oder zur Wahl: Fälligkeit mit der Annahme (Ole, 19.11.2026)
    vorauszahlung: (offer.annualPrepay || offer.annualChoice) && prepayPossible(offer.term),
    // Zahlung nachträglich (Ole, 19.11.2026): Zeile zur Zahlung statt Vorauszahlung
    nachtraeglich: offer.paymentInArrears
      ? { ersteIso: offer.startDate ? nachtraeglichErsteIso(offer.startDate.toISOString().slice(0, 10)) : null, setup: Number(offer.setupFee) }
      : null,
    // Erste Woche (Pay-per-Lead + Software): Menge, Preis je Lead, Summe, Steuer
    ersteWoche: (() => {
      const w = ersteWocheAus(offer);
      return w ? { productKey: w.productKey, name: ersteWocheName(w), price: w.price, quantity: w.quantity } : null;
    })(),
    rechnerUrl: rechner,
    praesentationUrl,
    du: !!extras.du,
    greeting: await customerGreeting(offer, !!extras.du),
    number: offer.number,
    offerUrl: `${getAppUrl()}/angebot/${offer.token}`,
    validUntil: offer.validUntil,
  };
  return { ok: true, m: { offer: { ...offer, email: offer.email }, audience, rechner, praesentationUrl, attachment, ohneCall, entscheidungsCall, inhalt, hinweise } };
}

export type OfferMailPreview =
  | { ok: true; an: string; betreff: string; html: string; anhang?: string; hinweise?: string[] }
  | { ok: false; error: string };

/** Vorschau der Angebotsmail: genau die Mail, die „Jetzt senden“ verschickt, ohne Seiteneffekte (Ole, 20.11.2026). */
export async function previewOfferEmailAction(offerId: string, extras: OfferMailExtras = {}): Promise<OfferMailPreview> {
  const session = await requireAdmin();
  try {
    const r = await angebotsMailVorbereiten(offerId, extras, session.userId, "vorschau");
    if (!r.ok) return r;
    const { m } = r;
    const mail = baueAngebotsMail({ ...m.inhalt, attachment: m.attachment });
    return {
      ok: true,
      an: m.offer.email,
      betreff: mail.subject,
      html: mail.html,
      ...(m.attachment ? { anhang: m.attachment.filename } : {}),
      ...(m.hinweise.length ? { hinweise: m.hinweise } : {}),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Vorschau konnte nicht geladen werden." };
  }
}

export async function sendOfferEmailAction(
  offerId: string,
  extras: OfferMailExtras = {},
): Promise<OfferActionResult> {
  const session = await requireAdmin();
  const r = await angebotsMailVorbereiten(offerId, extras, session.userId, "senden");
  if (!r.ok) return r;
  const { offer, audience, rechner, praesentationUrl, ohneCall, entscheidungsCall, inhalt } = r.m;
  const attachment = r.m.attachment?.content ? { filename: r.m.attachment.filename, content: r.m.attachment.content } : null;
  const res = await sendOfferEmail({
    ...inhalt,
    attachment,
    to: offer.email,
    replyTo: process.env.OFFER_REPLY_TO ?? session.email ?? null,
  });
  if (!res.ok) return { ok: false, error: res.error };
  await prisma.offer.update({
    where: { id: offer.id },
    // Anrede merken: Zahlungserinnerung und weitere Mails zum Angebot folgen ihr
    data: { status: "sent", sentAt: offer.sentAt ?? new Date(), mailDu: !!extras.du, ohneEntscheidungsCall: ohneCall },
  });
  await logOfferActivity(
    offer,
    `Angebot ${offer.number} per E-Mail an ${offer.email} gesendet${
      rechner || attachment || praesentationUrl
        ? ` (mit ${[rechner ? "Rechner-Link" : null, attachment ? `${AUDIENCE_LABEL[audience]}-Präsentation` : null, praesentationUrl ? "Präsentations-Link" : null]
            .filter(Boolean)
            .join(" und ")})`
        : ""
    }`,
    // Vollständige Mail im Verlauf (Empfänger, Betreff, Anhang, Text)
    [
      `An: ${offer.email}`,
      res.subject ? `Betreff: ${res.subject}` : null,
      attachment ? `Anhang: ${attachment.filename}` : null,
      "",
      res.text ?? "",
    ]
      .filter((l) => l !== null)
      .join("\n")
      .trim(),
    session.userId,
    "EMAIL",
  );
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote)
  return { ok: true, ...(entscheidungsCall ? { hinweis: entscheidungsCallHinweis(entscheidungsCall) } : {}) };
}

/**
 * Angebot löschen (z. B. Entwurf mit Fehler). Nur, solange es nicht angenommen bzw.
 * bezahlt ist und kein Onboarding daran hängt. Die vorherige Version wird wieder aktuell.
 */
export async function deleteOfferAction(offerId: string): Promise<OfferActionResult> {
  await requireAdmin();
  const offer = await prisma.offer.findUnique({
    where: { id: offerId },
    select: { id: true, dealId: true, salesContactId: true, number: true, status: true, paymentStatus: true, acceptedAt: true, stripeCustomerId: true },
  });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.status === "accepted" || offer.acceptedAt) return { ok: false, error: "Angenommene Angebote lassen sich nicht löschen." };
  if (offer.paymentStatus && offer.paymentStatus !== "none") return { ok: false, error: "Zu diesem Angebot gibt es schon eine Zahlung – bitte nicht löschen." };
  if (await prisma.onboarding.findFirst({ where: { offerId: offer.id }, select: { id: true } })) {
    return { ok: false, error: "An diesem Angebot hängt bereits ein Onboarding." };
  }
  const owner = offer.salesContactId ? { salesContactId: offer.salesContactId } : offer.dealId ? { dealId: offer.dealId } : null;
  await prisma.$transaction(async (tx) => {
    await tx.offer.delete({ where: { id: offer.id } });
    if (!owner || offer.status === "superseded") return;
    // Vorherige Version wieder aktuell machen (sie wurde beim Erstellen dieser Version ersetzt)
    const prev = await tx.offer.findFirst({ where: { ...owner, status: "superseded" }, orderBy: { version: "desc" }, select: { id: true, sentAt: true } });
    if (prev) await tx.offer.update({ where: { id: prev.id }, data: { status: prev.sentAt ? "sent" : "draft" } });
  });
  if (offer.salesContactId) await logOfferActivity(offer, `Angebot ${offer.number} gelöscht`);
  revalidatePath(offerAdminHref(offer));
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote)
  return { ok: true };
}

/**
 * Frist des Abschlussbonus verschieben (Ole, 16.11.2026): gilt bis 23:59 Uhr (Berlin) des gewählten Tages.
 * Nur solange die Einrichtung noch nicht bezahlt ist.
 */
export async function setAbschlussBonusAction(offerId: string, input: { bis: string }): Promise<OfferActionResult> {
  const session = await requireAdmin();
  if (!isIsoDate(input.bis)) return { ok: false, error: "Bitte ein gültiges Datum wählen." };
  if (input.bis < berlinTodayIso()) return { ok: false, error: "Die Frist kann nicht in der Vergangenheit liegen." };
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.abschlussBonus == null) return { ok: false, error: "Dieses Angebot hat keinen Abschlussbonus." };
  if (offer.abschlussBonusGewaehrt != null || offer.paymentStatus === "paid" || offer.paymentStatus === "processing") {
    return { ok: false, error: "Die Einrichtung ist schon bezahlt." };
  }
  const bis = berlinTagesendeIso(input.bis);
  await prisma.offer.update({ where: { id: offerId }, data: { abschlussBonusBis: bis } });
  if (offer.salesContactId || offer.dealId) {
    await logOfferActivity(offer, `Abschlussbonus ${offer.number}: Frist bis ${input.bis.split("-").reverse().join(".")}, 23:59 Uhr`, undefined, session.userId);
  }
  revalidatePath(offerAdminHref(offer));
  revalidatePath(`/angebot/${offer.token}`);
  return { ok: true };
}

/**
 * Zahlungserinnerung am Angebot (Ole, 16.11.2026): „Zahlung erinnern am“ (leer = Standardplan),
 * Anrede der Erinnerung und „Später zahlen erlauben“ (Option auf der Angebotsseite).
 */
export async function setPaymentReminderAction(
  offerId: string,
  input: { date?: string | null; du?: boolean; allowPayLater?: boolean },
): Promise<OfferActionResult> {
  await requireAdmin();
  const { setzeErinnerungAdmin } = await import("@/lib/angebot-zahlungserinnerung-server");
  const res = await setzeErinnerungAdmin(offerId, input);
  if (!res.ok) return res;
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { dealId: true, salesContactId: true, token: true } });
  if (offer) {
    revalidatePath(offerAdminHref(offer));
    revalidatePath(`/angebot/${offer.token}`);
  }
  revalidatePath("/admin/vertrieb/angebote");
  return { ok: true };
}

/**
 * Angebot als abgelehnt markieren (Ole, 18.11.2026): Grund, optionale Notiz, Kontakt auch verloren (Standard ja) und
 * „Später erneut ansprechen am …“. Logik: lib/vertrieb/angebot-ablehnen-server.ts.
 */
export async function declineOfferAction(
  offerId: string,
  input: { grund?: string | null; notiz?: string | null; kontaktVerloren?: boolean; spaeterAm?: string | null },
): Promise<OfferActionResult> {
  await requireAdmin();
  const { angebotAblehnen } = await import("@/lib/vertrieb/angebot-ablehnen-server");
  const res = await angebotAblehnen(offerId, input);
  if (!res.ok) return res;
  await revalidateOffer(offerId);
  const hinweis = [res.verloren ? "Kontakt als verloren markiert" : null, res.spaeterAm ? "Aufgabe „Wieder melden“ angelegt" : null].filter(Boolean).join(", ");
  return { ok: true, ...(hinweis ? { hinweis } : {}) };
}

/** „Wieder öffnen“: vorheriger Status, solange das Angebot noch gültig wäre. */
export async function reopenOfferAction(offerId: string): Promise<OfferActionResult> {
  await requireAdmin();
  const { angebotWiederOeffnen } = await import("@/lib/vertrieb/angebot-ablehnen-server");
  const res = await angebotWiederOeffnen(offerId);
  if (!res.ok) return res;
  await revalidateOffer(offerId);
  return { ok: true };
}

async function revalidateOffer(offerId: string) {
  const offer = await prisma.offer.findUnique({ where: { id: offerId }, select: { dealId: true, salesContactId: true, token: true } });
  if (offer) {
    revalidatePath(offerAdminHref(offer));
    revalidatePath(`/angebot/${offer.token}`);
  }
  revalidatePath("/admin/vertrieb", "layout");
  revalidatePath("/admin/kunden", "layout");
  revalidatePath("/admin/heute", "layout");
  revalidatePath("/admin/neu", "layout"); // neuer Admin (Kontaktakte, Angebote, Termine)
}

/** Überweisung am Angebot erlauben bzw. Zahlungsziel ändern (nur auf Anfrage des Kunden, Ole 17.11.2026). */
export async function setBankTransferAction(offerId: string, input: { allow: boolean; days?: string | number | null }): Promise<OfferActionResult> {
  const session = await requireAdmin();
  const { ueberweisungAktiv, parseZahlungsziel } = await import("@/lib/mahnwesen");
  if (!ueberweisungAktiv()) return { ok: false, error: "Überweisung ist noch nicht freigeschaltet." };
  const offer = await prisma.offer.findUnique({ where: { id: offerId } });
  if (!offer) return { ok: false, error: "Angebot nicht gefunden." };
  if (offer.isTest) return { ok: false, error: "Testangebote laufen ohne Zahlung." };
  if (offer.zahlweise || offer.paymentStatus === "paid" || offer.paymentStatus === "processing" || offer.stripeScheduleId) {
    return { ok: false, error: "Die Zahlung ist bereits eingerichtet." };
  }
  const days = parseZahlungsziel(input.days);
  if (offer.allowBankTransfer === input.allow && offer.bankTransferDays === days) return { ok: true };
  await prisma.offer.update({ where: { id: offer.id }, data: { allowBankTransfer: input.allow, bankTransferDays: days } });
  await logOfferActivity(
    offer,
    input.allow ? `Überweisung erlaubt (${offer.number}, Zahlungsziel ${days} Tage)` : `Überweisung nicht mehr erlaubt (${offer.number})`,
    undefined,
    session.userId,
  );
  revalidatePath(offerAdminHref(offer));
  revalidatePath(`/angebot/${offer.token}`);
  revalidatePath("/admin/vertrieb/angebote");
  return { ok: true };
}
