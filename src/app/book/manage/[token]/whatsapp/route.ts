import { NextResponse } from "next/server";
import { checkLimit } from "@/lib/rate-limit";
import { waWeiterKlick } from "@/lib/whatsapp/buchung-whatsapp";

// „Weiter auf WhatsApp“ von der Buchungsseite (Ole, 26.11.2026): Klick messen und zu wa.me mit vorbefülltem Text an die
// WhatsApp-Nummer des Vermittlers weiterleiten. Nur über den geheimen Verwaltungs-Token erreichbar.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await ctx.params;
  const zurueck = new URL(`/book/manage/${encodeURIComponent(token)}`, req.url);
  if (!checkLimit("publicBooking", `wa:${token}`).ok) return NextResponse.redirect(zurueck, 303);
  const link = await waWeiterKlick(token).catch(() => null);
  return NextResponse.redirect(link ?? zurueck, 303);
}
