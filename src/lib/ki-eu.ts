// KI mit Verarbeitung in der EU (Ole, 17.11.2026: „EU-Zugang einrichten“). Claude über Amazon Bedrock, Region
// Frankfurt (eu-central-1), regionaler Endpunkt (Daten bleiben in der gewählten Region, Aufpreis ca. 10 %).
// Anthropic direkt kennt nur „us“ und „global“, deshalb Bedrock. Derzeit nur die Prüfung (/api/ops/diagnose?q=ki-eu);
// Policen vom Kunden gehen seit 18.11.2026 an gar keine KI mehr (lib/policen), auch nicht über diesen Zugang.
//
// Railway-Variablen (am Service, nie im Code oder Chat):
//   KI_EU_AWS_ACCESS_KEY_ID, KI_EU_AWS_SECRET_ACCESS_KEY  IAM-Nutzer nur mit Bedrock-Aufrufrecht
//   KI_EU_AWS_REGION   optional, Standard eu-central-1 (nur eu-* erlaubt)
//   KI_EU_MODEL        optional, Standard anthropic.claude-opus-5-5
// Eigene Namen statt AWS_*: der Speicher (r2.ts, S3-Client) bleibt davon unberührt.

import Anthropic from "@anthropic-ai/sdk";
import { AnthropicBedrockMantle } from "@anthropic-ai/bedrock-sdk";
import { bedrockEu, type BedrockEu } from "@/lib/ki-eu-konfig";

export { bedrockEu, type BedrockEu };

/** Messages-Client für Bedrock in der EU (gleiche messages.create-Schnittstelle wie Anthropic). */
export function bedrockClient(z: BedrockEu): Pick<Anthropic, "messages"> {
  return new AnthropicBedrockMantle({ awsRegion: z.region, awsAccessKey: z.accessKey, awsSecretAccessKey: z.secretKey, apiKey: null }) as unknown as Pick<Anthropic, "messages">;
}

/** Prüfung für /api/ops/diagnose?q=ki-eu: eingerichtet? Ein kurzer Testaufruf ohne personenbezogene Daten. */
export async function kiEuStatus(): Promise<Record<string, unknown>> {
  const z = bedrockEu();
  if (!z) return { eingerichtet: false, hinweis: "KI_EU_AWS_ACCESS_KEY_ID und KI_EU_AWS_SECRET_ACCESS_KEY fehlen (oder Region nicht eu-*)" };
  const start = Date.now();
  try {
    const r = await bedrockClient(z).messages.create({ model: z.model, max_tokens: 20, messages: [{ role: "user", content: "Antworte nur mit: ok" }] });
    const text = r.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
    return { eingerichtet: true, region: z.region, modell: z.model, antwort: text.slice(0, 20), ms: Date.now() - start };
  } catch (err) {
    const e = err as { status?: number; message?: string };
    return { eingerichtet: true, region: z.region, modell: z.model, fehler: `${e.status ?? ""} ${(e.message ?? String(err)).slice(0, 300)}`.trim(), ms: Date.now() - start };
  }
}
