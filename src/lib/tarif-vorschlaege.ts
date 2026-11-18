// Tarifkatalog lernt aus Einträgen der Vermittler (Ole, 18.11.2026: „Lass uns lernen, wenn Vermittler hier was von Hand
// nachtragen.“). Reine Funktionen, ohne Datenbank (Laden und Speichern: lib/tarif-vorschlaege-server.ts).
//
// Wo Vermittler heute Katalogwerte von Hand nachtragen (untersucht 18.11.2026; Katalogtarife selbst sind in der
// Terminvorbereitung nicht änderbar, der Katalogwert kommt als Schnappschuss):
//   1. „Eigenen Tarif anlegen“ (Tarife ändern): Gesellschaft, Tarifname und Merkmalwerte. Heißt der Tarif wie ein
//      Katalogtarif, sind die Werte Vorschläge zu dessen Merkmalen (geändert, ergänzt oder, bei ungeprüften, bestätigt).
//      Fehlt der Name im Katalog der Gesellschaft, ist der Tarifname ein Vorschlag.
//   2. „Bisheriger Vertrag“ (P3b) mit „Anderer Tarif“: Gesellschaft aus dem Katalog, Tarifname fehlt in der Liste.
// Gespeichert wird nur der Katalogbezug (Gesellschaft, Sparte, Tarif, Merkmal, Wert), nie Lead- oder Termindaten.
// Gesundheitssparten beim bisherigen Vertrag nicht (der Tarif eines Kunden wäre eine Gesundheitsangabe).

import { gesellschaftAusText, merkmalUngeprueft, sparteVon, type Katalog, type KatalogTarif } from "@/lib/tarifkatalog";
import { istGesundheitssparte, katalogTarifFinden, type BisherVertrag } from "@/lib/bisheriger-vertrag";

/** Merkmal-Schlüssel für „Tarifname fehlt im Katalog“ (tarifId dann „<gesellschaft>/<sparte>/*“). */
export const TARIF_MERKMAL = "__tarif";
/** Ab so vielen verschiedenen Vermittlern mit demselben Wert gilt ein ungeprüfter Vorschlag als „Empfohlen“. */
export const EMPFOHLEN_AB = 3;
/** Längster Wert, der auf der Vergleichsfolie Platz hat (wie tests/unit/tarifkatalog-daten.test.ts GRENZE.wert). */
export const FOLIE_MAX_WERT = 24;

export type VorschlagQuelle = "vorbereitung" | "bisheriger-vertrag";
export type VorschlagStatus = "offen" | "uebernommen" | "abgelehnt";

export type VorschlagNeu = {
  gesellschaft: string;
  sparte: string;
  datei: string;
  tarifId: string;
  merkmal: string;
  alterWert: string | null;
  neuerWert: string;
  ungeprueft: boolean;
  /** Neuer Tarifname: Merkmalwerte, die der Vermittler dazu eingetragen hat (Entwurf für den Export) */
  werte?: Record<string, string> | null;
};

export const dateiVon = (gesellschaft: string, sparte: string) => `${gesellschaft}/${sparte}.json`;
export const neuerTarifId = (gesellschaft: string, sparte: string) => `${gesellschaft}/${sparte}/*`;

const sauber = (v: unknown, max: number): string | null => (typeof v === "string" && v.trim() ? v.replace(/\s+/g, " ").trim().slice(0, max) : null);

const JA = /^(ja|✓|✔|x|enthalten|inklusive|inkl\.?|mitversichert)$/i;
const NEIN = /^(nein|\u2014|\u2013|-|nicht enthalten|ohne|nicht versichert)$/i;

/** Werte vergleichbar machen: „5.000 €“ = „5000€“ = „5000 Euro“, „ja“ = „✓“. */
export function wertNorm(v: string | null | undefined): string {
  const t = (v ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  if (JA.test(t)) return "ja";
  if (NEIN.test(t)) return "nein";
  return t
    .toLocaleLowerCase("de")
    .replace(/\beuro\b|\beur\b/g, "€")
    .replace(/(\d)\.(?=\d{3}\b)/g, "$1")
    .replace(/\s+/g, "");
}

/**
 * Sieht nach Personendaten aus (E-Mail, Telefonnummer, IBAN)? Dann wird nichts gespeichert, auch wenn das Feld
 * eigentlich ein Merkmal ist.
 */
export function wirktPersoenlich(v: string): boolean {
  return /@/.test(v) || /(\+\d|\b0[1-9])[\d\s/-]{6,}/.test(v) || /\b[A-Z]{2}\d{2}\s?\d{4}/.test(v);
}

/** Katalogtarife der Gesellschaft in dieser Sparte (= es gibt eine Katalogdatei). */
const tarifeDerDatei = (k: Pick<Katalog, "tarife">, gesellschaft: string, sparte: string) => k.tarife.filter((t) => t.gesellschaft === gesellschaft && t.sparte === sparte);

function tarifnameVorschlag(k: Pick<Katalog, "tarife">, sparte: string, gesellschaft: string, name: string): VorschlagNeu | null {
  const datei = tarifeDerDatei(k, gesellschaft, sparte);
  const n = sauber(name, 80);
  if (!datei.length || !n || wirktPersoenlich(n)) return null;
  return {
    gesellschaft,
    sparte,
    datei: dateiVon(gesellschaft, sparte),
    tarifId: neuerTarifId(gesellschaft, sparte),
    merkmal: TARIF_MERKMAL,
    alterWert: null,
    neuerWert: n,
    ungeprueft: datei.some((t) => !!t.ungeprueft),
  };
}

/**
 * Vorschläge aus einem eigenen Tarif (Terminvorbereitung, „Eigenen Tarif anlegen“). Nur, wenn die Gesellschaft in
 * dieser Sparte im Katalog steht. Gleicher Name wie ein Katalogtarif: je eingetragenem Merkmal ein Vorschlag, wenn der
 * Wert abweicht bzw. im Katalog fehlt; gleicher Wert nur bei ungeprüften Merkmalen (Bestätigung). Sonst: Tarifname.
 */
export function vorschlaegeAusEigenemTarif(k: Katalog, e: { sparte: string; gesellschaft: string; name: string; werte?: Record<string, string | null> | null }): VorschlagNeu[] {
  const g = gesellschaftAusText(e.gesellschaft);
  if (!g || !tarifeDerDatei(k, g, e.sparte).length) return [];
  const kt = katalogTarifFinden(k, e.sparte, e.gesellschaft, e.name);
  const erlaubt = new Set(sparteVon(k, e.sparte)?.merkmale.map((m) => m.key) ?? []);
  if (!kt) {
    const v = tarifnameVorschlag(k, e.sparte, g, e.name);
    if (!v) return [];
    // Werte zum neuen Tarif (Ole, 18.11.2026): gehen als Entwurf mit in den Export, nur Merkmale der Sparte
    const werte: Record<string, string> = {};
    for (const [key, roh] of Object.entries(e.werte ?? {})) {
      const w = sauber(roh, 40);
      if (w && erlaubt.has(key) && !wirktPersoenlich(w)) werte[key] = w;
    }
    return [Object.keys(werte).length ? { ...v, werte } : v];
  }
  const out: VorschlagNeu[] = [];
  for (const [key, roh] of Object.entries(e.werte ?? {})) {
    const w = sauber(roh, 40);
    if (!w || !erlaubt.has(key) || wirktPersoenlich(w)) continue;
    const alt = kt.werte[key] ?? null;
    const gleich = wertNorm(alt) === wertNorm(w);
    if (gleich && !merkmalUngeprueft(kt, key)) continue;
    out.push(vorschlagFuer(kt, key, alt, gleich ? alt! : w));
  }
  return out;
}

const vorschlagFuer = (t: KatalogTarif, merkmal: string, alterWert: string | null, neuerWert: string): VorschlagNeu => ({
  gesellschaft: t.gesellschaft,
  sparte: t.sparte,
  datei: dateiVon(t.gesellschaft, t.sparte),
  tarifId: t.id,
  merkmal,
  alterWert,
  neuerWert,
  ungeprueft: !!t.ungeprueft,
});

/**
 * Vorschläge aus dem bisherigen Vertrag (P3b): von Hand eingetragen, Gesellschaft mit Katalogdatei in der Sparte, aber
 * „Anderer Tarif“ mit einem Namen, den der Katalog nicht kennt. Gesundheitssparten nie.
 */
export function vorschlaegeAusBisher(k: Pick<Katalog, "tarife">, sparten: { key: string; bisher?: BisherVertrag | null }[]): VorschlagNeu[] {
  const out: VorschlagNeu[] = [];
  for (const sp of sparten) {
    const b = sp.bisher;
    if (!b || b.quelle !== "hand" || b.katalogId || !b.tarif || istGesundheitssparte(sp.key)) continue;
    const g = gesellschaftAusText(b.gesellschaft);
    if (!g || katalogTarifFinden(k, sp.key, b.gesellschaft, b.tarif)) continue;
    const v = tarifnameVorschlag(k, sp.key, g, b.tarif);
    if (v && !out.some((x) => x.tarifId === v.tarifId && wertNorm(x.neuerWert) === wertNorm(v.neuerWert))) out.push(v);
  }
  return out;
}

// ─── Überlagerung (übernommene Werte über den Datei-Katalog) ──────────────────────────────────

export type KatalogWertZeile = { tarifId: string; merkmal: string; wert: string };

/**
 * Übernommene Werte über den Katalog legen: Wert setzen und das Merkmal als „von Vermittlern bestätigt“ markieren.
 * Unbekannte Tarife bzw. Merkmale und neue Tarifnamen (nur für den Export) bleiben außen vor. Der Datei-Katalog bleibt
 * unverändert (neue Objekte nur für betroffene Tarife).
 */
export function katalogUeberlagern(k: Katalog, zeilen: KatalogWertZeile[]): Katalog {
  const je = new Map<string, KatalogWertZeile[]>();
  for (const z of zeilen) {
    if (z.merkmal === TARIF_MERKMAL || !z.wert?.trim()) continue;
    je.set(z.tarifId, [...(je.get(z.tarifId) ?? []), z]);
  }
  if (!je.size) return k;
  const tarife = k.tarife.map((t) => {
    const liste = je.get(t.id);
    if (!liste) return t;
    const erlaubt = new Set(sparteVon(k, t.sparte)?.merkmale.map((m) => m.key) ?? []);
    const werte = { ...t.werte };
    const bestaetigt = new Set(t.bestaetigt ?? []);
    for (const z of liste) {
      if (!erlaubt.has(z.merkmal)) continue;
      werte[z.merkmal] = z.wert.trim().slice(0, 40);
      bestaetigt.add(z.merkmal);
    }
    return bestaetigt.size ? { ...t, werte, bestaetigt: [...bestaetigt] } : t;
  });
  return { ...k, tarife };
}

// ─── Admin-Liste ──────────────────────────────────────────────────────────────────────────────

export type VorschlagZeile = {
  customerId: string;
  tarifId: string;
  gesellschaft: string;
  sparte: string;
  datei: string;
  merkmal: string;
  neuerWert: string;
  ungeprueft: boolean;
  createdAt: Date;
};

export type VorschlagWert = {
  wert: string;
  /** verschiedene Vermittler-Konten mit diesem Wert */
  vermittler: number;
  /** ergaenzt: im Katalog leer · geaendert: weicht ab · bestaetigt: wie im Katalog · neu: Tarifname fehlt */
  art: "ergaenzt" | "geaendert" | "bestaetigt" | "neu";
  empfohlen: boolean;
  /** passt nicht auf die Vergleichsfolie (nur Export) */
  zuLang: boolean;
  zuletzt: Date;
};

export type VorschlagGruppe = {
  key: string;
  tarifId: string;
  gesellschaft: string;
  gesellschaftName: string;
  sparte: string;
  sparteLabel: string;
  datei: string;
  /** Kurzname des Katalogtarifs; null bei neuem Tarifnamen */
  tarif: string | null;
  merkmal: string;
  merkmalLabel: string;
  /** heutiger Wert (Datei plus Übernommenes); null = leer */
  katalogWert: string | null;
  /** Merkmal ist ungeprüft (Datei) und noch nicht bestätigt */
  ungeprueft: boolean;
  /** schon ein übernommener Wert für dieses Merkmal */
  bestaetigt: boolean;
  /** Tarif steht nicht mehr im Katalog (Datei geändert) */
  fehlt: boolean;
  werte: VorschlagWert[];
};

/**
 * Vorschläge nach Tarif und Merkmal gruppieren, je Wert die Zahl verschiedener Vermittler. Reihenfolge: ungeprüfte
 * zuerst, dann mit Empfehlung, dann nach Vermittlern und Aktualität. k = Katalog mit Überlagerung.
 */
export function gruppieren(zeilen: VorschlagZeile[], k: Katalog): VorschlagGruppe[] {
  const gruppen = new Map<string, VorschlagZeile[]>();
  for (const z of zeilen) {
    const key = `${z.tarifId}|${z.merkmal}`;
    gruppen.set(key, [...(gruppen.get(key) ?? []), z]);
  }
  const out: VorschlagGruppe[] = [];
  for (const [key, liste] of gruppen) {
    const z0 = liste[0];
    const neu = z0.merkmal === TARIF_MERKMAL;
    const kt = neu ? undefined : k.tarife.find((t) => t.id === z0.tarifId);
    const sp = sparteVon(k, z0.sparte);
    const katalogWert = kt ? (kt.werte[z0.merkmal] ?? null) : null;
    const ungeprueft = neu ? liste.some((z) => z.ungeprueft) : kt ? merkmalUngeprueft(kt, z0.merkmal) : liste.some((z) => z.ungeprueft);
    const werte = new Map<string, { wert: string; kunden: Set<string>; zuletzt: Date }>();
    for (const z of liste) {
      const n = wertNorm(z.neuerWert);
      const w = werte.get(n) ?? { wert: z.neuerWert, kunden: new Set<string>(), zuletzt: z.createdAt };
      w.kunden.add(z.customerId);
      if (z.createdAt > w.zuletzt) w.zuletzt = z.createdAt;
      werte.set(n, w);
    }
    out.push({
      key,
      tarifId: z0.tarifId,
      gesellschaft: z0.gesellschaft,
      gesellschaftName: kt?.gesellschaftName ?? k.tarife.find((t) => t.gesellschaft === z0.gesellschaft)?.gesellschaftName ?? z0.gesellschaft,
      sparte: z0.sparte,
      sparteLabel: sp?.label ?? z0.sparte,
      datei: z0.datei,
      tarif: kt?.kurz ?? null,
      merkmal: z0.merkmal,
      merkmalLabel: neu ? "Tarifname" : (sp?.merkmale.find((m) => m.key === z0.merkmal)?.kurz ?? z0.merkmal),
      katalogWert,
      ungeprueft,
      bestaetigt: !!kt?.bestaetigt?.includes(z0.merkmal),
      fehlt: !neu && !kt,
      werte: [...werte.values()]
        .map((w): VorschlagWert => {
          const art = neu ? "neu" : katalogWert == null ? "ergaenzt" : wertNorm(katalogWert) === wertNorm(w.wert) ? "bestaetigt" : "geaendert";
          return {
            wert: w.wert,
            vermittler: w.kunden.size,
            art,
            empfohlen: ungeprueft && w.kunden.size >= EMPFOHLEN_AB,
            zuLang: !neu && w.wert.length > FOLIE_MAX_WERT,
            zuletzt: w.zuletzt,
          };
        })
        .sort((a, b) => b.vermittler - a.vermittler || b.zuletzt.getTime() - a.zuletzt.getTime()),
    });
  }
  const max = (g: VorschlagGruppe) => Math.max(...g.werte.map((w) => w.vermittler));
  const zuletzt = (g: VorschlagGruppe) => Math.max(...g.werte.map((w) => w.zuletzt.getTime()));
  return out.sort(
    (a, b) =>
      Number(b.ungeprueft) - Number(a.ungeprueft) ||
      Number(b.werte.some((w) => w.empfohlen)) - Number(a.werte.some((w) => w.empfohlen)) ||
      max(b) - max(a) ||
      zuletzt(b) - zuletzt(a),
  );
}

// ─── Gespeicherte Auswahl auffrischen ─────────────────────────────────────────────────────────

/**
 * Übernommene Werte in eine gespeicherte Tarifauswahl bringen (Katalogtarife sind dort ein Schnappschuss): nur die
 * bestätigten Merkmale, sonst bleibt alles. Der Aufrufer entscheidet, ob der Termin noch bevorsteht (alte
 * Präsentationen bleiben, wie sie waren). geaendert = neu speichern.
 */
export function auswahlAuffrischen<T extends { sparten: { tarife: { id: string; herkunft: string; werte: Record<string, string | null>; werteBestaetigt?: string[] }[] }[] }>(
  a: T,
  k: Pick<Katalog, "tarife">,
): { auswahl: T; geaendert: boolean } {
  let geaendert = false;
  const sparten = a.sparten.map((sp) => ({
    ...sp,
    tarife: sp.tarife.map((t) => {
      if (t.herkunft !== "katalog") return t;
      const kt = k.tarife.find((x) => x.id === t.id);
      if (!kt?.bestaetigt?.length) return t;
      const werte = { ...t.werte };
      const bestaetigt = new Set(t.werteBestaetigt ?? []);
      let neu = false;
      for (const m of kt.bestaetigt) {
        const w = kt.werte[m] ?? null;
        if (w != null && werte[m] !== w) {
          werte[m] = w;
          neu = true;
        }
        if (kt.ungeprueft && !bestaetigt.has(m)) {
          bestaetigt.add(m);
          neu = true;
        }
      }
      if (!neu) return t;
      geaendert = true;
      return { ...t, werte, ...(bestaetigt.size ? { werteBestaetigt: [...bestaetigt] } : {}) };
    }),
  }));
  return { auswahl: geaendert ? { ...a, sparten } : a, geaendert };
}

// ─── Entwurf für neue Tarifnamen und Hinweis auf „Heute“ ──────────────────────────────────────

export type EntwurfWert = { wert: string; vermittler: number };

/**
 * Werte eines neuen Tarifnamens als Entwurf (Ole, 18.11.2026): je Merkmal der Wert, den die meisten verschiedenen
 * Vermittler eingetragen haben (bei Gleichstand der zuerst gefundene, Liste neueste zuerst). Nur Einträge mit diesem
 * Namen (wertNorm). Rein.
 */
export function entwurfWerte(zeilen: { customerId: string; neuerWert: string; werte: unknown }[], name: string): Record<string, EntwurfWert> {
  const je = new Map<string, Map<string, { wert: string; kunden: Set<string> }>>();
  for (const z of zeilen) {
    if (wertNorm(z.neuerWert) !== wertNorm(name) || !z.werte || typeof z.werte !== "object" || Array.isArray(z.werte)) continue;
    for (const [merkmal, roh] of Object.entries(z.werte as Record<string, unknown>)) {
      if (typeof roh !== "string" || !roh.trim()) continue;
      const m = je.get(merkmal) ?? new Map<string, { wert: string; kunden: Set<string> }>();
      const n = wertNorm(roh);
      const e = m.get(n) ?? { wert: roh.trim(), kunden: new Set<string>() };
      e.kunden.add(z.customerId);
      m.set(n, e);
      je.set(merkmal, m);
    }
  }
  const out: Record<string, EntwurfWert> = {};
  for (const [merkmal, m] of je) {
    let best: { wert: string; kunden: Set<string> } | null = null;
    for (const e of m.values()) if (!best || e.kunden.size > best.kunden.size) best = e;
    if (best) out[merkmal] = { wert: best.wert, vermittler: best.kunden.size };
  }
  return out;
}

/** Offene Gruppen mit mindestens einem „Empfohlen“-Wert (Hinweis auf „Heute“). */
export function anzahlEmpfehlungen(gruppen: Pick<VorschlagGruppe, "werte">[]): number {
  return gruppen.filter((g) => g.werte.some((w) => w.empfohlen)).length;
}
