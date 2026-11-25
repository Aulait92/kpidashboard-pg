// Knopftext für den Onboarding-Termin im Admin (Ole, 25.11.2026): Ist unter „Andere Zeit“ eine Zeit eingetragen, gewinnt
// sie (app/admin/vertrieb/onboarding-actions.ts onboardingTerminBuchenAction). Der Knopf nennt deshalb immer die Zeit,
// die wirklich gebucht wird: „Termin am 26.11. um 13:30 buchen“. Rein, getestet (tests/unit/onboarding-termin-knopf.test.ts).

const TZ = "Europe/Berlin";

/** „2026-11-26T13:30“ aus dem Feld „Andere Zeit“ (deutsche Ortszeit, wie eingegeben) → { tag: „26.11.“, uhr: „13:30“ }. */
function ausLokal(s: string): { tag: string; uhr: string } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(s.trim());
  if (!m) return null;
  return { tag: `${m[3]}.${m[2]}.`, uhr: `${m[4]}:${m[5]}` };
}

/** ISO-Zeitpunkt eines Vorschlags → Tag und Uhrzeit in deutscher Ortszeit. */
function ausIso(iso: string): { tag: string; uhr: string } | null {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return null;
  return {
    tag: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d),
    uhr: new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d),
  };
}

export type TerminWahl = { text: string; quelle: "andere" | "vorschlag" | null };

/** Welche Zeit wird gebucht, und wie heißt der Knopf? Andere Zeit vor Vorschlag; ohne beides „Termin buchen“. */
export function terminKnopf(o: { vorschlag: string | null | undefined; andereZeit: string | null | undefined }): TerminWahl {
  const andere = (o.andereZeit ?? "").trim();
  if (andere) {
    const z = ausLokal(andere);
    return { text: z ? `Termin am ${z.tag} um ${z.uhr} buchen` : "Termin buchen", quelle: "andere" };
  }
  const z = o.vorschlag ? ausIso(o.vorschlag) : null;
  return z ? { text: `Termin am ${z.tag} um ${z.uhr} buchen`, quelle: "vorschlag" } : { text: "Termin buchen", quelle: null };
}
