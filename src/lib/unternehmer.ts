// Unternehmereigenschaft bei der Annahme eines Angebots (Anwalts-Memo, Ole 15.11.2026): Firma (Pflicht),
// USt-IdNr. (freiwillig, Format geprüft) und die Bestätigung „Ich handle als Unternehmer (§ 14 BGB)“ (Pflicht).
// Wird mit der Annahme am Angebot gespeichert. Reine Funktionen (auch im Browser).

export const BUSINESS_CONFIRM_TEXT =
  "Ich schließe diesen Vertrag als Unternehmer im Sinne von § 14 BGB, also in Ausübung meiner gewerblichen oder selbstständigen beruflichen Tätigkeit, und nicht als Verbraucher.";

/** USt-IdNr. vereinheitlichen: Leerzeichen, Punkte und Bindestriche raus, Großbuchstaben. */
export const normalizeVatId = (v: string) => v.replace(/[\s.\-]/g, "").toUpperCase();

/** Format einer USt-IdNr. (deutsch: DE + 9 Ziffern; sonst EU-Länderkürzel + 2 bis 13 Zeichen). Keine Online-Prüfung. */
export function vatIdFormatOk(v: string): boolean {
  const n = normalizeVatId(v);
  if (n.startsWith("DE")) return /^DE\d{9}$/.test(n);
  return /^(AT|BE|BG|CY|CZ|DK|EE|EL|ES|FI|FR|HR|HU|IE|IT|LT|LU|LV|MT|NL|PL|PT|RO|SE|SI|SK|XI)[0-9A-Z+*]{2,13}$/.test(n);
}

export type BusinessInput = { company?: string | null; vatId?: string | null; confirmed?: boolean | null };
export type BusinessResult = { ok: true; company: string; vatId: string | null } | { ok: false; error: string };

export function checkBusiness(i: BusinessInput | null | undefined): BusinessResult {
  const company = (i?.company ?? "").trim().replace(/\s+/g, " ");
  if (company.length < 2) return { ok: false, error: "Bitte geben Sie Ihre Firma bzw. den Namen Ihres Unternehmens an." };
  const raw = (i?.vatId ?? "").trim();
  if (raw && !vatIdFormatOk(raw)) return { ok: false, error: "Die USt-IdNr. sieht nicht vollständig aus (z. B. DE123456789). Sie können das Feld auch leer lassen." };
  if (!i?.confirmed) return { ok: false, error: "Bitte bestätigen Sie, dass Sie als Unternehmer handeln." };
  return { ok: true, company: company.slice(0, 200), vatId: raw ? normalizeVatId(raw) : null };
}
