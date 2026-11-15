// Automatische Optimierung: Bezeichnungen und Texte (rein, auch im Browser nutzbar).

import type { MeasureKind } from "@/lib/optimierung/regeln";

export const MEASURE_STATUSES = ["geplant", "freigegeben", "abgelehnt", "ausgefuehrt", "fehlgeschlagen"] as const;
export type MeasureStatus = (typeof MEASURE_STATUSES)[number];

export const STATUS_LABEL: Record<MeasureStatus, string> = {
  geplant: "geplant",
  freigegeben: "freigegeben",
  abgelehnt: "abgelehnt",
  ausgefuehrt: "ausgeführt",
  fehlgeschlagen: "fehlgeschlagen",
};

export const KIND_LABEL: Record<MeasureKind, string> = {
  motiv_erneuern: "Neue Motive",
  anzeige_pausieren: "Anzeige pausieren",
  budget_umschichten: "Budget umschichten",
  formular_vorschlag: "Formular (Vorschlag)",
  zielgruppe_vorschlag: "Zielgruppe (Vorschlag)",
  motiv_vorschlag: "Neue Motive (Vorschlag)",
  conversion_leads_vorschlag: "Conversion Leads (Vorschlag)",
  manuell: "Von Hand",
};

/** Arten für „Maßnahme eintragen“ (von Hand); gespeichert wird immer kind „manuell“ mit dieser Unterart. */
export const MANUAL_TOPICS = [
  { key: "anzeigen", label: "Anzeigen bzw. Motive" },
  { key: "budget", label: "Budget" },
  { key: "zielgruppe", label: "Zielgruppe" },
  { key: "formular", label: "Formular" },
  { key: "kampagne", label: "Kampagne" },
  { key: "sonstiges", label: "Sonstiges" },
] as const;
export type ManualTopic = (typeof MANUAL_TOPICS)[number]["key"];
export const isManualTopic = (v: unknown): v is ManualTopic => MANUAL_TOPICS.some((t) => t.key === v);

/**
 * Verständlicher Satz für den Monatsbericht (Sie-Form, ohne Technik, ohne Gedankenstriche,
 * ohne Versprechen). Bei Maßnahmen von Hand der eingetragene Titel.
 */
export function reportText(m: { kind: string; title: string }): string {
  switch (m.kind) {
    case "motiv_erneuern":
    case "motiv_vorschlag":
      return "Neue Anzeigenmotive erstellt, damit Ihre Anzeigen frisch bleiben";
    case "anzeige_pausieren":
      return "Eine schwächere Anzeige pausiert, damit das Budget in die Anzeigen mit dem besseren Leadpreis fließt";
    case "budget_umschichten":
      return "Budget zur Zielgruppe mit dem günstigeren Leadpreis umgeschichtet, Ihr Gesamtbudget bleibt gleich";
    case "formular_vorschlag":
      return "Das Anfrageformular nachgeschärft, um die Qualität der Anfragen zu verbessern";
    case "zielgruppe_vorschlag":
      return "Die Zielgruppe der Anzeigen angepasst";
    case "conversion_leads_vorschlag":
      return "Die Kampagne so ausgerichtet, dass Meta gezielt nach Leads sucht, die bei Ihnen zu Terminen und Abschlüssen führen";
    default:
      return m.title;
  }
}

/** Rot in der Übersicht: letzte ausgeführte Maßnahme älter als 14 Tage (oder nie). */
export const STALE_DAYS = 14;
export function isStale(lastMeasureAt: Date | null, now: Date): boolean {
  return !lastMeasureAt || now.getTime() - lastMeasureAt.getTime() > STALE_DAYS * 86_400_000;
}

/** Titel der Frühwarnung (Admin „Heute“). */
export const earlyWarningTitle = (label: string) => `${label}: diesen Monat noch nichts optimiert`;

/** Lesbare Meta-Änderung (Ad Account activities) für Bericht und Admin. */
const ACTIVITY_LABEL: Record<string, string> = {
  create_ad: "Anzeige erstellt",
  create_ad_set: "Anzeigengruppe erstellt",
  create_campaign_group: "Kampagne erstellt",
  update_ad_run_status: "Anzeige ein- bzw. ausgeschaltet",
  update_ad_set_run_status: "Anzeigengruppe ein- bzw. ausgeschaltet",
  update_campaign_run_status: "Kampagne ein- bzw. ausgeschaltet",
  update_ad_set_budget: "Budget der Anzeigengruppe geändert",
  update_campaign_budget: "Kampagnenbudget geändert",
  update_ad_set_target_spec: "Zielgruppe geändert",
  update_ad_targets_spec: "Zielgruppe geändert",
  update_ad_creative: "Anzeigeninhalt geändert",
  edit_and_update_ad_creative: "Anzeigeninhalt geändert",
  update_ad_set_bid_strategy: "Gebotsstrategie geändert",
  update_ad_set_optimization_goal: "Optimierungsziel geändert",
  update_ad_set_duration: "Laufzeit geändert",
  update_campaign_name: "Kampagne umbenannt",
  update_ad_set_name: "Anzeigengruppe umbenannt",
  update_ad_friendly_name: "Anzeige umbenannt",
  ad_review_approved: "Anzeige von Meta freigegeben",
  ad_review_declined: "Anzeige von Meta abgelehnt",
  create_audience: "Zielgruppe angelegt",
  update_audience: "Zielgruppe geändert",
};

/** Änderungen, die eine echte Optimierung sein können (ohne Abrechnung, Rollen, Zahlungsmittel). */
export const OPTIMIZATION_EVENT_TYPES = Object.keys(ACTIVITY_LABEL).filter((k) => !k.startsWith("ad_review_") && !k.endsWith("_name"));

export function activityLabel(eventType: string, translated?: string | null): string {
  return ACTIVITY_LABEL[eventType] ?? translated ?? eventType;
}
