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
