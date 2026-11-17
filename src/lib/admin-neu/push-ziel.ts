// Push-Ziele für Admins in beiden Oberflächen (Ole, 17.11.2026).
//
// Pushes gehen an alle Admins, egal welche Oberfläche sie nutzen. Darum bleibt das Ziel die alte Adresse, bekommt aber
// die Marke ?von=push (sendToAdmins in lib/push.ts). Die Middleware nimmt die Marke wieder ab und leitet weiter:
// mit eingeschaltetem Schalter „Neue Oberfläche“ (oder nach dem Umzug, UMZUG_AKTIV) auf die fertige neue Seite
// (umzug.ts: neuerPfad), sonst auf die alte Adresse ohne Marke. Seiten ohne fertige neue Fassung bleiben alt.
//
// Reine Daten, auch in der Middleware nutzbar.

import { neuerPfad, UMZUG_AKTIV } from "./umzug";

export const PUSH_PARAM = "von";
export const PUSH_WERT = "push";

const istAlteAdminAdresse = (pfad: string) => /^\/admin(\/|$)/.test(pfad) && !/^\/admin\/neu(\/|$)/.test(pfad);

/** Ziel eines Admin-Pushs mit Marke (nur alte Admin-Adressen; alles andere unverändert). */
export function pushAdresse(url: string): string;
export function pushAdresse(url: string | undefined): string | undefined;
export function pushAdresse(url: string | undefined): string | undefined {
  if (!url) return url;
  const m = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(url);
  if (!m || !istAlteAdminAdresse(m[1])) return url;
  const q = new URLSearchParams((m[2] ?? "").slice(1));
  if (q.get(PUSH_PARAM) === PUSH_WERT) return url;
  q.append(PUSH_PARAM, PUSH_WERT);
  return `${m[1]}?${q.toString()}${m[3] ?? ""}`;
}

/**
 * Weiche für einen Aufruf mit Push-Marke. null = keine Marke (nichts tun). Sonst das Ziel (Pfad + Anfrage, ohne Marke):
 * die neue Seite, wenn der Admin die neue Oberfläche nutzt und sie fertig ist, sonst die alte Adresse.
 * Der #Anker bleibt beim Weiterleiten im Browser erhalten.
 */
export function pushWeiche({ pathname, search, neueOberflaeche }: { pathname: string; search: string; neueOberflaeche: boolean }): string | null {
  const q = new URLSearchParams(search.replace(/^\?/, ""));
  if (q.get(PUSH_PARAM) !== PUSH_WERT || !istAlteAdminAdresse(pathname)) return null;
  q.delete(PUSH_PARAM);
  const rest = q.toString();
  const alt = `${pathname}${rest ? `?${rest}` : ""}`;
  if (!(neueOberflaeche || UMZUG_AKTIV)) return alt;
  return neuerPfad(alt) ?? alt;
}
