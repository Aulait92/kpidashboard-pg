// 360dialog Cloud-API-Client (Überbrückungsphase). 360dialog leitet die
// offizielle Meta WhatsApp Cloud API durch: Wir sprechen also faktisch gegen
// das Meta-Format, authentifiziert mit einem channel-spezifischen API-Key im
// Header „D360-API-KEY". Dadurch ist ein späterer Wechsel auf Direkt-Meta ein
// kleiner Umbau (anderer Host + Auth), nicht ein Rewrite.
//
// Der API-Key gehört je Kunde zur WhatsAppAccount-Zeile (apiKeyEnc, app-seitig
// verschlüsselt) und wird NUR kurz vor dem Call entschlüsselt übergeben.

const BASE_URL =
  process.env.DIALOG360_BASE_URL ?? "https://waba-v2.360dialog.io";

export type SendResult = { messageId: string | null; raw: unknown };

async function postMessage(apiKey: string, body: unknown): Promise<SendResult> {
  const res = await fetch(`${BASE_URL}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "D360-API-KEY": apiKey,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? (JSON.parse(text) as Record<string, unknown>) : null;
  } catch {
    /* kein JSON — Rohtext behalten */
  }
  if (!res.ok) {
    throw new Error(`360dialog ${res.status}: ${text.slice(0, 500)}`);
  }
  const messages = (json?.messages as Array<{ id?: string }> | undefined) ?? [];
  return { messageId: messages[0]?.id ?? null, raw: json ?? text };
}

/**
 * Webhook-URL für die Nummer hinter diesem API-Key setzen (360dialog Cloud API).
 * Eingehende Nachrichten, Status und Coexistence-Echos gehen dann an `url`.
 */
export async function setWebhook(apiKey: string, url: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v1/configs/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    throw new Error(`360dialog ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
}

/** Freitext-Nachricht senden (nur innerhalb des 24-Stunden-Fensters erlaubt). */
export function sendText(
  apiKey: string,
  to: string,
  body: string,
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

/** Genehmigte Vorlage senden (Erstansprache / außerhalb des 24h-Fensters). */
export function sendTemplate(
  apiKey: string,
  to: string,
  name: string,
  language: string,
  components?: unknown[],
): Promise<SendResult> {
  return postMessage(apiKey, {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components ? { components } : {}),
    },
  });
}

// ─── Vorlagen (Template-Verwaltung über die WABA-API, Channel-API-Key) ───────
// Quelle: docs.360dialog.com/partner/messaging/template-messages/create-and-manage-template-messages
//   POST /v1/configs/templates  { name, category, language, components }
//   GET  /v1/configs/templates  → { waba_templates: [{ name, language, status, rejected_reason, … }] }
// Status laut Doku: submitted/PENDING → APPROVED | REJECTED, später ggf. PAUSED/DISABLED.

export type RemoteTemplate = {
  name: string;
  language: string;
  status: string;
  category: string | null;
  rejectedReason: string | null;
};

export type CreateTemplateInput = {
  name: string;
  category: "MARKETING" | "UTILITY";
  language: string;
  components: unknown[];
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Alle Vorlagen des WhatsApp-Kontos (WABA) hinter diesem API-Key. */
export async function listTemplates(apiKey: string): Promise<RemoteTemplate[]> {
  const res = await fetch(`${BASE_URL}/v1/configs/templates?limit=1000`, {
    headers: { "D360-API-KEY": apiKey },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`360dialog ${res.status}: ${text.slice(0, 300)}`);
  let json: { waba_templates?: unknown[] } | null = null;
  try {
    json = text ? (JSON.parse(text) as { waba_templates?: unknown[] }) : null;
  } catch {
    throw new Error("360dialog: Vorlagenliste ist kein JSON");
  }
  return (json?.waba_templates ?? [])
    .map((t) => t as Record<string, unknown>)
    .map((t) => ({
      name: str(t.name) ?? "",
      language: str(t.language) ?? "",
      status: (str(t.status) ?? "").toUpperCase(),
      category: str(t.category),
      rejectedReason: str(t.rejected_reason),
    }))
    .filter((t) => t.name);
}

/** Vorlage bei Meta einreichen. Antwort enthält den Anfangsstatus (meist „submitted“/PENDING). */
export async function createTemplate(apiKey: string, input: CreateTemplateInput): Promise<RemoteTemplate> {
  const res = await fetch(`${BASE_URL}/v1/configs/templates`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
    body: JSON.stringify(input),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`360dialog ${res.status}: ${text.slice(0, 300)}`);
  let t: Record<string, unknown> = {};
  try {
    t = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    /* kein JSON – Status bleibt „eingereicht“ */
  }
  return {
    name: str(t.name) ?? input.name,
    language: str(t.language) ?? input.language,
    status: (str(t.status) ?? "SUBMITTED").toUpperCase(),
    category: str(t.category) ?? input.category,
    rejectedReason: str(t.rejected_reason),
  };
}
