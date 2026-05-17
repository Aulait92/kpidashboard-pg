// Telegram Bot API Wrapper. Bot wird via @BotFather erstellt; das Token
// landet in TELEGRAM_BOT_TOKEN (Format: 123456:ABC-DEF…).
//
// Webhook-Registrierung (einmalig, nach Deploy):
//   curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
//        -d url="https://kpi.performancegrowth.de/api/telegram/webhook" \
//        -d secret_token="<TELEGRAM_WEBHOOK_SECRET>" \
//        --data-urlencode 'allowed_updates=["message","callback_query"]'

const TG_API = "https://api.telegram.org";

function getToken(): string {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  if (!t) throw new Error("TELEGRAM_BOT_TOKEN nicht gesetzt.");
  return t;
}

async function tg(
  method: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`${TG_API}/bot${getToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Telegram ${method} ${res.status}: ${text}`);
  }
  const data = JSON.parse(text) as { ok: boolean; result?: unknown };
  if (!data.ok) {
    throw new Error(`Telegram ${method} not-ok: ${text}`);
  }
  return data.result;
}

// HTML-Escape für sicheres parse_mode=HTML.
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function sendTelegramText(opts: {
  chatId: number | string;
  text: string;
}): Promise<{ messageId: number }> {
  const result = (await tg("sendMessage", {
    chat_id: opts.chatId,
    text: opts.text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  })) as { message_id: number };
  return { messageId: result.message_id };
}

export type InlineButton = { text: string; callbackData: string };

// Sendet ein Foto mit Caption + Inline-Keyboard (Buttons). Im Gegensatz zu
// WhatsApp gibt es keine 3er-Limitierung; trotzdem bauen wir die Buttons
// in eine Zeile damit's auf dem Phone passt.
export async function sendTelegramPhotoWithButtons(opts: {
  chatId: number | string;
  photoUrl: string;
  caption: string; // schon HTML-escaped erwartet
  buttons: InlineButton[];
}): Promise<{ messageId: number }> {
  // Telegram-Callback-Data max 64 Bytes — bei "approve:<cuid>" passt das.
  for (const b of opts.buttons) {
    if (Buffer.byteLength(b.callbackData, "utf8") > 64) {
      throw new Error(
        `callback_data zu lang (>64 byte): ${b.callbackData}`,
      );
    }
  }

  const keyboard = [
    opts.buttons.map((b) => ({
      text: b.text,
      callback_data: b.callbackData,
    })),
  ];

  const result = (await tg("sendPhoto", {
    chat_id: opts.chatId,
    photo: opts.photoUrl,
    caption: opts.caption.slice(0, 1024),
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: keyboard },
  })) as { message_id: number };
  return { messageId: result.message_id };
}

// Bestätigt eine Button-Klick-Callback (entfernt die Lade-Animation am Button).
export async function answerCallbackQuery(opts: {
  callbackQueryId: string;
  text?: string;
}): Promise<void> {
  try {
    await tg("answerCallbackQuery", {
      callback_query_id: opts.callbackQueryId,
      text: opts.text,
    });
  } catch {
    // Best-effort; Fehler ignorieren.
  }
}

// Entfernt die Buttons unter einer Nachricht, nachdem eine Aktion ausgeführt
// wurde — verhindert dass der Admin versehentlich doppelt klickt.
export async function clearTelegramKeyboard(opts: {
  chatId: number | string;
  messageId: number | string;
}): Promise<void> {
  try {
    await tg("editMessageReplyMarkup", {
      chat_id: opts.chatId,
      message_id: opts.messageId,
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    // Best-effort.
  }
}
