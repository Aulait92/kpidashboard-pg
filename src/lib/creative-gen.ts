import Replicate from "replicate";
import { uploadImageToR2 } from "@/lib/r2";

// Brief der Creative-Generation. Wird mit Claude und Flux gefüllt.
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
  imagePrompt: string;
  imageUrl: string; // public URL nach R2-Upload
};

// ─── Claude Copy-Generation ──────────────────────────────────────────

type CopyVariant = {
  headline: string;
  body: string;
  cta: string;
  imagePrompt: string;
};

const COPY_SYSTEM_PROMPT = `Du bist ein Direct-Response-Creative-Director für Meta-Ads im deutschen PKV-Lead-Gen-Markt.

ZIELGRUPPE: Privat versicherbare Personen (Selbstständige, Akademiker, Beamte, Angestellte > JAEG).
ZIEL der Anzeigen: PKV-Beratungs-Termin buchen.

TONALITÄT:
- Spezifische Zahlen statt Adjektive
- Erste Person oder konkrete Persona
- Pain-Point oder Curiosity-Hook
- Max 6 Wörter Headline, max 90 Zeichen Body
- CTA klar handlungsorientiert
- KEIN "Jetzt sparen", "Top-Tarif", "Kostenlos"
- KEIN Werbe-Sprech, native-feeling

VISUAL-BRIEF (englisch, ready für Flux):
- Photorealistic, smartphone-snap aesthetic, NOT studio polish
- Relatable Person 28-45 Jahre in Alltag (Küche / Schreibtisch / Café)
- Emotionaler Moment: Frust, Aha, Erleichterung
- NO stock-photo-look, NO suits, NO office settings

OUTPUT: Strict JSON, kein Markdown, kein Text drumherum.`;

async function generateCopyVariants(
  brief: CreativeBrief,
): Promise<CopyVariant[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  }

  const userPrompt = `Generiere ${brief.count} Creative-Varianten für eine Meta-Ad zur ${brief.campaignKey}-Kampagne.

${brief.audience ? `ZIELGRUPPE-FOKUS: ${brief.audience}` : ""}
${brief.tone ? `TONE: ${brief.tone}` : ""}

Liefere als JSON-Array mit Objekten:
{
  "headline": string (max 6 Wörter),
  "body": string (max 90 Zeichen),
  "cta": string (max 18 Zeichen),
  "imagePrompt": string (englischer Flux-Prompt, max 60 Wörter, mit Camera-Tags + Mood + Setting)
}

Jede Variante muss einen anderen Hook-Angle nutzen (Pain / Curiosity / Promise / Story).`;

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
      system: COPY_SYSTEM_PROMPT,
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

  // Claude antwortet manchmal mit ```json-Fences trotz Anweisung — Cleanup.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Claude-Response nicht parsebar: ${text.slice(0, 200)}…`,
    );
  }
  if (!Array.isArray(parsed)) {
    throw new Error("Claude-Response war kein Array");
  }
  return parsed as CopyVariant[];
}

// ─── Flux Bild-Generation ────────────────────────────────────────────

async function generateImage(prompt: string): Promise<Buffer> {
  const apiToken = process.env.REPLICATE_API_TOKEN;
  if (!apiToken) {
    throw new Error("REPLICATE_API_TOKEN nicht gesetzt.");
  }

  // useFileOutput: false → SDK liefert plain URL-Strings statt FileOutput-
  // Objekten. Macht die Behandlung der Antwort deterministisch.
  const replicate = new Replicate({ auth: apiToken, useFileOutput: false });

  // Flux 1.1 Pro: photorealistic, hand+text-treu, ~10s pro Bild
  const output = await replicate.run("black-forest-labs/flux-1.1-pro", {
    input: {
      prompt,
      aspect_ratio: "1:1", // 1:1 für Feed-Ads (Meta empfohlen)
      output_format: "jpg",
      output_quality: 90,
      safety_tolerance: 2,
    },
  });

  const url = extractUrl(output);
  if (!url) {
    throw new Error(
      `Replicate-Output unerwartet: ${JSON.stringify(output)?.slice(0, 300) ?? String(output)}`,
    );
  }
  const imgRes = await fetch(url);
  if (!imgRes.ok) {
    throw new Error(`Bild-Download fehlgeschlagen: ${imgRes.status}`);
  }
  return Buffer.from(await imgRes.arrayBuffer());
}

// Replicate-Output kann je nach Modell + SDK-Version unterschiedlich
// strukturiert sein: string | string[] | FileOutput | FileOutput[].
// Wir laufen rekursiv durch und ziehen die erste URL raus, die wir finden.
function extractUrl(o: unknown): string | null {
  if (!o) return null;
  if (typeof o === "string") return o;
  if (Array.isArray(o)) {
    for (const item of o) {
      const u = extractUrl(item);
      if (u) return u;
    }
    return null;
  }
  if (typeof o === "object") {
    const obj = o as { url?: unknown; href?: unknown };
    if (typeof obj.url === "function") {
      try {
        const u = (obj.url as () => unknown)();
        if (u instanceof URL) return u.toString();
        if (typeof u === "string") return u;
      } catch {
        // Fallback unten
      }
    }
    if (typeof obj.url === "string") return obj.url;
    if (typeof obj.href === "string") return obj.href;
  }
  return null;
}

// ─── Orchestrator ────────────────────────────────────────────────────

export async function generateCreatives(
  brief: CreativeBrief,
  requestId: string,
): Promise<GeneratedCreative[]> {
  const copyVariants = await generateCopyVariants(brief);

  const results: GeneratedCreative[] = [];
  // Parallel-Generation: alle Bilder gleichzeitig.
  const imageBuffers = await Promise.all(
    copyVariants.map((v) => generateImage(v.imagePrompt)),
  );

  for (let i = 0; i < copyVariants.length; i++) {
    const variant = copyVariants[i];
    const key = `creatives/${requestId}/${i + 1}.jpg`;
    const imageUrl = await uploadImageToR2({
      buffer: imageBuffers[i],
      key,
      contentType: "image/jpeg",
    });

    results.push({
      headline: variant.headline,
      body: variant.body,
      cta: variant.cta,
      imagePrompt: variant.imagePrompt,
      imageUrl,
    });
  }

  return results;
}

// ─── Intent Parsing aus WhatsApp-Text ────────────────────────────────

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
