// Beratungsstrecke (Ole, 15.11.2026): bebilderte Präsentation je Termin, per Klick aus den bestätigten Angeboten und
// den Angaben des Kunden. Der Berater teilt sie im Videocall (ohne Sprechzettel, Ole 15.11.2026). Branding nach
// Gesellschaft (Allianz, AXA, Signal Iduna) bzw. PG, Logo von der Agentur- bzw. Maklerseite (vom Berater bestätigt).
//
// Reine Funktionen: Folien als HTML-Fragmente + CSS (gleich für Ansicht und PDF, 1280×720).

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { spartenVon, type VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { beitragAus, beitragEffektiv, paketWaehlen, type AngebotItem, type AngeboteDaten, type BeitragsUebersicht } from "@/lib/angebote-daten";
import { anzahlFuer, bedingungText, naechsteText, prozentFuer, staffelLeiste, type KombiErgebnis } from "@/lib/kombi-rabatt";
import { SCHUTZ_STATUS, type SchutzZeile } from "@/lib/schutz-ueberblick";
import { a, type Ansprache } from "@/lib/ansprache";
import { folienEinpassen } from "@/lib/folien-einpassen";
import type { PraesentationVariante } from "@/lib/praesentation-variante";
import { beitragsUnterschiedJahr, kuendigungText, unterschiedText, WERT_PRUEFEN, type BisherSpalte } from "@/lib/bisheriger-vertrag";

export type Marke = {
  name: string;
  gesellschaft: string | null;
  farbe: string;
  farbeHell: string;
  akzent: string;
  logoUrl: string | null;
  /** Nur Makler (§ 60 Abs. 1, 2 VVG): Vorlage für den Hinweis auf die Marktauswahl, {gesellschaften} wird ersetzt. */
  markthinweis?: string | null;
};

/** Standard für Makler, änderbar unter Einstellungen → Präsentation (Customer.maklerMarkthinweis). */
export const MARKTHINWEIS_STANDARD = "Verglichen wurden Tarife von {gesellschaften}.";

/** Vorlage für den Marktauswahl-Hinweis: nur bei Maklern, eigener Text vor Standard. */
export function markthinweisVorlage(vermittlerTyp: string | null | undefined, eigener?: string | null): string | null {
  if (vermittlerTyp !== "makler") return null;
  return eigener?.trim() || MARKTHINWEIS_STANDARD;
}

/** „A“, „A und B“, „A, B und C“ */
export const aufzaehlung = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} und ${xs[xs.length - 1]}`);

/** Hinweis mit den Gesellschaften der gezeigten Tarife; null ohne Vorlage oder ohne bekannte Gesellschaft. */
export function markthinweisText(vorlage: string | null | undefined, items: Pick<AngebotItem, "gesellschaft">[]): string | null {
  if (!vorlage) return null;
  const gs = [...new Set(items.map((i) => i.gesellschaft?.trim()).filter((g): g is string => !!g))];
  if (!vorlage.includes("{gesellschaften}")) return vorlage;
  return gs.length ? vorlage.replaceAll("{gesellschaften}", aufzaehlung(gs)) : null;
}

/** Branding nach Gesellschaft (aus dem Kundennamen, z. B. „Allianz Agentur Lohmann“), sonst PG. */
export function markeFuer(kunde: { name: string; vermittlerTyp?: string | null; maklerMarkthinweis?: string | null }, logoUrl: string | null = null): Marke {
  const n = kunde.name;
  const name = n.trim();
  const markthinweis = markthinweisVorlage(kunde.vermittlerTyp, kunde.maklerMarkthinweis);
  if (/allianz/i.test(n)) return { name, gesellschaft: "Allianz", farbe: "#003781", farbeHell: "#e6eef7", akzent: "#003781", logoUrl, markthinweis };
  if (/\baxa\b/i.test(n)) return { name, gesellschaft: "AXA", farbe: "#00008f", farbeHell: "#e8e8f6", akzent: "#ff1721", logoUrl, markthinweis };
  if (/signal\s*iduna/i.test(n)) return { name, gesellschaft: "SIGNAL IDUNA", farbe: "#004f9f", farbeHell: "#e6eff8", akzent: "#ffd100", logoUrl, markthinweis };
  return { name, gesellschaft: null, farbe: "#2563eb", farbeHell: "#e5edff", akzent: "#2563eb", logoUrl, markthinweis };
}

/**
 * produkt: Sparte einer Produktfolie (Vergleich), z. B. für „Unfall hinzugefügt“ im Termin.
 * hinweis: Sprechhinweis nur für den Vermittler (unter dem Deck, nie in der Folie, nicht im Kundenlink und PDF).
 */
export type Folie = { id: string; titel: string; html: string; produkt?: string; hinweis?: string };

/** Splittest (lib/praesentation-variante.ts) und Stand der Zusage für die Abschlussfolie. */
export type FolienOptionen = { variante?: PraesentationVariante; zugesagtAm?: Date | null };

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
.ok li::before{content:"✔";color:#047857;font-weight:900;margin-right:10px}
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
.slide .markthinweis{position:absolute;left:80px;right:80px;bottom:5px;font-size:14px;line-height:1.3;color:#8a94a6}
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
.st .stern{font-size:14px;margin-left:3px;position:relative;top:-4px}
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
.vgl .ja-z{color:#047857;font-weight:900;font-size:24px;line-height:1}.vgl .nein-z{font-size:15px;line-height:1.15;color:#475569}.vgl.mit-bisher .nein-z{font-size:14px;line-height:1.05}.alle .ja-k{color:#047857;font-weight:900;font-style:normal}
.vgl .bisher{background:#f4f6f9;color:#334155}
.vgl.mit-bisher th,.vgl.mit-bisher td{padding:8px 10px}.vgl.mit-bisher thead th{padding-top:20px}.vgl.mit-bisher tbody th{width:22%}
.vgl.mit-bisher .bs{font-size:14px;padding:3px 10px 3px 5px;gap:6px}.vgl.mit-bisher .bs small{white-space:nowrap;font-size:14px}.vgl.mit-bisher .bausteine{gap:6px}
.vgl thead th.bisher{width:14%;overflow-wrap:normal;hyphens:auto}
.vgl thead th.bisher .bt{font-size:13px;font-weight:700;color:#66758f;margin-bottom:2px}
.vgl thead th.bisher .bg{font-size:15px;font-weight:600;color:#4b5568}
.vgl thead th.bisher .tarif{font-size:18px}.vgl thead th.bisher .preis{font-size:22px;color:#334155}
.vgl .pruef{font-size:15px;color:#66758f;font-style:italic}
.bisher-fuss{display:flex;flex-wrap:wrap;gap:0 24px;margin-top:8px;font-size:16px;line-height:1.3;color:#334155}.bisher-fuss b{color:var(--f)}
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
.statt{font-size:24px;color:#4b5568;margin:0 0 6px}.statt s{color:#66758f}.statt b{color:#15803d}
.staffel{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:16px 0 4px}
.stf{display:inline-flex;align-items:baseline;gap:6px;border:2px solid #e3e9f3;border-radius:10px;padding:6px 12px;font-size:17px;color:#66758f}
.stf b{font-size:20px;color:#334155}.stf.an{border-color:var(--f);background:var(--f);color:#fff}.stf.an b{color:#fff}
.staffel .naechste{font-size:18px;font-weight:700;color:var(--f);margin-left:6px}
.slide .fussnote{font-size:15px;line-height:1.35;color:#66758f;margin:14px 0 0}
.schutz{display:grid;gap:10px}
.sz{display:grid;grid-template-columns:22px 270px minmax(0,1fr) auto;align-items:center;gap:6px 16px;border:2px solid #e3e9f3;border-radius:16px;padding:10px 16px;min-height:64px}
.sz .ampel{width:18px;height:18px;border-radius:99px}
.sz b{font-size:22px}.sz .stl{font-size:17px;font-weight:700}.sz .info{display:block;font-size:17px;color:#4b5568;font-weight:400;margin-top:2px}
.sz .mit{font:inherit;border:2px solid var(--f);background:#fff;color:var(--f);border-radius:10px;padding:6px 14px;font-size:17px;font-weight:700;cursor:pointer;white-space:nowrap}
.sz .mit.an{background:var(--f);color:#fff}
.kombi-zeile{margin-top:14px;font-size:20px;color:#1f2937}.kombi-zeile b{color:var(--f)}
.kontakt span{color:#1f2937}
.tag-preis{font-size:30px;line-height:1.3;color:#1f2937;margin:4px 0 6px}.tag-preis b{color:var(--f);font-size:38px}
.abschluss{display:grid;grid-template-columns:3fr 2fr;gap:24px;margin-bottom:22px}
.abschluss>div{border-radius:18px;padding:24px 28px}
.paket{border:2px solid var(--f)}
.paket-liste{display:grid;gap:8px}.paket-liste li{display:flex;justify-content:space-between;gap:16px;margin:0;font-size:24px;color:#1f2937}.paket-liste li b{white-space:nowrap}
.paket-summe{display:flex;justify-content:space-between;align-items:baseline;gap:16px;border-top:2px solid #e3e9f3;margin-top:14px;padding-top:12px;font-size:20px;color:#4b5568}
.paket-summe b{font-size:36px;color:var(--f);white-space:nowrap}.paket-summe small{font-size:18px;font-weight:500;color:#66758f}
.leer-klein{font-size:22px;color:#66758f;margin:0}
.beginn{background:var(--f);color:#fff;display:flex;flex-direction:column;justify-content:center}
.beginn span{font-size:20px;color:rgba(255,255,255,.85)}.beginn b{font-size:34px;margin:4px 0}.beginn em{font-style:normal;font-size:20px;color:rgba(255,255,255,.85)}
.sicher-reihe{display:flex;flex-wrap:wrap;gap:10px 28px;margin-bottom:26px;color:#1f2937;font-size:21px}
.sicher-reihe span{display:inline-flex;align-items:center;gap:8px}.sicher-reihe svg{color:#047857}
.zusage{font:inherit;display:inline-flex;align-items:center;justify-content:center;min-width:420px;padding:18px 40px;border:0;border-radius:14px;background:var(--a);color:#fff;font-size:28px;font-weight:800;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.12)}
.zusage.an{background:#047857}
.einwand .punkte li{font-size:26px}
.einwand .gegen{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-bottom:26px}
.einwand .gegen>div{border-radius:18px;padding:24px 28px;background:var(--fh)}
.einwand .gegen span{display:block;font-size:20px;color:#4b5568;margin-bottom:6px}.einwand .gegen b{font-size:40px;color:var(--f)}
.einwand .gegen .schaden{background:#fef2f2}.einwand .gegen .schaden b{font-size:26px;color:#7f1d1d;line-height:1.3}
.einstieg .zitate{margin-top:26px}
.ablauf{display:flex;flex-wrap:wrap;gap:10px 30px;margin-top:30px;font-size:20px;color:#4b5568}.ablauf b{color:var(--f);margin-right:8px}
.pakete{display:grid;gap:20px;margin-bottom:16px;align-items:stretch}
.pk{font:inherit;text-align:left;display:flex;flex-direction:column;gap:6px;border:2px solid #e3e9f3;background:#fff;color:#0b1220;border-radius:18px;padding:16px 22px;line-height:1.25}
button.pk{cursor:pointer}
.pk.an{border:3px solid var(--f);background:var(--fh);padding:15px 21px}
.pk-kopf{display:flex;align-items:center;gap:10px;font-size:18px;font-weight:700;color:var(--f)}
.pk-wahl{flex:0 0 26px;width:26px;height:26px;border-radius:99px;border:2px solid #cbd5e1;display:inline-flex;align-items:center;justify-content:center;font-size:15px;font-weight:800;color:transparent;background:#fff}
.pk.an .pk-wahl{background:var(--f);border-color:var(--f);color:#fff}
.pk-zeile{display:flex;justify-content:space-between;gap:12px;font-size:20px;color:#1f2937}.pk-zeile b{white-space:nowrap}
.pk-ohne{font-size:16px;color:#475569}
.pk-summe{margin-top:auto;border-top:2px solid #e3e9f3;padding-top:8px;font-size:18px;color:#4b5568}.pk-summe b{font-size:34px;color:var(--f);white-space:nowrap}
.pk-tag{font-size:17px;color:#334155}
.pakete .beginn{border-radius:18px;padding:20px 24px;background:#f4f6f9;color:#0b1220}.pakete .beginn span,.pakete .beginn em{color:#4b5568}.pakete .beginn b{font-size:30px;color:var(--f)}
.vergleich-bisher{display:flex;flex-wrap:wrap;gap:4px 24px;margin:0 0 12px;font-size:18px;color:#334155}.vergleich-bisher b{color:#0b1220}
.pakete~.sicher-reihe{margin-bottom:16px}
.zusage-zeile{display:flex;flex-wrap:wrap;align-items:center;gap:12px 24px}
.zusage-zeile .unverbindlich{font-size:18px;color:#4b5568}
`;
}

function rahmen(m: Marke, inhalt: string, extraClass = "", frage?: string, hinweis?: string | null): string {
  const marke = m.logoUrl ? `<img src="${e(m.logoUrl)}" alt="">` : "";
  return `<section class="slide ${extraClass}"><div class="bar"></div><div class="inhalt">${inhalt}</div>${hinweis ? `<div class="markthinweis" data-markthinweis>${e(hinweis)}</div>` : ""}<div class="foot"><span class="marke">${marke}${e(m.name)}</span>${frage ? `<span class="frage">${e(frage)}</span>` : ""}<span>${m.gesellschaft ? e(m.gesellschaft) : "Ihre Beratung"}</span></div></section>`;
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
  // Beitrag 0: im Tarif enthalten (Katalog „inklusive“)
  const preis = (n: number) => (n === 0 ? "inklusive" : `${n < 0 ? "−" : "+"}${eur(Math.abs(n))}`);
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
  // „nicht enthalten“ als Wort statt Strich, kräftiger Haken in AA-Grün (Usability-Check 18.11.2026)
  istNein(w) ? `<span class="nein-z">nicht enthalten</span>` : JA.test(w!.trim()) ? `<span class="ja-z" aria-label="enthalten">✔</span>` : e(w!);

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

/**
 * Spaltennamen im Vergleich (Tarifkatalog, Ole 15.11.2026): Tarife verschiedener Gesellschaften (Makler) mit der
 * Gesellschaft davor („AXA Komfort“, „Allianz Komfort“), sonst die Stufennamen.
 */
export function spaltenNamen(v: { tarif: string | null | undefined; gesellschaft: string | null | undefined }[], sparte?: string | null): string[] {
  const ges = new Set(v.map((i) => klein(i.gesellschaft?.trim() ?? "")).filter(Boolean));
  if (ges.size <= 1) return stufenNamen(v.map((i) => i.tarif), sparte);
  return v.map((i) => {
    const t = stufenNamen([i.tarif], sparte)[0];
    const g = i.gesellschaft?.trim() ?? "";
    return !g || klein(t).startsWith(klein(g)) ? t : `${g} ${t}`.trim();
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
  /** Spalte „Ihr bisheriger Vertrag“ (links von den neuen Tarifen) */
  bisher?: { spalte: BisherSpalte; titel: string } | null,
): string {
  const namen = [...new Set(v.flatMap((i) => i.merkmale.map((m) => m.name)))];
  const wert = (i: AngebotItem, n: string) => i.merkmale.find((m) => m.name === n)?.wert;
  const gleich = namen.filter((n) => v.every((i) => wert(i, n) != null && klein(wert(i, n)!) === klein(wert(v[0], n)!)));
  const kurz = spaltenNamen(v, v[0]?.sparte);
  const lang = kurz.some((k) => k.length > GRENZEN.kurzname);
  const mitBausteinen = v.some((i) => i.bausteine.length);
  // gemessen: 4 Spalten mit Bausteinen bzw. lange (zweizeilige) Tarifnamen kosten je eine Merkmalzeile
  // Spalte „Ihr bisheriger Vertrag“: eine Zeile weniger (Beitragsunterschied und Kündigung stehen darunter)
  const maxMerkmale = GRENZEN.merkmale - (v.length >= 4 && mitBausteinen ? 1 : 0) - (lang ? 1 : 0) - (bisher ? 1 : 0);
  // Zeilen: die gewählten Merkmale in ihrer Reihenfolge (Ole, 16.11.2026: „die Merkmale, die man auswählt, landen
  // nicht in der Präsi“, gleiche Werte verschwanden in „In allen Tarifen“). Sind es mehr als Platz ist, zuerst die,
  // in denen sich die Stufen unterscheiden.
  const vorrang = [...namen.filter((n) => !gleich.includes(n)), ...namen.filter((n) => gleich.includes(n))].slice(0, maxMerkmale);
  const anders = namen.filter((n) => vorrang.includes(n));
  // „In allen Tarifen“: Leistungen, die jede Stufe hat, dann gleiche Merkmale ohne eigene Zeile; eine kurze Zeile
  const alsZeile = (l: string) => anders.some((n) => klein(l) === klein(n) || klein(l).startsWith(`${klein(n)}:`));
  const gemeinsam = (v[0]?.leistungen ?? []).filter((l) => !alsZeile(l) && v.every((i) => i.leistungen.some((x) => klein(x) === klein(l))));
  const gleicheMerkmale = gleich
    .filter((n) => !anders.includes(n) && !istNein(wert(v[0], n)))
    .map((n) => (JA.test(wert(v[0], n)!.trim()) ? n : `${n}: ${wert(v[0], n)}`));
  const alle = [...new Set([...gemeinsam, ...gleicheMerkmale])].slice(0, GRENZEN.alle);
  const col = (i: AngebotItem) => (i.gewaehlt ? ` class="gew"` : "");
  const b = bisher?.spalte;
  const bTd = (inhalt: string) => (b ? `<td class="bisher">${inhalt}</td>` : "");
  const bZelle = (n: string) => {
    const roh = b?.merkmale.find((m) => klein(m.name) === klein(n))?.wert ?? WERT_PRUEFEN;
    // Unbekanntes neutral, nie „nicht enthalten“. Auch ein „nein“ (Tarifkatalog von heute, Police unklar) zeigt
    // „laut Police prüfen“: ältere Vertragsgenerationen können abweichen (Ole, 18.11.2026)
    const w = istNein(roh) ? WERT_PRUEFEN : roh;
    return w === WERT_PRUEFEN ? `<span class="pruef">${e(WERT_PRUEFEN)}</span>` : zelle(w);
  };
  // Kopf schmal: Gesellschaft und Tarif getrennt, Summe und Selbstbeteiligung stehen unter der Tabelle
  const bKopf = b
    ? `<th class="bisher"><div class="bt">${e(bisher!.titel)}</div>${b.gesellschaft ? `<div class="bg">${e(b.gesellschaft)}</div>` : ""}${b.tarif ? `<div class="tarif">${e(b.tarif)}</div>` : ""}${
        b.beitragMonat != null ? `<div class="preis">${eur(b.beitragMonat)} <small>im Monat</small></div>` : ""
      }</th>`
    : "";
  const bs = mitBausteinen ? `<tr><th>Bausteine</th>${bTd("")}${v.map((i) => `<td${col(i)}>${f.schalter(i)}</td>`).join("")}</tr>` : "";
  return `${alle.length ? `<div class="alle"><b>In allen Tarifen:</b> ${alle.map((x) => `<span><i class="ja-k">✔</i> ${e(x)}</span>`).join("")}</div>` : ""}<table class="vgl${b ? " mit-bisher" : ""}"><thead><tr><th></th>${bKopf}${v
    .map((i, k) => `<th${col(i)}>${f.badge(i)}<div class="tarif${lang ? " lang" : ""}">${e(kurz[k])}</div>${f.preis(i)}${f.knopf(i)}</th>`)
    .join("")}</tr></thead><tbody>${anders.map((n) => `<tr><th>${e(n)}</th>${b ? bTd(bZelle(n)) : ""}${v.map((i) => `<td${col(i)}>${zelle(wert(i, n))}</td>`).join("")}</tr>`).join("")}${bs}</tbody></table>`;
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

/** Du-Fassung der Schadenbeispiele (19.11.2026: bisher stand das Beispiel auch bei „du“ in Sie-Form). */
const BEISPIEL_DU: Record<string, { szene: string; ohne: string; mit: string }> = {
  haftpflicht: { szene: "Beim Besuch bei Freunden stößt du aus Versehen den neuen Fernseher um.", ohne: "Du zahlst den Schaden selbst.", mit: "Dein Versicherer prüft und zahlt berechtigte Forderungen. Unberechtigte wehrt er für dich ab." },
  hausrat: { szene: "Die Waschmaschine läuft aus, Möbel und Elektrogeräte sind beschädigt.", ohne: "Du ersetzt alles selbst.", mit: "Dein Hausrat wird im versicherten Umfang ersetzt, je nach Tarif zum Neuwert." },
  rechtsschutz: { szene: "Der Vermieter behält die Kaution ein, du willst dich wehren.", ohne: "Anwalt und Gericht zahlst du selbst.", mit: "Die Kosten für Anwalt und Gericht werden im versicherten Umfang übernommen." },
  wohngebaeude: { szene: "Ein Sturm deckt Teile des Dachs ab, Regen dringt ein.", ohne: "Reparatur und Folgeschäden zahlst du selbst.", mit: "Der Schaden am Haus wird im versicherten Umfang reguliert." },
  tier: { szene: "Dein Tier verschluckt etwas und muss operiert werden.", ohne: "Die OP kostet schnell mehrere tausend Euro, die du selbst zahlst.", mit: "Die Kosten werden im versicherten Umfang erstattet." },
  unfall: { szene: "Du stürzt beim Wandern und brauchst lange Reha.", ohne: "In der Freizeit zahlt die gesetzliche Unfallversicherung nicht.", mit: "Du bekommst je nach Tarif eine Leistung, z. B. für den Umbau der Wohnung." },
};

const beispielFuer = (k: string, an: Ansprache) => (an === "du" ? (BEISPIEL_DU[k] ?? BEISPIEL_DU.haftpflicht) : (BEISPIEL[k] ?? BEISPIEL.haftpflicht));

const ersterDesMonats = (d: Date, plus: number) => {
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", year: "numeric", month: "numeric" }).formatToParts(d);
  const y = Number(p.find((x) => x.type === "year")!.value);
  const mo = Number(p.find((x) => x.type === "month")!.value) - 1 + plus;
  return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo, 1)));
};

/**
 * Sprechhinweise für den Vermittler (Sales-Coach, 19.11.2026): ein Satz je Folie, was er sagt bzw. fragt. Nur unter
 * dem Deck (zum Aufklappen), nie in der Folie. Vergleichsfolien: Schlüssel „vergleich“.
 */
export const SPRECHHINWEIS: Record<string, string> = {
  titel: "Ablauf in einem Satz nennen, dann fragen: Passt es, wenn wir uns 20 Minuten nehmen?",
  situation: "Vorlesen und fragen: Stimmt das so, hat sich etwas geändert? Dann den Kunden erzählen lassen.",
  risiken: "Fragen, was am wichtigsten ist, und genau dort einsteigen.",
  beispiel: "Fragen: Ist Ihnen oder jemandem in Ihrem Umfeld so etwas schon passiert? Zuhören.",
  empfehlung: "Je Karte ein Satz zum Wunsch des Kunden, in seinen Worten. Noch keinen Preis nennen.",
  vergleich: "Mit der Empfehlung beginnen, den Unterschied zur kleineren Stufe in einem Satz erklären, dann den Kunden wählen lassen.",
  ueberblick: "Lücken ruhig benennen. „Mit anschauen“ nur, wenn der Kunde zustimmt, sonst für den nächsten Termin merken.",
  beitrag: "Beitrag nennen, dann schweigen. Erst danach fragen: Passt das für Sie?",
  entscheidung: "Kurz zusammenfassen, Beginn vorschlagen und fragen: Sollen wir das so machen? Bei Ja: „Ja, so machen wir es“ antippen.",
  weiter: "Antrag jetzt gemeinsam ausfüllen, nicht auf später verschieben.",
  danke: "Nach Empfehlungen fragen: Wem in Ihrem Umfeld würde das auch helfen?",
};

const hinweisFuer = (id: string) => SPRECHHINWEIS[id.startsWith("vergleich-") ? "vergleich" : id];

/** Sprechhinweise der Fassung C, wo sie von B abweichen (Einstieg, Entscheidung mit einem bzw. zwei Paketen). */
export const SPRECHHINWEIS_C = {
  situation: "Begrüßen, Ablauf in einem Satz. Dann vorlesen und fragen: Stimmt das so, fehlt etwas? Den Kunden erzählen lassen.",
  zweiPakete: "Beide Pakete in je einem Satz nennen, beim kleineren sagen, was fehlt. Dann fragen: Welches passt besser zu Ihnen? Schweigen. Gewähltes Paket antippen, bei Ja „Ja, so machen wir es“.",
  einPaket: "Kurz zusammenfassen, Beitrag nennen, Beginn vorschlagen und fragen: Sollen wir das so machen? Bei Ja: „Ja, so machen wir es“ antippen.",
} as const;

/** Cross-Selling-Sparte, die (noch) nicht im Vergleich ist: kein Vergleich, kein Beitrag, nur im Überblick. */
const zusatzAus = (i: AngebotItem, items?: AngebotItem[]) => !!i.zusatz && !(items ?? []).some((x) => x.sparte === i.sparte && x.gewaehlt) && !i.gewaehlt;

/**
 * Folien für einen Termin, nach Vertriebsforschung (Ole, 15.11.2026): eine Aussage je Folie, eigene Worte des Kunden,
 * Schadenbeispiel vor der Lösung, Lösung zuerst ohne Preis, Preis erst im Vergleich bzw. auf „Ihr Beitrag“, Beitrag
 * pro Monat (und Tag), vorgeschlagener Beginn als Standard mit Alternative, Widerruf als Sicherheit, Prüffrage in der
 * Fußzeile (kein langer Monolog). Keine Köder-Stufen, keine künstliche Dringlichkeit, kein „Garantie“.
 * angebote = bestätigte Angebote (sonst Platzhalter).
 *
 * Variante B (Splittest, Ole 19.11.2026, Abschluss-Dramaturgie): ohne „Worauf es ankommt“ (das Schadenbeispiel macht
 * das Risiko greifbar), Beitrag mit „pro Tag“ groß, Entscheidung mit Zusammenfassung (Tarife, Beitrag, Beginn),
 * Einwänden vorweg (Widerruf, Unterlagen, Kündigung des bisherigen Vertrags) und dem Schritt „Ja, so machen wir es“.
 * Seit 19.11.2026 Standard für alle Termine (ohne Angabe: A, nur noch für Tests).
 *
 * Variante C (Herausforderer gegen B, Splittest „praesentation“, 19.11.2026; Analyse mit Vertriebscoach, UX, Texter,
 * vier Personas und Rechtsblick): wie B, aber
 *   1. Einstieg mit dem Anliegen des Kunden: Begrüßung und „Das haben Sie uns gesagt“ auf einer Folie („Darum geht es
 *      Ihnen“, Prüffrage „Stimmt das so?“), Ablauf in einer Zeile.
 *   2. Kein eigener „Ihr Beitrag“: Der Beitrag steht einmal, direkt an der Entscheidung (bis zur Entscheidung zwei
 *      Folien weniger als B).
 *   3. Entscheidung als Wahl zwischen zwei Paketen statt Ja oder Nein: Empfehlung und je Sparte eine Stufe kleiner
 *      (echte Preise aus den bestätigten Angeboten, Kombi-Rabatt je Paket gerechnet, was im kleineren fehlt, steht
 *      dabei). Antippen wählt das Paket (data-paket), danach ein Schritt „Ja, so machen wir es“.
 *   4. Bisheriger Vertrag in Euro an der Entscheidung, wenn erfasst (Beitrag im Monat und Unterschied im Jahr).
 *   5. „Unverbindlich“ direkt am Knopf (wie im Kundenlink), für Kunden, die einen Klick für eine Unterschrift halten.
 * Keine Köder-Stufe (die kleinere ist die nächste echte Stufe, nicht die billigste), kein sozialer Beweis, keine
 * Dringlichkeit, keine Ersparnisversprechen. Ergebnisse des Komplettchecks bleiben auf „Ihr Schutz im Überblick“.
 */
export function folien(d: VorbereitungDaten, angebote: AngeboteDaten | null, m: Marke, an: Ansprache = "sie", opt: FolienOptionen = {}): Folie[] {
  const fs = folienRoh(d, angebote, m, an, opt);
  // Fassung C setzt eigene Hinweise an der Folie (Einstieg, Entscheidung mit zwei Paketen)
  return fs.map((f) => (f.hinweis || !hinweisFuer(f.id) ? f : { ...f, hinweis: hinweisFuer(f.id) }));
}

function folienRoh(d: VorbereitungDaten, angebote: AngeboteDaten | null, m: Marke, an: Ansprache, opt: FolienOptionen): Folie[] {
  // C (Herausforderer, 19.11.2026) baut auf B auf: alles aus B, dazu die Abweichungen im Kopf dieser Funktion
  const C = opt.variante === "C";
  const B = opt.variante === "B" || C;
  const q = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const vorname = d.lead.name.split(/\s+/)[0] ?? d.lead.name;
  const anrede = an === "du" ? vorname : d.lead.name;
  const tier = produktCheckliste(d.lead.produkt)?.key === "tier";
  const items = angebote?.items ?? [];
  const empf = items.filter((i) => i.empfohlen);
  // Leistungen und Beitrag: die im Termin gewählte Stufe je Sparte (Standard: Empfehlung)
  const wahl: AngebotItem[] = empf.length || items.some((i) => i.gewaehlt) ? items.filter((i) => i.gewaehlt) : items.slice(0, 3);
  const sparten = (() => {
    const fromOffers = [...new Set(items.filter((i) => !zusatzAus(i)).map((i) => sparteKey(i.sparte)))];
    if (fromOffers.length) return fromOffers;
    if (tier) return ["tier"];
    const s = spartenVon(d);
    return s.length ? s : ["haftpflicht", "hausrat"];
  })();
  const R = (inhalt: string, frage?: string, cls = "", hinweis?: string | null) => rahmen(m, inhalt, cls, frage, hinweis);
  // Kombi-Rabatt (lib/kombi-rabatt.ts) über die gewählten Angebote, für Überblick und Beitrag
  const beitrag = angebote ? beitragAus(angebote) : null;
  const out: Folie[] = [];

  if (!C) out.push({
    id: "titel",
    titel: "Begrüßung",
    html: R(
      `${m.logoUrl ? `<img class="titellogo" src="${e(m.logoUrl)}" alt="">` : ""}<h1>${e(a(an, `Dein Schutz, ${anrede}`, `Ihr Schutz, ${anrede}`))}</h1><p class="sub">${e(d.lead.produkt)} · mit ${e(d.termin.berater)}</p>
<div class="agenda"><div><b>1</b>${e(a(an, "Deine Situation", "Ihre Situation"))}</div><div><b>2</b>Unsere Empfehlung</div><div><b>3</b>${B ? e(a(an, "Deine Entscheidung", "Ihre Entscheidung")) : "So geht es weiter"}</div></div>
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
  // C: Begrüßung und Situation auf einer Folie, Überschrift ist das Anliegen des Kunden (Folien-ID bleibt „situation“,
  // zählt also wie in B noch nicht als gezeigte Präsentation)
  if (C) out.push({
    id: "situation",
    titel: "Darum geht es",
    hinweis: SPRECHHINWEIS_C.situation,
    html: R(
      `${m.logoUrl ? `<img class="titellogo" src="${e(m.logoUrl)}" alt="">` : ""}<h1>${e(a(an, `Darum geht es dir, ${vorname}`, `Darum geht es Ihnen, ${anrede}`))}</h1><p class="sub">${e(d.lead.produkt)} · mit ${e(d.termin.berater)}</p>${
        situation.length
          ? `<div class="zitate">${situation.map((x) => `<div class="zitat">${e(x)}</div>`).join("")}</div>`
          : `<p class="sub" style="margin-top:26px">${e(a(an, "Erzähl kurz, worum es dir geht.", "Erzählen Sie kurz, worum es Ihnen geht."))}</p>`
      }<div class="ablauf"><span><b>1</b>${e(a(an, "Deine Situation", "Ihre Situation"))}</span><span><b>2</b>Unsere Empfehlung</span><span><b>3</b>${e(a(an, "Deine Entscheidung", "Ihre Entscheidung"))}</span></div>`,
      a(an, "Stimmt das so?", "Stimmt das so?"),
      "titel einstieg",
    ),
  });
  else out.push({
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
  // B: das Schadenbeispiel macht das Risiko greifbar, die Kacheln wiederholen nur die Sparten (eine Folie weniger)
  if (!B) out.push({
    id: "risiken",
    titel: "Worauf es ankommt",
    html: R(
      `<h2>${e(a(an, "Worauf es bei dir ankommt", "Worauf es bei Ihnen ankommt"))}</h2><div class="kacheln" style="grid-template-columns:repeat(${top.length},1fr)">${top
        .map((k) => `<div class="kachel"><span class="ill">${icon(k)}</span><b>${e(SPARTE_TEXT[k]?.titel ?? k)}</b><span>${e(SPARTE_TEXT[k]?.text ?? "")}</span></div>`)
        .join("")}</div>`,
      a(an, "Was davon ist dir am wichtigsten?", "Was davon ist Ihnen am wichtigsten?"),
    ),
  });

  const b = beispielFuer(sparten[0], an);
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
    const kurz = spaltenNamen(v, i.sparte);
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
      "",
      // Makler (§ 60 VVG): Gesellschaften der gezeigten Tarife
      markthinweisText(m.markthinweis, items),
    ),
  });

  // Vergleich je Sparte mit mehreren echten Stufen: Preise erscheinen hier zum ersten Mal
  const nachSparte = new Map<string, AngebotItem[]>();
  for (const i of items) nachSparte.set(i.sparte, [...(nachSparte.get(i.sparte) ?? []), i]);
  let spNr = -1;
  // Kündigung relativ zum Termin (Berliner Datum)
  const heute = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d.termin.startsAt);
  // Cross-Selling im Termin (Ole, 18.11.2026): per „Mit anschauen“ dazugenommene Sparten stehen direkt hinter „Ihr Schutz
  // im Überblick“, in der Reihenfolge des Hinzufügens (zusatzFolge). So springt das Deck vorwärts auf die neue Folie,
  // der Beitrag bleibt dahinter und rechnet sie mit. Ohne Überblick bleibt alles an seinem Platz.
  const mitUeberblick = !!angebote?.schutz?.length;
  const zusatzFolien: { folie: Folie; platz: number }[] = [];
  for (const [sparte, varianten] of nachSparte) {
    spNr++;
    // Bisheriger Vertrag des Kunden (Paket P3b): Vergleich auch mit nur einem neuen Tarif
    const bisher = angebote?.bisher?.find((x) => x.sparte === sparte) ?? null;
    const zusatz = varianten.some((i) => i.zusatz);
    // Cross-Selling: eigene Folie auch mit nur einem Tarif (sonst stünde der Preis nirgends)
    if (varianten.length < 2 && !bisher && !(zusatz && mitUeberblick)) continue;
    // Cross-Selling: erst nach „Mit anschauen“ (Folie „Ihr Schutz im Überblick“) im Vergleich
    if (varianten.every((i) => zusatzAus(i, varianten))) continue;
    // höchstens 4 Spalten (mit bisherigem Vertrag 3 neue); die gewählte Stufe ist immer dabei
    const maxSp = bisher ? 3 : 4;
    const g = varianten.find((i) => i.gewaehlt);
    const v = varianten.length <= maxSp || !g || varianten.indexOf(g) < maxSp ? varianten.slice(0, maxSp) : [...varianten.slice(0, maxSp - 1), g];
    const badge = (i: AngebotItem) => (i.empfohlen ? `<span class="badge">${e(a(an, "Passt zu dir", "Passt zu Ihnen"))}</span>` : "");
    const preis = (i: AngebotItem) => (i.beitragMonat != null ? `<div class="preis">${eur(beitragEffektiv(i)!)} <small>im Monat</small></div>` : "");
    const knopf = (i: AngebotItem) =>
      `<button type="button" class="wahl${i.gewaehlt ? " an" : ""}" data-tarif="${items.indexOf(i)}">${i.gewaehlt ? "✓ Ausgewählt" : "Auswählen"}</button>`;
    const bs = (i: AngebotItem) => schalter(items, i, false, GRENZEN.bausteine);
    const kurz = spaltenNamen(v, sparte);
    // Darunter: Beitragsunterschied zum gewählten Tarif und Kündigung des bisherigen Vertrags
    const diff = bisher ? beitragsUnterschiedJahr(g ? beitragEffektiv(g) : null, bisher.beitragMonat) : null;
    // „Ihr bisheriger Vertrag: Versicherungssumme 65.000 €, Selbstbeteiligung 150 €, kündbar zum … (Kündigung bis …).“
    const bSatz = bisher ? [...bisher.info, kuendigungText(bisher, heute)].join(", ") : "";
    const bisherFuss = bisher
      ? `<div class="bisher-fuss" data-bisher-fuss>${diff != null ? `<span>${e(a(an, "Dein gewählter Tarif", "Ihr gewählter Tarif"))}: <b>${e(unterschiedText(diff))}</b></span>` : ""}<span>${e(
          `${a(an, "Dein bisheriger Vertrag", "Ihr bisheriger Vertrag")}: ${bSatz}`,
        )}</span></div>`
      : "";
    const html = v.some((i) => i.merkmale.length) || bisher ? vergleichTabelle(v, { badge, preis, knopf, schalter: bs }, bisher ? { spalte: bisher, titel: a(an, "Dein bisheriger Vertrag", "Ihr bisheriger Vertrag") } : null) + bisherFuss : `<div class="angebote" style="grid-template-columns:repeat(${v.length},minmax(0,1fr))">${v
          .map(
            (i, k) => `<div class="angebot${i.empfohlen ? " empf" : ""}${i.gewaehlt ? " gew" : ""}">${badge(i)}<div class="tarif">${e(kurz[k])}</div>${preis(i)}${punkte(i.leistungen.slice(0, 3))}${bs(i)}${knopf(i)}</div>`,
          )
          .join("")}</div>`;
    const folie: Folie = {
      // feste ID je Sparte: das Deck bleibt beim Umschalten auf derselben Folie, auch wenn eine Sparte dazukommt
      id: `vergleich-${sparteKey(sparte)}-${spNr}`,
      titel: `Auswahl ${sparte}`,
      produkt: sparte,
      html: R(`<h2>${e(a(an, "Deine Auswahl", "Ihre Auswahl"))}: ${e(sparte)}</h2>${html}`, undefined, "", markthinweisText(m.markthinweis, varianten)),
    };
    if (zusatz && mitUeberblick) zusatzFolien.push({ folie, platz: angebote?.zusatzFolge?.indexOf(sparte) ?? -1 });
    else out.push(folie);
  }

  // Ihr Schutz im Überblick (Cross-Selling, Ole 16.11.2026): Ampel je Sparte, „Mit anschauen“, Kombi-Rabatt
  if (angebote?.schutz?.length) out.push(ueberblickFolie(angebote.schutz, items, beitrag?.kombi ?? null, an, R));
  // dahinter die dazugenommenen Sparten (ohne gespeicherte Reihenfolge, z. B. ältere Daten: zuerst, wie im Angebot)
  out.push(...zusatzFolien.sort((x, y) => x.platz - y.platz).map((x) => x.folie));

  const summe = beitrag?.endbeitrag ?? null;
  // Produkte als Schalter: antippen nimmt eine Sparte heraus bzw. wieder hinein (Cross-Selling-Sparten erst nach „Mit anschauen“)
  const sparten1 = [...new Map(items.filter((i) => !zusatzAus(i, items)).map((i) => [i.sparte, i])).values()];
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
  // C: der Beitrag steht auf der Entscheidungsfolie (je Paket), keine eigene Folie
  if (!C) out.push({
    id: "beitrag",
    titel: "Ihr Beitrag",
    html: R(
      `<h2>${e(a(an, "Dein Beitrag", "Ihr Beitrag"))}</h2>${
        summe != null
          ? `<div class="gross">${eur(summe)} <span class="einheit">im Monat</span></div>${kombiBeitrag(beitrag, an)}${
              B ? `<p class="tag-preis" data-pro-tag>Das sind rund <b>${eur(summe / 30)}</b> am Tag.</p>` : `<p class="sub">Das sind rund ${eur(summe / 30)} am Tag.</p>`
            }${staffelHtml(beitrag?.kombi ?? null)}${produkte}${wahl.some((i) => i.bausteine.length) ? wahl.map((i) => schalter(items, i, mehrere)).join("") : ""}${sb.length ? `<p class="sub">Selbstbeteiligung: ${e(sb.join(", "))}</p>` : ""}${kombiFussnote(beitrag?.kombi ?? null)}`
          : `<div class="leer">${e(a(an, "Deinen Beitrag rechnen wir gemeinsam.", "Ihren Beitrag rechnen wir gemeinsam."))}</div>${produkte}`
      }`,
      a(an, "Passt das für dich?", "Passt das für Sie?"),
    ),
  });

  const ab = ersterDesMonats(d.termin.startsAt, 1);
  const alt = ersterDesMonats(d.termin.startsAt, 2);
  if (B) {
    // Abschluss-Dramaturgie (19.11.2026): alles für die Entscheidung auf einer Folie, Einwände vorweg, ein klarer Schritt
    const gew = items.filter((i) => i.gewaehlt && !zusatzAus(i, items));
    const zeilen = gew
      .map((i) => {
        const p = beitragEffektiv(i);
        return `<li><span>${e(paketName(i))}</span>${p != null ? `<b>${eur(p)}</b>` : ""}</li>`;
      })
      .join("");
    const mitKombi = !!beitrag?.rabatt;
    // Wechsel-Service nur, wenn der Kunde einen bisherigen Vertrag für eine gewählte Sparte hat
    const wechsel =
      gew.some((i) => angebote?.bisher?.some((x) => x.sparte === i.sparte)) ||
      (angebote?.schutz ?? []).some((z) => z.status === "woanders" && gew.some((i) => (i.kombi?.sparte ?? sparteKey(i.sparte)) === z.key));
    const sicher = [
      a(an, "14 Tage Widerrufsrecht", "14 Tage Widerrufsrecht"),
      a(an, "Unterlagen und Beratungsdokumentation per E-Mail", "Unterlagen und Beratungsdokumentation per E-Mail"),
      ...(wechsel ? [a(an, "Bei der Kündigung deines bisherigen Vertrags helfen wir", "Bei der Kündigung Ihres bisherigen Vertrags helfen wir")] : []),
    ];
    const zugesagt = !!opt.zugesagtAm;
    if (C) out.push(entscheidungC({ angebote, an, R, ab, alt, sicher, zugesagt }));
    else out.push({
      id: "entscheidung",
      titel: "Ihre Entscheidung",
      html: R(
        `<h2>${e(a(an, "Deine Entscheidung", "Ihre Entscheidung"))}</h2><div class="abschluss"><div class="paket">${
          gew.length ? `<ul class="paket-liste">${zeilen}</ul>` : `<p class="leer-klein">${e(a(an, "Dein Angebot stellen wir gemeinsam zusammen.", "Ihr Angebot stellen wir gemeinsam zusammen."))}</p>`
        }${summe != null ? `<div class="paket-summe"><span>${mitKombi ? "Zusammen, mit Kombi-Rabatt" : gew.length === 1 ? a(an, "Dein Beitrag", "Ihr Beitrag") : "Zusammen"}</span><b>${eur(summe)} <small>im Monat</small></b></div>` : ""}</div><div class="beginn"><span>Unser Vorschlag</span><b>Schutz ab ${e(ab)}</b><em>oder ab ${e(alt)}</em></div></div>
<div class="sicher-reihe">${sicher.map((x) => `<span>${icon("check", 26)}${e(x)}</span>`).join("")}</div>
<button type="button" class="zusage${zugesagt ? " an" : ""}" data-zusage>${zugesagt ? "✓ Zugesagt" : "Ja, so machen wir es"}</button>`,
      ),
    });
  } else out.push({
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

// ─── Fassung C: Entscheidung mit zwei Paketen (19.11.2026) ───────────────────────────────────

export type PaketArt = "empfehlung" | "guenstiger" | "auswahl";

export type EntscheidungsPaket = {
  art: PaketArt;
  /** Index im Angebot je Sparte (Reihenfolge der gewählten Sparten) */
  items: number[];
  gewaehlt: boolean;
  beitrag: BeitragsUebersicht;
  /** Unterschied zur Empfehlung, höchstens 2: zuerst „ohne …“ (Merkmal fehlt), dann andere Werte („Versicherungssumme 20 Mio. €“) */
  fehlt: string[];
};

/**
 * Pakete für die Folie „Ihre Entscheidung“ (Fassung C). Empfehlung = je gewählter Sparte die empfohlene Stufe (sonst
 * die gewählte); günstiger = je Sparte die nächste günstigere echte Stufe (nicht die billigste: keine Köder-Stufe).
 * Weicht die Auswahl im Termin von beiden ab, steht sie selbst als „Ihre Auswahl“ neben der Empfehlung. Ein Paket,
 * wenn es nichts zu wählen gibt. Beiträge mit Kombi-Rabatt je Paket (beitragAus), nur aus den bestätigten Angeboten.
 */
export function entscheidungsPakete(angebote: AngeboteDaten | null): EntscheidungsPaket[] {
  const items = angebote?.items ?? [];
  const gew = items.filter((i) => i.gewaehlt && !zusatzAus(i, items));
  if (!angebote || !gew.length) return [];
  const preis = (i: AngebotItem) => beitragEffektiv(i);
  const idx = (i: AngebotItem) => items.indexOf(i);
  const empf = gew.map((g) => items.find((x) => x.sparte === g.sparte && x.empfohlen) ?? g);
  const kleiner = empf.map((x) => {
    const p = preis(x);
    if (p == null) return x;
    const guenstiger = items.filter((y) => y.sparte === x.sparte && preis(y) != null && preis(y)! < p - 0.005);
    return guenstiger.length ? guenstiger.reduce((best, y) => (preis(y)! > preis(best)! ? y : best)) : x;
  });
  const gleich = (xs: AngebotItem[], ys: AngebotItem[]) => xs.every((x, k) => x === ys[k]);
  // Ehrlich zeigen, was im anderen Paket anders ist (nicht nur das Fehlende), damit niemand es für gleichwertig hält
  // Je Sparte zuerst „ohne …“, dann andere Werte; reihum über die Sparten, damit jede Sparte vorkommt
  const fehltGegen = (xs: AngebotItem[]) => {
    const jeSparte = xs.map((x, k) => {
      if (x === empf[k]) return [];
      const paare = empf[k].merkmale.filter((mm) => !istNein(mm.wert)).map((mm) => ({ mm, w: x.merkmale.find((y) => y.name === mm.name)?.wert }));
      const ohne = paare.filter((p) => istNein(p.w)).map((p) => `ohne ${p.mm.name}`);
      const anders = paare.filter((p) => !istNein(p.w) && klein(p.w!) !== klein(p.mm.wert) && !JA.test(p.w!.trim())).map((p) => `${p.mm.name} ${p.w}`);
      return [...ohne, ...anders];
    });
    const out: string[] = [];
    for (let r = 0; out.length < 2 && jeSparte.some((l) => l.length > r); r++) for (const l of jeSparte) if (l[r] && out.length < 2) out.push(l[r]);
    return out;
  };
  const paket = (art: PaketArt, xs: AngebotItem[]): EntscheidungsPaket => {
    const ids = xs.map(idx);
    return { art, items: ids, gewaehlt: gleich(xs, gew), beitrag: beitragAus(paketWaehlen(angebote, ids) ?? angebote), fehlt: art === "empfehlung" ? [] : fehltGegen(xs) };
  };
  if (gleich(gew, empf)) return gleich(kleiner, empf) ? [paket("empfehlung", empf)] : [paket("empfehlung", empf), paket("guenstiger", kleiner)];
  if (gleich(gew, kleiner)) return [paket("empfehlung", empf), paket("guenstiger", kleiner)];
  return [paket("auswahl", gew), paket("empfehlung", empf)];
}

function entscheidungC(x: {
  angebote: AngeboteDaten | null;
  an: Ansprache;
  R: (inhalt: string, frage?: string, cls?: string, hinweis?: string | null) => string;
  ab: string;
  alt: string;
  sicher: string[];
  zugesagt: boolean;
}): Folie {
  const { angebote, an, R } = x;
  const items = angebote?.items ?? [];
  const pakete = entscheidungsPakete(angebote);
  const zwei = pakete.length > 1;
  const kopf: Record<PaketArt, string> = { empfehlung: "Unsere Empfehlung", guenstiger: "Etwas günstiger", auswahl: a(an, "Deine Auswahl", "Ihre Auswahl") };
  const karte = (p: EntscheidungsPaket) => {
    const zeilen = p.items
      .map((k) => {
        const i = items[k];
        const pr = beitragEffektiv(i);
        return `<span class="pk-zeile"><span>${e(paketName(i))}</span>${pr != null ? `<b>${eur(pr)}</b>` : ""}</span>`;
      })
      .join("");
    const end = p.beitrag.endbeitrag;
    const inhalt = `<span class="pk-kopf">${zwei ? `<span class="pk-wahl">✓</span>` : ""}${e(kopf[p.art])}</span>${zeilen}${
      p.fehlt.length ? `<span class="pk-ohne">Unterschied: ${e(p.fehlt.join(", "))}</span>` : ""
    }${
      end != null
        ? `<span class="pk-summe"><b>${eur(end)}</b> im Monat</span><span class="pk-tag">rund ${eur(end / 30)} am Tag${p.beitrag.rabatt ? `, mit Kombi-Rabatt ${prozent(p.beitrag.rabatt.prozent)}` : ""}</span>`
        : ""
    }`;
    // Zwei Pakete: antippen wählt (data-paket, wie eine Stufe im Vergleich); eines: nur Anzeige
    return zwei
      ? `<button type="button" class="pk${p.gewaehlt ? " an" : ""}" data-paket="${p.items.join(",")}" data-paket-art="${p.art}" aria-pressed="${p.gewaehlt}">${inhalt}</button>`
      : `<div class="pk an" data-paket-art="${p.art}">${inhalt}</div>`;
  };
  const gewaehlt = pakete.find((p) => p.gewaehlt) ?? pakete[0];
  // Bisheriger Vertrag in Euro (wenn erfasst): je Sparte des gewählten Pakets Beitrag bisher und Unterschied im Jahr
  const bisher = (gewaehlt?.items ?? [])
    .flatMap((k) => {
      const i = items[k];
      const b = angebote?.bisher?.find((y) => y.sparte === i.sparte);
      const diff = b ? beitragsUnterschiedJahr(beitragEffektiv(i), b.beitragMonat) : null;
      return b?.beitragMonat != null && diff != null
        ? [`<span>${e(a(an, "Dein bisheriger Vertrag", "Ihr bisheriger Vertrag"))} ${e(i.sparte)}: ${eur(b.beitragMonat)} im Monat. ${e(a(an, "Deine Auswahl", "Ihre Auswahl"))}: <b>${e(unterschiedText(diff))}</b></span>`]
        : [];
    })
    .slice(0, 2);
  const kombi = pakete.find((p) => p.beitrag.rabatt)?.beitrag.kombi ?? null;
  const spalten = zwei ? "minmax(0,1fr) minmax(0,1fr) 250px" : "minmax(0,3fr) minmax(0,2fr)";
  const html = R(
    `<h2>${e(a(an, "Deine Entscheidung", "Ihre Entscheidung"))}</h2><div class="pakete" style="grid-template-columns:${spalten}" data-pakete="${pakete.length}">${
      pakete.length ? pakete.map(karte).join("") : `<div class="pk"><p class="leer-klein">${e(a(an, "Dein Angebot stellen wir gemeinsam zusammen.", "Ihr Angebot stellen wir gemeinsam zusammen."))}</p></div>`
    }<div class="beginn"><span>Unser Vorschlag</span><b>Schutz ab ${e(x.ab)}</b><em>oder ab ${e(x.alt)}</em></div></div>${
      bisher.length ? `<div class="vergleich-bisher" data-bisher-euro>${bisher.join("")}</div>` : ""
    }<div class="sicher-reihe">${x.sicher.map((s) => `<span>${icon("check", 26)}${e(s)}</span>`).join("")}</div><div class="zusage-zeile"><button type="button" class="zusage${x.zugesagt ? " an" : ""}" data-zusage>${
      x.zugesagt ? "✓ Zugesagt" : "Ja, so machen wir es"
    }</button><span class="unverbindlich">${e(a(an, "Unverbindlich. Den Antrag füllen wir gemeinsam aus.", "Unverbindlich. Den Antrag füllen wir gemeinsam aus."))}</span></div>${kombi ? kombiFussnote(kombi) : ""}`,
    zwei ? a(an, "Welches Paket passt besser zu dir?", "Welches Paket passt besser zu Ihnen?") : a(an, "Sollen wir das so machen?", "Sollen wir das so machen?"),
  );
  return { id: "entscheidung", titel: "Ihre Entscheidung", html, hinweis: zwei ? SPRECHHINWEIS_C.zweiPakete : SPRECHHINWEIS_C.einPaket };
}

// ─── Kombi-Rabatt und Schutz-Überblick (Ole, 16.11.2026) ─────────────────────────────────────

const prozent = (n: number) => `${String(n).replace(".", ",")} %`;

/** „statt 36,23 €: Kombi-Rabatt 10 % (−3,63 €)“; bei einem Tarif, der nicht zählt, ein kurzer Hinweis. */
function kombiBeitrag(b: ReturnType<typeof beitragAus> | null, an: Ansprache): string {
  if (!b?.kombi) return "";
  const blockiert = b.kombi.blockiert.length
    ? ` <span>${e(
        b.kombi.blockiert.length === 1
          ? tarifMitSparte(b.kombi.blockiert[0]) + (b.kombi.blockiert[0].grund === "linie" ? ` zählt nicht (nur ${aufzaehlungOder(b.kombi.regel.linien)}).` : " zählt nicht (Laufzeit).")
          : a(an, "Nicht alle gewählten Tarife zählen zum Kombi-Rabatt.", "Nicht alle gewählten Tarife zählen zum Kombi-Rabatt."),
      )}</span>`
    : "";
  if (!b.rabatt || b.einzelSumme == null) return blockiert ? `<p class="statt">${blockiert}</p>` : "";
  return `<p class="statt" data-kombi-rabatt>statt <s>${eur(b.einzelSumme)}</s>: <b>Kombi-Rabatt ${prozent(b.rabatt.prozent)} (−${eur(b.rabatt.euro)})</b>${blockiert}</p>`;
}

/** „Hausrat Smart“ (ohne doppeltes Spartenwort, wenn der Tarifname es schon enthält). */
export const tarifMitSparte = (b: { sparte: string; tarif: string | null }) =>
  !b.tarif ? b.sparte : b.tarif.toLocaleLowerCase("de").startsWith(b.sparte.toLocaleLowerCase("de")) ? b.tarif : `${b.sparte} ${b.tarif}`;

/**
 * Name eines gewählten Tarifs für Zusammenfassungen (Folie „Ihre Entscheidung“, Kundenlink): der Tarifname, wenn er die
 * Sparte schon nennt („Haftpflicht Komfort“ bei „Privathaftpflicht“), sonst Sparte und Tarif („Hausrat Komfort“).
 */
export function paketName(b: { sparte: string; tarif: string | null }): string {
  const t = b.tarif?.trim();
  if (!t) return b.sparte;
  const erstes = klein(t.split(/\s+/)[0]);
  return erstes.length >= 4 && klein(b.sparte).includes(erstes) ? t : tarifMitSparte(b);
}

const aufzaehlungOder = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} oder ${xs[xs.length - 1]}`);

/** Staffel-Leiste wie bei der Allianz: Stufen, aktuelle hervorgehoben, Hinweis auf die nächste. */
function staffelHtml(k: KombiErgebnis | null): string {
  if (!k) return "";
  const naechste = naechsteText(k);
  return `<div class="staffel" data-staffel>${staffelLeiste(k)
    .map((s) => `<span class="stf${s.aktiv ? " an" : ""}">${e(s.text)} <b>${prozent(s.prozent)}</b></span>`)
    .join("")}${naechste ? `<span class="naechste">${e(naechste)}</span>` : ""}</div>`;
}

/**
 * Fußnote zum Kombi-Rabatt: Bedingung (Linie, Laufzeit) und der Pflichthinweis nach § 7a VVG (Teil A9), dass die
 * Versicherungen auch einzeln abschließbar sind. Die Deckung im Paket entspricht den Einzelverträgen, deshalb keine
 * eigene Beschreibung der Bestandteile.
 */
function kombiFussnote(k: KombiErgebnis | null): string {
  if (!k) return "";
  const text = `${k.regel.name ? `${k.regel.name}: Kombi-Rabatt` : "Kombi-Rabatt"} ${bedingungText(k.regel)}. Die Versicherungen sind auch einzeln abschließbar.`;
  return `<p class="fussnote" data-7a-vvg>${e(text)}</p>`;
}

/**
 * Folie „Ihr Schutz im Überblick“ (Teil A3, A7): je Sparte eine Ampel mit 4 Zuständen. Sparten im Angebot gelten als
 * „bei uns“; Lücken und Prüfpunkte mit Angeboten bekommen „Mit anschauen“ (nimmt die Sparte in Vergleich und Beitrag);
 * „woanders versichert“ rechnet den Bündelvorteil und bietet den Wechsel-Service an. Ohne Druck: die Frage in der
 * Fußzeile lässt den nächsten Termin offen.
 */
function ueberblickFolie(
  schutz: SchutzZeile[],
  items: AngebotItem[],
  k: KombiErgebnis | null,
  an: Ansprache,
  R: (inhalt: string, frage?: string, cls?: string) => string,
): Folie {
  const key = (i: AngebotItem) => i.kombi?.sparte ?? sparteKey(i.sparte);
  const gewaehlt = items.filter((i) => i.gewaehlt);
  // Bündelvorteil, wenn diese Sparte dazukommt (gleiche Gesellschaft wie die gewählten Tarife)
  const mitProzent = (sparte: string): number | null => {
    if (!k) return null;
    const zaehlend = gewaehlt.filter((i) => i.kombi?.gruppe === k.regel.gruppe && !k.blockiert.some((b) => b.sparte === i.sparte)).map(key);
    const p = prozentFuer(k.regel.staffel, anzahlFuer(k.regel, [...zaehlend, sparte]));
    return p > k.prozent ? p : null;
  };
  const zeilen = schutz.map((z) => {
    const varianten = items.filter((i) => key(i) === z.key);
    const imAngebot = varianten.some((i) => i.gewaehlt);
    const knopf = varianten.length
      ? varianten.some((i) => i.zusatz)
        ? `<button type="button" class="mit${imAngebot ? " an" : ""}" data-sparte="${items.indexOf(varianten[0])}">${imAngebot ? "✓ Im Vergleich" : "Mit anschauen"}</button>`
        : ""
      : "";
    const status = imAngebot ? "bei-uns" : z.status;
    const label = imAngebot ? "Im Angebot" : SCHUTZ_STATUS[z.status].label;
    const zusatz: string[] = [];
    if (!imAngebot && z.info) zusatz.push(z.info);
    if (imAngebot && z.status === "woanders") zusatz.push(a(an, "ersetzt deinen bisherigen Vertrag, Wechsel-Service inklusive", "ersetzt Ihren bisherigen Vertrag, Wechsel-Service inklusive"));
    if (!imAngebot && z.status !== "bei-uns") {
      const p = mitProzent(z.key);
      if (p) zusatz.push(a(an, `Mit ${z.label} dazu sparst du ${p} % auf alles`, `Mit ${z.label} dazu sparen Sie ${p} % auf alles`));
      if (z.status === "woanders") zusatz.push(a(an, "Wechsel-Service: Wir kümmern uns um die Kündigung", "Wechsel-Service: Wir kümmern uns um die Kündigung"));
    }
    return `<div class="sz" data-schutz="${e(z.key)}" data-status="${status}"><span class="ampel" style="background:${SCHUTZ_STATUS[status].farbe}"></span><b>${e(z.label)}</b><span><span class="stl" style="color:${SCHUTZ_STATUS[status].farbe}">${e(label)}</span>${zusatz.length ? `<span class="info">${e(zusatz.join(". "))}</span>` : ""}</span>${knopf || "<span></span>"}</div>`;
  });
  // Stand des Kombi-Rabatts nur, wenn er schon greift (vorher steht der Vorteil an den Zeilen)
  const kombiZeile = k?.prozent ? `<div class="kombi-zeile">Kombi-Rabatt jetzt: <b>${prozent(k.prozent)} auf alles</b>${naechsteText(k) ? `. ${e(naechsteText(k)!)}.` : "."}</div>` : "";
  return {
    id: "ueberblick",
    titel: "Ihr Schutz im Überblick",
    html: R(
      `<h2>${e(a(an, "Dein Schutz im Überblick", "Ihr Schutz im Überblick"))}</h2><div class="schutz">${zeilen.join("")}</div>${kombiZeile}`,
      a(an, "Wollen wir das gleich mit anschauen oder beim nächsten Termin?", "Wollen wir das gleich mit anschauen oder beim nächsten Termin?"),
    ),
  };
}

// ─── Einwände (Sales-Coach, 19.11.2026) ────────────────────────────────────────────────────────────
// Optionale Folien außerhalb der Reihenfolge: der Vermittler springt im Termin über „Einwände“ hin und wieder zurück.
// Nicht im Kundenlink und nicht im PDF. Sachlich, ohne Druck, ohne Versprechen; Preise nur aus den Angeboten.

/** Kurzname im Menü des Vermittlers je Einwand-Folie. */
export const EINWAND_MENUE: Record<string, string> = {
  "einwand-preis": "Zu teuer",
  "einwand-nachdenken": "Noch nachdenken",
  "einwand-vorhanden": "Schon versichert",
  "einwand-partner": "Erst mit Partner besprechen",
};

export function einwandFolien(d: VorbereitungDaten, angebote: AngeboteDaten | null, m: Marke, an: Ansprache = "sie"): Folie[] {
  const R = (inhalt: string, frage?: string) => rahmen(m, inhalt, "einwand", frage);
  const items = angebote?.items ?? [];
  const gew = items.filter((i) => i.gewaehlt && !zusatzAus(i, items));
  const summe = angebote ? beitragAus(angebote).endbeitrag : null;
  // kleinste Stufe je gewählter Sparte (ohne Kombi-Rabatt gerechnet, daher nur nennen, wenn klar günstiger)
  const kleinste = gew.length
    ? gew.reduce<number | null>((s, g) => {
        const ps = items.filter((x) => x.sparte === g.sparte).map((x) => x.beitragMonat).filter((x): x is number => x != null);
        return s == null || !ps.length ? null : s + Math.min(...ps);
      }, 0)
    : null;
  const sparte = sparteKey(gew[0]?.sparte ?? items[0]?.sparte ?? d.lead.produkt);
  const b = beispielFuer(sparte, an);
  const punkte2 = (xs: string[]) => `<div class="punkte">${punkte(xs)}</div>`;
  const folie = (id: string, titel: string, inhalt: string, frage: string, hinweis: string): Folie => ({ id, titel, html: R(inhalt, frage), hinweis });
  return [
    folie(
      "einwand-preis",
      EINWAND_MENUE["einwand-preis"],
      `<h2>${e(a(an, "Lohnt sich das für dich?", "Lohnt sich das für Sie?"))}</h2><div class="gegen">${
        summe != null ? `<div><span>${e(a(an, "Dein Schutz", "Ihr Schutz"))}</span><b>rund ${eur(summe / 30)}</b><span>am Tag</span></div>` : ""
      }<div class="schaden"><span>${e(b.szene)}</span><b>${e(b.ohne)}</b></div></div>${punkte2([
        ...(kleinste != null && summe != null && kleinste < summe - 0.5
          ? [a(an, `Die kleinste Stufe je Versicherung kostet zusammen ${eur(kleinste)} im Monat.`, `Die kleinste Stufe je Versicherung kostet zusammen ${eur(kleinste)} im Monat.`)]
          : []),
        a(an, "Bausteine, die du nicht brauchst, lassen wir weg.", "Bausteine, die Sie nicht brauchen, lassen wir weg."),
      ])}`,
      a(an, "Was wäre für dich ein guter Beitrag?", "Was wäre für Sie ein guter Beitrag?"),
      "Nicht verteidigen. Fragen, welcher Beitrag passt, und gemeinsam eine kleinere Stufe oder weniger Bausteine anschauen.",
    ),
    folie(
      "einwand-nachdenken",
      EINWAND_MENUE["einwand-nachdenken"],
      `<h2>${e(a(an, "In Ruhe entscheiden", "In Ruhe entscheiden"))}</h2>${punkte2([
        a(an, "Was ist noch offen: die Leistung, der Beitrag oder der Zeitpunkt?", "Was ist noch offen: die Leistung, der Beitrag oder der Zeitpunkt?"),
        a(an, "Alles bekommst du per Link zum Nachlesen.", "Alles bekommen Sie per Link zum Nachlesen."),
        a(an, "Nach dem Abschluss hast du 14 Tage Widerrufsrecht, ohne Angabe von Gründen.", "Nach dem Abschluss haben Sie 14 Tage Widerrufsrecht, ohne Angabe von Gründen."),
      ])}`,
      a(an, "Was genau möchtest du dir noch überlegen?", "Was genau möchten Sie sich noch überlegen?"),
      "Den offenen Punkt finden und gleich klären. Bleibt es beim Nachdenken: Link schicken und einen festen Rückruftermin ausmachen.",
    ),
    folie(
      "einwand-vorhanden",
      EINWAND_MENUE["einwand-vorhanden"],
      `<h2>${e(a(an, "Du bist schon versichert?", "Sie sind schon versichert?"))}</h2>${punkte2([
        a(an, "Wir vergleichen deinen Vertrag Punkt für Punkt mit dem neuen.", "Wir vergleichen Ihren Vertrag Punkt für Punkt mit dem neuen."),
        a(an, "Lohnt sich ein Wechsel nicht, sagen wir dir das.", "Lohnt sich ein Wechsel nicht, sagen wir Ihnen das."),
        a(an, "Wechselst du, beginnt der neue Schutz, wenn der alte endet. Bei der Kündigung helfen wir.", "Wechseln Sie, beginnt der neue Schutz, wenn der alte endet. Bei der Kündigung helfen wir."),
      ])}`,
      a(an, "Was steht in deinem bisherigen Vertrag?", "Was steht in Ihrem bisherigen Vertrag?"),
      "Police zeigen lassen oder Daten aufnehmen. Ehrlich bleiben: Ist der alte Vertrag gleich gut, nicht wechseln lassen.",
    ),
    folie(
      "einwand-partner",
      EINWAND_MENUE["einwand-partner"],
      `<h2>${e(a(an, "Gemeinsam entscheiden", "Gemeinsam entscheiden"))}</h2>${punkte2([
        a(an, "Du bekommst den Link mit allen Folien zum Zeigen.", "Sie bekommen den Link mit allen Folien zum Zeigen."),
        a(an, "Gern erklären wir es euch auch zu zweit, in einem kurzen Termin.", "Gern erklären wir es Ihnen auch zu zweit, in einem kurzen Termin."),
      ])}`,
      a(an, "Wann passt es euch beiden?", "Wann passt es Ihnen beiden?"),
      "Fragen, was der Partner wissen möchte, und gleich einen kurzen Termin zu zweit vorschlagen.",
    ),
  ];
}

/** Alle Folien als HTML-Dokument (PDF, Querformat 1280×720 je Seite); eingepasst wie in der Ansicht. */
export function praesentationHtml(fs: Folie[], m: Marke, titel: string): string {
  const einpassen = `<script>(function(){var f=${folienEinpassen.toString()};f(document);if(document.fonts)document.fonts.ready.then(function(){f(document)})})()</script>`;
  // Knopf „Ja, so machen wir es“ (Fassung C mit dem Satz daneben) nur in der Ansicht (im PDF wirkt er nicht)
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${e(titel)}</title><style>@page{size:1280px 720px;margin:0}body{margin:0}.slide{break-after:page}${praesentationCss(m)}.zusage{display:none}.zusage-zeile{display:none}</style></head><body><div class="deck">${fs.map((f) => f.html).join("")}</div>${einpassen}</body></html>`;
}
