// KI-Bot-Loop: reagiert auf eingehende WhatsApp-Nachrichten. Pro Kunde gibt es
// einen konfigurierbaren Agenten (AgentConfig). Der Bot qualifiziert anhand des
// Produkt-Funnels, hält Infos per Tool-Use fest und schlägt bei Qualifizierung
// einen Termin (Telefon/Video) vor. Antwort geht über das Gateway zurück.
//
// Default-Modell: claude-opus-5-5 (per ANTHROPIC_MODEL überschreibbar — bei
// hohem Volumen ist claude-sonnet-5-5 / claude-haiku-5-5 die günstigere Wahl).

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import {
  bookAppointment,
  suggestSlots,
  type Slot,
} from "@/lib/whatsapp/google-calendar";
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
    name: "get_available_slots",
    description:
      "Liefert freie Termin-Vorschläge aus dem echten Kundenkalender (nächste Werktage). Erst nach erfolgter Qualifizierung nutzen, um dem Lead konkrete Zeiten anzubieten. Gib dem Lead die zurückgegebenen Zeiten in natürlicher Sprache (Datum + Uhrzeit) zur Auswahl.",
    input_schema: {
      type: "object",
      properties: {
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Telefon oder Videocall.",
        },
      },
      required: ["modus"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Bucht einen konkreten Termin im Kundenkalender. Nutze exakt einen 'start'-Wert (ISO-8601), den du zuvor von get_available_slots erhalten oder mit dem Lead eindeutig vereinbart hast. Bei Video wird automatisch ein Google-Meet-Link erstellt. Bestätige dem Lead danach Datum/Uhrzeit (und bei Video den Link).",
    input_schema: {
      type: "object",
      properties: {
        modus: {
          type: "string",
          enum: ["phone", "video"],
          description: "Telefon oder Videocall.",
        },
        start: {
          type: "string",
          description: "Startzeitpunkt im ISO-8601-Format (z. B. aus get_available_slots).",
        },
      },
      required: ["modus", "start"],
    },
  },
  {
    name: "propose_appointment",
    description:
      "FALLBACK, nur wenn der Kalender nicht verbunden ist (get_available_slots meldet das): Terminpräferenz/Wunschzeit festhalten, damit ein Mensch den Termin manuell einträgt. Wenn der Kalender verbunden ist, stattdessen get_available_slots + book_appointment nutzen.",
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
  state: { qualified: boolean; summary: string | null },
): string {
  const known = state.summary?.trim()
    ? `Bisher erfasst (NICHT erneut erfragen):\n${state.summary.trim()}\nQualifiziert: ${state.qualified ? "ja — jetzt Termin vereinbaren" : "noch nicht"}`
    : "";
  const base = [
    agent.systemPrompt?.trim() ||
      "Du bist eine freundliche, empathische KI-Vertriebsassistentin.",
    product ? `Produkt/Thema dieses Leads: ${product}.` : "",
    agent.knowledge?.trim() ? `Wissen:\n${agent.knowledge.trim()}` : "",
    agent.personality?.trim()
      ? `Persönlichkeit/Ton:\n${agent.personality.trim()}`
      : "",
    known,
    [
      "Regeln:",
      "- Antworte immer auf Deutsch, warmherzig und kurz (WhatsApp-tauglich).",
      "- Stelle immer nur eine oder wenige zusammengehörige Fragen auf einmal.",
      "- Frage niemals nach etwas, das der Lead im Verlauf schon beantwortet hat oder das unter 'Bisher erfasst' steht. Nimm Antworten auf und gehe zur nächsten offenen Frage weiter.",
      "- Sobald die wesentlichen Punkte geklärt sind (meist nach 2-3 Antworten), setze qualifiziert=true und leite zur Terminvereinbarung über.",
      "- Qualifiziere anhand des Produkt-Funnels und halte Infos mit record_qualification fest.",
      "- Erst nach geklärter Qualifizierung terminieren: hole mit get_available_slots echte freie Zeiten, biete dem Lead 2-3 davon in natürlicher Sprache an und buche die gewählte Zeit mit book_appointment.",
      "- Erfinde niemals Termine oder Uhrzeiten — nutze ausschließlich die von get_available_slots gelieferten Zeiten. Nur wenn der Kalender nicht verbunden ist, nutze propose_appointment als Fallback.",
      "- Bei Video-Terminen bekommt der Lead automatisch einen Google-Meet-Link; gib ihn nach der Buchung weiter.",
      "- Erfinde keine Fakten; bei Unklarheit biete eine Klärung durch das Team an.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  return base;
}

const BERLIN_TZ = "Europe/Berlin";

/** Slot-Startzeit für den Bot lesbar machen (deutsche Lokalzeit). */
function formatSlotDE(iso: string): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BERLIN_TZ,
  }).format(new Date(iso));
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
      qualified: true,
      qualificationSummary: true,
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

  // Die NEUESTEN Chat-Nachrichten laden (desc + reverse) — interne Einträge
  // ausgenommen, damit sie das Fenster nicht verstopfen.
  const history = (
    await prisma.message.findMany({
      where: { conversationId, direction: { in: ["inbound", "outbound"] } },
      orderBy: { createdAt: "desc" },
      take: HISTORY_LIMIT,
      select: { direction: true, body: true },
    })
  ).reverse();

  const system = buildSystemPrompt(agent, lead?.source ?? null, {
    qualified: conversation.qualified,
    summary: conversation.qualificationSummary,
  });
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
      let content = "ok";
      if (tu.name === "record_qualification") {
        const input = tu.input as {
          zusammenfassung?: unknown;
          qualifiziert?: unknown;
        };
        await persistInternal(conversation.id, "qualification", tu.input); // Audit-Log
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            qualificationSummary:
              typeof input.zusammenfassung === "string"
                ? input.zusammenfassung
                : undefined,
            qualified: input.qualifiziert === true ? true : undefined,
          },
        });
        // Verknüpften Lead mitführen: qualifiziert ⇒ in Beratung / erreicht.
        if (input.qualifiziert === true && conversation.leadId) {
          await prisma.lead
            .update({
              where: { id: conversation.leadId },
              data: { status: "In Beratung", reached: true },
            })
            .catch(() => {});
        }
      } else if (tu.name === "get_available_slots") {
        try {
          const slots: Slot[] = await suggestSlots(conversation.customerId);
          if (slots.length === 0) {
            content =
              "Aktuell keine freien Slots in den nächsten Werktagen gefunden. Frage den Lead nach seiner Wunschzeit und nutze propose_appointment.";
          } else {
            content =
              "Freie Zeiten (biete dem Lead 2-3 davon an; zum Buchen den exakten start-Wert an book_appointment übergeben):\n" +
              slots
                .map((s) => `- ${formatSlotDE(s.start)} (start=${s.start})`)
                .join("\n");
          }
        } catch {
          content =
            "Kalender ist für diesen Kunden nicht verbunden. Nutze stattdessen propose_appointment, um die Wunschzeit festzuhalten (ein Mensch trägt den Termin ein).";
        }
      } else if (tu.name === "book_appointment") {
        const input = tu.input as { modus?: unknown; start?: unknown };
        const mode = input.modus === "video" ? "video" : "phone";
        const start = typeof input.start === "string" ? input.start : "";
        if (!start || Number.isNaN(new Date(start).getTime())) {
          content =
            "Ungültiger start-Wert. Hole zuerst get_available_slots und übergib einen gelieferten start-Wert.";
        } else {
          try {
            const product = lead?.source ?? null;
            const res = await bookAppointment({
              customerId: conversation.customerId,
              leadId: conversation.leadId,
              conversationId: conversation.id,
              start,
              mode,
              summary: `Beratungstermin${product ? ` – ${product}` : ""}`,
              description: `WhatsApp-Lead ${conversation.contactPhone}`,
            });
            await persistInternal(conversation.id, "appointment_booked", {
              ...(tu.input as Record<string, unknown>),
              appointmentId: res.appointmentId,
              meetUrl: res.meetUrl,
            });
            content =
              `Termin gebucht für ${formatSlotDE(res.start)}` +
              (mode === "video" && res.meetUrl
                ? `. Meet-Link: ${res.meetUrl}`
                : "") +
              ". Bestätige dem Lead Datum/Uhrzeit" +
              (mode === "video" ? " und sende den Meet-Link." : ".");
          } catch {
            content =
              "Buchung fehlgeschlagen (Kalender evtl. nicht verbunden). Nutze propose_appointment als Fallback.";
          }
        }
      } else if (tu.name === "propose_appointment") {
        await persistInternal(conversation.id, "appointment_proposal", tu.input);
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content,
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
