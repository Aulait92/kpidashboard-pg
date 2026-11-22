// Telefonnummern ins WhatsApp-Format bringen: nur Ziffern inkl. Ländervorwahl,
// ohne "+" (so liefert der 360dialog-Webhook `from`, z. B. 4915112345678).
// Deutsche Nummern ohne Vorwahl (0151…) bekommen 49 vorangestellt.

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // bereits international. Aber (Ole, 22.11.2026, Lohmann-Lead „+101752429849“): Im Meta-Formular war eine falsche
    // Ländervorwahl gewählt bzw. die 0 der Vorwahl mitgetippt. Nach +1 (USA/Kanada) beginnt nie eine 0, das ist eine
    // deutsche Nummer (0175… → 49175…). Nach +49, +43, +41 die 0 der Vorwahl entfernen (Italien +39 behält die 0).
    if (digits.startsWith("10") && digits.length >= 11) digits = `49${digits.slice(2)}`;
    else if (/^(49|43|41)0/.test(digits)) digits = digits.slice(0, 2) + digits.slice(3);
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `49${digits.slice(1)}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
