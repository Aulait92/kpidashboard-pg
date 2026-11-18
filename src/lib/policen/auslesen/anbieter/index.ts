// Anbieter wählen (Rechtsprüfung K3): genau der konfigurierte, ohne Rückfall. Nicht eingerichtet: null (kein Auslesen).

import { anbieterName } from "@/lib/policen/auslesen/konfig";
import type { AuslesenAnbieter } from "@/lib/policen/auslesen/anbieter/typ";

export async function waehleAnbieter(env: Record<string, string | undefined> = process.env): Promise<AuslesenAnbieter | null> {
  if (anbieterName(env) === "bedrock-eu") {
    const { bedrockEuAnbieter } = await import("@/lib/policen/auslesen/anbieter/bedrock-eu");
    const { bedrockEu } = await import("@/lib/ki-eu-konfig");
    return bedrockEuAnbieter(bedrockEu(env));
  }
  const { openAiEuAnbieter } = await import("@/lib/policen/auslesen/anbieter/openai-eu");
  const { openAiEu } = await import("@/lib/policen/auslesen/konfig");
  return openAiEuAnbieter(openAiEu(env));
}
