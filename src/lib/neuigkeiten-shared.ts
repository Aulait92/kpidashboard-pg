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

// ─── Wochenblöcke (Usability-Check 25.11.2026) ─────────────────────────────
// Höchstens 3 Neuigkeiten je Woche stehen einzeln da; weitere Einträge derselben Woche und ältere Wochen sind zu einem
// aufklappbaren Block zusammengefasst. Gelöscht wird nichts.

/** Höchstens so viele Einträge je Woche einzeln. */
export const EINZELN_JE_WOCHE = 3;
const KIND_RANG: Record<UpdateKind, number> = { neu: 0, verbessert: 1, behoben: 2 };

/** Kalendertag in deutscher Zeit als UTC-Mitternacht (nur zum Rechnen mit Tagen). */
function berlinTag(iso: string): Date {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return new Date(`${p}T00:00:00Z`);
}

/** Montag der Woche (deutsche Zeit) als JJJJ-MM-TT. */
export function wochenStart(iso: string): string {
  const d = berlinTag(iso);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** „Diese Woche“, „Letzte Woche“ oder „Woche vom 16. bis 22. November“. */
export function wochenLabel(montag: string, now = new Date()): string {
  const heute = wochenStart(now.toISOString());
  const vorher = new Date(`${heute}T00:00:00Z`);
  vorher.setUTCDate(vorher.getUTCDate() - 7);
  if (montag === heute) return "Diese Woche";
  if (montag === vorher.toISOString().slice(0, 10)) return "Letzte Woche";
  const von = new Date(`${montag}T00:00:00Z`);
  const bis = new Date(von);
  bis.setUTCDate(bis.getUTCDate() + 6);
  const tag = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC", day: "numeric", month: "long" }).format(d);
  const tagKurz = (d: Date) => `${d.getUTCDate()}.`;
  return `Woche vom ${von.getUTCMonth() === bis.getUTCMonth() ? tagKurz(von) : tag(von)} bis ${tag(bis)}`;
}

export type Wochenblock<T> = { montag: string; label: string; einzeln: T[]; weitere: T[] };

/**
 * Veröffentlichte Neuigkeiten (neueste zuerst) in Wochen gruppieren, neueste Woche zuerst. Je Woche höchstens
 * EINZELN_JE_WOCHE als einzelne Einträge: zuerst „Neu“, dann „Verbessert“, dann „Behoben“, jeweils die neuesten; die
 * übrigen unter `weitere`. Innerhalb beider Listen bleibt die Reihenfolge neueste zuerst.
 */
export function wochenBloecke<T extends { id: string; kind: UpdateKind; publishedAt: string | null }>(items: T[], now = new Date()): Wochenblock<T>[] {
  const nachWoche = new Map<string, T[]>();
  for (const it of items) {
    if (!it.publishedAt) continue;
    const w = wochenStart(it.publishedAt);
    nachWoche.set(w, [...(nachWoche.get(w) ?? []), it]);
  }
  const zeit = (t: T) => new Date(t.publishedAt!).getTime();
  return [...nachWoche.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([montag, liste]) => {
      const sortiert = [...liste].sort((a, b) => zeit(b) - zeit(a));
      const wahl = new Set([...sortiert].sort((a, b) => KIND_RANG[a.kind] - KIND_RANG[b.kind] || zeit(b) - zeit(a)).slice(0, EINZELN_JE_WOCHE).map((t) => t.id));
      return {
        montag,
        label: wochenLabel(montag, now),
        einzeln: sortiert.filter((t) => wahl.has(t.id)),
        weitere: sortiert.filter((t) => !wahl.has(t.id)),
      };
    });
}

/** Leerer Titel/Text → Fehlermeldung, sonst null. */
export function validateUpdate(input: { title: string; body: string }): string | null {
  if (input.title.trim().length < 3) return "Bitte einen Titel eingeben.";
  if (input.title.trim().length > 120) return "Der Titel ist zu lang (max. 120 Zeichen).";
  if (input.body.trim().length < 10) return "Bitte einen kurzen Text eingeben.";
  if (input.body.length > 2000) return "Der Text ist zu lang (max. 2.000 Zeichen).";
  return null;
}
