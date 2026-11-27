// Integritätssperre bei Meta (Ole, 27.11.2026, Kunde CL Capital Living): Das Anlegen bzw. Veröffentlichen des
// Policen-Flows scheitert mit 360dialog flows 400 „Blocked by Integrity / Integrity requirements not met“ (code 139000,
// error_subcode 4233020), solange das Business-Portfolio des Kunden nicht verifiziert ist (fb_account_status
// „not_verified“). Dann: nur einmal täglich neu versuchen, Sentry nur beim ersten Auftreten, Grund lesbar im Datensatz.
// Sobald die Verifizierung bestätigt ist (lib/whatsapp/meta-verifizierung.ts), sofort wieder versuchen.
// Rein (ohne Datenbank), damit die Erkennung als Unit-Test läuft.

export const STATUS_META_GESPERRT = "meta_gesperrt";
export const META_SPERRE_ABSTAND_MS = 24 * 60 * 60 * 1000;
export const GRUND_VERIFIZIERUNG_FEHLT = "Formular bei Meta gesperrt: Unternehmensverifizierung fehlt";
export const GRUND_INTEGRITAET = "Formular bei Meta gesperrt (Integrität)";

/** Fehler von 360dialog/Meta ist die Integritätssperre (code 139000 / subcode 4233020 bzw. der Text dazu)? */
export function istIntegritaetsSperre(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (!msg) return false;
  if (/blocked by integrity|integrity requirements not met/i.test(msg)) return true;
  if (/"error_subcode"\s*:\s*4233020\b/.test(msg)) return true;
  return /"code"\s*:\s*139000\b/.test(msg) && /integrit/i.test(msg);
}

/** Meta meldet das Unternehmen als verifiziert (fb_account_status). */
export const metaVerifiziert = (status: string | null | undefined) => (status ?? "").trim().toLowerCase() === "verified";

/** Lesbarer Grund für den Datensatz: mit bekannter fehlender Verifizierung genau das, sonst allgemein. */
export function sperrGrund(metaStatus: string | null | undefined): string {
  const s = (metaStatus ?? "").trim().toLowerCase();
  return s && s !== "verified" ? GRUND_VERIFIZIERUNG_FEHLT : GRUND_INTEGRITAET;
}

/**
 * Darf der Cron den gesperrten Flow jetzt wieder anlegen? Nach Ablauf der Wartezeit (einmal täglich) oder sofort, wenn
 * die Sperre wegen fehlender Verifizierung bestand und Meta das Unternehmen inzwischen als verifiziert meldet.
 */
export function sperreVorbei(rec: { status: string; naechsterVersuchAt: Date | null; fehler: string | null }, metaStatus: string | null | undefined, now: Date): boolean {
  if (rec.status !== STATUS_META_GESPERRT) return true;
  if (metaVerifiziert(metaStatus) && rec.fehler === GRUND_VERIFIZIERUNG_FEHLT) return true;
  return !rec.naechsterVersuchAt || rec.naechsterVersuchAt.getTime() <= now.getTime();
}

/** Stand des Formulars für den Admin (Kundenakte) in einem Satz. */
export function flowStandText(rec: { status: string; fehler: string | null; naechsterVersuchAt: Date | null; publishedAt: Date | null } | null, o: { schalterAn: boolean; now?: Date }): string {
  if (!o.schalterAn) return "Policen-Formular: Schalter aus (POLICEN_FLOW)";
  if (!rec) return "Policen-Formular: noch nicht angelegt";
  const datum = (d: Date) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  if (rec.status === "veroeffentlicht") return `Policen-Formular: veröffentlicht${rec.publishedAt ? ` seit ${datum(rec.publishedAt)}` : ""}`;
  if (rec.status === STATUS_META_GESPERRT) return `${rec.fehler ?? GRUND_INTEGRITAET}${rec.naechsterVersuchAt ? `, nächster Versuch ${datum(rec.naechsterVersuchAt)}` : ""}`;
  if (rec.status === "gestoert") return `Policen-Formular: gestört (Senden scheiterte)${rec.fehler ? `: ${rec.fehler.slice(0, 120)}` : ""}`;
  if (rec.status === "fehler") return `Policen-Formular: Fehler${rec.fehler ? `: ${rec.fehler.slice(0, 120)}` : ""}`;
  return "Policen-Formular: wird angelegt";
}
