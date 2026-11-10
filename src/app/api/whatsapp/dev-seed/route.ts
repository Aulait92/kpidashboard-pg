import { encryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { STARTER_PROMPT } from "@/lib/whatsapp/starter-prompt";

// NUR für den Sandbox-/Test-Deploy: legt einen Pilot-Kunden mit WhatsAppAccount
// (Sandbox-API-Key, app-seitig verschlüsselt) und aktivem KI-Agenten an, damit
// der Bot sofort antworten kann. Token-geschützt über WHATSAPP_WEBHOOK_SECRET.
// Vor dem echten Pilot/Produktion entfernen.
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<Response> {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!expected || token !== expected) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.DIALOG360_SANDBOX_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "DIALOG360_SANDBOX_API_KEY nicht gesetzt" },
      { status: 400 },
    );
  }

  const name = process.env.PILOT_CUSTOMER_NAME ?? "Sandbox-Pilot";
  const phoneNumberId = process.env.DIALOG360_SANDBOX_PHONE_NUMBER_ID ?? null;

  const customer = await prisma.customer.upsert({
    where: { name },
    create: { name },
    update: {},
    select: { id: true, name: true },
  });

  const account = await prisma.whatsAppAccount.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      provider: "360dialog",
      phoneNumberId,
      apiKeyEnc: encryptSecret(apiKey),
      status: "connected",
    },
    update: {
      phoneNumberId,
      apiKeyEnc: encryptSecret(apiKey),
      status: "connected",
    },
    select: { id: true, phoneNumberId: true, status: true },
  });

  const agent = await prisma.agentConfig.upsert({
    where: { customerId: customer.id },
    create: {
      customerId: customer.id,
      name: "Assistent",
      active: true,
      systemPrompt: STARTER_PROMPT,
      knowledge: "",
      personality: "freundlich, empathisch, überzeugend",
    },
    update: { active: true, systemPrompt: STARTER_PROMPT },
    select: { id: true, active: true },
  });

  return Response.json({ ok: true, customer, account, agent });
}
