// Claude über Amazon Bedrock, Region eu-* (lib/ki-eu.ts). Nur, wenn ausdrücklich gewählt
// (POLICEN_AUSLESEN_ANBIETER=bedrock-eu); nie automatisch als Ersatz für OpenAI (Rechtsprüfung K3).

import type Anthropic from "@anthropic-ai/sdk";
import { bedrockClient, bedrockEu, type BedrockEu } from "@/lib/ki-eu";
import { jsonAusAntwort, jsonAusgabe } from "@/lib/ki-json";
import { auslesenSchema } from "@/lib/policen/auslesen/felder";
import { AUSLESEN_SYSTEM, auslesenAufgabe } from "@/lib/policen/auslesen/prompt";
import { ersteSeiten } from "@/lib/policen/auslesen/anbieter/seiten";
import type { AnbieterErgebnis, AuslesenAnbieter, Dokument } from "@/lib/policen/auslesen/anbieter/typ";

async function block(doc: Dokument): Promise<Anthropic.ContentBlockParam | null> {
  if (doc.typ === "application/pdf") {
    const pdf = await ersteSeiten(doc.data);
    if (!pdf) return null;
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(pdf).toString("base64") }, title: "Police" };
  }
  return { type: "image", source: { type: "base64", media_type: doc.typ, data: Buffer.from(doc.data).toString("base64") } };
}

export function bedrockEuAnbieter(z: BedrockEu | null = bedrockEu()): AuslesenAnbieter | null {
  if (!z) return null;
  return {
    name: "bedrock-eu",
    modell: z.model,
    async liesAus(doc, sparte): Promise<AnbieterErgebnis> {
      const b = await block(doc);
      if (!b) return { ok: false, grund: "fehler" };
      try {
        const resp = await bedrockClient(z).messages.create({
          model: z.model,
          max_tokens: 4000,
          system: AUSLESEN_SYSTEM,
          output_config: jsonAusgabe(auslesenSchema()),
          messages: [{ role: "user", content: [b, { type: "text", text: auslesenAufgabe(sparte) }] }],
        });
        if (resp.stop_reason === "refusal") return { ok: false, grund: "abgelehnt" };
        if (resp.stop_reason === "max_tokens") return { ok: false, grund: "unvollstaendig" };
        const roh = jsonAusAntwort(resp);
        return roh ? { ok: true, roh, modell: z.model } : { ok: false, grund: "fehler" };
      } catch (err) {
        const status = (err as { status?: number })?.status;
        return { ok: false, grund: status === 401 || status === 403 ? "schluessel" : "fehler", ...(typeof status === "number" ? { status } : {}) };
      }
    },
  };
}
