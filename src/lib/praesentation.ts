// Beratungsstrecke (Ole, 15.11.2026): bebilderte Präsentation je Termin, per Klick aus den bestätigten Angeboten und
// den Angaben des Kunden. Der Berater teilt sie im Videocall; je Folie ein Sprechzettel (nur für ihn) aus dem
// Gesprächsleitfaden. Branding nach Gesellschaft (Allianz, AXA, Signal Iduna) bzw. PG; das Logo kommt in einem
// späteren Schritt von der Agentur- bzw. Maklerseite (vom Berater bestätigt).
//
// Reine Funktionen: Folien als HTML-Fragmente + CSS (gleich für Ansicht und PDF, 1280×720).

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";
import { spartenVon, type VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { summeEmpfohlen, type AngebotItem, type AngeboteDaten } from "@/lib/angebote";
import { a, type Ansprache } from "@/lib/ansprache";

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

export type Folie = { id: string; titel: string; html: string; notizen: string[] };

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
.slide{width:1280px;height:720px;position:relative;overflow:hidden;background:#fff;box-sizing:border-box;padding:64px 80px 80px}
.slide *{box-sizing:border-box}
.slide .bar{position:absolute;left:0;top:0;bottom:0;width:14px;background:var(--f)}
.slide .foot{position:absolute;left:80px;right:80px;bottom:28px;display:flex;justify-content:space-between;align-items:center;color:#66758f;font-size:16px}
.slide .marke{font-weight:700;color:var(--f);font-size:18px;display:flex;align-items:center;gap:10px}
.slide .marke img{height:34px;width:auto}
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
  return `<section class="slide ${extraClass}"><div class="bar"></div>${inhalt}<div class="foot"><span class="marke">${marke}${e(m.name)}</span>${frage ? `<span class="frage">${e(frage)}</span>` : ""}<span>${m.gesellschaft ? e(m.gesellschaft) : "Ihre Beratung"}</span></div></section>`;
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
  const zeige: AngebotItem[] = empf.length ? empf : items.slice(0, 3);
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
      `<h1>${e(a(an, `Dein Schutz, ${anrede}`, `Ihr Schutz, ${anrede}`))}</h1><p class="sub">${e(d.lead.produkt)} · mit ${e(d.termin.berater)}</p>
<div class="agenda"><div><b>1</b>${e(a(an, "Deine Situation", "Ihre Situation"))}</div><div><b>2</b>Unsere Empfehlung</div><div><b>3</b>So geht es weiter</div></div>
<p class="hinweis">${e(a(an, "Frag jederzeit dazwischen.", "Fragen Sie jederzeit dazwischen."))}</p>`,
      undefined,
      "titel",
    ),
    notizen: [
      a(an, "„Schön, dass es klappt. Wir haben etwa 30 Minuten, passt das bei dir noch so?“", "„Schön, dass es klappt. Wir haben etwa 30 Minuten, passt das bei Ihnen noch so?“"),
      a(an, "„Ich prüfe kurz, ob ich alles richtig verstanden habe, dann zeige ich dir meine Empfehlung, und am Ende sagst du mir ehrlich, ob das passt. Ein Nein ist völlig in Ordnung.“", "„Ich prüfe kurz, ob ich alles richtig verstanden habe, dann zeige ich Ihnen meine Empfehlung, und am Ende sagen Sie mir ehrlich, ob das passt. Ein Nein ist völlig in Ordnung.“"),
      "Status nennen (Vertreter oder Makler).",
    ],
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
    notizen: [
      a(an, "„Stimmt das so? Fehlt etwas?“ Erst nach dem Ja weiter.", "„Stimmt das so? Fehlt etwas?“ Erst nach dem Ja weiter."),
      "Die Bestätigung gehört in die Beratungsdokumentation.",
      "Offene Punkte aus der Terminvorbereitung klären.",
    ],
  });

  const top = sparten.slice(0, 3);
  out.push({
    id: "risiken",
    titel: "Worauf es ankommt",
    html: R(
      `<h2>${e(a(an, "Worauf es bei dir ankommt", "Worauf es bei Ihnen ankommt"))}</h2><div class="kacheln" style="grid-template-columns:repeat(${top.length},1fr)">${top
        .map((k) => `<div class="kachel"><span class="ill">${icon(k)}</span><b>${e(SPARTE_TEXT[k]?.titel ?? k)}</b><span>${e(SPARTE_TEXT[k]?.text ?? "")}</span></div>`)
        .join("")}</div>`,
      a(an, "Was davon ist dir am wichtigsten?", "Was davon ist Ihnen am wichtigsten?"),
    ),
    notizen: [tier ? "„Wie würden Sie heute eine Tierarztrechnung über einige tausend Euro bezahlen?“" : "Je Sparte in einem Satz, warum sie zur Situation passt."],
  });

  const b = BEISPIEL[sparten[0]] ?? BEISPIEL.haftpflicht;
  out.push({
    id: "beispiel",
    titel: "Ein Beispiel aus dem Alltag",
    html: R(
      `<h2>Ein Beispiel aus dem Alltag</h2><p class="szene">${e(b.szene)}</p><div class="zwei beispiel"><div class="ohne"><b>Ohne Schutz</b><span>${e(b.ohne)}</span></div><div class="mit"><b>Mit Schutz</b><span>${e(b.mit)}</span></div></div>`,
    ),
    notizen: ["Ruhig erzählen, als Geschichte, ohne Angst zu machen. Danach Pause."],
  });

  out.push({
    id: "empfehlung",
    titel: "Unsere Empfehlung",
    html: R(
      `<h2>${e(a(an, "Unsere Empfehlung für dich", "Unsere Empfehlung für Sie"))}</h2>${
        zeige.length
          ? `<div class="angebote" style="grid-template-columns:repeat(${Math.min(zeige.length, 3)},1fr)">${zeige
              .slice(0, 3)
              .map((i) => {
                const w = WUNSCH[sparteKey(i.sparte)];
                return `<div class="angebot empf"><div class="wunsch">${e(a(an, "Du wolltest", "Sie wollten"))}: ${e(w ? a(an, w.du, w.sie) : i.sparte)}</div><div class="tarif">${e(i.sparte)}${i.tarif ? ` ${e(i.tarif)}` : ""}</div>${punkte(i.leistungen.slice(0, 3))}</div>`;
              })
              .join("")}</div>`
          : `<div class="leer">${e(a(an, "Dein persönliches Angebot zeigen wir dir im Gespräch.", "Ihr persönliches Angebot zeigen wir Ihnen im Gespräch."))}</div>`
      }`,
      a(an, "Passt das zu dem, was dir wichtig ist?", "Passt das zu dem, was Ihnen wichtig ist?"),
    ),
    notizen: [
      a(an, "„Auf Basis dessen, was du mir gesagt hast, empfehle ich dir …, weil du gesagt hast …“", "„Auf Basis dessen, was Sie mir gesagt haben, empfehle ich Ihnen …, weil Sie gesagt haben …“"),
      "Noch ohne Preis: erst der Nutzen. Die Begründung gehört in die Beratungsdokumentation.",
    ],
  });

  const drin = [...new Set(zeige.flatMap((i) => i.leistungen))].slice(0, 5);
  const nicht = [...new Set(zeige.flatMap((i) => i.ausschluesse))].slice(0, 3);
  const sb = [...new Set(zeige.map((i) => i.selbstbeteiligung).filter((x): x is string => !!x))];
  out.push({
    id: "leistungen",
    titel: "Das ist drin",
    html: R(
      `<h2>Das ist drin, und das nicht</h2>${
        drin.length || nicht.length
          ? `<div class="zwei"><div class="ok"><ul>${drin.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div><div class="nein"><ul>${[...nicht, ...(sb.length ? [`Selbstbeteiligung: ${sb.join(", ")}`] : [])]
              .map((x) => `<li>${e(x)}</li>`)
              .join("")}</ul></div></div>`
          : `<div class="leer">Die Leistungen gehen wir im Gespräch gemeinsam durch.</div>`
      }`,
    ),
    notizen: [tier ? "Offen sagen: Bekannte Vorerkrankungen sind nicht mitversichert, für bestimmte Leistungen gelten Wartezeiten." : "Ausschlüsse offen ansprechen, das schafft Vertrauen."],
  });

  // Vergleich je Sparte mit mehreren echten Stufen: Preise erscheinen hier zum ersten Mal
  const nachSparte = new Map<string, AngebotItem[]>();
  for (const i of items) nachSparte.set(i.sparte, [...(nachSparte.get(i.sparte) ?? []), i]);
  for (const [sparte, varianten] of nachSparte) {
    if (varianten.length < 2) continue;
    const v = varianten.slice(0, 3);
    out.push({
      id: `vergleich-${sparteKey(sparte)}-${out.length}`,
      titel: `Auswahl ${sparte}`,
      html: R(
        `<h2>${e(a(an, "Deine Auswahl", "Ihre Auswahl"))}: ${e(sparte)}</h2><div class="angebote" style="grid-template-columns:repeat(${v.length},1fr)">${v
          .map(
            (i) => `<div class="angebot${i.empfohlen ? " empf" : ""}">${i.empfohlen ? `<span class="badge">${e(a(an, "Passt zu dir", "Passt zu Ihnen"))}</span>` : ""}<div class="tarif">${e(i.tarif ?? sparte)}</div>${
              i.beitragMonat != null ? `<div class="preis">${eur(i.beitragMonat)} <small>im Monat</small></div>` : ""
            }${punkte(i.leistungen.slice(0, 3))}</div>`,
          )
          .join("")}</div>`,
      ),
      notizen: ["Unterschiede in einem Satz; die empfohlene Stufe mit seinen Worten begründen.", "Nur echte, sinnvolle Stufen zeigen."],
    });
  }

  const summe = angebote ? summeEmpfohlen(angebote) : null;
  out.push({
    id: "beitrag",
    titel: "Ihr Beitrag",
    html: R(
      `<h2>${e(a(an, "Dein Beitrag", "Ihr Beitrag"))}</h2>${
        summe != null
          ? `<div class="gross">${eur(summe)} <span class="einheit">im Monat</span></div><p class="sub">Das sind rund ${eur(summe / 30)} am Tag.</p>${sb.length ? `<p class="sub">Selbstbeteiligung: ${e(sb.join(", "))}</p>` : ""}`
          : `<div class="leer">${e(a(an, "Deinen Beitrag rechnen wir gemeinsam.", "Ihren Beitrag rechnen wir gemeinsam."))}</div>`
      }`,
      a(an, "Passt das für dich?", "Passt das für Sie?"),
    ),
    notizen: [
      "Zahl nennen, dann Pause. Dann: „Passt das in Ihr Budget?“",
      "Einwände: erst eingrenzen („Angenommen, das wäre gelöst …“), dann das Gefühl benennen, dann sachlich antworten. „Zu teuer“: kleinere Stufe oder Selbstbeteiligung, nie Leistungen schönreden.",
    ],
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
    notizen: [
      a(an, "„Spricht etwas dagegen, dass wir das heute so festmachen?“", "„Spricht etwas dagegen, dass wir das heute so festmachen?“"),
      a(an, `„Soll der Schutz ab ${ab} starten oder lieber ab ${alt}?“`, `„Soll der Schutz ab ${ab} starten oder lieber ab ${alt}?“`),
      "Keine Drucksätze. Noch nicht entschieden: Folgetermin vereinbaren, den sich der Kunde selbst einträgt.",
    ],
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
    notizen: ["Antrag gleich gemeinsam ausfüllen: Beginn, IBAN, fehlende Angaben.", "Bisheriger Vertrag: Kündigung anbieten (E-Mail-Vorlage „Kündigung alte Versicherung“)."],
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
    notizen: ["Erst nach dem Ja: konkret nach Empfehlungen fragen."],
  });
  return out;
}

/** Alle Folien als HTML-Dokument (PDF, Querformat 1280×720 je Seite). */
export function praesentationHtml(fs: Folie[], m: Marke, titel: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${e(titel)}</title><style>@page{size:1280px 720px;margin:0}body{margin:0}.slide{break-after:page}${praesentationCss(m)}</style></head><body><div class="deck">${fs.map((f) => f.html).join("")}</div></body></html>`;
}
