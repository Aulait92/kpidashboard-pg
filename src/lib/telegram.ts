// Telegram Bot API Wrapper. Sendet Nachrichten, beantwortet Callback-Queries
// und validiert eingehende Webhooks via Secret-Token.
//
// Setup (einmalig):
//   1. @BotFather in Telegram öffnen → /newbot → Token kopieren → TELEGRAM_BOT_TOKEN
//   2. Eigene User-ID rausfinden: an @userinfobot schreiben → TELEGRAM_ADMIN_USER_ID
//      (bei 1:1-DM ist user.id == chat.id, deshalb funktioniert die Whitelist-Prüfung)
//   3. Webhook registrieren:
//      curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
//        -d "url=https://<deine-domain>/api/telegram/webhook" \
//        -d "secret_token=$TELEGRAM_WEBHOOK_SECRET" \
//        -d "allowed_updates=[\"message\",\"callback_query\"]"

const API_BASE = "https://api.telegram.org";

function getToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN nicht gesetzt.");
  return t;
}

async function callTelegram(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${API_BASE}/bot${getToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Telegram ${method} ${res.status}: ${text}`);
  }
  const json = JSON.parse(text) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram ${method} not ok: ${json.description}`);
  }
  return json.result;
}

// HTML-Sonderzeichen escapen für parse_mode="HTML".
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramText(opts: {
  chatId: string | number;
  text: string;
}): Promise<{ messageId: number }> {
  const result = (await callTelegram("sendMessage", {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  })) as { message_id: number };
  return { messageId: result.message_id };
}

// Sendet ein Bild + Caption + Inline-Buttons. `buttons` ist ein Array von
// Rows; jede Row ist ein Array von Buttons (1-3 Buttons pro Row sinnvoll
// auf Telegram-Display). callback_data max 64 Bytes.
export async function sendTelegramPhotoWithButtons(opts: {
  chatId: string | number;
  imageUrl: string;
  caption: string;
  buttons: { id: string; title: string }[][];
}): Promise<{ messageId: number }> {
  if (opts.buttons.length === 0) {
    throw new Error("Telegram Inline-Buttons: mindestens eine Row.");
  }
  for (const row of opts.buttons) {
    for (const b of row) {
      if (new TextEncoder().encode(b.id).length > 64) {
        throw new Error(`Button callback_data zu lang (>64 Bytes): ${b.id}`);
      }
    }
  }

  const result = (await callTelegram("sendPhoto", {
    chat_id: opts.chatId,
    photo: opts.imageUrl,
    caption: opts.caption.slice(0, 1024),
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: opts.buttons.map((row) =>
        row.map((b) => ({ text: b.title, callback_data: b.id })),
      ),
    },
  })) as { message_id: number };
  return { messageId: result.message_id };
}

// Sendet ein Video + Caption + Inline-Buttons. Telegram lädt das Video selbst
// von der angegebenen URL — keine direkte Upload-Größenbegrenzung von 50MB
// (URL-Pfad), nur die generellen Telegram-Limits (~50MB sicher).
export async function sendTelegramVideoWithButtons(opts: {
  chatId: string | number;
  videoUrl: string;
  caption: string;
  durationSec?: number;
  buttons: { id: string; title: string }[][];
}): Promise<{ messageId: number }> {
  if (opts.buttons.length === 0) {
    throw new Error("Telegram Inline-Buttons: mindestens eine Row.");
  }
  for (const row of opts.buttons) {
    for (const b of row) {
      if (new TextEncoder().encode(b.id).length > 64) {
        throw new Error(`Button callback_data zu lang (>64 Bytes): ${b.id}`);
      }
    }
  }
  const result = (await callTelegram("sendVideo", {
    chat_id: opts.chatId,
    video: opts.videoUrl,
    caption: opts.caption.slice(0, 1024),
    parse_mode: "HTML",
    supports_streaming: true,
    ...(opts.durationSec ? { duration: opts.durationSec } : {}),
    reply_markup: {
      inline_keyboard: opts.buttons.map((row) =>
        row.map((b) => ({ text: b.title, callback_data: b.id })),
      ),
    },
  })) as { message_id: number };
  return { messageId: result.message_id };
}

// Bestätigt einen Button-Klick — dismissed das Spinner-Icon im Client.
// Muss innerhalb von ~30s nach Empfang aufgerufen werden.
export async function answerCallbackQuery(opts: {
  callbackQueryId: string;
  text?: string;
}): Promise<void> {
  try {
    await callTelegram("answerCallbackQuery", {
      callback_query_id: opts.callbackQueryId,
      ...(opts.text ? { text: opts.text } : {}),
    });
  } catch {
    // Best-effort: Spinner-Acknowledge sollte den Flow nie blocken.
  }
}
