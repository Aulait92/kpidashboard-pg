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
  imagePrompt: string; // bei HTML-Pipeline: das volle HTML (Debug/Replay)
  imageUrl: string; // public URL nach R2-Upload
};

// ─── Claude Creative-Generation (HTML) ───────────────────────────────

type CreativeVariant = {
  headline: string;
  body: string;
  cta: string;
  html: string;
};

const CREATIVE_SYSTEM_PROMPT = `Du bist Senior Direct-Response-Creative-Director für Meta-Ads im deutschen PKV-Lead-Gen-Markt. Du designst Ad-Creatives als komplette HTML-Dokumente.

ZIELGRUPPE: Privat versicherbare Personen (Selbstständige, Akademiker, Beamte, Angestellte > JAEG).
ZIEL: PKV-Beratungs-Termin buchen.

═══ COPY-REGELN ═══
- Spezifische Zahlen statt Adjektive ("−38%", "73.800€", "824€")
- Erste Person oder konkrete Persona
- Pain-Point / Curiosity / Promise / Story als Hook-Angle
- Headline max 6 Wörter
- Body max 90 Zeichen
- CTA max 18 Zeichen, handlungsorientiert
- VERBOTEN: "Jetzt sparen", "Top-Tarif", "Kostenlos", "Spitzenmäßig"
- Native-Feeling, kein Werbe-Sprech

═══ TEXT-MINIMALISMUS (sehr wichtig) ═══
Weniger Text = stärkeres Creative. Default-Modus: EIN Hero-Element dominiert
visuell (Zahl, kurzes Statement, einzelne Frage), drumherum viel Whitespace.

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

═══ HTML-CONSTRAINTS ═══
- Exakt 1080×1080 Pixel
- Eine einzige <html>-Datei, alle CSS inline im <style>
- Google Fonts via <link rel="stylesheet"> erlaubt (Inter, Playfair Display, Crimson Pro, IBM Plex Sans, Caveat für Handschrift)
- Keine JS, kein <script>
- SVG inline für Icons/Pfeile/Checkmarks ist explizit erwünscht
- Border-radius, box-shadow, backdrop-filter erlaubt
- Body: { margin:0; padding:0; width:1080px; height:1080px; overflow:hidden; font-family:... }
- Saubere Hierarchie: Hero-Element nimmt 60-70% visuellen Raum, drumherum Whitespace
- Top-Right: kleines "ANZEIGE"-Label in grau (10px, uppercase, letter-spacing)
- Bottom: CTA-Button (volle Breite oder rechts), klar erkennbar mit Pfeil →

═══ BILDMATERIAL (Unsplash) ═══
Für Creatives mit Foto-Anteil (Brand-Photo, Person-Quote, Newspaper-Mockup,
Lifestyle-Hero): nutze den Platzhalter

  {{UNSPLASH:keywords}}

als img-src oder background-image-URL. Server löst das vor dem Rendern gegen
ein echtes Unsplash-Foto auf. Keywords präzise + englisch + 2-4 Begriffe:
  background-image: url({{UNSPLASH:german business man 40s office smiling}});
  <img src="{{UNSPLASH:blonde woman kitchen smartphone}}">

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
- {{UNSPLASH:german woman 45 kitchen looking concerned}}
- {{UNSPLASH:man 50 reading insurance letter at home}}
- {{UNSPLASH:older couple looking at documents}}
- {{UNSPLASH:professional woman 40 office laptop relieved}}`,

  Neugeschäft: ``, // Brief noch nicht definiert — Claude nutzt nur die generischen Direct-Response-Regeln
};

async function generateCreativeVariants(
  brief: CreativeBrief,
): Promise<CreativeVariant[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const campaignContext = CAMPAIGN_CONTEXT[brief.campaignKey] ?? "";

  const userPrompt = `Generiere ${brief.count} Creative-Varianten für eine Meta-Ad zur ${brief.campaignKey}-Kampagne.

${campaignContext}

${brief.audience ? `ZIELGRUPPE-FOKUS (zusätzlich): ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

Jede Variante MUSS eine andere Direct-Response-Mechanic nutzen und einen anderen Hook-Angle (Pain / Curiosity / Promise / Story).

PFLICHT-VERTEILUNG für ${brief.count} ${brief.count === 1 ? "Variante" : "Varianten"}:
${
  brief.count === 1
    ? "- 50%-Chance: Foto-Creative ODER typografisch (wähle bewusst, was für den Hook besser passt)"
    : `- Mindestens ${Math.max(1, Math.ceil(brief.count / 2))} Variante(n) MUSS Foto-driven sein (Brand-Photo / Person-Quote / Lifestyle-Background / Newspaper-Mockup) mit {{UNSPLASH:…}}-Platzhalter
- Die übrigen typografisch (Big-Number / STOPP / Highlighter / Konto-Mockup / 3-Fragen-Quiz)`
}

Antworte mit <variant>-Blöcken im definierten Format.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 16000,
      system: CREATIVE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Claude API ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as {
    content: { type: string; text: string }[];
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";

  const variants = parseVariantBlocks(text);
  if (variants.length === 0) {
    throw new Error(
      `Claude-Response enthielt keine <variant>-Blöcke: ${text.slice(0, 300)}…`,
    );
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
    const html = extractTag(inner, "creative_html");
    if (!headline || !body || !cta || !html) continue;
    blocks.push({ headline, body, cta, html });
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
