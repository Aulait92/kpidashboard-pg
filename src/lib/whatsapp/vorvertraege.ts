// Bestehende Verträge des Leads (Komplettcheck, Ole 17.11.2026): Sagt der Lead nach der Buchung „Ja, gern“ zum
// Komplettcheck, fragt der Assistent, welche Versicherungen er schon hat. Die freie Antwort wird tolerant in eine
// Liste je Sparte gebracht (Sparte, Gesellschaft falls genannt, für wen falls genannt) und am Lead gespeichert
// (Lead.vorvertraege). Anzeige in der Terminvorbereitung und im Kontakt als „Bestehende Verträge“ mit
// „noch nicht genannt: …“ gegenüber den gängigen Sparten der Lebenssituation (neutral, keine Empfehlung).
// Keine Gesundheitsangaben: gespeichert werden nur Sparte, Gesellschaft, Tarifname und Person. Rein, ohne Datenbank.

/** Sparten in der Reihenfolge der Anzeige. */
export const VERTRAG_SPARTEN = [
  "Haftpflicht",
  "Hausrat",
  "Wohngebäude",
  "Rechtsschutz",
  "Unfall",
  "Berufsunfähigkeit",
  "Risikoleben",
  "Altersvorsorge",
  "Kfz",
  "Krankenzusatz",
  "Zahnzusatz",
  "Private Krankenversicherung",
  "Pflege",
  "Tierhalterhaftpflicht",
  "Tierkranken",
  "Sonstige",
] as const;
export type VertragSparte = (typeof VERTRAG_SPARTEN)[number];

/** tarif: Tarifname, nur wenn der Lead ihn nennt (Vergleich bisheriger Vertrag, Paket P3b, lib/bisheriger-vertrag.ts) */
export type Vorvertrag = { sparte: VertragSparte; gesellschaft?: string | null; fuer?: string | null; tarif?: string | null };

/** Gespeichert am Lead (Lead.vorvertraege). keine = Lead sagt, er habe keine; liste leer und keine false = nichts erkannt. */
export type Vorvertraege = { at: string; liste: Vorvertrag[]; keine?: boolean };

// Erkennung je Sparte (Reihenfolge wichtig: Tierhalter vor Haftpflicht, Zahn vor Kranken)
const MUSTER: [RegExp, VertragSparte][] = [
  [/tierhalter|hundehaftpflicht|pferdehaftpflicht|hunde-?haftpflicht/i, "Tierhalterhaftpflicht"],
  [/tierkranken|tier-?op|katzenversicherung|hundekranken|tierversicherung/i, "Tierkranken"],
  [/zahn/i, "Zahnzusatz"],
  [/\bpkv\b|private?n? kranken|krankenvoll|privat krankenversichert/i, "Private Krankenversicherung"],
  [/kranken-?zusatz|zusatzversicherung|krankenhauszusatz|brille|heilpraktiker|ambulant|station(ä|a)r/i, "Krankenzusatz"],
  [/pflege/i, "Pflege"],
  [/haftpflicht|\bphv\b/i, "Haftpflicht"],
  [/hausrat/i, "Hausrat"],
  [/wohngeb(ä|a)ude|geb(ä|a)udeversicherung|feuerversicherung/i, "Wohngebäude"],
  [/rechtsschutz/i, "Rechtsschutz"],
  [/unfall/i, "Unfall"],
  [/berufsunf(ä|a)hig|\bbu\b|erwerbsunf(ä|a)hig|grundf(ä|a)higkeit/i, "Berufsunfähigkeit"],
  [/risikoleben|lebensversicherung|\brlv\b|sterbegeld/i, "Risikoleben"],
  [/altersvorsorge|rente|riester|r(ü|u)rup|bav\b|betriebliche|pensionskasse|direktversicherung|fondspolice|bauspar|sparplan/i, "Altersvorsorge"],
  [/\bkfz\b|\bauto|kasko|motorrad|fahrzeug|\bpkw\b/i, "Kfz"],
];

/** Sparte aus einem freien Wort („Privathaftpflicht“, „BU“, „Autoversicherung“); null = nicht erkannt. */
export function sparteAus(text: string | null | undefined): VertragSparte | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const exakt = VERTRAG_SPARTEN.find((s) => s.toLowerCase() === t.toLowerCase());
  if (exakt) return exakt;
  return MUSTER.find(([re]) => re.test(t))?.[1] ?? null;
}

const kurz = (s: unknown, max = 40): string | null => {
  if (typeof s !== "string") return null;
  const t = s.replace(/\s+/g, " ").trim().replace(/[.,;:!]+$/, "");
  if (!t || /^(-|keine?|unbekannt|k\.? ?a\.?|null|n\/a)$/i.test(t)) return null;
  return t.slice(0, max);
};

/**
 * Liste aus der KI-Extraktion (oder von Hand) aufräumen: Sparte auf die feste Liste abbilden, Gesellschaft und Person
 * kürzen, doppelte (gleiche Sparte, Gesellschaft und Person) zusammenfassen. Alles andere (z. B. Gesundheit) fällt weg.
 */
export function normalisiereVertraege(raw: unknown): Vorvertrag[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: Vorvertrag[] = [];
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const sparte = sparteAus(typeof o.sparte === "string" ? o.sparte : null);
    if (!sparte) continue;
    const tarif = kurz(o.tarif, 60);
    const v: Vorvertrag = { sparte, gesellschaft: kurz(o.gesellschaft), fuer: kurz(o.fuer ?? o.fuerWen ?? o.person, 30), ...(tarif ? { tarif } : {}) };
    const gleich = (y: Vorvertrag) => y.sparte === v.sparte && (y.gesellschaft ?? "") === (v.gesellschaft ?? "") && (y.fuer ?? "") === (v.fuer ?? "");
    const da = out.find(gleich);
    if (!da) out.push(v);
    else if (!da.tarif && v.tarif) da.tarif = v.tarif;
  }
  return out.sort((x, y) => VERTRAG_SPARTEN.indexOf(x.sparte) - VERTRAG_SPARTEN.indexOf(y.sparte));
}

/** „keine“, „noch nichts“, „gar keine Versicherungen“ … */
export function sagtKeine(text: string | null | undefined): boolean {
  const t = (text ?? "").toLowerCase().trim();
  return /^(keine?|nichts|noch nichts|gar keine?|bisher keine?|noch keine?|nein)\b/.test(t) && !MUSTER.some(([re]) => re.test(t));
}

/**
 * Rückfall ohne KI (Fehler beim Abruf): Sparten im Text erkennen, Gesellschaft nur, wenn sie direkt mit „bei“
 * dahinter steht („Haftpflicht bei der HUK“). Tolerant, lieber weniger als falsch.
 */
export function vertraegeAusText(text: string | null | undefined): Vorvertrag[] {
  const teile = (text ?? "").split(/[,;\n]|\bund\b|\bsowie\b|\+/i).map((s) => s.trim()).filter(Boolean);
  const out: { sparte: string; gesellschaft: string | null }[] = [];
  for (const teil of teile) {
    // Ausgelaufen, gekündigt, hatte mal: kein laufender Vertrag (Usability-Check 18.11.2026)
    if (NICHT_MEHR.test(teil)) continue;
    const sparte = sparteAus(teil);
    if (!sparte) continue;
    // bekannte Versicherer auch klein geschrieben oder vertippt („kfz huk“, „bei der allainz“)
    const ges = versichererAus(teil) ?? /\b(?:bei|von)\s+(?:der|dem|den|die)?\s*([A-ZÄÖÜ][\w&+.\-ÄÖÜäöüß ]{1,30})/.exec(teil)?.[1] ?? null;
    out.push({ sparte, gesellschaft: ges });
  }
  return normalisiereVertraege(out);
}

/** Nicht mehr bestehend („ausgelaufen“, „gekündigt“, „hatte ich mal“, „nicht mehr“); gleiche Regel in lib/schutz-ueberblick.ts. */
export const NICHT_MEHR = /ausgelaufen|abgelaufen|gek(ü|ue)ndigt|beendet|\bnicht mehr\b|\bhatten? (ich |wir )?(mal|fr(ü|ue)her|bis)\b|\bwar(en)? (mal|fr(ü|ue)her)\b|\bfr(ü|ue)her mal\b|\behemal/i;

/** Gängige Sparten je Lebenssituation (neutral, für „noch nicht genannt“). */
export function gaengigeSparten(lebenssituation: string | null | undefined): VertragSparte[] {
  const t = (lebenssituation ?? "").toLowerCase();
  const basis: VertragSparte[] = ["Haftpflicht", "Hausrat", "Berufsunfähigkeit", "Altersvorsorge"];
  if (/kind|familie/.test(t)) return [...basis, "Unfall", "Risikoleben"];
  if (/paar|partner|verheiratet|zu zweit|ehe/.test(t)) return [...basis, "Risikoleben"];
  return basis;
}

/** Gängige Sparten, die der Lead nicht genannt hat (nur wenn er überhaupt etwas angegeben hat). */
export function nochNichtGenannt(v: Vorvertraege | null | undefined, lebenssituation: string | null | undefined): VertragSparte[] {
  if (!v || (!v.liste.length && !v.keine)) return [];
  const da = new Set(v.liste.map((x) => x.sparte));
  return gaengigeSparten(lebenssituation).filter((s) => !da.has(s));
}

/** Gespeicherten Wert lesen (defensiv). */
export function vorvertraegeAus(raw: unknown): Vorvertraege | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  return { at: typeof o.at === "string" ? o.at : "", liste: normalisiereVertraege(o.liste), ...(o.keine === true ? { keine: true } : {}) };
}

/** Produktnamen der App, die sparteAus nicht kennt (Abschluss-Sparten aus lib/provision.ts). */
const ABSCHLUSS_ALIAS: [RegExp, VertragSparte[]][] = [
  [/privatschutz/i, ["Haftpflicht", "Hausrat"]],
  [/\btkv\b|katze|hund|pferd/i, ["Tierkranken"]],
  [/\bbu\b/i, ["Berufsunfähigkeit"]],
];

/**
 * Bestehende Verträge, die der neue Abschluss ersetzt (Paket M6, Aufgabe „Alten Vertrag kündigen“): gleiche Sparte wie
 * eines der Produkte des Abschlusses (Produkt des Leads, Sparte des Vertrags, gewählte Angebote). Rein.
 */
export function zuErsetzendeVertraege(v: Vorvertraege | null | undefined, produkte: (string | null | undefined)[]): Vorvertrag[] {
  if (!v?.liste.length) return [];
  const sparten = new Set<VertragSparte>();
  for (const p of produkte) {
    const t = (p ?? "").trim();
    if (!t) continue;
    const s = sparteAus(t);
    if (s && s !== "Sonstige") sparten.add(s);
    for (const [re, liste] of ABSCHLUSS_ALIAS) if (re.test(t)) liste.forEach((x) => sparten.add(x));
  }
  return v.liste.filter((x) => sparten.has(x.sparte));
}

/** Eine Zeile je Vertrag: „Haftpflicht (HUK, für die Familie)“. */
export function vertragZeile(v: Vorvertrag): string {
  const zusatz = [[v.gesellschaft, v.tarif].filter(Boolean).join(" ") || null, v.fuer ? `für ${v.fuer.replace(/^für\s+/i, "")}` : null].filter(Boolean).join(", ");
  return zusatz ? `${v.sparte} (${zusatz})` : v.sparte;
}

/** Werkzeug-Schema für die KI-Extraktion (Anthropic tool input_schema). */
export const VORVERTRAEGE_SCHEMA = {
  type: "object",
  properties: {
    keine: { type: "boolean", description: "true, wenn der Lead sagt, er habe keine Versicherungen." },
    vertraege: {
      type: "array",
      description: "Je genannter Versicherung ein Eintrag. Nur Sparte, Gesellschaft, Tarifname und Person, nie Gesundheitsangaben, Beträge oder sonstige Tarifdetails.",
      items: {
        type: "object",
        properties: {
          sparte: { type: "string", enum: [...VERTRAG_SPARTEN] },
          gesellschaft: { type: "string", description: "Versicherer, nur falls genannt." },
          tarif: { type: "string", description: "Tarif- bzw. Produktname, nur falls genannt (z. B. „Classic“, „PrivatSchutz Komfort“)." },
          fuer: { type: "string", description: "Für wen, nur falls genannt (z. B. „Kinder“, „Partnerin“)." },
        },
        required: ["sparte"],
      },
    },
  },
} as const;

// ─── Versicherer erkennen und einmal nachfragen (Ole, 19.11.2026) ─────────────────────────────────────────────────────
// Nach der Vertragsfrage („… Gern auch mit Versicherer.“) genau einmal nachfragen, wenn zu genannten Sparten die
// Gesellschaft fehlt. Versicherer auch bei Kurzformen und Tippfehlern („SI“, „Signal Idnua“, „Allainz“).

/** Anzeigename je Versicherer mit Schreibweisen (Kleinschreibung; Liste wie VERSICHERER in beratungs-sperre.ts). */
const VERSICHERER_NAMEN: [string, string[]][] = [
  ["Signal Iduna", ["signal iduna", "signal-iduna", "signaliduna", "signal", "iduna", "si"]],
  ["HUK-Coburg", ["huk-coburg", "huk coburg", "huk", "huk24"]],
  ["Allianz", ["allianz"]],
  ["ERGO", ["ergo"]],
  ["AXA", ["axa"]],
  ["Sparkasse", ["sparkasse", "sparkassenversicherung"]],
  ["Provinzial", ["provinzial"]],
  ["DEVK", ["devk"]],
  ["R+V", ["r+v", "r + v", "r und v", "ruv"]],
  ["Gothaer", ["gothaer"]],
  ["Debeka", ["debeka"]],
  ["LVM", ["lvm"]],
  ["VHV", ["vhv"]],
  ["Zurich", ["zurich", "zürich"]],
  ["Generali", ["generali"]],
  ["Barmenia", ["barmenia"]],
  ["Continentale", ["continentale"]],
  ["Württembergische", ["württembergische", "wuerttembergische", "wüba"]],
  ["Nürnberger", ["nürnberger", "nuernberger"]],
  ["Alte Leipziger", ["alte leipziger"]],
  ["HanseMerkur", ["hansemerkur", "hanse merkur"]],
  ["Uelzener", ["uelzener"]],
  ["Agila", ["agila"]],
  ["Petplan", ["petplan"]],
  ["Petprotect", ["petprotect"]],
  ["DKV", ["dkv"]],
  ["HDI", ["hdi"]],
  ["WWK", ["wwk"]],
  ["VGH", ["vgh"]],
  ["ARAG", ["arag"]],
  ["Hallesche", ["hallesche"]],
  ["Concordia", ["concordia"]],
  ["Swiss Life", ["swiss life", "swisslife"]],
  ["Helvetia", ["helvetia"]],
  ["Baloise", ["baloise", "basler"]],
  ["Die Bayerische", ["die bayerische", "bayerische"]],
  ["CosmosDirekt", ["cosmosdirekt", "cosmos direkt"]],
  ["Hannoversche", ["hannoversche"]],
  ["Itzehoer", ["itzehoer"]],
  ["Mecklenburgische", ["mecklenburgische"]],
  ["Getsafe", ["getsafe"]],
  ["Stuttgarter", ["stuttgarter"]],
  ["Volkswohl Bund", ["volkswohl bund"]],
  ["Canada Life", ["canada life"]],
  ["Roland", ["roland rechtsschutz", "roland"]],
  ["Advocard", ["advocard"]],
  ["Münchener Verein", ["münchener verein"]],
  ["WGV", ["wgv"]],
  ["Janitos", ["janitos"]],
  ["Ammerländer", ["ammerländer"]],
  ["Interlloyd", ["interlloyd"]],
  ["Haftpflichtkasse", ["haftpflichtkasse"]],
  ["Universa", ["universa"]],
  ["Neodigital", ["neodigital"]],
  ["Wefox", ["wefox"]],
  ["Lemonade", ["lemonade"]],
  ["Mannheimer", ["mannheimer"]],
  ["Rhion", ["rhion"]],
  ["Domcura", ["domcura"]],
  ["Hiscox", ["hiscox"]],
];

/** Abstand zweier Wörter (Einfügen, Löschen, Ersetzen, Vertauschen benachbarter Zeichen). */
function abstand(x: string, y: string): number {
  const d: number[][] = Array.from({ length: x.length + 1 }, (_, i) => Array.from({ length: y.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= x.length; i++)
    for (let j = 1; j <= y.length; j++) {
      const k = x[i - 1] === y[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + k);
      if (i > 1 && j > 1 && x[i - 1] === y[j - 2] && x[i - 2] === y[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[x.length][y.length];
}

/** Wörter, die nie als vertippter Versicherer gelten (Sparten und Füllwörter). */
const KEIN_VERSICHERER = /^(haftpflicht|hausrat|unfall|rechtsschutz|kranken|zahnzusatz|pflege|rente|leben|auto|versicherung|versichert|gesellschaft|vertrag|vertr(ä|a)ge|beides|beide|alles|alle|generell|signale?n?|allein|alleine)$/;

/** Alle Versicherer in Textreihenfolge, ohne Doppelte. Kurze Namen (unter 5 Zeichen) nur exakt, längere auch vertippt. */
export function versichererAlle(text: string | null | undefined): string[] {
  const t = ` ${(text ?? "").toLowerCase().replace(/[„“"'.,;:!?()]/g, " ").replace(/\s+/g, " ").trim()} `;
  if (!t.trim()) return [];
  const woerter = t.trim().split(" ");
  const treffer: { pos: number; name: string }[] = [];
  for (const [name, formen] of VERSICHERER_NAMEN) {
    let pos = -1;
    for (const f of formen) {
      const i = t.indexOf(` ${f} `);
      if (i >= 0 && (pos < 0 || i < pos)) pos = i;
    }
    // Tippfehler: ein bzw. zwei Wörter gegen Formen ab 5 Zeichen (bis 9 Zeichen ein Fehler, darüber zwei)
    for (const f of pos < 0 ? formen : []) {
      if (f.length < 5) continue;
      const n = f.split(" ").length;
      const grenze = f.length >= 10 ? 2 : 1;
      for (let i = 0; i + n <= woerter.length && pos < 0; i++) {
        const w = woerter.slice(i, i + n).join(" ");
        if (n === 1 && KEIN_VERSICHERER.test(w)) continue;
        if (Math.abs(w.length - f.length) <= grenze && abstand(w, f) <= grenze) pos = t.indexOf(` ${w} `);
      }
      if (pos >= 0) break;
    }
    if (pos >= 0) treffer.push({ pos, name });
  }
  return [...new Set(treffer.sort((x, y) => x.pos - y.pos).map((x) => x.name))];
}

/** Erster Versicherer im Text („bei der Signal Idnua“, „HUK“, „bei der Sparkasse“); null = keiner erkannt. */
export function versichererAus(text: string | null | undefined): string | null {
  return versichererAlle(text)[0] ?? null;
}

/** Sparten ohne Gesellschaft (ohne „Sonstige“), in Listenreihenfolge, ohne Doppelte. */
export function fehlendeVersicherer(liste: readonly Vorvertrag[]): VertragSparte[] {
  const mit = new Set(liste.filter((v) => v.gesellschaft).map((v) => v.sparte));
  return [...new Set(liste.filter((v) => !v.gesellschaft && v.sparte !== "Sonstige" && !mit.has(v.sparte)).map((v) => v.sparte))];
}

/** Sparte im Satz („die Haftpflicht“, „die private Krankenversicherung“). */
const SPARTE_IM_SATZ: Partial<Record<VertragSparte, string>> = {
  "Private Krankenversicherung": "private Krankenversicherung",
  Tierkranken: "Tierversicherung",
};

/**
 * Nachfrage nach den Gesellschaften (eine Nachricht, ohne Knöpfe). Bis 3 Sparten mit Namen, darüber allgemein.
 * person = Vermittler wie in den übrigen Texten („Herr Kannapinn“ bzw. „Ole“). null = nichts zu fragen.
 */
export function versichererNachfrage(fehlend: readonly VertragSparte[], an: "du" | "sie", person: string): string | null {
  if (!fehlend.length) return null;
  let teil = "bei welchen Gesellschaften die Verträge sind";
  if (fehlend.length <= 3) {
    const w = fehlend.map((s) => `die ${SPARTE_IM_SATZ[s] ?? s}`);
    const l = w.length === 1 ? w[0] : `${w.slice(0, -1).join(", ")} und ${w.at(-1)}`;
    teil = `bei welcher Gesellschaft ${l} ${w.length === 1 ? "ist" : "sind"}`;
  }
  return an === "du" ? `Danke! Weißt du noch, ${teil}? Dann kann ${person} gezielt vergleichen.` : `Danke! Wissen Sie noch, ${teil}? Dann kann ${person} gezielt vergleichen.`;
}

/**
 * Antwort auf die Nachfrage den offenen Sparten zuordnen: „Haftpflicht bei der Allianz, Hausrat bei der HUK“ je Sparte,
 * „beide Allianz“ bzw. ein Name für alle, mehrere Namen ohne Sparte in der Reihenfolge der Frage. Leer bei „weiß nicht“
 * oder wenn nichts erkannt wurde.
 */
export function versichererZuordnen(fehlend: readonly VertragSparte[], text: string | null | undefined): Partial<Record<VertragSparte, string>> {
  const out: Partial<Record<VertragSparte, string>> = {};
  const t = (text ?? "").trim();
  if (!t || !fehlend.length) return out;
  const teile = t.split(/[,;\n]|\bund\b|\bsowie\b/i).map((s) => s.trim()).filter(Boolean);
  const ohneSparte: string[] = [];
  for (const teil of teile) {
    const ges = versichererAus(teil);
    const sparte = sparteAus(teil);
    if (ges && sparte && fehlend.includes(sparte)) out[sparte] = ges;
    else if (ges && !sparte) ohneSparte.push(ges);
  }
  const rest = fehlend.filter((s) => !out[s]);
  if (rest.length && ohneSparte.length === 1) for (const s of rest) out[s] = ohneSparte[0];
  else if (rest.length && ohneSparte.length === rest.length) rest.forEach((s, i) => (out[s] = ohneSparte[i]));
  // Unbekannte Gesellschaft bei nur einer offenen Sparte: „bei der Gartenbau-Versicherung“
  if (!Object.keys(out).length && fehlend.length === 1) {
    const g = /\b(?:bei|von)\s+(?:der|dem|den|die)?\s*([A-Za-zÄÖÜäöüß][\w&+.\-ÄÖÜäöüß ]{1,30})/i.exec(t)?.[1]?.trim();
    if (g && !/^(nicht|keine?|mir|uns)\b/i.test(g)) out[fehlend[0]] = g.replace(/[.!]+$/, "");
  }
  return out;
}
