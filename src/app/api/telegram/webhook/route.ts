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
  escapeHtml,
  sendTelegramPhotoWithButtons,
  sendTelegramText,
} from "@/lib/telegram";

// Webhook-Receive (POST). Telegram schickt mit jedem Update einen
// X-Telegram-Bot-Api-Secret-Token-Header, den wir bei setWebhook konfiguriert
// haben — wir verifizieren ihn hier.
export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== secret) {
      return new Response("forbidden", { status: 403 });
    }
  }

  let payload: TelegramUpdate;
  try {
    payload = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Sofort 200 antworten, async verarbeiten. Telegram retried bei langen
  // Antwortzeiten und kann Updates dann doppelt liefern.
  process.nextTick(() => {
    handleUpdateAsync(payload).catch((err) => {
      console.error("[telegram] update handling failed:", err);
    });
  });

  return NextResponse.json({ ok: true });
}

// ─── Async Handler ────────────────────────────────────────────────────

type TelegramUpdate = {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
};

type TelegramMessage = {
  message_id: number;
  from?: { id: number };
  chat: { id: number };
  text?: string;
};

type TelegramCallbackQuery = {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
};

async function handleUpdateAsync(update: TelegramUpdate) {
  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query);
    return;
  }
  if (update.message) {
    await handleMessage(update.message);
    return;
  }
}

function isAuthorized(chatId: number): boolean {
  const admin = process.env.TELEGRAM_ADMIN_USER_ID;
  if (!admin) return false;
  return String(chatId) === admin;
}

async function handleMessage(msg: TelegramMessage) {
  if (!isAuthorized(msg.chat.id)) return;
  const text = msg.text?.trim();
  if (!text) return;
  await handleTextCommand(String(msg.chat.id), text);
}

async function handleCallbackQuery(cq: TelegramCallbackQuery) {
  const chatId = cq.message?.chat.id;
  if (chatId === undefined || !isAuthorized(chatId)) return;

  // Spinner sofort dismissen.
  await answerCallbackQuery({ callbackQueryId: cq.id });

  await handleButtonClick(String(chatId), cq.data ?? "");
}

// ─── Text-Commands ────────────────────────────────────────────────────

async function handleTextCommand(chatId: string, text: string) {
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
      text: `🤔 Ich habe das nicht verstanden. Versuch z.B.:\n\n„3 Creatives für Wechsel"\n„2 Creatives für Neugeschäft mit Fokus auf Selbstständige"`,
    });
    return;
  }

  if (!intent.campaignKey) {
    await sendTelegramText({
      chatId,
      text: `🤔 Welche Kampagne? Bitte „Wechsel" oder „Neugeschäft" erwähnen.`,
    });
    return;
  }

  const count = Math.max(1, Math.min(5, intent.count || 1));

  await sendTelegramText({
    chatId,
    text: `🎨 Generiere ${count} ${count === 1 ? "Creative" : "Creatives"} für ${escapeHtml(
      intent.campaignKey,
    )}-Kampagne… (ca. 60 Sek)`,
  });

  let request;
  try {
    request = await prisma.creativeRequest.create({
      data: {
        telegramChatId: chatId,
        rawPrompt: text,
        parsedIntent: intent,
        status: "generating",
      },
    });
  } catch (err) {
    await sendTelegramText({
      chatId,
      text: `❌ DB-Fehler beim Anlegen: ${escapeHtml(
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
      const caption = `<b>${escapeHtml(c.headline)}</b>\n\n${escapeHtml(c.body)}\n\nCTA: ${escapeHtml(c.cta)}`;
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
      const { messageId } = await sendTelegramPhotoWithButtons({
        chatId,
        imageUrl: c.imageUrl,
        caption,
        buttons: [
          { id: `approve:${variant.id}`, title: "✅ Genehmigen" },
          { id: `reject:${variant.id}`, title: "❌ Ablehnen" },
          { id: `redo:${variant.id}`, title: "🔄 Neu" },
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

// ─── Button-Klicks ───────────────────────────────────────────────────

async function handleButtonClick(chatId: string, data: string) {
  // Format: "approve:<variantId>" / "reject:<variantId>" / "redo:<variantId>"
  const [action, variantId] = data.split(":");
  if (!action || !variantId) return;

  const variant = await prisma.creativeVariant.findUnique({
    where: { id: variantId },
    include: { request: true },
  });
  if (!variant) {
    await sendTelegramText({
      chatId,
      text: `❌ Variante nicht gefunden (vielleicht alt?).`,
    });
    return;
  }

  if (action === "reject") {
    await prisma.creativeVariant.update({
      where: { id: variant.id },
      data: { status: "rejected" },
    });
    await sendTelegramText({
      chatId,
      text: `❌ Variante #${variant.index} abgelehnt.`,
    });
    return;
  }

  if (action === "redo") {
    const campaignKey =
      ((variant.request.parsedIntent ?? {}) as ParsedIntent).campaignKey ??
      "Wechsel";
    await sendTelegramText({
      chatId,
      text: `🔄 Neu-Generation noch nicht implementiert — sende einfach „1 neues Creative für ${escapeHtml(campaignKey)}"`,
    });
    return;
  }

  if (action === "approve") {
    if (variant.status === "live") {
      await sendTelegramText({
        chatId,
        text: `ℹ️ Variante #${variant.index} ist bereits live (Ad ${escapeHtml(variant.metaAdId ?? "")}).`,
      });
      return;
    }
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
        text: `✅ Live!\nAd: ${escapeHtml(result.adId)}\nhttps://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${encodeURIComponent(result.adId)}`,
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
