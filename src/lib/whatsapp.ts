// WhatsApp Cloud API Client (Meta Graph API v20+).
// Dünner Wrapper für die paar Endpoints, die der Vorqualifizierungs-Bot
// braucht: Template senden, Freitext senden, Read-Receipt, Webhook-Signatur
// prüfen und Inbound-Payload parsen.
//
// ENV:
//   WHATSAPP_PHONE_NUMBER_ID    – Phone Number ID aus dem Meta Business Manager
//   WHATSAPP_ACCESS_TOKEN       – Permanent Access Token (System-User)
//   WHATSAPP_VERIFY_TOKEN       – frei wählbarer Token für GET-Verify
//   WHATSAPP_APP_SECRET         – App-Secret für HMAC-SHA256 X-Hub-Signature-256
//   WHATSAPP_TEMPLATE_NAME      – Name des genehmigten Outbound-Templates
//                                  (Default: "pkv_intro_v1")
//   WHATSAPP_TEMPLATE_LANG      – Sprach-Code (Default: "de")
//   WHATSAPP_GRAPH_VERSION      – API-Version (Default: "v20.0")

import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH_BASE = "https://graph.facebook.com";

function graphVersion(): string {
  return process.env.WHATSAPP_GRAPH_VERSION || "v20.0";
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} nicht gesetzt.`);
  return v;
}

async function postGraph(path: string, body: unknown): Promise<unknown> {
  const token = requireEnv("WHATSAPP_ACCESS_TOKEN");
  const url = `${GRAPH_BASE}/${graphVersion()}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WhatsApp ${res.status} ${path}: ${text}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

type SendResponse = {
  messages?: { id: string }[];
};

// Outbound-Template: erster Kontakt mit dem Lead, BEVOR das 24h-Service-Window
// geöffnet ist. Das Template muss im Meta-Manager genehmigt sein.
// Parameter werden positional als {{1}}, {{2}}, … in der Template-Body ersetzt.
export async function sendTemplate(opts: {
  to: string;
  templateName?: string;
  lang?: string;
  parameters?: string[];
}): Promise<{ wamid: string | null }> {
  const phoneId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  const name = opts.templateName || process.env.WHATSAPP_TEMPLATE_NAME || "pkv_intro_v1";
  const lang = opts.lang || process.env.WHATSAPP_TEMPLATE_LANG || "de";
  const body = {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "template",
    template: {
      name,
      language: { code: lang },
      components:
        opts.parameters && opts.parameters.length > 0
          ? [
              {
                type: "body",
                parameters: opts.parameters.map((p) => ({
                  type: "text",
                  text: p,
                })),
              },
            ]
          : undefined,
    },
  };
  const res = (await postGraph(`${phoneId}/messages`, body)) as SendResponse;
  return { wamid: res?.messages?.[0]?.id ?? null };
}

// Freitext im offenen 24h-Service-Window. Wird vom Bot nach jeder Lead-Antwort
// gerufen, um die nächste Frage / das Abschluss-Statement zu schicken.
export async function sendText(opts: {
  to: string;
  body: string;
}): Promise<{ wamid: string | null }> {
  const phoneId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  // WhatsApp-Limit: 4096 Zeichen pro Text-Nachricht.
  const text = opts.body.slice(0, 4090);
  const res = (await postGraph(`${phoneId}/messages`, {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "text",
    text: { body: text, preview_url: false },
  })) as SendResponse;
  return { wamid: res?.messages?.[0]?.id ?? null };
}

// Bestätigt dem Lead, dass seine Nachricht gelesen wurde — schaltet die
// zwei blauen Häkchen frei. Optional aber nützlich für UX.
export async function markAsRead(messageId: string): Promise<void> {
  const phoneId = requireEnv("WHATSAPP_PHONE_NUMBER_ID");
  try {
    await postGraph(`${phoneId}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  } catch (err) {
    // Read-Receipts sind kosmetisch — Fehler nicht eskalieren.
    console.warn("[whatsapp] markAsRead failed:", err);
  }
}

// X-Hub-Signature-256-Verifizierung: Meta signiert jeden Webhook-POST mit dem
// App-Secret. Wir vergleichen timing-safe gegen das raw body.
export function verifyWebhookSignature(opts: {
  rawBody: string;
  signatureHeader: string | null;
}): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    // Ohne konfiguriertes Secret können wir nicht verifizieren — Fail-Closed.
    // (Anders als bei Telegram, wo ein Header-Token reicht: Meta liefert
    // nur die Signatur, kein Custom-Header.)
    console.warn("[whatsapp] WHATSAPP_APP_SECRET nicht gesetzt → reject.");
    return false;
  }
  if (!opts.signatureHeader) return false;
  // Header-Format: "sha256=<hexdigest>"
  const expected = createHmac("sha256", secret)
    .update(opts.rawBody, "utf8")
    .digest("hex");
  const got = opts.signatureHeader.startsWith("sha256=")
    ? opts.signatureHeader.slice("sha256=".length)
    : opts.signatureHeader;
  if (got.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(got, "hex"),
      Buffer.from(expected, "hex"),
    );
  } catch {
    return false;
  }
}

// GET-Webhook-Verify-Challenge: Meta hängt beim Speichern der Webhook-URL
// die Query-Parameter „hub.mode", „hub.verify_token" und „hub.challenge" an
// und erwartet den Challenge-String im Body, wenn der Token stimmt.
export function handleVerifyChallenge(url: URL): {
  ok: boolean;
  challenge: string | null;
} {
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    return { ok: true, challenge };
  }
  return { ok: false, challenge: null };
}

// ─── Inbound-Payload-Parser ────────────────────────────────────────────

// Vereinfachte Sicht aufs WhatsApp-Webhook-Schema. Wir interessieren uns nur
// für eingehende Text-Nachrichten und ignorieren Stati (sent/delivered/read),
// Medien, Reactions, Templates.
export type InboundMessage = {
  from: string; // E.164 ohne führendes +? (WhatsApp schickt ohne +!)
  wamid: string;
  text: string;
  timestamp: number; // unix seconds
};

type WebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: {
          from?: string;
          id?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
          button?: { text?: string };
          interactive?: {
            button_reply?: { title?: string };
            list_reply?: { title?: string };
          };
        }[];
      };
    }[];
  }[];
};

// Extrahiert alle eingehenden Text-Nachrichten aus einem Webhook-POST.
// Webhooks können mehrere entries / changes / messages bündeln.
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const p = payload as WebhookPayload;
  for (const entry of p.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        if (!msg.from || !msg.id) continue;
        // Wir akzeptieren Text + Button-Reply + Interactive-Reply als Antwort.
        const text =
          msg.text?.body ??
          msg.button?.text ??
          msg.interactive?.button_reply?.title ??
          msg.interactive?.list_reply?.title ??
          null;
        if (!text) continue;
        out.push({
          from: msg.from.startsWith("+") ? msg.from : `+${msg.from}`,
          wamid: msg.id,
          text: text.trim(),
          timestamp: msg.timestamp ? Number.parseInt(msg.timestamp, 10) : Date.now() / 1000,
        });
      }
    }
  }
  return out;
}
