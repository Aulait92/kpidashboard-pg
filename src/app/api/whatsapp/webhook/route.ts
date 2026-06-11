import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  handleVerifyChallenge,
  markAsRead,
  parseInboundMessages,
  verifyWebhookSignature,
} from "@/lib/whatsapp";
import { handleInboundMessage } from "@/lib/whatsapp-conversation";

// GET-Verify: Meta ruft den Webhook beim Speichern in der App-Konfiguration
// mit ?hub.mode=subscribe&hub.verify_token=…&hub.challenge=… auf und
// erwartet den Challenge-String 1:1 als Body zurück.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const result = handleVerifyChallenge(url);
  if (!result.ok || !result.challenge) {
    return new Response("forbidden", { status: 403 });
  }
  return new Response(result.challenge, {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
}

// POST-Receive: Meta liefert Inbound-Messages + Statusupdates. Wir
// verifizieren die HMAC-Signatur gegen WHATSAPP_APP_SECRET, antworten
// sofort 200 und verarbeiten async (Meta retried bei langen Antworten).
export async function POST(req: Request) {
  // Raw body brauchen wir für die Signaturprüfung — JSON-Parsing erst danach.
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256");
  if (!verifyWebhookSignature({ rawBody, signatureHeader: signature })) {
    return new Response("forbidden", { status: 403 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: true });
  }

  process.nextTick(() => {
    handleInboundAsync(payload).catch((err) => {
      console.error("[whatsapp] inbound handling failed:", err);
    });
  });

  return NextResponse.json({ ok: true });
}

async function handleInboundAsync(payload: unknown): Promise<void> {
  const messages = parseInboundMessages(payload);
  if (messages.length === 0) return;

  for (const msg of messages) {
    // Idempotenz: wenn diese wamid schon mal gespeichert wurde, überspringen.
    // Meta liefert bei langen Antwortzeiten Updates mehrfach.
    const existing = await prisma.whatsappMessage.findUnique({
      where: { wamid: msg.wamid },
      select: { id: true },
    });
    if (existing) continue;

    // Conversation per Telefonnummer suchen. Existiert keine, legen wir eine
    // an — das deckt den Fall ab, dass der Lead von sich aus schreibt (z. B.
    // über wa.me-Link), bevor wir je ein Template gesendet haben.
    let conv = await prisma.whatsappConversation.findUnique({
      where: { phone: msg.from },
      select: { id: true, state: true },
    });
    if (!conv) {
      // Schauen, ob es einen Lead mit dieser Telefonnummer gibt — dann
      // an die Conversation hängen.
      const lead = await prisma.lead.findFirst({
        where: { phone: msg.from },
        orderBy: { createdAt: "desc" },
        select: { id: true, source: true },
      });
      const created = await prisma.whatsappConversation.create({
        data: {
          phone: msg.from,
          leadId: lead?.id ?? null,
          product: lead?.source ?? null,
          state: "qualifying",
        },
        select: { id: true, state: true },
      });
      conv = created;
    }

    await prisma.whatsappMessage.create({
      data: {
        conversationId: conv.id,
        direction: "in",
        wamid: msg.wamid,
        body: msg.text,
      },
    });

    // Read-Receipt (kosmetisch, asynchron).
    void markAsRead(msg.wamid);

    // Bot-Antwort erzeugen + senden.
    try {
      await handleInboundMessage({ conversationId: conv.id });
    } catch (err) {
      console.error(
        `[whatsapp] handleInboundMessage failed for conv ${conv.id}:`,
        err,
      );
    }
  }
}
