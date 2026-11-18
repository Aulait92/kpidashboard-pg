// Termin-Übersicht für Oles Salescalls (Ole, 18.11.2026): je Vertriebstermin, was passiert ist, der Stand und der
// nächste Schritt, oben „Braucht Aufmerksamkeit“, damit niemand vergessen wird, mit dem er gesprochen hat.
// Reine Funktionen ohne Datenbank; Laden in termine-uebersicht-server.ts, Seite /admin/neu/vertrieb/termine.
//
// Woher die Angaben kommen (nur vorhandene Daten, nichts Neues gespeichert):
// - Ergebnis: erste Aktivität des Kontakts ab Terminbeginn (bis zum nächsten Termin) mit einem Gesprächsergebnis aus
//   „Wie lief der Termin?“ bzw. „Aktivität erfassen“ (OUTCOMES in crm.ts). Ohne Ergebnis zählt eine eigene Notiz
//   oder die erledigte Aufgabe „Wie lief der Termin?“ (reviewTaskId) als erledigt.
// - Stand: Pipeline-Stufe des Kontakts und sein aktuelles Angebot (angebotZustand wie unter Verkaufen → Angebote).
// - Nächster Schritt: frühester von offener Aufgabe (ohne „Wie lief der Termin?“), kommendem Termin, offenem Angebot.

import type { HeuteItem } from "@/lib/admin-heute";
import type { SalesStage } from "@/generated/prisma/enums";
import { kontaktPfad } from "@/components/admin-neu/vertrieb/listen";
import { abschlussBonusJetzt } from "@/lib/offer-pricing";
import { OUTCOMES, STAGE_LABEL, isTerminReview, shortName } from "@/lib/vertrieb/crm";
import { angebotZustand, type AngebotZustand } from "@/lib/vertrieb/angebote-uebersicht";
import { terminKurz } from "@/lib/vertrieb/entscheidungs-call";

const MIN = 60_000;
const TAG = 24 * 60 * MIN;
/** Ohne Endzeit gilt ein Termin nach 45 Minuten als vorbei (wie termin-review.ts). */
const DAUER = 45 * MIN;
/** „Braucht Aufmerksamkeit“ schaut so weit zurück. */
export const RUECKBLICK_TAGE = 90;
/** Angebot ohne Reaktion: so viele Tage seit Versand, Öffnen oder letztem Kontakt. */
const ANGEBOT_RUHE_TAGE = 3;
/** Abschlussbonus: Hinweis, wenn die Frist in so vielen Stunden abläuft. */
const BONUS_STUNDEN = 48;

export type UTermin = {
  id: string;
  contactId: string;
  title: string;
  startAt: Date;
  endAt: Date | null;
  /** GEPLANT | ABGESAGT (VERSCHOBEN wird nicht geladen, der neue Termin steht da) */
  status: string;
  cancelReason: string | null;
  reviewTaskId: string | null;
  bookingSlug: string | null;
  joinUrl: string | null;
  location: string | null;
  manageToken: string | null;
  bookingTypeId: string | null;
  inviteeName: string | null;
  waConfirmStatus: string | null;
};
export type UKontakt = { id: string; name: string; firstName: string | null; lastName: string | null; city: string | null; stage: SalesStage; customerId: string | null };
export type UAufgabe = { id: string; contactId: string | null; title: string; dueAt: Date; doneAt: Date | null };
export type UAktivitaet = { contactId: string; type: string; outcome: string | null; note: string | null; occurredAt: Date };
export type UAngebot = {
  id: string;
  salesContactId: string | null;
  number: string;
  company: string | null;
  contactName: string;
  status: string;
  sentAt: Date | null;
  viewedAt: Date | null;
  acceptedAt: Date | null;
  validUntil: Date;
  createdAt: Date;
  setupFee: unknown;
  abschlussBonus: unknown;
  abschlussBonusBis: Date | null;
  abschlussBonusGewaehrt: unknown;
  allowPayLater: boolean;
  paymentStatus: string;
};

// ─── Art des Termins ────────────────────────────────────────────────────

export type TerminArt = "erst" | "entscheidung" | "sonstig";

/** Entscheidungs-Call wie terminThema (termin-whatsapp.ts), Erstgespräch: Meta-Leads-Call bzw. Erst-/Kennenlerngespräch. */
export function terminArt(m: { title: string; bookingSlug: string | null }): TerminArt {
  if (m.bookingSlug === "entscheidung" || /entscheid/i.test(m.title)) return "entscheidung";
  if (m.bookingSlug === "meta-leads-call" || /meta.?leads|erstgespr|kennenlern/i.test(m.title)) return "erst";
  return "sonstig";
}

export function artLabel(m: { title: string; bookingSlug: string | null }): string {
  const art = terminArt(m);
  if (art === "entscheidung") return "Entscheidungs-Call";
  if (art === "erst") return "Erstgespräch";
  return m.title.replace(/\s+mit\s+.+$/i, "").trim() || "Termin";
}

export const terminEnde = (m: { startAt: Date; endAt: Date | null }) => m.endAt ?? new Date(m.startAt.getTime() + DAUER);

// ─── Was passiert ist ───────────────────────────────────────────────────

/** Gesprächsergebnisse (OUTCOMES) und ihre Kurzform; Anruf-Ergebnisse wie „Nicht erreicht“ zählen nicht. */
const KURZ: Record<string, string> = {
  gewonnen: "Abschluss",
  angebot_gesendet: "Angebot geschickt",
  bedenkzeit: "Bedenkzeit",
  nicht_erschienen: "Nicht erschienen",
  verloren: "Kein Interesse",
  spaeter: "Später wieder",
  unterlagen: "Unterlagen gesendet",
  unterlagen_senden: "Will Unterlagen",
  termin: "Folgetermin vereinbart",
  ungueltig: "Ungültig",
};
const ID_VON_LABEL = new Map(OUTCOMES.filter((o) => o.id in KURZ).map((o) => [o.label, o.id]));

/** Automatische Notizen (Anreichern, Zusammenführen …) sind keine Gesprächsnotizen. */
const AUTO_NOTIZ = /^(Automatisch|Google:|Anreichern:|Adresse von der Website|Zusammengeführt mit|Aus Instantly)/;
const HAND_TYPEN = new Set(["ANRUF", "EMAIL", "NOTIZ", "TERMIN"]);

/** Gesprächsergebnis-Id einer Aktivität, sonst null. */
export function ergebnisId(a: { outcome: string | null }): string | null {
  return (a.outcome && ID_VON_LABEL.get(a.outcome)) || null;
}

/** Von Hand geschriebene Notiz ohne Ergebnis („Nur Notiz“ in „Aktivität erfassen“). */
export function istHandnotiz(a: UAktivitaet): boolean {
  const n = a.note?.trim();
  return !a.outcome && !!n && HAND_TYPEN.has(a.type) && !AUTO_NOTIZ.test(n);
}

/** Von Hand erfasster Kontakt (Ergebnis oder Notiz), z. B. nach dem Nachfassen. */
const istHandeintrag = (a: UAktivitaet) => (HAND_TYPEN.has(a.type) && !!a.outcome && OUTCOMES.some((o) => o.label === a.outcome)) || istHandnotiz(a);

export function ersteZeile(text: string | null | undefined, max = 120): string | null {
  const z = text?.split("\n").map((s) => s.trim()).find(Boolean);
  if (!z) return null;
  return z.length > max ? `${z.slice(0, max - 1).trimEnd()}…` : z;
}

export type Ergebnis =
  | { art: "geplant" }
  | { art: "laeuft" }
  | { art: "abgesagt"; notiz: string | null }
  | { art: "eingetragen"; id: string; label: string; notiz: string | null }
  /** Notiz ohne Ergebnis bzw. „Wie lief der Termin?“ abgehakt */
  | { art: "erledigt"; notiz: string | null }
  | { art: "fehlt"; reviewOffen: boolean };

/**
 * Ergebnis eines Termins. `aktivitaeten`: die des Kontakts (beliebige Reihenfolge), `bis`: Beginn des nächsten
 * Termins des Kontakts (Einträge danach gehören zu dem), `review`: Aufgabe „Wie lief der Termin?“, falls angelegt.
 */
export function terminErgebnis(m: UTermin, aktivitaeten: UAktivitaet[], bis: Date | null, review: { doneAt: Date | null } | null, now: Date): Ergebnis {
  if (m.status === "ABGESAGT") return { art: "abgesagt", notiz: ersteZeile(m.cancelReason) };
  if (m.startAt > now) return { art: "geplant" };
  if (terminEnde(m) > now) return { art: "laeuft" };
  const im = aktivitaeten
    .filter((a) => a.occurredAt >= m.startAt && (!bis || a.occurredAt < bis))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
  const notiz = im.find(istHandnotiz);
  const erg = im.find((a) => ergebnisId(a));
  if (erg) {
    const id = ergebnisId(erg)!;
    return { art: "eingetragen", id, label: KURZ[id], notiz: ersteZeile(erg.note) ?? ersteZeile(notiz?.note) };
  }
  if (notiz) return { art: "erledigt", notiz: ersteZeile(notiz.note) };
  if (review?.doneAt) return { art: "erledigt", notiz: null };
  return { art: "fehlt", reviewOffen: !!review && !review.doneAt };
}

// ─── Stand ──────────────────────────────────────────────────────────────

export type AngebotStand = AngebotZustand | "keins";
export const ANGEBOT_TAG: Record<AngebotStand, { label: string; tone: "success" | "info" | "neutral" | "warning" | "danger" | "brand" }> = {
  keins: { label: "Kein Angebot", tone: "neutral" },
  entwurf: { label: "Angebot: Entwurf", tone: "neutral" },
  offen: { label: "Angebot gesendet", tone: "info" },
  geoeffnet: { label: "Angebot geöffnet", tone: "brand" },
  angenommen: { label: "Angenommen", tone: "success" },
  abgelehnt: { label: "Angebot abgelehnt", tone: "danger" },
  abgelaufen: { label: "Angebot abgelaufen", tone: "warning" },
};
export const STUFE_TON: Partial<Record<SalesStage, "success" | "danger" | "brand" | "warning">> = {
  GEWONNEN: "success",
  VERLOREN: "danger",
  TERMIN: "brand",
  SPAETER: "warning",
};
export const stufeLabel = (k: Pick<UKontakt, "stage" | "customerId">) => (k.customerId ? "Kunde" : STAGE_LABEL[k.stage]);

/** Aktuelles Angebot des Kontakts: das zuletzt erstellte (ersetzte Versionen und Testangebote sind nicht geladen). */
export function aktuellesAngebot(angebote: UAngebot[]): UAngebot | null {
  return angebote.reduce<UAngebot | null>((best, o) => (!best || o.createdAt > best.createdAt ? o : best), null);
}

export const angebotStand = (o: UAngebot | null, now: Date): AngebotStand => (o ? angebotZustand(o, now) : "keins");

/** Abgeschlossen: gewonnen, verloren, ungültig oder schon Kunde. Dann braucht es keinen nächsten Schritt. */
export const istAbgeschlossen = (k: Pick<UKontakt, "stage" | "customerId">) => !!k.customerId || k.stage === "GEWONNEN" || k.stage === "VERLOREN" || k.stage === "UNGUELTIG";

// ─── Nächster Schritt ───────────────────────────────────────────────────

export type Schritt =
  | { art: "schritt"; text: string; at: Date; ueberfaellig: boolean }
  | { art: "keiner" }
  /** Gewonnen, verloren, Kunde: kein Schritt nötig */
  | { art: "abgeschlossen" };

const berlinTag = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });

/** Frühester offener Schritt des Kontakts: Aufgabe (ohne „Wie lief der Termin?“), kommender Termin, offenes Angebot. */
export function naechsterSchritt(
  k: Pick<UKontakt, "stage" | "customerId">,
  d: { aufgaben: UAufgabe[]; termine: UTermin[]; angebot: UAngebot | null },
  now: Date,
): Schritt {
  const kandidaten: { text: string; at: Date; ueberfaellig: boolean }[] = [];
  for (const t of d.aufgaben) {
    if (t.doneAt || isTerminReview(t.title)) continue;
    kandidaten.push({ text: t.title, at: t.dueAt, ueberfaellig: berlinTag(t.dueAt) < berlinTag(now) });
  }
  for (const m of d.termine) {
    if (m.status === "GEPLANT" && terminEnde(m) > now) kandidaten.push({ text: artLabel(m), at: m.startAt, ueberfaellig: false });
  }
  const stand = angebotStand(d.angebot, now);
  if (d.angebot && (stand === "offen" || stand === "geoeffnet")) kandidaten.push({ text: "Angebot läuft", at: d.angebot.validUntil, ueberfaellig: false });
  kandidaten.sort((a, b) => a.at.getTime() - b.at.getTime());
  if (kandidaten.length) return { art: "schritt", ...kandidaten[0] };
  return istAbgeschlossen(k) ? { art: "abgeschlossen" } : { art: "keiner" };
}

// ─── Zeilen und Aufmerksamkeit ──────────────────────────────────────────

export type TerminZeile = {
  termin: UTermin;
  kontakt: UKontakt;
  /** Person (gebucht von bzw. Ansprechpartner) und Agentur mit Ort */
  person: string;
  agentur: string | null;
  art: TerminArt;
  artLabel: string;
  ergebnis: Ergebnis;
  angebot: { stand: AngebotStand; nummer: string | null };
  schritt: Schritt;
  /** Wohin „Ergebnis eintragen“ führt (nur bei fehlendem Ergebnis) */
  ergebnisHref: string | null;
  kommend: boolean;
};

export type Uebersicht = { zeilen: TerminZeile[]; aufmerksamkeit: HeuteItem[] };

const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
const datum = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(d);
const gruppe = <T,>(xs: T[], key: (x: T) => string | null) => {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (k) m.set(k, [...(m.get(k) ?? []), x]);
  }
  return m;
};

export function personUndAgentur(k: UKontakt, m?: Pick<UTermin, "inviteeName">): { person: string; agentur: string | null } {
  const ansprech = [k.firstName, k.lastName].filter(Boolean).join(" ");
  const person = m?.inviteeName?.trim() || ansprech || shortName(k.name);
  const agentur = [k.name !== person ? k.name : null, k.city].filter(Boolean).join(", ");
  return { person, agentur: agentur || null };
}

/** Alle Zeilen (jeder geladene Termin) und die Punkte für „Braucht Aufmerksamkeit“. */
export function baueUebersicht(
  d: { termine: UTermin[]; kontakte: UKontakt[]; aufgaben: UAufgabe[]; aktivitaeten: UAktivitaet[]; angebote: UAngebot[] },
  now: Date,
): Uebersicht {
  const kontakte = new Map(d.kontakte.map((k) => [k.id, k]));
  const termineVon = gruppe(d.termine, (m) => m.contactId);
  const aufgabenVon = gruppe(d.aufgaben, (t) => t.contactId);
  const aktVon = gruppe(d.aktivitaeten, (a) => a.contactId);
  const angeboteVon = gruppe(d.angebote, (o) => o.salesContactId);
  const aufgabeById = new Map(d.aufgaben.map((t) => [t.id, t]));

  const proKontakt = new Map<string, { schritt: Schritt; angebot: UAngebot | null }>();
  const kontaktStand = (id: string) => {
    let s = proKontakt.get(id);
    if (!s) {
      const angebot = aktuellesAngebot(angeboteVon.get(id) ?? []);
      s = { angebot, schritt: naechsterSchritt(kontakte.get(id)!, { aufgaben: aufgabenVon.get(id) ?? [], termine: termineVon.get(id) ?? [], angebot }, now) };
      proKontakt.set(id, s);
    }
    return s;
  };

  const zeilen: TerminZeile[] = [];
  for (const m of d.termine) {
    const k = kontakte.get(m.contactId);
    if (!k) continue;
    // Einträge bis zum Beginn des nächsten (nicht abgesagten) Termins gehören zu diesem
    const bis =
      (termineVon.get(k.id) ?? [])
        .filter((x) => x.id !== m.id && x.status === "GEPLANT" && x.startAt > m.startAt)
        .map((x) => x.startAt)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
    const review = m.reviewTaskId ? (aufgabeById.get(m.reviewTaskId) ?? null) : null;
    const ergebnis = terminErgebnis(m, aktVon.get(k.id) ?? [], bis, review, now);
    const { schritt, angebot } = kontaktStand(k.id);
    zeilen.push({
      termin: m,
      kontakt: k,
      ...personUndAgentur(k, m),
      art: terminArt(m),
      artLabel: artLabel(m),
      ergebnis,
      angebot: { stand: angebotStand(angebot, now), nummer: angebot?.number ?? null },
      schritt,
      ergebnisHref: ergebnis.art === "fehlt" ? `${kontaktPfad(k.id)}${ergebnis.reviewOffen ? "#aufgaben" : "#aktivitaet"}` : null,
      kommend: m.status === "GEPLANT" && terminEnde(m) > now,
    });
  }

  return { zeilen, aufmerksamkeit: aufmerksamkeit(zeilen, d, kontakte, termineVon, aktVon, kontaktStand, now) };
}

function aufmerksamkeit(
  zeilen: TerminZeile[],
  d: { angebote: UAngebot[] },
  kontakte: Map<string, UKontakt>,
  termineVon: Map<string, UTermin[]>,
  aktVon: Map<string, UAktivitaet[]>,
  kontaktStand: (id: string) => { schritt: Schritt; angebot: UAngebot | null },
  now: Date,
): HeuteItem[] {
  const punkte: { rang: number; p: HeuteItem }[] = [];
  const seit = new Date(now.getTime() - RUECKBLICK_TAGE * TAG);
  const punkt = ({ rang, ...p }: Omit<HeuteItem, "area" | "icon"> & { rang: number; icon?: HeuteItem["icon"] }) => punkte.push({ rang, p: { area: "Vertrieb", icon: "calendar", ...p } });

  // Je Kontakt nur der letzte vergangene bzw. abgesagte Termin, und nur ohne späteren geplanten Termin
  const letzte = new Map<string, TerminZeile>();
  for (const z of zeilen) {
    const m = z.termin;
    if (m.startAt < seit || z.kommend || z.ergebnis.art === "laeuft") continue;
    const bisher = letzte.get(m.contactId);
    if (!bisher || m.startAt > bisher.termin.startAt) letzte.set(m.contactId, z);
  }
  for (const z of letzte.values()) {
    const m = z.termin;
    const k = z.kontakt;
    if (istAbgeschlossen(k)) continue;
    if ((termineVon.get(k.id) ?? []).some((x) => x.status === "GEPLANT" && x.startAt > m.startAt)) continue;
    const wann = `${z.artLabel} am ${terminKurz(m.startAt)}`;
    const pfad = kontaktPfad(k.id);
    const e = z.ergebnis;
    if (e.art === "fehlt") {
      punkt({ key: `t-ergebnis:${m.id}`, rang: 1, tone: "bad", title: `Ergebnis fehlt: ${z.person}`, detail: wann, action: { label: "Ergebnis eintragen", href: z.ergebnisHref! }, since: m.startAt });
    } else if (e.art === "abgesagt" || (e.art === "eingetragen" && e.id === "nicht_erschienen")) {
      punkt({
        key: `t-neu:${m.id}`,
        rang: 3,
        tone: "warn",
        title: `${e.art === "abgesagt" ? "Abgesagt" : "Nicht erschienen"}: ${z.person}`,
        detail: `${wann} · kein neuer Termin`,
        action: { label: "Neuen Termin", href: `${pfad}?termin=1` },
        since: m.startAt,
      });
    } else if (z.schritt.art === "keiner") {
      punkt({
        key: `t-schritt:${m.id}`,
        rang: 2,
        tone: "bad",
        icon: "task",
        title: `Kein nächster Schritt: ${z.person}`,
        detail: `${wann}${e.art === "eingetragen" ? `: ${e.label}` : ""}`,
        action: { label: "Schritt planen", href: `${pfad}#aufgaben` },
        since: m.startAt,
      });
    }
  }

  // Angebote: Abschlussbonus läuft ab, sonst ohne Reaktion seit mehr als 3 Tagen (nur das aktuelle je Kontakt)
  const angebotKontakte = new Set(d.angebote.map((o) => o.salesContactId).filter((x): x is string => !!x));
  for (const id of angebotKontakte) {
    const k = kontakte.get(id);
    if (!k) continue;
    const o = kontaktStand(id).angebot;
    if (!o) continue;
    const wer = o.company || personUndAgentur(k).person;
    const pfad = `${kontaktPfad(id)}#angebot`;
    const stand = angebotStand(o, now);
    const bonus = o.abschlussBonusGewaehrt == null && o.paymentStatus !== "paid" && (o.status === "sent" || o.status === "accepted") ? abschlussBonusJetzt(o, now) : null;
    if (bonus && !bonus.gesichert && bonus.bis.getTime() - now.getTime() <= BONUS_STUNDEN * 3600_000) {
      const wo = o.acceptedAt ? "angenommen, Zahlung fehlt" : o.viewedAt ? "geöffnet" : "noch nicht geöffnet";
      punkt({
        key: `t-bonus:${o.id}`,
        rang: 0,
        tone: "bad",
        icon: "offer",
        title: `Bonus läuft ab: ${wer}`,
        detail: `${eur(bonus.betrag)} bis ${terminKurz(bonus.bis)} · ${wo}`,
        action: { label: "Angebot öffnen", href: pfad },
        since: bonus.bis,
      });
      continue;
    }
    if (stand !== "offen" && stand !== "geoeffnet") continue;
    if ((termineVon.get(id) ?? []).some((x) => x.status === "GEPLANT" && terminEnde(x) > now)) continue;
    const letzterKontakt = (aktVon.get(id) ?? []).filter((a) => o.sentAt && a.occurredAt >= o.sentAt && istHandeintrag(a)).reduce<Date | null>((x, a) => (!x || a.occurredAt > x ? a.occurredAt : x), null);
    const ruhe = [o.sentAt, o.viewedAt, letzterKontakt].filter((x): x is Date => !!x).reduce((x, y) => (y > x ? y : x), new Date(0));
    if (now.getTime() - ruhe.getTime() <= ANGEBOT_RUHE_TAGE * TAG) continue;
    const tage = Math.floor((now.getTime() - ruhe.getTime()) / TAG);
    punkt({
      key: `t-angebot:${o.id}`,
      rang: 4,
      tone: "warn",
      icon: "offer",
      title: `Angebot ohne Reaktion: ${wer}`,
      detail: o.viewedAt ? `Geöffnet am ${datum(o.viewedAt)}, seit ${tage} Tagen nichts gehört` : `Gesendet am ${datum(o.sentAt!)}, noch nicht geöffnet`,
      action: { label: "Nachfassen", href: pfad },
      since: ruhe,
    });
  }

  return punkte.sort((a, b) => a.rang - b.rang || (a.p.since?.getTime() ?? 0) - (b.p.since?.getTime() ?? 0)).map((x) => x.p);
}

// ─── Ansichten und Filter ───────────────────────────────────────────────

export type Ansicht = "kommend" | "30" | "alle";
export const ANSICHTEN: { key: Ansicht; label: string }[] = [
  { key: "kommend", label: "Kommende" },
  { key: "30", label: "Letzte 30 Tage" },
  { key: "alle", label: "Alle" },
];
export const ansichtVon = (s: string | undefined): Ansicht => (s === "kommend" || s === "alle" ? s : "30");

export const FILTER: { key: string; label: string; match: (z: TerminZeile) => boolean }[] = [
  { key: "ohne", label: "Ohne nächsten Schritt", match: (z) => z.schritt.art === "keiner" },
  { key: "angebot", label: "Angebot offen", match: (z) => z.angebot.stand === "offen" || z.angebot.stand === "geoeffnet" },
  { key: "gewonnen", label: "Gewonnen", match: (z) => !!z.kontakt.customerId || z.kontakt.stage === "GEWONNEN" || z.angebot.stand === "angenommen" },
  { key: "verloren", label: "Verloren", match: (z) => z.kontakt.stage === "VERLOREN" },
];

/** Zeilen der Ansicht: kommende aufsteigend, letzte 30 Tage (begonnene Termine) und alle neueste zuerst. */
export function zeilenDerAnsicht(zeilen: TerminZeile[], ansicht: Ansicht, now: Date): TerminZeile[] {
  if (ansicht === "kommend") return zeilen.filter((z) => z.kommend).sort((a, b) => a.termin.startAt.getTime() - b.termin.startAt.getTime());
  const ab = now.getTime() - 30 * TAG;
  return zeilen
    .filter((z) => ansicht === "alle" || (z.termin.startAt.getTime() >= ab && z.termin.startAt <= now))
    .sort((a, b) => b.termin.startAt.getTime() - a.termin.startAt.getTime());
}
