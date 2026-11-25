import { getCurrentSession } from "@/lib/auth";
import { pruefeZugriffToken } from "@/lib/support-zugriff-link";

// Support-Zugriff auf ein Dokument im Chat (Ole, 25.11.2026, lib/support-zugriff.ts): signierter Link, 15 Minuten gültig,
// nur für den angemeldeten Admin, der den Zugriff mit Grund ausgelöst hat. Protokoll und Mitteilung an den Vermittler
// sind vorher geschrieben. PDF und Bilder öffnen im Browser, alles andere nur als Download (kein HTML aus fremden
// Dateien auf unserer Domain). Pfad gilt in Sentry als geheim (lib/sentry-redact.ts).
export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function GET(_req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> {
  const token = decodeURIComponent((await ctx.params).token);
  const session = await getCurrentSession();
  const p = pruefeZugriffToken(token, session?.role === "ADMIN" ? session.userId : null);
  if (!p.ok) {
    if (p.grund === "abgelaufen") return text("Dieser Link ist abgelaufen (15 Minuten). Bitte im Chat erneut „Support-Zugriff“ wählen.", 410);
    if (p.grund === "fremd") return text("Nicht erlaubt: Der Link gilt nur für den Admin, der den Zugriff ausgelöst hat.", 403);
    return text("Dieser Link ist ungültig.", 403);
  }
  const { ladeZugriffInhalt } = await import("@/lib/support-zugriff");
  const inhalt = await ladeZugriffInhalt(p.zid);
  if (!inhalt) return text("Die Datei ist nicht mehr abrufbar (WhatsApp hält Dateien nur begrenzt bereit).", 404);
  const mime = inhalt.mime.toLowerCase().split(";")[0].trim();
  const inline = INLINE.has(mime);
  const name = inhalt.name.replace(/[\r\n"\\/]/g, "_");
  return new Response(new Uint8Array(inhalt.data), {
    headers: {
      "Content-Type": inline ? mime : "application/octet-stream",
      "Content-Length": String(inhalt.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(mime.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
