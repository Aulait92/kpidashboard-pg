// Infokarte auf der Login-Seite: Typen, Standard-Inhalt und Prüfung der Eingaben.
// Ohne Datenbank (testbar); Laden/Speichern in lib/login-info-server.ts.

export type LoginInfo = {
  enabled: boolean;
  badge: string | null;
  title: string;
  text: string | null;
  linkText: string | null;
  linkUrl: string | null;
  /** Bild hinterlegt (ausgeliefert unter /api/login-info/image?v=…). */
  hasImage: boolean;
  /** Cache-Schlüssel fürs Bild (Zeitpunkt der letzten Änderung). */
  version: number;
};

/** Ohne gepflegte Karte: Hinweis auf eine neue Funktion, ohne Bild und ohne erfundene Zahlen. */
export const DEFAULT_LOGIN_INFO: LoginInfo = {
  enabled: true,
  badge: "Neu",
  title: "Urlaub oder krank?",
  text: "Ein Klick auf „Ich bin abwesend“ – Leads, Termine und Rückrufe gehen an Ihre Vertretung oder warten bis zu Ihrer Rückkehr.",
  linkText: null,
  linkUrl: null,
  hasImage: false,
  version: 0,
};

export const LOGIN_INFO_LIMITS = {
  badge: 24,
  title: 80,
  text: 240,
  linkText: 40,
  linkUrl: 500,
  imageBytes: 1_500_000,
} as const;

export const LOGIN_INFO_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

export type LoginInfoInput = {
  enabled: boolean;
  badge: string | null;
  title: string;
  text: string | null;
  linkText: string | null;
  linkUrl: string | null;
};

const clean = (v: unknown): string | null => {
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? s : null;
};

/** Nur absolute http(s)-Links oder Pfade innerhalb der App („/rechner“). */
export function safeLinkUrl(raw: string | null): string | null {
  if (!raw) return null;
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Formulareingaben prüfen. Bei Fehlern wird nichts gespeichert. */
export function parseLoginInfoInput(raw: Record<string, unknown>): { ok: true; value: LoginInfoInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const L = LOGIN_INFO_LIMITS;
  const enabled = raw.enabled === true || raw.enabled === "on" || raw.enabled === "1" || raw.enabled === "true";
  const badge = clean(raw.badge);
  const title = clean(raw.title);
  // Text darf Zeilenumbrüche behalten (max. 3 Zeilen sinnvoll), nur Ränder kürzen.
  const textRaw = typeof raw.text === "string" ? raw.text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim() : "";
  const text = textRaw ? textRaw : null;
  const linkText = clean(raw.linkText);
  const linkUrlRaw = clean(raw.linkUrl);

  if (!title) errors.push("Bitte eine Überschrift eingeben.");
  else if (title.length > L.title) errors.push(`Überschrift höchstens ${L.title} Zeichen.`);
  if (badge && badge.length > L.badge) errors.push(`Etikett höchstens ${L.badge} Zeichen.`);
  if (text && text.length > L.text) errors.push(`Text höchstens ${L.text} Zeichen.`);
  if (linkText && linkText.length > L.linkText) errors.push(`Link-Text höchstens ${L.linkText} Zeichen.`);

  let linkUrl: string | null = null;
  if (linkUrlRaw) {
    if (linkUrlRaw.length > L.linkUrl) errors.push("Link ist zu lang.");
    else {
      linkUrl = safeLinkUrl(linkUrlRaw);
      if (!linkUrl) errors.push("Link muss mit https:// (oder http://) beginnen oder ein Pfad wie /rechner sein.");
    }
  }
  if (linkUrl && !linkText) errors.push("Bitte einen Link-Text eingeben (z. B. „Mehr erfahren“).");
  if (linkText && !linkUrlRaw) errors.push("Bitte zum Link-Text auch einen Link eingeben.");

  if (errors.length) return { ok: false, errors };
  return { ok: true, value: { enabled, badge, title: title!, text, linkText: linkUrl ? linkText : null, linkUrl } };
}

/** Bild prüfen: Typ (PNG/JPEG/WebP, auch anhand der Datei-Signatur) und Größe. */
export function checkLoginInfoImage(bytes: Uint8Array, declaredType: string): { ok: true; type: string } | { ok: false; error: string } {
  if (bytes.length === 0) return { ok: false, error: "Die Bilddatei ist leer." };
  if (bytes.length > LOGIN_INFO_LIMITS.imageBytes) return { ok: false, error: "Bild höchstens 1,5 MB." };
  const sniffed = sniffImageType(bytes);
  if (!sniffed || !(LOGIN_INFO_IMAGE_TYPES as readonly string[]).includes(sniffed)) {
    return { ok: false, error: "Bitte ein Bild als PNG, JPG oder WebP hochladen." };
  }
  void declaredType;
  return { ok: true, type: sniffed };
}

function sniffImageType(b: Uint8Array): string | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}
