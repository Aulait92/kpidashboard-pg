import { uploadImageToR2 } from "@/lib/r2";
import { renderHtmlToImage } from "@/lib/html-to-png";

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
- Keine externen Bilder, keine JS, kein <script>
- Wenn du ein Personenfoto willst: stattdessen einen abstrakten Block mit linear-gradient + "ANZEIGE"-Badge nutzen (Stockfotos haben wir nicht)
- SVG inline für Icons/Pfeile/Checkmarks ist explizit erwünscht
- Border-radius, box-shadow, backdrop-filter erlaubt
- Body: { margin:0; padding:0; width:1080px; height:1080px; overflow:hidden; font-family:... }
- Saubere Hierarchie: Hero-Element nimmt 60-70% visuellen Raum, drumherum Whitespace
- Top-Right: kleines "ANZEIGE"-Label in grau (10px, uppercase, letter-spacing)
- Bottom: CTA-Button (volle Breite oder rechts), klar erkennbar mit Pfeil →

═══ FARB-PALETTEN (eine pro Variante wählen) ═══
- Cream/Black: Background #FAF6F0, Text #0E0E0E, Accent-Yellow #FFD84D
- Dark/Cream: Background #0E0E0E, Text #FAF6F0, Accent-Yellow #FFD84D
- Stopp-Red: Background #E53935, Text white, Body-Accent #FFD84D
- Newspaper: Background #F7F4EE, Text #1C1C1C, Serif-Headlines
- Konto-Mockup: Background #ECEEF1 (Browser-Grau), Card #FFFFFF, Akzent-Grün #06A77D

═══ OUTPUT-FORMAT ═══
Strict JSON-Array, kein Markdown, kein Fließtext drumherum. Jedes Element:
{
  "headline": string,  // entspricht der visuellen Hero-Zeile
  "body": string,      // sub-headline aus dem Creative
  "cta": string,       // Text des CTA-Buttons
  "html": string       // komplettes <!DOCTYPE html>-Dokument
}`;

async function generateCreativeVariants(
  brief: CreativeBrief,
): Promise<CreativeVariant[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const userPrompt = `Generiere ${brief.count} Creative-Varianten für eine Meta-Ad zur ${brief.campaignKey}-Kampagne.

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

Jede Variante MUSS eine andere Direct-Response-Mechanic nutzen und einen anderen Hook-Angle (Pain / Curiosity / Promise / Story). Antworte mit strict JSON-Array.`;

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

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Claude-Response nicht parsebar: ${text.slice(0, 200)}…`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Claude-Response war kein Array");
  }
  return parsed as CreativeVariant[];
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function generateCreatives(
  brief: CreativeBrief,
  requestId: string,
): Promise<GeneratedCreative[]> {
  const variants = await generateCreativeVariants(brief);

  // Parallel rendern + uploaden.
  const results = await Promise.all(
    variants.map(async (v, i) => {
      const buffer = await renderHtmlToImage(v.html, {
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
