// Telefonate sauber erfassen (Ole, 15.11.2026). Rein (auch im Browser nutzbar), Server: lib/telefonat-server.ts.
//
// - Tippt der Vermittler in der App auf „Anrufen“, läuft ein Anruf (Lead.callStartedAt). Bis ein Ergebnis eingetragen
//   ist, pausiert der WhatsApp-Assistent für diesen Lead: keine Antworten, keine Fragen, kein Nachfassen. Höchstens
//   3 Stunden (Ole, 17.11.2026; vorher 12), damit ein vergessenes Ergebnis den Lead nicht lange stumm schaltet.
// - Nach dem Gespräch („Wie lief's?“) erfasst der Vermittler den Bedarf strukturiert: dieselben Punkte, die der
//   Assistent sammelt und die Terminvorbereitung zeigt (lib/whatsapp/qualification.ts), je Produkt und Sparte. Bekanntes
//   ist vorbelegt, abgefragt wird nur, was noch offen ist.
// - Was offen bleibt, fragt der Assistent danach per WhatsApp ab, mit Bezug aufs Telefonat und nur die offenen Punkte.

import { QUALIFICATION_FIELDS, cleanQualificationData, type QualificationData, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { spartenAus, tierWunsch } from "@/lib/termin-vorbereitung";

/** Höchstdauer der Pause des Assistenten nach „Anrufen“ ohne Ergebnis. */
export const CALL_PAUSE_MAX_MS = 3 * 60 * 60 * 1000;
/** Erinnerung „Was ist bei … rausgekommen?“ nach so vielen Minuten ohne Ergebnis. */
export const CALL_REMINDER_AFTER_MS = 15 * 60 * 1000;
/** Nachfrage der offenen Punkte so lange nach dem Telefonat (Termin ist dann gebucht, Bestätigung ist raus). */
export const OPEN_QUESTIONS_DELAY_MS = 10 * 60 * 1000;

/** Läuft für diesen Lead gerade ein Anruf ohne Ergebnis (Assistent pausiert)? */
export function anrufLaeuft(l: { callStartedAt: Date | string | null | undefined } | null | undefined, now = new Date()): boolean {
  if (!l?.callStartedAt) return false;
  const at = new Date(l.callStartedAt).getTime();
  return Number.isFinite(at) && now.getTime() - at < CALL_PAUSE_MAX_MS && at <= now.getTime() + 60_000;
}

export type NeedState = "komplett" | "teilweise" | "nein";
export const isNeedState = (v: unknown): v is NeedState => v === "komplett" || v === "teilweise" || v === "nein";
export const NEED_STATE_LABEL: Record<NeedState, string> = { komplett: "Bedarf komplett besprochen", teilweise: "Bedarf teilweise besprochen", nein: "Bedarf noch nicht besprochen" };

export type BedarfFeld = { key: QualificationKey; label: string; hint: string; wert: string | null };

const hintOf = (k: QualificationKey) => QUALIFICATION_FIELDS.find((f) => f.key === k)?.hint ?? "";
const formWert = (formular: { label: string; value: string }[], re: RegExp) => formular.find((f) => re.test(f.label))?.value?.trim() || null;

/** „offen“ zählt als nicht erfasst (so hält der Assistent fest, was der Lead nicht wusste). */
const leer = (v: string | null | undefined) => !v || /^offen$/i.test(v.trim());

/**
 * Bedarfspunkte für diesen Lead: je Produkt die Angaben, die Assistent und Terminvorbereitung brauchen
 * (Privatschutz je Sparte, Tierkranken, sonst die allgemeinen Punkte). Wert aus den bisherigen Angaben
 * (Chat, Telefonat) bzw. dem Leadformular, sonst null.
 */
export function bedarfFelder(input: { produkt: string | null | undefined; formular: { label: string; value: string }[]; angaben: unknown }): BedarfFeld[] {
  const q = cleanQualificationData(input.angaben);
  const kat = produktCheckliste(input.produkt)?.key ?? null;
  const out: BedarfFeld[] = [];
  const add = (key: QualificationKey, label: string, wert?: string | null) => {
    if (out.some((f) => f.key === key)) return;
    const v = q[key] ?? wert ?? null;
    out.push({ key, label, hint: hintOf(key), wert: leer(v) ? null : v });
  };

  if (kat === "tier") {
    add("tier", "Tiere und Gesundheit (24 Monate)");
    add("tarifwunsch", "Gewünschter Schutz (OP oder voll)");
    add("geburt", "Geburtsdatum des Halters");
    add("vorhanden", "Bestehende Tierversicherung");
    return out;
  }

  if (kat === "privatschutz") {
    const interesse = [formWert(input.formular, /versicherungsinteresse|interesse/i), q.interesse].filter(Boolean).join(" ");
    const sp = spartenAus(interesse);
    add("lebenssituation", "Lebenssituation", formWert(input.formular, /lebenssituation/i));
    add("versichern", "Wer versichert werden soll");
    add("geburt", "Geburtsdatum");
    add("vorhanden", "Bestehende Verträge");
    const alle = !sp.length;
    if (alle || sp.includes("hausrat")) add("wohnflaeche", "Wohnfläche, ständig bewohnt");
    if (alle || sp.includes("rechtsschutz")) add("bereiche", "Rechtsschutz-Bereiche");
    if (sp.includes("wohngebaeude")) add("gebaeude", "Gebäude (Fläche, Baujahr, Nutzung)");
    if (sp.includes("tier")) {
      add("tier", "Tiere, Anzahl, je Tier");
      if (tierWunsch(q.interesse ?? null).kranken) add("tarifwunsch", "Gewünschter Schutz (OP oder voll)");
    }
    if (alle || sp.some((s) => s === "rechtsschutz" || s === "unfall" || s === "haftpflicht")) add("beruf", "Beruf");
    add("vorschaeden", "Vorschäden (5 Jahre)");
    return out;
  }

  add("interesse", "Interesse", formWert(input.formular, /versicherungsinteresse|interesse/i));
  add("lebenssituation", "Lebenssituation", formWert(input.formular, /lebenssituation/i));
  add("vorhanden", "Bestehende Verträge");
  add("anlass", "Anlass");
  add("einwaende", "Einwände");
  return out;
}

/** Labels der noch offenen Punkte. */
export const offenePunkte = (felder: BedarfFeld[]): string[] => felder.filter((f) => !f.wert).map((f) => f.label);

/** Eingaben des Vermittlers über die bekannten Werte legen (leere Eingaben lassen den bekannten Wert stehen). */
export function felderMit(felder: BedarfFeld[], eingaben: QualificationData): BedarfFeld[] {
  const neu = cleanQualificationData(eingaben);
  return felder.map((f) => (neu[f.key] && !leer(neu[f.key]) ? { ...f, wert: neu[f.key]! } : f));
}

/**
 * Wie vollständig ist der Bedarf nach dem Gespräch? Ohne Auswahl des Vermittlers aus den Punkten abgeleitet:
 * nichts offen = komplett, nichts Neues erfasst = nein, sonst teilweise.
 */
export function bedarfStand(felder: BedarfFeld[], eingaben: QualificationData, gewaehlt?: NeedState | null): NeedState {
  if (gewaehlt) return gewaehlt;
  const nachher = felderMit(felder, eingaben);
  if (nachher.every((f) => f.wert)) return "komplett";
  const neu = Object.values(cleanQualificationData(eingaben)).some((v) => !leer(v));
  return neu ? "teilweise" : "nein";
}

const fmtTermin = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(d);

/**
 * Anstoß für den Assistenten nach dem Telefonat (als Kontext-Nachricht, nicht an den Lead): Bezug aufs Telefonat,
 * Termin nennen, dann NUR die offenen Punkte, eine Frage pro Nachricht. Ohne Angaben des Vermittlers (stand null) die
 * vorsichtige Fassung (als Terminvorbereitung, keine Annahmen über das Gespräch).
 */
export function anstossNachTelefonat(p: { berater: string; termin: Date | null; offen: string[]; stand: NeedState | null }): string {
  return [
    `[Hinweis der App, nicht vom Lead: ${p.berater} hat gerade mit dem Interessenten telefoniert.${p.termin ? ` Termin: ${fmtTermin(p.termin)} Uhr.` : ""}`,
    "Schreib jetzt von dir aus eine kurze WhatsApp mit Bezug auf das Telefonat, zum Beispiel:",
    p.termin
      ? `„Wie besprochen sehen wir uns am ${fmtTermin(p.termin)} Uhr. Damit sich ${p.berater} gut vorbereiten kann, kurz vorab: …“`
      : `„Danke für das nette Telefonat. Damit sich ${p.berater} gut vorbereiten kann, kurz vorab: …“`,
    `Frag NUR diese noch offenen Punkte, in dieser Reihenfolge, eine Frage pro Nachricht (die nächste erst nach der Antwort): ${p.offen.join("; ")}.`,
    "Frag nichts, was unter „Bisher erfasst“, im Formular oder im Verlauf steht. Keine erneute Vorstellung, kein neuer Terminvorschlag.",
    p.stand === "teilweise"
      ? "Den Rest hat der Berater im Telefonat schon geklärt."
      : p.stand === "nein"
        ? "Im Telefonat wurde nur der Termin vereinbart, über den Bedarf noch nicht gesprochen."
        : "Du weißt nicht, was im Telefonat besprochen wurde: erfinde nichts dazu und formuliere die Fragen als kurze Terminvorbereitung. Sagt der Lead, das sei schon besprochen, bedanke dich und frag nicht weiter.",
    "Wird es dem Lead zu viel, lass den Rest offen: der Berater klärt ihn im Termin.]",
  ].join("\n");
}
