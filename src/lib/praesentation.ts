// Beratungsstrecke (Ole, 15.11.2026): bebilderte Präsentation je Termin, per Klick aus den bestätigten Angeboten und
// den Angaben des Kunden. Der Berater teilt sie im Videocall (ohne Sprechzettel, Ole 15.11.2026). Branding nach
// Gesellschaft (Allianz, AXA, Signal Iduna) bzw. PG, Logo von der Agentur- bzw. Maklerseite (vom Berater bestätigt).
//
// Reine Funktionen: Folien als HTML-Fragmente + CSS (gleich für Ansicht und PDF, 1280×720).

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { spartenVon, type VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { beitragEffektiv, summeEmpfohlen, type AngebotItem, type AngeboteDaten } from "@/lib/angebote-daten";
import { a, type Ansprache } from "@/lib/ansprache";
import { folienEinpassen } from "@/lib/folien-einpassen";

export type Marke = { name: string; gesellschaft: string | null; farbe: string; farbeHell: string; akzent: string; logoUrl: string | null };

/** Branding nach Gesellschaft (aus dem Kundennamen, z. B. „Allianz Agentur Lohmann“), sonst PG. */
export function markeFuer(kunde: { name: string; vermittlerTyp?: string | null }, logoUrl: string | null = null): Marke {
  const n = kunde.name;
  const name = n.trim();
  if (/allianz/i.test(n)) return { name, gesellschaft: "Allianz", farbe: "#003781", farbeHell: "#e6eef7", akzent: "#003781", logoUrl };
  if (/\baxa\b/i.test(n)) return { name, gesellschaft: "AXA", farbe: "#00008f", farbeHell: "#e8e8f6", akzent: "#ff1721", logoUrl };
  if (/signal\s*iduna/i.test(n)) return { name, gesellschaft: "SIGNAL IDUNA", farbe: "#004f9f", farbeHell: "#e6eff8", akzent: "#ffd100", logoUrl };
  return { name, gesellschaft: null, farbe: "#2563eb", farbeHell: "#e5edff", akzent: "#2563eb", logoUrl };
}

export type Folie = { id: string; titel: string; html: string };

const e = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const eur = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

// Schlichte Illustrationen (Linien, Markenfarbe über currentColor), keine fremden Bilder.
const ICON: Record<string, string> = {
  haftpflicht: '<path d="M32 6 10 14v14c0 14 9.5 25 22 30 12.5-5 22-16 22-30V14L32 6Z"/><path d="m22 32 7 7 13-14"/>',
  hausrat: '<path d="M8 30 32 10l24 20"/><path d="M14 26v28h36V26"/><path d="M26 54V40h12v14"/>',
  rechtsschutz: '<path d="M32 8v48M16 56h32"/><path d="M12 18h40"/><path d="m12 18-7 16a8 8 0 0 0 14 0l-7-16M52 18l-7 16a8 8 0 0 0 14 0l-7-16"/>',
  wohngebaeude: '<path d="M6 32 32 10l26 22"/><path d="M12 28v26h40V28"/><rect x="20" y="34" width="8" height="8"/><rect x="36" y="34" width="8" height="8"/>',
  tier: '<circle cx="18" cy="22" r="5"/><circle cx="30" cy="14" r="5"/><circle cx="44" cy="16" r="5"/><circle cx="52" cy="28" r="5"/><path d="M34 30c-9 0-17 10-17 18 0 6 6 8 10 6 4-2 10-2 14 0 4 2 10 0 10-6 0-8-8-18-17-18Z"/>',
  unfall: '<rect x="10" y="22" width="44" height="20" rx="10" transform="rotate(-35 32 32)"/><path d="m26 26 12 12M30 22l12 12"/>',
  person: '<circle cx="32" cy="20" r="10"/><path d="M12 56c2-11 10-18 20-18s18 7 20 18"/>',
  check: '<path d="m14 33 12 12 24-26"/>',
};
const icon = (k: string, size = 64) =>
  `<svg viewBox="0 0 64 64" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k] ?? ICON.check}</svg>`;

const SPARTE_TEXT: Record<string, { titel: string; text: string }> = {
  haftpflicht: { titel: "Privathaftpflicht", text: "Schäden, die Sie anderen versehentlich zufügen. Ein Personenschaden kann in die Millionen gehen." },
  hausrat: { titel: "Hausrat", text: "Ihr Hab und Gut bei Einbruch, Feuer, Leitungswasser und Sturm." },
  rechtsschutz: { titel: "Rechtsschutz", text: "Wenn es Streit gibt: mit dem Vermieter, dem Arbeitgeber oder im Straßenverkehr." },
  wohngebaeude: { titel: "Wohngebäude", text: "Ihr Haus bei Feuer, Leitungswasser, Sturm und Hagel." },
  tier: { titel: "Ihr Tier", text: "Tierarzt und Operation: Eine OP kostet schnell mehrere tausend Euro." },
  unfall: { titel: "Unfall", text: "Unfälle in der Freizeit deckt die gesetzliche Unfallversicherung nicht ab." },
};

function sparteKey(s: string): string {
  const t = s.toLowerCase();
  if (/tier|hund|katze|pferd/.test(t)) return "tier";
  if (/hausrat/.test(t)) return "hausrat";
  if (/rechtsschutz/.test(t)) return "rechtsschutz";
  if (/geb(ä|a)ude/.test(t)) return "wohngebaeude";
  if (/unfall/.test(t)) return "unfall";
  return "haftpflicht";
}

export function praesentationCss(m: Marke): string {
  return `
.deck{--f:${m.farbe};--fh:${m.farbeHell};--a:${m.akzent};font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;color:#0b1220}
.slide{width:1280px;height:720px;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;padding:64px 80px 80px;line-height:1.2;text-align:left}
.slide *{box-sizing:border-box}
.slide .bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--f)}
.slide .foot{position:absolute;left:80px;right:80px;bottom:28px;display:flex;justify-content:space-between;align-items:center;color:#66758f;font-size:16px}
.slide .marke{font-weight:700;color:var(--f);font-size:18px;display:flex;align-items:center;gap:10px}
.slide .marke img{height:34px;width:auto;max-width:180px;object-fit:contain}
.titellogo{display:block;height:72px;width:auto;max-width:360px;object-fit:contain;margin-bottom:28px}
.slide h1{font-size:54px;line-height:1.1;margin:0 0 18px;letter-spacing:-.02em;color:var(--f)}
.slide h2{font-size:42px;line-height:1.15;margin:0 0 28px;letter-spacing:-.015em;color:var(--f)}
.slide p,.slide li{font-size:24px;line-height:1.45}
.slide .sub{color:#4b5568;font-size:26px;margin:0}
.slide ul{margin:0;padding:0;list-style:none}
.slide li{display:flex;gap:14px;align-items:flex-start;margin:0 0 14px}
.slide li .dot{flex:0 0 12px;height:12px;border-radius:99px;background:var(--a);margin-top:12px}
.titel{background:var(--fh)}
.titel .agenda{display:flex;gap:18px;margin-top:48px}
.titel .agenda div{background:#fff;border-radius:16px;padding:18px 22px;font-size:22px;flex:1;box-shadow:0 1px 2px rgba(0,0,0,.06)}
.titel .agenda b{display:block;color:var(--f);font-size:30px}
.kacheln{display:grid;grid-template-columns:repeat(3,1fr);gap:22px}
.kachel{border-radius:18px;background:var(--fh);padding:24px;color:var(--f)}
.kachel b{display:block;font-size:24px;margin:10px 0 6px;color:#0b1220}
.kachel span{font-size:19px;line-height:1.4;color:#334155}
.angebote{display:grid;gap:20px}
.angebot{border:2px solid #e3e9f3;border-radius:18px;padding:20px 22px;position:relative}
.angebot.empf{border-color:var(--f);box-shadow:0 8px 24px rgba(0,0,0,.08)}
.angebot .badge{position:absolute;top:-14px;left:20px;background:var(--f);color:#fff;font-size:15px;font-weight:700;padding:4px 12px;border-radius:99px}
.angebot .sp{color:#66758f;font-size:17px}
.angebot .tarif{font-size:26px;font-weight:700;margin:2px 0 6px}
.angebot .preis{font-size:34px;font-weight:800;color:var(--f)}
.angebot .preis small{font-size:17px;font-weight:500;color:#66758f}
.angebot ul{margin-top:10px}.angebot li{font-size:18px;margin:0 0 6px}
.angebot li .dot{margin-top:9px;flex-basis:9px;height:9px}
.zwei{display:grid;grid-template-columns:1fr 1fr;gap:40px}
.ok li::before{content:"✓";color:#16a34a;font-weight:800;margin-right:10px}
.nein li::before{content:"✕";color:#b91c1c;font-weight:800;margin-right:10px}
.ok li,.nein li{display:block}
.gross{font-size:96px;font-weight:800;color:var(--f);line-height:1;margin:10px 0}
.schritte{display:grid;grid-template-columns:repeat(3,1fr);gap:24px}
.schritt{background:var(--fh);border-radius:18px;padding:26px}
.schritt .n{width:44px;height:44px;border-radius:99px;background:var(--f);color:#fff;font-weight:800;font-size:22px;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.schritt b{display:block;font-size:24px;margin-bottom:6px}
.schritt span{font-size:19px;color:#334155}
.leer{color:#66758f;font-size:24px;border:2px dashed #cbd5e1;border-radius:18px;padding:40px;text-align:center}
.ill{color:var(--f);opacity:.9}
.slide .frage{background:var(--fh);color:var(--f);font-weight:700;padding:8px 18px;border-radius:99px;font-size:18px}
.titel .hinweis{margin-top:28px;color:#4b5568;font-size:22px}
.zitate{display:grid;gap:16px}
.zitat{font-size:28px;line-height:1.35;border-left:6px solid var(--a);padding:8px 0 8px 22px;color:#1f2937}
.szene{font-size:30px;line-height:1.35;margin:0 0 30px;max-width:1000px}
.beispiel>div{border-radius:18px;padding:26px 28px}
.beispiel b{display:block;font-size:24px;margin-bottom:8px}
.beispiel span{font-size:22px;line-height:1.4}
.beispiel .ohne{background:#fef2f2;color:#7f1d1d}
.beispiel .mit{background:var(--fh);color:var(--f)}
.angebot .wunsch{font-size:17px;color:#4b5568;margin-bottom:6px}
.teile{display:flex;flex-wrap:wrap;gap:12px;margin:22px 0 6px}
.teil{font:inherit;display:inline-flex;align-items:center;gap:8px;background:#fff;color:#66758f;border:2px dashed #cbd5e1;border-radius:99px;padding:6px 18px 6px 8px;font-size:20px;cursor:pointer}
.teil .hk{width:24px;height:24px;border-radius:99px;border:2px solid #cbd5e1;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800}
.teil.an{background:var(--fh);color:#1f2937;border:2px solid var(--fh)}.teil.an .hk{background:var(--f);border-color:var(--f);color:#fff}
.teil b{color:var(--f);margin-left:2px}.teil small{font-size:16px}
.stufen{display:flex;flex-wrap:wrap;gap:2px;width:100%;background:var(--f);border:2px solid var(--f);border-radius:10px;overflow:hidden;margin:8px 0 12px}
.st{flex:1 1 auto;min-width:0;font:inherit;font-size:15px;font-weight:600;padding:7px 8px;border:0;background:#fff;color:var(--f);cursor:pointer;white-space:normal;overflow-wrap:anywhere;text-align:center}
.st.an{background:var(--f);color:#fff}
.st .stern{font-size:11px;margin-left:3px;position:relative;top:-5px}
.stufe-fest{display:flex;align-items:center;min-height:36px;font-size:17px;font-weight:600;color:#4b5568;margin:8px 0 12px;overflow-wrap:anywhere}
.angebote.drin{row-gap:0;grid-template-rows:auto auto auto 1fr}
.drin .angebot{display:grid;grid-row:span 4;grid-template-rows:subgrid;row-gap:0;align-content:start;padding:18px 18px}
.drin .wunsch{font-size:15px}
.angebot.einzeln .listen{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px;align-content:start}
.angebot.einzeln .sb{grid-column:1/-1}
.drin .tarif{font-size:24px;margin-bottom:0}.drin li{font-size:18px;margin:0 0 6px;overflow-wrap:anywhere}.drin .nein{margin-top:6px}
.drin .sb{font-size:16px;color:#4b5568;margin-top:8px}
.slide button{-webkit-appearance:none;appearance:none;margin:0;line-height:1.2}
.bausteine{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.bs{font:inherit;display:inline-flex;align-items:center;gap:8px;border:2px solid #cbd5e1;background:#fff;color:#475569;border-radius:99px;padding:6px 16px 6px 8px;font-size:18px;cursor:pointer}
.bs .hk{width:22px;height:22px;border-radius:99px;border:2px solid #cbd5e1;display:inline-flex;align-items:center;justify-content:center;font-size:14px;font-weight:800}
.bs.an{border-color:var(--f);color:#0b1220}.bs.an .hk{background:var(--f);border-color:var(--f);color:#fff}
.bs small{color:#66758f;font-size:16px}
.wahl{font:inherit;margin-top:12px;border:2px solid var(--f);background:#fff;color:var(--f);border-radius:10px;padding:6px 16px;font-size:17px;font-weight:700;cursor:pointer}
.wahl.an{background:var(--f);color:#fff}
.angebot.gew{background:var(--fh)}
.alle{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:16px;color:#334155;margin:-6px 0 14px}.alle b{color:#0b1220}.alle span{color:#334155}
.vgl{width:100%;border-collapse:separate;border-spacing:0;font-size:19px}
.vgl th,.vgl td{padding:10px 14px;border-bottom:1px solid #e3e9f3;text-align:center;vertical-align:middle}
.vgl tbody th{text-align:left;font-weight:600;color:#1f2937;width:28%}
.vgl thead th{position:relative;padding-top:22px;border-bottom:2px solid #e3e9f3}
.vgl th,.vgl td{overflow-wrap:anywhere}
.vgl thead .tarif{font-size:24px;font-weight:700}.vgl thead .tarif.lang{font-size:20px}.vgl thead .preis{font-size:30px;font-weight:800;color:var(--f)}.vgl thead .preis small{display:block;font-size:15px;font-weight:500;color:#66758f;margin-top:-2px}
.vgl .badge{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:var(--f);color:#fff;font-size:14px;font-weight:700;padding:3px 12px;border-radius:99px;white-space:nowrap}
.vgl .gew{background:var(--fh)}
.vgl .ja-z{color:#16a34a;font-weight:800;font-size:22px}.vgl .nein-z{display:inline-block;width:18px;height:2px;background:#94a3b8;vertical-align:middle}
.vgl .bausteine{justify-content:center;margin-top:0}.vgl .bs{font-size:15px;padding:4px 12px 4px 6px}
.gross .einheit{font-size:30px;font-weight:600;color:#66758f}
.entscheidung{display:grid;grid-template-columns:3fr 2fr;gap:24px;margin-bottom:28px}
.entscheidung>div{border-radius:18px;padding:28px}
.entscheidung span{display:block;font-size:20px;color:#4b5568;margin-bottom:6px}
.entscheidung b{font-size:36px}
.vorschlag{background:var(--f);color:#fff}.vorschlag span{color:rgba(255,255,255,.8)!important}
.alternative{border:2px solid #e3e9f3}
.sicher{display:flex;align-items:center;gap:16px;color:var(--f);font-size:24px;font-weight:600}
.kontakt{display:flex;align-items:center;gap:16px;margin-top:40px;color:var(--f);font-size:24px}
.kontakt span{color:#1f2937}
`;
}

function rahmen(m: Marke, inhalt: string, extraClass = "", frage?: string): string {
  const marke = m.logoUrl ? `<img src="${e(m.logoUrl)}" alt="">` : "";
  return `<section class="slide ${extraClass}"><div class="bar"></div><div class="inhalt">${inhalt}</div><div class="foot"><span class="marke">${marke}${e(m.name)}</span>${frage ? `<span class="frage">${e(frage)}</span>` : ""}<span>${m.gesellschaft ? e(m.gesellschaft) : "Ihre Beratung"}</span></div></section>`;
}

/**
 * Grenzen je Folie (UX-Analyse 15.11.2026, gemessen bei 1280×720 mit Zeilenhöhe 1,2): Vergleich mit 5 Merkmalen und
 * 2 Bausteinen, „In allen Tarifen“ höchstens 3 Punkte; Karte der Empfehlung höchstens 5 Punkte plus 2 Bausteine.
 * Was trotzdem nicht passt (sehr lange Texte), verkleinert folienEinpassen schrittweise, abgeschnitten wird nie.
 */
export const GRENZEN = { merkmale: 5, bausteine: 2, alle: 3, plus: 3, plusEinzeln: 5, minus: 2, kurzname: 18 } as const;

/** Bausteine als Schalter (data-baustein="Angebot:Baustein"); in der Ansicht per Klick, im PDF als Stand. */
function schalter(items: AngebotItem[], i: AngebotItem, mitSparte = false, max = Infinity): string {
  if (!i.bausteine.length) return "";
  const idx = items.indexOf(i);
  const preis = (n: number) => `${n < 0 ? "−" : "+"}${eur(Math.abs(n))}`;
  return `<div class="bausteine">${i.bausteine
    .slice(0, max)
    .map(
      (b, j) =>
        `<button type="button" class="bs${b.aktiv ? " an" : ""}" data-baustein="${idx}:${j}"><span class="hk">${b.aktiv ? "✓" : ""}</span>${mitSparte ? `${e(i.sparte)}: ` : ""}${e(b.name)} <small>${preis(b.beitrag)}</small></button>`,
    )
    .join("")}</div>`;
}

// Baustein „Ohne Selbstbeteiligung“: gehört zur Selbstbeteiligung, nicht in die Plus- bzw. Minus-Liste
const OHNE_SB = /^ohne\s+selbstbeteiligung\b/i;
const drinBausteine = (i: AngebotItem) => i.bausteine.filter((b) => b.aktiv && b.beitrag > 0 && !OHNE_SB.test(b.name)).map((b) => b.name);
// Abgewählte Bausteine als „ohne …“; Bausteine, die selbst mit „Ohne“ beginnen, nie als ✗-Zeile (Ole, 15.11.2026)
const ohneBausteine = (i: AngebotItem) => i.bausteine.filter((b) => !b.aktiv && b.beitrag > 0 && !/^ohne\s/i.test(b.name)).map((b) => `ohne ${b.name}`);

/** Selbstbeteiligung zum Anzeigen (neutral, einmal je Sparte): null bei „keine“ bzw. wenn „Ohne Selbstbeteiligung“ gewählt ist. */
export function selbstbeteiligung(i: Pick<AngebotItem, "selbstbeteiligung" | "bausteine">): string | null {
  const sb = i.selbstbeteiligung?.trim();
  if (!sb || /^(keine?|0|0 €|0,00 €)$/i.test(sb)) return null;
  return i.bausteine.some((b) => b.aktiv && OHNE_SB.test(b.name)) ? null : sb;
}

const JA = /^(ja|✓|✔|x|enthalten|inklusive|inkl\.?)$/i;
const NEIN = /^(nein|\u2014|\u2013|-|nicht enthalten|ohne)$/i;
const istNein = (w: string | undefined) => !w || NEIN.test(w.trim());
const zelle = (w: string | undefined) =>
  istNein(w) ? `<span class="nein-z" title="nicht enthalten"></span>` : JA.test(w!.trim()) ? `<span class="ja-z">✓</span>` : e(w!);

const klein = (s: string) => s.toLocaleLowerCase("de");
const RAND = /^[\s\-\u2013\u2014:,;/|·]+|[\s\-\u2013\u2014:,;/|·]+$/g;

/**
 * Stufennamen für Umschalter und Tabellenkopf (Ole, 15.11.2026): gemeinsamen Anfang bzw. gemeinsames Ende der
 * Tarifnamen weglassen („Haftpflicht Basis“, „Haftpflicht Smart“ → „Basis“, „Smart“). Gibt es keinen sinnvollen
 * gemeinsamen Teil, bleibt der Tarifname aus den Daten, ohne vorangestelltes Spartenwort („Hausrat Komfort“ → „Komfort“).
 * Ohne Tarifnamen: die Sparte.
 */
export function stufenNamen(tarife: (string | null | undefined)[], sparte?: string | null): string[] {
  const roh = tarife.map((t) => (t ?? "").replace(/\s+/g, " ").trim());
  if (roh.length > 1 && roh.every(Boolean)) {
    const w = roh.map((t) => t.split(" "));
    const gleich = (a: string, b: string) => klein(a) === klein(b);
    let vorne = 0;
    while (w.every((x) => x.length > vorne + 1 && gleich(x[vorne], w[0][vorne]))) vorne++;
    let hinten = 0;
    while (w.every((x) => x.length > vorne + hinten + 1 && gleich(x[x.length - 1 - hinten], w[0][w[0].length - 1 - hinten]))) hinten++;
    if (vorne || hinten) {
      const rest = w.map((x) => x.slice(vorne, x.length - hinten).join(" ").replace(RAND, ""));
      if (rest.every(Boolean) && new Set(rest.map(klein)).size === rest.length) return rest;
    }
  }
  const sw = (sparte ?? "").replace(/\s+/g, " ").trim();
  return roh.map((t) => {
    if (!t) return sw;
    if (sw && klein(t).startsWith(`${klein(sw)} `)) {
      const rest = t.slice(sw.length).replace(RAND, "");
      if (rest) return rest;
    }
    return t;
  });
}

/** Merkmale, die diese Stufe nicht hat, eine andere Stufe derselben Sparte aber schon („das ist nicht drin“). */
function fehlendeMerkmale(i: AngebotItem, stufen: AngebotItem[]): string[] {
  return i.merkmale
    .filter((m) => istNein(m.wert) && stufen.some((x) => x !== i && !istNein(x.merkmale.find((y) => y.name === m.name)?.wert)))
    .map((m) => m.name);
}

/** Vergleich als Tabelle wie im Tarifrechner: Stufen als Spalten, Merkmale als Zeilen; Gleiches oben zusammengefasst. */
function vergleichTabelle(
  v: AngebotItem[],
  f: { badge: (i: AngebotItem) => string; preis: (i: AngebotItem) => string; knopf: (i: AngebotItem) => string; schalter: (i: AngebotItem) => string },
): string {
  const namen = [...new Set(v.flatMap((i) => i.merkmale.map((m) => m.name)))];
  const wert = (i: AngebotItem, n: string) => i.merkmale.find((m) => m.name === n)?.wert;
  const gleich = namen.filter((n) => v.every((i) => wert(i, n) != null && klein(wert(i, n)!) === klein(wert(v[0], n)!)));
  const kurz = stufenNamen(v.map((i) => i.tarif), v[0]?.sparte);
  const lang = kurz.some((k) => k.length > GRENZEN.kurzname);
  const mitBausteinen = v.some((i) => i.bausteine.length);
  // gemessen: 4 Spalten mit Bausteinen bzw. lange (zweizeilige) Tarifnamen kosten je eine Merkmalzeile
  const maxMerkmale = GRENZEN.merkmale - (v.length >= 4 && mitBausteinen ? 1 : 0) - (lang ? 1 : 0);
  const anders = namen.filter((n) => !gleich.includes(n)).slice(0, maxMerkmale);
  // „In allen Tarifen“: Leistungen, die jede Stufe hat, dann gleiche Merkmale; eine kurze Zeile
  const gemeinsam = (v[0]?.leistungen ?? []).filter((l) => v.every((i) => i.leistungen.some((x) => klein(x) === klein(l))));
  const gleicheMerkmale = gleich.filter((n) => !istNein(wert(v[0], n))).map((n) => (JA.test(wert(v[0], n)!.trim()) ? n : `${n}: ${wert(v[0], n)}`));
  const alle = [...new Set([...gemeinsam, ...gleicheMerkmale])].slice(0, GRENZEN.alle);
  const col = (i: AngebotItem) => (i.gewaehlt ? ` class="gew"` : "");
  const bs = mitBausteinen ? `<tr><th>Bausteine</th>${v.map((i) => `<td${col(i)}>${f.schalter(i)}</td>`).join("")}</tr>` : "";
  return `${alle.length ? `<div class="alle"><b>In allen Tarifen:</b> ${alle.map((x) => `<span>✓ ${e(x)}</span>`).join("")}</div>` : ""}<table class="vgl"><thead><tr><th></th>${v
    .map((i, k) => `<th${col(i)}>${f.badge(i)}<div class="tarif${lang ? " lang" : ""}">${e(kurz[k])}</div>${f.preis(i)}${f.knopf(i)}</th>`)
    .join("")}</tr></thead><tbody>${anders.map((n) => `<tr><th>${e(n)}</th>${v.map((i) => `<td${col(i)}>${zelle(wert(i, n))}</td>`).join("")}</tr>`).join("")}${bs}</tbody></table>`;
}

const punkte = (xs: string[]) => `<ul>${xs.map((x) => `<li><span class="dot"></span><span>${e(x)}</span></li>`).join("")}</ul>`;

/** Wunsch des Kunden je Sparte (Karte „Sie wollten … → unsere Lösung“). */
const WUNSCH: Record<string, { du: string; sie: string }> = {
  haftpflicht: { du: "abgesichert sein, wenn du anderen einen Schaden zufügst", sie: "abgesichert sein, wenn Sie anderen einen Schaden zufügen" },
  hausrat: { du: "dein Hab und Gut schützen", sie: "Ihr Hab und Gut schützen" },
  rechtsschutz: { du: "im Streitfall nicht auf den Kosten sitzen bleiben", sie: "im Streitfall nicht auf den Kosten sitzen bleiben" },
  wohngebaeude: { du: "dein Haus absichern", sie: "Ihr Haus absichern" },
  tier: { du: "Tierarztkosten planbar machen", sie: "Tierarztkosten planbar machen" },
  unfall: { du: "nach einem Unfall finanziell abgesichert sein", sie: "nach einem Unfall finanziell abgesichert sein" },
};

/** Ein Schadenbeispiel je Sparte: Szene, ohne Schutz, mit Schutz (nüchtern, ohne Schreckensbilder). */
const BEISPIEL: Record<string, { szene: string; ohne: string; mit: string }> = {
  haftpflicht: { szene: "Beim Besuch bei Freunden stoßen Sie aus Versehen den neuen Fernseher um.", ohne: "Sie zahlen den Schaden selbst.", mit: "Ihr Versicherer prüft und zahlt berechtigte Forderungen. Unberechtigte wehrt er für Sie ab." },
  hausrat: { szene: "Die Waschmaschine läuft aus, Möbel und Elektrogeräte sind beschädigt.", ohne: "Sie ersetzen alles selbst.", mit: "Ihr Hausrat wird im versicherten Umfang ersetzt, je nach Tarif zum Neuwert." },
  rechtsschutz: { szene: "Der Vermieter behält die Kaution ein, Sie wollen sich wehren.", ohne: "Anwalt und Gericht zahlen Sie selbst.", mit: "Die Kosten für Anwalt und Gericht werden im versicherten Umfang übernommen." },
  wohngebaeude: { szene: "Ein Sturm deckt Teile des Dachs ab, Regen dringt ein.", ohne: "Reparatur und Folgeschäden zahlen Sie selbst.", mit: "Der Schaden am Haus wird im versicherten Umfang reguliert." },
  tier: { szene: "Ihr Tier verschluckt etwas und muss operiert werden.", ohne: "Die OP kostet schnell mehrere tausend Euro, die Sie selbst zahlen.", mit: "Die Kosten werden im versicherten Umfang erstattet." },
  unfall: { szene: "Sie stürzen beim Wandern und brauchen lange Reha.", ohne: "In der Freizeit zahlt die gesetzliche Unfallversicherung nicht.", mit: "Sie bekommen je nach Tarif eine Leistung, z. B. für den Umbau der Wohnung." },
};

const ersterDesMonats = (d: Date, plus: number) => {
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "numeric" }).formatToParts(d);
  const y = Number(p.find((x) => x.type === "year")!.value);
  const mo = Number(p.find((x) => x.type === "month")!.value) - 1 + plus;
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo, 1)));
};

/**
 * Folien für einen Termin, nach Vertriebsforschung (Ole, 15.11.2026): eine Aussage je Folie, eigene Worte des Kunden,
 * Schadenbeispiel vor der Lösung, Lösung zuerst ohne Preis, Preis erst im Vergleich bzw. auf „Ihr Beitrag“, Beitrag
 * pro Monat (und Tag), vorgeschlagener Beginn als Standard mit Alternative, Widerruf als Sicherheit, Prüffrage in der
 * Fußzeile (kein langer Monolog). Keine Köder-Stufen, keine künstliche Dringlichkeit, kein „Garantie“.
 * angebote = bestätigte Angebote (sonst Platzhalter).
 */
export function folien(d: VorbereitungDaten, angebote: AngeboteDaten | null, m: Marke, an: Ansprache = "sie"): Folie[] {
  const q = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const vorname = d.lead.name.split(/\s+/)[0] ?? d.lead.name;
  const anrede = an === "du" ? vorname : d.lead.name;
  const tier = produktCheckliste(d.lead.produkt)?.key === "tier";
  const items = angebote?.items ?? [];
  const empf = items.filter((i) => i.empfohlen);
  // Leistungen und Beitrag: die im Termin gewählte Stufe je Sparte (Standard: Empfehlung)
  const wahl: AngebotItem[] = empf.length || items.some((i) => i.gewaehlt) ? items.filter((i) => i.gewaehlt) : items.slice(0, 3);
  const sparten = (() => {
    const fromOffers = [...new Set(items.map((i) => sparteKey(i.sparte)))];
    if (fromOffers.length) return fromOffers;
    if (tier) return ["tier"];
    const s = spartenVon(d);
    return s.length ? s : ["haftpflicht", "hausrat"];
  })();
  const R = (inhalt: string, frage?: string, cls = "") => rahmen(m, inhalt, cls, frage);
  const out: Folie[] = [];

  out.push({
    id: "titel",
    titel: "Begrüßung",
    html: R(
      `${m.logoUrl ? `<img class="titellogo" src="${e(m.logoUrl)}" alt="">` : ""}<h1>${e(a(an, `Dein Schutz, ${anrede}`, `Ihr Schutz, ${anrede}`))}</h1><p class="sub">${e(d.lead.produkt)} · mit ${e(d.termin.berater)}</p>
<div class="agenda"><div><b>1</b>${e(a(an, "Deine Situation", "Ihre Situation"))}</div><div><b>2</b>Unsere Empfehlung</div><div><b>3</b>So geht es weiter</div></div>
<p class="hinweis">${e(a(an, "Frag jederzeit dazwischen.", "Fragen Sie jederzeit dazwischen."))}</p>`,
      undefined,
      "titel",
    ),
  });

  const situation = [
    q.lebenssituation ?? d.formular.find((f) => /lebenssituation/i.test(f.label))?.value,
    q.versichern ? `Versichert werden soll: ${q.versichern}` : null,
    q.interesse ? `Wichtig ist: ${q.interesse}` : d.formular.find((f) => /interesse/i.test(f.label))?.value,
    q.tier ?? null,
    q.wohnflaeche ?? null,
    q.gebaeude ?? null,
    q.vorhanden ? `Bisher: ${q.vorhanden}` : null,
  ].filter((x): x is string => !!x).slice(0, 4);
  out.push({
    id: "situation",
    titel: "Das haben Sie uns gesagt",
    html: R(
      `<h2>${e(a(an, `Das hast du uns gesagt, ${vorname}`, "Das haben Sie uns gesagt"))}</h2>${
        situation.length ? `<div class="zitate">${situation.map((x) => `<div class="zitat">${e(x)}</div>`).join("")}</div>` : `<p class="sub">${e(a(an, "Erzähl kurz, worum es dir geht.", "Erzählen Sie kurz, worum es Ihnen geht."))}</p>`
      }`,
      a(an, "Haben wir etwas vergessen?", "Haben wir etwas vergessen?"),
    ),
  });

  const top = sparten.slice(0, 4);
  out.push({
    id: "risiken",
    titel: "Worauf es ankommt",
    html: R(
      `<h2>${e(a(an, "Worauf es bei dir ankommt", "Worauf es bei Ihnen ankommt"))}</h2><div class="kacheln" style="grid-template-columns:repeat(${top.length},1fr)">${top
        .map((k) => `<div class="kachel"><span class="ill">${icon(k)}</span><b>${e(SPARTE_TEXT[k]?.titel ?? k)}</b><span>${e(SPARTE_TEXT[k]?.text ?? "")}</span></div>`)
        .join("")}</div>`,
      a(an, "Was davon ist dir am wichtigsten?", "Was davon ist Ihnen am wichtigsten?"),
    ),
  });

  const b = BEISPIEL[sparten[0]] ?? BEISPIEL.haftpflicht;
  out.push({
    id: "beispiel",
    titel: "Ein Beispiel aus dem Alltag",
    html: R(
      `<h2>Ein Beispiel aus dem Alltag</h2><p class="szene">${e(b.szene)}</p><div class="zwei beispiel"><div class="ohne"><b>Ohne Schutz</b><span>${e(b.ohne)}</span></div><div class="mit"><b>Mit Schutz</b><span>${e(b.mit)}</span></div></div>`,
    ),
  });

  // Selbstbeteiligung je Sparte (mehrere Sparten), „keine“ bzw. gewählte „Ohne Selbstbeteiligung“ weglassen
  const mitSb = wahl.filter((i) => selbstbeteiligung(i));
  const mehrere = new Set(wahl.map((i) => i.sparte)).size > 1;
  const sb = mehrere ? mitSb.map((i) => `${i.sparte} ${selbstbeteiligung(i)}`) : [...new Set(mitSb.map((i) => selbstbeteiligung(i)!))];
  // Stufen als Umschalter (Ole, 15.11.2026): nur der Stufenname (Produkt steht darüber), gewählte Stufe gefüllt,
  // Empfehlung mit Stern; zu lang bzw. viele Stufen: der Umschalter bricht um, nie abschneiden. Eine Stufe: schlichter
  // Untertitel an derselben Stelle und in derselben Höhe.
  const stufen = (i: AngebotItem) => {
    const v = items.filter((x) => x.sparte === i.sparte);
    if (v.length < 2) return `<div class="stufe-fest">${i.tarif ? e(stufenNamen([i.tarif], i.sparte)[0]) : ""}</div>`;
    const kurz = stufenNamen(v.map((x) => x.tarif), i.sparte);
    return `<div class="stufen">${v
      .map((x, k) => `<button type="button" class="st${x.gewaehlt ? " an" : ""}" data-tarif="${items.indexOf(x)}">${e(kurz[k])}${x.empfohlen ? `<span class="stern" title="Empfehlung">★</span>` : ""}</button>`)
      .join("")}</div>`;
  };
  // Was nicht drin ist: abgewählte Bausteine, Merkmale anderer Stufen, Ausschlüsse (die Selbstbeteiligung steht neutral darunter)
  const negativ = (i: AngebotItem) =>
    [...ohneBausteine(i), ...fehlendeMerkmale(i, items.filter((x) => x.sparte === i.sparte)), ...i.ausschluesse].slice(0, GRENZEN.minus);
  const liste = (cls: string, xs: string[]) => (xs.length ? `<div class="${cls}"><ul>${xs.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div>` : "");
  // Empfehlung und „Das ist drin, und das nicht“ auf einer Folie; jede Karte gleich: Wunsch, Produkt, Stufe bzw. Tarif, Merkmale
  const karten = wahl
    .slice(0, 4)
    .map((i) => {
      const w = WUNSCH[sparteKey(i.sparte)];
      const plus = [...i.leistungen.slice(0, wahl.length > 1 ? GRENZEN.plus : GRENZEN.plusEinzeln), ...drinBausteine(i).slice(0, GRENZEN.bausteine)];
      // gewählter Baustein „Ohne Selbstbeteiligung“: neutral „keine“ statt eines zweiten Punkts
      const s = i.bausteine.some((x) => x.aktiv && OHNE_SB.test(x.name)) ? "keine" : selbstbeteiligung(i);
      return `<div class="angebot empf${wahl.length === 1 ? " einzeln" : ""}"><div class="wunsch">${e(a(an, "Du wolltest", "Sie wollten"))}: ${e(w ? a(an, w.du, w.sie) : i.sparte)}</div><div class="tarif">${e(i.sparte)}</div>${stufen(i)}<div class="listen">${liste("ok", plus)}${liste("nein", negativ(i))}${s ? `<div class="sb">Selbstbeteiligung: ${e(s)}</div>` : ""}</div></div>`;
    })
    .join("");
  out.push({
    id: "empfehlung",
    titel: "Unsere Empfehlung",
    html: R(
      `<h2>${e(a(an, "Unsere Empfehlung für dich", "Unsere Empfehlung für Sie"))}</h2>${
        wahl.length
          ? `<div class="angebote drin" style="grid-template-columns:repeat(${Math.min(wahl.length, 4)},minmax(0,1fr))">${karten}</div>`
          : `<div class="leer">${e(a(an, "Dein persönliches Angebot zeigen wir dir im Gespräch.", "Ihr persönliches Angebot zeigen wir Ihnen im Gespräch."))}</div>`
      }`,
      a(an, "Passt das zu dem, was dir wichtig ist?", "Passt das zu dem, was Ihnen wichtig ist?"),
    ),
  });

  // Vergleich je Sparte mit mehreren echten Stufen: Preise erscheinen hier zum ersten Mal
  const nachSparte = new Map<string, AngebotItem[]>();
  for (const i of items) nachSparte.set(i.sparte, [...(nachSparte.get(i.sparte) ?? []), i]);
  for (const [sparte, varianten] of nachSparte) {
    if (varianten.length < 2) continue;
    // höchstens 4 Spalten; die gewählte Stufe ist immer dabei
    const g = varianten.find((i) => i.gewaehlt);
    const v = varianten.length <= 4 || !g || varianten.indexOf(g) < 4 ? varianten.slice(0, 4) : [...varianten.slice(0, 3), g];
    const badge = (i: AngebotItem) => (i.empfohlen ? `<span class="badge">${e(a(an, "Passt zu dir", "Passt zu Ihnen"))}</span>` : "");
    const preis = (i: AngebotItem) => (i.beitragMonat != null ? `<div class="preis">${eur(beitragEffektiv(i)!)} <small>im Monat</small></div>` : "");
    const knopf = (i: AngebotItem) =>
      `<button type="button" class="wahl${i.gewaehlt ? " an" : ""}" data-tarif="${items.indexOf(i)}">${i.gewaehlt ? "✓ Ausgewählt" : "Auswählen"}</button>`;
    const bs = (i: AngebotItem) => schalter(items, i, false, GRENZEN.bausteine);
    const kurz = stufenNamen(v.map((i) => i.tarif), sparte);
    const html = v.some((i) => i.merkmale.length) ? vergleichTabelle(v, { badge, preis, knopf, schalter: bs }) : `<div class="angebote" style="grid-template-columns:repeat(${v.length},minmax(0,1fr))">${v
          .map(
            (i, k) => `<div class="angebot${i.empfohlen ? " empf" : ""}${i.gewaehlt ? " gew" : ""}">${badge(i)}<div class="tarif">${e(kurz[k])}</div>${preis(i)}${punkte(i.leistungen.slice(0, 3))}${bs(i)}${knopf(i)}</div>`,
          )
          .join("")}</div>`;
    out.push({
      id: `vergleich-${sparteKey(sparte)}-${out.length}`,
      titel: `Auswahl ${sparte}`,
      html: R(`<h2>${e(a(an, "Deine Auswahl", "Ihre Auswahl"))}: ${e(sparte)}</h2>${html}`),
    });
  }

  const summe = angebote ? summeEmpfohlen(angebote) : null;
  // Produkte als Schalter: antippen nimmt eine Sparte heraus bzw. wieder hinein
  const sparten1 = [...new Map(items.map((i) => [i.sparte, i])).values()];
  const produkte =
    sparten1.length > 1
      ? `<div class="teile">${sparten1
          .map((first) => {
            const g = items.find((x) => x.sparte === first.sparte && x.gewaehlt);
            const p = g ? beitragEffektiv(g) : null;
            return `<button type="button" class="teil${g ? " an" : ""}" data-sparte="${items.indexOf(first)}"><span class="hk">${g ? "✓" : ""}</span>${e(first.sparte)}${p != null ? ` <b>${eur(p)}</b>` : g ? "" : ` <small>${e(a(an, "nicht gewählt", "nicht gewählt"))}</small>`}</button>`;
          })
          .join("")}</div>`
      : "";
  out.push({
    id: "beitrag",
    titel: "Ihr Beitrag",
    html: R(
      `<h2>${e(a(an, "Dein Beitrag", "Ihr Beitrag"))}</h2>${
        summe != null
          ? `<div class="gross">${eur(summe)} <span class="einheit">im Monat</span></div><p class="sub">Das sind rund ${eur(summe / 30)} am Tag.</p>${produkte}${wahl.some((i) => i.bausteine.length) ? wahl.map((i) => schalter(items, i, mehrere)).join("") : ""}${sb.length ? `<p class="sub">Selbstbeteiligung: ${e(sb.join(", "))}</p>` : ""}`
          : `<div class="leer">${e(a(an, "Deinen Beitrag rechnen wir gemeinsam.", "Ihren Beitrag rechnen wir gemeinsam."))}</div>${produkte}`
      }`,
      a(an, "Passt das für dich?", "Passt das für Sie?"),
    ),
  });

  const ab = ersterDesMonats(d.termin.startsAt, 1);
  const alt = ersterDesMonats(d.termin.startsAt, 2);
  out.push({
    id: "entscheidung",
    titel: "Ihre Entscheidung",
    html: R(
      `<h2>${e(a(an, "Deine Entscheidung", "Ihre Entscheidung"))}</h2><div class="entscheidung"><div class="vorschlag"><span>Unser Vorschlag</span><b>Schutz ab ${e(ab)}</b></div><div class="alternative"><span>Oder lieber</span><b>ab ${e(alt)}?</b></div></div>
<div class="sicher">${icon("haftpflicht", 40)}<span>${e(a(an, "Du hast 14 Tage Widerrufsrecht, ohne Angabe von Gründen.", "Sie haben 14 Tage Widerrufsrecht, ohne Angabe von Gründen."))}</span></div>`,
    ),
  });

  out.push({
    id: "weiter",
    titel: "So geht es weiter",
    html: R(
      `<h2>So geht es weiter</h2><div class="schritte">
<div class="schritt"><div class="n">1</div><b>Antrag ausfüllen</b><span>Jetzt gemeinsam, etwa 10 Minuten${tier ? ", mit der Chipnummer" : ""}.</span></div>
<div class="schritt"><div class="n">2</div><b>Unterlagen</b><span>Kommen per E-Mail, zusammen mit der Beratungsdokumentation.</span></div>
<div class="schritt"><div class="n">3</div><b>Geschützt</b><span>Ab dem vereinbarten Beginn.</span></div></div>`,
    ),
  });

  out.push({
    id: "danke",
    titel: "Danke",
    html: R(
      `<h1>${e(a(an, `Vielen Dank, ${vorname}!`, "Vielen Dank für Ihr Vertrauen!"))}</h1><p class="sub">${e(
        tier
          ? a(an, "Kennst du jemanden, der gerade ein Tier bekommt? Wir beraten auch deine Freunde gern.", "Kennen Sie jemanden, der gerade ein Tier bekommt? Wir beraten auch Ihre Freunde gern.")
          : a(an, "Kennst du jemanden, der gerade umzieht, baut oder eine Familie gründet? Wir beraten auch deine Freunde gern.", "Kennen Sie jemanden, der gerade umzieht, baut oder eine Familie gründet? Wir beraten auch Ihre Freunde gern."),
      )}</p><div class="kontakt">${icon("person", 56)}<span>${e(a(an, "Dein Ansprechpartner", "Ihr Ansprechpartner"))}: <b>${e(d.termin.berater)}</b>${a(an, ", einfach per WhatsApp.", ", einfach per WhatsApp.")}</span></div>`,
      undefined,
      "titel",
    ),
  });
  return out;
}

/** Alle Folien als HTML-Dokument (PDF, Querformat 1280×720 je Seite); eingepasst wie in der Ansicht. */
export function praesentationHtml(fs: Folie[], m: Marke, titel: string): string {
  const einpassen = `<script>(function(){var f=${folienEinpassen.toString()};f(document);if(document.fonts)document.fonts.ready.then(function(){f(document)})})()</script>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${e(titel)}</title><style>@page{size:1280px 720px;margin:0}body{margin:0}.slide{break-after:page}${praesentationCss(m)}</style></head><body><div class="deck">${fs.map((f) => f.html).join("")}</div>${einpassen}</body></html>`;
}
