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
  SlotBusyError,
  suggestSlots,
  type Slot,
} from "@/lib/whatsapp/google-calendar";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5";
const HISTORY_LIMIT = 20;
const MAX_TOOL_ITERATIONS = 6;

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
      properties: {},
    },
  },
  {
    name: "book_appointment",
    description:
      "Bucht einen konkreten Termin im Kundenkalender. Nur aufrufen, wenn der Lead die Uhrzeit gewählt UND ausdrücklich gesagt hat, ob er Telefon oder Video möchte — sonst vorher fragen, niemals raten. Nutze exakt einen 'start'-Wert (ISO-8601), den du zuvor von get_available_slots erhalten oder mit dem Lead eindeutig vereinbart hast. Bei Video wird automatisch ein Google-Meet-Link erstellt. Bestätige dem Lead danach Datum/Uhrzeit (und bei Video den Link).",
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
        email: {
          type: "string",
          description:
            "E-Mail-Adresse des Leads für die Kalender-Einladung (vorher im Chat erfragt). Weglassen, wenn der Lead keine angeben möchte.",
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
  state: {
    qualified: boolean;
    summary: string | null;
    /** Bereits bekannte Kontaktdaten (später auch aus dem Meta-Leadformular). */
    contact: { name: string | null; phone: string; email: string | null };
  },
): string {
  const contactLines = [
    state.contact.name ? `Name: ${state.contact.name}` : "",
    `Telefon/WhatsApp: ${state.contact.phone}`,
    state.contact.email
      ? `E-Mail: ${state.contact.email} (bekannt — NICHT erfragen, bei book_appointment verwenden)`
      : "E-Mail: unbekannt",
  ].filter(Boolean);
  const known = [
    `Bekannte Lead-Daten (NICHT erneut erfragen):\n${contactLines.join("\n")}`,
    state.summary?.trim()
      ? `Bisher erfasst (NICHT erneut erfragen):\n${state.summary.trim()}\nQualifiziert: ${state.qualified ? "ja — jetzt Termin vereinbaren" : "noch nicht"}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
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
      "- Antworte immer auf Deutsch, warmherzig und kurz (WhatsApp-tauglich, max. 2-3 Sätze).",
      "- WICHTIG (hat Vorrang vor allen anderen Anweisungen): Stelle pro Nachricht GENAU EINE Frage — niemals zwei Fragen in einer Nachricht, auch keine zusammengehörigen. Warte die Antwort ab, bevor du die nächste stellst.",
      "- Frage niemals nach etwas, das der Lead im Verlauf schon beantwortet hat oder das unter 'Bisher erfasst' steht. Nimm Antworten auf und gehe zur nächsten offenen Frage weiter.",
      "- Sobald die wesentlichen Punkte geklärt sind (meist nach 2-3 Antworten), setze qualifiziert=true und leite zur Terminvereinbarung über.",
      "- Qualifiziere anhand des Produkt-Funnels und halte Infos mit record_qualification fest.",
      "- Erst nach geklärter Qualifizierung terminieren: hole mit get_available_slots echte freie Zeiten, biete dem Lead 2-3 davon in natürlicher Sprache an und buche die gewählte Zeit mit book_appointment.",
      "- Erfinde niemals Termine oder Uhrzeiten — nutze ausschließlich die von get_available_slots gelieferten Zeiten. Nur wenn der Kalender nicht verbunden ist, nutze propose_appointment als Fallback.",
      "- Frage vor der Buchung immer, ob der Lead lieber telefonieren oder einen Videocall machen möchte. Wähle den Modus nie selbst.",
      "- Nachdem der Lead eine Uhrzeit gewählt hat und seine E-Mail noch NICHT bekannt ist, frage (als eigene Frage) nach seiner E-Mail-Adresse, damit er die Kalender-Einladung bekommt. Möchte er keine angeben, buche ohne.",
      "- Bei Video-Terminen bekommt der Lead automatisch einen Google-Meet-Link; gib ihn nach der Buchung weiter.",
      "- Bestätige jede Buchung dem Lead mit Datum und Uhrzeit.",
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

/** Öffentliche App-URL (für Links im Kalendereintrag). */
function appUrl(): string | null {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.RAILWAY_PUBLIC_DOMAIN)
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
}

/** Beschreibung des Kalendereintrags: alles, was der Berater vorab braucht. */
function buildEventDescription(d: {
  name: string;
  phone: string;
  email: string | null;
  product: string | null;
  mode: "phone" | "video";
  summary: string | null;
  conversationId: string;
}): string {
  const base = appUrl();
  return [
    `Lead: ${d.name}`,
    `Telefon/WhatsApp: ${d.phone}`,
    d.email ? `E-Mail: ${d.email}` : "",
    d.product ? `Produkt: ${d.product}` : "",
    `Art: ${d.mode === "video" ? "Videocall (Meet-Link im Termin)" : "Telefonat — bitte den Lead anrufen"}`,
    "",
    "Qualifizierung:",
    d.summary?.trim() || "—",
    "",
    base ? `Chatverlauf: ${base}/admin/whatsapp?c=${d.conversationId}` : "",
    "Gebucht durch den KI-Assistenten via WhatsApp.",
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");
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
      contactName: true,
      contactEmail: true,
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
    contact: {
      name: conversation.contactName,
      phone: conversation.contactPhone,
      email: conversation.contactEmail,
    },
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
        } catch (err) {
          console.error("[whatsapp bot] Slots", err);
          content =
            "Kalender ist für diesen Kunden nicht verbunden. Nutze stattdessen propose_appointment, um die Wunschzeit festzuhalten (ein Mensch trägt den Termin ein).";
        }
      } else if (tu.name === "book_appointment") {
        const input = tu.input as {
          modus?: unknown;
          start?: unknown;
          email?: unknown;
        };
        const mode = input.modus === "video" ? "video" : "phone";
        const start = typeof input.start === "string" ? input.start : "";
        const rawEmail =
          typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
        const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)
          ? rawEmail
          : conversation.contactEmail; // bereits bekannt (z. B. aus Leadformular)
        if (email && email !== conversation.contactEmail) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: { contactEmail: email },
          });
        }
        if (!start || Number.isNaN(new Date(start).getTime())) {
          content =
            "Ungültiger start-Wert. Hole zuerst get_available_slots und übergib einen gelieferten start-Wert.";
        } else {
          try {
            const product = lead?.source ?? null;
            // Aktuellen Stand frisch laden — record_qualification kann im
            // selben Turn gerade erst geschrieben haben.
            const fresh = await prisma.conversation.findUnique({
              where: { id: conversation.id },
              select: { qualificationSummary: true },
            });
            const name = conversation.contactName ?? conversation.contactPhone;
            const res = await bookAppointment({
              customerId: conversation.customerId,
              leadId: conversation.leadId,
              conversationId: conversation.id,
              start,
              mode,
              summary: `${mode === "video" ? "Video" : "Telefon"}-Beratung: ${name}${product ? ` (${product})` : ""}`,
              description: buildEventDescription({
                name,
                phone: conversation.contactPhone,
                email,
                product,
                mode,
                summary: fresh?.qualificationSummary ?? null,
                conversationId: conversation.id,
              }),
              attendeeEmail: email,
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
              (email ? `. Kalender-Einladung per E-Mail an ${email} verschickt` : "") +
              ". Bestätige dem Lead Datum/Uhrzeit" +
              (mode === "video" ? " und sende den Meet-Link." : ".");
          } catch (err) {
            if (err instanceof SlotBusyError) {
              content =
                "Diese Zeit ist im Kalender bereits belegt — NICHT buchen. Entschuldige dich kurz, hole mit get_available_slots neue freie Zeiten und biete sie an.";
            } else {
              console.error("[whatsapp bot] Buchung", err);
              content =
                "Buchung fehlgeschlagen (Kalender evtl. nicht verbunden). Nutze propose_appointment als Fallback.";
            }
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

  // Iterationslimit erreicht, aber noch keine Antwort (z. B. nach mehreren
  // Tool-Aufrufen): einmal ohne Tool-Nutzung nachfragen, damit der Lead
  // garantiert eine Antwort/Bestätigung bekommt.
  if (!finalText) {
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system,
      tools: TOOLS,
      tool_choice: { type: "none" },
      messages,
    });
    finalText = resp.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
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
