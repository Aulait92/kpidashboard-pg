// Eigene Funnels als Konfiguration im Code (Ole, 20.11.2026): Schritte, Texte, Optionen, Abbruchregeln und je Schritt
// optional eine Fassung b für A/B-Tests (test.experiment = Schlüssel in lib/experimente.ts, test.b = geänderte Texte).
// Rein und ohne schwere Bibliotheken: läuft im Browser (Funnel-Seite) und auf dem Server (Prüfung beim Absenden).
// Die genaue Telefonprüfung (libphonenumber, lib/ppl/telefon-pruefung.ts) macht nur der Server.
//
// Erster Funnel: PKV-Tarifoptimierung (beitrag.pkv-tarife.com), Nachbau von Perspective „beitrag-halbieren“.
// Texte: lib/funnel/pkv-beitrag-texte.ts (eine Datei für die Rechtsprüfung).

import { EMAIL_RE, normalizePhone } from "@/lib/whatsapp/phone";
import { formatBirthday, parseEuro } from "@/lib/ppl/perspective";
import { PKV_DAUER, PKV_SITUATION_LABEL, PKV_SITUATIONEN, PKV_TEXTE as T, PKV_VERSICHERER, PKV_VERSICHERER_HAEUFIG, PKV_VERSICHERER_LABEL, PKV_VERSICHERT_LABEL } from "@/lib/funnel/pkv-beitrag-texte";

export type FeldId = "versichert" | "versicherung" | "situation" | "dauer" | "beitrag" | "geburtsdatum" | "plz" | "ort" | "vorname" | "nachname" | "email" | "telefon";
export type Antworten = Partial<Record<FeldId, string>>;
export type Fehler = Partial<Record<FeldId, string>>;
export type AbbruchGrund = "gesetzlich" | "unter_650" | "debeka" | "beamte";
export type Variante = "a" | "b";

export type SchrittTexte = {
  ueberschrift?: string;
  text?: readonly string[];
  frage?: string;
  hinweis?: string;
  knopf?: string;
  /** Kleine Fußnote unter der Überschrift (z. B. zu „bis zu 50 %“) */
  fussnote?: string;
  /** Vertrauenszeile (Start), Punkte mit „·“ getrennt */
  vertrauen?: readonly string[];
  /** Nummerierte Liste (Danke-Seite „So geht es weiter“) */
  liste?: readonly string[];
  /** Kleiner Satz unter der Liste bzw. dem Knopf */
  nachsatz?: string;
};

export type Eingabefeld = {
  feld: FeldId;
  label: string;
  typ: "text" | "email" | "tel" | "euro" | "datum" | "plz";
  platzhalter?: string;
  autocomplete?: string;
  einheit?: string;
  /** Hinweis unter dem Feld */
  hinweis?: string;
  /** Schmal (z. B. PLZ neben dem Ort) */
  schmal?: boolean;
};

type Basis = {
  id: string;
  texte: SchrittTexte;
  /** A/B-Test dieses Schritts: Experiment-Schlüssel (lib/experimente.ts) und Texte der Fassung b */
  test?: { experiment: string; b: Partial<SchrittTexte> };
  /** Hinweis je früherer Antwort (z. B. Beitrag je Situation); sonst texte.hinweis */
  hinweisJe?: { feld: FeldId; texte: Readonly<Record<string, string>> };
};

export type Schritt =
  | (Basis & {
      art: "auswahl";
      frageNr: number;
      feld: FeldId;
      /** Gespeicherte Werte (Filter, Lead-PDF, Perspective-Feldnamen) */
      optionen: readonly string[];
      /** Beschriftung je Wert, wo sie vom Wert abweicht */
      labels?: Readonly<Record<string, string>>;
      spalten: 1 | 2;
      /** Nur diese Optionen als Kacheln, alle übrigen über ein Suchfeld (lange Listen wie Versicherer) */
      haeufig?: readonly string[];
      /** Suchfeld: Beschriftung und Text ohne Treffer */
      suche?: { label: string; keineTreffer: string };
      abbruch?: (a: Antworten) => AbbruchGrund | null;
    })
  | (Basis & { art: "eingabe"; frageNr?: number; felder: Eingabefeld[]; abbruch?: (a: Antworten) => AbbruchGrund | null; vertraulich?: string })
  | (Basis & { art: "info"; bild?: "zwischenseite" })
  // Einwilligung: lib/funnel/pkv-beitrag-texte.ts einwilligungTeile (mit Datenschutz-Adresse vom Server)
  | (Basis & { art: "absenden"; felder: Eingabefeld[] })
  | (Basis & { art: "ende"; grund: AbbruchGrund; zurueckZu: string })
  | (Basis & { art: "danke" });

export type FunnelDef = {
  key: string;
  /** Marke (lib/funnel/marken.ts): Logo, Farben, Bilder, Anbieterzeile */
  marke: string;
  /** Produkt im Pay-per-Lead-Eingang (Name oder Slug wie bei /api/leads/pool?produkt=…) */
  produkt: string;
  fragenGesamt: number;
  schritte: Schritt[];
  /** Feld „Source“ am Lead (wie bisher bei Perspective) */
  quelle: string;
};

// ─── Prüfregeln ───────────────────────────────────────────────────────────

/** Mindestbeitrag: darunter bieten wir die Prüfung nicht an */
export const MIN_BEITRAG = 650;
export const ALTER_MIN = 18;
export const ALTER_MAX = 99;

export function beitragZahl(raw: string | undefined): number | null {
  const s = parseEuro(raw ?? "");
  const n = s ? Number(s) : NaN;
  return Number.isFinite(n) && n > 0 && n < 20000 ? Math.round(n) : null;
}

/** Beim Tippen formatieren: „14031975“ → „14.03.1975“, „1.3.1975“ → „01.03.1975“ (nur Ziffern und Punkte). */
export function datumTippen(raw: string): string {
  const seg = ["", "", ""];
  let i = 0;
  for (const ch of raw.replace(/[^\d.]/g, "")) {
    if (ch === ".") {
      if (i < 2 && seg[i]) {
        seg[i] = seg[i].padStart(2, "0");
        i++;
      }
      continue;
    }
    if (i < 2 && seg[i].length === 2) i++;
    if (seg[i].length < (i === 2 ? 4 : 2)) seg[i] += ch;
  }
  let out = seg[0];
  if (seg[0].length === 2 && (seg[1] || i >= 1)) out += `.${seg[1]}`;
  if (seg[1].length === 2 && (seg[2] || i >= 2)) out += `.${seg[2]}`;
  return out;
}

/** Geburtsdatum TT.MM.JJJJ: echtes Datum, Alter 18 bis 99. Gibt das Datum normalisiert oder null. */
export function geburtsdatumOk(raw: string | undefined, heute = new Date()): string | null {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((raw ?? "").trim());
  if (!m) return null;
  const [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(j, mo - 1, t));
  if (d.getUTCFullYear() !== j || d.getUTCMonth() !== mo - 1 || d.getUTCDate() !== t) return null;
  let alter = heute.getUTCFullYear() - j;
  if (heute.getUTCMonth() < mo - 1 || (heute.getUTCMonth() === mo - 1 && heute.getUTCDate() < t)) alter--;
  if (alter < ALTER_MIN || alter > ALTER_MAX) return null;
  return formatBirthday(`${t}.${mo}.${j}`);
}

const NAME_RE = /^[\p{L}][\p{L}' .-]{0,58}[\p{L}.]$/u;
export const nameOk = (raw: string | undefined) => NAME_RE.test((raw ?? "").trim().replace(/\s+/g, " "));
export const emailOk = (raw: string | undefined) => {
  const s = (raw ?? "").trim();
  return s.length <= 120 && EMAIL_RE.test(s) && /\.[a-z]{2,}$/i.test(s);
};
/** Grobe Prüfung im Browser: deutsche Nummer mit plausibler Länge. Genau prüft der Server (pruefeTelefon). */
export function telefonGrobOk(raw: string | undefined): boolean {
  const n = normalizePhone(raw ?? "");
  return !!n && n.startsWith("49") && n.length >= 10 && n.length <= 14;
}
export const plzOk = (raw: string | undefined) => /^\d{5}$/.test((raw ?? "").trim());
export const ortOk = (raw: string | undefined) => /^[\p{L}][\p{L} .'()/-]{1,59}$/u.test((raw ?? "").trim());

const FEHLER: Record<FeldId, string> = {
  versichert: T.start.frage,
  versicherung: T.versicherung.frage,
  situation: T.situation.frage,
  dauer: T.dauer.frage,
  beitrag: T.beitrag.fehler,
  geburtsdatum: T.geburtsdatum.fehler,
  plz: T.wohnort.fehlerPlz,
  ort: T.wohnort.fehlerOrt,
  vorname: T.name.fehlerVorname,
  nachname: T.name.fehlerNachname,
  email: T.kontakt.fehlerEmail,
  telefon: T.kontakt.fehlerTelefon,
};

function feldOk(feld: FeldId, wert: string | undefined, heute: Date): boolean {
  switch (feld) {
    case "beitrag":
      return beitragZahl(wert) != null;
    case "geburtsdatum":
      return geburtsdatumOk(wert, heute) != null;
    case "plz":
      return plzOk(wert);
    case "ort":
      return ortOk(wert);
    case "vorname":
    case "nachname":
      return nameOk(wert);
    case "email":
      return emailOk(wert);
    case "telefon":
      return telefonGrobOk(wert);
    default:
      return !!wert?.trim();
  }
}

/** Fehlertext eines Felds; beim Geburtsdatum genauer (unmögliches Datum, Alter außerhalb 18 bis 99). */
function fehlerText(feld: FeldId, wert: string | undefined): string {
  if (feld === "geburtsdatum") {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec((wert ?? "").trim());
    if (m) {
      const [t, mo, j] = [Number(m[1]), Number(m[2]), Number(m[3])];
      const d = new Date(Date.UTC(j, mo - 1, t));
      return d.getUTCFullYear() === j && d.getUTCMonth() === mo - 1 && d.getUTCDate() === t ? T.geburtsdatum.fehlerAlter : T.geburtsdatum.fehlerDatum;
    }
  }
  return FEHLER[feld];
}

/** Fehler eines Schritts (leer = in Ordnung). */
export function pruefeSchritt(s: Schritt, a: Antworten, heute = new Date()): Fehler {
  const out: Fehler = {};
  if (s.art === "auswahl") {
    if (!a[s.feld] || !s.optionen.includes(a[s.feld]!)) out[s.feld] = FEHLER[s.feld];
  } else if (s.art === "eingabe" || s.art === "absenden") {
    for (const f of s.felder) if (!feldOk(f.feld, a[f.feld], heute)) out[f.feld] = fehlerText(f.feld, a[f.feld]);
  }
  return out;
}

/** Ein einzelnes Feld prüfen (beim Verlassen des Felds im Browser): Fehlertext oder null. */
export function pruefeFeld(feld: FeldId, wert: string | undefined, heute = new Date()): string | null {
  return feldOk(feld, wert, heute) ? null : fehlerText(feld, wert);
}

/** Position im Ablauf bis zum Absenden (Fortschrittsbalken über alle Schritte) oder null (Danke, Endseiten). */
export function fortschrittFuer(f: FunnelDef, id: string): { nr: number; von: number } | null {
  const liste = ablauf(f);
  const i = liste.findIndex((s) => s.id === id);
  return i < 0 ? null : { nr: i + 1, von: liste.length };
}

/** Hinweis eines Schritts passend zu früheren Antworten (hinweisJe), sonst der feste Hinweis. */
export function hinweisFuer(s: Schritt, texte: SchrittTexte, a: Antworten): string | undefined {
  const wert = s.hinweisJe ? a[s.hinweisJe.feld] : undefined;
  return (wert && s.hinweisJe?.texte[wert]) || texte.hinweis;
}

/** Abbruchregel des Schritts (z. B. gesetzlich versichert, Beitrag unter 650 €) oder null. */
export function abbruchFuer(s: Schritt, a: Antworten): AbbruchGrund | null {
  return (s.art === "auswahl" || s.art === "eingabe") && s.abbruch ? s.abbruch(a) : null;
}

/** Schritte des Ablaufs bis zum Absenden (ohne Danke- und Endseiten). */
export function ablauf(f: FunnelDef): Schritt[] {
  const i = f.schritte.findIndex((s) => s.art === "absenden");
  return f.schritte.slice(0, i + 1);
}

/** Nächster Schritt nach einer Antwort: Endseite bei Abbruch, sonst der folgende Schritt im Ablauf. */
export function naechsterSchritt(f: FunnelDef, id: string, a: Antworten): { id: string; abbruch: AbbruchGrund | null } {
  const s = f.schritte.find((x) => x.id === id);
  if (!s) return { id: f.schritte[0].id, abbruch: null };
  const grund = abbruchFuer(s, a);
  if (grund) {
    const ende = f.schritte.find((x) => x.art === "ende" && x.grund === grund);
    if (ende) return { id: ende.id, abbruch: grund };
  }
  const liste = ablauf(f);
  const i = liste.findIndex((x) => x.id === id);
  const next = i >= 0 && i + 1 < liste.length ? liste[i + 1] : f.schritte.find((x) => x.art === "danke");
  return { id: next?.id ?? id, abbruch: null };
}

/** Alle Angaben beim Absenden auf dem Server: Fehler je Feld oder Abbruch (dann kein Lead). */
export function pruefeAlles(f: FunnelDef, a: Antworten, heute = new Date()): { ok: true } | { ok: false; fehler: Fehler; abbruch: AbbruchGrund | null; schritt: string } {
  for (const s of ablauf(f)) {
    const fehler = pruefeSchritt(s, a, heute);
    if (Object.keys(fehler).length) return { ok: false, fehler, abbruch: null, schritt: s.id };
    const grund = abbruchFuer(s, a);
    if (grund) return { ok: false, fehler: {}, abbruch: grund, schritt: s.id };
  }
  return { ok: true };
}

/** Texte eines Schritts in der Fassung (b nur, wenn der Schritt einen Test hat). */
/** Beschriftung einer Auswahl-Option (Wert bleibt gespeichert). */
export function optionLabel(s: Schritt, wert: string): string {
  return s.art === "auswahl" ? (s.labels?.[wert] ?? wert) : wert;
}

export function texteFuer(s: Schritt, v: Variante = "a"): SchrittTexte {
  return v === "b" && s.test ? { ...s.texte, ...s.test.b } : s.texte;
}

/** Schritte mit A/B-Test: Schritt-ID → Experiment-Schlüssel. */
export function testSchritte(f: FunnelDef): { schritt: string; experiment: string }[] {
  return f.schritte.filter((s) => s.test).map((s) => ({ schritt: s.id, experiment: s.test!.experiment }));
}

/** Nur bekannte Felder, gekürzt (Eingaben vom Browser). */
export function saubereAntworten(raw: unknown): Antworten {
  const out: Antworten = {};
  if (!raw || typeof raw !== "object") return out;
  const keys: FeldId[] = ["versichert", "versicherung", "situation", "dauer", "beitrag", "geburtsdatum", "plz", "ort", "vorname", "nachname", "email", "telefon"];
  for (const k of keys) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string" && v.trim()) out[k] = v.trim().replace(/\s+/g, " ").slice(0, 120);
  }
  return out;
}

/**
 * Formularfelder für den Pay-per-Lead-Eingang, mit denselben Namen wie bisher die Perspective-Leads
 * (lib/ppl/perspective.ts translatePerspective, Kategorie pkv). Damit laufen Dublettenprüfung, Filter (PLZ, Beitrag,
 * Versicherer, Beamte), Lead-PDF und Zustellung an die Abnehmer unverändert.
 */
export function pplFelder(f: FunnelDef, a: Antworten, heute = new Date()): Record<string, string> {
  const tel = normalizePhone(a.telefon ?? "");
  const felder: Record<string, string> = {
    Vorname: (a.vorname ?? "").trim(),
    Nachname: (a.nachname ?? "").trim(),
    "E-Mail": (a.email ?? "").trim().toLowerCase(),
    Telefonnummer: tel ? `+${tel}` : "",
    Geburtsdatum: geburtsdatumOk(a.geburtsdatum, heute) ?? "",
    Postleitzahl: (a.plz ?? "").replace(/\D/g, "").slice(0, 5),
    Ort: (a.ort ?? "").trim(),
    "Aktuelle Versicherung": a.versicherung ?? "",
    "Wie lange in PKV?": a.dauer ?? "",
    "Monatlicher Beitrag": String(beitragZahl(a.beitrag) ?? ""),
    Situation: a.situation ?? "",
    "Gesetzlich oder privat?": a.versichert ?? "",
    Source: f.quelle,
  };
  for (const [k, v] of Object.entries(felder)) if (!v) delete felder[k];
  return felder;
}

// ─── PKV-Tarifoptimierung ─────────────────────────────────────────────────

export const PKV_BEITRAG: FunnelDef = {
  key: "pkv-beitrag",
  marke: "pkv-tarife",
  produkt: "pkv-tarifoptimierung",
  fragenGesamt: 7,
  quelle: "Eigener Funnel beitrag.pkv-tarife.com",
  schritte: [
    {
      id: "start",
      art: "auswahl",
      frageNr: 1,
      feld: "versichert",
      optionen: ["Privat", "Gesetzlich"],
      labels: PKV_VERSICHERT_LABEL,
      spalten: 2,
      // Advertorial (Einleitung, Absätze, Fußnote) steht in PKV_TEXTE.start und wird nur auf der Startseite gezeigt
      texte: { ueberschrift: T.start.ueberschrift, text: T.start.text, fussnote: T.start.fussnote, vertrauen: T.start.vertrauen, frage: T.start.frage },
      abbruch: (a) => (a.versichert === "Gesetzlich" ? "gesetzlich" : null),
      // Erster echter Test (A/B-Test-Labor, 20.11.2026): Überschrift mit Anlass „Beitragserhöhung zum 1. Januar“
      test: { experiment: "funnel_pkv_anlass", b: { ueberschrift: T.startB.ueberschrift } },
    },
    {
      id: "versicherung",
      art: "auswahl",
      frageNr: 2,
      feld: "versicherung",
      // Alle Versicherer bleiben gültige Werte; Kacheln nur für die 8 häufigsten, der Rest über die Suche
      optionen: PKV_VERSICHERER,
      labels: PKV_VERSICHERER_LABEL,
      haeufig: PKV_VERSICHERER_HAEUFIG,
      // Debeka: interner Tarifwechsel bringt dort nichts (Ole, 21.11.2026), freundlich aussteigen statt 5 weitere Fragen
      abbruch: (a) => (a.versicherung === "Debeka" ? "debeka" : null),
      suche: { label: T.versicherung.suche, keineTreffer: T.versicherung.keineTreffer },
      spalten: 2,
      texte: { frage: T.versicherung.frage, hinweis: T.versicherung.hinweis },
    },
    { id: "situation", art: "auswahl", frageNr: 3, feld: "situation", optionen: PKV_SITUATIONEN, labels: PKV_SITUATION_LABEL, spalten: 2, abbruch: (a) => (a.situation === "Beamter" ? "beamte" : null), texte: { frage: T.situation.frage } },
    { id: "dauer", art: "auswahl", frageNr: 4, feld: "dauer", optionen: PKV_DAUER, spalten: 1, texte: { frage: T.dauer.frage } },
    {
      id: "beitrag",
      art: "eingabe",
      frageNr: 5,
      felder: [{ feld: "beitrag", label: T.beitrag.frage, typ: "euro", platzhalter: T.beitrag.platzhalter, einheit: T.beitrag.einheit }],
      texte: { frage: T.beitrag.frage, hinweis: T.beitrag.hinweis, knopf: T.weiter },
      // Arbeitgeberzuschuss nur bei Angestellten, Beamte: Eigenanteil nach Beihilfe (Personas, 21.11.2026)
      hinweisJe: { feld: "situation", texte: { Angestellt: T.beitrag.hinweisAngestellt, Beamter: T.beitrag.hinweisBeamter } },
      abbruch: (a) => {
        const n = beitragZahl(a.beitrag);
        return n != null && n < MIN_BEITRAG ? "unter_650" : null;
      },
    },
    {
      id: "geburtsdatum",
      art: "eingabe",
      frageNr: 6,
      felder: [{ feld: "geburtsdatum", label: T.geburtsdatum.frage, typ: "datum", platzhalter: T.geburtsdatum.platzhalter, autocomplete: "bday" }],
      texte: { frage: T.geburtsdatum.frage, hinweis: T.geburtsdatum.hinweis, knopf: T.weiter },
    },
    {
      id: "wohnort",
      art: "eingabe",
      frageNr: 7,
      felder: [
        { feld: "plz", label: T.wohnort.plz, typ: "plz", autocomplete: "postal-code", schmal: true },
        { feld: "ort", label: T.wohnort.ort, typ: "text", autocomplete: "address-level2" },
      ],
      texte: { frage: T.wohnort.frage, hinweis: T.wohnort.hinweis, knopf: T.weiter },
    },
    { id: "fast-fertig", art: "info", bild: "zwischenseite", texte: { ueberschrift: T.fastFertig.ueberschrift, liste: T.fastFertig.liste, knopf: T.fastFertig.knopf } },
    {
      id: "name",
      art: "eingabe",
      felder: [
        { feld: "vorname", label: T.name.vorname, typ: "text", autocomplete: "given-name" },
        { feld: "nachname", label: T.name.nachname, typ: "text", autocomplete: "family-name" },
      ],
      texte: { ueberschrift: T.name.ueberschrift, fussnote: T.name.fussnote, frage: T.name.frage, knopf: T.weiter },
      vertraulich: T.name.vertraulich,
    },
    {
      id: "kontakt",
      art: "absenden",
      // Telefon zuerst: der Experte ruft an (Conversion-Durchgang 20.11.2026)
      felder: [
        { feld: "telefon", label: T.kontakt.telefon, typ: "tel", autocomplete: "tel", platzhalter: T.kontakt.telefonPlatzhalter, hinweis: T.kontakt.telefonHinweis },
        { feld: "email", label: T.kontakt.email, typ: "email", autocomplete: "email" },
      ],
      // Nutzen bis zum Absenden sichtbar (texte.md Nr. 9), gleiche Fußnote (L8)
      texte: { ueberschrift: T.name.ueberschrift, fussnote: T.name.fussnote, frage: T.kontakt.frage, hinweis: T.kontakt.hinweis, knopf: T.kontakt.knopf, nachsatz: T.kontakt.unterKnopf },
    },
    { id: "danke", art: "danke", texte: { ueberschrift: T.danke.ueberschrift, frage: T.danke.untertitel, liste: T.danke.schritte, nachsatz: T.danke.verpasst } },
    { id: "ende-gesetzlich", art: "ende", grund: "gesetzlich", zurueckZu: "start", texte: { ueberschrift: T.endeGesetzlich.ueberschrift, text: [T.endeGesetzlich.text], knopf: T.endeGesetzlich.knopf } },
    { id: "ende-beitrag", art: "ende", grund: "unter_650", zurueckZu: "beitrag", texte: { ueberschrift: T.endeBeitrag.ueberschrift, text: [T.endeBeitrag.text], knopf: T.endeBeitrag.knopf } },
    // Beamte: Beihilfe plus Restkostentarif, ein interner Wechsel bringt nichts (Ole, 21.11.2026)
    { id: "ende-beamte", art: "ende", grund: "beamte", zurueckZu: "situation", texte: { ueberschrift: T.endeBeamte.ueberschrift, text: [T.endeBeamte.text], knopf: T.endeBeamte.knopf } },
    { id: "ende-debeka", art: "ende", grund: "debeka", zurueckZu: "versicherung", texte: { ueberschrift: T.endeDebeka.ueberschrift, text: [T.endeDebeka.text], knopf: T.endeDebeka.knopf } },
  ],
};

/** Alle eigenen Funnels (Pfad /f/<key>). */
export const FUNNELS: Record<string, FunnelDef> = { [PKV_BEITRAG.key]: PKV_BEITRAG };

export const funnelDef = (key: string | null | undefined): FunnelDef | null => (key && Object.hasOwn(FUNNELS, key) ? FUNNELS[key] : null);
