// Erstinformation nach § 15/16 VersVermV (Ole, 15.11.2026): reine Funktionen für Einrichtung, öffentliche Seite
// und Bot. Status = Customer.vermittlerTyp ("vertreter" = Ausschließlichkeitsvertreter, "mehrfachvertreter",
// "makler"). Tippgeber dürfen den Dienst nicht nutzen (der Assistent vereinbart Termine für einen erlaubten
// Vermittler, ein Tippgeber darf selbst nicht vermitteln).

export type VermittlerStatus = "vertreter" | "mehrfachvertreter" | "makler";

export const VERMITTLER_STATUS: readonly { key: VermittlerStatus | "tippgeber"; label: string; hint: string }[] = [
  { key: "makler", label: "Versicherungsmakler", hint: "§ 34d Abs. 1 GewO, Sie vermitteln für viele Versicherer im Auftrag Ihrer Kunden." },
  { key: "mehrfachvertreter", label: "Mehrfachvertreter", hint: "§ 34d Abs. 1 GewO, Sie sind Vertreter mehrerer Versicherer." },
  { key: "vertreter", label: "Ausschließlichkeitsvertreter", hint: "§ 34d Abs. 7 GewO bzw. Abs. 1, Sie vermitteln für einen Versicherer (z. B. Allianz, ERGO)." },
  { key: "tippgeber", label: "Tippgeber", hint: "Sie geben nur Kontakte weiter und vermitteln selbst nicht." },
];

export const TIPPGEBER_HINWEIS =
  "Als Tippgeber dürfen Sie selbst keine Versicherungen vermitteln. Unser Assistent vereinbart Beratungstermine im Namen eines erlaubten Vermittlers, deshalb können wir den Dienst für Tippgeber leider nicht anbieten. Bitte sprechen Sie uns an, wenn Sie inzwischen eine Erlaubnis nach § 34d GewO haben.";

export function asVermittlerStatus(v: unknown): VermittlerStatus {
  return v === "makler" ? "makler" : v === "mehrfachvertreter" ? "mehrfachvertreter" : "vertreter";
}

export function vermittlerStatusLabel(v: unknown): string {
  const s = asVermittlerStatus(v);
  return VERMITTLER_STATUS.find((x) => x.key === s)!.label;
}

/** Bezeichnung für die Pflichtangaben (wie im Vermittlerregister). */
export function statusRegisterText(v: unknown): string {
  const s = asVermittlerStatus(v);
  if (s === "makler") return "Versicherungsmakler mit Erlaubnis nach § 34d Abs. 1 GewO";
  if (s === "mehrfachvertreter") return "Versicherungsvertreter (Mehrfachvertreter) mit Erlaubnis nach § 34d Abs. 1 GewO";
  return "Gebundener Versicherungsvertreter (Ausschließlichkeitsvertreter) nach § 34d Abs. 7 GewO bzw. mit Erlaubnis nach § 34d Abs. 1 GewO";
}

/**
 * Registernummer im Format D-XXXX-XXXXX-XX (IHK-Vermittlerregister; Großbuchstaben und Ziffern). Leerzeichen,
 * Kleinbuchstaben und fehlende Bindestriche werden toleriert. null = ungültig.
 */
export function normalizeRegisterNummer(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toUpperCase().replace(/[\s‐-―_.]+/g, "-").replace(/-+/g, "-").trim();
  const compact = s.replace(/-/g, "");
  const m = /^D([A-Z0-9]{4})([A-Z0-9]{5})([A-Z0-9]{2})$/.exec(compact);
  return m ? `D-${m[1]}-${m[2]}-${m[3]}` : null;
}

/** Eigene Seite des Vermittlers mit der Erstinformation (nur https bzw. http, keine internen Ziele). */
export function normalizeErstinfoUrl(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(t) ? t : `https://${t}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".") || /^(localhost|127\.|10\.|192\.168\.)/.test(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export type ErstinfoStand = {
  /** Status in der Einrichtung bestätigt (nicht mehr nötig, Status kommt aus dem Angebot) */
  status?: boolean;
  registerNummer: boolean;
  /** Eigenes PDF hochgeladen oder Link hinterlegt (freiwillig) */
  dokument: boolean;
  /** Anschrift aus dem Impressum bekannt (dann erzeugen wir die Erstinformation selbst) */
  anschrift?: boolean;
};

/**
 * Was fehlt noch? Leer = vollständig. Ole (15.11.2026): Status aus dem Angebot, Registernummer und Anschrift aus
 * dem Impressum; der Schritt erledigt sich damit von selbst. Ein eigenes PDF bzw. ein Link ist freiwillig; ohne beides erzeugen wir die Erstinformation aus
 * den Impressumsangaben (dann muss die Anschrift bekannt sein).
 */
export function erstinfoFehlt(s: ErstinfoStand): string[] {
  // Status steht aus dem Angebot fest (Customer.vermittlerTyp, Makler oder Vertreter), muss nicht bestätigt werden
  const out: string[] = [];
  if (!s.registerNummer) out.push("Registernummer");
  if (!s.dokument && !s.anschrift) out.push("Anschrift (aus dem Impressum) oder eigene Erstinformation");
  return out;
}

/** Status aus der Angabe im Impressum vorschlagen („gebundener Versicherungsvertreter nach § 34d Abs. 7“ usw.). */
export function statusFromImpressum(registerType: string | null | undefined): VermittlerStatus | null {
  const t = (registerType ?? "").toLowerCase();
  if (!t) return null;
  if (/makler/.test(t)) return "makler";
  if (/mehrfach/.test(t)) return "mehrfachvertreter";
  if (/gebunden|ausschlie|abs\.?\s*7/.test(t)) return "vertreter";
  return null;
}

export const ERSTINFO_MAX_BYTES = 5 * 1024 * 1024;

/** PDF am Inhalt erkennen (%PDF). */
export function isPdf(data: Uint8Array): boolean {
  return data.length > 4 && data[0] === 0x25 && data[1] === 0x50 && data[2] === 0x44 && data[3] === 0x46;
}

/** Ist die Erstinformation vollständig? (gemeinsam für Einrichtung, Checkliste, Heute) */
export function erstinfoVollstaendig(e: { registerNummer?: string | null; url?: string | null; fileName?: string | null } | null | undefined, web: { registerNumber?: string | null; address?: string | null } | null | undefined): boolean {
  const reg = !!(e?.registerNummer || normalizeRegisterNummer(web?.registerNumber));
  return erstinfoFehlt({ registerNummer: reg, dokument: !!(e?.url || e?.fileName), anschrift: !!web?.address?.trim() }).length === 0;
}
