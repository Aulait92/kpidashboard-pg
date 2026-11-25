import { getBuyerContext } from "@/lib/buyer-context";
import { ladeVermittlerDatei } from "@/lib/chat-dateien-vermittler";

// Datei aus dem eigenen WhatsApp-Chat öffnen (Vermittler, Ole 25.11.2026, lib/chat-dateien-vermittler.ts). Nur Logins, die
// den Chat sehen dürfen (Inhaber bzw. zuständiger Berater), nie Admin-Vorschau oder App-Demo, kein Support-Protokoll.
// Gesundheitsbezug ohne Zwei-Faktor-Login: zur Einrichtung und danach zurück in den Chat (wie die Policen-Ablage).
// PDF und Bilder öffnen im Browser, alles andere nur als Download (kein HTML aus fremden Dateien auf unserer Domain).
export const dynamic = "force-dynamic";

const text = (t: string, status: number) => new Response(t, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });

const INLINE = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  const ctx = await getBuyerContext();
  if (!ctx) return text("Nicht gefunden.", 404);
  const r = await ladeVermittlerDatei(ctx, id);
  if (!r.ok) {
    if (r.grund === "zwei_faktor") {
      const zurueck = encodeURIComponent(`/buyer/chats?c=${r.conversationId ?? ""}`);
      return new Response(null, { status: 303, headers: { Location: `/buyer/konto/sicherheit/zwei-faktor?zurueck=${zurueck}`, "Cache-Control": "private, no-store" } });
    }
    if (r.grund === "nicht_abrufbar") return text("Die Datei ist nicht mehr abrufbar (WhatsApp hält Dateien nur 30 Tage bereit). Bitte fragen Sie Ihren Kontakt, ob er sie noch einmal schickt.", 404);
    return text("Nicht gefunden.", 404);
  }
  const mime = r.mime.toLowerCase().split(";")[0].trim();
  const inline = INLINE.has(mime);
  const name = r.name.replace(/[\r\n"\\/]/g, "_");
  return new Response(new Uint8Array(r.data), {
    headers: {
      "Content-Type": inline ? mime : "application/octet-stream",
      "Content-Length": String(r.data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      ...(mime.startsWith("image/") ? { "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    },
  });
}
