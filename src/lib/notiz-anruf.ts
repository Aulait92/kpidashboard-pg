// Anruf-Ergebnis aus einer freien Notiz erkennen (Ole, 27.11.2026: Lohmanns Team schreibt „nicht erreicht“,
// „tel nicht erreicht“, „Rufnummer ungültig“ als Notiz statt das Ergebnis einzutragen; der Anrufplan blieb dadurch bei
// Versuch 1 stehen). Rein, getestet in tests/unit/notiz-anruf.test.ts. Nur kurze Notizen zählen, damit ein langer
// Gesprächsvermerk, in dem „nicht erreicht“ nebenbei vorkommt, nicht als Anrufversuch gilt.

export type NotizAnruf = "nicht_erreicht" | "falsche_nummer";

const MAX_LAENGE = 140;

const FALSCHE_NUMMER = [
  /\b(rufnummer|nummer|tel(efon)?(nummer)?|anschluss)\b[^.]{0,30}\b(ungültig|ungueltig|nicht vergeben|existiert nicht|falsch|gibt es nicht|nicht erreichbar, kein anschluss)/i,
  /\bfalsche\s+(rufnummer|nummer|tel(efon)?nummer)\b/i,
  /\bkein\s+anschluss\b/i,
  /\bnicht\s+vergeben\b/i,
  /\banschluss\s+gehört\b/i,
  /\bfalsche[rn]?\s+(vn|person|teilnehmer|kontakt)\b/i,
  /\b(ungültige|ungueltige)\s+(rufnummer|nummer)\b/i,
];

const NICHT_ERREICHT = [
  /\bnicht\s+erreicht\b/i,
  /\bnicht\s+(ran|rangegangen|abgenommen|angenommen)\b/i,
  /\bgeht\s+(keiner|niemand)\s+ran\b/i,
  /\b(mailbox|ab\s+drauf|auf\s+(den\s+)?ab|anrufbeantworter|besetzt|freizeichen)\b/i,
  /^\s*(ab|mb|ne|n\.e\.?)\s*[.!]?\s*$/i,
];

/** Erreicht, Termin, Angebot: dann ist es kein Fehlversuch, auch wenn „nicht erreicht“ vorkommt („gestern nicht erreicht, heute Termin“). */
const ERFOLG = /\b(termin\s+(vereinbart|gemacht|steht|am)|angebot\s+(gesendet|geschickt)|abschluss|(heute|mit\s+\w+)\s+gesprochen|erreicht und|zurückgerufen|rückruf\s+erhalten)\b/i;

export function notizAnruf(text: string): NotizAnruf | null {
  const t = (text ?? "").trim();
  if (!t || t.length > MAX_LAENGE) return null;
  if (FALSCHE_NUMMER.some((r) => r.test(t))) return "falsche_nummer";
  if (ERFOLG.test(t)) return null;
  if (NICHT_ERREICHT.some((r) => r.test(t))) return "nicht_erreicht";
  return null;
}
