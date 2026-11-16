// Schalter „Neue Oberfläche“ je Admin (Ole, 16.11.2026): Cookie im Browser des Admins.
//
// Warum Cookie und nicht User.adminNewUi: Das Feld vom früheren „Admin-A hinter Schalter pro Admin“ steht seit
// 14.11. bei allen Admins fest auf true (Migration 20261114150000) und ist ungenutzt. Es wiederzubeleben hieße,
// per Migration alle Werte umzustellen. Außerdem entscheidet die Middleware über die Weiterleitung
// /admin/heute → /admin/neu, und die soll ohne Datenbankabfrage auskommen. Umschalten im Profilmenü
// (beide Oberflächen), Protokoll wie damals unter „admin.new_ui“.
//
// Reine Daten, auch in der Middleware nutzbar.

export const ADMIN_NEU_COOKIE = "pg_admin_neu";

/** Ein Jahr; der Schalter bleibt, bis der Admin ihn wieder ausschaltet. */
export const ADMIN_NEU_MAX_AGE = 60 * 60 * 24 * 365;

export const istAn = (wert: string | undefined | null) => wert === "1";

/** Adressen, die bei eingeschaltetem Schalter auf den neuen Admin leiten (alles andere bleibt erreichbar). */
export function neuStartFuer(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, "") || "/";
  return p === "/admin" || p === "/admin/heute";
}
