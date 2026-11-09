import { stripeClient } from "@/lib/billing";
import { handleStripeEvent } from "@/lib/billing-webhook";
import { reportError } from "@/lib/monitoring";

// Stripe-Webhooks. Jede Nachricht wird über die Signatur geprüft
// (STRIPE_WEBHOOK_SECRET); ungültige werden abgelehnt.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const stripe = stripeClient();
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !secret) return new Response("Stripe nicht konfiguriert", { status: 503 });
  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Signatur fehlt", { status: 400 });
  const body = await req.text();
  let event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, secret);
  } catch {
    return new Response("Ungültige Signatur", { status: 400 });
  }
  try {
    await handleStripeEvent(event);
  } catch (err) {
    reportError(err, "stripe-webhook", { type: event.type });
    // 500 → Stripe stellt erneut zu. Das Ereignis wieder freigeben.
    const { prisma } = await import("@/lib/prisma");
    await prisma.stripeEvent.delete({ where: { id: event.id } }).catch(() => {});
    return new Response("Fehler bei der Verarbeitung", { status: 500 });
  }
  return Response.json({ received: true });
}
