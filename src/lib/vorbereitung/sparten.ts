// Fragen je Sparte für die Terminvorbereitung im Chat (Engine: lib/vorbereitung/fragen.ts).
//
// Grundlage (Ole, 26.11.2026): Allianz-Onlinerechner (docs/vertrieb/allianz-rechner-felder/README.md) und die
// Fragereihenfolge vom 26.11.2026 mit Oles Entscheidungen:
//   - Vorversicherung (Versicherer, Ablauf Monat/Jahr): im Bündel EINE gemeinsame Frage, bei einer Sparte die Einzelfrage
//     (Schalter VORVERSICHERUNG_GEMEINSAM). Optional, „Weiß ich nicht“, Teilantworten erlaubt, kein Nachbohren.
//   - Unfall ohne Invaliditätsfragen; Tierkranken mit der Frage OP-Schutz oder Vollschutz
//   - mehrere Tiere bzw. Personen: alle abfragen (Wiederholung je Tier bzw. Person)
//   - Tierhalterhaftpflicht Schritt 1: PLZ, Geburtsdatum, Tierart/Anzahl, Rasse bzw. Stockmaß, Schäden 5 Jahre (+ Anzahl)
//   - Privatschutz ist keine eigene Strecke: Fragen der Einzelsparten ohne Dubletten, am Lead „Bündel gewünscht“
//   - nie gefragt: Tarifpräferenz, Zahlweise, Selbstbeteiligung, Summen, Garagen, Gesundheit von Menschen
//   - Kfz: keine Rechnerdaten, nur die Vorvertragsfrage
// Aus dem Formular bekannt (Geburtsdatum, PLZ, Lebenssituation, Wohnfläche, Tierart, Adresse …) wird übersprungen.
// Texte ohne Gedankenstriche, Sie und Du, Listenzeilen höchstens 24 Zeichen (Beschreibung höchstens 72), Knöpfe 20.

import { GEMEINSAM, frageId, vorvertraegeAuswerten, vorvertragAuswerten, type FrageDef, type Kontext, type Option, type SparteDef, type Text } from "@/lib/vorbereitung/fragen";

/** Im Bündel eine gemeinsame Vorvertragsfrage statt je Sparte (Ole, 26.11.2026 bestätigt). */
export const VORVERSICHERUNG_GEMEINSAM = true;

const T = (sie: string, du: string = sie): Text => ({ sie, du });
const PRIVATSCHUTZ = ["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "unfall"] as const;
const SCHADEN_SPARTEN = ["haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "tierhalter"] as const;
const ORDNUNG = ["erst", "zweit", "dritt", "viert", "fünft", "sechst", "siebt", "acht", "neunt", "zehnt"];

// ─── Hilfen ──────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Unfall nur für Kind(er), nicht für den Lead selbst? (unbekannt: nein) */
const unfallNurAndere = (c: Kontext) => {
  const a = c.antwort(frageId("unfall", "fuer"));
  return !!a?.opt && !a.opt.includes("ich");
};
const unfallFuerMich = (c: Kontext) => c.gebucht("unfall") && !unfallNurAndere(c);

/** Vorvertragsfrage gemeinsam (Bündel mit mehr als einer Sparte)? */
export const vorvertragGemeinsam = (c: Pick<Kontext, "sparten">) => VORVERSICHERUNG_GEMEINSAM && c.sparten.filter((s) => VORVERTRAG[s]).length > 1;

type Art = "hund" | "katze" | "pferd";
const ART: Record<Art | "tier", { nom: string; plural: string; geschlecht: "m" | "f" | "n"; pron: string }> = {
  hund: { nom: "Hund", plural: "Hunde", geschlecht: "m", pron: "er" },
  katze: { nom: "Katze", plural: "Katzen", geschlecht: "f", pron: "sie" },
  pferd: { nom: "Pferd", plural: "Pferde", geschlecht: "n", pron: "es" },
  tier: { nom: "Tier", plural: "Tiere", geschlecht: "n", pron: "es" },
};

/** Tierart und Anzahl: aus Tierkranken (falls gebucht), sonst aus der Tierhalterhaftpflicht. */
function tier(c: Kontext): { art: Art | null; n: number; sparte: string } {
  const sparte = c.gebucht("tierkranken") ? "tierkranken" : "tierhalter";
  const o = c.antwort(frageId(sparte, "tierart"))?.opt?.[0] ?? "";
  const art: Art | null = o.startsWith("hund") ? "hund" : o.startsWith("katze") ? "katze" : o.startsWith("pferd") ? "pferd" : null;
  const mehrere = ["hunde", "katzen", "pferde"].includes(o);
  return { art, n: mehrere ? Math.max(2, Math.min(10, c.zahl(frageId(sparte, "anzahl")) ?? 2)) : 1, sparte };
}

/** „Ihr Hund“, „Ihre zweite Katze“, bzw. der Name (aus Tierkranken), je Sie und Du. */
function tierRef(c: Kontext, o: { name?: boolean } = {}): Text {
  const t = tier(c);
  const name = o.name !== false ? c.antwort(frageId("tierkranken", "name", c.i))?.wert : null;
  if (name) return T(name);
  const w = ART[t.art ?? "tier"];
  const possSie = w.geschlecht === "f" ? "Ihre" : "Ihr";
  const possDu = w.geschlecht === "f" ? "deine" : "dein";
  if (t.n === 1) return T(`${possSie} ${w.nom}`, `${possDu} ${w.nom}`);
  const ord = `${ORDNUNG[c.i - 1] ?? `${c.i}.`}${w.geschlecht === "m" ? "er" : w.geschlecht === "f" ? "e" : "es"}`;
  return T(`${possSie} ${ord} ${w.nom}`, `${possDu} ${ord} ${w.nom}`);
}
const gross = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Präfix im Feld „Tier“: erstes Tier wie bisher („Rasse“), weitere mit Nummer („Hund 2 Rasse“). */
const tierPraefix = (was: string) => (c: Kontext) => (c.i > 1 ? `${ART[tier(c).art ?? "tier"].nom} ${c.i} ${was}` : was);

/** Frage zu einem Tier: erstes Tier „Welche Rasse hat Ihr Hund?“, weitere „Und Ihr zweiter Hund: Welche Rasse hat er?“ */
function tierFrage(c: Kontext, mitRef: (r: Text) => Text, mitPron: (pron: string) => Text): Text {
  const t = tier(c);
  const name = c.antwort(frageId("tierkranken", "name", c.i))?.wert;
  if (c.i > 1 && !name) {
    const r = tierRef(c);
    const p = mitPron(ART[t.art ?? "tier"].pron);
    return T(`Und ${r.sie}: ${p.sie}`, `Und ${r.du}: ${gross(p.du)}`);
  }
  return mitRef(tierRef(c));
}

const istHund = (c: Kontext) => tier(c).art === "hund";

// ─── Optionen ────────────────────────────────────────────────────────────────────────────────────────────────────────

const BERUF: Option[] = [
  { id: "kaufm", titel: "Kaufmännisch/verwaltend", beschreibung: "kaufmännisch & verwaltend", auch: /kaufm(ä|a)nn|verwalt|b(ü|ue)ro|angestellt/i },
  { id: "koerperl", titel: "Körperlich/handwerklich", beschreibung: "körperlich & handwerklich", auch: /k(ö|oe)rperlich|handwerk|arbeiter|pflege|bau/i },
  { id: "oeffentl", titel: "Öffentlicher Dienst", beschreibung: "Im öffentlichen Dienst tätig", auch: /(ö|oe)ffentlich|beamt|verbeamtet/i },
  { id: "selbst", titel: "Selbstständig", auch: /selbst(st)?(ä|ae)ndig|freiberuf|freelanc/i },
  { id: "gf", titel: "Geschäftsführer:in", beschreibung: "Geschäftsführer:in/Vorstand", auch: /gesch(ä|ae)ftsf(ü|ue)hr|vorstand/i },
  { id: "nicht", titel: "Nicht erwerbstätig", beschreibung: "z. B. in Rente", auch: /rente|rentner|pension|nicht erwerbst|arbeitslos|hausfrau|hausmann|student|sch(ü|ue)ler/i },
];

const NEIN_JA: Option[] = [
  { id: "nein", titel: "Nein", auch: /^(nein|nee|ne|nö|noe|keine?|nichts)\b/i },
  { id: "ja", titel: "Ja", auch: /^(ja|jo|jep|genau)\b/i },
];

/** Zusatzknöpfe der Vorvertragsfrage. */
const VORVERTRAG_KNOEPFE: Option[] = [
  { id: "nein", titel: "Nicht versichert", wert: "noch nicht versichert" },
  { id: "weissnicht", titel: "Weiß ich nicht" },
];

// ─── Vorverträge ─────────────────────────────────────────────────────────────────────────────────────────────────────

/** Bezeichnung je Sparte (Präfix im Feld „Vorhanden“) und Name der Versicherung im Fragetext. */
const VORVERTRAG: Record<string, { label: string; name: string }> = {
  haftpflicht: { label: "Haftpflicht", name: "Haftpflichtversicherung" },
  hausrat: { label: "Hausrat", name: "Hausratversicherung" },
  rechtsschutz: { label: "Rechtsschutz", name: "Rechtsschutzversicherung" },
  wohngebaeude: { label: "Wohngebäude", name: "Wohngebäudeversicherung" },
  unfall: { label: "Unfall", name: "Unfallversicherung" },
  tierkranken: { label: "Tierkranken", name: "Tierkrankenversicherung" },
  tierhalter: { label: "Tierhalterhaftpflicht", name: "Tierhalterhaftpflicht" },
  kfz: { label: "Kfz", name: "Kfz-Versicherung" },
};

const BEISPIEL = "Ungefähr reicht, zum Beispiel: HUK bis 03/2027.";

function vorvertrag(sparte: string, frage?: Text): FrageDef {
  const v = VORVERTRAG[sparte];
  return {
    key: "vorvertrag",
    typ: "text",
    pflicht: false,
    abschnitt: 3,
    ohneNachfrage: true,
    wenn: (c) => !vorvertragGemeinsam(c),
    label: `Bisheriger Vertrag (${v.label})`,
    feld: "vorhanden",
    praefix: v.label,
    frage: frage ?? T(`Haben Sie schon eine ${v.name}? Wenn ja: bei welcher Gesellschaft und bis wann läuft sie? ${BEISPIEL}`, `Hast du schon eine ${v.name}? Wenn ja: bei welcher Gesellschaft und bis wann läuft sie? ${BEISPIEL}`),
    knoepfe: VORVERTRAG_KNOEPFE,
    auswerten: (t, j) => vorvertragAuswerten(t, j, v.label),
    bekanntWenn: new RegExp(`${v.label}`, "i"),
  };
}

const liste = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} und ${xs.at(-1)}`);

// ─── Gemeinsame Fragen (einmal je Gespräch) ─────────────────────────────────────────────────────────────────────────

const schadenBuendel = (c: Kontext) => c.sparten.filter((s) => (SCHADEN_SPARTEN as readonly string[]).includes(s)).length > 1;
const schadenJa = (c: Kontext) => c.hat(frageId(GEMEINSAM, "schaeden"), "ja");

/** Folgefrage „Wie viele … waren es?“ je Sparte (im Bündel: „0, wenn keiner.“). */
function schadenAnzahl(sparte: string, was: Text, label: string, null_: string, ko: number): FrageDef {
  return {
    key: `schaeden_${sparte}`,
    typ: "zahl",
    pflicht: true,
    abschnitt: 1,
    folge: true,
    wenn: (c) => c.gebucht(sparte) && schadenJa(c),
    label: `Schäden 5 Jahre (${label})`,
    feld: "vorschaeden",
    praefix: label,
    frage: (c) => (schadenBuendel(c) ? T(`${was.sie} ${null_}`, `${was.du} ${null_}`) : was),
    min: 0,
    max: 20,
    ko: (n) => n > ko,
    nachfrage: "die Anzahl als Zahl",
  };
}

const GEMEINSAME_FRAGEN: FrageDef[] = [
  {
    key: "geburt",
    typ: "datum",
    pflicht: true,
    abschnitt: 1,
    wenn: (c) => c.gebucht("haftpflicht", "hausrat", "rechtsschutz", "wohngebaeude", "tierhalter") || unfallFuerMich(c),
    label: "Geburtsdatum",
    feld: "geburt",
    frage: T("Wann sind Sie geboren? Zum Beispiel 15.03.1985.", "Wann bist du geboren? Zum Beispiel 15.03.1985."),
    formular: /^geburtsdatum$|geburtsdatum \(person|^ihr geburtsdatum|^dein geburtsdatum/i,
    bekanntWenn: true,
  },
  {
    key: "plz",
    typ: "text",
    pflicht: true,
    abschnitt: 1,
    wenn: (c) => c.sparten.some((s) => s !== "kfz"),
    label: "Postleitzahl",
    feld: "plz",
    frage: T("Wie lautet Ihre Postleitzahl?", "Wie lautet deine Postleitzahl?"),
    schonBekannt: (c) => !!c.formular(/postleitzahl|\bplz\b|post ?code/i) || /\b\d{5}\b/.test(`${c.formular(/adresse|anschrift|wohnort|street|address/i) ?? ""} ${c.angabe("plz") ?? ""}`),
    auswerten: (t) => {
      const m = /\b\d{5}\b/.exec(t);
      return m ? { art: "wert", wert: m[0] } : { art: "unklar" };
    },
    nachfrage: "die fünfstellige Postleitzahl",
  },
  {
    key: "versicherte",
    typ: "liste",
    pflicht: true,
    abschnitt: 1,
    wenn: (c) => c.gebucht("haftpflicht", "rechtsschutz"),
    label: "Wer wird versichert?",
    feld: "versichern",
    praefix: "Versichert",
    frage: T("Wer soll versichert sein?"),
    optionen: [
      { id: "ich", titel: "Nur mich", beschreibung: "mich selbst", auch: /\b(nur ich|nur mich|allein|single|ich selbst|mich selbst)\b/i },
      { id: "partner", titel: "Mich und Partner:in", beschreibung: "mich und meine:n Partner:in", auch: /^(?!.*(kind|familie)).*\b(paar|partner|partnerin|frau|mann|freundin|freund|verheiratet|ehe)/i },
      { id: "kinder", titel: "Mich und Kind(er)", beschreibung: "mich und mein(e) Kind(er)", auch: /^(?!.*(partner|frau|mann|familie|paar)).*(kind|alleinerziehend|sohn|tochter)/i },
      { id: "familie", titel: "Mich, Partner:in, Kinder", beschreibung: "mich, meine:n Partner:in und mein(e) Kind(er)", auch: /familie|(partner|frau|mann|paar).*(kind|sohn|tochter)|(kind|sohn|tochter).*(partner|frau|mann)/i },
    ],
    formular: /lebenssituation|familienstand|f(ü|ue)r wen soll/i,
    bekanntWenn: /^(?!unfall:)/i,
  },
  {
    key: "beruf",
    typ: "liste",
    pflicht: true,
    abschnitt: 1,
    wenn: (c) => c.gebucht("rechtsschutz") || unfallFuerMich(c),
    label: "Beruf",
    feld: "beruf",
    frage: T("Wie sind Sie beruflich tätig?", "Wie bist du beruflich tätig?"),
    optionen: BERUF,
    formular: /^beruf|t(ä|a)tigkeit/i,
    bekanntWenn: true,
  },
  {
    key: "taetigkeit",
    typ: "knoepfe",
    pflicht: true,
    abschnitt: 1,
    folge: true,
    wenn: (c) => unfallFuerMich(c) && c.hat(frageId(GEMEINSAM, "beruf"), "oeffentl", "selbst", "gf"),
    label: "Tätigkeit (Unfall)",
    feld: "beruf",
    praefix: "Tätigkeit",
    frage: T("Ist Ihre Arbeit eher im Büro oder körperlich?", "Ist deine Arbeit eher im Büro oder körperlich?"),
    optionen: [
      { id: "kaufm", titel: "Büro", wert: "kaufmännisch & verwaltend", auch: /b(ü|ue)ro|kaufm|verwalt/i },
      { id: "koerperl", titel: "Körperlich", wert: "körperlich & handwerklich", auch: /k(ö|oe)rperlich|handwerk/i },
    ],
  },
  {
    key: "schaeden",
    typ: "knoepfe",
    pflicht: true,
    abschnitt: 1,
    wenn: (c) => c.gebucht(...SCHADEN_SPARTEN),
    label: "Schäden in den letzten 5 Jahren",
    feld: "vorschaeden",
    frage: (c) => {
      const g = (s: string) => c.gebucht(s);
      if (!schadenBuendel(c)) {
        if (g("haftpflicht")) return T("Hatten Sie in den letzten 5 Jahren einen Haftpflichtschaden?", "Hattest du in den letzten 5 Jahren einen Haftpflichtschaden?");
        if (g("hausrat")) return T("Hatten Sie in den letzten 5 Jahren einen Hausratschaden?", "Hattest du in den letzten 5 Jahren einen Hausratschaden?");
        if (g("rechtsschutz")) return T("Gab es in den letzten 5 Jahren einen Rechtsstreit oder eine Rechtsberatung?");
        if (g("wohngebaeude")) return T("Gab es in den letzten 5 Jahren Schäden am Haus?");
        return T("Gab es in den letzten 5 Jahren einen Schaden durch Ihre Tiere?", "Gab es in den letzten 5 Jahren einen Schaden durch deine Tiere?");
      }
      const teile = [g("haftpflicht") && "bei der Haftpflicht", g("hausrat") && "beim Hausrat", g("wohngebaeude") && "am Haus", g("tierhalter") && "durch ein Tier"].filter(Boolean) as string[];
      const schaden = teile.length ? `einen Schaden ${teile.length > 1 ? `${teile.slice(0, -1).join(", ")} oder ${teile.at(-1)}` : teile[0]}` : "";
      const rs = g("rechtsschutz") ? "einen Rechtsstreit bzw. eine Rechtsberatung" : "";
      return T(`Gab es in den letzten 5 Jahren ${[schaden, rs].filter(Boolean).join(", oder ")}?`);
    },
    optionen: [
      { id: "nein", titel: "Nein, nichts", wert: "keine (5 Jahre)", auch: /^(nein|nee|ne|nö|noe|keine?n?|nichts)\b/i },
      { id: "ja", titel: "Ja", wert: "ja", auch: /^(ja|jo|einen|eine|zwei|drei|mehrere|\d)\b/i },
    ],
  },
  schadenAnzahl("haftpflicht", T("Wie viele Haftpflichtschäden waren es?"), "Haftpflicht", "0, wenn keiner.", 4),
  schadenAnzahl("hausrat", T("Wie viele Hausratschäden waren es?"), "Hausrat", "0, wenn keiner.", 4),
  {
    key: "schadenart_hausrat",
    typ: "mehrfach",
    pflicht: true,
    abschnitt: 1,
    folge: true,
    wenn: (c) => c.gebucht("hausrat") && schadenJa(c) && (c.zahl(frageId(GEMEINSAM, "schaeden_hausrat")) ?? 0) >= 1,
    label: "Art der Hausratschäden",
    feld: "vorschaeden",
    praefix: "Hausrat Art",
    frage: T("Was war das für ein Schaden?"),
    optionen: [
      { id: "hausrat", titel: "Hausrat-Schäden", auch: /hausrat|einbruch|wasser|feuer|brand|diebstahl(?!.*rad)/i },
      { id: "fahrrad", titel: "Fahrrad-Diebstahl", auch: /fahrrad|rad\b|bike/i },
      { id: "natur", titel: "Naturgefahren", beschreibung: "Weitere Naturgefahren (Elementar)", auch: /natur|elementar|hochwasser|starkregen|überschwemmung/i },
    ],
  },
  schadenAnzahl("rechtsschutz", T("Wie viele Rechtsstreitigkeiten oder Rechtsberatungen waren es?"), "Rechtsschutz", "0, wenn keine.", 2),
  schadenAnzahl("wohngebaeude", T("Wie viele Schäden am Haus waren es?"), "Wohngebäude", "0, wenn keiner.", 99),
  {
    key: "schadenart_wohngebaeude",
    typ: "mehrfach",
    pflicht: true,
    abschnitt: 1,
    folge: true,
    wenn: (c) => c.gebucht("wohngebaeude") && schadenJa(c) && (c.zahl(frageId(GEMEINSAM, "schaeden_wohngebaeude")) ?? 0) >= 1,
    label: "Art der Schäden am Haus",
    feld: "vorschaeden",
    praefix: "Wohngebäude Art",
    frage: T("Was war das für ein Schaden am Haus?"),
    optionen: [
      { id: "feuer", titel: "Feuer", auch: /feuer|brand|blitz/i },
      { id: "wasser", titel: "Leitungswasser", auch: /wasser|rohr/i },
      { id: "sturm", titel: "Sturm/Hagel", auch: /sturm|hagel/i },
      { id: "natur", titel: "Naturgefahren", beschreibung: "Weitere Naturgefahren (Elementar)", auch: /natur|elementar|hochwasser|starkregen|überschwemmung/i },
    ],
  },
  schadenAnzahl("tierhalter", T("Wie viele Schäden durch Ihre Tiere waren es?", "Wie viele Schäden durch deine Tiere waren es?"), "Tierhalterhaftpflicht", "0, wenn keiner.", 4),
  // Vorverträge im Bündel: eine gemeinsame Frage (Ole, 26.11.2026)
  {
    key: "vorvertraege",
    typ: "text",
    pflicht: false,
    abschnitt: 3,
    ohneNachfrage: true,
    wenn: (c) => vorvertragGemeinsam(c),
    label: "Bisherige Verträge",
    feld: "vorhanden",
    praefix: "Vorverträge",
    frage: (c) => {
      const was = liste(Object.keys(VORVERTRAG).filter((s) => c.sparten.includes(s)).map((s) => VORVERTRAG[s].label));
      const bsp = "Ungefähr reicht, zum Beispiel: Haftpflicht HUK bis 03/2027, Hausrat noch nicht.";
      return T(`Wo sind Sie für ${was} aktuell versichert und bis wann laufen die Verträge? ${bsp}`, `Wo bist du für ${was} aktuell versichert und bis wann laufen die Verträge? ${bsp}`);
    },
    knoepfe: VORVERTRAG_KNOEPFE,
    auswerten: (t, j) => vorvertraegeAuswerten(t, j),
  },
  // Zusatzbausteine: eine Sammelfrage mit den passenden Zeilen
  {
    key: "bausteine",
    typ: "mehrfach",
    pflicht: false,
    abschnitt: 4,
    label: "Zusatzbausteine",
    feld: "sonstiges",
    praefix: "Bausteine",
    frage: T("Soll noch etwas davon ins Angebot?"),
    optionen: [
      { id: "nichts", titel: "Nichts davon", exklusiv: true, wert: "keine" },
      {
        id: "vermiete",
        titel: "Ich vermiete Wohnraum",
        beschreibung: "Wohnung oder Haus",
        auch: /vermiet/i,
        wenn: (c) => c.gebucht("haftpflicht") || (c.gebucht("rechtsschutz") && !rsNurVerkehr(c)),
      },
      { id: "haushaft", titel: "Haus-Haftpflicht", beschreibung: "für vermietete Teile des Hauses", wenn: (c) => c.gebucht("wohngebaeude") && c.hat(frageId("wohngebaeude", "nutzung"), "vermietet") },
      { id: "fahrrad", titel: "Fahrräder", beschreibung: "Fahrradschutz", auch: /fahrr(a|ä)d|e-?bike/i, wenn: (c) => c.gebucht("hausrat") },
      { id: "glas", titel: "Glasschutz", auch: /glas/i, wenn: (c) => c.gebucht("hausrat", "wohngebaeude") },
      { id: "internet", titel: "Internetschutz", auch: /internet|online|cyber/i, wenn: (c) => c.gebucht("hausrat") },
      {
        id: "dienst",
        titel: "Dienst-Haftpflicht",
        beschreibung: "für den öffentlichen Dienst",
        auch: /dienst/i,
        wenn: (c) => c.gebucht("haftpflicht") && (!c.antwort(frageId(GEMEINSAM, "beruf"))?.opt || c.hat(frageId(GEMEINSAM, "beruf"), "oeffentl")),
      },
      {
        id: "oeltank",
        titel: "Öltank-Haftpflicht",
        auch: /(ö|oe)l/i,
        wenn: (c) =>
          (c.gebucht("haftpflicht") && !c.hat(frageId("hausrat", "lage"), "wohnung-eg", "wohnung-og")) || (c.gebucht("wohngebaeude") && c.hat(frageId("wohngebaeude", "heizung"), "oel")),
      },
      {
        id: "straf",
        titel: "Strafrechtsschutz Beruf",
        beschreibung: "Straf-Rechtsschutz im Beruf, für Angestellte",
        auch: /straf/i,
        wenn: (c) => c.gebucht("rechtsschutz") && !c.hat(frageId("rechtsschutz", "bereiche"), "privat-verkehr", "verkehr") && !c.hat(frageId(GEMEINSAM, "beruf"), "selbst", "gf"),
      },
    ],
  },
  {
    key: "vermietung_anzahl",
    typ: "zahl",
    pflicht: false,
    abschnitt: 4,
    folge: true,
    wenn: (c) => c.hat(frageId(GEMEINSAM, "bausteine"), "vermiete") && !c.gebucht("rechtsschutz"),
    label: "Vermietete Wohnungen",
    feld: "sonstiges",
    praefix: "Vermietete Wohnungen",
    frage: T("Wie viele Wohnungen vermieten Sie?", "Wie viele Wohnungen vermietest du?"),
    min: 1,
    max: 50,
    ko: (n) => n > 10,
  },
  {
    key: "vermietung",
    typ: "zusammengesetzt",
    pflicht: false,
    abschnitt: 4,
    folge: true,
    wenn: (c) => c.hat(frageId(GEMEINSAM, "bausteine"), "vermiete") && c.gebucht("rechtsschutz"),
    label: "Vermietung (Wohnungen, Jahresmiete)",
    feld: "sonstiges",
    praefix: "Vermietung",
    frage: T(
      "Wie viele Wohnungen vermieten Sie und wie hoch ist die Bruttojahresmiete insgesamt? Zum Beispiel: 2 Wohnungen, 18.000 €",
      "Wie viele Wohnungen vermietest du und wie hoch ist die Bruttojahresmiete insgesamt? Zum Beispiel: 2 Wohnungen, 18.000 €",
    ),
    teile: [
      { key: "anzahl", label: "Wohnungen", typ: "zahl", min: 1, max: 50, einheit: "Wohnung(en)" },
      { key: "miete", label: "Jahresmiete", typ: "zahl", min: 500, max: 10_000_000, einheit: "€ Bruttojahresmiete", pflicht: false },
    ],
  },
  {
    key: "fahrradwert",
    typ: "zahl",
    pflicht: false,
    abschnitt: 4,
    folge: true,
    wenn: (c) => c.hat(frageId(GEMEINSAM, "bausteine"), "fahrrad"),
    label: "Wert der Fahrräder",
    feld: "sonstiges",
    praefix: "Fahrräder",
    frage: T("Wie viel sind Ihre Fahrräder zusammen ungefähr wert?", "Wie viel sind deine Fahrräder zusammen ungefähr wert?"),
    min: 100,
    max: 100_000,
    einheit: "€",
    ko: (n) => n > 16_000,
  },
  {
    key: "glas",
    typ: "liste",
    pflicht: false,
    abschnitt: 4,
    folge: true,
    wenn: (c) => c.hat(frageId(GEMEINSAM, "bausteine"), "glas") && c.gebucht("hausrat"),
    label: "Glasschutz",
    feld: "sonstiges",
    praefix: "Glas",
    frage: T("Welches Glas soll versichert sein?"),
    optionen: [
      { id: "innen", titel: "Innen", beschreibung: "Glasschutz Hausrat (Innenverglasung)", auch: /innen/i },
      { id: "aussen", titel: "Außen", beschreibung: "Glasschutz Gebäude (Außenverglasung)", auch: /au(ß|ss)en|fenster/i },
      { id: "beides", titel: "Beides", auch: /beide|alles/i },
    ],
  },
  // Adresse einmal am Ende (Hausrat bzw. Wohngebäude), nur wenn die Straße nicht im Formular steht
  {
    key: "adresse",
    typ: "text",
    pflicht: true,
    abschnitt: 5,
    wenn: (c) => c.gebucht("hausrat", "wohngebaeude"),
    label: "Adresse (Straße, Hausnummer)",
    feld: "plz",
    voran: true,
    frage: (c) =>
      c.gebucht("wohngebaeude")
        ? T("Wie lautet die Adresse des Hauses? Straße und Hausnummer reichen.")
        : T("Wie lautet die Adresse Ihrer Wohnung? Straße und Hausnummer reichen.", "Wie lautet die Adresse deiner Wohnung? Straße und Hausnummer reichen."),
    schonBekannt: (c) => /[a-zäöüß]{3,}.*\d/i.test(c.formular(/stra(ß|ss)e|adresse|anschrift|street|address/i) ?? "") || /[a-zäöüß]{3,}\s*\d+\s*[a-z]?\s*,/i.test(c.angabe("plz") ?? ""),
    auswerten: (t) => (/[a-zäöüß]{3,}.*\d/i.test(t) ? { art: "wert", wert: t.slice(0, 120) } : { art: "unklar" }),
    nachfrage: "Straße und Hausnummer",
  },
];

const rsNurVerkehr = (c: Kontext) => c.hat(frageId("rechtsschutz", "bereiche"), "verkehr");
const wgEineEinheit = (c: Kontext) => c.gebucht("wohngebaeude") && c.hat(frageId("wohngebaeude", "einheiten"), "eine");

// ─── Sparten ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const WOHNGEBAEUDE: FrageDef[] = [
  {
    key: "gebaeude",
    typ: "zusammengesetzt",
    pflicht: true,
    label: "Wohnfläche und Baujahr des Hauses",
    feld: "gebaeude",
    praefix: "Größe",
    frage: T("Wie groß ist das Haus und wann wurde es gebaut? Ungefähr reicht. Zum Beispiel: 140 qm, 1985"),
    teile: [
      { key: "flaeche", label: "Wohnfläche", typ: "zahl", min: 20, max: 2000, einheit: "m²" },
      { key: "baujahr", label: "Baujahr", typ: "zahl", min: 1500, max: 2100 },
    ],
  },
  {
    key: "einheiten",
    typ: "liste",
    pflicht: true,
    label: "Wohneinheiten",
    feld: "gebaeude",
    praefix: "Wohneinheiten",
    frage: T("Wie viele Wohneinheiten hat das Haus?"),
    optionen: [
      { id: "eine", titel: "Eine Wohneinheit", wert: "eine", auch: /\b(eine|1|einfamilien)/i },
      { id: "zwei", titel: "Zwei Wohneinheiten", wert: "zwei", auch: /\b(zwei|2|zweifamilien|doppel)/i },
      { id: "drei", titel: "Drei oder mehr", wert: "drei oder mehr", auch: /\b(drei|vier|f(ü|ue)nf|[3-9]|mehr|mehrfamilien)/i, ko: true },
    ],
  },
  {
    key: "nutzung",
    typ: "mehrfach",
    pflicht: true,
    label: "Nutzung des Hauses",
    feld: "gebaeude",
    praefix: "Nutzung",
    frage: T("Wie wird das Haus genutzt? Trifft etwas davon zu?"),
    optionen: [
      { id: "nichts", titel: "Nichts davon", wert: "selbst bewohnt", exklusiv: true },
      { id: "ferien", titel: "Ferien-/Wochenendhaus", auch: /ferien|wochenend/i },
      { id: "vermietet", titel: "Vermietet", beschreibung: "ganz oder teilweise", auch: /vermiet/i },
      { id: "leer", titel: "Leerstehend", beschreibung: "ganz oder teilweise", auch: /leer/i, ko: true },
    ],
  },
  {
    key: "keller",
    typ: "liste",
    pflicht: true,
    label: "Keller",
    feld: "gebaeude",
    praefix: "Keller",
    frage: T("Hat das Haus einen Keller?"),
    optionen: [
      { id: "kein", titel: "Kein Keller", wert: "kein", auch: /^(nein|kein)/i },
      { id: "mit", titel: "Keller mit Wohnfläche", wert: "mit Wohnfläche", auch: /mit wohn|ausgebaut|bewohnt/i },
      { id: "ohne", titel: "Keller ohne Wohnfläche", wert: "ohne Wohnfläche", auch: /ohne wohn|^ja\b|nicht ausgebaut/i },
    ],
  },
  {
    key: "merkmale",
    typ: "mehrfach",
    pflicht: true,
    label: "Bauweise und Merkmale",
    feld: "gebaeude",
    praefix: "Bauweise",
    frage: T("Trifft davon etwas auf Haus oder Grundstück zu?"),
    optionen: [
      { id: "nichts", titel: "Nichts davon", wert: "nichts Besonderes", exklusiv: true },
      { id: "flachdach", titel: "Flachdach", auch: /flachdach/i },
      { id: "weich", titel: "Weiche Bedachung", beschreibung: "Dach aus Naturschiefer, Holz, Ried, Schilf oder Stroh", auch: /reet|ried|stroh|schilf|schiefer|weich/i },
      { id: "holz", titel: "Außenwände aus Holz", beschreibung: "Außenwände überwiegend aus Holz", auch: /holz/i },
      { id: "schwimmbad", titel: "Schwimmbad", auch: /schwimmbad|pool/i },
      {
        id: "denkmal",
        titel: "Denkmalschutz",
        auch: /denkmal/i,
        // Grenze des Rechners unbekannt: bis zur Klärung nur bei Baujahr bis 1950 (bzw. Baujahr unbekannt)
        wenn: (c) => (c.antwort(frageId("wohngebaeude", "gebaeude"))?.teile?.baujahr ?? 0) <= 1950,
      },
    ],
  },
  {
    key: "schwimmbad",
    typ: "knoepfe",
    pflicht: true,
    folge: true,
    wenn: (c) => c.hat(frageId("wohngebaeude", "merkmale"), "schwimmbad"),
    label: "Lage des Schwimmbads",
    feld: "gebaeude",
    praefix: "Schwimmbad",
    frage: T("Wo ist das Schwimmbad?"),
    optionen: [
      { id: "innen", titel: "Im Gebäude", auch: /im (geb(ä|a)ude|haus)|innen|drinnen/i },
      { id: "aussen", titel: "Außerhalb", wert: "außerhalb des Gebäudes", auch: /au(ß|ss)en|drau(ß|ss)en|garten/i },
    ],
  },
  {
    key: "heizung",
    typ: "mehrfach",
    pflicht: true,
    label: "Heizung",
    feld: "gebaeude",
    praefix: "Heizung",
    frage: T("Wie wird das Haus geheizt?"),
    optionen: [
      { id: "gas", titel: "Gasheizung", auch: /\bgas/i },
      { id: "oel", titel: "Ölheizung", auch: /(ö|oe)l/i },
      { id: "fern", titel: "Fern-/Nahwärme", auch: /fernw|nahw|fernheiz/i },
      { id: "pellet", titel: "Pellet-/Holzheizung", auch: /pellet|holz|kamin/i },
      { id: "wp", titel: "Wärmepumpenanlage", auch: /w(ä|ae)rmepumpe/i },
      { id: "keine", titel: "Keine davon", wert: "andere", exklusiv: true },
    ],
  },
  {
    key: "solar",
    typ: "liste",
    pflicht: true,
    label: "Solar und Photovoltaik",
    feld: "gebaeude",
    praefix: "Solar",
    frage: T("Gibt es eine Solar- oder Photovoltaikanlage?"),
    optionen: [
      { id: "nein", titel: "Nein", auch: /^(nein|nee|keine?)\b/i },
      { id: "pv", titel: "Photovoltaikanlage", auch: /^(?!.*(thermi|beide)).*(photovoltaik|\bpv\b|strom)/i },
      { id: "thermie", titel: "Solarthermische Anlage", beschreibung: "Solarthermische Anlagen", auch: /^(?!.*(photovoltaik|\bpv\b|beide)).*(thermi|warmwasser)/i },
      { id: "beides", titel: "Beides", auch: /beide/i },
    ],
  },
  {
    key: "neben",
    typ: "knoepfe",
    pflicht: true,
    label: "Weitere Gebäude",
    feld: "gebaeude",
    praefix: "Nebengebäude",
    frage: T("Gibt es weitere Gebäude auf dem Grundstück? Garagen und Carports zählen nicht."),
    optionen: NEIN_JA,
  },
  {
    key: "nebenflaeche",
    typ: "liste",
    pflicht: true,
    folge: true,
    wenn: (c) => c.hat(frageId("wohngebaeude", "neben"), "ja"),
    label: "Fläche der Nebengebäude",
    feld: "gebaeude",
    praefix: "Nebengebäude Fläche",
    frage: T("Wie groß sind die weiteren Gebäude zusammen?"),
    optionen: [
      { id: "bis25", titel: "1 bis 25 m²" },
      { id: "bis50", titel: "26 bis 50 m²" },
      { id: "bis100", titel: "51 bis 100 m²" },
      { id: "ueber100", titel: "Größer als 100 m²", auch: /gr(ö|oe)(ß|ss)er|über|mehr/i },
    ],
  },
  vorvertrag("wohngebaeude", T(`Ist das Haus schon versichert? Wenn ja: bei welcher Gesellschaft und bis wann läuft der Vertrag? ${BEISPIEL}`)),
  {
    key: "vorversicherung",
    typ: "knoepfe",
    pflicht: true,
    abschnitt: 3,
    folge: true,
    wenn: (c) => {
      if (!vorvertragGemeinsam(c)) return c.hat(frageId("wohngebaeude", "vorvertrag"), "nein");
      const a = c.antwort(frageId(GEMEINSAM, "vorvertraege"));
      return !!a && (!!a.opt?.includes("nein") || !/\bhaus\b|geb(ä|a)ude|\balles?\b/i.test(a.wert));
    },
    label: "Vorversicherung 5 Jahre (Haus)",
    feld: "gebaeude",
    praefix: "Vorversichert 5 Jahre",
    frage: T("War das Haus in den letzten 5 Jahren versichert?"),
    optionen: [
      { id: "ja", titel: "Ja", auch: /^(ja|jo|genau)\b/i },
      { id: "nein", titel: "Nein", auch: /^(nein|nee|ne|nicht)\b/i },
    ],
  },
];

const HAUSRAT: FrageDef[] = [
  {
    key: "lage",
    typ: "liste",
    pflicht: true,
    label: "Wohnsituation",
    feld: "wohnflaeche",
    praefix: "Lage",
    frage: T("Wie wohnen Sie?", "Wie wohnst du?"),
    optionen: [
      { id: "wohnung-eg", titel: "Wohnung, EG oder Keller", beschreibung: "Mehrfamilienhaus, Erdgeschoss oder Keller", auch: /erdgeschoss|\beg\b|parterre|souterrain|keller/i },
      { id: "wohnung-og", titel: "Wohnung ab 1. Stock", beschreibung: "Mehrfamilienhaus, 1. Stock oder höher", auch: /stock|\bog\b|etage|obergeschoss|dachgeschoss/i },
      { id: "haus-eigen", titel: "Haus, Eigentum", beschreibung: "Einfamilienhaus als Eigentum", auch: /^(?!.*miet).*(eigen|einfamilienhaus|\bhaus\b)/i },
      { id: "haus-miete", titel: "Haus, zur Miete", beschreibung: "Einfamilienhaus zur Miete", auch: /haus.*miet|miet.*haus/i },
      { id: "nicht-staendig", titel: "Nicht ständig bewohnt", beschreibung: "z. B. Ferien- oder Zweitwohnung", auch: /ferien|zweitwohnung|nicht st(ä|a)ndig/i, ko: true },
    ],
    // Wohngebäude mit einer Wohneinheit: das Haus ist die Wohnung
    abgeleitet: (c) => (wgEineEinheit(c) ? { wert: "Haus, Eigentum", opt: ["haus-eigen"] } : null),
  },
  {
    key: "flaeche",
    typ: "zahl",
    pflicht: true,
    label: "Wohnfläche",
    feld: "wohnflaeche",
    praefix: "Fläche",
    frage: T("Wie groß ist Ihre Wohnung ungefähr? Zum Beispiel 75 qm.", "Wie groß ist deine Wohnung ungefähr? Zum Beispiel 75 qm."),
    min: 10,
    max: 1000,
    einheit: "m²",
    ko: (n) => n > 300,
    formular: /wohnfl(ä|a)che/i,
    bekanntWenn: /\d+\s*(m²|m2|qm|quadrat)/i,
    abgeleitet: (c) => {
      const m = wgEineEinheit(c) ? c.antwort(frageId("wohngebaeude", "gebaeude"))?.teile?.flaeche : undefined;
      return m ? { wert: `${m} m²` } : null;
    },
  },
];

const RECHTSSCHUTZ: FrageDef[] = [
  {
    key: "bereiche",
    typ: "liste",
    pflicht: true,
    label: "Lebensbereiche",
    feld: "bereiche",
    frage: T("Welche Lebensbereiche sollen versichert sein?"),
    optionen: [
      { id: "alle", titel: "Alle vier Bereiche", beschreibung: "Privat, Beruf, Verkehr und Wohnen", wert: "Privat, Beruf, Verkehr und Wohnen", auch: /\balle\b|komplett|privat.*beruf.*verkehr.*wohnen/i },
      { id: "ohne-wohnen", titel: "Ohne Wohnen", beschreibung: "Privat, Beruf und Verkehr", wert: "Privat, Beruf und Verkehr", auch: /ohne wohnen|privat.*beruf.*verkehr(?!.*wohnen)/i },
      { id: "privat-verkehr", titel: "Privat und Verkehr", auch: /^privat (und|&|\+) verkehr$/i },
      { id: "verkehr", titel: "Nur Verkehr", beschreibung: "ausschließlich Verkehr", wert: "nur Verkehr", auch: /nur verkehr|ausschlie(ß|ss)lich verkehr/i },
    ],
    bekanntWenn: true,
  },
  {
    key: "fahrzeuge",
    typ: "liste",
    pflicht: false,
    folge: true,
    wenn: (c) => rsNurVerkehr(c),
    label: "Fahrzeuge (Verkehrs-Rechtsschutz)",
    feld: "bereiche",
    praefix: "Fahrzeuge",
    frage: T("Für wie viele Fahrzeuge?"),
    optionen: [
      { id: "kein", titel: "Kein Fahrzeug", auch: /^(kein|keins|0)\b/i },
      { id: "ein", titel: "Ein Fahrzeug", auch: /^(ein|eins|1)\b/i },
      { id: "alle", titel: "Alle meine Fahrzeuge", auch: /alle|mehrere/i },
    ],
  },
  {
    key: "fahrzeugart",
    typ: "liste",
    pflicht: false,
    folge: true,
    wenn: (c) => c.hat(frageId("rechtsschutz", "fahrzeuge"), "ein"),
    label: "Art des Fahrzeugs",
    feld: "bereiche",
    praefix: "Fahrzeug",
    frage: T("Was für ein Fahrzeug ist es?"),
    optionen: [
      { id: "pkw", titel: "PKW", auch: /pkw|auto|wagen/i },
      { id: "kraftrad", titel: "Kraftrad", auch: /motorrad|kraftrad|roller/i },
      { id: "wohnmobil", titel: "Wohnmobil", auch: /wohnmobil|camper/i },
    ],
  },
];

const UNFALL: FrageDef[] = [
  {
    key: "fuer",
    typ: "mehrfach",
    pflicht: true,
    abschnitt: 0,
    label: "Unfallschutz für",
    feld: "versichern",
    praefix: "Unfall",
    frage: T("Für wen soll der Unfallschutz sein?"),
    optionen: [
      { id: "ich", titel: "Für mich", wert: "mich selbst", auch: /\b(mich|ich|selbst)\b/i },
      { id: "partner", titel: "Partner:in", auch: /partner|frau|mann/i },
      { id: "kinder", titel: "Kind(er)", auch: /kind|sohn|tochter/i },
    ],
  },
  {
    key: "kinder",
    typ: "zahl",
    pflicht: true,
    abschnitt: 0,
    folge: true,
    wenn: (c) => c.hat(frageId("unfall", "fuer"), "kinder"),
    label: "Anzahl Kinder (Unfall)",
    feld: "kinder",
    praefix: "Unfall Kinder",
    frage: T("Für wie viele Kinder?"),
    min: 1,
    max: 9,
  },
  {
    key: "partnerGeburt",
    typ: "datum",
    pflicht: true,
    wenn: (c) => c.hat(frageId("unfall", "fuer"), "partner"),
    label: "Geburtsdatum Partner:in (Unfall)",
    feld: "sonstiges",
    praefix: "Partner:in geboren",
    frage: T("Wann ist Ihre Partnerin bzw. Ihr Partner geboren? Zum Beispiel 15.03.1985.", "Wann ist deine Partnerin bzw. dein Partner geboren? Zum Beispiel 15.03.1985."),
  },
  {
    key: "partnerBeruf",
    typ: "liste",
    pflicht: true,
    wenn: (c) => c.hat(frageId("unfall", "fuer"), "partner"),
    label: "Beruf Partner:in (Unfall)",
    feld: "beruf",
    praefix: "Partner:in",
    frage: T("Und wie ist Ihre Partnerin bzw. Ihr Partner beruflich tätig?", "Und wie ist deine Partnerin bzw. dein Partner beruflich tätig?"),
    optionen: BERUF,
  },
  {
    key: "kindGeburt",
    typ: "datum",
    pflicht: true,
    wenn: (c) => c.hat(frageId("unfall", "fuer"), "kinder"),
    gruppe: { name: "kind", anzahl: (c) => c.zahl(frageId("unfall", "kinder")) ?? 1 },
    label: (c) => `Geburtsdatum Kind ${c.i} (Unfall)`,
    feld: "kinder",
    praefix: (c) => `Kind ${c.i} geboren`,
    frage: (c) => {
      const n = c.zahl(frageId("unfall", "kinder")) ?? 1;
      if (n <= 1) return T("Wann ist Ihr Kind geboren? Zum Beispiel 15.03.2016.", "Wann ist dein Kind geboren? Zum Beispiel 15.03.2016.");
      const ord = `${ORDNUNG[c.i - 1] ?? `${c.i}.`}es`;
      return c.i === 1 ? T(`Wann ist Ihr ${ord} Kind geboren? Zum Beispiel 15.03.2016.`, `Wann ist dein ${ord} Kind geboren? Zum Beispiel 15.03.2016.`) : T(`Und Ihr ${ord} Kind: Wann ist es geboren?`, `Und dein ${ord} Kind: Wann ist es geboren?`);
    },
  },
];

/** Tierart (Tierkranken bzw. Tierhalterhaftpflicht), Optionen in Rechner-Reihenfolge. */
const TIERART_TK: Option[] = [
  { id: "hund", titel: "Ein Hund", wert: "Hund", auch: /\bhund\b/i },
  { id: "hunde", titel: "Mehrere Hunde", wert: "Hunde", auch: /\bhunde\b/i },
  { id: "katze", titel: "Eine Katze", wert: "Katze", auch: /\b(katze|kater)\b/i },
  { id: "katzen", titel: "Mehrere Katzen", wert: "Katzen", auch: /\bkatzen\b/i },
  { id: "pferd", titel: "Ein Pferd", wert: "Pferd", auch: /\bpferd\b/i },
  { id: "pferde", titel: "Mehrere Pferde", wert: "Pferde", auch: /\bpferde\b/i },
];

const tierAnzahl = (sparte: string): FrageDef => ({
  key: "anzahl",
  typ: "zahl",
  pflicht: true,
  folge: true,
  wenn: (c) => c.hat(frageId(sparte, "tierart"), "hunde", "katzen", "pferde"),
  label: "Anzahl der Tiere",
  feld: "tier",
  praefix: "Anzahl",
  frage: (c) => T(`Wie viele ${ART[tier(c).art ?? "tier"].plural} sind es?`),
  min: 2,
  max: 20,
  ko: (n) => n > 10,
  formular: /anzahl tiere|anzahl (katzen|hunde|pferde)/i,
});

const TK_GRUPPE = { name: "tier", anzahl: (c: Kontext) => tier(c).n };

const TIERKRANKEN: FrageDef[] = [
  {
    key: "tierart",
    typ: "liste",
    pflicht: true,
    label: "Tierart",
    feld: "tier",
    praefix: "Tierart",
    frage: T("Für welches Tier ist die Versicherung?"),
    optionen: TIERART_TK,
    formular: /tierart/i,
    bekanntWenn: /\b(hunde?|katzen?|kater|pferde?)\b/i,
  },
  tierAnzahl("tierkranken"),
  {
    key: "name",
    typ: "text",
    pflicht: true,
    gruppe: TK_GRUPPE,
    label: (c) => `Name (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Name"),
    frage: (c) => {
      const r = tierRef(c, { name: false });
      const pron = ART[tier(c).art ?? "tier"].pron;
      return c.i > 1 ? T(`Und ${r.sie}: Wie heißt ${pron}?`, `Und ${r.du}: Wie heißt ${pron}?`) : T(`Wie heißt ${r.sie}?`, `Wie heißt ${r.du}?`);
    },
    formular: /tiername|name des tieres|name (der katze|des hundes|des pferdes)/i,
  },
  {
    key: "geschlecht",
    typ: "knoepfe",
    pflicht: true,
    gruppe: TK_GRUPPE,
    label: (c) => `Geschlecht (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Geschlecht"),
    frage: (c) => {
      const r = tierRef(c);
      return T(`Ist ${r.sie} männlich oder weiblich?`, `Ist ${r.du} männlich oder weiblich?`);
    },
    optionen: [
      { id: "m", titel: "Männlich", auch: /m(ä|ae)nnlich|r(ü|ue)de|kater|hengst|wallach|\bmann/i },
      { id: "w", titel: "Weiblich", auch: /weiblich|h(ü|ue)ndin|katze|stute|\bweib/i },
    ],
    formular: /geschlecht/i,
  },
  {
    key: "geburt",
    typ: "datum",
    pflicht: true,
    gruppe: TK_GRUPPE,
    label: (c) => `Geburtsdatum (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Geboren"),
    frage: (c) => {
      const r = tierRef(c);
      return T(`Wann ist ${r.sie} geboren? Zum Beispiel 15.03.2021.`, `Wann ist ${r.du} geboren? Zum Beispiel 15.03.2021.`);
    },
    formular: /geburt.*(tier|hund|katze|pferd)|geburtsjahr|geburtsmonat/i,
  },
  {
    key: "rasse",
    typ: "text",
    pflicht: true,
    gruppe: TK_GRUPPE,
    label: (c) => `Rasse (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Rasse"),
    frage: (c) => {
      const hund = istHund(c);
      const zusatzSie = hund ? " Bei Mischlingen schreiben Sie einfach „Mischling“." : "";
      const zusatzDu = hund ? " Bei Mischlingen schreib einfach „Mischling“." : "";
      const r = tierRef(c);
      return T(`Welche Rasse hat ${r.sie}?${zusatzSie}`, `Welche Rasse hat ${r.du}?${zusatzDu}`);
    },
    formular: /rasse/i,
  },
  {
    key: "mutter",
    typ: "text",
    pflicht: true,
    folge: true,
    gruppe: TK_GRUPPE,
    wenn: (c) => istHund(c) && /mischling/i.test(c.antwort(c.id("rasse"))?.wert ?? ""),
    label: (c) => `Rasse der Mutter (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Mutter"),
    frage: T("Welche Rasse hat die Mutter? Wenn Sie es nicht wissen, schreiben Sie einfach „unbekannt“.", "Welche Rasse hat die Mutter? Wenn du es nicht weißt, schreib einfach „unbekannt“."),
  },
  {
    key: "schulterhoehe",
    typ: "knoepfe",
    pflicht: true,
    folge: true,
    gruppe: TK_GRUPPE,
    wenn: (c) => istHund(c) && /unbekannt|wei(ß|ss) (ich )?nicht/i.test(`${c.antwort(c.id("rasse"))?.wert ?? ""} ${c.antwort(c.id("mutter"))?.wert ?? ""}`),
    label: (c) => `Schulterhöhe (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Schulterhöhe"),
    frage: (c) => {
      const r = tierRef(c);
      return T(`Wie groß wird ${r.sie} ausgewachsen (Schulterhöhe)?`, `Wie groß wird ${r.du} ausgewachsen (Schulterhöhe)?`);
    },
    optionen: [
      { id: "klein", titel: "0 bis 44 cm", auch: /klein|\b([0-9]|[1-3][0-9]|4[0-4])\s*cm/i },
      { id: "gross", titel: "45 bis 120 cm", auch: /gro(ß|ss)|\b(4[5-9]|[5-9][0-9]|1[01][0-9]|120)\s*cm/i },
    ],
  },
  {
    key: "haltung",
    typ: "knoepfe",
    pflicht: true,
    gruppe: TK_GRUPPE,
    wenn: (c) => tier(c).art === "katze",
    label: (c) => `Haltung (Tier ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Haltung"),
    frage: (c) => {
      const r = tierRef(c);
      return T(`Wie lebt ${r.sie}?`, `Wie lebt ${r.du}?`);
    },
    optionen: [
      { id: "wohnung", titel: "Nur in der Wohnung", beschreibung: "ausschließlich in der Wohnung", wert: "Wohnungskatze", auch: /wohnung|drinnen|indoor|wohnungskatze/i },
      { id: "freigaenger", titel: "Freigänger", auch: /frei|drau(ß|ss)en|outdoor/i },
    ],
    formular: /haltung/i,
  },
  {
    key: "gesundheit",
    typ: "knoepfe",
    pflicht: true,
    gruppe: TK_GRUPPE,
    label: (c) => `Gesundheit 24 Monate (Tier ${c.i})`,
    feld: "tiergesundheit",
    praefix: (c) => (c.i > 1 ? `Tier ${c.i}` : "Tier"),
    frage: (c) => {
      const r = tierRef(c);
      const f = "in den letzten 24 Monaten Krankheiten, Fehlentwicklungen, Symptome, Diagnosen oder Befunde, Unfallfolgen, Beeinträchtigungen oder Verhaltensauffälligkeiten?";
      return T(`Hat oder hatte ${r.sie} ${f}`, `Hat oder hatte ${r.du} ${f}`);
    },
    optionen: [
      { id: "nein", titel: "Nein", wert: "gesund", auch: /^(nein|nee|ne|nö|noe|gesund|nichts|keine?)\b/i },
      { id: "ja", titel: "Ja", wert: "ja", auch: /^(ja|jo|genau)\b/i },
    ],
  },
  {
    key: "bereiche",
    typ: "mehrfach",
    pflicht: true,
    folge: true,
    gruppe: TK_GRUPPE,
    wenn: (c) => c.hat(c.id("gesundheit"), "ja"),
    label: (c) => `Betroffene Bereiche (Tier ${c.i})`,
    feld: "tiergesundheit",
    praefix: (c) => (c.i > 1 ? `Tier ${c.i} Bereiche` : "Bereiche"),
    frage: T("Welche Bereiche waren betroffen?"),
    optionen: [
      { id: "augen", titel: "Augen", auch: /auge/i },
      { id: "ohren", titel: "Ohren", auch: /ohr/i },
      { id: "zaehne", titel: "Maulhöhle und Zähne", auch: /zahn|z(ä|ae)hne|maul|gebiss/i },
      { id: "bewegung", titel: "Bewegungsapparat", auch: /gelenk|knochen|h(ü|ue)fte|bein|bewegung|lahm|kreuzband/i },
      { id: "haut", titel: "Haut und Fell", auch: /haut|fell|allergie|juck/i },
      { id: "atmung", titel: "Atmungsorgane", auch: /atem|atmung|lunge|husten/i },
      { id: "herz", titel: "Herz-Kreislauf-System", auch: /herz|kreislauf/i },
      { id: "leber", titel: "Leber", auch: /leber/i },
      { id: "weitere", titel: "Weitere Bereiche", auch: /magen|darm|verdauung|niere|blase|harn|hormon|schilddr|infekt|nerv|epilep|verhalten|sonstig|geschlecht/i },
    ],
  },
  {
    key: "bereiche2",
    typ: "mehrfach",
    pflicht: true,
    folge: true,
    gruppe: TK_GRUPPE,
    wenn: (c) => c.hat(c.id("bereiche"), "weitere"),
    label: (c) => `Weitere Bereiche (Tier ${c.i})`,
    feld: "tiergesundheit",
    praefix: (c) => (c.i > 1 ? `Tier ${c.i} weitere Bereiche` : "Weitere Bereiche"),
    frage: T("Und welche weiteren Bereiche?"),
    optionen: [
      { id: "verdauung", titel: "Verdauungsorgane", auch: /magen|darm|verdauung/i },
      { id: "geschlecht", titel: "Geschlechtsorgane", auch: /geschlecht|geb(ä|a)rmutter|hoden/i },
      { id: "hormon", titel: "Hormondrüsen", auch: /hormon|schilddr/i },
      { id: "harn", titel: "Harnorgane", auch: /niere|blase|harn/i },
      { id: "infekt", titel: "Infektionskrankheiten", auch: /infekt/i },
      { id: "nerven", titel: "Nervensystem", auch: /nerv|epilep/i },
      { id: "verhalten", titel: "Verhalten", beschreibung: "Verhaltensauffälligkeiten", auch: /verhalten/i },
      { id: "sonstiges", titel: "Sonstiges", auch: /sonstig|anderes/i },
    ],
  },
  // OP-Schutz oder Vollschutz bleibt (Ole, 26.11.2026), eine Frage für alle Tiere
  {
    key: "schutz",
    typ: "knoepfe",
    pflicht: true,
    label: "OP-Schutz oder Vollschutz",
    feld: "tarifwunsch",
    frage: T("Welcher Schutz soll es sein? OP-Schutz zahlt Operationen, Vollschutz auch Behandlungen beim Tierarzt."),
    optionen: [
      { id: "op", titel: "OP-Schutz", wert: "nur OP-Schutz", auch: /\bop\b|operation/i },
      { id: "voll", titel: "Vollschutz", wert: "Vollschutz (Krankenversicherung)", auch: /voll|kranken|alles|komplett|behandlung/i },
    ],
    bekanntWenn: /\bop\b|voll|kranken/i,
  },
  vorvertrag("tierkranken"),
];

const THV_GRUPPE = { name: "thv", anzahl: (c: Kontext) => tier(c).n };

const TIERHALTER: FrageDef[] = [
  {
    key: "tierart",
    typ: "liste",
    pflicht: true,
    wenn: (c) => !c.gebucht("tierkranken"),
    label: "Tierart (Tierhalterhaftpflicht)",
    feld: "tier",
    praefix: "Tierart",
    frage: T("Welche Tiere sollen versichert sein?"),
    optionen: TIERART_TK.filter((o) => !o.id.startsWith("katze")),
    formular: /tierart/i,
    bekanntWenn: /\b(hunde?|pferde?)\b/i,
  },
  { ...tierAnzahl("tierhalter"), wenn: (c) => !c.gebucht("tierkranken") && c.hat(frageId("tierhalter", "tierart"), "hunde", "pferde") },
  {
    key: "rasse",
    typ: "text",
    pflicht: true,
    gruppe: THV_GRUPPE,
    wenn: (c) => !c.gebucht("tierkranken") && istHund(c),
    label: (c) => `Hunderasse (Hund ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Rasse"),
    frage: (c) =>
      tierFrage(
        c,
        (r) => T(`Welche Rasse hat ${r.sie}? Bei Mischlingen schreiben Sie einfach „Mischling“.`, `Welche Rasse hat ${r.du}? Bei Mischlingen schreib einfach „Mischling“.`),
        (p) => T(`Welche Rasse hat ${p}?`),
      ),
    formular: /rasse/i,
  },
  {
    key: "mischling",
    typ: "knoepfe",
    pflicht: true,
    folge: true,
    gruppe: THV_GRUPPE,
    wenn: (c) => istHund(c) && /mischling/i.test(c.antwort(frageId(tier(c).sparte, "rasse", c.i))?.wert ?? ""),
    label: (c) => `Größe Mischling (Hund ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Mischling"),
    frage: (c) => {
      const r = tierRef(c);
      return T(`Wie groß ist ${r.sie} (Widerristhöhe)?`, `Wie groß ist ${r.du} (Widerristhöhe)?`);
    },
    optionen: [
      { id: "klein", titel: "Bis 45 cm", wert: "klein (bis 45 cm)", auch: /klein|bis 45/i },
      { id: "gross", titel: "Ab 45 cm", wert: "groß (ab 45 cm)", auch: /gro(ß|ss)|ab 45|über 45/i },
    ],
  },
  {
    key: "stockmass",
    typ: "knoepfe",
    pflicht: true,
    gruppe: THV_GRUPPE,
    wenn: (c) => tier(c).art === "pferd",
    label: (c) => `Stockmaß (Pferd ${c.i})`,
    feld: "tier",
    praefix: tierPraefix("Stockmaß"),
    frage: (c) =>
      tierFrage(
        c,
        (r) => T(`Wie groß ist ${r.sie} (Stockmaß)?`, `Wie groß ist ${r.du} (Stockmaß)?`),
        (p) => T(`Wie groß ist ${p} (Stockmaß)?`),
      ),
    optionen: [
      { id: "klein", titel: "Bis 148 cm", auch: /bis 148|klein|pony/i },
      { id: "gross", titel: "Über 148 cm", auch: /(ü|ue)ber 148|gro(ß|ss)/i },
    ],
  },
  vorvertrag("tierhalter"),
];

/** Definitionen in fester Reihenfolge: gemeinsam, Wohngebäude vor Hausrat (liefert Wohnsituation und Fläche), … */
export const SPARTEN_DEFINITIONEN: SparteDef[] = [
  { sparte: GEMEINSAM, label: "Allgemein", vorlaeufig: false, fragen: GEMEINSAME_FRAGEN },
  { sparte: "wohngebaeude", label: "Wohngebäude", vorlaeufig: false, fragen: WOHNGEBAEUDE },
  { sparte: "hausrat", label: "Hausrat", vorlaeufig: false, fragen: [...HAUSRAT, vorvertrag("hausrat")] },
  { sparte: "haftpflicht", label: "Haftpflicht", vorlaeufig: false, fragen: [vorvertrag("haftpflicht")] },
  { sparte: "rechtsschutz", label: "Rechtsschutz", vorlaeufig: false, fragen: [...RECHTSSCHUTZ, vorvertrag("rechtsschutz")] },
  { sparte: "unfall", label: "Unfall", vorlaeufig: false, fragen: [...UNFALL, vorvertrag("unfall")] },
  { sparte: "tierkranken", label: "Tierkranken", vorlaeufig: false, fragen: TIERKRANKEN },
  { sparte: "tierhalter", label: "Tierhalterhaftpflicht", vorlaeufig: false, fragen: TIERHALTER },
  // Kfz: keine Rechnerdaten, nur die Vorvertragsfrage (Fahrzeug, SF-Klasse usw. im Termin bzw. per Foto)
  {
    sparte: "kfz",
    label: "Kfz",
    vorlaeufig: false,
    fragen: [vorvertrag("kfz", T("Wo ist Ihr Fahrzeug aktuell versichert und bis wann läuft der Vertrag? Ungefähr reicht, zum Beispiel: HUK bis 12/2026.", "Wo ist dein Fahrzeug aktuell versichert und bis wann läuft der Vertrag? Ungefähr reicht, zum Beispiel: HUK bis 12/2026."))],
  },
];

/** Sparten der Rechner (lib/preise/rechner-angaben.ts) → Sparten der Engine (Tierkranken- und Halter-Varianten zusammen). */
export function engineSparten(rechner: readonly string[]): string[] {
  return [...new Set(rechner.map((s) => (/-(kranken|op)$/.test(s) ? "tierkranken" : s.startsWith("tierhalter") ? "tierhalter" : s)))];
}

/** Bündel gewünscht (Privatschutz, Ole 26.11.2026): mindestens zwei Privatschutz-Sparten gebucht. */
export function buendelGewuenscht(sparten: readonly string[]): boolean {
  return sparten.filter((s) => (PRIVATSCHUTZ as readonly string[]).includes(s)).length >= 2;
}

/**
 * Schalter der Engine (Ole, 26.11.2026: sofort live, Schalter bleibt zum Abschalten): VORBEREITUNG_FRAGEN leer bzw. „1“
 * = an, „0“ = aus, sonst eine Liste von Kunden-IDs (nur für diese an).
 */
export function fragenAktiv(customerId?: string | null, env: string | undefined = process.env.VORBEREITUNG_FRAGEN): boolean {
  const v = (env ?? "").trim().toLowerCase();
  if (!v || v === "1" || v === "an" || v === "true") return true;
  if (v === "0" || v === "aus" || v === "false") return false;
  return !!customerId && v.split(/[\s,;]+/).includes(customerId.toLowerCase());
}

/** Vorläufige Definitionen zulassen? Nur mit Schalter (Tests, Testkunde), sonst nur endgültige. */
export function vorlaeufigeErlaubt(env: string | undefined = process.env.VORBEREITUNG_FRAGEN_VORLAEUFIG): boolean {
  return env === "1";
}

/** Definitionen, die im Chat gefragt werden (Engine aus: keine; vorläufige nur mit Schalter). */
export function aktiveSparten(defs: readonly SparteDef[] = SPARTEN_DEFINITIONEN, vorlaeufig = vorlaeufigeErlaubt(), aktiv = fragenAktiv()): SparteDef[] {
  if (!aktiv) return [];
  return defs.filter((d) => vorlaeufig || !d.vorlaeufig);
}
