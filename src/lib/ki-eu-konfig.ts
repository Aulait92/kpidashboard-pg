// Konfiguration des EU-Zugangs (ohne SDK, auch für reine Regeln nutzbar). Siehe ki-eu.ts.

export type BedrockEu = { art: "bedrock"; region: string; accessKey: string; secretKey: string; model: string };

export const KI_EU_STANDARD_MODELL = "anthropic.claude-opus-5-5";

/** Bedrock-Zugang in der EU aus den Variablen; null, wenn nicht (vollständig) eingerichtet. */
export function bedrockEu(env: Record<string, string | undefined> = process.env): BedrockEu | null {
  const accessKey = (env.KI_EU_AWS_ACCESS_KEY_ID ?? "").trim();
  const secretKey = (env.KI_EU_AWS_SECRET_ACCESS_KEY ?? "").trim();
  if (!accessKey || !secretKey) return null;
  const region = (env.KI_EU_AWS_REGION ?? "").trim().toLowerCase() || "eu-central-1";
  // Nur EU-Regionen: ein Tippfehler darf die Daten nicht in eine andere Region schicken
  if (!/^eu-[a-z]+-\d$/.test(region)) return null;
  return { art: "bedrock", region, accessKey, secretKey, model: (env.KI_EU_MODEL ?? "").trim() || KI_EU_STANDARD_MODELL };
}
