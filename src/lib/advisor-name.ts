// Name des Beraters für Texte an Leads (Bot, Termin-Mails, Kalendereintrag).
// Kundennamen wie „Agentur Susanne Meier“ oder „Allianz Generalvertretung Meier“
// sollen als Person erscheinen, sonst schreibt der Bot „mit Agentur“ (Ole, 14.11.2026).

const INSURER =
  /^(?:allianz|ergo|axa|signal iduna|hdi|generali|zurich|r\+v|lvm|provinzial|devk|huk|gothaer|barmenia|continentale|debeka|wwk|nürnberger|vgh|arag|helvetia|vhv)\s+/i;
const AGENCY = /^(?:general|haupt|versicherungs|finanz)?(?:agentur|vertretung|büro|buero)(?:\s+(?:für|fuer)\s+\S+)?\s+/i;

/** Personen- bzw. Agenturname ohne vorangestelltes „Agentur“, „Allianz“ usw.; null, wenn nichts übrig bleibt. */
export function advisorDisplayName(name: string | null | undefined): string | null {
  let s = (name ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Mehrfach anwenden: „Allianz Generalvertretung Agentur Meier“
  for (let i = 0; i < 4; i++) {
    const next = s.replace(INSURER, "").replace(AGENCY, "").trim();
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+(?:e\.\s?k\.|ohg|gbr)$/i, "").trim();
  if (AGENCY.test(`${s} `) && !s.includes(" ")) return null; // nur „Agentur“
  return s.length >= 2 ? s : null;
}
