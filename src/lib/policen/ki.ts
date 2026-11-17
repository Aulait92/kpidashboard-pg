// KI für Unterlagen vom Lead (Ole, 17.11.2026). Zwei getrennte Aufrufe:
//   1. klassifiziere: nur Sparte und ob Gesundheitsangaben enthalten sein können (keine Inhalte zurück).
//   2. liesAus: Vertragsdaten, ausschließlich bei Sachversicherungen (nie bei Gesundheitsbezug, regeln.ts).
// Ohne API-Schlüssel oder bei Fehlern: null (dann gilt die vorsichtige Regel in regeln.ts entscheide).

import Anthropic from "@anthropic-ai/sdk";
import { reportError } from "@/lib/monitoring";
import { cleanAuszug, isSparte, SPARTE_KEYS, ZAHLWEISEN, type Auszug, type Klassifikation, type PolicenTyp } from "@/lib/policen/regeln";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";

function block(data: Uint8Array, typ: PolicenTyp, fileName: string): Anthropic.ContentBlockParam {
  const b64 = Buffer.from(data).toString("base64");
  return typ === "application/pdf"
    ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 }, title: fileName }
    : { type: "image", source: { type: "base64", media_type: typ, data: b64 } };
}

export async function klassifiziere(data: Uint8Array, typ: PolicenTyp, fileName: string): Promise<Klassifikation | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const resp = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        "Du ordnest ein Dokument, das ein Interessent einem Versicherungsvermittler geschickt hat, einer Versicherungssparte zu. Lies nur so viel, wie dafür nötig ist. Gib keine Inhalte, Namen oder Zahlen wieder, nur die Zuordnung. gesundheit=true, wenn es um Kranken-, Zahn-, Berufsunfähigkeits-, Lebens-, Renten-, Pflege- oder Unfallversicherung geht oder das Dokument Gesundheitsangaben einer Person enthalten kann. Tierversicherungen (auch Tier-OP oder Tierkranken) sind keine Gesundheitsangaben einer Person.",
      tools: [
        {
          name: "save_sparte",
          description: "Speichert die Zuordnung des Dokuments.",
          input_schema: {
            type: "object",
            properties: {
              police: { type: "boolean", description: "true, wenn es eine Police, ein Versicherungsschein, eine Beitragsrechnung oder ein Nachtrag ist" },
              sparte: { type: "string", enum: SPARTE_KEYS, description: "Sparte; sonstig, wenn keine passt" },
              gesundheit: { type: "boolean", description: "Gesundheitsbezug einer Person möglich" },
            },
            required: ["police", "sparte", "gesundheit"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "save_sparte" },
      messages: [{ role: "user", content: [block(data, typ, fileName), { type: "text", text: "Ordne dieses Dokument zu." }] }],
    });
    const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    const x = (tool?.input ?? {}) as { police?: unknown; sparte?: unknown; gesundheit?: unknown };
    if (typeof x.gesundheit !== "boolean") return null;
    return { sparte: isSparte(x.sparte) ? x.sparte : null, gesundheit: x.gesundheit, police: x.police !== false };
  } catch (err) {
    reportError(err, "policen-klassifizieren");
    return null;
  }
}

/** Vertragsdaten einer Sachversicherung auslesen. Nie für Unterlagen mit Gesundheitsbezug aufrufen. */
export async function liesAus(data: Uint8Array, typ: PolicenTyp, fileName: string): Promise<Auszug | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const resp = await new Anthropic().messages.create({
      model: MODEL,
      max_tokens: 600,
      system:
        "Du liest eine Police einer Sachversicherung für einen Versicherungsvermittler aus. Übernimm Werte nur aus dem Dokument, erfinde nichts, fehlt etwas: null. Übernimm nur Vertragsdaten: keine Namen, Anschriften, Geburtsdaten, Vertrags-, Kunden- oder Kennzeichennummern, keine Bankdaten und keine Angaben zur Gesundheit von Personen.",
      tools: [
        {
          name: "save_vertrag",
          description: "Speichert die Vertragsdaten.",
          input_schema: {
            type: "object",
            properties: {
              gesellschaft: { type: ["string", "null"], description: "Versicherer, z. B. HUK-Coburg" },
              sparte: { type: "string", enum: SPARTE_KEYS },
              beitrag: { type: ["number", "null"], description: "Beitrag in Euro je Zahlweise, inkl. Versicherungsteuer" },
              zahlweise: { type: ["string", "null"], enum: [...ZAHLWEISEN, null] },
              versicherungssumme: { type: ["string", "null"], description: "z. B. 10 Mio. €" },
              selbstbeteiligung: { type: ["string", "null"], description: "z. B. 150 € je Schaden, oder keine" },
              ablauf: { type: ["string", "null"], description: "Vertragsablauf TT.MM.JJJJ" },
              hauptfaelligkeit: { type: ["string", "null"], description: "Hauptfälligkeit TT.MM." },
            },
            required: ["gesellschaft", "sparte", "beitrag", "zahlweise", "versicherungssumme", "selbstbeteiligung", "ablauf", "hauptfaelligkeit"],
          },
        },
      ],
      tool_choice: { type: "tool", name: "save_vertrag" },
      messages: [{ role: "user", content: [block(data, typ, fileName), { type: "text", text: "Lies diese Police aus." }] }],
    });
    const tool = resp.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    return cleanAuszug(tool?.input);
  } catch (err) {
    reportError(err, "policen-auslesen");
    return null;
  }
}
