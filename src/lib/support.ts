// Support im Kundenbereich: Die KI-Hilfe antwortet zuerst. Bei Abrechnung,
// Vertrag/Kündigung, Fehlern, fehlenden Daten oder Frust (oder auf Wunsch)
// bietet sie den Kontakt zu unserem Team an: per WhatsApp (wa.me mit
// vorbefülltem Text) oder per E-Mail. Reine Funktionen, ohne Datenbank.

export type EscalationReason = "billing" | "contract" | "bug" | "missing_data" | "frustrated" | "user_request" | "unresolved";

export const REASON_LABEL: Record<EscalationReason, string> = {
  billing: "Abrechnung",
  contract: "Vertrag oder Kündigung",
  bug: "Möglicher Fehler",
  missing_data: "Fehlende Daten",
  frustrated: "Unzufrieden",
  user_request: "Wunsch nach persönlichem Kontakt",
  unresolved: "KI konnte nicht helfen",
};

export const ESCALATION_REASONS = Object.keys(REASON_LABEL) as EscalationReason[];

export const DEFAULT_RESPONSE_TIME = "Wir antworten werktags in der Regel innerhalb weniger Stunden.";

export type SupportConfig = { whatsapp: string | null; email: string | null; responseTime: string };

/** Kontaktwege aus den Umgebungsvariablen; fehlt eine, wird der Knopf ausgeblendet. */
export function supportConfig(env: Record<string, string | undefined> = process.env): SupportConfig {
  const digits = (env.SUPPORT_WHATSAPP_NUMBER ?? "").replace(/\D/g, "").replace(/^00/, "");
  const email = (env.SUPPORT_EMAIL ?? "").trim();
  return {
    // wa.me braucht die internationale Nummer ohne +, 0049… bzw. führende 0 → 49…
    whatsapp: digits.length >= 8 ? (digits.startsWith("0") ? `49${digits.slice(1)}` : digits) : null,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null,
    responseTime: (env.SUPPORT_RESPONSE_TIME ?? "").trim() || DEFAULT_RESPONSE_TIME,
  };
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ");

// JavaScript-\b kennt keine Umlaute: \b und \w auf Unicode-Buchstaben umstellen.
const WB = "(?:(?<![\\p{L}\\p{N}])(?=[\\p{L}\\p{N}])|(?<=[\\p{L}\\p{N}])(?![\\p{L}\\p{N}]))";
const u = (re: RegExp) => new RegExp(re.source.replace(/\\b/g, WB).replace(/\\w/g, "[\\p{L}\\p{N}_]"), "u");

const RULES: { reason: EscalationReason; patterns: RegExp[] }[] = [
  {
    reason: "user_request",
    patterns: [
      /\b(mit|einen?|eine[mn]?)\s+(menschen|mitarbeiter(in)?|person|ansprechpartner(in)?)\b/,
      /\b(echten?|richtigen?)\s+(menschen|mitarbeiter)/,
      /\b(rückruf|ruft? mich an|anrufen lassen|persönlich sprechen|support sprechen)\b/,
    ],
  },
  {
    // Nur unser Vertrag mit dem Kunden – „Vertrag“ allein meint oft den Versicherungsvertrag eines Leads.
    reason: "contract",
    patterns: [
      /\bkündig/,
      /\bvertragsende|\bvertragslaufzeit|\bmindestlaufzeit/,
      /\b(mein(en|em)?|unser(en|em)?) (vertrag|abo|paket)\b/,
      /\bvertrag (mit|bei) (ihnen|euch|performancegrowth)\b/,
      /\b(paket|abo) (wechseln|ändern|beenden|pausieren)\b/,
      /\bwiderruf/,
    ],
  },
  {
    reason: "billing",
    patterns: [
      /\brechnung/,
      /\babrechnung/,
      /\babbuchung|\babgebucht|\blastschrift/,
      /\bzu viel (bezahlt|berechnet|abgebucht)/,
      /\bgutschrift|\berstattung|\bzurückerstatt/,
      /\bmahnung|\bzahlungserinnerung/,
      /\bsepa\b|\biban\b/,
    ],
  },
  {
    reason: "bug",
    patterns: [
      /\bfehlermeldung/,
      /\b(funktioniert|geht|klappt|lädt|öffnet sich|reagiert)\s+(\w+\s+)?(nicht|nich|garnicht|gar nicht)\b/,
      /\bkaputt\b/,
      /\b(stürzt|hängt)\b.*\b(ab|sich auf)\b|\babsturz/,
      /\b(weiße|leere) seite\b/,
      /\bbug\b|\berror\b|\bfehler 500\b|\bserverfehler/,
    ],
  },
  {
    reason: "missing_data",
    patterns: [
      /\b(leads?|termine?|daten|chats?|nachrichten|kontakte?|kunden)\b.{0,40}\b(fehl|verschwunden|weg\b|nicht mehr da|nicht (mehr )?(sichtbar|angezeigt|zu sehen))/,
      /\b(fehl(t|en)|verschwunden)\b.{0,40}\b(leads?|termine?|daten|chats?|nachrichten|kontakte?)\b/,
      /\bkeine (neuen )?leads (mehr|bekommen|erhalten)/,
    ],
  },
  {
    reason: "frustrated",
    patterns: [
      /!{3,}/,
      /\b(unverschämt|frechheit|katastrophe|unzumutbar|ärgerlich|nervt|sauer|enttäuscht|unzufrieden)\b/,
      /\b(schon wieder|immer noch nicht|zum (zweiten|dritten|x-ten) mal)\b/,
      /\b(hilft mir nicht|bringt nichts|verstehst? (du|sie) mich)\b/,
    ],
  },
].map((r) => ({ reason: r.reason as EscalationReason, patterns: r.patterns.map(u) }));

/** Viele GROSSBUCHSTABEN-Wörter = laut. */
function shouting(raw: string): boolean {
  const words = raw.split(/\s+/).filter((w) => /^[A-ZÄÖÜ]{3,}[!?.,]*$/.test(w));
  return words.length >= 3;
}

/**
 * Regelbasierte Erkennung, ob ein Mensch übernehmen sollte. Prüft die aktuelle
 * Frage; `thumbsDown` = schlecht bewertete KI-Antworten in diesem Gespräch.
 */
export function detectEscalation(question: string, opts: { thumbsDown?: number } = {}): EscalationReason | null {
  const q = norm(question);
  for (const r of RULES) if (r.patterns.some((p) => p.test(q))) return r.reason;
  if (shouting(question)) return "frustrated";
  if ((opts.thumbsDown ?? 0) >= 2) return "unresolved";
  return null;
}

/**
 * Entfernt personenbezogene Angaben aus einer Zusammenfassung für Admins und
 * WhatsApp-Text: E-Mail-Adressen, Telefonnummern, IBAN, lange Ziffernfolgen.
 */
export function redact(text: string): string {
  return text
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[E-Mail]")
    .replace(/\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){3,7}(?:\s?[A-Z0-9]{1,3})?\b/gi, "[IBAN]")
    .replace(/(\+|\b00)?\d[\d\s/().-]{6,}\d/g, "[Nummer]")
    .replace(/\s+/g, " ")
    .trim();
}

export function shortSummary(text: string, max = 280): string {
  const t = redact(text);
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

/** Kurze Referenz für Rückfragen, z. B. „PG-7K2Q9A“. */
export function supportRef(id: string): string {
  return `PG-${id.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}`;
}

export function supportMessage(o: { name: string; company?: string | null; summary: string; ref: string }): string {
  const who = o.company && o.company !== o.name ? `${o.name} (${o.company})` : o.name;
  return `Hallo performancegrowth-Team, hier ist ${who}.\n\nMein Anliegen: ${o.summary}\n\nReferenz: ${o.ref}`;
}

export function whatsappUrl(number: string, text: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

export function mailtoUrl(email: string, o: { ref: string; text: string }): string {
  return `mailto:${email}?subject=${encodeURIComponent(`Hilfe-Anfrage ${o.ref}`)}&body=${encodeURIComponent(o.text)}`;
}
