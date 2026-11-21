// Wer im Team bekommt neue Leads? (Ole, 21.11.2026: „die eingeladenen müssten ihr onboarding gemacht haben, also
// kalender verbunden und app auf handy, damit sie die pushnotifications bekommen“). Ein Mitglied mit „bekommt Leads“
// wird bei der Verteilung (lib/team.ts assignLead) erst berücksichtigt, wenn sein eigener Kalender verbunden ist und
// mindestens ein Gerät Mitteilungen empfängt (PushSubscription). Der Inhaber ist immer bereit: Für ihn gilt der
// Agentur-Kalender, und ohne bereite Mitglieder landen Leads ohnehin bei ihm. Rein, getestet.

export type BereitFehlt = "kalender" | "app";

export function bereitFuerLeads(m: { owner: boolean; kalender: boolean; push: boolean }): { bereit: boolean; fehlt: BereitFehlt[] } {
  if (m.owner) return { bereit: true, fehlt: [] };
  const fehlt: BereitFehlt[] = [...(m.kalender ? [] : (["kalender"] as const)), ...(m.push ? [] : (["app"] as const))];
  return { bereit: fehlt.length === 0, fehlt };
}

const LABEL: Record<BereitFehlt, string> = { kalender: "Kalender verbinden", app: "App aufs Handy mit Mitteilungen" };

/** Kurztext für die Teamliste: „bekommt Leads nach: Kalender verbinden, App aufs Handy mit Mitteilungen“. */
export function wartetText(fehlt: BereitFehlt[]): string | null {
  return fehlt.length ? `bekommt Leads nach: ${fehlt.map((f) => LABEL[f]).join(", ")}` : null;
}
