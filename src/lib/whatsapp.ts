// WhatsApp Cloud API Wrapper. Sendet Nachrichten via Graph API,
// validiert eingehende Webhooks.

const GRAPH_VERSION = "v22.0";

function getPhoneNumberId(): string {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID nicht gesetzt.");
  return id;
}

function getAccessToken(): string {
  const t = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!t) throw new Error("WHATSAPP_ACCESS_TOKEN nicht gesetzt.");
  return t;
}

async function callGraph(
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${getAccessToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`WhatsApp ${path} ${res.status}: ${text}`);
  }
  return JSON.parse(text) as unknown;
}

export async function sendWhatsAppText(opts: {
  to: string;
  body: string;
}): Promise<{ messageId: string }> {
  const resp = (await callGraph(`${getPhoneNumberId()}/messages`, {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "text",
    text: { body: opts.body, preview_url: false },
  })) as { messages?: { id: string }[] };
  return { messageId: resp.messages?.[0]?.id ?? "" };
}

// Sendet ein Bild + Caption + bis zu 3 Reply-Buttons. Die Button-IDs
// können wir in der Webhook-Empfangs-Logik nutzen, um die Variante zu
// identifizieren (z.B. "approve:variantId").
export async function sendWhatsAppImageWithButtons(opts: {
  to: string;
  imageUrl: string;
  caption: string;
  buttons: { id: string; title: string }[];
}): Promise<{ messageId: string }> {
  if (opts.buttons.length === 0 || opts.buttons.length > 3) {
    throw new Error("WhatsApp Reply-Buttons: 1-3 erlaubt.");
  }
  // Button-Titel sind auf 20 Zeichen begrenzt.
  for (const b of opts.buttons) {
    if (b.title.length > 20) {
      throw new Error(
        `Button-Titel "${b.title}" ist länger als 20 Zeichen.`,
      );
    }
  }

  const resp = (await callGraph(`${getPhoneNumberId()}/messages`, {
    messaging_product: "whatsapp",
    to: opts.to,
    type: "interactive",
    interactive: {
      type: "button",
      header: { type: "image", image: { link: opts.imageUrl } },
      body: { text: opts.caption.slice(0, 1024) },
      action: {
        buttons: opts.buttons.map((b) => ({
          type: "reply",
          reply: { id: b.id, title: b.title },
        })),
      },
    },
  })) as { messages?: { id: string }[] };
  return { messageId: resp.messages?.[0]?.id ?? "" };
}

// Markiert eine eingegangene Nachricht als gelesen — Höflichkeit gegenüber
// dem Empfänger und vermeidet "doppelt empfangen"-Glitches.
export async function markAsRead(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    await callGraph(`${getPhoneNumberId()}/messages`, {
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  } catch {
    // Lesebestätigungen sind best-effort; Fehler ignorieren.
  }
}
