// Fragen-Engine für die Terminvorbereitung im Chat (Ole, 26.11.2026). Nach der Buchung erfragt der Assistent die
// angebotsrelevanten Angaben je gebuchter Sparte, ohne WhatsApp-Formular:
//   - eine Frage pro Nachricht, möglichst mit Knöpfen (bis 2 Antworten + „Rest im Termin“) bzw. als WhatsApp-Liste
//     (bis 10 Zeilen); Freitext nur für Zahlen, Daten und Versicherer; Zusammengesetztes in einer Frage
//     („Wohnfläche und Baujahr ungefähr?“)
//   - was aus Formular oder Chat schon bekannt ist, wird übersprungen (je Frage: Formularfeld bzw. Angabe)
//   - zuerst Pflichtfelder für den Beitrag, dann optionale Bausteine; Fortschritt („Noch 3 kurze Fragen.“)
//   - jederzeit „Rest im Termin“: freundlich stoppen, offene Punkte in der Terminvorbereitung
//   - unklare Antwort: genau einmal nachfragen, dann mit Vermerk weiter
//   - keine Gesundheitsfragen (Kranken, BU, Leben, Unfall bleiben für den Termin), Vorschäden der letzten 5 Jahre erlaubt
// Die Definition je Sparte ist Daten (lib/vorbereitung/sparten.ts). Die endgültigen Felder kommen aus den Allianz-
// Onlinerechnern; bis dahin steht dort nur eine vorläufige Beispiel-Definition (vorlaeufig: true, im Betrieb aus).
// Rein, ohne Datenbank (Server-Teil: lib/whatsapp/termin-strecke.ts, Abschnitt Fragen-Engine).

import { a, type Ansprache } from "@/lib/ansprache";
import { ablaufLesen, datumLesen, mmJjjj, ttMmJjjj, WEISS_NICHT_RE } from "@/lib/datum-antwort";
import { versichererAus } from "@/lib/whatsapp/vorvertraege";
import type { QualificationKey } from "@/lib/whatsapp/qualification";

/** Antworttyp einer Frage. */
export type FrageTyp = "knoepfe" | "liste" | "zahl" | "datum" | "versicherer" | "zusammengesetzt";

/** Antwortmöglichkeit (Knopf bzw. Listenzeile). titel: Knopf höchstens 20, Listenzeile höchstens 24 Zeichen. */
export type Option = { id: string; titel: string; wert?: string; /** weitere Wörter, die als diese Antwort zählen */ auch?: RegExp };

/** Teil einer zusammengesetzten Frage (in Reihenfolge der Frage). */
export type Teil = { key: string; label: string; typ: "zahl" | "monatJahr" | "versicherer"; min?: number; max?: number; einheit?: string; pflicht?: boolean };

export type FrageDef = {
  /** eindeutig je Sparte */
  key: string;
  typ: FrageTyp;
  pflicht: boolean;
  frage: { sie: string; du: string };
  /** Kurzbezeichnung (Terminvorbereitung, „Noch klären im Termin“) */
  label: string;
  /** Wohin die Antwort geht (Conversation.qualificationData, erscheint in der Terminvorbereitung) */
  feld: QualificationKey;
  /** Antwort an einen vorhandenen Wert im Feld anhängen („Hausrat: Allianz, Ablauf 03/2027; Haftpflicht: …“) */
  anhaengen?: boolean;
  /** Gilt für mehrere Sparten (z. B. Beruf, Mitversicherte): nur einmal fragen */
  geteilt?: boolean;
  optionen?: Option[];
  teile?: Teil[];
  min?: number;
  max?: number;
  einheit?: string;
  /** Schon bekannt, wenn ein Formularfeld mit dieser Beschriftung einen Wert hat */
  formular?: RegExp;
  /** Schon bekannt, wenn das Feld einen Wert hat (mit Muster: nur, wenn der Wert passt, z. B. /hausrat/i) */
  bekanntWenn?: RegExp | true;
};

export type SparteDef = {
  /** Schlüssel wie im Tarifkatalog bzw. in lib/preise/rechner-angaben.ts (haftpflicht, hausrat …) */
  sparte: string;
  label: string;
  /** Vorläufig (noch nicht aus den Allianz-Rechnern): im Betrieb aus, nur in Tests bzw. mit Schalter */
  vorlaeufig: boolean;
  fragen: FrageDef[];
};

/** Eine Frage im Plan: Definition mit Sparte (bei geteilten Fragen die erste Sparte). */
export type GeplanteFrage = FrageDef & { sparte: string; sparteLabel: string; id: string };

/** Woraus „schon bekannt“ gelesen wird. */
export type FragenQuelle = {
  formular: { label: string; value: string }[];
  angaben: Partial<Record<string, string>>;
  /** Schon beantwortete bzw. übersprungene Fragen (id = sparte.key) */
  erledigt: readonly string[];
};

/** Knopf „Rest im Termin“: beendet die Fragen, offene Punkte gehen in die Terminvorbereitung. */
export const REST_KNOPF = { id: "vf:rest", title: "Rest im Termin" } as const;
export const REST_RE = /\b(rest|lieber|sp(ä|ae)ter|alles weitere)\b.{0,20}\b(im termin|beim termin|im gespr(ä|ae)ch|pers(ö|oe)nlich)\b|^\s*rest im termin\s*$|^\s*lieber im termin\s*$/i;

/** id einer Frage im Plan. */
export const frageId = (sparte: string, key: string) => `${sparte}.${key}`;

/** Payload eines Antwortknopfs bzw. einer Listenzeile: vf:<sparte>.<key>:<option>. */
export const optionPayload = (id: string, option: string) => `vf:${id}:${option}`;

/** Payload lesen: { id, option } bzw. rest; null = kein Knopf der Engine. */
export function payloadLesen(p: string | null | undefined): { rest: true } | { id: string; option: string } | null {
  const t = (p ?? "").trim();
  if (t === REST_KNOPF.id) return { rest: true };
  const m = /^vf:([a-z0-9-]+\.[a-zA-Z0-9]+):([a-zA-Z0-9_-]+)$/.exec(t);
  return m ? { id: m[1], option: m[2] } : null;
}

/** Ist die Frage schon beantwortet bzw. bekannt? */
export function bekannt(f: GeplanteFrage, q: FragenQuelle): boolean {
  if (q.erledigt.includes(f.id)) return true;
  if (f.formular && q.formular.some((x) => f.formular!.test(x.label) && x.value.trim())) return true;
  const wert = q.angaben[f.feld];
  if (wert && f.bekanntWenn) return f.bekanntWenn === true ? true : f.bekanntWenn.test(wert);
  return false;
}

/**
 * Fragenplan für die gebuchten Sparten (rein): Pflichtfragen aller Sparten vor den optionalen, je in Reihenfolge der
 * Definition; geteilte Fragen nur einmal (bei der ersten Sparte). Nur Sparten mit Definition.
 */
export function fragenPlan(sparten: readonly string[], defs: readonly SparteDef[]): GeplanteFrage[] {
  const alle: GeplanteFrage[] = [];
  const geteilt = new Set<string>();
  for (const s of sparten) {
    const d = defs.find((x) => x.sparte === s);
    if (!d) continue;
    for (const f of d.fragen) {
      if (f.geteilt) {
        if (geteilt.has(f.key)) continue;
        geteilt.add(f.key);
      }
      alle.push({ ...f, sparte: d.sparte, sparteLabel: d.label, id: frageId(d.sparte, f.key) });
    }
  }
  return [...alle.filter((f) => f.pflicht), ...alle.filter((f) => !f.pflicht)];
}

/** Offene Fragen in Reihenfolge (rein). */
export function offeneFragen(plan: readonly GeplanteFrage[], q: FragenQuelle): GeplanteFrage[] {
  return plan.filter((f) => !bekannt(f, q));
}

/** Fortschritt vor der Frage: „Noch 3 kurze Fragen.“ bzw. „Letzte kurze Frage:“. */
export function fortschrittText(anzahlOffen: number): string {
  return anzahlOffen <= 1 ? "Letzte kurze Frage:" : `Noch ${anzahlOffen} kurze Fragen.`;
}

export type FrageNachricht = {
  text: string;
  /** Antwort-Knöpfe (höchstens 3, inkl. „Rest im Termin“) */
  buttons: { id: string; title: string }[] | null;
  /** WhatsApp-Liste (bis 10 Zeilen, inkl. „Rest im Termin“), wenn die Antworten nicht auf Knöpfe passen */
  liste: { knopf: string; zeilen: { id: string; title: string }[] } | null;
};

/**
 * Nachricht zu einer Frage (rein): Fortschritt, Frage, Knöpfe bzw. Liste. Knöpfe, wenn die Antworten mit „Rest im Termin“
 * auf 3 Knöpfe passen, sonst Liste (bis 9 Antworten + „Rest im Termin“). Freitext-Fragen bekommen nur „Rest im Termin“.
 */
export function frageNachricht(f: GeplanteFrage, an: Ansprache, anzahlOffen: number, einleitung?: string | null): FrageNachricht {
  const text = [einleitung, fortschrittText(anzahlOffen), a(an, f.frage.du, f.frage.sie)].filter(Boolean).join(" ");
  const opts = f.optionen ?? [];
  if ((f.typ === "knoepfe" || f.typ === "liste") && opts.length) {
    const knoepfe = opts.map((o) => ({ id: optionPayload(f.id, o.id), title: o.titel }));
    if (f.typ === "knoepfe" && opts.length <= 2 && opts.every((o) => o.titel.length <= 20)) return { text, buttons: [...knoepfe, REST_KNOPF], liste: null };
    return { text, buttons: null, liste: { knopf: "Antwort wählen", zeilen: [...knoepfe.slice(0, 9).map((k) => ({ ...k, title: k.title.slice(0, 24) })), REST_KNOPF] } };
  }
  return { text, buttons: [REST_KNOPF], liste: null };
}

/** Ergebnis der Auswertung einer Antwort. */
export type Auswertung =
  | { art: "wert"; wert: string }
  /** Lead weiß es nicht: Frage für den Termin offen lassen, weiter */
  | { art: "offen" }
  | { art: "rest" }
  | { art: "unklar" };

const zahlen = (t: string): number[] => [...t.replace(/(\d)\.(\d{3})\b/g, "$1$2").matchAll(/\d+(?:,\d+)?/g)].map((m) => Number(m[0].replace(",", ".")));

/** Antwort auswerten (rein). knopf = gewählte Option (aus dem Payload), sonst der getippte Text. */
export function antwortAuswerten(f: GeplanteFrage, text: string | null | undefined, knopf: string | null = null, jetzt: Date = new Date()): Auswertung {
  const t = (text ?? "").replace(/\s+/g, " ").trim();
  if (knopf) {
    const o = f.optionen?.find((x) => x.id === knopf);
    return o ? { art: "wert", wert: o.wert ?? o.titel } : { art: "unklar" };
  }
  if (!t) return { art: "unklar" };
  if (REST_RE.test(t)) return { art: "rest" };
  if (WEISS_NICHT_RE.test(t)) return { art: "offen" };
  switch (f.typ) {
    case "knoepfe":
    case "liste": {
      const n = t.toLowerCase();
      const treffer = (f.optionen ?? []).filter((o) => n === o.titel.toLowerCase() || n.startsWith(o.titel.toLowerCase()) || (o.auch ? o.auch.test(t) : false));
      return treffer.length === 1 ? { art: "wert", wert: treffer[0].wert ?? treffer[0].titel } : { art: "unklar" };
    }
    case "zahl": {
      const z = zahlen(t).find((x) => (f.min === undefined || x >= f.min) && (f.max === undefined || x <= f.max));
      return z === undefined ? { art: "unklar" } : { art: "wert", wert: `${z}${f.einheit ? ` ${f.einheit}` : ""}` };
    }
    case "datum": {
      const d = datumLesen(t, jetzt);
      return d ? { art: "wert", wert: ttMmJjjj(d) } : { art: "unklar" };
    }
    case "versicherer": {
      if (/^(nein|keine?|noch nicht|nicht versichert|neu|gar nicht)\b/i.test(t)) return { art: "wert", wert: "noch nicht versichert" };
      const v = versichererAus(t);
      return v ? { art: "wert", wert: v } : { art: "unklar" };
    }
    case "zusammengesetzt":
      return teileAuswerten(f.teile ?? [], t, jetzt);
  }
}

/**
 * Zusammengesetzte Antwort: jeder Teil aus dem Text (Zahlen nach Bereich zugeordnet, „75 qm, 1990“ → Wohnfläche 75,
 * Baujahr 1990; Versicherer; Monat/Jahr). Fehlt ein Pflichtteil: unklar. „noch nicht versichert“ beim Versicherer
 * beantwortet die ganze Frage (ohne Ablauf).
 */
function teileAuswerten(teile: readonly Teil[], t: string, jetzt: Date): Auswertung {
  const out: string[] = [];
  let rest = zahlen(t);
  for (const teil of teile) {
    const pflicht = teil.pflicht !== false;
    if (teil.typ === "versicherer") {
      if (/^(nein|keine?|noch nicht|nicht versichert|neu|gar nicht)\b/i.test(t)) return { art: "wert", wert: "noch nicht versichert" };
      const v = versichererAus(t);
      if (v) out.push(v);
      else if (pflicht) return { art: "unklar" };
      continue;
    }
    if (teil.typ === "monatJahr") {
      const mj = ablaufLesen(t, jetzt);
      if (mj && mj !== "weiss_nicht") {
        out.push(`${teil.label} ${mmJjjj(mj)}`);
        // Zahlen des Datums nicht noch einmal einem anderen Teil zuordnen
        rest = rest.filter((z) => z !== mj.monat && z !== mj.jahr && z !== mj.jahr % 100);
      } else if (pflicht) return { art: "unklar" };
      continue;
    }
    const i = rest.findIndex((z) => (teil.min === undefined || z >= teil.min) && (teil.max === undefined || z <= teil.max));
    if (i < 0) {
      if (pflicht) return { art: "unklar" };
      continue;
    }
    const z = rest[i];
    rest = rest.filter((_, j) => j !== i);
    out.push(teil.einheit ? `${z} ${teil.einheit}` : `${teil.label} ${z}`);
  }
  return out.length ? { art: "wert", wert: out.join(", ") } : { art: "unklar" };
}

/** Einmalige Nachfrage bei unklarer Antwort (rein). */
export function nachfrageText(f: GeplanteFrage, an: Ansprache): string {
  const bsp =
    f.typ === "zusammengesetzt"
      ? (f.teile ?? []).map((x) => x.label).join(" und ")
      : f.typ === "zahl"
        ? "eine Zahl"
        : f.typ === "datum"
          ? "ein Datum wie 15.03.1985"
          : f.typ === "versicherer"
            ? "den Namen der Versicherung"
            : "eine der Antworten";
  return a(an, `Das habe ich nicht ganz verstanden. Magst du mir kurz ${bsp} schreiben?`, `Das habe ich nicht ganz verstanden. Können Sie mir kurz ${bsp} schreiben?`);
}

/** Wert für das Feld der Terminvorbereitung (mit Sparte, wenn angehängt wird). */
export function feldWert(f: GeplanteFrage, wert: string, vorher: string | null | undefined): string {
  const neu = f.anhaengen ? `${f.sparteLabel}: ${wert}` : wert;
  if (!f.anhaengen || !vorher?.trim()) return neu;
  return vorher.includes(neu) ? vorher : `${vorher}; ${neu}`;
}

/** Dank bei „Rest im Termin“ (rein): freundlich stoppen. */
export function restText(an: Ansprache, personNom: string, wochentag: string): string {
  return a(an, `Alles klar, den Rest klärt ${personNom} mit dir im Termin. Bis ${wochentag}!`, `Alles klar, den Rest klärt ${personNom} mit Ihnen im Termin. Bis ${wochentag}!`);
}

/** Getippte Antwort auf die Frage nach der Vorbereitung (kurz, eindeutig); sonst null (der Assistent antwortet). */
export function vorbereitungAusText(text: string | null | undefined): "ja" | "termin" | null {
  const t = (text ?? "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!t || t.length > 40) return null;
  if (/\b(im termin|beim termin|sp(ä|ae)ter|lieber nicht|nein)\b/.test(t)) return "termin";
  if (/^(ja|jap|jo|gern|gerne|klar|ok|okay|sicher|na klar|ja,? (gern|gerne|klar|bitte)|ja bitte|legen sie los|leg los|los)\b[\s!.👍🙂]*$/u.test(t)) return "ja";
  return null;
}
