import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateCreatives,
  parseIntent,
  type ParsedIntent,
} from "@/lib/creative-gen";
import { publishVariantToCampaign } from "@/lib/meta-ads";
import {
  answerCallbackQuery,
  clearTelegramKeyboard,
  escapeHtml,
  sendTelegramPhotoWithButtons,
  sendTelegramText,
} from "@/lib/telegram";

// Telegram-Webhook. POST von Telegram-Servern. Optional via Secret-Token
// abgesichert (gesetzt beim setWebhook-Call, Header X-Telegram-Bot-Api-Secret-Token).
export async function POST(req: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (expectedSecret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== expectedSecret) {
      return new Response("forbidden", { status: 403 });
    }
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Sofort 200 quittieren, async weiterverarbeiten — Telegram retried
  // Updates wenn Antwort >5s dauert.
  process.nextTick(() => {
    handleUpdate(update).catch((err) => {
      console.error("[telegram] webhook handling failed:", err);
    });
  });

  return NextResponse.json({ ok: true });
}

// ─── Update-Types ────────────────────────────────────────────────────

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    from?: { id: number };
    chat: { id: number; type: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
};

// ─── Router ──────────────────────────────────────────────────────────

async function handleUpdate(update: TelegramUpdate) {
  console.log(
    `[telegram] update received: ${JSON.stringify({
      hasMessage: !!update.message,
      hasCallback: !!update.callback_query,
      from: update.message?.from?.id ?? update.callback_query?.from.id,
      text: update.message?.text?.slice(0, 80),
      callbackData: update.callback_query?.data,
    })}`,
  );
  if (update.callback_query) {
    await handleCallback(update.callback_query);
    return;
  }
  if (update.message?.text) {
    await handleText(update.message);
    return;
  }
}

function isAdmin(userId: number): boolean {
  const adminId = process.env.TELEGRAM_ADMIN_USER_ID;
  if (!adminId) {
    console.warn("[telegram] TELEGRAM_ADMIN_USER_ID not set — rejecting all.");
    return false;
  }
  const match = String(userId) === adminId.trim();
  if (!match) {
    console.warn(
      `[telegram] non-admin user blocked: got userId=${userId}, expected=${adminId.trim()}`,
    );
  }
  return match;
}

// ─── Text-Commands ───────────────────────────────────────────────────

async function handleText(
  msg: NonNullable<TelegramUpdate["message"]>,
): Promise<void> {
  const userId = msg.from?.id;
  const chatId = msg.chat.id;
  if (!userId || !isAdmin(userId)) {
    // Stille Whitelist — keine Antwort, damit Fremde nicht wissen dass es
    // einen Bot gibt.
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

  // Slash-Commands
  if (text.startsWith("/start") || text.startsWith("/help")) {
    await sendTelegramText({
      chatId,
      text:
        "🎨 <b>Creative-Bot</b>\n\n" +
        "Schicke mir z.B.:\n" +
        "• <code>3 Creatives für Wechsel</code>\n" +
        "• <code>2 Creatives für Neugeschäft, Selbstständige, Pain-Point-Tone</code>\n\n" +
        "Ich generiere Headline + Body + Bild (Flux 1.1 Pro) und sende dir jede Variante mit ✅/❌/🔄-Buttons. Bei ✅ geht die Anzeige <b>direkt live</b> in der passenden Meta-Kampagne.",
    });
    return;
  }

  // Intent parsen
  let intent: ParsedIntent;
  try {
    intent = await parseIntent(text);
  } catch (err) {
    await sendTelegramText({
      chatId,
      text: `❌ Intent-Parsing fehlgeschlagen: ${escapeHtml(
        err instanceof Error ? err.message : "unbekannt",
      )}`,
    });
    return;
  }

  if (intent.action !== "generate") {
    await sendTelegramText({
      chatId,
      text:
        "🤔 Ich habe das nicht verstanden. Versuch z.B.:\n\n" +
        "<code>3 Creatives für Wechsel</code>\n" +
        "<code>2 Creatives für Neugeschäft</code>",
    });
    return;
  }

  if (!intent.campaignKey) {
    await sendTelegramText({
      chatId,
      text: "🤔 Welche Kampagne? Bitte <code>Wechsel</code> oder <code>Neugeschäft</code> erwähnen.",
    });
    return;
  }

  const count = Math.max(1, Math.min(5, intent.count || 1));

  await sendTelegramText({
    chatId,
    text: `🎨 Generiere ${count} ${count === 1 ? "Creative" : "Creatives"} für <b>${escapeHtml(
      intent.campaignKey,
    )}</b>… (ca. 60 Sek)`,
  });

  let request;
  try {
    request = await prisma.creativeRequest.create({
      data: {
        telegramChatId: String(chatId),
        rawPrompt: text,
        parsedIntent: intent,
        status: "generating",
      },
    });
  } catch (err) {
    await sendTelegramText({
      chatId,
      text: `❌ DB-Fehler: ${escapeHtml(
        err instanceof Error ? err.message : "unbekannt",
      )}`,
    });
    return;
  }

  try {
    const creatives = await generateCreatives(
      {
        campaignKey: intent.campaignKey,
        audience: intent.audience,
        tone: intent.tone,
        count,
      },
      request.id,
    );

    for (let i = 0; i < creatives.length; i++) {
      const c = creatives[i];
      const variant = await prisma.creativeVariant.create({
        data: {
          requestId: request.id,
          index: i + 1,
          headline: c.headline,
          body: c.body,
          cta: c.cta,
          imagePrompt: c.imagePrompt,
          imageUrl: c.imageUrl,
          status: "pending",
        },
      });

      const caption =
        `<b>${escapeHtml(c.headline)}</b>\n\n` +
        `${escapeHtml(c.body)}\n\n` +
        `<i>CTA:</i> ${escapeHtml(c.cta)}`;

      const { messageId } = await sendTelegramPhotoWithButtons({
        chatId,
        photoUrl: c.imageUrl,
        caption,
        buttons: [
          { text: "✅ Live", callbackData: `approve:${variant.id}` },
          { text: "❌ Verwerfen", callbackData: `reject:${variant.id}` },
          { text: "🔄 Neu", callbackData: `redo:${variant.id}` },
        ],
      });

      await prisma.creativeVariant.update({
        where: { id: variant.id },
        data: { telegramMsgId: String(messageId) },
      });
    }

    await prisma.creativeRequest.update({
      where: { id: request.id },
      data: { status: "completed" },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unbekannt";
    await prisma.creativeRequest.update({
      where: { id: request.id },
      data: { status: "failed" },
    });
    await sendTelegramText({
      chatId,
      text: `❌ Generation fehlgeschlagen: ${escapeHtml(msg)}`,
    });
  }
}

// ─── Button-Callbacks ────────────────────────────────────────────────

async function handleCallback(
  cb: NonNullable<TelegramUpdate["callback_query"]>,
): Promise<void> {
  if (!isAdmin(cb.from.id)) {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: "Nicht autorisiert." });
    return;
  }

  const chatId = cb.message?.chat.id;
  const messageId = cb.message?.message_id;
  const data = cb.data ?? "";
  const [action, variantId] = data.split(":");

  if (!chatId || !action || !variantId) {
    await answerCallbackQuery({ callbackQueryId: cb.id, text: "Ungültig." });
    return;
  }

  const variant = await prisma.creativeVariant.findUnique({
    where: { id: variantId },
    include: { request: true },
  });

  if (!variant) {
    await answerCallbackQuery({
      callbackQueryId: cb.id,
      text: "Variante nicht gefunden.",
    });
    return;
  }

  if (action === "reject") {
    await prisma.creativeVariant.update({
      where: { id: variant.id },
      data: { status: "rejected" },
    });
    await answerCallbackQuery({ callbackQueryId: cb.id, text: "❌ Verworfen" });
    if (messageId) await clearTelegramKeyboard({ chatId, messageId });
    await sendTelegramText({
      chatId,
      text: `❌ Variante #${variant.index} verworfen.`,
    });
    return;
  }

  if (action === "redo") {
    await answerCallbackQuery({
      callbackQueryId: cb.id,
      text: "Schicke einfach einen neuen Generierungs-Befehl.",
    });
    const intent = (variant.request.parsedIntent ?? {}) as ParsedIntent;
    await sendTelegramText({
      chatId,
      text: `🔄 Schick z.B.: <code>1 neues Creative für ${escapeHtml(
        intent.campaignKey ?? "Wechsel",
      )}</code>`,
    });
    return;
  }

  if (action === "approve") {
    if (variant.status === "live") {
      await answerCallbackQuery({
        callbackQueryId: cb.id,
        text: "Bereits live.",
      });
      return;
    }

    // Klick sofort quittieren, dann lange Operation.
    await answerCallbackQuery({
      callbackQueryId: cb.id,
      text: "🚀 Geht live…",
    });
    if (messageId) await clearTelegramKeyboard({ chatId, messageId });

    await sendTelegramText({
      chatId,
      text: `🚀 Baue Variante #${variant.index} in Kampagne ein…`,
    });

    try {
      const intent = (variant.request.parsedIntent ?? {}) as ParsedIntent;
      const result = await publishVariantToCampaign({
        campaignKey: intent.campaignKey ?? "Wechsel",
        headline: variant.headline,
        body: variant.body,
        cta: variant.cta,
        imageUrl: variant.imageUrl,
        activate: true,
      });
      await prisma.creativeVariant.update({
        where: { id: variant.id },
        data: {
          status: "live",
          approvedAt: new Date(),
          metaCampaignId: result.campaignId,
          metaAdId: result.adId,
          metaImageHash: result.imageHash,
        },
      });
      await sendTelegramText({
        chatId,
        text:
          `✅ <b>Live!</b>\n\n` +
          `Ad-ID: <code>${escapeHtml(result.adId)}</code>\n` +
          `<a href="https://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${encodeURIComponent(result.adId)}">In Ads Manager öffnen</a>`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unbekannt";
      await prisma.creativeVariant.update({
        where: { id: variant.id },
        data: { status: "failed", errorMessage: msg },
      });
      await sendTelegramText({
        chatId,
        text: `❌ Live-Schaltung fehlgeschlagen: ${escapeHtml(msg)}`,
      });
    }
    return;
  }
}
