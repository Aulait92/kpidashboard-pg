import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";
import { anhangErlaubt, ANHANG_LIMIT } from "@/lib/mail/eingang";

// Anhang einer Antwort per E-Mail herunterladen (Paket M2, lib/mail/eingang.ts). Die Datei liegt bei Resend; die App
// holt je Aufruf eine frische Download-Adresse (1 h gültig) und reicht die Datei durch. Nur für Logins, die den Kontakt
// sehen; gesperrte Dateitypen (Programme, Archive, Makros) nie. Immer als Download, nie im Browser geöffnet.
// Virenprüfung bei jedem Abruf (lib/sicherheit/virenpruefung.ts): nur „sauber“ wird ausgeliefert, Befund nie.
export const dynamic = "force-dynamic";

type Anhang = { id?: unknown; name?: unknown; typ?: unknown; erlaubt?: unknown; viren?: unknown };

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; eingangId: string; anhangId: string }> }): Promise<Response> {
  const { id, eingangId, anhangId } = await params;
  const ctx = await getBuyerContext();
  if (!ctx) return new Response("Nicht angemeldet.", { status: 401 });
  const lead = await prisma.lead.findFirst({ where: { id, erasedAt: null, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) return new Response("Nicht gefunden.", { status: 404 });
  const eingang = await prisma.mailEingang.findFirst({ where: { id: eingangId, leadId: lead.id }, select: { resendEmailId: true, anhaenge: true } });
  const meta = Array.isArray(eingang?.anhaenge) ? (eingang.anhaenge as Anhang[]).find((a) => a?.id === anhangId) : undefined;
  if (!eingang || !meta) return new Response("Nicht gefunden.", { status: 404 });
  const name = typeof meta.name === "string" && meta.name.trim() ? meta.name : "anhang";
  if (meta.erlaubt !== true || !anhangErlaubt(name, typeof meta.typ === "string" ? meta.typ : null)) return new Response("Dieser Dateityp wird aus Sicherheitsgründen nicht angeboten.", { status: 403 });
  if (meta.viren === "befund") return new Response("Dieser Anhang wurde bei der Virenprüfung abgelehnt.", { status: 403 });
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return new Response("E-Mail-Versand ist nicht eingerichtet.", { status: 503 });
  try {
    const { eingangApi } = await import("@/lib/mail/eingang-api");
    const api = eingangApi(apiKey);
    const a = await api.anhang(eingang.resendEmailId, anhangId);
    if (!a?.downloadUrl) return new Response("Der Anhang ist nicht mehr verfügbar.", { status: 410 });
    const data = await api.datei(a.downloadUrl, Math.max(ANHANG_LIMIT, 50 * 1024 * 1024));
    const { entscheide, pruefeAufViren } = await import("@/lib/sicherheit/virenpruefung");
    const e = await pruefeAufViren(data);
    const d = entscheide(e);
    if (d === "verwerfen") {
      const { audit } = await import("@/lib/audit");
      await audit("viren.befund", { entity: "MailEingang", entityId: eingangId, customerId: ctx.customerId, details: { quelle: "mail_download", signatur: e.status === "befund" ? e.signatur : null }, actor: { id: ctx.userId, role: "BUYER" } });
      return new Response("Dieser Anhang wurde bei der Virenprüfung abgelehnt.", { status: 403 });
    }
    if (d !== "annehmen") return new Response("Dieser Anhang wird noch auf Viren geprüft. Bitte versuchen Sie es später noch einmal.", { status: 409 });
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.length),
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name.replace(/[\\/\r\n"]/g, "_"))}`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    console.error("[mail-anhang] Abruf fehlgeschlagen");
    return new Response("Der Anhang konnte gerade nicht geladen werden. Bitte später erneut versuchen.", { status: 502 });
  }
}
