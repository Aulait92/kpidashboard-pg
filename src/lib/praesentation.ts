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
`;
}

function rahmen(m: Marke, inhalt: string, extraClass = ""): string {
  const marke = m.logoUrl ? `<img src="${e(m.logoUrl)}" alt="">` : "";
  return `<section class="slide ${extraClass}"><div class="bar"></div>${inhalt}<div class="foot"><span class="marke">${marke}${e(m.name)}</span><span>${m.gesellschaft ? e(m.gesellschaft) : "Ihre Beratung"}</span></div></section>`;
}

const punkte = (xs: string[]) => `<ul>${xs.map((x) => `<li><span class="dot"></span><span>${e(x)}</span></li>`).join("")}</ul>`;

/** Folien für einen Termin. angebote = bestätigte Angebote (sonst Platzhalter auf den Angebotsfolien). */
export function folien(d: VorbereitungDaten, angebote: AngeboteDaten | null, m: Marke): Folie[] {
  const a = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const vorname = d.lead.name.split(/\s+/)[0] ?? d.lead.name;
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
  const out: Folie[] = [];

  out.push({
    id: "titel",
    titel: "Begrüßung",
    html: rahmen(
      m,
      `<h1>Ihre Beratung${d.lead.produkt ? `: ${e(d.lead.produkt)}` : ""}</h1><p class="sub">Für ${e(d.lead.name)} · mit ${e(d.termin.berater)}</p>
<div class="agenda"><div><b>1</b>Ihre Situation</div><div><b>2</b>Unsere Empfehlung</div><div><b>3</b>So geht es weiter</div></div>`,
      "titel",
    ),
    notizen: [
      "„Schön, dass es klappt. Wir haben etwa 30 Minuten, passt das bei Ihnen noch so?“",
      "„Mein Vorschlag: Ich prüfe kurz, ob ich alles richtig verstanden habe, dann zeige ich Ihnen meine Empfehlung, und am Ende sagen Sie mir ehrlich, ob das für Sie passt oder nicht. Ein Nein ist völlig in Ordnung.“",
      "Status nennen (Vertreter oder Makler).",
    ],
  });

  const situation = [
    a.lebenssituation ?? d.formular.find((f) => /lebenssituation/i.test(f.label))?.value,
    a.versichern ? `Versichert werden soll: ${a.versichern}` : null,
    a.interesse ? `Wichtig ist Ihnen: ${a.interesse}` : d.formular.find((f) => /interesse/i.test(f.label))?.value,
    a.tier ? `Ihr Tier: ${a.tier}` : null,
    a.wohnflaeche ? `Wohnung: ${a.wohnflaeche}` : null,
    a.gebaeude ? `Haus: ${a.gebaeude}` : null,
    a.vorhanden ? `Bisher: ${a.vorhanden}` : null,
  ].filter((x): x is string => !!x).slice(0, 6);
  out.push({
    id: "situation",
    titel: "Ihre Situation",
    html: rahmen(m, `<h2>Das haben Sie uns gesagt, ${e(vorname)}</h2>${situation.length ? punkte(situation) : `<p class="sub">Erzählen Sie mir kurz, worum es Ihnen geht.</p>`}`),
    notizen: [
      "Mit seinen Worten zusammenfassen und fragen: „Habe ich das richtig verstanden?“ Erst nach dem Ja weiter.",
      tier ? "„Wie würden Sie heute eine Tierarztrechnung über einige tausend Euro bezahlen?“" : "„Was wäre für Sie das Unangenehmste, das passieren könnte?“",
      "Offene Punkte aus der Terminvorbereitung klären.",
    ],
  });

  out.push({
    id: "risiken",
    titel: "Worauf es ankommt",
    html: rahmen(
      m,
      `<h2>Worauf es ankommt</h2><div class="kacheln">${sparten
        .slice(0, 6)
        .map((k) => `<div class="kachel"><span class="ill">${icon(k)}</span><b>${e(SPARTE_TEXT[k]?.titel ?? k)}</b><span>${e(SPARTE_TEXT[k]?.text ?? "")}</span></div>`)
        .join("")}</div>`,
    ),
    notizen: ["Je Sparte kurz das Risiko, dann fragen: „Wie wichtig ist Ihnen das?“"],
  });

  out.push({
    id: "empfehlung",
    titel: "Unsere Empfehlung",
    html: rahmen(
      m,
      `<h2>Unsere Empfehlung für Sie</h2>${
        zeige.length
          ? `<div class="angebote" style="grid-template-columns:repeat(${Math.min(zeige.length, 3)},1fr)">${zeige
              .slice(0, 3)
              .map(
                (i) => `<div class="angebot${i.empfohlen ? " empf" : ""}">${i.empfohlen ? `<span class="badge">Empfehlung</span>` : ""}<div class="sp">${e(i.sparte)}${i.gesellschaft ? ` · ${e(i.gesellschaft)}` : ""}</div><div class="tarif">${e(i.tarif ?? i.sparte)}</div>${
                  i.beitragMonat != null ? `<div class="preis">${eur(i.beitragMonat)} <small>im Monat</small></div>` : ""
                }${punkte(i.leistungen.slice(0, 3))}</div>`,
              )
              .join("")}</div>`
          : `<div class="leer">Ihr persönliches Angebot zeigen wir Ihnen im Gespräch.</div>`
      }`,
    ),
    notizen: [
      "„Auf Basis dessen, was Sie mir gesagt haben, empfehle ich Ihnen …, weil Sie gesagt haben …“",
      "Eine klare Empfehlung; andere Stufen nur zum Vergleich.",
      "„Wie klingt das für Sie?“",
    ],
  });

  // Vergleich je Sparte mit mehreren Stufen: drei echte Stufen, Empfehlung hervorgehoben
  const nachSparte = new Map<string, AngebotItem[]>();
  for (const i of items) nachSparte.set(i.sparte, [...(nachSparte.get(i.sparte) ?? []), i]);
  for (const [sparte, varianten] of nachSparte) {
    if (varianten.length < 2) continue;
    const v = varianten.slice(0, 3);
    out.push({
      id: `vergleich-${sparteKey(sparte)}-${out.length}`,
      titel: `Vergleich ${sparte}`,
      html: rahmen(
        m,
        `<h2>${e(sparte)}: die Stufen im Vergleich</h2><div class="angebote" style="grid-template-columns:repeat(${v.length},1fr)">${v
          .map(
            (i) => `<div class="angebot${i.empfohlen ? " empf" : ""}">${i.empfohlen ? `<span class="badge">Empfehlung</span>` : ""}<div class="tarif">${e(i.tarif ?? sparte)}</div>${
              i.beitragMonat != null ? `<div class="preis">${eur(i.beitragMonat)} <small>im Monat</small></div>` : ""
            }${punkte(i.leistungen.slice(0, 4))}</div>`,
          )
          .join("")}</div>`,
      ),
      notizen: ["Die empfohlene Stufe begründen; die anderen nur als Vergleich.", "„Welche Stufe passt für Sie am besten?“"],
    });
  }

  const drin = [...new Set(zeige.flatMap((i) => i.leistungen))].slice(0, 6);
  const nicht = [...new Set(zeige.flatMap((i) => i.ausschluesse))].slice(0, 4);
  const sb = [...new Set(zeige.map((i) => i.selbstbeteiligung).filter((x): x is string => !!x))];
  out.push({
    id: "leistungen",
    titel: "Das ist drin",
    html: rahmen(
      m,
      `<h2>Das ist drin, und das nicht</h2>${
        drin.length || nicht.length
          ? `<div class="zwei"><div class="ok"><ul>${drin.map((x) => `<li>${e(x)}</li>`).join("")}</ul></div><div class="nein"><ul>${[
              ...nicht,
              ...(sb.length ? [`Selbstbeteiligung: ${sb.join(", ")}`] : []),
            ]
              .map((x) => `<li>${e(x)}</li>`)
              .join("")}</ul></div></div>`
          : `<div class="leer">Die Leistungen gehen wir im Gespräch gemeinsam durch.</div>`
      }`,
    ),
    notizen: [
      tier ? "Offen sagen: Bekannte Vorerkrankungen sind nicht mitversichert, für bestimmte Leistungen gelten Wartezeiten." : "Offen sagen, was nicht versichert ist, damit es später keine Überraschung gibt.",
    ],
  });

  const summe = angebote ? summeEmpfohlen(angebote) : null;
  out.push({
    id: "beitrag",
    titel: "Ihr Beitrag",
    html: rahmen(
      m,
      `<h2>Ihr Beitrag</h2>${
        summe != null
          ? `<div class="gross">${eur(summe)}</div><p class="sub">im Monat, das sind etwa ${eur(summe / 30)} am Tag.</p>`
          : `<div class="leer">Ihren Beitrag rechnen wir gemeinsam.</div>`
      }<p style="margin-top:36px;max-width:900px">${e(SPARTE_TEXT[sparten[0]]?.text ?? "")}</p>`,
    ),
    notizen: [
      "Einwände: erst eingrenzen („Angenommen, das wäre gelöst …“), dann das Gefühl benennen, dann sachlich antworten.",
      "„Zu teuer“: kleinere Stufe oder Selbstbeteiligung, nie Leistungen schönreden.",
    ],
  });

  out.push({
    id: "weiter",
    titel: "So geht es weiter",
    html: rahmen(
      m,
      `<h2>So geht es weiter</h2><div class="schritte">
<div class="schritt"><div class="n">1</div><b>Beginn wählen</b><span>Zum 1. des nächsten Monats oder ab sofort.</span></div>
<div class="schritt"><div class="n">2</div><b>Antrag ausfüllen</b><span>Gemeinsam, in wenigen Minuten${tier ? ", mit der Chipnummer" : ""}.</span></div>
<div class="schritt"><div class="n">3</div><b>Unterlagen</b><span>Kommen per E-Mail. 14 Tage Widerrufsrecht, ohne Begründung.</span></div></div>`,
    ),
    notizen: [
      "„Spricht etwas dagegen, dass wir das heute so festmachen?“",
      "„Soll der Schutz zum 1. des nächsten Monats starten oder schon ab sofort?“",
      "Noch nicht entschieden: Folgetermin vereinbaren, den sich der Kunde selbst einträgt.",
    ],
  });

  out.push({
    id: "danke",
    titel: "Danke",
    html: rahmen(m, `<h1>Vielen Dank, ${e(vorname)}!</h1><p class="sub">${e(d.termin.berater)} ist weiter für Sie da, einfach per WhatsApp.</p><div class="ill" style="margin-top:48px">${icon("person", 120)}</div>`, "titel"),
    notizen: [tier ? "„Kennen Sie jemanden mit Hund oder Katze, für den das auch interessant wäre?“" : "„Kennen Sie jemanden, für den das auch interessant wäre?“"],
  });
  return out;
}

/** Alle Folien als HTML-Dokument (PDF, Querformat 1280×720 je Seite). */
export function praesentationHtml(fs: Folie[], m: Marke, titel: string): string {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${e(titel)}</title><style>@page{size:1280px 720px;margin:0}body{margin:0}.slide{break-after:page}${praesentationCss(m)}</style></head><body><div class="deck">${fs.map((f) => f.html).join("")}</div></body></html>`;
}
