// Buchungslink nach dem 2. „Andere Zeit“ (Ole, 20.11.2026: „Biete nach dem 2. Mal ‚Andere Zeit‘ auch einen
// Buchungslink an.“). Passen dem Lead auch nach dem zweiten Vorschlag die Zeiten nicht, schickt die App selbst (nicht
// die KI) eine kurze Nachricht mit dem Link zur Buchungsseite des Vermittlers; der Lead kann trotzdem im Chat seinen
// Wunschtag nennen. Verarbeitung in lib/whatsapp/knopf.ts (handleButtonReply), Buchung in app/book/[slug].
//
// Link: /book/<slug>?c=<Token> (auf der Buchungsadresse der Kurzlink /<slug>?c=…). Token = Chat-ID + HMAC (AUTH_SECRET),
// wie die Mail-Strecke (lib/mail-strecke/token.ts): keine Personendaten in der URL, nichts Geheimes in der Datenbank.
// Die Seite belegt Name und E-Mail vor, die Buchung läuft über die WhatsApp-Nummer des Chats (kein Dubletten-Lead).
// Rein (ohne Datenbank), getestet (tests/unit/buchungslink-andere-zeit.test.ts).

import crypto from "node:crypto";
import { a, type Ansprache } from "@/lib/ansprache";
import type { Variante } from "@/lib/experimente";
import type { VermittlerName } from "@/lib/vermittler-nennung";
import { knopfAktion } from "@/lib/whatsapp/knopf";
import { publicUrlOr } from "@/lib/public-url";

/** Ab dem wievielten Klick auf „Andere Zeit“ im selben Chat der Buchungslink mitkommt. */
export const BUCHUNGSLINK_AB = 2;

/** Splittest-Schlüssel (lib/experimente.ts), Einheit Lead-ID, sonst Chat-ID. */
export const BUCHUNGSLINK_EXPERIMENT = "buchungslink_andere_zeit";

const secret = () => process.env.AUTH_SECRET ?? "dev-secret";
const sig = (id: string) => crypto.createHmac("sha256", secret()).update(`wa-buchung:${id}`).digest("base64url").slice(0, 22);

export function chatBuchungToken(conversationId: string): string {
  return `${conversationId}.${sig(conversationId)}`;
}

/** Token prüfen; Chat-ID oder null bei falscher Form oder Signatur. */
export function pruefeChatBuchungToken(token: string | null | undefined): string | null {
  const m = /^([A-Za-z0-9_-]{8,40})\.([A-Za-z0-9_-]{22})$/.exec(token ?? "");
  if (!m) return null;
  const x = Buffer.from(sig(m[1]));
  const y = Buffer.from(m[2]);
  return x.length === y.length && crypto.timingSafeEqual(x, y) ? m[1] : null;
}

/** Buchungsseite mit Chat-Kontext; null ohne Kurznamen (keine Buchungsseite). */
export function chatBuchungUrl(slug: string | null | undefined, conversationId: string): string | null {
  if (!slug) return null;
  return publicUrlOr(`/book/${slug}?c=${encodeURIComponent(chatBuchungToken(conversationId))}`);
}

/** Wie oft hat der Lead in diesem Chat „Andere Zeit“ getippt? (gespeicherte Eingänge: kind und Knopftext) */
export function andereZeitAnzahl(eingaenge: readonly { kind: string | null; body: string | null }[]): number {
  return eingaenge.filter((m) => knopfAktion(m.kind, m.body)?.aktion === "andere_zeit").length;
}

/** Bekommt der Lead jetzt den Buchungslink? (Anzahl inkl. des aktuellen Klicks) */
export function buchungslinkFaellig(anzahl: number): boolean {
  return anzahl >= BUCHUNGSLINK_AB;
}

/**
 * Nachricht mit Buchungslink, Sie bzw. Du, ohne Gedankenstriche.
 *   a (Standard, Ole 20.11.2026): Link zuerst, Wunschtag als Alternative.
 *   b (Hypothese): Wunschtag im Chat zuerst, der Link als Alternative am Ende. Wer im Gespräch bleibt, bucht öfter
 *     als wer auf eine Seite wechseln soll.
 */
export function buchungslinkText(an: Ansprache, person: VermittlerName, url: string, v: Variante = "a"): string {
  if (v === "b") {
    return a(
      an,
      `Kein Problem! Schreib mir einfach deinen Wunschtag, oder such dir hier selbst eine passende Zeit bei ${person.dat} aus: ${url}`,
      `Kein Problem! Schreiben Sie mir einfach Ihren Wunschtag, oder suchen Sie sich hier selbst eine passende Zeit bei ${person.dat} aus: ${url}`,
    );
  }
  return a(
    an,
    `Kein Problem! Such dir hier selbst eine passende Zeit bei ${person.dat} aus: ${url}\n\nOder schreib mir einfach deinen Wunschtag.`,
    `Kein Problem! Suchen Sie sich hier selbst eine passende Zeit bei ${person.dat} aus: ${url}\n\nOder schreiben Sie mir einfach Ihren Wunschtag.`,
  );
}

/**
 * Absage ohne Wunschzeit auf einen Terminvorschlag (Ole, 22.11.2026: „Termin passt nicht. Komme ggf. auf Sie zu.“ →
 * der Assistent hat aufgegeben, statt andere Zeiten bzw. den Buchungslink anzubieten). Rein. Kein Treffer bei
 * Wunschzeit (die bucht der Assistent), Abmeldung bzw. „kein Interesse“ (eigene Behandlung).
 */
export function absageOhneWunsch(text: string | null | undefined): boolean {
  const t = (text ?? "").trim();
  if (!t || t.length > 300) return false;
  if (/kein(e)? interesse|kein bedarf|nicht mehr interess|\bstopp?\b|abmelden|bitte nicht mehr|schon erledigt|schon versichert|abgeschlossen/i.test(t)) return false;
  // Konkrete Wunschzeit (Tag, Tageszeit, Uhrzeit, Datum): die bucht der Assistent
  if (/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|übermorgen|morgen früh|nächste[nr]? woche|vormittags?|nachmittags?|abends?|\d{1,2}([.:]\d{2})? ?uhr|\d{1,2}\.\d{1,2}\.)/i.test(t)) return false;
  return /passt (mir |uns )?(leider )?nicht|geht (bei mir |bei uns )?(leider )?nicht|kann (ich |da )?(leider )?nicht|keine zeit|verhindert|komm(e|en)? .{0,30}(auf sie|auf dich|auf euch|wieder) zu|meld(e|en)? (mich|uns)|ein andermal|nicht passend|zu früh|zu spät|klappt (leider )?nicht/i.test(t);
}
