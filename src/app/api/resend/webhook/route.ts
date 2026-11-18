import { Resend } from "resend";
import { limitResponse } from "@/lib/rate-limit";
import { reportError } from "@/lib/monitoring";
import { verarbeiteResendEreignis } from "@/lib/mail/kontakt-mail";

// Resend-Webhooks (Ole, 15.11.2026): Zustellstatus der E-Mails an Leads und Bestandskunden im Kontaktverlauf
// (zugestellt, nicht zustellbar, als Spam gemeldet). Jede Nachricht wird über die Signatur geprüft
// (RESEND_WEBHOOK_SECRET, „whsec_…“ aus dem Resend-Dashboard); ungültige werden abgelehnt.
// Paket M2 (Ole, 18.11.2026): „email.received“ = Antwort an die Antwortadresse *@antwort.dein-beratungstermin.de
// (lib/mail/eingang.ts). Fehler, die eine Wiederholung lösen kann, antworten mit 500 (Resend versucht es erneut).
// Keine Inhalte in Logs oder Sentry.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request): Promise<Response> {
  const limited = limitResponse("webhook", "resend");
  if (limited) return limited;
  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) return new Response("Resend-Webhook nicht konfiguriert", { status: 503 });
  const id = req.headers.get("svix-id");
  const timestamp = req.headers.get("svix-timestamp");
  const signature = req.headers.get("svix-signature");
  if (!id || !timestamp || !signature) return new Response("Signatur fehlt", { status: 400 });
  const payload = await req.text();
  let event: { type?: string; created_at?: string; data?: { email_id?: string; to?: string[]; cc?: string[]; from?: string } };
  try {
    event = new Resend(process.env.RESEND_API_KEY || "re_webhook").webhooks.verify({ payload, headers: { id, timestamp, signature }, webhookSecret: secret }) as typeof event;
  } catch {
    return new Response("Ungültige Signatur", { status: 400 });
  }
  try {
    if (event.type === "email.received") {
      const { verarbeiteMailEingang } = await import("@/lib/mail/eingang");
      const r = await verarbeiteMailEingang(event);
      return Response.json({ received: true, ergebnis: r.ergebnis });
    }
    await verarbeiteResendEreignis(event);
  } catch (err) {
    reportError(err, "resend-webhook", { type: event.type ?? "" });
    return new Response("Fehler bei der Verarbeitung", { status: 500 });
  }
  return Response.json({ received: true });
}
