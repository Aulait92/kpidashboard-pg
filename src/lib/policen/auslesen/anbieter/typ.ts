// Anbieter-Schnittstelle für das Auslesen (Adapter). Ein Anbieter bekommt genau ein Dokument und die vorab bestimmte
// Sparte und liefert die Rohantwort nach dem festen Schema (felder.ts auslesenSchema). Die Rohantwort verlässt
// lib/policen/auslesen/server.ts nie: sie wird sofort bereinigt, nicht gespeichert und nicht geloggt (K5).
// Fehler ohne Inhalt: nur Grund und HTTP-Status.

import type { AnbieterName } from "@/lib/policen/auslesen/konfig";
import type { AuslesenSparte } from "@/lib/policen/auslesen/felder";

export type DokumentTyp = "application/pdf" | "image/jpeg" | "image/png" | "image/webp";
export type Dokument = { data: Uint8Array; typ: DokumentTyp };

export type AnbieterErgebnis =
  | { ok: true; roh: unknown; modell: string }
  | { ok: false; grund: "schluessel" | "abgelehnt" | "unvollstaendig" | "fehler"; status?: number };

export interface AuslesenAnbieter {
  name: AnbieterName;
  modell: string;
  liesAus(doc: Dokument, sparte: AuslesenSparte): Promise<AnbieterErgebnis>;
}
