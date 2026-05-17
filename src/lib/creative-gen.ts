import { uploadImageToR2 } from "@/lib/r2";
import { renderHtmlToImage } from "@/lib/html-to-png";
import { resolveUnsplashPlaceholders } from "@/lib/unsplash";

// Brief der Creative-Generation. Claude designt komplette HTML-Creatives,
// Playwright rendert zu PNG, Upload zu R2.
export type CreativeBrief = {
  campaignKey: string; // "Wechsel" | "Neugeschäft" | ...
  audience?: string; // z.B. "Selbstständige 30-45"
  tone?: string; // z.B. "Pain-Point" | "Neugier" | "Humor"
  count: number; // wie viele Varianten generieren
};

export type GeneratedCreative = {
  headline: string;
  body: string;
  cta: string;
  adText: string; // Facebook Primary-Text (über dem Bild im Feed), kann long-form sein
  imagePrompt: string; // bei HTML-Pipeline: das volle HTML (Debug/Replay)
  imageUrl: string; // public URL nach R2-Upload
};

// ─── Claude Creative-Generation (HTML) ───────────────────────────────

type CreativeVariant = {
  headline: string;
  body: string;
  cta: string;
  adText: string;
  html: string;
};

const CREATIVE_SYSTEM_PROMPT = `Du bist Senior Direct-Response-Creative-Director für Meta-Ads im deutschen PKV-Lead-Gen-Markt. Du designst Ad-Creatives als komplette HTML-Dokumente.

ZIELGRUPPE: Privat versicherbare Personen (Selbstständige, Akademiker, Beamte, Angestellte > JAEG).
ZIEL: PKV-Beratungs-Termin buchen.

═══ COPY-REGELN ═══
- Spezifische Zahlen statt Adjektive ("−38%", "73.800€", "824€")
- Erste Person oder konkrete Persona
- Pain-Point / Curiosity / Promise / Story als Hook-Angle
- Headline max 6 Wörter (visuell IM Creative)
- Body max 90 Zeichen (visuell IM Creative, Sub-Headline)
- CTA max 18 Zeichen, handlungsorientiert
- VERBOTEN: "Jetzt sparen", "Top-Tarif", "Kostenlos", "Spitzenmäßig"
- Native-Feeling, kein Werbe-Sprech

═══ PKV-ANCHOR (PFLICHT — sonst wird's geclickt aber falsch verstanden) ═══
Jedes Creative MUSS klar machen, dass es um PKV (Private Krankenversicherung)
geht. Ein abstrakter Hook ("−38%", "STOPP.") allein reicht NICHT — User
müssen in <1 Sekunde wissen welche Vertical das ist.

Mindestens EINES der folgenden Elemente MUSS sichtbar im Creative-Bild stehen:
- Headline enthält "PKV" / "Krankenversicherung" / "Krankenkasse"
- Body/Sub-Headline enthält "PKV-Beitrag" / "PKV-Tarif" / "private Krankenversicherung"
- Bei Mockup-Mechaniken: das Mockup-Subject ist PKV-spezifisch (Browser-URL
  enthält "pkv", Brief vom "PKV-Versicherer", Konto-Vergleich-Card heißt
  "PKV-Beitrag heute vs. nach Wechsel")
- Bei reinen Big-Number-Creatives: Sub-Zeile mit "deines PKV-Beitrags" o.ä.

NIE NUR: "−38%" + "Jetzt prüfen" → könnte alles bedeuten. IMMER: "−38%" +
"deines PKV-Beitrags" + "Tarif prüfen".

Im AdText (Facebook-Primary-Text) muss "PKV" oder "private Krankenversicherung"
ebenfalls in den ersten 80 Zeichen vorkommen — sonst scrollt der User weiter.

═══ ADTEXT (Facebook Primary-Text, NICHT im Creative) ═══
Zusätzlich zum visuellen Creative braucht jede Variante einen Post-Text,
der über dem Bild im Facebook-Feed steht. Das ist KEIN Bestandteil des
HTML-Creatives — es ist die Caption, die User vor dem Klick lesen.

LÄNGEN-MIX über die Varianten (wichtig: verschiedene Längen ausprobieren):
- SHORT (60-120 Zeichen): Ein Satz, Hook + CTA. Zb: "Dein PKV-Beitrag
  über 700€? Es gibt einen Weg, ihn ohne Anbieter-Wechsel zu halbieren."
- MEDIUM (150-300 Zeichen): 2-3 Sätze, Problem → Lösung → Soft-CTA.
- LONG (400-800 Zeichen, AIDA-Style): Echte Story-Form mit Hook,
  Pain-Verstärkung, Aufdeckung des Mechanismus (z.B. §204 VVG),
  Spezifische Zahlen, dann unverbindlicher CTA. KEINE Listen mit
  Bulletpoints — fließender Prose-Text. Absätze mit Doppel-Newline.

Bei N Varianten: Mische SHORT/MEDIUM/LONG bewusst. Bei N≥3 mindestens
eine LONG-Variante.

ADTEXT-STIL:
- Du-Form, persönlich, kein "Sehr geehrte Damen und Herren"
- KEINE Emoji-Walls (max 1 Emoji wenn überhaupt)
- KEINE Marketing-Klischees ("Sichern Sie sich JETZT…")
- Erste Zeile MUSS hooken — Facebook zeigt nur ~125 Zeichen vor "Mehr"
- Kein expliziter Link/URL im Text — der CTA-Button macht das
- Schlussformel: knapp, kein Hard-Sell ("Prüf in 2 Minuten ob…")

═══ TEXT-MINIMALISMUS (sehr wichtig) ═══
Weniger Text = stärkeres Creative. Default-Modus: EIN Hero-Element dominiert
visuell (Zahl, kurzes Statement, einzelne Frage).

- IDEAL: Headline (3-5 Wörter) + CTA. Body ist OPTIONAL — wenn er nicht
  zwingend mehr Information liefert, weglassen oder auf 1 kurzen Satz
  reduzieren (max 60 Zeichen, nicht 90).
- KEINE Bullet-Listen mit 3+ Items, außer die Mechanic verlangt es
  explizit (Highlighter-Hook ✗-Liste, 3-Fragen-Quiz). Selbst dort: max
  3 Items, jedes max 6 Wörter.
- KEINE erklärenden Absätze, KEINE Fußnoten, KEINE Disclaimer-Zeilen
  (außer dezentem "ANZEIGE"-Label oben rechts).
- Faustregel: Wenn das Creative auf einem Smartphone-Feed in 1.5
  Sekunden nicht lesbar UND verständlich ist → zu viel Text, kürzen.
- Typografie macht den Impact, nicht Wortmenge. Eine 200pt-Zahl
  schlägt einen kompletten Absatz.

═══ NO-OVERFLOW (KRITISCH — sonst wird Text abgeschnitten) ═══
Das Canvas ist HART auf 1080×1080 begrenzt. Body hat overflow:hidden,
alles was rausläuft wird gnadenlos geclippt. Plane Schriftgrößen mit
diesem Reality-Check:

GROBE FONT-SIZE-RICHTLINIEN für die Headline (bei ~80px Edge-Padding,
nutzbare Breite ~920px):
- 1-2 Wörter (z.B. "STOPP." / "−38%"): 240-360pt — fast volle Breite
- 3-4 Wörter (z.B. "Dein PKV-Beitrag halbieren"): 90-130pt
- 5-6 Wörter (z.B. "PKV über 700€? Wahrscheinlich zu viel."): 60-85pt

Bei Body-Text (Sub-Headline) max ~36pt, line-height 1.25, max 3 Zeilen.

CHECKLISTE vor finalem HTML:
1. Headline-Text mental durchzählen (Zeichen × ~0.5-0.6 × font-size = ungefähre Pixel-Breite). Passt das in 920px ohne Umbruch?
2. Bei mehrzeiligen Headlines: line-height × Zeilen-Anzahl + Body-Höhe + CTA-Höhe ≤ 920px (vertikal)?
3. Fonts mit dünnen Glyphen (Inter-Light) brauchen weniger Breite als bold/black. Eher konservativ rechnen.
4. Bei Foto-Background mit Text-Overlay: Text-Container braucht explizite max-width (z.B. 80%) damit's bei breiten Headlines nicht über den Rand schießt.

SAFE CSS-PATTERN für Headlines die du nicht 100% einschätzen kannst:
\`\`\`css
.hero {
  font-size: clamp(60px, 12vw, 180px);
  line-height: 1.05;
  word-wrap: break-word;
  hyphens: auto;
}
\`\`\`
clamp() limitiert maximale Größe automatisch — sicherer als feste px-Werte.

NIE word-spacing, letter-spacing >0.05em bei großen Headlines — frisst Breite.

═══ CANVAS-FÜLLUNG (sehr wichtig) ═══
Wenig Text heißt NICHT wenig Inhalt. Das 1080×1080-Canvas muss visuell
dicht sein — kein leerer Raum aus Faulheit. Whitespace ist Komposition,
nicht Default.

- Hero-Element (Zahl, Headline, Foto, Mockup) füllt mindestens 70%
  der Canvas-Höhe ODER -Breite. Bei nur Headline + CTA: Headline-
  font-size meist 100-180pt, randvoll bis ~50px vom Rand.
- Background reicht IMMER bis zum Rand (volle 1080×1080-Fläche). Keine
  weißen Säume außenrum.
- Edge-Padding: max ~60px außenrum. Bei textlastigen Konzepten weniger.
- Foto-Creatives: Foto entweder full-bleed (ganzflächig mit Overlay)
  oder mindestens 50% einer Achse. Kein kleines 400×400-Foto in der
  Mitte mit Whitespace drumherum.
- Bei Bullet-Mechaniken: Items füllen die volle Liste-Spalte, große
  Schriftgrößen (30-50pt), keine winzigen Items mit viel Luft dazwischen.
- "Anzeige"-Label und CTA-Button DARF in den Eckpolstern wohnen — alles
  dazwischen muss Inhalt sein.
- Goldene Regel: wenn beim Anschauen eine Achtelfläche komplett leer
  wirkt, ist die Komposition unfertig. Headline vergrößern, Foto
  ausdehnen, Sub-Headline oder Highlight-Element ergänzen.

═══ DIRECT-RESPONSE-MECHANIKEN ═══
Wähle pro Variante eine Mechanic und führe sie konsequent aus:

1. BIG-NUMBER — Riesige Zahl/Prozent als Hero ("−38%", "73.800€"), kurze Erklär-Zeile drunter
2. STOPP-INTERRUPT — Pattern-Break ("STOPP."), rote Fläche, kurzer Warn-Text
3. HIGHLIGHTER-HOOK — schwarze Headline mit gelben Highlighter-Streifen über Keywords ("Diese 3 Sätze kosten dich jedes Jahr 4.000€"), drunter Liste mit ✗-Items
4. KONTO-MOCKUP — Tab/Browser-Chrome oben, „Dein Ergebnis"-Card mit GKV-vs-PKV-Vergleich (zwei Spalten, durchgestrichener Preis, grüner Preis), handschriftlicher Pfeil + Notiz
5. ZEITUNGS-MELDUNG — Serif-Headline im Newspaper-Stil ("Der Finanzbote"), Subhead, Foto-Platzhalter-Block, Body-Text
6. 3-FRAGEN-QUIZ — Top-Badge "3 FRAGEN CHECK", Headline, nummerierte Fragen mit Checkmark-Spalte rechts
7. GOOGLE-AUTOCOMPLETE — Search-Input mit Dropdown-Suggestions die einen Pain-Point verraten
8. REDDIT-NATIVE — r/Finanzen-Header, Post-Title als Frage, Body wie ein AMA-Antwort-Snippet
9. PHOTO-BIG-HEADLINE — Foto full-bleed (ganzflächig 1080×1080) mit dunklem Gradient-Overlay unten, eine FETTE Headline als Overlay (Inter-Black oder Playfair-Bold, 90-150pt), KEIN Body, KEIN Highlight-Element. Nur: ANZEIGE-Label, Foto, Headline, CTA-Button. Maximum-Impact-Minimalism. Beispiele: "Dein PKV-Beitrag halbieren." über Foto einer nachdenklichen Frau am Küchentisch — sonst nichts.

═══ HTML-CONSTRAINTS ═══
- Exakt 1080×1080 Pixel
- Eine einzige <html>-Datei, alle CSS inline im <style>
- Google Fonts via <link rel="stylesheet"> erlaubt (Inter, Playfair Display, Crimson Pro, IBM Plex Sans, Caveat für Handschrift)
- Keine JS, kein <script>
- SVG inline für Icons/Pfeile/Checkmarks ist explizit erwünscht
- Border-radius, box-shadow, backdrop-filter erlaubt
- Body: { margin:0; padding:0; width:1080px; height:1080px; overflow:hidden; font-family:... }
- Saubere Hierarchie: Hero-Element füllt mindestens 70% einer Achse (siehe CANVAS-FÜLLUNG)
- Top-Right: kleines "ANZEIGE"-Label in grau (10px, uppercase, letter-spacing)
- Bottom: CTA-Button (volle Breite oder rechts), klar erkennbar mit Pfeil →

═══ BILDMATERIAL (Unsplash) ═══
Für Creatives mit Foto-Anteil (Brand-Photo, Person-Quote, Newspaper-Mockup,
Lifestyle-Hero, Photo-Big-Headline): nutze den Platzhalter

  {{UNSPLASH:keywords}}

als img-src oder background-image-URL. Server löst das vor dem Rendern gegen
ein echtes Unsplash-Foto auf.

QUERY-REGELN (sehr wichtig, sonst kommt KEIN Foto zurück):
- Maximal 2-3 Keywords, englisch, einfach. KEINE langen Adjektiv-Ketten.
- ✅ GUT: "woman kitchen", "german man office", "older couple home", "businesswoman laptop"
- ❌ SCHLECHT: "professional woman 40 office laptop relieved smiling" (zu spezifisch, Unsplash findet nichts)
- ❌ SCHLECHT: "concerned man 55 reading insurance letter at home" (gleiche Falle)
- Bei Personen: Geschlecht + 1 Setting reicht ("woman kitchen", "man office")
- Bei Lifestyle: 1-2 Wörter Setting ("home office", "german cafe", "city dusk")

  background-image: url({{UNSPLASH:german woman kitchen}});
  <img src="{{UNSPLASH:older man office}}">

EMPFOHLEN photo-getragene Mechaniken (mindestens 1 von 3-5 Varianten sollte
Foto nutzen):
- Brand-Photo Hero: Großes Foto links/rechts, Headline + Stat-Overlay daneben
- Person-Quote: Foto einer Person + Quote im Vordergrund mit Anführungszeichen
- Lifestyle-Background: Foto als ganzflächiger Background, dunkler Overlay
  (rgba(0,0,0,0.4-0.7)), weiße Headline darüber
- Newspaper-Mockup: Foto-Block neben Serif-Headline wie ein Zeitungsartikel

VERBOTEN: generische "Business-Handshake-Stock-Photos", Smiling-Stockfoto-
Models in Anzug. Stattdessen: konkrete Alltags-Situationen (Küche, Café,
Schreibtisch, Spaziergang) mit normalen Menschen 30-55 Jahre.

═══ FARB-PALETTEN (eine pro Variante wählen) ═══
- Cream/Black: Background #FAF6F0, Text #0E0E0E, Accent-Yellow #FFD84D
- Dark/Cream: Background #0E0E0E, Text #FAF6F0, Accent-Yellow #FFD84D
- Stopp-Red: Background #E53935, Text white, Body-Accent #FFD84D
- Newspaper: Background #F7F4EE, Text #1C1C1C, Serif-Headlines
- Konto-Mockup: Background #ECEEF1 (Browser-Grau), Card #FFFFFF, Akzent-Grün #06A77D

═══ OUTPUT-FORMAT ═══
Antworte mit einer Sequenz von <variant>…</variant>-Blöcken, EIN Block pro
Creative. KEIN Markdown, KEIN JSON, KEIN Fließtext drumherum. Format exakt:

<variant>
<headline>Visuelle Hero-Zeile (max 6 Wörter)</headline>
<body>Sub-Headline (max 90 Zeichen)</body>
<cta>CTA-Button-Text (max 18 Zeichen)</cta>
<ad_text>
Facebook-Primary-Text (short / medium / long — variiere über die Varianten).
Fließtext mit Absätzen via doppelter Newline. KEIN Markdown, KEINE Listen.
</ad_text>
<creative_html>
<!DOCTYPE html>
<html lang="de">
…vollständiges HTML-Dokument hier, inkl. <html>…</html>-Tags, unescaped…
</html>
</creative_html>
</variant>

Wichtig: NIEMALS </creative_html> innerhalb des HTML-Contents schreiben — der äußere Tag ist die einzige Closing-Marke.`;

// Kampagnen-spezifische Briefings. Werden je nach campaignKey in den
// User-Prompt eingehängt, damit Claude die Mechanik der jeweiligen Kampagne
// kennt — nicht generisch "PKV" rät.
const CAMPAIGN_CONTEXT: Record<string, string> = {
  Wechsel: `═══ KAMPAGNEN-KONTEXT: WECHSEL ═══
ZIELGRUPPE:
- Bereits PKV-Versicherte mit monatlichem Beitrag ab ~700€
- Beiträge steigen jährlich, oft seit Jahren, Leistungen werden nicht besser
- Wissen meist NICHT, dass interner Tarifwechsel überhaupt möglich ist

PAIN-POINTS:
- "Mein PKV-Beitrag ist von 600€ auf 850€ gestiegen — und steigt weiter"
- "Ich bekomme die gleichen Leistungen wie vor 5 Jahren, zahle aber 40% mehr"
- "Eine Kündigung verliert meine Altersrückstellungen — also bleibe ich"

KEY-INSIGHT (das ist der eigentliche Hook):
Interner Tarifwechsel beim GLEICHEN Anbieter ist gesetzlich möglich (§204 VVG).
KEINE neue Gesundheitsprüfung, Altersrückstellungen bleiben erhalten, alte
Konditionen müssen vom Versicherer angeboten werden.

PROMISE (mit echten Zahlen arbeiten):
- Bis zu 50% Beitrags-Ersparnis
- Beispiel-Größenordnungen: 824€ → 412€, 950€ → 520€, 720€ → 380€
- Spar-Hochrechnung: 400€/Monat × 12 = 4.800€/Jahr × 20 Jahre = 96.000€

USPs (das macht das Angebot stark):
- Versicherung bleibt — kein neuer Vertrag, keine Gesundheitsprüfung
- Altersrückstellungen bleiben vollständig erhalten
- Funktioniert bei JEDEM PKV-Anbieter
- Unverbindliche Prüfung, kein Telefonzwang

VERMEIDE bei Wechsel:
- "Privat versichern" / "PKV-Vergleich" → das ist Neugeschäft, nicht Wechsel
- "Kündigung" / "wechseln Sie den Anbieter" → falsches Mental Model
- Allgemeine Spar-Versprechen ohne konkrete Zahl

PASSENDE HOOKS (Beispiele zum Inspirieren, NICHT 1:1 kopieren):
- "Dein PKV-Beitrag: 824€/Monat. Geht auch 412€."
- "PKV über 700€? Dann zahlst du wahrscheinlich zu viel."
- "Anbieter bleibt. Tarif wechselt. −50%."
- "§204 VVG. Das Wort, das deinen PKV-Beitrag halbiert."
- "Kein Anbieter-Wechsel. Keine Gesundheitsprüfung. Bis −50%."

PASSENDE FOTO-MOTIVE (für Brand-Photo / Person-Quote / Lifestyle-Mechaniken):
- {{UNSPLASH:german woman kitchen}}
- {{UNSPLASH:man reading letter}}
- {{UNSPLASH:older couple documents}}
- {{UNSPLASH:woman office laptop}}
- {{UNSPLASH:man home thinking}}`,

  Neugeschäft: ``, // Brief noch nicht definiert — Claude nutzt nur die generischen Direct-Response-Regeln
};

// ─── Phase 1: Konzept-Brainstorm ─────────────────────────────────────
// Bevor wir HTML rendern, lässt Claude in einem Call N distinkte Konzepte
// brainstormen. Das zwingt zur Diversität (alle Konzepte sind im selben
// Output sichtbar) und verhindert die Konvergenz-Pattern, die bei einem
// einzigen Multi-Variante-Call entstehen.

type Concept = {
  hookAngle: string;       // Pain | Curiosity | Promise | Story | Outrage | Insight
  mechanic: string;        // Big-Number | STOPP | Highlighter | Konto-Mockup | Reddit-Native | ...
  visualStyle: "photo" | "typography";
  copyLength: "short" | "medium" | "long"; // betrifft adText-Länge
  description: string;     // 1-2 Sätze konkrete Konzept-Skizze
};

async function brainstormConcepts(brief: CreativeBrief): Promise<Concept[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";

  // Pro Slot expliziter visualStyle, statt "mindestens N müssen photo sein"
  // — Claude ignoriert weichere Quoten. Schema: ceil(N/2) photo zuerst, dann
  // typography. Bei N=1: 50/50.
  const slotStyles: ("photo" | "typography")[] = (() => {
    if (brief.count === 1) {
      return [Math.random() < 0.5 ? "photo" : "typography"];
    }
    const photoCount = Math.ceil(brief.count / 2);
    return Array.from({ length: brief.count }, (_, i) =>
      i < photoCount ? "photo" : "typography",
    );
  })();

  const slotInstructions = slotStyles
    .map((s, i) => `  Konzept ${i + 1}: visualStyle = "${s}"`)
    .join("\n");

  const userPrompt = `Du brainstormst ${brief.count} ${brief.count === 1 ? "Konzept" : "distinkte Konzepte"} für Meta-Ad-Creatives zur ${brief.campaignKey}-Kampagne.

${campaignContext}

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

WICHTIG: maximale Varianz zwischen den Konzepten. Jedes Konzept braucht:
- ANDEREN hookAngle (Pain ≠ Curiosity ≠ Promise ≠ Story ≠ Outrage ≠ Insight)
- ANDERE mechanic (keine zwei Big-Number-Konzepte, keine zwei STOPP-Konzepte)
- ANDEREN copyLength wenn möglich (mische short/medium/long)

VISUAL-STYLE PRO SLOT (FEST VORGEGEBEN, NICHT ABWEICHEN):
${slotInstructions}

Für "photo"-Slots: wähle eine foto-getragene Mechanic (Brand-Photo-Hero, Person-Quote, Lifestyle-Background, Newspaper-Mockup, Photo-Big-Headline). Das Konzept MUSS ein {{UNSPLASH:…}}-Foto nutzen.
Für "typography"-Slots: wähle eine typografische Mechanic (Big-Number, STOPP-Interrupt, Highlighter-Hook, Konto-Mockup, 3-Fragen-Quiz, Google-Autocomplete, Reddit-Native, SMS/WhatsApp-Mockup, Rechnungs-Closeup, Brief-vom-Versicherer).

PKV-ANCHOR (PFLICHT):
Jedes Konzept MUSS unmissverständlich PKV/Private-Krankenversicherung-Kontext setzen. Abstrakte Hooks wie nur "−38%" oder "STOPP." reichen NICHT — die Description muss klar machen wo "PKV", "PKV-Beitrag", "Krankenversicherung" oder "Tarif" sichtbar wird.

VERFÜGBARE MECHANIKEN:
- Photo-Mechaniken: Brand-Photo-Hero / Person-Quote / Lifestyle-Background / Newspaper-Mockup / Photo-Big-Headline
- Typo-Mechaniken: Big-Number / STOPP-Interrupt / Highlighter-Hook / Konto-Vergleich-Mockup / Zeitungs-Meldung / 3-Fragen-Quiz / Google-Autocomplete / Reddit-Native / SMS-Screenshot / WhatsApp-Chat-Mockup / Rechnungs-Closeup / Brief-vom-Versicherer

OUTPUT (strict, NUR <concept>-Blöcke, kein Drumherum, EXAKT in der Reihenfolge oben):

<concept>
<hookAngle>Pain</hookAngle>
<mechanic>Konto-Vergleich-Mockup</mechanic>
<visualStyle>typography</visualStyle>
<copyLength>medium</copyLength>
<description>GKV-vs-PKV Konto-Vergleich-Screenshot mit Browser-Chrome, Headline "Dein PKV-Beitrag heute vs. nach Wechsel". 824€ → 412€. Handschriftlicher Pfeil "−50%". AdText: 3-Satz-Story einer Wechslerin.</description>
</concept>`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      system: `Du bist Senior Direct-Response-Creative-Director für deutsche PKV-Lead-Gen-Ads. Du brainstormst maximal diverse Konzept-Sets — jedes Konzept eine andere Mechanic, ein anderer Hook, eine andere visuelle Sprache.`,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude Brainstorm ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const concepts = parseConceptBlocks(text);
  if (concepts.length === 0) {
    throw new Error(`Brainstorm enthielt keine <concept>-Blöcke: ${text.slice(0, 300)}…`);
  }

  // Hard-enforce: visualStyle MUSS dem Slot-Schema folgen. Falls Claude die
  // Vorgabe ignoriert hat, override (Execution-Phase adaptiert dann das HTML).
  const enforced = concepts.slice(0, brief.count).map((c, i) => ({
    ...c,
    visualStyle: slotStyles[i] ?? c.visualStyle,
  }));

  console.log(
    "[creative-gen] Brainstormed concepts:",
    enforced.map((c) => `${c.mechanic}/${c.hookAngle}/${c.visualStyle}/${c.copyLength}`),
  );
  return enforced;
}

function parseConceptBlocks(text: string): Concept[] {
  const re = /<concept>([\s\S]*?)<\/concept>/g;
  const out: Concept[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const inner = m[1];
    const hookAngle = extractTag(inner, "hookAngle");
    const mechanic = extractTag(inner, "mechanic");
    const visualStyle = extractTag(inner, "visualStyle");
    const copyLength = extractTag(inner, "copyLength");
    const description = extractTag(inner, "description");
    if (!hookAngle || !mechanic || !visualStyle || !copyLength || !description) continue;
    out.push({
      hookAngle,
      mechanic,
      visualStyle: visualStyle === "photo" ? "photo" : "typography",
      copyLength:
        copyLength === "long" ? "long" : copyLength === "medium" ? "medium" : "short",
      description,
    });
  }
  return out;
}

// ─── Phase 2: Execution pro Konzept ──────────────────────────────────

async function generateOneCreative(
  brief: CreativeBrief,
  concept: Concept,
): Promise<CreativeVariant> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";
  const photoLine =
    concept.visualStyle === "photo"
      ? `FOTO-PFLICHT: Dieses Creative MUSS GENAU EIN {{UNSPLASH:englische keywords}}-Element enthalten, entweder als <img src="{{UNSPLASH:…}}"> ODER als background-image: url({{UNSPLASH:…}}). Wenn du keinen Platzhalter im HTML hast, ist das Creative ungültig. Die Foto-Komposition soll der Mechanic entsprechen (full-bleed bei Photo-Big-Headline / Lifestyle-Background, neben Headline bei Brand-Photo-Hero, etc.).`
      : `Dieses Creative ist typografisch — KEIN Foto, kein {{UNSPLASH}}-Platzhalter.`;
  const lengthRange =
    concept.copyLength === "long"
      ? "400-800 Zeichen, AIDA-Story-Struktur, mehrere Absätze"
      : concept.copyLength === "medium"
        ? "150-300 Zeichen, 2-3 Sätze, Problem → Lösung → Soft-CTA"
        : "60-120 Zeichen, ein Satz, Hook + Soft-CTA";

  const userPrompt = `Setze dieses ${brief.campaignKey}-Kampagnen-Konzept als einzelnes Meta-Ad-Creative um.

${campaignContext}

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

KONZEPT:
- Hook-Angle: ${concept.hookAngle}
- Mechanic: ${concept.mechanic}
- Visual-Style: ${concept.visualStyle}
- Copy-Length für adText: ${concept.copyLength} (${lengthRange})
- Konzept-Skizze: ${concept.description}

${photoLine}

Antworte mit GENAU EINEM <variant>-Block im definierten Format. Kein Brainstorm, keine Alternativen.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 8000,
      system: CREATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude Execution ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const variants = parseVariantBlocks(text);
  if (variants.length === 0) {
    throw new Error(
      `Execution für Konzept "${concept.mechanic}" lieferte keinen <variant>: ${text.slice(0, 300)}…`,
    );
  }
  const result = variants[0];
  // Sanity-Check: bei Photo-Konzepten muss ein UNSPLASH-Platzhalter im HTML
  // sein, sonst war die ganze Foto-Anweisung umsonst.
  if (concept.visualStyle === "photo" && !result.html.includes("{{UNSPLASH:")) {
    console.warn(
      `[creative-gen] Photo-Konzept "${concept.mechanic}" lieferte HTML ohne {{UNSPLASH:}} — Claude hat die Foto-Pflicht ignoriert.`,
    );
  }
  return result;
}

// ─── Orchestrator: brainstorm → parallel execution ───────────────────

async function generateCreativeVariants(
  brief: CreativeBrief,
): Promise<CreativeVariant[]> {
  const concepts = await brainstormConcepts(brief);
  // Parallele Execution — keiner sieht die anderen Outputs, max. Diversität
  // im finalen HTML/Copy. Jeder Call ist auf sein Konzept eingelocht.
  return Promise.all(concepts.map((c) => generateOneCreative(brief, c)));
}

// Parst Claude's strukturierten XML-Output. Robust gegen umliegendes
// Geschwafel ("Hier sind 3 Creatives:"), Markdown-Fences und Whitespace.
// Greedy-Match auf <creative_html> ist absichtlich — die HTML-Bodies dürfen
// alle anderen Tags enthalten (inkl. <html>…</html>), nur <creative_html>
// selbst nicht.
function parseVariantBlocks(text: string): CreativeVariant[] {
  const variantRe = /<variant>([\s\S]*?)<\/variant>/g;
  const blocks: CreativeVariant[] = [];
  let match: RegExpExecArray | null;
  while ((match = variantRe.exec(text)) !== null) {
    const inner = match[1];
    const headline = extractTag(inner, "headline");
    const body = extractTag(inner, "body");
    const cta = extractTag(inner, "cta");
    const adText = extractTag(inner, "ad_text") ?? "";
    const html = extractTag(inner, "creative_html");
    if (!headline || !body || !cta || !html) continue;
    blocks.push({ headline, body, cta, adText, html });
  }
  return blocks;
}

function extractTag(source: string, tag: string): string | null {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = source.match(re);
  return m ? m[1].trim() : null;
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function generateCreatives(
  brief: CreativeBrief,
  requestId: string,
): Promise<GeneratedCreative[]> {
  const variants = await generateCreativeVariants(brief);

  // Parallel rendern + uploaden. Pro Variante: erst Unsplash-Platzhalter
  // gegen echte Foto-URLs auflösen, dann Playwright rendern.
  const results = await Promise.all(
    variants.map(async (v, i) => {
      const resolvedHtml = await resolveUnsplashPlaceholders(v.html);
      const buffer = await renderHtmlToImage(resolvedHtml, {
        width: 1080,
        height: 1080,
        format: "jpeg",
        quality: 92,
      });
      const key = `creatives/${requestId}/${i + 1}.jpg`;
      const imageUrl = await uploadImageToR2({
        buffer,
        key,
        contentType: "image/jpeg",
      });
      return {
        headline: v.headline,
        body: v.body,
        cta: v.cta,
        adText: v.adText,
        imagePrompt: v.html,
        imageUrl,
      } satisfies GeneratedCreative;
    }),
  );

  return results;
}

// ─── Intent Parsing aus Telegram-Text ────────────────────────────────

export type ParsedIntent = {
  action: "generate" | "unknown";
  count: number;
  campaignKey: string | null; // "Wechsel" | "Neugeschäft" | null = unklar
  audience?: string;
  tone?: string;
};

export async function parseIntent(text: string): Promise<ParsedIntent> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      system: `Du parsed deutsche Befehle für einen Creative-Generation-Bot.
Erkennbare Kampagnen: "Wechsel", "Neugeschäft".
Antworte mit strict JSON: {"action": "generate"|"unknown", "count": number, "campaignKey": "Wechsel"|"Neugeschäft"|null, "audience"?: string, "tone"?: string}`,
      messages: [{ role: "user", content: text }],
    }),
  });

  if (!res.ok) {
    return { action: "unknown", count: 0, campaignKey: null };
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const raw = data.content.find((c) => c.type === "text")?.text ?? "";
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  try {
    return JSON.parse(cleaned) as ParsedIntent;
  } catch {
    return { action: "unknown", count: 0, campaignKey: null };
  }
}
