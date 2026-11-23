import { prisma } from "@/lib/prisma";
import { abschlussBonusFrist, abschlussBonusGesichert, abschlussBonusJetzt, type AbschlussBonusQuelle } from "@/lib/offer-pricing";
import { naechsteErinnerung, zahlungEingerichtet } from "@/lib/angebot-zahlungserinnerung";
import { ablehnGrundLabel, ablehnGruende, kannAblehnen, kannWiederOeffnen } from "@/lib/vertrieb/angebot-ablehnen";

// Übersicht aller Angebote (Ole, 13.11.2026): je Angebotsnummer die aktuelle Version mit Stand und Filtern.
// Gemeinsam für /admin/vertrieb/angebote und /admin/neu/vertrieb/angebote.

export type AngebotZustand = "angenommen" | "geoeffnet" | "offen" | "abgelaufen" | "abgelehnt" | "entwurf";
export const ANGEBOT_ZUSTAND: Record<AngebotZustand, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" }> = {
  angenommen: { label: "Angenommen", tone: "success" },
  geoeffnet: { label: "Geöffnet", tone: "info" },
  offen: { label: "Verschickt, ungeöffnet", tone: "neutral" },
  abgelaufen: { label: "Abgelaufen", tone: "warning" },
  abgelehnt: { label: "Abgelehnt", tone: "danger" },
  entwurf: { label: "Entwurf", tone: "neutral" },
};

export function angebotZustand(o: { status: string; acceptedAt: Date | null; viewedAt: Date | null; validUntil: Date; sentAt: Date | null }, now: Date): AngebotZustand {
  // Abgelehnt zuerst: auch ein angenommenes, nie bezahltes Angebot kann abgelehnt werden (lib/vertrieb/angebot-ablehnen.ts)
  if (o.status === "declined") return "abgelehnt";
  if (o.status === "accepted" || o.acceptedAt) return "angenommen";
  if (o.status === "draft" && !o.sentAt) return "entwurf";
  if (o.validUntil < now) return "abgelaufen";
  return o.viewedAt ? "geoeffnet" : "offen";
}

type Row = { z: AngebotZustand; zahlungOffen: boolean };
export const ANGEBOT_FILTER: { key: string; label: string; match: (r: Row) => boolean }[] = [
  { key: "alle", label: "Alle verschickten", match: (r) => r.z !== "entwurf" },
  { key: "offen", label: "Offen", match: (r) => r.z === "offen" || r.z === "geoeffnet" },
  { key: "angenommen", label: "Angenommen", match: (r) => r.z === "angenommen" },
  // Angenommen, aber Zahlung bzw. Mandat noch nicht eingerichtet (Ole, 16.11.2026)
  { key: "zahlung", label: "Zahlung offen", match: (r) => r.zahlungOffen },
  { key: "abgelaufen", label: "Abgelaufen / abgelehnt", match: (r) => r.z === "abgelaufen" || r.z === "abgelehnt" },
  { key: "entwurf", label: "Entwürfe", match: (r) => r.z === "entwurf" },
];

/** Alle aktuellen Angebote (ohne ersetzte Versionen) mit Zustand, Zahlungsstand und Kennzahlen. */
export async function ladeAngebote(filterKey: string | undefined) {
  const filter = ANGEBOT_FILTER.find((f) => f.key === filterKey) ?? ANGEBOT_FILTER[0];
  const now = new Date();
  const offers = await prisma.offer.findMany({
    // Testangebote nicht in der Übersicht und nicht in den Kennzahlen (Ole, 23.11.2026)
    where: { status: { not: "superseded" }, isTest: false },
    orderBy: [{ sentAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
    take: 500,
    select: {
      id: true, number: true, version: true, status: true, contactName: true, company: true, email: true,
      setupFee: true, monthlyFee: true, sentAt: true, viewedAt: true, acceptedAt: true, validUntil: true, createdAt: true,
      salesContactId: true, dealId: true,
      isTest: true, paymentStatus: true, stripeSubscriptionId: true, stripeScheduleId: true, startDate: true,
      paymentReminderAt: true, paymentReminderCount: true, paymentReminderLastAt: true,
      zahlweise: true, declinedAt: true, declineReason: true,
      abschlussBonus: true, abschlussBonusBis: true, abschlussBonusGewaehrt: true, allowPayLater: true,
    },
  });
  const rows = offers.map((o) => {
    const z = angebotZustand(o, now);
    const zahlungOffen = z === "angenommen" && o.status === "accepted" && !o.isTest && !zahlungEingerichtet(o);
    return {
      ...o,
      z,
      zahlungOffen,
      naechste: zahlungOffen ? (naechsteErinnerung(o, now)?.tag ?? null) : null,
      // „Mehr“ je Zeile (Ole, 18.11.2026): Als abgelehnt markieren bzw. Wieder öffnen
      kannAblehnen: kannAblehnen(o),
      kannWiederOeffnen: kannWiederOeffnen(o, now),
      grund: o.status === "declined" ? ablehnGrundLabel(o.declineReason) : null,
      // Abschlussbonus (Ole, 18.11.2026: „bis wann der Entscheidungsbonus gilt“)
      bonus: bonusStand(o, now),
    };
  });
  const sent = rows.filter((r) => r.z !== "entwurf");
  return {
    filter,
    rows,
    shown: rows.filter((r) => filter.match(r)),
    count: (f: (typeof ANGEBOT_FILTER)[number]) => rows.filter((r) => f.match(r)).length,
    kennzahlen: {
      sent,
      angenommen: sent.filter((r) => r.z === "angenommen"),
      offen: sent.filter((r) => r.z === "offen" || r.z === "geoeffnet"),
      geoeffnet: sent.filter((r) => r.viewedAt),
    },
    /** Auswertung „Abgelehnt: Grund × Anzahl“ über alle aktuellen Angebote */
    ablehnGruende: ablehnGruende(rows),
  };
}

export type BonusStand = { betrag: number; bis: Date; stand: "laeuft" | "abgelaufen" | "genutzt" };

/** Abschlussbonus je Angebot für die Übersicht: Betrag, Frist und ob er noch gilt, genutzt wurde oder abgelaufen ist. */
export function bonusStand(
  o: AbschlussBonusQuelle & { abschlussBonusGewaehrt?: unknown },
  now: Date,
): BonusStand | null {
  const bis = abschlussBonusFrist(o);
  if (!bis) return null;
  const betrag = Math.min(Number(o.abschlussBonus), Number(o.setupFee));
  if (!(betrag > 0)) return null;
  if (Number(o.abschlussBonusGewaehrt ?? 0) > 0 || abschlussBonusGesichert(o)) return { betrag, bis, stand: "genutzt" };
  if (o.acceptedAt) return { betrag, bis, stand: "abgelaufen" };
  return { betrag, bis, stand: abschlussBonusJetzt(o, now) ? "laeuft" : "abgelaufen" };
}

const BONUS_ZEIT = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const BONUS_EUR = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Kurzzeile unter „Gültig bis“, z. B. „Bonus 500 € bis 19.11., 23:59“. */
export function bonusZeile(b: BonusStand): string {
  const betrag = BONUS_EUR.format(b.betrag).replace(/\u00a0/g, " ");
  if (b.stand === "genutzt") return `Bonus ${betrag} genutzt`;
  const bis = BONUS_ZEIT.format(b.bis);
  return b.stand === "laeuft" ? `Bonus ${betrag} bis ${bis}` : `Bonus abgelaufen (${bis})`;
}
