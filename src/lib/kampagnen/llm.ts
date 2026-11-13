// Kampagnen-Agenten: ein Claude-Aufruf je Agent mit strukturierter JSON-Ausgabe.
// Ungültiges JSON oder eine fehlgeschlagene Prüfung → genau ein Wiederholungs-
// versuch mit den Fehlern als Hinweis, danach Fehler. Kosten werden grob
// protokolliert (Preise je Mio. Tokens per Env einstellbar).

import Anthropic from "@anthropic-ai/sdk";
import type { Valid } from "@/lib/kampagnen/types";

export const CAMPAIGN_MODEL = process.env.CAMPAIGN_AGENT_MODEL ?? "claude-opus-5-5";

export type AgentUsage = { tokensIn: number; tokensOut: number; costCents: number };
export type LlmRequest = { agent: string; system: string; user: string; schema: Record<string, unknown>; maxTokens?: number };
export type LlmCall = (req: LlmRequest) => Promise<{ text: string; usage: AgentUsage; refused?: boolean }>;

/** Grobe Kosten in US-Cent (Preise je Mio. Tokens: CAMPAIGN_PRICE_IN_USD / CAMPAIGN_PRICE_OUT_USD). */
export function estimateCostCents(tokensIn: number, tokensOut: number): number {
  const pin = Number(process.env.CAMPAIGN_PRICE_IN_USD ?? 5);
  const pout = Number(process.env.CAMPAIGN_PRICE_OUT_USD ?? 25);
  return Math.round(((tokensIn * pin + tokensOut * pout) / 1_000_000) * 100);
}

/** Standard: Claude über das Anthropic-SDK (adaptive thinking, JSON-Schema-Ausgabe, Streaming). */
export const claudeCall: LlmCall = async (req) => {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: CAMPAIGN_MODEL,
    max_tokens: req.maxTokens ?? 16000,
    thinking: { type: "adaptive" },
    system: req.system,
    messages: [{ role: "user", content: req.user }],
    output_config: { format: { type: "json_schema", schema: req.schema } },
  });
  const msg = await stream.finalMessage();
  const text = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const tokensIn = (msg.usage.input_tokens ?? 0) + (msg.usage.cache_read_input_tokens ?? 0) + (msg.usage.cache_creation_input_tokens ?? 0);
  const tokensOut = msg.usage.output_tokens ?? 0;
  return { text, usage: { tokensIn, tokensOut, costCents: estimateCostCents(tokensIn, tokensOut) }, refused: msg.stop_reason === "refusal" };
};

export class AgentError extends Error {
  constructor(
    message: string,
    readonly usage: AgentUsage,
  ) {
    super(message);
  }
}

const addUsage = (a: AgentUsage, b: AgentUsage): AgentUsage => ({
  tokensIn: a.tokensIn + b.tokensIn,
  tokensOut: a.tokensOut + b.tokensOut,
  costCents: a.costCents + b.costCents,
});

/** JSON aus der Antwort lesen (auch wenn das Modell doch einmal Text drumherum schreibt). */
export function parseJson(text: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    const start = t.indexOf("{");
    const end = t.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1));
    throw new Error("keine JSON-Antwort");
  }
}

/** Agent aufrufen, Antwort prüfen; bei ungültiger Antwort genau ein zweiter Versuch. */
export async function runAgent<T>(call: LlmCall, req: LlmRequest, validate: (x: unknown) => Valid<T>): Promise<{ value: T; usage: AgentUsage }> {
  let usage: AgentUsage = { tokensIn: 0, tokensOut: 0, costCents: 0 };
  let feedback = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    const user = feedback ? `${req.user}\n\nDeine letzte Antwort war ungültig. Bitte korrigieren:\n- ${feedback}` : req.user;
    const res = await call({ ...req, user });
    usage = addUsage(usage, res.usage);
    if (res.refused) throw new AgentError(`${req.agent}: Anfrage abgelehnt.`, usage);
    let parsed: unknown;
    try {
      parsed = parseJson(res.text);
    } catch {
      feedback = "Die Antwort war kein gültiges JSON. Antworte ausschließlich mit dem JSON-Objekt laut Schema.";
      continue;
    }
    const v = validate(parsed);
    if (v.ok) return { value: v.value, usage };
    feedback = v.errors.slice(0, 12).join("\n- ");
  }
  throw new AgentError(`${req.agent}: keine gültige Antwort nach 2 Versuchen (${feedback.slice(0, 300)})`, usage);
}
