// KI-Ersatz für Monatsberichte (kein echter Claude-Aufruf in Tests): Der Schreiber liefert einen
// festen Einstieg und fasst massnahmen_roh 1:1 zusammen, der Prüfer sagt ok.
import { vi } from "vitest";
import type { LlmCall, LlmRequest } from "@/lib/kampagnen/llm";

const usage = { tokensIn: 10, tokensOut: 10, costCents: 1 };

export const DEFAULT_INTRO = "Im Oktober 2026 sind neue Anfragen bei Ihnen eingegangen. Wir bleiben für Sie dran und schauen gemeinsam auf den nächsten Monat.";

/** Daten, die der Schreiber bekommen hat (JSON vor einem evtl. Überarbeitungshinweis). */
export function writerData(req: LlmRequest): { massnahmen_roh: string[] } & Record<string, unknown> {
  return JSON.parse(req.user.split("\n\n")[0]);
}

export const fakeLlm = (intro = DEFAULT_INTRO, checkerOk = true): LlmCall & { mock: { calls: [LlmRequest][] } } =>
  vi.fn(async (req: LlmRequest) => {
    if (req.agent === "Berichtsprüfer") return { text: JSON.stringify({ ok: checkerOk, issues: checkerOk ? [] : ["Prüfer: Hinweis"] }), usage };
    const raw = writerData(req).massnahmen_roh;
    return { text: JSON.stringify({ intro, massnahmen: raw.map((t) => `Wir haben Folgendes umgesetzt: ${t}.`) }), usage };
  }) as unknown as LlmCall & { mock: { calls: [LlmRequest][] } };
