import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  generateCreatives,
  parseIntent,
  type ParsedIntent,
} from "@/lib/creative-gen";
import { publishVariantToCampaign } from "@/lib/meta-ads";
import {
  markAsRead,
  sendWhatsAppImageWithButtons,
  sendWhatsAppText,
} from "@/lib/whatsapp";

// Webhook-Verification (GET): Meta ruft diese Route mit einem Challenge-Token
// auf, wenn man im Developer Portal die URL einträgt.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    token === process.env.WHATSAPP_VERIFY_TOKEN &&
    challenge
  ) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

// Webhook-Receive (POST): Meta sendet eingehende Nachrichten und Button-Klicks.
export async function POST(req: Request) {
  let payload: WhatsAppWebhookPayload;
  try {
    payload = (await req.json()) as WhatsAppWebhookPayload;
  } catch {
    return NextResponse.json({ ok: true });
  }

  // Wir bestätigen erst sofort den Receipt, verarbeiten asynchron.
  // Meta erwartet 200 innerhalb weniger Sekunden, sonst werden Retries
  // gefeuert.
  process.nextTick(() => {
    handleWebhookAsync(payload).catch((err) => {
      console.error("[whatsapp] webhook handling failed:", err);
    });
  });

  return NextResponse.json({ ok: true });
}

// ─── Async Handler ────────────────────────────────────────────────────

type WhatsAppMessage = {
  from: string;
  id: string;
  type: "text" | "interactive" | string;
  text?: { body: string };
  interactive?: {
    type: "button_reply" | string;
    button_reply?: { id: string; title: string };
  };
};

type WhatsAppWebhookPayload = {
  entry?: {
    changes?: {
      value?: {
        messages?: WhatsAppMessage[];
      };
    }[];
  }[];
};

async function handleWebhookAsync(payload: WhatsAppWebhookPayload) {
  const messages: WhatsAppMessage[] = [];
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        messages.push(msg);
      }
    }
  }
  for (const msg of messages) {
    await routeMessage(msg);
  }
}

async function routeMessage(msg: WhatsAppMessage) {
  // Whitelist: nur die Admin-Nummer darf den Bot bedienen.
  const adminNumber = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminNumber || msg.from !== adminNumber) {
    // Ignorieren — kein verbaler Hinweis, weil Spammer dann wüssten dass es
    // einen Bot gibt.
    return;
  }

  await markAsRead(msg.id);

  if (msg.type === "interactive" && msg.interactive?.type === "button_reply") {
    await handleButtonClick(
      msg.from,
      msg.interactive.button_reply?.id ?? "",
      msg.interactive.button_reply?.title ?? "",
    );
    return;
  }

  if (msg.type === "text") {
    await handleTextCommand(msg.from, msg.text?.body ?? "");
    return;
  }
}

// ─── Text-Commands ────────────────────────────────────────────────────

async function handleTextCommand(from: string, text: string) {
  const trimmed = text.trim();
  if (!trimmed) return;

  // Intent via Claude parsen
  let intent: ParsedIntent;
  try {
    intent = await parseIntent(trimmed);
  } catch (err) {
    await sendWhatsAppText({
      to: from,
      body: `❌ Intent-Parsing fehlgeschlagen: ${
        err instanceof Error ? err.message : "unbekannt"
      }`,
    });
    return;
  }

  if (intent.action !== "generate") {
    await sendWhatsAppText({
      to: from,
      body: `🤔 Ich habe das nicht verstanden. Versuch z.B.:\n\n„3 Creatives für Wechsel"\n„2 Creatives für Neugeschäft mit Fokus auf Selbstständige"`,
    });
    return;
  }

  if (!intent.campaignKey) {
    await sendWhatsAppText({
      to: from,
      body: `🤔 Welche Kampagne? Bitte „Wechsel" oder „Neugeschäft" erwähnen.`,
    });
    return;
  }

  const count = Math.max(1, Math.min(5, intent.count || 1));

  await sendWhatsAppText({
    to: from,
    body: `🎨 Generiere ${count} ${count === 1 ? "Creative" : "Creatives"} für ${
      intent.campaignKey
    }-Kampagne… (ca. 60 Sek)`,
  });

  let request;
  try {
    request = await prisma.creativeRequest.create({
      data: {
        whatsappFrom: from,
        rawPrompt: trimmed,
        parsedIntent: intent,
        status: "generating",
      },
    });
  } catch (err) {
    await sendWhatsAppText({
      to: from,
      body: `❌ DB-Fehler beim Anlegen: ${
        err instanceof Error ? err.message : "unbekannt"
      }`,
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

    // Pro Variante: in DB speichern + via WhatsApp senden mit 3 Buttons
    for (let i = 0; i < creatives.length; i++) {
      const c = creatives[i];
      const caption = `*${c.headline}*\n\n${c.body}\n\nCTA: ${c.cta}`;
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
      const { messageId } = await sendWhatsAppImageWithButtons({
        to: from,
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
        data: { whatsappMsgId: messageId },
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
    await sendWhatsAppText({
      to: from,
      body: `❌ Generation fehlgeschlagen: ${msg}`,
    });
  }
}

// ─── Button-Klicks ───────────────────────────────────────────────────

async function handleButtonClick(from: string, id: string, _title: string) {
  // Format der Button-IDs: "approve:<variantId>" / "reject:<variantId>" / "redo:<variantId>"
  const [action, variantId] = id.split(":");
  if (!action || !variantId) return;

  const variant = await prisma.creativeVariant.findUnique({
    where: { id: variantId },
    include: { request: true },
  });
  if (!variant) {
    await sendWhatsAppText({
      to: from,
      body: `❌ Variante nicht gefunden (vielleicht alt?).`,
    });
    return;
  }

  if (action === "reject") {
    await prisma.creativeVariant.update({
      where: { id: variant.id },
      data: { status: "rejected" },
    });
    await sendWhatsAppText({
      to: from,
      body: `❌ Variante #${variant.index} abgelehnt.`,
    });
    return;
  }

  if (action === "redo") {
    await sendWhatsAppText({
      to: from,
      body: `🔄 Neu-Generation noch nicht implementiert — sende einfach „1 neues Creative für ${
        ((variant.request.parsedIntent ?? {}) as ParsedIntent).campaignKey ??
        "Wechsel"
      }"`,
    });
    return;
  }

  if (action === "approve") {
    if (variant.status === "live") {
      await sendWhatsAppText({
        to: from,
        body: `ℹ️ Variante #${variant.index} ist bereits live (Ad ${variant.metaAdId}).`,
      });
      return;
    }
    await sendWhatsAppText({
      to: from,
      body: `🚀 Baue Variante #${variant.index} in Kampagne ein…`,
    });
    try {
      const intent = (variant.request.parsedIntent ?? {}) as ParsedIntent;
      const result = await publishVariantToCampaign({
        campaignKey: intent.campaignKey ?? "Wechsel",
        headline: variant.headline,
        body: variant.body,
        cta: variant.cta,
        imageUrl: variant.imageUrl,
        activate: true, // direkt live
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
      await sendWhatsAppText({
        to: from,
        body: `✅ Live!\nAd: ${result.adId}\nhttps://business.facebook.com/adsmanager/manage/ads?selected_ad_ids=${result.adId}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unbekannt";
      await prisma.creativeVariant.update({
        where: { id: variant.id },
        data: { status: "failed", errorMessage: msg },
      });
      await sendWhatsAppText({
        to: from,
        body: `❌ Live-Schaltung fehlgeschlagen: ${msg}`,
      });
    }
    return;
  }
}
