// Conversation-Engine für den WhatsApp-Vorqualifizierungs-Bot.
//
// Pro Inbound-Nachricht wird Claude mit der kompletten Conversation-Historie
// gerufen. Der System-Prompt hängt vom Produkt (Wechsel/Neugeschäft/
// Kinderwunsch) ab und beschreibt, welche Datenpunkte gesammelt werden
// müssen. Claude kann entweder mit Freitext antworten ODER per Tool-Call
// `finish_qualification` die strukturierten Antworten ausspucken — dann
// schließen wir die Conversation und schreiben das Result auf den Lead.
//
// Modell: Sonnet (latency-sensitiv). Override via WHATSAPP_CONV_MODEL.

import { prisma } from "@/lib/prisma";
import { sendText } from "@/lib/whatsapp";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 800;
const REQUEST_TIMEOUT_MS = 30_000;

// Produkt-spezifische Qualifizierungs-Felder. Wird sowohl im System-Prompt
// genannt (damit Claude weiß, was er sammeln soll) als auch ans Tool-Schema
// gehängt (damit das Result strukturiert zurückkommt).
type Field = { key: string; question: string };

const FIELDS_BY_PRODUCT: Record<string, Field[]> = {
  Wechsel: [
    { key: "aktuelle_pkv", question: "Bei welcher PKV ist der Lead aktuell?" },
    { key: "monatlicher_beitrag", question: "Wie hoch ist der monatliche Beitrag?" },
    { key: "versichert_seit", question: "Seit wann besteht die aktuelle PKV?" },
    { key: "beruf", question: "Was macht der Lead beruflich?" },
    { key: "vorerkrankungen", question: "Relevante Vorerkrankungen?" },
    { key: "beste_erreichbarkeit", question: "Wann am besten erreichbar?" },
  ],
  Neugeschäft: [
    { key: "beschaeftigung", question: "Angestellt / Selbständig / Beamter / Studierend?" },
    { key: "bruttoeinkommen", question: "Monatliches Brutto-Einkommen?" },
    { key: "geburtsjahr", question: "Geburtsjahr?" },
    { key: "familienstand", question: "Partner / Kinder mitzuversichern?" },
    { key: "vorerkrankungen", question: "Relevante Vorerkrankungen?" },
    { key: "beste_erreichbarkeit", question: "Wann am besten erreichbar?" },
  ],
  Kinderwunsch: [
    { key: "aktuelle_kv", question: "Aktuell GKV oder PKV? Bei welcher Gesellschaft?" },
    { key: "familienstand", question: "Verheiratet / unverheiratet?" },
    { key: "geburtsjahr_paar", question: "Geburtsjahre beider Partner?" },
    { key: "bisherige_behandlungen", question: "Welche Behandlungen / Diagnosen bisher?" },
    { key: "wunschklinik_region", question: "Wunschklinik oder Region?" },
    { key: "beste_erreichbarkeit", question: "Wann am besten erreichbar?" },
  ],
};

function fieldsForProduct(product: string | null | undefined): Field[] {
  if (!product) return FIELDS_BY_PRODUCT.Neugeschäft;
  return FIELDS_BY_PRODUCT[product] ?? FIELDS_BY_PRODUCT.Neugeschäft;
}

function buildSystemPrompt(opts: {
  leadName: string | null;
  product: string | null;
  fields: Field[];
}): string {
  const lines: string[] = [];
  lines.push(
    "Du bist Lara, freundliche Beraterin im Team von Performance Growth. Du qualifizierst Leads für eine PKV-Beratung per WhatsApp vor.",
  );
  lines.push("");
  lines.push("REGELN:");
  lines.push(
    "- Schreibe duzend, kurz, persönlich. Eine WhatsApp-Nachricht pro Antwort, max. 2-3 Sätze.",
  );
  lines.push(
    "- Stelle pro Nachricht maximal EINE Frage. Wenn der Lead nicht antwortet oder ausweicht, frag nochmal nach, aber max. 1x pro Datenpunkt.",
  );
  lines.push(
    "- Nutze KEINE Emojis exzessiv. Maximal 1 Emoji pro Nachricht.",
  );
  lines.push(
    "- Wenn der Lead absagt ('nein', 'kein Interesse', 'STOP'), rufe `finish_qualification` mit opted_out=true auf.",
  );
  lines.push(
    "- Wenn alle Datenpunkte unten gesammelt sind, bedanke dich kurz, sage 'Der Berater meldet sich innerhalb von 24h bei dir' und rufe danach `finish_qualification` mit opted_out=false auf.",
  );
  lines.push(
    "- Antworte IMMER auf Deutsch. Du gibst keine Versicherungsberatung — wenn der Lead inhaltliche Fragen stellt, vertröste auf den Berater-Anruf.",
  );
  lines.push("");
  lines.push(`LEAD-NAME: ${opts.leadName ?? "unbekannt"}`);
  lines.push(`PRODUKT: ${opts.product ?? "PKV (unklar)"}`);
  lines.push("");
  lines.push("DATENPUNKTE, die du nacheinander erfragen sollst:");
  for (const f of opts.fields) {
    lines.push(`- ${f.key}: ${f.question}`);
  }
  lines.push("");
  lines.push(
    "Fang die Konversation NICHT von vorne an, wenn schon Nachrichten existieren — knüpfe an die letzte Nachricht des Leads an.",
  );
  return lines.join("\n");
}

function buildFinishTool(fields: Field[]): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
} {
  const properties: Record<string, unknown> = {
    opted_out: {
      type: "boolean",
      description:
        "true wenn der Lead die Vorqualifizierung explizit abgelehnt hat (STOP / nein / kein Interesse).",
    },
    summary: {
      type: "string",
      description:
        "1-2 Sätze für den Berater, was im Erstgespräch relevant ist.",
    },
  };
  for (const f of fields) {
    properties[f.key] = {
      type: "string",
      description: f.question,
    };
  }
  return {
    name: "finish_qualification",
    description:
      "Schließt die Vorqualifizierung ab. Rufe dieses Tool, sobald alle Datenpunkte gesammelt sind ODER der Lead absagt.",
    input_schema: {
      type: "object",
      properties,
      required: ["opted_out", "summary"],
    },
  };
}

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | {
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    };

type AnthropicResponse = {
  content: AnthropicContentBlock[];
  stop_reason: string;
};

type ChatMessage = { role: "user" | "assistant"; content: string };

async function callClaude(opts: {
  system: string;
  messages: ChatMessage[];
  tool: ReturnType<typeof buildFinishTool>;
}): Promise<AnthropicResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY nicht gesetzt.");
  const model = process.env.WHATSAPP_CONV_MODEL || DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: opts.system,
        messages: opts.messages,
        tools: [opts.tool],
      }),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`Anthropic ${res.status}: ${text}`);
    }
    return JSON.parse(text) as AnthropicResponse;
  } finally {
    clearTimeout(timeout);
  }
}

// Hauptlogik: ein eingehender Lead-Text → Bot-Antwort + ggf. Conversation
// abschließen. Wird vom Webhook-Handler aufgerufen, NACHDEM die Inbound-
// Nachricht in der DB persistiert wurde.
export async function handleInboundMessage(opts: {
  conversationId: string;
}): Promise<void> {
  const conv = await prisma.whatsappConversation.findUnique({
    where: { id: opts.conversationId },
    include: {
      lead: { select: { name: true, source: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!conv) throw new Error("Conversation nicht gefunden.");
  if (conv.state === "done" || conv.state === "opted_out") {
    console.log(
      `[whatsapp] conv ${conv.id} bereits abgeschlossen (${conv.state}) — ignoriere weitere Nachricht.`,
    );
    return;
  }

  const product = conv.product ?? conv.lead?.source ?? null;
  const fields = fieldsForProduct(product);
  const system = buildSystemPrompt({
    leadName: conv.lead?.name ?? null,
    product,
    fields,
  });
  const tool = buildFinishTool(fields);

  // Conversation-Historie ans Claude-Schema mappen. Outbound = assistant,
  // Inbound = user.
  const messages: ChatMessage[] = conv.messages.map((m) => ({
    role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
    content: m.body,
  }));
  if (messages.length === 0 || messages[0].role !== "user") {
    // Anthropic API verlangt, dass die erste Message role=user ist. Falls die
    // Template-Outbound vor allem anderen liegt, prependen wir einen sanften
    // Platzhalter.
    messages.unshift({ role: "user", content: "(Lead hat geantwortet)" });
  }

  let response: AnthropicResponse;
  try {
    response = await callClaude({ system, messages, tool });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[whatsapp] Claude-Call fehlgeschlagen: ${msg}`);
    await prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: { lastError: msg.slice(0, 500) },
    });
    return;
  }

  // 1) Tool-Use auswerten → Conversation abschließen.
  const toolUse = response.content.find(
    (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
      b.type === "tool_use" && b.name === "finish_qualification",
  );
  // 2) Text-Output sammeln (kann parallel zu tool_use vorkommen).
  const textOut = response.content
    .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
    .map((b) => b.text.trim())
    .filter((t) => t.length > 0)
    .join("\n\n");

  // Antwort schicken (falls Claude eine Text-Antwort produziert hat).
  if (textOut.length > 0) {
    try {
      const sent = await sendText({ to: conv.phone, body: textOut });
      await prisma.whatsappMessage.create({
        data: {
          conversationId: conv.id,
          direction: "out",
          body: textOut,
          wamid: sent.wamid,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp] sendText fehlgeschlagen: ${msg}`);
      await prisma.whatsappConversation.update({
        where: { id: conv.id },
        data: { lastError: msg.slice(0, 500) },
      });
    }
  }

  if (toolUse) {
    const input = toolUse.input ?? {};
    const optedOut = input.opted_out === true;
    await prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: {
        state: optedOut ? "opted_out" : "done",
        qualification: input as object,
        completedAt: new Date(),
      },
    });
    console.log(
      `[whatsapp] conv ${conv.id} abgeschlossen (state=${optedOut ? "opted_out" : "done"}).`,
    );
  } else if (conv.state === "pending_template") {
    // Lead hat erstmalig geantwortet → in Qualifying-Phase wechseln.
    await prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: { state: "qualifying", lastInboundAt: new Date() },
    });
  } else {
    await prisma.whatsappConversation.update({
      where: { id: conv.id },
      data: { lastInboundAt: new Date() },
    });
  }
}
