// Meta-Leads im Vertrieb (Ole, 18.11.2026): Stand je Lead und Trichter für den Zeitraum. Reine Funktionen ohne
// Datenbank (Tests: tests/unit/meta-leads-stand.test.ts), geladen wird in lib/vertrieb/meta-leads.ts.
// Begriffe wie in der Pipeline (lib/vertrieb/crm.ts) und bei den Angeboten (lib/vertrieb/angebote-uebersicht.ts).

import { LOSS_LABEL, OUTCOME_BY_ID } from "@/lib/vertrieb/crm";
import type { SalesLossReason as LossReason, SalesStage as Stage } from "@/generated/prisma/enums";

export type StandKey = "neu" | "nicht_erreicht" | "erreicht" | "termin" | "erschienen" | "nicht_erschienen" | "angebot" | "gewonnen" | "verloren";

export const STAND: Record<StandKey, { label: string; tone: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }> = {
  neu: { label: "Neu", tone: "brand" },
  nicht_erreicht: { label: "Nicht erreicht", tone: "warning" },
  erreicht: { label: "Erreicht", tone: "info" },
  termin: { label: "Termin gebucht", tone: "info" },
  erschienen: { label: "Erschienen", tone: "info" },
  nicht_erschienen: { label: "Nicht erschienen", tone: "warning" },
  angebot: { label: "Angebot", tone: "info" },
  gewonnen: { label: "Gewonnen", tone: "success" },
  verloren: { label: "Verloren", tone: "danger" },
};

/** Schritte des Trichters (jeder Lead zählt bis zum weitesten erreichten Schritt). */
export const TRICHTER = [
  { key: "leads", label: "Leads" },
  { key: "erreicht", label: "erreicht" },
  { key: "termin", label: "Termin" },
  { key: "erschienen", label: "erschienen" },
  { key: "angebot", label: "Angebot" },
  { key: "gewonnen", label: "gewonnen" },
] as const;

export type MetaLeadDaten = {
  /** Eingang des Leads (erster Meta-Eingang im Zeitraum) */
  eingang: Date;
  stage: Stage;
  lossReason: LossReason | null;
  /** Verlauf seit dem Eingang (Typ und Ergebnis-Text wie in SalesActivity) */
  activities: { type: string; outcome: string | null; occurredAt: Date }[];
  meetings: { startAt: Date; status: string }[];
  offers: { status: string; sentAt: Date | null; acceptedAt: Date | null }[];
};

const LABEL = (id: string) => OUTCOME_BY_ID[id]?.label ?? "";
const NICHT_ERREICHT = LABEL("nicht_erreicht");
const NICHT_ERSCHIENEN = LABEL("nicht_erschienen");
/** Ergebnisse, die zeigen: Der Termin hat stattgefunden. */
const ERSCHIENEN = new Set([LABEL("angebot_gesendet"), LABEL("bedenkzeit"), LABEL("gewonnen")]);
const ANGEBOT_ERGEBNIS = LABEL("angebot_gesendet");
const TERMIN_ERGEBNIS = LABEL("termin");

export type MetaLeadStand = {
  key: StandKey;
  label: string;
  /** Zusatz, z. B. „3 Versuche“, Verlustgrund, Termin-Datum */
  detail: string | null;
  /** Anrufversuche seit dem Eingang */
  versuche: number;
  /** Weitester Schritt im Trichter: 0 = Lead, 1 = erreicht, … 5 = gewonnen */
  tiefe: number;
};

/** Stand eines Meta-Leads aus Stufe, Verlauf, Terminen und Angeboten. */
export function metaLeadStand(d: MetaLeadDaten, now = new Date()): MetaLeadStand {
  const seit = d.activities.filter((a) => a.occurredAt >= d.eingang);
  const anrufe = seit.filter((a) => a.type === "ANRUF");
  const versuche = anrufe.length;
  const ergebnis = (t: string) => seit.some((a) => a.outcome === t);
  // Erreicht: ein Anruf mit anderem Ergebnis als „Nicht erreicht“ (Rückruf, Unterlagen, Termin …)
  const erreichtAnruf = seit.some((a) => (a.type === "ANRUF" || a.type === "TERMIN") && !!a.outcome && a.outcome !== NICHT_ERREICHT);
  const termine = d.meetings.filter((m) => m.status !== "ABGESAGT");
  const verschickt = d.offers.filter((o) => o.status !== "draft" || o.sentAt);
  const angenommen = d.offers.some((o) => o.status === "accepted" || o.acceptedAt);

  const gewonnen = d.stage === "GEWONNEN" || angenommen;
  const angebot = verschickt.length > 0 || ergebnis(ANGEBOT_ERGEBNIS);
  const nichtErschienen = ergebnis(NICHT_ERSCHIENEN);
  const erschienen = [...ERSCHIENEN].some(ergebnis);
  const termin = termine.length > 0 || d.stage === "TERMIN" || ergebnis(TERMIN_ERGEBNIS);
  const erreicht = erreichtAnruf || termin || ["WIEDERVORLAGE", "TERMIN", "GEWONNEN", "SPAETER"].includes(d.stage);

  const tiefe = gewonnen ? 5 : angebot ? 4 : erschienen ? 3 : termin ? 2 : erreicht ? 1 : 0;
  const mk = (key: StandKey, detail: string | null = null): MetaLeadStand => ({ key, label: STAND[key].label, detail, versuche, tiefe });

  if (gewonnen) return mk("gewonnen");
  if (d.stage === "VERLOREN" || d.stage === "UNGUELTIG") {
    return mk("verloren", d.stage === "UNGUELTIG" ? "Ungültig" : d.lossReason ? LOSS_LABEL[d.lossReason] : null);
  }
  if (angebot) return mk("angebot");
  if (erschienen) return mk("erschienen");
  // Neuester Termin entscheidet: kommt er noch, ist er gebucht; ein späteres „nicht erschienen“ zählt erst danach
  const naechster = termine.filter((m) => m.startAt >= now).sort((a, b) => a.startAt.getTime() - b.startAt.getTime())[0];
  if (naechster) return mk("termin", fmtTag(naechster.startAt));
  if (nichtErschienen) return mk("nicht_erschienen");
  if (termin) return mk("termin", termine.length ? "Ergebnis fehlt" : null);
  if (erreicht) return mk("erreicht");
  if (versuche > 0) return mk("nicht_erreicht", `${versuche} ${versuche === 1 ? "Versuch" : "Versuche"}`);
  return mk("neu");
}

const fmtTag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

/** Trichter: je Schritt die Zahl der Leads, die mindestens bis dorthin gekommen sind. */
export function metaTrichter(staende: Pick<MetaLeadStand, "tiefe">[]): { key: string; label: string; anzahl: number }[] {
  return TRICHTER.map((t, i) => ({ key: t.key, label: t.label, anzahl: staende.filter((s) => s.tiefe >= i).length }));
}

/** Nächster Schritt: früheste offene Aufgabe. Rot, wenn keiner da ist (außer bei gewonnen/verloren) oder er vor heute fällig war. */
export function naechsterSchritt(
  tasks: { title: string; dueAt: Date }[],
  stand: StandKey,
  now = new Date(),
): { title: string; dueAt: Date | null; rot: boolean } {
  const t = [...tasks].sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())[0];
  const abgeschlossen = stand === "gewonnen" || stand === "verloren";
  if (!t) return { title: abgeschlossen ? "kein offener Schritt" : "kein nächster Schritt", dueAt: null, rot: !abgeschlossen };
  return { title: t.title, dueAt: t.dueAt, rot: berlinTag(t.dueAt) < berlinTag(now) };
}

const berlinTag = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);

/** Filter-Chips der Ansicht. */
export const META_CHIPS: { key: string; label: string; match: (s: StandKey) => boolean }[] = [
  { key: "nicht-erreicht", label: "Nicht erreicht", match: (s) => s === "nicht_erreicht" },
  { key: "termin", label: "Termin gebucht", match: (s) => s === "termin" },
  { key: "gewonnen", label: "Gewonnen", match: (s) => s === "gewonnen" },
  { key: "verloren", label: "Verloren", match: (s) => s === "verloren" },
];

export const ZEITRAEUME = [
  { key: "30", label: "30 Tage", tage: 30 },
  { key: "90", label: "90 Tage", tage: 90 },
  { key: "alle", label: "Alle", tage: null },
] as const;

export function zeitraumVon(key: string | undefined, now = new Date()): { key: string; seit: Date | null } {
  const z = ZEITRAEUME.find((x) => x.key === key) ?? ZEITRAEUME[0];
  return { key: z.key, seit: z.tage ? new Date(now.getTime() - z.tage * 86_400_000) : null };
}
