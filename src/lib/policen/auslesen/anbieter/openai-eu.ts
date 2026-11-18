// OpenAI mit EU-Datenresidenz (Ole, 18.11.2026: Standard-Anbieter). Fester Endpunkt eu.api.openai.com, eigener
// Schlüssel nur für Dokumente (POLICEN_OPENAI_API_KEY, EU-Projekt mit Zero Data Retention), kein Rückfall.
// Laut OpenAI-Doku (Datenresidenz Europa, 18.11.2026): Files-API in der EU nur Speicherung, deshalb Dokument inline als
// base64 (input_file bzw. input_image), store: false, Structured Outputs (json_schema, strict).

import OpenAI from "openai";
import { strengesSchema } from "@/lib/ki-json";
import { openAiEu, type OpenAiEuKonfig } from "@/lib/policen/auslesen/konfig";
import { auslesenSchema } from "@/lib/policen/auslesen/felder";
import { AUSLESEN_SYSTEM, auslesenAufgabe } from "@/lib/policen/auslesen/prompt";
import { ersteSeiten } from "@/lib/policen/auslesen/anbieter/seiten";
import type { AnbieterErgebnis, AuslesenAnbieter, Dokument } from "@/lib/policen/auslesen/anbieter/typ";

type Inhalt = OpenAI.Responses.ResponseInputContent;

async function dokumentTeil(doc: Dokument): Promise<Inhalt | null> {
  if (doc.typ === "application/pdf") {
    const pdf = await ersteSeiten(doc.data);
    if (!pdf) return null;
    // Neutraler Dateiname: der echte kann den Namen des Kunden enthalten
    return { type: "input_file", filename: "police.pdf", file_data: `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}` };
  }
  return { type: "input_image", detail: "high", image_url: `data:${doc.typ};base64,${Buffer.from(doc.data).toString("base64")}` };
}

export function openAiEuAnbieter(k: OpenAiEuKonfig | null = openAiEu()): AuslesenAnbieter | null {
  if (!k) return null;
  const client = new OpenAI({ apiKey: k.apiKey, baseURL: k.baseURL, project: k.project, maxRetries: 1, timeout: 120_000 });
  return {
    name: "openai-eu",
    modell: k.model,
    async liesAus(doc, sparte): Promise<AnbieterErgebnis> {
      const teil = await dokumentTeil(doc);
      if (!teil) return { ok: false, grund: "fehler" };
      try {
        const resp = await client.responses.create({
          model: k.model,
          store: false,
          instructions: AUSLESEN_SYSTEM,
          input: [{ role: "user", content: [teil, { type: "input_text", text: auslesenAufgabe(sparte) }] }],
          text: { format: { type: "json_schema", name: "police", schema: strengesSchema(auslesenSchema()), strict: true } },
          max_output_tokens: 8000,
        });
        const abgelehnt = resp.output.some((o) => o.type === "message" && o.content.some((c) => c.type === "refusal"));
        if (abgelehnt) return { ok: false, grund: "abgelehnt" };
        if (resp.status === "incomplete") return { ok: false, grund: "unvollstaendig" };
        const text = (resp.output_text ?? "").trim();
        if (!text) return { ok: false, grund: "fehler" };
        return { ok: true, roh: JSON.parse(text) as unknown, modell: k.model };
      } catch (err) {
        // Nur Status, keine Fehlermeldung (sie könnte Teile der Anfrage wiedergeben)
        const status = err instanceof OpenAI.APIError ? err.status : undefined;
        return { ok: false, grund: status === 401 ? "schluessel" : "fehler", ...(status ? { status } : {}) };
      }
    },
  };
}
