// Push-Ziele für Admins (Ole, 17.11.2026; seit dem Admin-Umbau 20.11.2026 gibt es nur noch den neuen Admin).
//
// sendToAdmins (lib/push.ts) schreibt alte Admin-Adressen schon beim Senden auf die neue Seite um (umzug.ts: neuerPfad).
// Bereits verschickte Pushes tragen noch die alte Adresse mit der Marke ?von=push: Die Middleware nimmt die Marke ab und
// leitet wie jede alte Adresse auf die neue Seite.
//
// Reine Daten, auch in der Middleware nutzbar.

import { neuerPfad } from "./umzug";

export const PUSH_PARAM = "von";
export const PUSH_WERT = "push";

const istAlteAdminAdresse = (pfad: string) => /^\/admin(\/|$)/.test(pfad) && !/^\/admin\/neu(\/|$)/.test(pfad);

/** Ziel eines Admin-Pushs: alte Admin-Adressen auf die neue Seite, alles andere unverändert. */
export function pushAdresse(url: string): string;
export function pushAdresse(url: string | undefined): string | undefined;
export function pushAdresse(url: string | undefined): string | undefined {
  if (!url) return url;
  const m = /^([^?#]*)/.exec(url);
  if (!m || !istAlteAdminAdresse(m[1])) return url;
  return neuerPfad(url) ?? url;
}

/**
 * Weiche für eine alte Admin-Adresse (Middleware, GET). null = keine alte Admin-Adresse mit Gegenstück (nichts tun).
 * Sonst das Ziel (Pfad + Anfrage) ohne Push-Marke. Der #Anker bleibt beim Weiterleiten im Browser erhalten.
 */
export function alteAdresseWeiche({ pathname, search }: { pathname: string; search: string }): string | null {
  if (!istAlteAdminAdresse(pathname)) return null;
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  if (q.get(PUSH_PARAM) === PUSH_WERT) q.delete(PUSH_PARAM);
  const rest = q.toString();
  return neuerPfad(`${pathname}${rest ? `?${rest}` : ""}`);
}
