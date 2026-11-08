import { buildIcs, customerEventByToken } from "@/lib/calendar/add-to-calendar";

// Kalenderdatei (ICS) für den Lead: „Zum Kalender hinzufügen" auf iPhone,
// Outlook und Mac. Nur über den geheimen Verwaltungs-Token erreichbar.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;
  const ev = await customerEventByToken(token);
  if (!ev) return new Response("Termin nicht gefunden oder abgesagt.", { status: 404 });
  return new Response(buildIcs(ev), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="termin.ics"',
      "Cache-Control": "no-store",
    },
  });
}
