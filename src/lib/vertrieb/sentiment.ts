// Grobe Einordnung einer Cold-Mail-Antwort. Instantly-Interessenstatus hat Vorrang,
// das hier ist der Fallback, wenn Instantly (noch) nichts gesetzt hat.

export type Sentiment = "POSITIV" | "NEGATIV" | "NEUTRAL";

const NEGATIVE = [
  /kein(en)? interesse/, /nicht interessiert/, /kein(en)? bedarf/, /nein,? danke/, /keine werbung/,
  /bitte (entfernen|austragen|löschen|streichen)/, /aus (dem|ihrem) verteiler/, /abmelden/, /unsubscribe/,
  /nicht mehr (kontaktieren|anschreiben|schreiben)/, /sehen sie (bitte )?(davon )?ab/, /keine (weiteren )?(e-?mails|nachrichten|anfragen)/,
  /brauchen? (keine|nichts)/, /sind (bereits|schon) (gut )?versorgt/, /kein(en)? kontakt/, /nicht relevant/, /spam/,
  /not interested/, /remove me/,
  /(haben|habe) (uns|mich) (dagegen|anders) entschieden/, /passt(\s+(aktuell|derzeit|gerade|momentan|leider|uns|mir|gar))*\s+nicht/, /kein(en)? mehrwert/,
  /(möchten|möchte|wollen|will) (wir |ich )?(das |dies )?(aktuell |derzeit |vorerst )?nicht/, /verzichte(n)?/, /\babsage\b/, /\bsage(n)?(\s+\S+){0,2}\s+ab\b/,
  /(aktuell|derzeit|momentan|vorerst) (kein|nicht)/, /nicht (mehr )?(nötig|notwendig|erforderlich)/, /lieber nicht/,
  /(haben|nutzen|arbeiten)( bereits| schon)?( mit)?( bereits| schon)? (einen?|einer|eine) (anbieter|dienstleister|agentur|partner)/, /nicht zuständig/,
];
// Positive Stichworte, die verneint sind („keinen Termin“, „kein Gespräch“)
const NEGATED_POSITIVE = /\b(kein(e[nmrs]?)?|nicht|niemals)\b(\s+\S+){0,2}?\s+(termin|gespräch|telefonat|rückruf|anruf|interesse|bedarf|kontakt|infos?|informationen|unterlagen|angebot)/;
const POSITIVE = [
  /interess(e|ant|iert)/, /gerne (mehr|infos?|informationen|unterlagen|einen termin|telefonieren|anrufen|zurückrufen|austauschen)/, /ruf(en)? sie (mich )?(gerne )?an/, /anrufen/, /telefon(at|ieren)/, /termin/,
  /mehr (infos?|informationen|details)/, /klingt (gut|spannend|interessant)/, /(schicken|senden) sie (mir )?(gerne )?/,
  /unterlagen/, /preis(e|liste)?\b/, /was kostet/, /konditionen/, /wann (passt|haben sie zeit|können wir)/,
  /melden sie sich/, /lassen sie uns/, /gespräch/, /rückruf/, /call\b/, /meeting/,
];

export function classifyReply(text: string | null | undefined, subject?: string | null): Sentiment {
  const t = `${subject ?? ""}\n${text ?? ""}`.toLowerCase();
  if (NEGATIVE.some((r) => r.test(t)) || NEGATED_POSITIVE.test(t)) return "NEGATIV";
  if (POSITIVE.some((r) => r.test(t))) return "POSITIV";
  return "NEUTRAL";
}

/** Instantly-Interessenstatus (lt_interest_status / i_status) → Sentiment, null wenn unbekannt */
export function sentimentFromInstantly(status: number | null | undefined): Sentiment | null {
  if (status == null) return null;
  if ([1, 2, 3, 4].includes(status)) return "POSITIV"; // Interessiert, Termin gebucht/stattgefunden, Gewonnen
  if ([-1, -2, -3].includes(status)) return "NEGATIV"; // Kein Interesse, falsche Person, verloren
  return null; // 0 = Abwesend, -4 = No-Show, Custom-Labels
}

// Automatische Antworten: Eingangsbestätigungen, Abwesenheitsnotizen, Ticketsysteme.
// Instantly markiert nicht alle davon als Auto-Reply.
const AUTO_SUBJECT = /(automatische antwort|autom\. antwort|auto(matic)?[ -]?reply|abwesenheit|out of (the )?office|nicht im büro|eingangsbestätigung|empfangsbestätigung|lesebestätigung|ihre (nachricht|anfrage|e-?mail)( an| bei|:|$)|wir haben ihre|ticket|^auto:|urlaub|vacation)/i;
const AUTO_BODY = [
  /wir haben ihre (nachricht|e-?mail|anfrage|mail) (erhalten|bekommen)/,
  /ihre (nachricht|e-?mail|anfrage|mail) (ist|wurde) (bei uns )?(eingegangen|erhalten|empfangen)/,
  /eingangsbestätigung/, /empfangsbestätigung/,
  /(automatisch|maschinell) (generiert|erstellt|versendet|verschickt)/,
  /diese (e-?mail|nachricht) wurde automatisch/,
  /bitte antworten sie nicht auf diese/, /do not reply/, /no-?reply/,
  /(bin|sind) (bis|vom|ab|derzeit|zurzeit|aktuell) .{0,40}(nicht im büro|abwesend|im urlaub|außer haus|nicht erreichbar)/,
  /(abwesend|im urlaub|außer haus|nicht im büro) (bis|vom|ab)/,
  /out of (the )?office/, /i am (currently )?(out|away)/,
  /wir (melden|kümmern) uns (schnellstmöglich|zeitnah|so schnell wie möglich|in kürze)/,
  /(schnellstmöglich|zeitnah|so bald wie möglich) (bearbeitet|beantwortet|bei ihnen melden)/,
  /in dringenden fällen wenden sie sich/,
];

// "Vielen Dank für Ihre Nachricht" allein ist kein Beweis (echte Antworten beginnen oft so):
// nur als Auto-Reply werten, wenn im Firmen-"wir" und ohne persönliches "ich/mir" geschrieben.
const THANKS = /(vielen )?dank(e)? für ihre (nachricht|e-?mail|anfrage|mail|kontaktaufnahme)/;

export function isAutoReplyText(subject: string | null | undefined, text: string | null | undefined): boolean {
  if (subject && AUTO_SUBJECT.test(subject)) return true;
  const t = (text ?? "").toLowerCase();
  if (AUTO_BODY.some((r) => r.test(t))) return true;
  if (NEGATIVE.some((r) => r.test(t))) return false; // echte Absage, keine Auto-Antwort
  return THANKS.test(t) && /\b(wir|uns|unser\w*)\b/.test(t) && !/\b(ich|mir|mich|mein\w*)\b/.test(t);
}
