import { headers } from "next/headers";
import { neuerPfad } from "@/lib/admin-neu/umzug";

// Gemeinsame Server Actions (alter und neuer Admin) leiten nach dem Speichern oft auf eine feste alte Adresse weiter
// (z. B. /admin/kunden/<id>/abrechnung?retainer=…). Kam die Anfrage aus dem neuen Admin (Referer /admin/neu/…), führt
// die Weiterleitung auf die passende neue Seite, sonst bleibt alles wie bisher. So bleibt der Nutzer in der Oberfläche,
// aus der er gekommen ist, ohne dass die Actions doppelt existieren.

/** Ziel einer Weiterleitung: `alt` im alten Admin, im neuen Admin `neu` bzw. die neue Seite zu `alt` (umzug.ts). */
export async function adminZiel(alt: string, neu?: string): Promise<string> {
  let pfad = "";
  try {
    pfad = new URL((await headers()).get("referer") ?? "").pathname;
  } catch {
    return alt;
  }
  if (pfad !== "/admin/neu" && !pfad.startsWith("/admin/neu/")) return alt;
  return neu ?? neuerPfad(alt) ?? alt;
}
