import { prisma } from "@/lib/prisma";
import { sendWhatsAppMessage } from "@/lib/whatsapp/gateway";

// Termin-Erinnerungen per WhatsApp. Von cron-job.org (o. ä.) stündlich
// aufgerufen, per WHATSAPP_WEBHOOK_SECRET-Token gesichert. Schickt für jeden
// gebuchten Termin, der innerhalb des Vorlauf-Fensters startet und noch keine
// Erinnerung bekommen hat, eine WhatsApp-Nachricht und markiert ihn.
//
// Hinweis Produktion: Außerhalb des 24h-Service-Fensters verlangt WhatsApp eine
// vorab genehmigte Template-Nachricht. Für Sandbox/Pilot reicht Freitext; vor
// dem echten Rollout hier auf ein genehmigtes Template (sendTemplate) umstellen.
export const dynamic = "force-dynamic";

const LEAD_MS = 24 * 60 * 60 * 1000; // Erinnerung ~24h vorher

const BERLIN_TZ = "Europe/Berlin";
function formatDE(d: Date): string {
  return new Intl.DateTimeFormat("de-DE", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: BERLIN_TZ,
  }).format(d);
}

async function run(): Promise<Response> {
  const now = new Date();
  const until = new Date(now.getTime() + LEAD_MS);

  const due = await prisma.appointment.findMany({
    where: {
      status: "booked",
      reminderSentAt: null,
      startsAt: { gt: now, lte: until },
    },
    select: {
      id: true,
      customerId: true,
      conversationId: true,
      mode: true,
      startsAt: true,
      meetUrl: true,
    },
    take: 100,
  });

  let sent = 0;
  const errors: string[] = [];

  for (const appt of due) {
    if (!appt.conversationId) continue;
    const conv = await prisma.conversation.findUnique({
      where: { id: appt.conversationId },
      select: { contactPhone: true },
    });
    if (!conv?.contactPhone) continue;

    const when = formatDE(appt.startsAt);
    const body =
      appt.mode === "video"
        ? `Kurze Erinnerung an unseren Video-Termin am ${when} Uhr.` +
          (appt.meetUrl ? ` Hier der Link: ${appt.meetUrl}` : "") +
          " Bis gleich! 🙂"
        : `Kurze Erinnerung an unseren Telefon-Termin am ${when} Uhr. Wir rufen dich an — bis gleich! 🙂`;

    try {
      await sendWhatsAppMessage({
        customerId: appt.customerId,
        to: conv.contactPhone,
        body,
        sentBy: "bot",
      });
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      sent++;
    } catch (err) {
      errors.push(
        `${appt.id}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return Response.json({ ok: true, candidates: due.length, sent, errors });
}

function authorized(req: Request): boolean {
  const expected = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!expected) return false;
  const token =
    new URL(req.url).searchParams.get("token") ??
    req.headers.get("x-webhook-secret") ??
    "";
  return token === expected;
}

export async function POST(req: Request): Promise<Response> {
  if (!authorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}

// cron-job.org nutzt oft GET — daher beide Methoden erlauben.
export async function GET(req: Request): Promise<Response> {
  if (!authorized(req))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  return run();
}
