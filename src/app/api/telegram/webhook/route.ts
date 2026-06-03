import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateCreatives,
  generateVideoCreatives,
  parseIntent,
  regenerateAdText,
  regenerateCreativeImage,
  regenerateFbHeadline,
  type ParsedIntent,
} from "@/lib/creative-gen";
import { publishVariantToCampaign } from "@/lib/meta-ads";
import {
  answerCallbackQuery,
  escapeHtml,
  sendTelegramPhotoWithButtons,
  sendTelegramText,
  sendTelegramVideoWithButtons,
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
      text: `🤔 Ich habe das nicht verstanden. Versuch z.B.:\n\n„3 Creatives für Wechsel"\n„2 Creatives für Neugeschäft mit Fokus auf Selbstständige"\n„3 Creatives für Kinderwunsch Berlin"`,
    });
    return;
  }

  if (!intent.campaignKey) {
    await sendTelegramText({
      chatId,
      text: `🤔 Welche Kampagne? Bitte „Wechsel", „Neugeschäft" oder „Kinderwunsch <Region>" erwähnen.`,
    });
    return;
  }

  // Kinderwunsch läuft pro Region — ohne Region wüssten wir beim Push nicht,
  // in welche Regions-Kampagne das Creative soll.
  if (intent.campaignKey === "Kinderwunsch" && !intent.region) {
    await sendTelegramText({
      chatId,
      text: `🤔 Für Kinderwunsch brauche ich die Region. Z.B.: „3 Creatives für Kinderwunsch Berlin".`,
    });
    return;
  }

  const isVideo = intent.medium === "video";
  // Video-Generation ist deutlich langsamer (Sora-Polling) und teurer — auf
  // 5 Stück pro Anfrage cappen, damit ein Tippfehler kein Budget verbrennt.
  const maxCount = isVideo ? 5 : 20;
  const count = Math.max(1, Math.min(maxCount, intent.count || 1));

  await sendTelegramText({
    chatId,
    text: isVideo
      ? `🎬 Generiere ${count} ${count === 1 ? "Video" : "Videos"} für ${escapeHtml(
          intent.campaignKey,
        )}-Kampagne via Sora 2… (das dauert mehrere Minuten)`
      : `🎨 Generiere ${count} ${count === 1 ? "Creative" : "Creatives"} für ${escapeHtml(
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
    const briefArgs = {
      campaignKey: intent.campaignKey,
      audience: intent.audience,
      tone: intent.tone,
      count,
      medium: isVideo ? ("video" as const) : ("image" as const),
    };
    const creatives = isVideo
      ? await generateVideoCreatives(briefArgs, request.id, async (msg) => {
          // Lebenszeichen ins Telegram — Sora kann viele Minuten brauchen,
          // ohne Status-Updates wirkt der Bot eingefroren.
          try {
            await sendTelegramText({ chatId, text: `⏳ ${escapeHtml(msg)}` });
          } catch (err) {
            console.warn("[telegram] progress update failed:", err);
          }
        })
      : await generateCreatives(briefArgs, request.id);

    for (let i = 0; i < creatives.length; i++) {
      const c = creatives[i];
      const variant = await prisma.creativeVariant.create({
        data: {
          requestId: request.id,
          index: i + 1,
          headline: c.headline,
          body: c.body,
          cta: c.cta,
          adText: c.adText,
          fbHeadline: c.fbHeadline,
          mechanic: c.mechanic,
          imagePrompt: c.imagePrompt,
          imageUrl: c.imageUrl,
          kind: c.kind ?? "image",
          videoUrl: c.videoUrl ?? null,
          durationSec: c.durationSec ?? null,
          status: "pending",
        },
      });
      // Das generierte Creative-Konzept als eigene Nachricht ausgeben
      // (Caption-Limit von Fotos/Videos ist nur 1024 Zeichen — Konzept/
      // Storyboard kann deutlich länger sein).
      if (c.concept) {
        await sendTelegramText({
          chatId,
          text: `<b>${c.kind === "video" ? "Storyboard" : "Konzept"} Variante #${i + 1}</b>\n\n${escapeHtml(c.concept)}`,
        });
      }
      const caption = buildVariantCaption({
        fbHeadline: c.fbHeadline,
        adText: c.adText,
        index: i + 1,
        mechanic: c.mechanic,
      });
      const { messageId } =
        c.kind === "video" && c.videoUrl
          ? await sendTelegramVideoWithButtons({
              chatId,
              videoUrl: c.videoUrl,
              caption,
              durationSec: c.durationSec,
              buttons: variantButtons(variant.id),
            })
          : await sendTelegramPhotoWithButtons({
              chatId,
              imageUrl: c.imageUrl,
              caption,
              buttons: variantButtons(variant.id),
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

// ─── Caption + Button-Helpers ────────────────────────────────────────

function buildVariantCaption(opts: {
  fbHeadline: string;
  adText: string;
  index?: number;
  mechanic?: string;
}): string {
  const mechanicTag = opts.mechanic ? ` — <i>${escapeHtml(opts.mechanic)}</i>` : "";
  const prefix = opts.index ? `<b>Variante #${opts.index}</b>${mechanicTag}\n\n` : "";
  const headlineBlock = opts.fbHeadline
    ? `<b>Facebook-Headline:</b>\n${escapeHtml(opts.fbHeadline)}\n\n`
    : "";
  const adTextBlock = opts.adText
    ? `<b>Facebook-Text:</b>\n${escapeHtml(opts.adText)}`
    : "";
  const raw = prefix + headlineBlock + adTextBlock;
  return raw.length > 1024 ? raw.slice(0, 1021) + "…" : raw;
}

function variantButtons(variantId: string): { id: string; title: string }[][] {
  // Telegram-callback_data max 64 Bytes — cuid ist 25 Zeichen, locker.
  return [
    [
      { id: `approve:${variantId}`, title: "✅ Genehmigen" },
      { id: `regen_img:${variantId}`, title: "🖼 Bild neu" },
    ],
    [
      { id: `regen_text:${variantId}`, title: "📝 Text neu" },
      { id: `regen_head:${variantId}`, title: "🏷 Headline neu" },
    ],
  ];
}

// ─── Button-Klicks ───────────────────────────────────────────────────

async function handleButtonClick(chatId: string, data: string) {
  // Format: "<action>:<variantId>"
  // Actions: approve / reject / regen_text / regen_head
  const colonIdx = data.indexOf(":");
  if (colonIdx <= 0) return;
  const action = data.slice(0, colonIdx);
  const variantId = data.slice(colonIdx + 1);
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

  if (action === "regen_img") {
    const intent = (variant.request.parsedIntent ?? {}) as ParsedIntent;
    const campaignKey = intent.campaignKey ?? "Wechsel";
    await sendTelegramText({
      chatId,
      text: `🖼 Generiere neues Bild für Variante #${variant.index} (Texte bleiben)…`,
    });
    try {
      const result = await regenerateCreativeImage(
        {
          campaignKey,
          audience: intent.audience,
          tone: intent.tone,
          count: 1,
        },
        variant.requestId,
        {
          headline: variant.headline,
          body: variant.body,
          cta: variant.cta,
          mechanic: variant.mechanic,
          currentImagePrompt: variant.imagePrompt,
        },
      );
      await prisma.creativeVariant.update({
        where: { id: variant.id },
        data: {
          imageUrl: result.imageUrl,
          imagePrompt: result.imagePrompt,
        },
      });
      await sendTelegramPhotoWithButtons({
        chatId,
        imageUrl: result.imageUrl,
        caption: buildVariantCaption({
          fbHeadline: variant.fbHeadline,
          adText: variant.adText,
          index: variant.index,
          mechanic: variant.mechanic,
        }),
        buttons: variantButtons(variant.id),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unbekannt";
      await sendTelegramText({
        chatId,
        text: `❌ Bild-Regeneration fehlgeschlagen: ${escapeHtml(msg)}`,
      });
    }
    return;
  }

  if (action === "regen_text" || action === "regen_head") {
    const intent = (variant.request.parsedIntent ?? {}) as ParsedIntent;
    const campaignKey = intent.campaignKey ?? "Wechsel";
    await sendTelegramText({
      chatId,
      text:
        action === "regen_text"
          ? `📝 Generiere neuen Facebook-Text für #${variant.index}…`
          : `🏷 Generiere neue Facebook-Headline für #${variant.index}…`,
    });
    try {
      if (action === "regen_text") {
        const newAdText = await regenerateAdText({
          campaignKey,
          audience: intent.audience,
          tone: intent.tone,
          headline: variant.headline,
          body: variant.body,
          cta: variant.cta,
          currentAdText: variant.adText,
        });
        await prisma.creativeVariant.update({
          where: { id: variant.id },
          data: { adText: newAdText },
        });
        await sendTelegramPhotoWithButtons({
          chatId,
          imageUrl: variant.imageUrl,
          caption: buildVariantCaption({
            fbHeadline: variant.fbHeadline,
            adText: newAdText,
            index: variant.index,
            mechanic: variant.mechanic,
          }),
          buttons: variantButtons(variant.id),
        });
      } else {
        const newFbHeadline = await regenerateFbHeadline({
          campaignKey,
          audience: intent.audience,
          tone: intent.tone,
          headline: variant.headline,
          body: variant.body,
          cta: variant.cta,
          currentFbHeadline: variant.fbHeadline,
        });
        await prisma.creativeVariant.update({
          where: { id: variant.id },
          data: { fbHeadline: newFbHeadline },
        });
        await sendTelegramPhotoWithButtons({
          chatId,
          imageUrl: variant.imageUrl,
          caption: buildVariantCaption({
            fbHeadline: newFbHeadline,
            adText: variant.adText,
            index: variant.index,
            mechanic: variant.mechanic,
          }),
          buttons: variantButtons(variant.id),
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unbekannt";
      await sendTelegramText({
        chatId,
        text: `❌ Regeneration fehlgeschlagen: ${escapeHtml(msg)}`,
      });
    }
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
      const campaignKey = intent.campaignKey ?? "Wechsel";
      // Kinderwunsch hat eine eigene Landingpage — sonst landen Klicks im
      // PKV-Funnel (META_DEFAULT_LINK_URL).
      const linkUrl =
        campaignKey === "Kinderwunsch"
          ? "https://info.kinderwunschhilfe.org/ivf/"
          : undefined;
      const result = await publishVariantToCampaign({
        campaignKey,
        region: intent.region ?? null,
        linkUrl,
        headline: variant.headline,
        fbHeadline: variant.fbHeadline || variant.headline, // Fallback für alte Daten
        body: variant.body,
        adText: variant.adText || variant.body, // Fallback für alte Varianten ohne adText
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
