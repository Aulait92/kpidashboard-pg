// Pflichtangaben ohne Website (Ole, 20.11.2026, Admin Punkt 11): Allianz-Vertreter und andere Kunden ohne eigene
// Website haben kein Impressum, das wir lesen können. Eine vollständige Erstinformation (lib/erstinformation-shared.ts,
// Pflichtangaben nach § 15 VersVermV) reicht dann: Checkliste „Pflichtangaben (Impressum) geprüft“ gilt als erledigt,
// im Admin steht „Erstinformation statt Website“ statt des orangen Hinweises. Reine Funktionen.

export const KEINE_WEBSITE = "Keine (gültige) Website hinterlegt.";
export const ERSTINFO_STATT_WEBSITE = "Erstinformation statt Website";

/** Ersetzt die vollständige Erstinformation das Impressum? Nur, wenn wirklich keine (gültige) Website hinterlegt ist. */
export function erstinfoStattWebsite(info: { error?: string | null } | null | undefined, erstinfoVollstaendig: boolean): boolean {
  return erstinfoVollstaendig && !!info && info.error === KEINE_WEBSITE;
}
