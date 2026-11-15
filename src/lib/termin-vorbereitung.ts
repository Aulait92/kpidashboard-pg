// Terminvorbereitung (Ole, 15.11.2026): Aufgabe „Termin vorbereiten: Angebot rechnen“ auf „Heute“ und je Termin
// eine Übersicht (auch als PDF im PG-Design) mit den Angaben in der Reihenfolge des Allianz-Tarifrechners,
// den offenen Punkten und einem festen Gesprächsleitfaden je Produkt.
//
// Reine Funktionen (Abschnitte, offene Punkte, Leitfaden, HTML) ohne Datenbank; Laden in termin-vorbereitung-server.ts.

import { qualificationPoints, type QualificationKey } from "@/lib/whatsapp/qualification";
import { produktCheckliste } from "@/lib/whatsapp/produkt-fragen";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Aufgabe erscheint ab hier vor dem Termin auf „Heute“ (Vortag; kurzfristig gebuchte sofort). */
export const VORBEREITUNG_VORLAUF_MS = 36 * 60 * 60 * 1000;

export type Feld = { label: string; wert: string | null };
export type Abschnitt = { titel: string; hinweis?: string; felder: Feld[] };
export type LeitfadenSchritt = { titel: string; minuten?: number; punkte: string[] };

export type VorbereitungDaten = {
  lead: { name: string; telefon: string | null; email: string | null; adresse: string | null; produkt: string };
  termin: { startsAt: Date; mode: string; berater: string; meetUrl: string | null };
  zusammenfassung: string | null;
  formular: { label: string; value: string }[];
  /** Angaben des Assistenten (Conversation.qualificationData). */
  angaben: unknown;
  vorbereitetAm: Date | null;
};

type Sparte = "haftpflicht" | "hausrat" | "rechtsschutz" | "wohngebaeude" | "tier" | "unfall";

const SPARTEN: { key: Sparte; label: string; match: RegExp }[] = [
  { key: "haftpflicht", label: "Privathaftpflicht", match: /haftpflicht(?!.*tier)|privathaftpflicht/i },
  { key: "hausrat", label: "Hausrat", match: /hausrat/i },
  { key: "rechtsschutz", label: "Rechtsschutz", match: /rechtsschutz/i },
  { key: "wohngebaeude", label: "Wohngebäude", match: /wohngeb(ä|a)ude|geb(ä|a)ude/i },
  { key: "tier", label: "Tierkranken / Tierhalterhaftpflicht", match: /tier|hund|katze|pferd/i },
  { key: "unfall", label: "Unfall", match: /unfall/i },
];

/** Welche Privatschutz-Sparten sind gefragt? Aus Formular („Versicherungsinteresse“) und Angaben des Assistenten. */
export function spartenAus(text: string): Sparte[] {
  // „Tierhalterhaftpflicht“ enthält „haftpflicht“: Privathaftpflicht nur, wenn sie außerhalb davon genannt ist
  const ohneTier = text.replace(/tierhalter-?\s*haftpflicht/gi, "");
  return SPARTEN.filter((s) => (s.key === "haftpflicht" ? /haftpflicht/i.test(ohneTier) : s.match.test(text))).map((s) => s.key);
}

/** Tier: Tierkranken, Tierhalterhaftpflicht oder beides? Angaben des Assistenten vor dem Formular (dort nur gemeinsam). */
export function tierWunsch(interesseAssistent: string | null): { kranken: boolean; halter: boolean } {
  const t = interesseAssistent ?? "";
  const kranken = /tierkranken|\bop\b|kranken/i.test(t);
  const halter = /halter/i.test(t);
  return kranken || halter ? { kranken, halter } : { kranken: true, halter: true };
}

const formWert = (formular: { label: string; value: string }[], re: RegExp) => formular.find((f) => re.test(f.label))?.value?.trim() || null;

/**
 * Abschnitte in der Reihenfolge der Allianz-Tarifrechner (Screenshots von Ole, 15.11.2026). Die Angaben des
 * Assistenten sind Freitext je Punkt (qualification.ts); derselbe Wert kann in mehreren Rechnern stehen.
 */
export function abschnitte(d: VorbereitungDaten): Abschnitt[] {
  const a = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  const q = (k: QualificationKey): string | null => a[k] ?? null;
  const plz = d.lead.adresse ?? formWert(d.formular, /postleitzahl|plz|adresse/i);
  const kat = produktCheckliste(d.lead.produkt)?.key ?? null;

  if (kat === "tier") {
    return [
      {
        titel: "Allianz-Rechner Tierkrankenversicherung",
        felder: [
          { label: "Postleitzahl", wert: plz },
          { label: "Tierart", wert: formWert(d.formular, /tierart/i) },
          { label: "Anzahl Tiere", wert: formWert(d.formular, /anzahl tiere/i) },
          { label: "Name des Tieres", wert: formWert(d.formular, /name des tieres|tiername/i) },
          { label: "Geschlecht", wert: formWert(d.formular, /geschlecht/i) },
          { label: "Geburtsmonat / -jahr", wert: [formWert(d.formular, /geburtsmonat/i), formWert(d.formular, /geburtsjahr/i)].filter(Boolean).join(" ") || null },
          { label: "Rasse", wert: formWert(d.formular, /rasse/i) },
          { label: "Haltung (Wohnung / Freigänger)", wert: formWert(d.formular, /haltung/i) },
          { label: "Gesundheit (24 Monate) und weitere Tiere", wert: q("tier") },
        ],
      },
      {
        titel: "Für Angebot und Antrag",
        felder: [
          { label: "Gewünschter Schutz (OP oder voll)", wert: q("tarifwunsch") },
          { label: "Geburtsdatum des Halters", wert: q("geburt") },
          { label: "Bestehende Tierversicherung", wert: q("vorhanden") },
        ],
      },
    ];
  }

  if (kat === "privatschutz") {
    const interesse = [formWert(d.formular, /versicherungsinteresse|interesse/i), q("interesse")].filter(Boolean).join(" ");
    let sp = spartenAus(interesse);
    if (!sp.length) sp = SPARTEN.map((s) => s.key);
    const out: Abschnitt[] = [
      {
        titel: "Für alle Sparten",
        felder: [
          { label: "Lebenssituation", wert: formWert(d.formular, /lebenssituation/i) ?? q("lebenssituation") },
          { label: "Wer versichert werden soll", wert: q("versichern") },
          { label: "Geburtsdatum", wert: q("geburt") },
          { label: "Adresse / PLZ", wert: plz },
          { label: "Bestehende Verträge", wert: q("vorhanden") },
        ],
      },
    ];
    const add = (s: Sparte, felder: Feld[]) => {
      if (sp.includes(s)) out.push({ titel: `Allianz-Rechner ${SPARTEN.find((x) => x.key === s)!.label}`, felder });
    };
    add("haftpflicht", [
      { label: "Zu versichernde Personen", wert: q("versichern") },
      { label: "Haftpflichtschäden (5 Jahre)", wert: q("vorschaeden") },
      { label: "Öffentlicher Dienst (Dienst-Haftpflicht)", wert: q("beruf") },
    ]);
    add("hausrat", [
      { label: "Wohnfläche, ständig bewohnt, EFH oder MFH", wert: q("wohnflaeche") },
      { label: "Schäden (Hausrat, Fahrrad, Elementar)", wert: q("vorschaeden") },
    ]);
    add("rechtsschutz", [
      { label: "Lebensbereiche", wert: q("bereiche") },
      { label: "Öffentlicher Dienst, selbstständig, Geschäftsführer", wert: q("beruf") },
      { label: "Rechtsstreit / -beratung (5 Jahre)", wert: q("vorschaeden") },
    ]);
    add("wohngebaeude", [
      { label: "Gebäude (Fläche, Baujahr, Einheiten, Nutzung, Bauweise, Technik)", wert: q("gebaeude") },
      { label: "Vorversicherung (5 Jahre)", wert: q("vorhanden") },
      { label: "Schäden (Feuer, Wasser, Sturm, Elementar)", wert: q("vorschaeden") },
    ]);
    const tw = tierWunsch(q("interesse"));
    add("tier", [
      { label: "Tiere, Anzahl, je Tier", wert: q("tier") },
      ...(tw.kranken ? [{ label: "Gewünschter Schutz (OP oder voll)", wert: q("tarifwunsch") }] : []),
      ...(tw.halter ? [{ label: "Tierhalter-Haftpflichtschäden (5 Jahre)", wert: q("vorschaeden") }] : []),
    ]);
    add("unfall", [{ label: "Beruf und riskante Sportarten", wert: q("beruf") }]);
    return out;
  }

  // Andere Produkte: was der Assistent und das Formular wissen
  return [{ titel: "Angaben des Assistenten", felder: qualificationPoints(d.angaben).map((p) => ({ label: p.label, wert: p.value })) }];
}

/** Offene Punkte: Felder ohne Wert (je Bezeichnung einmal). */
export function offenePunkte(ab: Abschnitt[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of ab) for (const f of s.felder) {
    const leer = !f.wert || /^offen$/i.test(f.wert.trim());
    if (leer && !seen.has(f.label)) {
      seen.add(f.label);
      out.push(f.label);
    }
  }
  return out;
}

/** Fester Gesprächsleitfaden je Produkt (geprüfte Texte, keine KI). */
export function leitfaden(produkt: string): LeitfadenSchritt[] {
  const kat = produktCheckliste(produkt)?.key ?? null;
  const einstieg: LeitfadenSchritt = {
    titel: "Einstieg",
    minuten: 2,
    punkte: [
      "Begrüßen, auf die Anfrage beziehen: „Sie hatten sich wegen … gemeldet, ich habe mir Ihre Angaben schon angeschaut.“",
      "Ziel und Dauer nennen: „Ich zeige Ihnen gleich ein passendes Angebot, danach entscheiden Sie in Ruhe.“",
    ],
  };
  const abschluss: LeitfadenSchritt = {
    titel: "Abschluss",
    minuten: 5,
    punkte: [
      "Nach der Entscheidung fragen: „Wollen wir das so für Sie umsetzen?“",
      "Antrag gemeinsam ausfüllen: Beginn, IBAN, fehlende Angaben.",
      "Bisherigen Vertrag: Kündigung anbieten (E-Mail-Vorlage „Kündigung alte Versicherung“).",
      "Noch nicht entschieden: konkreten Folgetermin vereinbaren statt „ich melde mich“.",
    ],
  };
  const danach: LeitfadenSchritt = {
    titel: "Nach dem Termin",
    punkte: ["Ergebnis in der App eintragen: Gewonnen, Angebot gesendet oder Verloren.", "Bei Abschluss die Police im Kontakt hochladen."],
  };
  if (kat === "tier") {
    return [
      einstieg,
      {
        titel: "Bedarf bestätigen",
        minuten: 3,
        punkte: [
          "Tier(e) kurz bestätigen: Name, Alter, Rasse, Haltung.",
          "Gesundheit der letzten 24 Monate durchgehen, offene Punkte klären (siehe oben).",
          "Wunsch klären: nur OP-Schutz oder volle Krankenversicherung, und warum.",
        ],
      },
      {
        titel: "Angebot zeigen",
        minuten: 8,
        punkte: [
          "OP-Schutz und Vollschutz nebeneinander zeigen: Beitrag und was jeweils bezahlt wird.",
          "Selbstbeteiligung und Tarifstufe als Stellschrauben für den Beitrag erklären.",
          "Bei mehreren Tieren: Beitrag je Tier und gesamt.",
        ],
      },
      {
        titel: "Häufige Einwände",
        punkte: [
          "„Mein Tier ist doch gesund“: eine einzige OP kostet schnell mehr als Jahre Beitrag; jetzt ist der Einstieg ohne Vorerkrankungen möglich.",
          "„Zu teuer“: OP-Schutz statt Vollschutz, höhere Selbstbeteiligung.",
          "„Muss ich mir überlegen“: Was genau ist noch offen? Folgetermin vereinbaren.",
        ],
      },
      { ...abschluss, punkte: [...abschluss.punkte, "Chipnummer jedes Tieres für den Antrag."] },
      danach,
    ];
  }
  if (kat === "privatschutz") {
    return [
      einstieg,
      {
        titel: "Bedarf bestätigen",
        minuten: 5,
        punkte: [
          "Lebenssituation und gewünschte Sparten bestätigen.",
          "Offene Punkte klären (siehe oben).",
          "Bestehende Verträge: Gesellschaft, Ablauf, Kündigungsfrist.",
        ],
      },
      {
        titel: "Angebot zeigen",
        minuten: 10,
        punkte: [
          "Je Sparte Beitrag und die zwei, drei wichtigsten Leistungen.",
          "Paketvorteil bei mehreren Sparten (Allianz PrivatSchutz) zeigen.",
          "Tarifstufen und Selbstbeteiligung als Stellschrauben erklären.",
        ],
      },
      {
        titel: "Häufige Einwände",
        punkte: [
          "„Ich habe schon eine Versicherung“: Leistungen und Beitrag gegenüberstellen, Kündigungsfrist prüfen.",
          "„Zu teuer“: Selbstbeteiligung, Tarifstufe, Paketvorteil.",
          "„Muss ich mir überlegen“: Was genau ist noch offen? Folgetermin vereinbaren.",
        ],
      },
      abschluss,
      danach,
    ];
  }
  return [
    einstieg,
    { titel: "Bedarf klären", minuten: 5, punkte: ["Situation und Wunsch bestätigen, offene Punkte klären."] },
    { titel: "Angebot zeigen", minuten: 10, punkte: ["Passende Lösung mit Beitrag und wichtigsten Leistungen zeigen."] },
    abschluss,
    danach,
  ];
}

/** Unterlagen je Produkt; bei Privatschutz nur die Sparten-Punkte („bei Hausrat: …“), die gefragt sind. */
export function unterlagenFuer(produkt: string, sparten?: Sparte[]): string[] {
  const list = produktCheckliste(produkt)?.unterlagen ?? [];
  if (!sparten?.length) return list;
  const zu: Record<string, Sparte> = { hausrat: "hausrat", "wohngebäude": "wohngebaeude", tieren: "tier" };
  return list.filter((u) => {
    const m = u.match(/^bei (\S+?):/i);
    return !m || !zu[m[1].toLowerCase()] || sparten.includes(zu[m[1].toLowerCase()]);
  });
}

/** Gefragte Privatschutz-Sparten eines Termins (für Unterlagen). */
export function spartenVon(d: VorbereitungDaten): Sparte[] {
  if (produktCheckliste(d.lead.produkt)?.key !== "privatschutz") return [];
  const a = Object.fromEntries(qualificationPoints(d.angaben).map((p) => [p.key, p.value])) as Partial<Record<QualificationKey, string>>;
  return spartenAus([formWert(d.formular, /versicherungsinteresse|interesse/i), a.interesse].filter(Boolean).join(" "));
}

const DT = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);

/** HTML im PG-Design (Marke „performancegrowth“, Blau #2563eb) für das PDF (Chromium, A4). */
export function vorbereitungHtml(d: VorbereitungDaten): string {
  const ab = abschnitte(d);
  const offen = offenePunkte(ab);
  const lf = leitfaden(d.lead.produkt);
  const unterlagen = unterlagenFuer(d.lead.produkt, spartenVon(d));
  const e = (s: string) => escapeHtml(s);
  const feld = (f: Feld) =>
    `<tr><td class="l">${e(f.label)}</td><td class="${f.wert ? "v" : "v offen"}">${f.wert ? e(f.wert) : "offen"}</td></tr>`;
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>Terminvorbereitung ${e(d.lead.name)}</title>
<style>
@page { size: A4; margin: 16mm 16mm 18mm; }
* { box-sizing: border-box; }
body { font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #0b1220; font-size: 10.5pt; line-height: 1.45; margin: 0; }
.kopf { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 16px; }
.marke { font-size: 15pt; font-weight: 700; letter-spacing: -0.01em; }
.marke span { color: #2563eb; }
.doc { color: #66758f; font-size: 9pt; text-align: right; }
h1 { font-size: 19pt; margin: 0 0 2px; letter-spacing: -0.02em; }
.sub { color: #66758f; margin: 0 0 14px; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.chip { background: #e5edff; color: #1d4ed8; border-radius: 999px; padding: 3px 10px; font-size: 9pt; font-weight: 600; }
.chip.ok { background: #dcfce7; color: #166534; }
.chip.warn { background: #fef3c7; color: #92400e; }
.card { border: 1px solid #e3e9f3; border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; break-inside: avoid; }
.card h2 { font-size: 11.5pt; margin: 0 0 8px; color: #1d4ed8; }
.grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 18px; }
.k { color: #66758f; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .04em; }
table { width: 100%; border-collapse: collapse; }
td { padding: 5px 0; border-top: 1px solid #eef2f8; vertical-align: top; }
tr:first-child td { border-top: 0; }
td.l { width: 44%; color: #66758f; padding-right: 12px; }
td.v { font-weight: 600; }
td.offen { color: #b45309; font-weight: 600; }
.offenbox { background: #fffbeb; border-color: #fde68a; }
.offenbox h2 { color: #92400e; }
ul { margin: 0; padding-left: 16px; }
li { margin: 2px 0; }
.schritt { display: grid; grid-template-columns: 26px 1fr; gap: 8px; margin-bottom: 8px; break-inside: avoid; }
.nr { width: 22px; height: 22px; border-radius: 999px; background: #2563eb; color: #fff; font-weight: 700; font-size: 9pt; display: flex; align-items: center; justify-content: center; }
.schritt b { display: block; }
.min { color: #66758f; font-weight: 400; font-size: 9pt; }
.check li { list-style: none; margin-left: -16px; }
.check li::before { content: "☐  "; color: #2563eb; }
.zus { font-style: italic; color: #334155; }
.fuss { margin-top: 14px; color: #9aa4b2; font-size: 7.5pt; display: flex; justify-content: space-between; border-top: 1px solid #e3e9f3; padding-top: 6px; }
.seite { break-before: page; }
</style></head><body>
<div class="kopf"><div class="marke">performance<span>growth</span></div><div class="doc">Terminvorbereitung<br>${e(DT(new Date()))}</div></div>
<h1>${e(d.lead.name)}</h1>
<p class="sub">${e(d.lead.produkt)} · ${e(DT(d.termin.startsAt))} Uhr · ${d.termin.mode === "video" ? "Videocall" : "Telefonat"} mit ${e(d.termin.berater)}</p>
<div class="chips">
  <span class="chip">${e(d.lead.produkt)}</span>
  ${offen.length ? `<span class="chip warn">${offen.length} offene ${offen.length === 1 ? "Angabe" : "Angaben"}</span>` : `<span class="chip ok">Alle Angaben vollständig</span>`}
  ${d.vorbereitetAm ? `<span class="chip ok">Vorbereitet</span>` : ""}
</div>
<div class="card"><h2>Kontakt</h2><div class="grid">
  <div><div class="k">Telefon</div>${e(d.lead.telefon ?? "nicht bekannt")}</div>
  <div><div class="k">E-Mail</div>${e(d.lead.email ?? "nicht bekannt")}</div>
  <div><div class="k">Adresse</div>${e(d.lead.adresse ?? "nicht bekannt")}</div>
  <div><div class="k">Termin</div>${d.termin.mode === "video" && d.termin.meetUrl ? e(d.termin.meetUrl) : "Sie rufen an"}</div>
</div>${d.zusammenfassung ? `<p class="zus" style="margin:10px 0 0">Assistent: ${e(d.zusammenfassung)}</p>` : ""}</div>
${offen.length ? `<div class="card offenbox"><h2>Im Termin klären</h2><ul>${offen.map((o) => `<li>${e(o)}</li>`).join("")}</ul></div>` : ""}
${ab.map((s) => `<div class="card"><h2>${e(s.titel)}</h2><table>${s.felder.map(feld).join("")}</table></div>`).join("")}
${d.formular.length ? `<div class="card"><h2>Aus dem Leadformular</h2><table>${d.formular.map((f) => feld({ label: f.label, wert: f.value })).join("")}</table></div>` : ""}
<div class="seite"></div>
<div class="kopf"><div class="marke">performance<span>growth</span></div><div class="doc">Gesprächsleitfaden<br>${e(d.lead.name)}</div></div>
<h1>Gesprächsleitfaden</h1><p class="sub">${e(d.lead.produkt)} · etwa 30 Minuten</p>
<div class="card">${lf
    .map(
      (s, i) =>
        `<div class="schritt"><div class="nr">${i + 1}</div><div><b>${e(s.titel)}${s.minuten ? ` <span class="min">ca. ${s.minuten} Min.</span>` : ""}</b><ul>${s.punkte.map((p) => `<li>${e(p)}</li>`).join("")}</ul></div></div>`,
    )
    .join("")}</div>
${unterlagen.length ? `<div class="card"><h2>Unterlagen, um die der Kunde gebeten wurde</h2><ul class="check">${unterlagen.map((u) => `<li>${e(u)}</li>`).join("")}</ul></div>` : ""}
<div class="fuss"><span>performancegrowth · vertraulich, nur für die Beratung</span><span>${e(d.lead.name)}</span></div>
</body></html>`;
}
