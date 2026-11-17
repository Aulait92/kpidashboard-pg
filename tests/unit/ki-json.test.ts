import { describe, expect, it } from "vitest";
import { jsonAusAntwort, strengesSchema } from "@/lib/ki-json";

describe("KI-Antworten als JSON nach Schema", () => {
  it("jedes Objekt ohne Zusatzfelder, Original bleibt", () => {
    const s = { type: "object", properties: { a: { type: "array", items: { type: "object", properties: { x: { type: "string" } } } } } };
    const st = strengesSchema(s) as { additionalProperties: boolean; properties: { a: { items: { additionalProperties: boolean } } } };
    expect(st.additionalProperties).toBe(false);
    expect(st.properties.a.items.additionalProperties).toBe(false);
    expect("additionalProperties" in s).toBe(false);
  });

  it("liest Text-JSON, tool_use und lehnt Unsinn ab", () => {
    expect(jsonAusAntwort({ stop_reason: "end_turn", content: [{ type: "text", text: '{"sentiment":"positive"}', citations: null }] })).toEqual({ sentiment: "positive" });
    expect(jsonAusAntwort({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t", name: "x", input: { a: 1 }, caller: { type: "direct" } } as never] })).toEqual({ a: 1 });
    expect(jsonAusAntwort({ stop_reason: "end_turn", content: [{ type: "text", text: "kein json", citations: null }] })).toBeNull();
    expect(jsonAusAntwort({ stop_reason: "refusal", content: [{ type: "text", text: "{}", citations: null }] })).toBeNull();
  });
});
