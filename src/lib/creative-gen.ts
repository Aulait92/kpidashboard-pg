import { uploadImageToR2 } from "@/lib/r2";
import { renderHtmlToImage } from "@/lib/html-to-png";
import {
  resolveComicPlaceholders,
  resolvePhotoPlaceholders,
} from "@/lib/openai-image";

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
  fbHeadline: string; // Facebook Headline unter dem Bild (max ~40 Zeichen, snappy)
  mechanic: string; // Konzept-Mechanic (UGC-Whiteboard, Comic-Illustration, Big-Number, …)
  imagePrompt: string; // bei HTML-Pipeline: das volle HTML (Debug/Replay)
  imageUrl: string; // public URL nach R2-Upload
};

// ─── Claude Creative-Generation (HTML) ───────────────────────────────

type CreativeVariant = {
  headline: string;
  body: string;
  cta: string;
  adText: string;
  fbHeadline: string;
  html: string;
  mechanic: string;
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

═══ PKV-ANCHOR (PFLICHT, PROMINENT — sonst wird's geclickt aber falsch verstanden) ═══
Jedes Creative MUSS in <1 Sekunde signalisieren, dass es um PKV (Private
Krankenversicherung) geht. Das Wort "PKV" oder "Krankenversicherung"
darf NIE nur in kleinem Body-Text versteckt sein.

GRÖßEN-PFLICHT für den PKV-Anchor:
- Das Wort "PKV" (Großbuchstaben) oder "Krankenversicherung" MUSS in
  einem visuell prominenten Element stehen: entweder in der Headline
  (>=60pt) oder in einer eigenen Anchor-Zeile (>=40pt), gut lesbar.
- KEIN PKV-Anchor im Body-Text <30pt — der ist auf dem Smartphone-Feed
  unleserlich.
- "PKV" IMMER in Großbuchstaben schreiben (nicht "Pkv" oder "pkv").
- Bei Big-Number-Creatives: direkt unter/über der Zahl die Anchor-Zeile,
  z.B. "Dein PKV-BEITRAG" oder "PKV-Tarif heute" (>=50pt).
- Bei Photo-Big-Headline: PKV im Headline-Text selbst (Hero-Größe), nicht
  nur im CTA-Button.
- Bei Mockup-Mechaniken: das Subject im Mockup ist sichtbar PKV-bezogen
  (Browser-URL enthält "/pkv", Brief-Header "Ihre PKV-Versicherung", Konto-
  Vergleich-Card-Title "PKV-Beitrag: heute vs. nach Wechsel" — alles in
  groß lesbarer Schrift).

PRÜF-CHECK vor finalem HTML:
1. Steht "PKV" oder "Krankenversicherung" prominent (>=40pt) sichtbar?
2. Wäre die Vertical für jemanden im Feed-Scroll in <1s klar?
3. Wenn ich nur den ersten visuellen Eindruck habe (ohne Body zu lesen),
   weiß ich dass es um PKV geht?
Wenn 1 Nein → vergrößern. Wenn 2/3 Nein → PKV-Anchor an prominenter
Stelle nachziehen.

NIE NUR: "−38%" + "Jetzt prüfen" → könnte alles bedeuten.
IMMER: große Zahl + große Anchor-Zeile "Dein PKV-BEITRAG" + CTA.

Im AdText (Facebook-Primary-Text) muss "PKV" oder "private Krankenversicherung"
ebenfalls in den ersten 80 Zeichen vorkommen — sonst scrollt der User weiter.

═══ FB-HEADLINE (Facebook Headline unter dem Bild, NICHT im Creative) ═══
Zusätzlich zum visuellen Hero im Creative-Bild und zum adText (Primary-Text
darüber) braucht jede Variante eine Facebook-Headline für das Feld direkt
unter dem Bild — sichtbar im Feed neben dem CTA-Button.

- Max 40 Zeichen (Facebook truncated länger)
- Snappy, konkret, ein Versprechen oder eine Frage
- KEINE Wiederholung der visuellen Headline aus dem Bild — sie ergänzt
- Beispiele:
  - Bild-Headline: "STOPP." → fb_headline: "PKV-Beitrag halbieren — in 2 Min."
  - Bild-Headline: "−38%" → fb_headline: "Dein PKV-Beitrag, neu gerechnet"
  - Bild-Headline: "Anbieter bleibt. Tarif wechselt." → fb_headline: "Bis 50% PKV-Beitrag sparen"

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
10. COMIC-ILLUSTRATION — AI-generierte Comic-Bild via {{COMIC:keywords}} als zentrales visuelles Element (50-80% der Fläche), oben oder daneben eine kurze Headline, dezenter CTA unten. Playful, designed, abstrakt-konzeptuell. Beispiel: Comic einer überraschten Person mit Geldscheinen die wegfliegen, Headline „824€/Monat — und keiner spricht drüber?".

═══ NATIVE-UGC-FAMILIE (sehr wichtig — wirkt wie iPhone-Screenshot, NICHT wie Ad) ═══
Diese Mechaniken sollen aussehen wie organischer User-Content auf TikTok/
Instagram-Reels: kein Logo, kein "ANZEIGE"-Label sichtbar oben (nur subtil),
keine Designer-Typo, keine Farb-Akzente. Foto sieht selbst-gemacht aus,
einziges grafisches Element ist die signature **CAPTION-BOX** unten.

CAPTION-BOX (das visuelle Wiedererkennungsmerkmal aller UGC-Creatives):
- Schwarzer rounded-rectangle, position: absolute, bottom: ~30-60px, links/rechts ~30-50px Abstand
- Padding ~24-32px horizontal, ~20-26px vertikal, border-radius: 14-20px
- Weißer Text in Inter / -apple-system, font-weight: 900, font-size: 48-64pt (variabel je Textlänge)
- line-height: 1.15, letter-spacing: -0.01em
- Text MAX 2-3 Zeilen, anti-aliased white auf solid black
- Beispiel-Texte aus echten UGC-Ads:
  „Der größte Fehler beim Wechsel in die PKV."
  „Gleiche Leistung, gleicher Anbieter. Aber 240€ weniger."
  „Wenn dein Beitrag unter 700€ liegt, wisch weiter."

UGC-MECHANIKEN:

11. UGC-WHITEBOARD — Full-bleed-Foto eines Whiteboards (Unsplash: "whiteboard office empty" o. ä.). Optional: handgeschriebene PKV-Aussage als CSS-Overlay über der Whiteboard-Fläche mit Caveat- oder Permanent-Marker-Font (size ~80-110pt, color: #1a1a1a oder echtes Marker-Schwarz). Wenn die Whiteboard-Schrift nicht direkt zum Hook passt, einfach das leere Whiteboard zeigen — die Caption-Box trägt die Botschaft. Bei Bedarf ein angedeuteter Hand-mit-Marker als zweites Unsplash-Asset.

12. UGC-DESK-DOCUMENTS — Full-bleed-Foto eines Schreibtischs mit Papieren / Briefen / Rechnungen (Unsplash: "desk documents paper" / "letters table"). Caption-Box unten. Optional: kleines farbiges Marker-Highlight (CSS-Streifen) über einem Wort/einer Zahl im Brief, simuliert Marker-Hervorhebung — Pink/Gelb/Grün, 60% opacity, leicht schief gedreht (rotate: -2deg).

13. UGC-SELFIE-NOTE — Selfie-Foto eines normalen Menschen 30-50J (Unsplash: "selfie casual man home", "woman selfie phone"). Optional: über das Foto ein angedeutetes Notizpapier-Element mit handgeschriebener PKV-Frage. Caption-Box unten. Wirkt wie Creator-Reel.

14. UGC-PHONE-SCREENSHOT — Sieht aus wie iPhone-Screenshot, dunkler oder heller Background (background-color, kein Foto nötig), Status-Bar oben (Caveat-Text "21:47", Mini-Antennen-SVG, Battery-SVG), Notification oder Card-UI in der Mitte. Caption-Box unten. Funktioniert ähnlich wie WhatsApp-Chat-Mockup aber ohne Foto.

15. UGC-CLOSE-UP-PERSON — Halbportrait einer Person (Unsplash: "man portrait honest", "woman thinking close-up"), KEINE designed-Elemente, einziges Overlay ist die Caption-Box unten. Pain-Story-Geeignet.

WANN UGC, WANN POLISHED PHOTO?
- UGC bei Trust/Curiosity-Hooks ("Der größte Fehler...", "Wenn dein Beitrag...")
- UGC bei Story-Mode (selber Mann, eigenes Erlebnis, Authentizität wichtig)
- Polished Photo wenn Brand-Vertrauen wichtig (Newspaper-Mockup, Brand-Photo-Hero)

VERBOTEN bei UGC:
- KEIN designed Gradient, KEIN Backdrop-Blur, KEIN Drop-Shadow auf Texten
- KEIN farbiges Brand-CTA-Button — der CTA ist Teil der Caption-Box oder gar nicht sichtbar (Facebook macht den CTA-Button selbst)
- KEINE Custom-Typo außerhalb der Caption-Box
- KEIN "ANZEIGE"-Label groß oben — nur sehr klein und unauffällig oder weglassen

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

═══ BILDMATERIAL ZWEI WEGE — Unsplash (Foto) ODER Comic (AI) ═══

Du hast zwei verschiedene Bild-Quellen je nach Stil-Ziel:

(A) ECHTE FOTOS via {{UNSPLASH:keywords}} — für native, emotionale,
    realistische Szenen (Küche, Café, Büro, Mensch).

(B) COMIC-ILLUSTRATIONEN via {{COMIC:keywords}} — für playful, klar
    abstrahierte, designed wirkende Konzepte (Charakter mit Schock-
    Gesicht, abstrakte Metapher, Erklär-Illustration, Stilisierte Szene).
    Wird AI-generiert mit Comic-Buch-Stil (flache Farben, bold outlines).

WANN COMIC:
- Wenn die Mechanic playful ist (z.B. „Aha-Moment"-Illustration)
- Wenn ein abstraktes Konzept visualisiert werden soll (Geld fließt weg,
  Erleuchtung, Verzweiflung)
- Wenn ein Foto zu generisch/stock wirken würde
- Für Comic-Strip-Style Single-Panel-Creatives

WANN FOTO:
- Pain-Point-Storys mit echten Menschen-Emotionen
- Authentische Lifestyle-Szenen
- Brand-Photo Hero
- Newspaper-Mockup

═══ UNSPLASH-FOTOS — {{UNSPLASH:keywords}} ═══
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

═══ COMIC-ILLUSTRATIONEN — {{COMIC:keywords}} ═══
Pattern wie Unsplash, gleiche Verwendung als img-src oder background-image:

  <img src="{{COMIC:woman shocked looking at bill, modern flat illustration}}">
  background-image: url({{COMIC:man with money flying away}});

QUERY-REGELN:
- 3-6 englische Beschreibungs-Wörter, KEINE Style-Modifier (die hängt der Server an)
- Visuelles Konzept beschreiben: Subjekt + Situation/Emotion
- NIEMALS Elemente beschreiben, die TEXT enthalten würden — Flux rendert
  Buchstaben unzuverlässig (oft Buchstabensalat). Also KEINE Schilder,
  KEINE Sprechblasen mit Inhalt, KEINE Geldscheine mit Aufdrucken, KEINE
  beschrifteten Briefe, KEINE Computer-Screens mit Text, KEINE Banner,
  KEINE Logos. Sämtlicher Text gehört IN DAS HTML drumherum (Headline,
  Sub-Headline, Caption-Box), NICHT in das AI-generierte Bild.
- ✅ GUT: "woman shocked at desk", "man celebrating raised arms", "head with lightbulb"
- ✅ GUT: "wallet with euros flying away" (Euros okay, kein Aufdruck nötig)
- ✅ GUT: "two people comparing two papers" (Papiere okay solang nicht beschrieben)
- ❌ SCHLECHT: "woman holding sign that says PKV" — Schilder mit Text
- ❌ SCHLECHT: "calendar showing date" — Datum würde rendern
- ❌ SCHLECHT: "letter from insurer with €850 amount" — Brief mit Text
- ❌ SCHLECHT: "comic illustration in flat style of …" — Style wird automatisch angehängt
- ❌ SCHLECHT: nur ein Wort wie "shock" — zu wenig Info für Bild-Generation

ASPECT-RATIO: immer quadratisch (1:1), für 1080×1080 Canvas.

KOMPOSITION im HTML:
- Comic-Bilder funktionieren gut als HERO mit Headline drüber oder daneben
- Background: helles, neutrales (Cream / Soft-Yellow) damit der Comic
  pops, NICHT mit dunklem Foto-Overlay arbeiten (das ist für Fotos)
- Padding um den Comic ist okay — Comic-Bilder haben oft selbst Whitespace
- KEINE Text-Overlay-Boxes ÜBER dem Comic-Bild (verdeckt die Illustration)

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
<headline>Visuelle Hero-Zeile im Creative-Bild (max 6 Wörter)</headline>
<body>Sub-Headline im Creative-Bild (max 90 Zeichen)</body>
<cta>CTA-Button-Text im Creative-Bild (max 18 Zeichen)</cta>
<fb_headline>Facebook-Headline unter dem Bild (max 40 Zeichen, snappy)</fb_headline>
<ad_text>
Facebook-Primary-Text über dem Bild (short / medium / long — variiere über die Varianten).
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

  Neugeschäft: `═══ KAMPAGNEN-KONTEXT: NEUGESCHÄFT ═══
ZIELGRUPPE:
- Aktuell GESETZLICH versichert (GKV), NICHT PKV
- Einkommen ÜBER der Jahresarbeitsentgeltgrenze (JAEG, 2026: ~73.800€/Jahr) — ODER selbstständig, ODER Beamter
- Zahlen oft den GKV-Höchstbeitrag (2026: ~1.000€/Monat inkl. Pflege)
- Genervt von: steigenden GKV-Beiträgen, vollen Wartezimmern, langen Terminen, Mehrbett-Zimmer im Krankenhaus, keinem Chefarzt

PAIN-POINTS:
- "Ich zahle 1.261€ GKV-Höchstbeitrag, bekomme aber die gleichen Leistungen wie ein 22-jähriger Azubi"
- "Termin beim Facharzt: 3 Monate Wartezeit. Privatpatienten: nächste Woche."
- "Ich verdiene gut, könnte längst raus aus der GKV — aber niemand erklärt mir die PKV-Optionen"
- "Subventioniere ich gerade die GKV-Solidargemeinschaft auf meine Kosten?"

KEY-INSIGHT (das ist der eigentliche Hook):
Wer ÜBER der JAEG verdient (oder selbstständig/Beamter ist), kann die GKV
verlassen und in die PKV wechseln. Bei jungen, gesunden Verdienern oft
deutlich GÜNSTIGER als der GKV-Höchstbeitrag — bei DEUTLICH besseren
Leistungen (Chefarzt, Einzelzimmer, kürzere Wartezeiten, freie Arztwahl).

PROMISE (mit echten Zahlen arbeiten):
- GKV-Höchstbeitrag 2026: ~1.261€/Monat (inkl. Pflegeversicherung, exakt 1.261,31€)
- PKV bei 35-jährigem Angestellten/Selbstständigem: oft 380-550€/Monat
- Spar-Größenordnung: 700-880€/Monat = 8.400-10.560€/Jahr
- Plus: deutlich bessere Leistungen
- Steuerlich: PKV-Beiträge sind als Vorsorgeaufwendungen absetzbar

USPs (das macht das Angebot stark):
- Chefarzt-Behandlung als Standard
- Einzel- oder Zweibettzimmer im Krankenhaus
- Termine in Tagen statt Wochen (Privatpatient-Privileg)
- Freie Arzt- und Klinikwahl
- Heilpraktiker, Osteopathie, alternative Medizin meist mit drin
- Beitrag richtet sich nach Gesundheit + Alter, NICHT nach Einkommen (bei jung+gesund = sehr günstig)

VORAUSSETZUNGEN nennen:
- Einkommen über JAEG (2026: 73.800€) ODER selbstständig ODER Beamter ODER Student
- Gesundheitsprüfung erforderlich (kein Hindernis bei normaler Gesundheit)

VERMEIDE bei Neugeschäft:
- "Tarifwechsel" / "interner Wechsel" → das ist WECHSEL-Kampagne, nicht Neugeschäft
- "Anbieter bleibt" → falsches Mental Model (User ist noch GAR NICHT in PKV)
- "Bis zu 50% Ersparnis" → das ist Wechsel-Promise. Hier: konkrete €-Zahl statt Prozent
- "Kostenlos prüfen" / "Spitzentarif"
- Ziel-Vermischung: nicht alle GKV-Versicherten ansprechen, nur die über JAEG / SE / Beamte

PASSENDE HOOKS (Beispiele zum Inspirieren, NICHT 1:1 kopieren):
- "GKV-Höchstbeitrag: 1.261€. PKV mit 35: 412€."
- "Verdienst du über 73.800€? Du musst NICHT in der GKV bleiben."
- "1.261€/Monat GKV — und du wartest 3 Monate auf den Termin?"
- "Selbstständig? Dann zahlst du GKV freiwillig. Nicht clever."
- "Privatpatient sein kostet weniger als du denkst — wenn du richtig wählst."
- "73.800€+ und immer noch gesetzlich? Du subventionierst 22-jährige Azubis."

PASSENDE FOTO-MOTIVE (für photo-Mechaniken):
- {{UNSPLASH:young businessman laptop}}
- {{UNSPLASH:woman office laptop}}
- {{UNSPLASH:freelancer home office}}
- {{UNSPLASH:doctor waiting room}}
- {{UNSPLASH:hospital waiting}}
- {{UNSPLASH:man home thinking}}`,

  Kinderwunsch: `═══ KAMPAGNEN-KONTEXT: KINDERWUNSCH ═══
WICHTIG: Das ist KEINE Versicherung und KEIN PKV/GKV-Thema. Ignoriere
sämtliche PKV-, Beitrags-, Tarifwechsel- und Versicherungs-Frames vollständig.
Es geht ausschließlich um die Förderung von Kinderwunsch-Behandlungen (z. B. IVF).

ZIELGRUPPE:
- Paare mit Kinderwunsch, ca. 28–42 Jahre
- Emotional belastet vom unerfüllten Kinderwunsch, oft schon mit ersten
  Recherchen/Behandlungs-Gedanken; Sorge vor den hohen Kosten einer Behandlung

ANGEBOT / KERNBOTSCHAFT:
- Kinderwunsch-Behandlungen müssen nicht immer komplett selbst bezahlt werden.
- Je nach Wohnort, Krankenkasse und persönlicher Situation können hohe
  Zuschüsse möglich sein – in manchen Fällen sogar bis zu 100 %.
- CTA-Idee: unverbindlich prüfen, welche Fördermöglichkeiten infrage kommen
  könnten.

TONALITÄT:
- Emotional, warm, ermutigend. Du-Ansprache.
- Hoffnung geben, ohne Druck. Sensibel mit einem schmerzhaften Thema umgehen.

PROMISE (IMMER im Konjunktiv / als Möglichkeit – NIE als Garantie):
- "können", "könnten", "möglich", "je nach Situation" — niemals "Sie bekommen",
  "garantiert", "100 % sicher".
- "Bis zu 100 % Zuschuss möglich" ist ok; "100 % Zuschuss" (als Zusage) NICHT.

VERMEIDE unbedingt:
- Heils-/Erfolgsversprechen ("Sie werden schwanger", Erfolgsquoten, medizinische
  Versprechen) — rechtlich tabu und ethisch unpassend.
- Garantierte Förderzusagen oder konkrete Euro-Beträge als Zusage.
- Jegliches PKV/GKV-Spar-/Versicherungs-Framing.
- Reißerische, kalte oder zu "verkäuferische" Tonalität bei diesem sensiblen Thema.

PASSENDE HOOKS (Beispiele zum Inspirieren, NICHT 1:1 kopieren):
- "Kinderwunsch-Behandlung – muss nicht immer komplett selbst bezahlt werden."
- "Bis zu 100 % Zuschuss zur Kinderwunsch-Behandlung könnten möglich sein."
- "Bevor ihr die Behandlung selbst zahlt: prüft eure Fördermöglichkeiten."
- "Euer Wohnort + eure Krankenkasse entscheiden mit, wie viel ihr selbst zahlt."

PASSENDE FOTO-MOTIVE (warm, hoffnungsvoll, keine Klinik-Kälte):
- {{UNSPLASH:happy couple home hug}}
- {{UNSPLASH:couple holding hands hopeful}}
- {{UNSPLASH:woman smiling window light}}
- {{UNSPLASH:young couple kitchen morning}}`,
};

// ─── Phase 1: Konzept-Brainstorm ─────────────────────────────────────
// Bevor wir HTML rendern, lässt Claude in einem Call N distinkte Konzepte
// brainstormen. Das zwingt zur Diversität (alle Konzepte sind im selben
// Output sichtbar) und verhindert die Konvergenz-Pattern, die bei einem
// einzigen Multi-Variante-Call entstehen.

type Concept = {
  hookAngle: string;       // Pain | Curiosity | Promise | Story | Outrage | Insight
  mechanic: string;        // Big-Number | STOPP | Highlighter | Konto-Mockup | Reddit-Native | ...
  visualStyle: "photo" | "ugc" | "typography" | "comic";
  copyLength: "short" | "medium" | "long"; // betrifft adText-Länge
  description: string;     // 1-2 Sätze konkrete Konzept-Skizze
};

async function brainstormConcepts(brief: CreativeBrief): Promise<Concept[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";

  // Pro Slot expliziter visualStyle. VIER Buckets:
  //   photo       = polished Stock-Foto (Brand-Photo-Hero etc, Unsplash)
  //   ugc         = native-Look Foto + signature schwarze Caption-Box (UGC-*)
  //   comic       = AI-generierte Illustration (Replicate Flux)
  //   typography  = rein textbasiert, kein Bild
  // Verteilung N>=4: ~20% photo, ~30% ugc, ~20% comic, ~30% typography
  // (UGC stärker gewichtet — performt aktuell am besten auf Meta).
  type Style = "photo" | "ugc" | "comic" | "typography";
  const slotStyles: Style[] = (() => {
    if (brief.count === 1) {
      const r = Math.random();
      if (r < 0.3) return ["ugc"];
      if (r < 0.5) return ["photo"];
      if (r < 0.7) return ["comic"];
      return ["typography"];
    }
    if (brief.count === 2) {
      return ["ugc", Math.random() < 0.5 ? "comic" : "typography"];
    }
    if (brief.count === 3) {
      return ["ugc", "comic", "typography"];
    }
    const n = brief.count;
    const ugcCount = Math.max(1, Math.round(n * 0.3));
    const photoCount = Math.max(1, Math.round(n * 0.2));
    const comicCount = Math.max(1, Math.round(n * 0.2));
    const typoCount = Math.max(0, n - ugcCount - photoCount - comicCount);
    const styles: Style[] = [
      ...Array(ugcCount).fill("ugc"),
      ...Array(photoCount).fill("photo"),
      ...Array(comicCount).fill("comic"),
      ...Array(typoCount).fill("typography"),
    ];
    for (let i = styles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [styles[i], styles[j]] = [styles[j], styles[i]];
    }
    return styles.slice(0, n);
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

Für "photo"-Slots: wähle eine polierte foto-getragene Mechanic (Brand-Photo-Hero, Person-Quote, Lifestyle-Background, Newspaper-Mockup, Photo-Big-Headline). Das Konzept MUSS ein {{UNSPLASH:…}}-Foto nutzen.
Für "ugc"-Slots: wähle EINE UGC-Mechanic (UGC-Whiteboard, UGC-Desk-Documents, UGC-Selfie-Note, UGC-Phone-Screenshot, UGC-Close-Up-Person). Das Konzept MUSS ein {{UNSPLASH:…}}-Foto nutzen UND die signature schwarze Caption-Box unten haben. Wirkt wie iPhone-Screenshot, nicht wie Designer-Ad.
Für "comic"-Slots: wähle eine Comic-Mechanic (Comic-Illustration, Comic-Big-Headline, Comic-Strip-Single-Panel). Das Konzept MUSS ein {{COMIC:…}}-Element nutzen (AI-generierte Illustration).
Für "typography"-Slots: wähle eine typografische Mechanic (Big-Number, STOPP-Interrupt, Highlighter-Hook, Konto-Mockup, 3-Fragen-Quiz, Google-Autocomplete, Reddit-Native, SMS/WhatsApp-Mockup, Rechnungs-Closeup, Brief-vom-Versicherer). KEIN Bild-Platzhalter.

PKV-ANCHOR (PFLICHT):
Jedes Konzept MUSS unmissverständlich PKV/Private-Krankenversicherung-Kontext setzen. Abstrakte Hooks wie nur "−38%" oder "STOPP." reichen NICHT — die Description muss klar machen wo "PKV", "PKV-Beitrag", "Krankenversicherung" oder "Tarif" sichtbar wird.

VERFÜGBARE MECHANIKEN:
- Photo-Mechaniken (echte Fotos via {{UNSPLASH:…}}): Brand-Photo-Hero / Person-Quote / Lifestyle-Background / Newspaper-Mockup / Photo-Big-Headline
- Native-UGC-Mechaniken (Foto + signature schwarze Caption-Box, wirkt wie iPhone-Screenshot): UGC-Whiteboard / UGC-Desk-Documents / UGC-Selfie-Note / UGC-Phone-Screenshot / UGC-Close-Up-Person
- Comic-Mechaniken (AI-generiert via {{COMIC:…}}): Comic-Illustration / Comic-Big-Headline / Comic-Strip-Single-Panel
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
      max_tokens: 4000,
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
      visualStyle:
        visualStyle === "photo"
          ? "photo"
          : visualStyle === "ugc"
            ? "ugc"
            : visualStyle === "comic"
              ? "comic"
              : "typography",
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
      ? `FOTO-PFLICHT: Dieses Creative MUSS GENAU EIN {{UNSPLASH:englische keywords}}-Element enthalten, entweder als <img src="{{UNSPLASH:…}}"> ODER als background-image: url({{UNSPLASH:…}}). Wenn du keinen Platzhalter im HTML hast, ist das Creative ungültig. Die Foto-Komposition soll der Mechanic entsprechen.`
      : concept.visualStyle === "ugc"
        ? `UGC-PFLICHT (alle drei Punkte MÜSSEN umgesetzt sein):
1. Full-bleed Foto-Background via {{UNSPLASH:englische keywords}} — Foto füllt das gesamte 1080×1080-Canvas, position:absolute oder background-image, kein weißer Rand außenrum.
2. Signature schwarze CAPTION-BOX unten (das Wiedererkennungsmerkmal aller UGC-Creatives) — exakt diese CSS-Eigenschaften:
   position: absolute; bottom: 30-60px; left: 30-50px; right: 30-50px;
   background: #000; color: #fff;
   font-family: 'Inter', -apple-system, sans-serif; font-weight: 900;
   font-size: 44-60px; line-height: 1.15;
   padding: 24-30px 32-38px; border-radius: 14-20px;
   text-align: left;
   Inhalt: 1-3 Zeilen, MUSS "PKV" oder "Krankenversicherung" enthalten.
3. Bei UGC-Whiteboard ZUSÄTZLICH: handgeschriebenes PKV-Statement als CSS-Overlay über dem Foto, font-family: 'Caveat' oder 'Permanent Marker' (Google Fonts), color: #1a1a1a, font-size: 80-120pt, position passend zur Whiteboard-Fläche im Foto, leicht rotiert (transform: rotate(-1deg bis -3deg)).
KEINE designed Gradients, KEINE Drop-Shadows auf Text, KEIN ANZEIGE-Label oben, KEIN CTA-Button (Facebook macht den selbst). Sieht aus wie iPhone-Screenshot, NICHT wie Designer-Ad.`
        : concept.visualStyle === "comic"
          ? `COMIC-PFLICHT: Dieses Creative MUSS GENAU EIN {{COMIC:englische beschreibung}}-Element enthalten (img-src oder background-image). Comic wird AI-generiert.
- Beschreibung 3-6 Wörter, KEINE Style-Modifier (Server hängt sie an)
- ABSOLUT KEINEN TEXT-INHALT im Comic: keine Schilder mit Text, keine Sprechblasen, keine beschrifteten Geldscheine/Briefe/Screens, keine Banner, keine Logos. Sämtlicher Text gehört in das HTML drumherum (Headline, Caption-Box).
- ✅ {{COMIC:woman shocked at desk}}, {{COMIC:man with empty wallet}}, {{COMIC:doctor pointing at patient}}
- ❌ {{COMIC:woman holding sign saying PKV}}, {{COMIC:letter with 850 euros}}, {{COMIC:phone screen showing app}}`
          : `Dieses Creative ist typografisch — KEIN Bild, kein {{UNSPLASH}}- oder {{COMIC}}-Platzhalter.`;
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
  // Sanity-Check pro visualStyle. Bei Verstoß: warnen, nicht crashen.
  if (concept.visualStyle === "photo" && !result.html.includes("{{UNSPLASH:")) {
    console.warn(
      `[creative-gen] Photo-Konzept "${concept.mechanic}" lieferte HTML ohne {{UNSPLASH:}} — Claude hat die Foto-Pflicht ignoriert.`,
    );
  }
  if (concept.visualStyle === "ugc") {
    if (!result.html.includes("{{UNSPLASH:")) {
      console.warn(
        `[creative-gen] UGC-Konzept "${concept.mechanic}" lieferte HTML ohne {{UNSPLASH:}} — Foto-Pflicht ignoriert.`,
      );
    }
    // Caption-Box: schwarzer Background + weißer Text + border-radius
    // Sehr toleranter Check (#000 / black / rgb(0,0,0)).
    const hasBlackBg =
      /background[^;]*(#000|black|rgb\(0\s*,\s*0\s*,\s*0\))/i.test(result.html);
    const hasWhiteText = /color[^;]*(#fff|white|rgb\(255\s*,\s*255\s*,\s*255\))/i.test(
      result.html,
    );
    if (!hasBlackBg || !hasWhiteText) {
      console.warn(
        `[creative-gen] UGC-Konzept "${concept.mechanic}" hat keine erkennbare schwarze Caption-Box (hasBlackBg=${hasBlackBg}, hasWhiteText=${hasWhiteText}).`,
      );
    }
  }
  if (concept.visualStyle === "comic" && !result.html.includes("{{COMIC:")) {
    console.warn(
      `[creative-gen] Comic-Konzept "${concept.mechanic}" lieferte HTML ohne {{COMIC:}} — Claude hat die Comic-Pflicht ignoriert.`,
    );
  }
  return { ...result, mechanic: concept.mechanic };
}

// ─── Orchestrator: brainstorm → parallel execution ───────────────────

async function generateCreativeVariants(
  brief: CreativeBrief,
): Promise<CreativeVariant[]> {
  const concepts = await brainstormConcepts(brief);
  if (concepts.length < brief.count) {
    console.warn(
      `[creative-gen] Brainstorm lieferte nur ${concepts.length}/${brief.count} Konzepte — fahre mit weniger fort.`,
    );
  }
  // Parallele Execution mit allSettled — wenn ein einzelner Call failt
  // (Claude-Rate-Limit, Parse-Fehler), verlieren wir nicht den ganzen Batch.
  const settled = await Promise.allSettled(
    concepts.map((c) => generateOneCreative(brief, c)),
  );
  const variants: CreativeVariant[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      variants.push(r.value);
    } else {
      console.warn(
        `[creative-gen] Execution für Konzept ${i + 1} (${concepts[i]?.mechanic}) failte:`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  });
  if (variants.length === 0) {
    throw new Error("Keine einzige Variante konnte generiert werden.");
  }
  return variants;
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
    const fbHeadline = extractTag(inner, "fb_headline") ?? "";
    const html = extractTag(inner, "creative_html");
    if (!headline || !body || !cta || !html) continue;
    blocks.push({ headline, body, cta, adText, fbHeadline, html, mechanic: "" });
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

  // Parallel rendern + uploaden mit allSettled — ein Playwright- oder
  // R2-Fehler in einer Variante soll nicht den ganzen Batch killen.
  const settled = await Promise.allSettled(
    variants.map(async (v, i) => {
      let resolvedHtml = await resolvePhotoPlaceholders(v.html);
      resolvedHtml = await resolveComicPlaceholders(resolvedHtml);
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
        fbHeadline: v.fbHeadline,
        mechanic: v.mechanic,
        imagePrompt: v.html,
        imageUrl,
      } satisfies GeneratedCreative;
    }),
  );
  const results: GeneratedCreative[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      console.warn(
        `[creative-gen] Render/Upload für Variante ${i + 1} failte:`,
        r.reason instanceof Error ? r.reason.message : r.reason,
      );
    }
  });

  return results;
}

// ─── Einzelfeld-Regeneration (nur adText oder nur fbHeadline) ────────
// Werden vom Telegram-Bot getriggert wenn der User das Creative behalten,
// aber Text oder Headline anders haben will. Kein neuer Bild-Render nötig.

type RegenContext = {
  campaignKey: string;
  audience?: string;
  tone?: string;
  headline: string;     // visuelle Headline aus dem Creative-Bild (Kontext)
  body: string;         // visuelle Sub-Headline (Kontext)
  cta: string;          // Button-Text (Kontext)
  currentAdText?: string;
  currentFbHeadline?: string;
};

async function callClaudeSingleText(opts: {
  system: string;
  user: string;
  maxTokens: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: opts.maxTokens,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  return data.content.find((c) => c.type === "text")?.text ?? "";
}

export async function regenerateAdText(ctx: RegenContext): Promise<string> {
  const campaignContext = CAMPAIGN_CONTEXT[ctx.campaignKey] ?? "";
  const text = await callClaudeSingleText({
    system: `Du schreibst Facebook-Primary-Texte für deutsche PKV-Lead-Gen-Ads. Native-Feeling, Du-Form, keine Marketing-Klischees, erste 80 Zeichen müssen hooken und PKV-Bezug klarmachen. Antworte NUR mit dem reinen Text, KEINE Anführungszeichen, KEIN Drumherum.`,
    user: `${campaignContext}

${ctx.audience ? `ZIELGRUPPE: ${ctx.audience}` : ""}
${ctx.tone ? `TONE: ${ctx.tone}` : ""}

Das Creative-Bild zeigt:
- Headline: "${ctx.headline}"
- Sub-Headline: "${ctx.body}"
- CTA: "${ctx.cta}"
${ctx.currentAdText ? `\nAktueller Facebook-Text (mir gefällt's nicht, generiere etwas KOMPLETT anderes — anderer Hook-Angle, andere Länge):\n"""\n${ctx.currentAdText}\n"""` : ""}

Schreibe einen NEUEN Facebook-Primary-Text. Wähle bewusst eine andere Länge/Stil als ${ctx.currentAdText ? "der aktuelle" : "default"}: zwischen 60 (Snappy-Hook) und 800 Zeichen (Long-Form-Story).`,
    maxTokens: 1500,
  });
  return text.trim().replace(/^["„'`]+|["„'`]+$/g, "");
}

export async function regenerateFbHeadline(ctx: RegenContext): Promise<string> {
  const campaignContext = CAMPAIGN_CONTEXT[ctx.campaignKey] ?? "";
  const text = await callClaudeSingleText({
    system: `Du schreibst Facebook-Ad-Headlines (das Feld unter dem Bild im Feed, neben dem CTA-Button). Max 40 Zeichen. Snappy, konkret, ergänzt die visuelle Hero-Headline im Bild (wiederholt sie NICHT). Antworte NUR mit der Headline, KEINE Anführungszeichen, KEIN Drumherum.`,
    user: `${campaignContext}

Das Creative-Bild zeigt:
- Visuelle Hero-Headline: "${ctx.headline}"
- Sub-Headline: "${ctx.body}"
- CTA: "${ctx.cta}"
${ctx.currentFbHeadline ? `\nAktuelle Facebook-Headline (mir gefällt's nicht, generiere etwas KOMPLETT anderes):\n"${ctx.currentFbHeadline}"` : ""}

Schreibe eine NEUE Facebook-Headline (max 40 Zeichen). Ergänzt die visuelle Headline, wiederholt sie nicht.`,
    maxTokens: 200,
  });
  return text.trim().replace(/^["„'`]+|["„'`]+$/g, "").slice(0, 60);
}

// ─── Replacement: eine neue Variante, die andere Mechanic/Hook nutzt ───
// Wird vom Reject-Button getriggert. avoidHeadlines sind die Headlines
// der bereits vorhandenen (oder gerade abgelehnten) Varianten — Claude
// soll bewusst etwas anderes liefern.

// Behält Headline/Body/CTA/Texte UND die ursprüngliche Mechanic — designt
// nur die konkrete Komposition (Foto/Layout/Farben) neu. Wenn der User
// nochmal auf "Bild neu" klickt, kommt eine neue Variation der GLEICHEN
// Mechanic, kein Format-Wechsel.
export async function regenerateCreativeImage(
  brief: CreativeBrief,
  requestId: string,
  fixed: {
    headline: string;
    body: string;
    cta: string;
    mechanic?: string;
    currentImagePrompt?: string;
  },
): Promise<{ imageUrl: string; imagePrompt: string }> {
  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");

  // Visual-Style aus der Mechanic ableiten — Bild-Regen behält das Format,
  // generiert nur eine andere Komposition innerhalb dieser Mechanic.
  const mechanic = fixed.mechanic ?? "";
  const visualStyle: "photo" | "ugc" | "comic" | "typography" = /^UGC-/i.test(
    mechanic,
  )
    ? "ugc"
    : /^Comic-/i.test(mechanic)
      ? "comic"
      : /^(Brand-Photo|Person-Quote|Lifestyle-Background|Newspaper-Mockup|Photo-Big-Headline)/i.test(
            mechanic,
          )
        ? "photo"
        : mechanic
          ? "typography"
          : // Fallback wenn alte Variante ohne mechanic: 50/50 photo|typo
            Math.random() < 0.5
            ? "photo"
            : "typography";

  const styleHint =
    visualStyle === "ugc"
      ? `Visual-Style: UGC (native iPhone-Screenshot-Look). MUSS enthalten: {{UNSPLASH:keywords}}-Foto full-bleed + signature schwarze Caption-Box unten (background:#000, color:#fff, font-weight:900, border-radius). Bei UGC-Whiteboard zusätzlich Caveat/Permanent-Marker-Handwriting-Overlay.`
      : visualStyle === "comic"
        ? `Visual-Style: Comic. MUSS enthalten: {{COMIC:englische beschreibung}}-Element als zentrale Illustration.`
        : visualStyle === "photo"
          ? `Visual-Style: polished Photo. MUSS enthalten: {{UNSPLASH:keywords}}-Foto.`
          : `Visual-Style: typografisch. KEIN Bild-Platzhalter.`;

  const userPrompt = `Designe ein NEUES Creative-Bild für eine bestehende ${brief.campaignKey}-Meta-Ad. Die TEXTE bleiben unverändert UND das Format/die Mechanic bleibt dieselbe — du gestaltest nur die konkrete Komposition (Foto-Motiv, Layout, Farben) neu.

${campaignContext}

${brief.audience ? `ZIELGRUPPE: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

FIXIERTE TEXTE (musst du genau so verwenden):
- Headline im Creative: "${fixed.headline}"
- Body im Creative: "${fixed.body}"
- CTA-Button: "${fixed.cta}"

${mechanic ? `MECHANIC (bleibt fix): ${mechanic}` : ""}
${styleHint}

WAS DU VARIIEREN SOLLST:
- Bei photo/UGC: anderes Foto-Motiv (andere {{UNSPLASH:keywords}})
- Bei comic: andere Comic-Beschreibung (anderes {{COMIC:...}})
- Bei allen: anderes Farb-Schema, andere Komposition (z.B. Headline links statt rechts, anderer Hintergrund-Ton), aber GLEICHE Mechanic

WAS NICHT ÄNDERN:
- Texte (Headline/Body/CTA wörtlich gleich)
- Mechanic / Format
- PKV-Anchor MUSS prominent bleiben

Antworte mit GENAU EINEM <creative_html>-Block, KEINE anderen Tags:

<creative_html>
<!DOCTYPE html>
<html lang="de">
…
</html>
</creative_html>`;

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
    throw new Error(`Image-Regen ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { content: { type: string; text: string }[] };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  const html = extractTag(text, "creative_html");
  if (!html) {
    throw new Error(`Image-Regen lieferte kein <creative_html>: ${text.slice(0, 300)}`);
  }

  // Render + Upload — gleicher Pipeline-Teil wie generateCreatives.
  let resolvedHtml = await resolvePhotoPlaceholders(html);
  resolvedHtml = await resolveComicPlaceholders(resolvedHtml);
  const buffer = await renderHtmlToImage(resolvedHtml, {
    width: 1080,
    height: 1080,
    format: "jpeg",
    quality: 92,
  });
  const key = `creatives/${requestId}/regen-${Date.now()}.jpg`;
  const imageUrl = await uploadImageToR2({
    buffer,
    key,
    contentType: "image/jpeg",
  });
  return { imageUrl, imagePrompt: html };
}

// ─── Intent Parsing aus Telegram-Text ────────────────────────────────

export type ParsedIntent = {
  action: "generate" | "unknown";
  count: number;
  campaignKey: string | null; // "Wechsel" | "Neugeschäft" | "Kinderwunsch" | null = unklar
  // Region nur bei Kinderwunsch relevant (z. B. "Berlin") — bestimmt, in
  // welche Regions-Kampagne ein freigegebenes Creative gepusht wird.
  region?: string | null;
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
Erkennbare Kampagnen: "Wechsel", "Neugeschäft", "Kinderwunsch".
Bei "Kinderwunsch" steht meist eine Region/Stadt dabei (z. B. "Kinderwunsch Berlin")
— extrahiere sie nach "region" (nur der Ortsname, ohne das Wort "Kinderwunsch").
Bei Wechsel/Neugeschäft ist region null.
Antworte mit strict JSON: {"action": "generate"|"unknown", "count": number, "campaignKey": "Wechsel"|"Neugeschäft"|"Kinderwunsch"|null, "region": string|null, "audience"?: string, "tone"?: string}`,
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
