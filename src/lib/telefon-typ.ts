// Art einer Telefonnummer (rein, libphonenumber, ohne Datenbank). Erwartet die Nummer international, mit oder ohne „+“
// (so speichern wir sie, z. B. „4930123456“). Unbekannt bzw. ungültig ist weder Festnetz noch Mobil: solche Nummern
// werden nirgends blockiert (Ole, 20.11.2026: nur sichere FIXED_LINE sperrt WhatsApp).
// Genutzt von der Mail-Strecke (Auslöser „Festnetz“, SMS nur an Mobil), dem Vertrieb (Terminbestätigung) und der
// Festnetz-Sperre für WhatsApp an Leads (lib/whatsapp/festnetz.ts).

/** Ist die Nummer sicher eine Festnetznummer (FIXED_LINE)? Unbekannt, ungültig oder „Festnetz oder Mobil“: false. */
export async function istFestnetz(phone: string | null | undefined): Promise<boolean> {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 6) return false;
  const { parsePhoneNumberFromString } = await import("libphonenumber-js/max");
  const nr = parsePhoneNumberFromString(`+${d}`);
  return !!nr && nr.isValid() && nr.getType() === "FIXED_LINE";
}

/** Handynummer (für SMS)? */
export async function istMobil(phone: string | null | undefined): Promise<boolean> {
  const d = (phone ?? "").replace(/\D/g, "");
  if (d.length < 8) return false;
  const { parsePhoneNumberFromString } = await import("libphonenumber-js/max");
  const nr = parsePhoneNumberFromString(`+${d}`);
  return !!nr && nr.isValid() && nr.getType() === "MOBILE";
}
