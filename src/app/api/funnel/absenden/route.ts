import { after, type NextRequest } from "next/server";
import { clientIp, limitResponse, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { gueltigeBesuchId } from "@/lib/funnel/host";
import { absenden } from "@/lib/funnel/server";
import { reportError } from "@/lib/monitoring";
import { PKV_TEXTE } from "@/lib/funnel/pkv-beitrag-texte";

// Absenden eines eigenen Funnels (lib/funnel): Prüfung, Lead in den Pay-per-Lead-Eingang (wie die Perspective-Leads),
// Verknüpfung Besucher → Lead, Conversions API nach der Antwort (nur mit Einwilligung). Bot-Schutz: Rate-Limit je IP,
// unsichtbares Feld, Mindestzeit seit dem Laden der Seite. Bots bekommen eine normale Antwort ohne Lead.
export const dynamic = "force-dynamic";

/** Schneller als das schafft kein Mensch 7 Fragen, Name und Kontakt */
const MIN_MS = 6_000;

export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  const limited = limitResponse("funnelAbsenden", ip, RATE_LIMIT_MESSAGE);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const besuchId = gueltigeBesuchId(typeof body.besuch === "string" ? body.besuch : null);
  if (!besuchId) return Response.json({ ok: false, fehler: {}, meldung: PKV_TEXTE.kontakt.fehlerSenden }, { status: 400 });

  const geladen = Number(body.geladen ?? 0);
  const dauer = geladen > 0 ? Date.now() - geladen : 0;
  const honeypot = String(body.hp ?? "").trim();
  if (dauer < MIN_MS || (honeypot && dauer < 20_000)) return Response.json({ ok: true, lead: false });

  const str = (v: unknown) => (typeof v === "string" ? v : null);
  try {
    const r = await absenden({
      funnel: String(body.funnel ?? ""),
      besuchId,
      antworten: body.antworten,
      quelle: body.quelle,
      eventId: str(body.eventId),
      metaEinwilligung: body.metaEinwilligung === true,
      fbc: req.cookies.get("_fbc")?.value ?? null,
      fbp: req.cookies.get("_fbp")?.value ?? null,
      fbclid: str((body.quelle as Record<string, unknown> | undefined)?.fbclid),
      ip,
      userAgent: req.headers.get("user-agent"),
      url: str(body.url),
    });
    if (!r.ok) return Response.json({ ok: false, fehler: r.fehler, abbruch: r.abbruch, schritt: r.schritt }, { status: 422 });
    if (r.meta) after(r.meta);
    if (r.mail) after(r.mail);
    // Dankeseite ohne Telefonnummer (Ole, 21.11.2026); die Nummer steht nur in der Mail „Dein Experte“
    return Response.json({ ok: true, lead: r.lead, experte: r.experte ? { name: r.experte.name, firma: r.experte.firma } : null });
  } catch (err) {
    reportError(err, "funnel-absenden");
    return Response.json({ ok: false, fehler: {}, meldung: PKV_TEXTE.kontakt.fehlerSenden }, { status: 500 });
  }
}
