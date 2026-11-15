// Zustellfehler aus dem WhatsApp-Status-Webhook einordnen (Ole, 15.11.2026). Rein, ohne Datenbank, getestet.
//
// Meta schickt bei status "failed" ein errors-Array (statuses[].errors[]: code, title, message, error_data.details).
// Quelle der Codes: Meta, WhatsApp Cloud API, „Error codes“
//   https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes (Stand 15.11.2026)
// und für den alten On-Premises-Weg (360dialog-Altkonten): https://developers.facebook.com/docs/whatsapp/on-premises/errors
//
// „Kein WhatsApp“ (Nummer nicht per WhatsApp erreichbar) zählt NUR, wenn der Fehler am Empfänger liegt und
// sich nicht von selbst erledigt:
//   131026 Message undeliverable: laut Meta u. a. „The recipient phone number is not a WhatsApp phone number“,
//          außerdem: Empfänger hat die neuen Nutzungsbedingungen nicht akzeptiert oder eine sehr alte WhatsApp-Version.
//          In allen drei Fällen kommt unsere Nachricht nicht an, Metas Empfehlung: über einen anderen Kanal melden.
//   1013   User is not valid (On-Premises-API): die Nummer ist kein gültiges WhatsApp-Konto.
// Bewusst NICHT „kein WhatsApp“ (Empfänger hat WhatsApp, oder der Fehler liegt bei uns bzw. Meta):
//   131049 Meta stellt Marketing-Nachrichten zum Schutz des Ökosystems nicht zu (später erneut möglich)
//   131050 Empfänger hat Marketing-Nachrichten dieses Unternehmens abbestellt (hat aber WhatsApp)
//   130472 Nummer ist Teil eines Meta-Experiments (Marketing), 131047 24-Stunden-Fenster abgelaufen,
//   131021 Empfänger = Absender, 131042 Zahlungsproblem, 131031/131037/131045/131057/133010 Konto bzw. Nummer,
//   132000–132016/132068 Vorlage (Parameter, nicht freigegeben, pausiert, gesperrt), 130429/131048/131056 Limits,
//   131000/131016 Fehler bei Meta, 131051–131053 Medien bzw. Nachrichtentyp.
// Alles außer „kein WhatsApp“ geht als Admin-Alarm raus (lib/whatsapp/kein-whatsapp.ts), je Kunde, Code und Tag einmal.

/** Fehlercodes, die „Nummer ist nicht per WhatsApp erreichbar“ bedeuten. */
export const NO_WHATSAPP_CODES: ReadonlySet<number> = new Set([131026, 1013]);

export type ZustellfehlerArt = "kein_whatsapp" | "empfaenger" | "zahlung_konto" | "vorlage" | "limit" | "meta" | "sonstiges";

export type StatusError = { code?: number | string | null; title?: string | null; message?: string | null; error_data?: { details?: string | null } | null };

export type Zustellfehler = { code: number | null; title: string | null; art: ZustellfehlerArt };

// Konto, Zahlung, Nummer, Zugang (0/3/10/190/200: Anmeldung bzw. Berechtigung des API-Schlüssels)
const ACCOUNT_CODES = new Set([0, 3, 10, 190, 200, 131005, 131031, 131037, 131042, 131045, 131057, 133000, 133004, 133005, 133006, 133008, 133009, 133010, 133015, 130497]);
// Durchsatz- und Spam-Limits (4: zu viele API-Aufrufe, 80007: Limit des WhatsApp-Business-Kontos)
const LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056, 133016]);
const RECIPIENT_CODES = new Set([131021, 131047, 131049, 131050, 130472]);
const META_CODES = new Set([131000, 131016, 1, 2]);

/** Einordnung eines Codes (rein). */
export function artOf(code: number | null): ZustellfehlerArt {
  if (code == null) return "sonstiges";
  if (NO_WHATSAPP_CODES.has(code)) return "kein_whatsapp";
  if (RECIPIENT_CODES.has(code)) return "empfaenger";
  if (LIMIT_CODES.has(code)) return "limit";
  if ((code >= 132000 && code <= 132999) || code === 2388040) return "vorlage";
  if (ACCOUNT_CODES.has(code)) return "zahlung_konto";
  if (META_CODES.has(code)) return "meta";
  return "sonstiges";
}

/** Ist das der Code für „Nummer nicht per WhatsApp erreichbar“? */
export function isNoWhatsAppCode(code: number | null | undefined): boolean {
  return code != null && NO_WHATSAPP_CODES.has(code);
}

/** Erster Fehler aus statuses[].errors (Code als Zahl, Titel gekürzt). Ohne Fehlerangabe: code null. */
export function zustellfehlerOf(errors: StatusError[] | null | undefined): Zustellfehler {
  const e = Array.isArray(errors) ? errors[0] : undefined;
  const raw = e?.code;
  const n = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw.trim()) : null;
  const code = n != null && Number.isFinite(n) ? n : null;
  const title = (e?.title || e?.message || e?.error_data?.details || "").toString().trim().slice(0, 200) || null;
  return { code, title, art: artOf(code) };
}

/** Lesbare Einordnung für Admin-Alarm und Zahlen. */
export const ART_LABEL: Record<ZustellfehlerArt, string> = {
  kein_whatsapp: "Nummer nicht per WhatsApp erreichbar",
  empfaenger: "Empfänger (Fenster, Marketing-Abmeldung, Meta-Drosselung)",
  zahlung_konto: "Zahlung, Konto oder Nummer",
  vorlage: "Vorlage (Parameter, nicht freigegeben, pausiert)",
  limit: "Versandlimit",
  meta: "Fehler bei Meta",
  sonstiges: "Sonstiger Fehler",
};

/** Was der Admin tun sollte (kurz). */
export const ART_HINWEIS: Record<ZustellfehlerArt, string> = {
  kein_whatsapp: "Kein Handlungsbedarf: Der Vermittler ruft an, der Lead bekommt eine E-Mail.",
  empfaenger: "Meist kein Fehler im Konto. Häufung prüfen (z. B. Marketing-Vorlagen, 24-Stunden-Fenster).",
  zahlung_konto: "Zahlungsmittel bzw. Konto bei 360dialog/Meta prüfen. Bis dahin kommen keine Nachrichten an.",
  vorlage: "Vorlage im WhatsApp Manager prüfen (Freigabe, Qualität, Platzhalter).",
  limit: "Versand gedrosselt: Menge und Qualität der Nummer im WhatsApp Manager prüfen.",
  meta: "Störung bei Meta: Status prüfen, ggf. später erneut senden.",
  sonstiges: "Fehlercode in der Meta-Dokumentation nachsehen.",
};
