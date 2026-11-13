// Neuigkeiten im Kundenbereich: Typen und Regeln (Browser und Server).

export const UPDATE_KINDS = ["neu", "verbessert", "behoben"] as const;
export type UpdateKind = (typeof UPDATE_KINDS)[number];
export const UPDATE_AUDIENCES = ["alle", "software", "betreuung"] as const;
export type UpdateAudience = (typeof UPDATE_AUDIENCES)[number];

export const KIND_LABEL: Record<UpdateKind, string> = { neu: "Neu", verbessert: "Verbessert", behoben: "Behoben" };
export const AUDIENCE_LABEL: Record<UpdateAudience, string> = {
  alle: "Alle Kunden",
  software: "Nur Betreuung + Software",
  betreuung: "Nur „Nur Betreuung“",
};

export type UpdateView = {
  id: string;
  title: string;
  body: string;
  kind: UpdateKind;
  audience: UpdateAudience;
  publishedAt: string | null;
};

export const asKind = (v: unknown): UpdateKind => (UPDATE_KINDS.includes(v as UpdateKind) ? (v as UpdateKind) : "neu");
export const asAudience = (v: unknown): UpdateAudience => (UPDATE_AUDIENCES.includes(v as UpdateAudience) ? (v as UpdateAudience) : "alle");

/** Welche Zielgruppen sieht ein Kunde mit diesem Paket? */
export function audiencesForPlan(plan: string | null | undefined): UpdateAudience[] {
  return plan === "service" ? ["alle", "betreuung"] : ["alle", "software"];
}

/** Monat als Zwischenüberschrift, z. B. „November 2026“ (deutsche Zeit). */
export function monthLabel(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", month: "long", year: "numeric" }).format(new Date(iso));
}

/** Liste nach Monat gruppieren (Reihenfolge der Eingabe bleibt erhalten). */
export function groupByMonth<T extends { publishedAt: string | null }>(items: T[]): { month: string; items: T[] }[] {
  const out: { month: string; items: T[] }[] = [];
  for (const it of items) {
    const m = it.publishedAt ? monthLabel(it.publishedAt) : "Entwurf";
    const last = out[out.length - 1];
    if (last && last.month === m) last.items.push(it);
    else out.push({ month: m, items: [it] });
  }
  return out;
}

/** Leerer Titel/Text → Fehlermeldung, sonst null. */
export function validateUpdate(input: { title: string; body: string }): string | null {
  if (input.title.trim().length < 3) return "Bitte einen Titel eingeben.";
  if (input.title.trim().length > 120) return "Der Titel ist zu lang (max. 120 Zeichen).";
  if (input.body.trim().length < 10) return "Bitte einen kurzen Text eingeben.";
  if (input.body.length > 2000) return "Der Text ist zu lang (max. 2.000 Zeichen).";
  return null;
}
