// Name des Beraters für Texte an Leads (Bot, Termin-Mails, Kalendereintrag).
// Kundennamen wie „Agentur Susanne Meier“ oder „Allianz Generalvertretung Meier“
// sollen als Person erscheinen, sonst schreibt der Bot „mit Agentur“ (Ole, 14.11.2026).

const INSURER =
  /^(?:allianz|ergo|axa|signal iduna|hdi|generali|zurich|r\+v|lvm|provinzial|devk|huk|gothaer|barmenia|continentale|debeka|wwk|nürnberger|vgh|arag|helvetia|vhv)\s+/i;
const AGENCY = /^(?:general|haupt|versicherungs|finanz)?(?:agentur|vertretung|büro|buero)(?:\s+(?:für|fuer)\s+\S+)?\s+/i;
// Vorangestellt ohne Zusatz („Allianz Versicherung Henrik Lohmann …“, Ole 20.11.2026)
const VERSICHERUNG = /^versicherung(?:en)?\s+/i;
// Nachgestellt („Henrik Lohmann Generalvertretung“, „Meier Versicherungen“)
const AGENCY_END = /\s+(?:(?:general|haupt|versicherungs|finanz)?(?:agentur|vertretung|büro|buero)|versicherung(?:en)?)$/i;

/** Personen- bzw. Agenturname ohne vorangestelltes „Agentur“, „Allianz“ usw.; null, wenn nichts übrig bleibt. */
export function advisorDisplayName(name: string | null | undefined): string | null {
  let s = (name ?? "").replace(/\s+/g, " ").trim();
  if (!s) return null;
  // Mehrfach anwenden: „Allianz Generalvertretung Agentur Meier“
  for (let i = 0; i < 4; i++) {
    const next = s.replace(INSURER, "").replace(AGENCY, "").replace(VERSICHERUNG, "").trim();
    // Nachgestellt nur entfernen, wenn Vor- und Nachname übrig bleiben („Meier Versicherungen“ bleibt)
    const ohneEnde = next.replace(AGENCY_END, "").trim();
    if (ohneEnde.includes(" ")) {
      if (ohneEnde !== s) { s = ohneEnde; continue; }
    }
    if (next === s) break;
    s = next;
  }
  s = s.replace(/\s+(?:e\.\s?k\.|ohg|gbr)$/i, "").trim();
  if (AGENCY.test(`${s} `) && !s.includes(" ")) return null; // nur „Agentur“
  return s.length >= 2 ? s : null;
}

/** Firmenname für Texte an Leads (Kundenname ohne vorangestelltes „Allianz“). */
export function firmDisplayName(customerName: string | null | undefined): string {
  const n = (customerName ?? "").replace(/\s+/g, " ").trim();
  // Ole, 24.11.2026 („Er ist ja nicht die Versicherung“): „Allianz Versicherung Henrik Lohmann Generalvertretung“ →
  // „Versicherungsagentur Henrik Lohmann“. Der Vermittler ist nicht der Versicherer, Vertretungs-Zusätze fallen weg.
  const kurz = n
    .replace(/^Allianz\s+/i, "")
    .replace(/^Versicherung(en)?\s+(?=\S)/i, "Versicherungsagentur ")
    .replace(/\s+(General|Haupt)vertretung$/i, "")
    .trim();
  return kurz || n;
}

/**
 * Beratername als Person: „Agentur Susanne Meier“ → „Susanne Meier“. Bleibt nur ein Wort übrig
 * („Generalvertretung Meier“ → „Meier“), lieber der Firmenname.
 */
export function personFromCustomerName(customerName: string | null | undefined): string {
  const p = advisorDisplayName(customerName);
  return p && p.includes(" ") ? p : firmDisplayName(customerName);
}

/** Person: Anzeigename des zuständigen Beraters, sonst aus dem Kundennamen. */
export function advisorPerson(customerName: string | null | undefined, assignedDisplayName?: string | null): string {
  const own = (assignedDisplayName ?? "").replace(/\s+/g, " ").trim();
  return own.length >= 2 ? own : personFromCustomerName(customerName);
}

const KEIN_VORNAME = /^(agentur|allianz|büro|buero|versicherung(en)?|versicherungsbüro|generalvertretung|hauptvertretung|vertretung|team|firma|gmbh|kg|ohg|gbr|finanz|makler|vermittler|kunde|test|dr\.?|prof\.?|herr|frau)$/i;

/** Vorname aus einem Personennamen („Ole Schmidt“ → „Ole“, „Dr. Anna Weber“ → „Anna“); null, wenn keiner erkennbar. */
export function vornameAus(name: string | null | undefined): string | null {
  const words = (name ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const rest = words.filter((w) => !KEIN_VORNAME.test(w));
  // „Agentur Meier“ → nur ein Nachname übrig: kein Vorname. Ein einzelnes Wort ohne Zusatz („Ole“) gilt als Vorname.
  if (!rest.length || (rest.length === 1 && words.length > 1)) return null;
  // Nur Buchstaben (auch „Hans-Peter“), kein Kürzel
  return /^\p{Lu}[\p{L}'-]+$/u.test(rest[0]) ? rest[0] : null;
}

/**
 * Name des Vermittlers im Erstanschreiben (Ole, 16.11.2026): Vorname aus dem Profil (zuständiger Berater, sonst Name
 * in den Anbieterangaben der Erstinformation), sonst der Agenturname. Kurz und persönlich: „KI-Assistent von Ole“.
 */
export function kurzNameFuerLeads(opts: { assignedDisplayName?: string | null; profilName?: string | null; customerName?: string | null }): string {
  return vornameAus(opts.assignedDisplayName) ?? vornameAus(opts.profilName) ?? firmDisplayName(opts.customerName);
}
