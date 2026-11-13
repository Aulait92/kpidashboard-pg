// Kundenzufriedenheit (Ole, 13.11.2026): Net Promoter Score – „Wie wahrscheinlich ist es, dass Sie
// performancegrowth weiterempfehlen?“ (0–10). Erstmals nach 30 Tagen, danach alle 90 Tage.
// Tag 7 bleibt die kurze Start-Abfrage mit Smileys (1–5).
// NPS = Anteil Promotoren (9–10) minus Anteil Kritiker (0–6), in Prozentpunkten (−100 … +100).

const DAY = 24 * 60 * 60 * 1000;

/** Smiley-Abfrage (1–5) nur am Start, sonst 0–10. */
export const isNpsKind = (kind: string) => kind !== "day7";
export const scaleOf = (kind: string) => (isNpsKind(kind) ? { min: 0, max: 10 } : { min: 1, max: 5 });

export const NPS_PROMOTER = 9;
export const NPS_DETRACTOR_MAX = 6;

/** Kritiker: sofort nachhaken (NPS 0–6 bzw. Smiley 1–2). */
export const isUnhappy = (kind: string, score: number) => (isNpsKind(kind) ? score <= NPS_DETRACTOR_MAX : score <= 2);

export function kindLabel(kind: string): string {
  if (kind === "day7") return "Start (Tag 7)";
  const d = Number(kind.replace(/^day/, ""));
  return Number.isFinite(d) ? `Weiterempfehlung (Tag ${d})` : kind;
}

/**
 * Fällige Abfrage für einen Kunden: Tag 7 (nur im ersten Monat), Tag 30, dann Tag 90, 180, 270 …
 * Nur die jüngste fällige und höchstens 30 Tage alte Abfrage (keine Nachzügler nach langer Zeit).
 */
export function dueFeedbackKind(liveAt: Date, now: Date, sent: Set<string>): string | null {
  const age = now.getTime() - liveAt.getTime();
  if (age < 7 * DAY) return null;
  if (age < 30 * DAY) return sent.has("day7") ? null : "day7";
  const days = Math.floor(age / DAY);
  const latest = days < 90 ? 30 : Math.floor(days / 90) * 90;
  if (days - latest >= 30) return null;
  const kind = `day${latest}`;
  return sent.has(kind) ? null : kind;
}

/** NPS aus 0–10-Antworten. null ohne Antworten. */
export function npsOf(scores: number[]): { nps: number; promoters: number; passives: number; detractors: number; total: number } | null {
  const valid = scores.filter((s) => Number.isInteger(s) && s >= 0 && s <= 10);
  if (!valid.length) return null;
  const promoters = valid.filter((s) => s >= NPS_PROMOTER).length;
  const detractors = valid.filter((s) => s <= NPS_DETRACTOR_MAX).length;
  return {
    nps: Math.round(((promoters - detractors) / valid.length) * 100),
    promoters,
    passives: valid.length - promoters - detractors,
    detractors,
    total: valid.length,
  };
}
