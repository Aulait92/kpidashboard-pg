// Telefonnummern ins WhatsApp-Format bringen: nur Ziffern inkl. Ländervorwahl,
// ohne "+" (so liefert der 360dialog-Webhook `from`, z. B. 4915112345678).
// Deutsche Nummern ohne Vorwahl (0151…) bekommen 49 vorangestellt.

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  let digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (trimmed.startsWith("+")) {
    // bereits international
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = `49${digits.slice(1)}`;
  }
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
