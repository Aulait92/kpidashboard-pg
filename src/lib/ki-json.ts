// Strukturierte KI-Antworten (JSON nach Schema) statt erzwungenem Werkzeug (tool_choice „tool“), das Claude Opus 5.5
// ablehnt (17.11.2026). Gleiche Schemas wie vorher; Objekte bekommen additionalProperties: false (Pflicht für
// output_config.format). jsonAusAntwort liest die Textantwort und nimmt zur Sicherheit auch einen tool_use-Block an.

import type Anthropic from "@anthropic-ai/sdk";

/** Schema für output_config.format: jedes Objekt ohne Zusatzfelder (tief kopiert, Original bleibt unverändert). */
export function strengesSchema(s: unknown): Record<string, unknown> {
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (!v || typeof v !== "object") return v;
    const o: Record<string, unknown> = {};
    for (const [k, w] of Object.entries(v)) o[k] = walk(w);
    const typ = o.type;
    const istObjekt = typ === "object" || (Array.isArray(typ) && typ.includes("object")) || (o.properties && typeof o.properties === "object");
    if (istObjekt && !("additionalProperties" in o)) o.additionalProperties = false;
    return o;
  };
  return walk(s) as Record<string, unknown>;
}

/** output_config für eine JSON-Antwort nach Schema. */
export function jsonAusgabe(schema: unknown): { format: { type: "json_schema"; schema: Record<string, unknown> } } {
  return { format: { type: "json_schema", schema: strengesSchema(schema) } };
}

/** JSON-Objekt aus der Antwort (Text nach Schema; ältere Antworten mit tool_use werden ebenfalls gelesen). */
export function jsonAusAntwort(resp: Pick<Anthropic.Message, "content" | "stop_reason">): Record<string, unknown> | null {
  if (resp.stop_reason === "refusal") return null;
  const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
  if (tool && tool.input && typeof tool.input === "object") return tool.input as Record<string, unknown>;
  const text = resp.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  if (!text) return null;
  try {
    const v = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, "")) as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
