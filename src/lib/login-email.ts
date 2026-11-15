// Eine Normalisierung für Login-Adressen (Go-live 15.11.2026, Login mit „+“-Adressen):
// überall gleich beim Anlegen (Onboarding, Einladung, Admin-Logins, Betriebs-API, E-Mail ändern),
// beim Login, beim Passwort-Reset und in der Diagnose. Regeln: trim, Kleinschreibung, „+“ bleibt.
//
// Ein „+“ in einer URL-Query wird beim Dekodieren zum Leerzeichen („ole+1@x.de“ → „ole 1@x.de“),
// doppelt kodiert steht dort „%2B“. Leerzeichen sind in E-Mail-Adressen nie gültig, deshalb werden
// sie im lokalen Teil wieder zu „+“ (eindeutig), „%2b“ ebenso.

export const LOGIN_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeLoginEmail(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const e = raw.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  const local = e.slice(0, at).replace(/%2b/g, "+").replace(/\s+/g, "+");
  const domain = e.slice(at + 1).replace(/\s+/g, "");
  return `${local}@${domain}`;
}

/** Normalisierte Adresse oder null, wenn sie nicht nach E-Mail aussieht. */
export function validLoginEmail(raw: unknown): string | null {
  const e = normalizeLoginEmail(raw);
  return LOGIN_EMAIL_RE.test(e) ? e : null;
}
