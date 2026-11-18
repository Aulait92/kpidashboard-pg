// Rückruf wünschen mit Zeitfenster (Paket P5, Ole 17.11.2026; docs/plan-lead-verlauf.md Punkt 10). Rein, ohne Datenbank,
// getestet (tests/unit/rueckruf.test.ts). Datenbank und Versand: lib/angebot-senden-server.ts (rueckrufWunsch).
//
// Wer: der Lead, meist am Handy, nach der Nachfass-Mail zum Angebot („Rückruf wünschen“). Aufgabe: mit einem Tipp sagen,
// wann ein Anruf passt. Die Seite /rueckruf/<token> zeigt deshalb nur Zeitfenster, die der Vermittler auch wirklich
// bedienen kann: heute (was noch übrig ist) und der nächste Tag mit Geschäftszeit, je Vormittag, Nachmittag, Abend,
// zugeschnitten auf die Geschäftszeiten aus seiner Verfügbarkeit (lib/anruf-ausloeser.ts geschaeftszeitTag). Das erste
// Fenster ist vorausgewählt, die Notiz ist freiwillig.
// Ergebnis: Aufgabe „Rückrufwunsch: 14 bis 17 Uhr“ auf „Heute“ (fällig zu Beginn des Fensters), Push an den Vermittler, Nachfassen zum Angebot
// pausiert bis zwei Tage nach dem Fenster (RUECKRUF_PAUSE_TAGE), Bestätigung an den Lead (WhatsApp im offenen Fenster,
// sonst nur die Seite). Texte an Leads in beiden Fassungen, ohne Gedankenstriche.

import { a, type Ansprache } from "@/lib/ansprache";
import { addDaysYmd, berlinYmd, weekdayOfYmd } from "@/lib/absence";
import { berlinAt, type LeadTimes } from "@/lib/calendar/lead-times";
import { geschaeftszeitTag } from "@/lib/anruf-ausloeser";
import type { VermittlerName } from "@/lib/whatsapp/gespraech";

export type RueckrufTeil = "vormittag" | "nachmittag" | "abend";

/** Tagesteile (Minuten ab Mitternacht, Berlin). */
export const TAGESTEILE: { teil: RueckrufTeil; label: string; von: number; bis: number }[] = [
  { teil: "vormittag", label: "Vormittag", von: 0, bis: 12 * 60 },
  { teil: "nachmittag", label: "Nachmittag", von: 12 * 60, bis: 17 * 60 },
  { teil: "abend", label: "Abend", von: 17 * 60, bis: 24 * 60 },
];

/** Ein Fenster muss mindestens so lange sein, sonst wird es nicht angeboten. */
export const MIN_FENSTER_MIN = 30;
/** Heute: frühestens so viele Minuten ab jetzt (auf die nächste halbe Stunde gerundet). */
const VORLAUF_MIN = 15;
/** Nachfassen zum Angebot pausiert bis so viele Tage nach dem Ende des Fensters. */
export const RUECKRUF_PAUSE_TAGE = 2;

export type RueckrufFenster = {
  /** „2026-11-18_nachmittag“ */
  key: string;
  /** YYYY-MM-DD (Berlin) */
  tag: string;
  teil: RueckrufTeil;
  /** „Nachmittag“ */
  label: string;
  von: Date;
  bis: Date;
  /** „14 bis 17 Uhr“ bzw. „15:30 bis 17 Uhr“ */
  zeit: string;
};

export type RueckrufTag = { tag: string; titel: string; fenster: RueckrufFenster[] };

const uhr = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}:${String(m).padStart(2, "0")}` : `${h}`;
};
/** „14 bis 17 Uhr“ */
export const zeitText = (von: number, bis: number) => `${uhr(von)} bis ${uhr(bis)} Uhr`;

function minutenBerlin(d: Date): number {
  const p = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return Number(p.find((x) => x.type === "hour")?.value) * 60 + Number(p.find((x) => x.type === "minute")?.value);
}
const hhmm = (min: number) => (min >= 24 * 60 ? "23:59" : `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`);

/** Fenster eines Tages (Geschäftszeit geschnitten mit den Tagesteilen); ab `abMin` (heute) später beginnend. */
function fensterDesTages(tag: string, lt: LeadTimes, abMin = 0): RueckrufFenster[] {
  const g = geschaeftszeitTag(lt, weekdayOfYmd(tag));
  if (!g) return [];
  const out: RueckrufFenster[] = [];
  for (const t of TAGESTEILE) {
    const von = Math.max(t.von, g.von, abMin);
    const bis = Math.min(t.bis, g.bis);
    if (bis - von < MIN_FENSTER_MIN) continue;
    out.push({ key: `${tag}_${t.teil}`, tag, teil: t.teil, label: t.label, von: berlinAt(tag, hhmm(von)), bis: berlinAt(tag, hhmm(bis)), zeit: zeitText(von, bis) });
  }
  return out;
}

/** „Heute“, „Morgen“ bzw. „Freitag, 21.11.“ */
export function tagTitel(tag: string, now: Date): string {
  const heute = berlinYmd(now);
  if (tag === heute) return "Heute";
  if (tag === addDaysYmd(heute, 1)) return "Morgen";
  const [y, m, d] = tag.split("-").map(Number);
  const wd = new Intl.DateTimeFormat("de-DE", { weekday: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d)));
  return `${wd}, ${d}.${m}.`;
}

/**
 * Wählbare Zeitfenster: heute (was ab jetzt plus 15 Minuten noch mindestens 30 Minuten dauert) und die nächsten Tage mit
 * Geschäftszeit, höchstens `maxTage` Tage mit Fenstern (Standard 2), Suche bis 14 Tage voraus.
 */
export function rueckrufTage(now: Date, lt: LeadTimes, maxTage = 2): RueckrufTag[] {
  const heute = berlinYmd(now);
  const ab = Math.ceil((minutenBerlin(now) + VORLAUF_MIN) / 30) * 30;
  const out: RueckrufTag[] = [];
  for (let i = 0; i < 14 && out.length < maxTage; i++) {
    const tag = addDaysYmd(heute, i);
    const fenster = fensterDesTages(tag, lt, i === 0 ? ab : 0);
    if (fenster.length) out.push({ tag, titel: tagTitel(tag, now), fenster });
  }
  return out;
}

/** Gewähltes Fenster prüfen: nur, was die Seite gerade anbieten würde (sonst null, z. B. inzwischen vorbei). */
export function waehleFenster(key: string | null | undefined, now: Date, lt: LeadTimes): RueckrufFenster | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}_(vormittag|nachmittag|abend)$/.test(key)) return null;
  return rueckrufTage(now, lt, 3).flatMap((t) => t.fenster).find((f) => f.key === key) ?? null;
}

/** Fenster zu einem Schlüssel für die Danke-Seite (ganzer Tagesteil, ohne „ab jetzt“), null bei ungültigem Schlüssel. */
export function fensterAusKey(key: string | null | undefined, lt: LeadTimes): RueckrufFenster | null {
  const m = /^(\d{4}-\d{2}-\d{2})_(vormittag|nachmittag|abend)$/.exec(key ?? "");
  if (!m) return null;
  return fensterDesTages(m[1], lt).find((f) => f.teil === m[2]) ?? null;
}

/** „heute zwischen 14 und 17 Uhr“, „morgen zwischen 9 und 12 Uhr“, „am Freitag, 21.11., zwischen 9 und 12 Uhr“ */
export function wannText(f: Pick<RueckrufFenster, "tag" | "zeit">, now: Date): string {
  const titel = tagTitel(f.tag, now);
  const zwischen = `zwischen ${f.zeit.replace(" bis ", " und ")}`;
  if (titel === "Heute" || titel === "Morgen") return `${titel.toLowerCase()} ${zwischen}`;
  return `am ${titel}, ${zwischen}`;
}

/**
 * Notiz der Aufgabe (Vermittler): „Rückrufwunsch: 12 bis 16:30 Uhr · „Frage zum Beitrag““. Ohne Tag, den trägt die
 * Fälligkeit (Beginn des Fensters); so bleibt das Fenster auch in der Anrufliste am Handy lesbar. Höchstens 200 Zeichen.
 */
export function rueckrufNotiz(f: Pick<RueckrufFenster, "zeit"> | null, notiz?: string | null): string {
  const n = (notiz ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return `${RUECKRUF_PREFIX}${f ? f.zeit : "so bald wie möglich"}${n ? ` · „${n}“` : ""}`.slice(0, 200);
}
const RUECKRUF_PREFIX = "Rückrufwunsch: ";

/** Notiz des Leads bereinigen (freiwillig, höchstens 200 Zeichen, ohne Steuerzeichen). */
export function bereinigeNotiz(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  return s || null;
}

/** Push an den Vermittler (Sie-Form). */
export function rueckrufFensterPush(o: { leadId: string; name: string; fenster: Pick<RueckrufFenster, "tag" | "zeit"> | null; notiz?: string | null; now: Date }) {
  const titel = o.fenster ? tagTitel(o.fenster.tag, o.now) : null;
  const wann = o.fenster ? `${titel} ${o.fenster.zeit}` : "So bald wie möglich";
  const n = (o.notiz ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    title: `${o.name} wünscht einen Rückruf`,
    body: `${wann}, zum Angebot.${n ? ` „${n}“` : ""} Tippen Sie, um direkt anzurufen.`,
    url: `/buyer?anrufen=${encodeURIComponent(o.leadId)}#anrufen`,
    tag: `rueckruf:${o.leadId}`,
  };
}

/** Texte der Rückruf-Seite (an den Lead). */
export function rueckrufTexte(an: Ansprache, person: VermittlerName) {
  return {
    kopf: "Rückruf zum Angebot",
    titel: a(an, "Wann passt dir ein Anruf?", "Wann passt Ihnen ein Anruf?"),
    text: a(an, `${person.nom} ruft dich im gewählten Zeitfenster an.`, `${person.nom} ruft Sie im gewählten Zeitfenster an.`),
    notiz: "Notiz (freiwillig)",
    notizHinweis: a(an, "Worum geht es dir? Zum Beispiel eine Frage zum Beitrag.", "Worum geht es Ihnen? Zum Beispiel eine Frage zum Beitrag."),
    knopf: "Rückruf anfordern",
    knopfOhneFenster: "Ja, bitte anrufen",
    ohneFenster: a(an, `${person.nom} ruft dich so bald wie möglich an.`, `${person.nom} ruft Sie so bald wie möglich an.`),
    danke: a(an, "Danke, dein Rückrufwunsch ist angekommen!", "Danke, Ihr Rückrufwunsch ist angekommen!"),
    anrufVon: `Anruf von ${person.dat}`,
    perWhatsApp: a(an, "Die Bestätigung hast du auch per WhatsApp.", "Die Bestätigung haben Sie auch per WhatsApp."),
    aendern: "Zeitfenster ändern",
    fehlerFenster: a(an, "Dieses Zeitfenster ist inzwischen vorbei. Bitte wähle ein neues.", "Dieses Zeitfenster ist inzwischen vorbei. Bitte wählen Sie ein neues."),
    fehlerLimit: a(an, "Das ging gerade zu schnell. Bitte versuch es gleich noch einmal.", "Das ging gerade zu schnell. Bitte versuchen Sie es gleich noch einmal."),
  };
}

/** Bestätigung per WhatsApp (nur im offenen 24-h-Fenster als Freitext). */
export function rueckrufBestaetigung(o: { an: Ansprache; hi: string; person: VermittlerName; fenster: Pick<RueckrufFenster, "tag" | "zeit"> | null; now: Date }): string {
  const wann = o.fenster ? wannText(o.fenster, o.now) : "so bald wie möglich";
  return a(
    o.an,
    `${o.hi} danke für deinen Rückrufwunsch! ${o.person.nom} ruft dich ${wann} an.`,
    `${o.hi} vielen Dank für Ihren Rückrufwunsch! ${o.person.nom} ruft Sie ${wann} an.`,
  );
}

/** Bis wann das Nachfassen zum Angebot pausiert: zwei Tage nach dem Ende des Fensters (ohne Fenster: ab jetzt). */
export function rueckrufPauseBis(f: Pick<RueckrufFenster, "bis"> | null, now: Date): Date {
  return new Date((f?.bis ?? now).getTime() + RUECKRUF_PAUSE_TAGE * 24 * 60 * 60 * 1000);
}

/** Ist das eine Aufgabe aus „Rückruf wünschen“ (für Nachrichtenplan und Anzeige)? */
export const istRueckrufNotiz = (note: string | null | undefined) => !!note && note.startsWith(RUECKRUF_PREFIX);
