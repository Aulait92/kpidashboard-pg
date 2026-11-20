// Vertriebspräsentation (Ole, 15.11.2026): Laden für Admin und Interessenten, Link je Kontakt (14 Tage, beendbar),
// Aufrufe protokollieren. Folien und Preise: verkaufspraesentation.ts (reine Funktionen).

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { abschlussBonusJetzt } from "@/lib/offer-pricing";
import { kundenkontoAus } from "@/lib/ppl/kundenkonto";
import {
  aktuellesAngebot,
  audienceFuer,
  isVerkaufsAudience,
  paketDaten,
  verkaufsCss,
  verkaufsFolien,
  type AngebotFuerFolien,
  type VerkaufsAudience,
} from "@/lib/vertrieb/verkaufspraesentation";

export const VERKAUF_LINK_TAGE = 14;
/** Wiederholte Aufrufe innerhalb dieser Zeit zählen als einer (Neuladen, Blättern auf dem Handy). */
const AUFRUF_PAUSE_MS = 30 * 60_000;
const TOKEN_RE = /^[A-Za-z0-9_-]{20,64}$/;

const num = (v: unknown) => (v == null ? null : Number(v));

type OfferRow = Awaited<ReturnType<typeof prisma.offer.findMany>>[number];

export function angebotFuerFolien(o: OfferRow): AngebotFuerFolien {
  return {
    number: o.number,
    company: o.company,
    contactName: o.contactName,
    package: o.package,
    vermittlerTyp: o.vermittlerTyp,
    term: o.term,
    products: o.products,
    setupFee: Number(o.setupFee),
    monthlyFee: Number(o.monthlyFee),
    seats: o.seats,
    seatsIncluded: o.seatsIncluded,
    seatMonthly: num(o.seatMonthly),
    bestandMonthly: num(o.bestandMonthly),
    empfehlungMonthly: num(o.empfehlungMonthly),
    annualPrepay: o.annualPrepay,
    annualFreeMonths: o.annualFreeMonths,
    annualChoice: o.annualChoice,
    customerChoosesTerm: o.customerChoosesTerm,
    setupDiscount: num(o.setupDiscount),
    introMonthlyFee: num(o.introMonthlyFee),
    introMonths: o.introMonths,
    abschlussBonus: abschlussBonusJetzt(o),
    allowPayLater: o.allowPayLater,
    kundenkonto: kundenkontoAus(o),
  };
}

/** Folien eines Kontakts: Zielgruppe (Vorgabe, sonst Angebot bzw. Kontakt), Preise aus dem aktuellen Angebot. */
export async function ladeVerkaufsPraesentation(contactId: string, vorgabe?: VerkaufsAudience | null) {
  const c = await prisma.salesContact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, insurer: true, offers: { orderBy: { createdAt: "desc" } } },
  });
  if (!c) return null;
  const offer = aktuellesAngebot(c.offers);
  const angebot = offer ? angebotFuerFolien(offer) : null;
  const audience = isVerkaufsAudience(vorgabe) ? vorgabe : audienceFuer(c, angebot);
  const preise = paketDaten(angebot, audience);
  return { contact: { id: c.id, name: c.name }, audience, preise, angebotNr: offer?.number ?? null, folien: verkaufsFolien(audience, preise), css: verkaufsCss() };
}

export type VerkaufsLink = { token: string; bis: Date; audience: VerkaufsAudience };

const aktivWo = (now: Date) => ({ endedAt: null, expiresAt: { gt: now } });

export async function aktiverVerkaufsLink(contactId: string, now = new Date()): Promise<VerkaufsLink | null> {
  const l = await prisma.salesPresentationLink.findFirst({ where: { contactId, ...aktivWo(now) }, orderBy: { createdAt: "desc" } });
  return l ? { token: l.token, bis: l.expiresAt, audience: isVerkaufsAudience(l.audience) ? l.audience : "vertreter" } : null;
}

/** Link erstellen bzw. den aktiven um 14 Tage ab jetzt verlängern (gleicher Token, Fassung wird übernommen). */
export async function verkaufsLinkErstellen(contactId: string, audience: VerkaufsAudience, userId: string | null, now = new Date()): Promise<VerkaufsLink | null> {
  const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!c) return null;
  const bis = new Date(now.getTime() + VERKAUF_LINK_TAGE * 24 * 3600_000);
  const aktiv = await prisma.salesPresentationLink.findFirst({ where: { contactId, ...aktivWo(now) }, orderBy: { createdAt: "desc" } });
  if (aktiv) {
    await prisma.salesPresentationLink.update({ where: { id: aktiv.id }, data: { expiresAt: bis, audience } });
    return { token: aktiv.token, bis, audience };
  }
  const token = randomBytes(24).toString("base64url");
  await prisma.salesPresentationLink.create({ data: { contactId, token, audience, expiresAt: bis, createdById: userId } });
  return { token, bis, audience };
}

/** Alle aktiven Links des Kontakts beenden. */
export async function verkaufsLinkBeenden(contactId: string, now = new Date()): Promise<number> {
  const r = await prisma.salesPresentationLink.updateMany({ where: { contactId, endedAt: null, expiresAt: { gt: now } }, data: { endedAt: now } });
  return r.count;
}

/** Präsentation zum Link; null, wenn unbekannt, abgelaufen oder beendet. */
export async function ladeVerkaufsLink(token: string, now = new Date()) {
  if (!TOKEN_RE.test(token)) return null;
  const l = await prisma.salesPresentationLink.findUnique({ where: { token } });
  if (!l || l.endedAt || l.expiresAt <= now) return null;
  const p = await ladeVerkaufsPraesentation(l.contactId, isVerkaufsAudience(l.audience) ? l.audience : null);
  return p ? { ...p, linkId: l.id, bis: l.expiresAt } : null;
}

/** Aufruf merken (ohne IP/Gerät); innerhalb von 30 Minuten nur einmal. true = neu protokolliert. */
/** Hinweis unten auf /praesentation/[token] (ein Satz, Sie-Form, Link folgt als „Datenschutzerklärung“). */
export const AUFRUF_HINWEIS = "Wir speichern, wann Sie diesen Link öffnen (ohne IP-Adresse), um unser Gespräch vorzubereiten, mehr dazu in unserer";
export const DATENSCHUTZ_URL = "https://performancegrowth.de/datenschutz";

export async function verkaufsAufrufMerken(linkId: string, now = new Date()): Promise<boolean> {
  const kurz = await prisma.salesPresentationView.findFirst({ where: { linkId, viewedAt: { gt: new Date(now.getTime() - AUFRUF_PAUSE_MS) } }, select: { id: true } });
  if (kurz) return false;
  await prisma.salesPresentationView.create({ data: { linkId, viewedAt: now } });
  return true;
}

/** Letzte Aufrufe aller Links eines Kontakts (neueste zuerst). */
export async function verkaufsAufrufe(contactId: string, take = 10): Promise<Date[]> {
  const v = await prisma.salesPresentationView.findMany({ where: { link: { contactId } }, orderBy: { viewedAt: "desc" }, take, select: { viewedAt: true } });
  return v.map((x) => x.viewedAt);
}
