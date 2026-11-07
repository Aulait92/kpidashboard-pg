// KI-Bot-Loop: reagiert auf eingehende WhatsApp-Nachrichten. Pro Kunde gibt es
// einen konfigurierbaren Agenten (AgentConfig). Der Bot qualifiziert anhand des
// Produkt-Funnels, hält Infos per Tool-Use fest und schlägt bei Qualifizierung
// einen Termin (Telefon/Video) vor. Antwort geht über das Gateway zurück.
//
// Default-Modell: claude-opus-5-5 (per ANTHROPIC_MODEL überschreibbar — bei
// hohem Volumen ist claude-sonnet-5-5 / claude-haiku-5-5 die günstigere Wahl).

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ITERATIONS = 4;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "record_qualification",
    description:
      "Hält strukturierte Qualifizierungs-Infos zum Lead fest, sobald du sie erfährst (z. B. Bedarf, Situation, Einwände). Setze qualifiziert=true, wenn alle nötigen Fragen geklärt sind.",
    input_schema: {
      type: "object",
      properties: {
        zusammenfassung: {
          type: "string",
          description: "Kurze Zusammenfassung der bisher erfassten Angaben.",
        },
        qualifiziert: {
          type: "boolean",
          description: "True, wenn der Lead qualifiziert ist.",
        },
      },
      required: ["zusammenfassung"],
    },
  },
  {
    name: "propose_appointment",
    description:
      "Hält die Terminpräferenz fest bzw. schlägt einen Termin vor. Nur nach erfolgter Qualifizierung nutzen.",
    input_schema: {
      type: "object",
      properties: {
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Telefon oder Videocall.",
        },
        wunschzeit: {
          type: "string",
          description: "Vom Lead genannte Wunschzeit (Freitext).",
        },
        notiz: { type: "string" },
      },
      required: ["modus"],
    },
  },
];

function buildSystemPrompt(
  agent: { systemPrompt: string; knowledge: string; personality: string },
  product: string | null,
): string {
  const base = [
    agent.systemPrompt?.trim() ||
      "Du bist eine freundliche, empathische KI-Vertriebsassistentin.",
    product ? `Produkt/Thema dieses Leads: ${product}.` : "",
    agent.knowledge?.trim() ? `Wissen:\n${agent.knowledge.trim()}` : "",
    agent.personality?.trim()
      ? `Persönlichkeit/Ton:\n${agent.personality.trim()}`
      : "",
    [
      "Regeln:",
      "- Antworte immer auf Deutsch, warmherzig und kurz (WhatsApp-tauglich).",
      "- Stelle immer nur eine oder wenige zusammengehörige Fragen auf einmal.",
      "- Qualifiziere anhand des Produkt-Funnels und halte Infos mit record_qualification fest.",
      "- Erst nach geklärter Qualifizierung mit propose_appointment einen Termin (Telefon/Video) vorschlagen.",
      "- Erfinde keine Fakten; bei Unklarheit biete eine Klärung durch das Team an.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return base;
}

type HistoryMessage = { direction: string; body: string | null };

function toApiMessages(history: HistoryMessage[]): Anthropic.MessageParam[] {
  const msgs: Anthropic.MessageParam[] = [];
  for (const m of history) {
    const text = (m.body ?? "").trim();
    if (!text) continue;
    if (m.direction === "inbound") msgs.push({ role: "user", content: text });
    else if (m.direction === "outbound")
      msgs.push({ role: "assistant", content: text });
    // interne Einträge (Qualifizierung/Status) überspringen
  }
  // Die Messages-API verlangt, dass die erste Nachricht von "user" stammt.
  const firstUser = msgs.findIndex((m) => m.role === "user");
  return firstUser <= 0 ? msgs : msgs.slice(firstUser);
}

async function persistInternal(
  conversationId: string,
  kind: string,
  payload: unknown,
): Promise<void> {
  await prisma.message.create({
    data: {
      conversationId,
      direction: "internal",
      kind,
      body: JSON.stringify(payload),
      sentBy: "bot",
    },
  });
}

/** Verarbeitet eine eingegangene Nachricht in einer Konversation mit dem KI-Bot. */
export async function runBotTurn(conversationId: string): Promise<void> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true,
      customerId: true,
      contactPhone: true,
      botActive: true,
      leadId: true,
    },
  });
  if (!conversation || !conversation.botActive) return;

  const agent = await prisma.agentConfig.findUnique({
    where: { customerId: conversation.customerId },
  });
  if (!agent || !agent.active) return; // Agent (noch) nicht konfiguriert

  const lead = conversation.leadId
    ? await prisma.lead.findUnique({
        where: { id: conversation.leadId },
        select: { source: true },
      })
    : null;

  const history = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: HISTORY_LIMIT,
    select: { direction: true, body: true },
  });

  const system = buildSystemPrompt(agent, lead?.source ?? null);
  const messages = toApiMessages(history);
  if (messages.length === 0) return;

  const client = new Anthropic();
  let finalText = "";

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      messages,
    });

    const texts = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text);
    const toolUses = resp.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      finalText = texts.join("\n").trim();
      break;
    }

    // Assistant-Turn (inkl. Tool-Use) zurück in den Verlauf.
    messages.push({
      role: "assistant",
      content: resp.content as unknown as Anthropic.ContentBlockParam[],
    });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      if (tu.name === "record_qualification") {
        await persistInternal(conversation.id, "qualification", tu.input);
        // TODO: qualifizierte Felder in Lead/CustomerProduct mappen.
      } else if (tu.name === "propose_appointment") {
        await persistInternal(conversation.id, "appointment_proposal", tu.input);
        // TODO: echten Google-Kalender-Slot buchen (nächster Baustein).
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: "ok",
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  if (finalText) {
    await sendWhatsAppMessage({
      customerId: conversation.customerId,
      to: conversation.contactPhone,
      body: finalText,
      sentBy: "bot",
    });
  }
}
