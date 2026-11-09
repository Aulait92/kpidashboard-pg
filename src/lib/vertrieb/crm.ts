import type { SalesActivityType as ActivityType, SalesCustomerStage as CustomerStage, SalesLossReason as LossReason, SalesStage as Stage, SalesTaskType as TaskType } from "@/generated/prisma/enums";

export const STAGES: { id: Stage; label: string; color: string; hint: string }[] = [
  { id: "NEU", label: "Neu", color: "bg-slate-100 text-slate-700", hint: "Noch kein Kontakt" },
  { id: "NICHT_ERREICHT", label: "Nicht erreicht", color: "bg-amber-100 text-amber-800", hint: "Mailbox, Warteschleife, nicht im Haus" },
  { id: "WIEDERVORLAGE", label: "Wiedervorlage", color: "bg-sky-100 text-sky-800", hint: "Rückruf vereinbart / später nochmal" },
  { id: "INTERESSE", label: "Interesse / Unterlagen", color: "bg-violet-100 text-violet-800", hint: "Einseiter oder Präsentation gesendet" },
  { id: "TERMIN", label: "Termin", color: "bg-indigo-100 text-indigo-800", hint: "Termin vereinbart" },
  { id: "GEWONNEN", label: "Gewonnen", color: "bg-emerald-100 text-emerald-800", hint: "Zusage / Vertrag" },
  { id: "SPAETER", label: "Später", color: "bg-teal-100 text-teal-800", hint: "Nächstes Jahr, ab März …" },
  { id: "VERLOREN", label: "Verloren", color: "bg-rose-100 text-rose-800", hint: "Kein Interesse / kein Bedarf" },
  { id: "UNGUELTIG", label: "Ungültig", color: "bg-zinc-200 text-zinc-600", hint: "Falsche Nummer, Blacklist, Ruhestand" },
];

export const STAGE_LABEL = Object.fromEntries(STAGES.map((s) => [s.id, s.label])) as Record<Stage, string>;
export const STAGE_COLOR = Object.fromEntries(STAGES.map((s) => [s.id, s.color])) as Record<Stage, string>;

export const LOSS_REASONS: { id: LossReason; label: string }[] = [
  { id: "KEIN_BEDARF", label: "Kein Bedarf / ausgelastet" },
  { id: "HAT_ANBIETER", label: "Hat schon Anbieter" },
  { id: "UEBER_ALLIANZ", label: "Macht es über die Allianz" },
  { id: "ZU_TEUER", label: "Zu teuer / kein Budget" },
  { id: "KEIN_INTERESSE", label: "Kein Interesse" },
  { id: "SONSTIGES", label: "Sonstiges" },
];
export const LOSS_LABEL = Object.fromEntries(LOSS_REASONS.map((s) => [s.id, s.label])) as Record<LossReason, string>;

export const TASK_TYPES: { id: TaskType; label: string }[] = [
  { id: "ANRUF", label: "Anrufen" },
  { id: "NACHFASSEN", label: "Nachfassen" },
  { id: "UNTERLAGEN", label: "Unterlagen senden" },
  { id: "TERMIN", label: "Termin" },
  { id: "SONSTIGES", label: "Sonstiges" },
];
export const TASK_LABEL = Object.fromEntries(TASK_TYPES.map((s) => [s.id, s.label])) as Record<TaskType, string>;

export const ACTIVITY_LABEL: Record<ActivityType, string> = {
  ANRUF: "Anruf",
  EMAIL: "E-Mail",
  NOTIZ: "Notiz",
  STATUS: "Status",
  COLD_MAIL: "Cold Mail",
  LINKEDIN: "LinkedIn",
  TERMIN: "Termin",
  IMPORT: "Aus Liste",
};

/**
 * Ergebnisse beim Erfassen einer Aktivität. Jedes Ergebnis setzt die
 * Pipeline-Stufe und schlägt eine Folgeaufgabe vor (Tage = Werktage).
 */
export type Outcome = {
  id: string;
  label: string;
  stage: Stage | null; // null = Stufe nicht ändern
  task?: { title: string; type: TaskType; workdays: number };
  closesTasks?: boolean; // offene Aufgaben erledigen
  needsReason?: boolean;
};

export const OUTCOMES: Outcome[] = [
  { id: "nicht_erreicht", label: "Nicht erreicht (Mailbox etc.)", stage: "NICHT_ERREICHT", task: { title: "Erneut anrufen", type: "ANRUF", workdays: 2 } },
  { id: "rueckruf", label: "Rückruf / Wiedervorlage", stage: "WIEDERVORLAGE", task: { title: "Nochmal anrufen", type: "ANRUF", workdays: 1 } },
  { id: "unterlagen", label: "Unterlagen gesendet (Einseiter / Präsentation)", stage: "INTERESSE", task: { title: "Nachfassen: Unterlagen gesendet", type: "NACHFASSEN", workdays: 3 } },
  { id: "unterlagen_senden", label: "Will Unterlagen – noch senden", stage: "INTERESSE", task: { title: "Unterlagen senden", type: "UNTERLAGEN", workdays: 0 } },
  { id: "termin", label: "Termin vereinbart", stage: "TERMIN", task: { title: "Termin", type: "TERMIN", workdays: 2 } },
  { id: "gewonnen", label: "Gewonnen / Zusage", stage: "GEWONNEN", task: { title: "Vertrag senden", type: "SONSTIGES", workdays: 0 } },
  { id: "spaeter", label: "Später wieder (Monate)", stage: "SPAETER", task: { title: "Wieder melden", type: "ANRUF", workdays: 60 } },
  { id: "verloren", label: "Kein Interesse / Verloren", stage: "VERLOREN", closesTasks: true, needsReason: true },
  { id: "ungueltig", label: "Ungültig (falsche Nr., Blacklist …)", stage: "UNGUELTIG", closesTasks: true },
  { id: "notiz", label: "Nur Notiz (Stufe bleibt)", stage: null },
];

export const OUTCOME_BY_ID = Object.fromEntries(OUTCOMES.map((o) => [o.id, o]));

/** Reihenfolge, damit "Nicht erreicht" einen Kontakt aus z.B. Interesse nicht zurückstuft */
export const STAGE_RANK: Record<Stage, number> = {
  NEU: 0, NICHT_ERREICHT: 1, WIEDERVORLAGE: 2, SPAETER: 2, INTERESSE: 3, TERMIN: 4, GEWONNEN: 5, VERLOREN: 5, UNGUELTIG: 5,
};

export const CAMPAIGN_STATUS: Record<number, string> = {
  1: "Aktiv", 2: "Pausiert", 3: "Abgeschlossen", [-1]: "Bounced", [-2]: "Abgemeldet", [-3]: "Übersprungen",
};

/** "Allianz Versicherung Max Muster HAUPTVERTRETUNG" → "Max Muster" */
export function shortName(name: string): string {
  return name.replace(/^Allianz Versicherung\s+/i, "").replace(/\s+HAUPTVERTRETUNG$/i, "").trim() || name;
}


// ─── Kunden-Pipeline (nach der Zusage) ──────────────────────────────────
export const CUSTOMER_STAGES: { id: CustomerStage; label: string; color: string; hint: string }[] = [
  { id: "VERTRAG", label: "Vertrag versendet", color: "bg-amber-100 text-amber-800", hint: "Zusage da, Vertrag noch nicht unterschrieben" },
  { id: "ONBOARDING", label: "Onboarding", color: "bg-sky-100 text-sky-800", hint: "Unterschrieben – Produkte, Gebiet, Kampagnen aufsetzen" },
  { id: "TEST", label: "Testphase", color: "bg-violet-100 text-violet-800", hint: "Erste Leads / Testpaket läuft" },
  { id: "AKTIV", label: "Aktiv", color: "bg-emerald-100 text-emerald-800", hint: "Laufender Kunde, Leads werden geliefert" },
  { id: "PAUSIERT", label: "Pausiert", color: "bg-slate-200 text-slate-700", hint: "Lieferung pausiert (Budget, Urlaub, Auslastung)" },
  { id: "GEKUENDIGT", label: "Gekündigt", color: "bg-rose-100 text-rose-800", hint: "Kein Kunde mehr" },
];
export const CUSTOMER_LABEL = Object.fromEntries(CUSTOMER_STAGES.map((s) => [s.id, s.label])) as Record<CustomerStage, string>;
export const CUSTOMER_COLOR = Object.fromEntries(CUSTOMER_STAGES.map((s) => [s.id, s.color])) as Record<CustomerStage, string>;

// ─── Akquise-Kanal (woher kommt der Kunde) ──────────────────────────────
export const SOURCES = [
  { id: "COLD_CALL", label: "Cold Call", color: "bg-amber-50 text-amber-800" },
  { id: "COLD_MAIL", label: "Cold Mail", color: "bg-sky-50 text-sky-800" },
  { id: "LINKEDIN", label: "LinkedIn", color: "bg-indigo-50 text-indigo-800" },
  { id: "META_ADS", label: "Meta Ads", color: "bg-blue-50 text-blue-800" },
  { id: "EMPFEHLUNG", label: "Empfehlung", color: "bg-emerald-50 text-emerald-800" },
  { id: "INBOUND", label: "Inbound / Website", color: "bg-violet-50 text-violet-800" },
  { id: "NETZWERK", label: "Netzwerk / Event", color: "bg-teal-50 text-teal-800" },
  { id: "SONSTIGES", label: "Sonstiges", color: "bg-slate-100 text-slate-700" },
] as const;
export const SOURCE_LABEL = Object.fromEntries(SOURCES.map((s) => [s.id, s.label])) as Record<string, string>;
export const SOURCE_COLOR = Object.fromEntries(SOURCES.map((s) => [s.id, s.color])) as Record<string, string>;
