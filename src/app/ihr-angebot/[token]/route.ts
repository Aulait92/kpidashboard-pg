import { ladeAngebotDatei } from "@/lib/angebot-senden-server";

// [Angebot ansehen] aus der WhatsApp bzw. E-Mail nach dem Termin (Paket P3, Ole 17.11.2026): das PDF der Gesellschaft,
// das der Vermittler hochgeladen hat (Dokumente am Kontakt). Geheimer Link je Termin, 60 Tage gültig.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const f = await ladeAngebotDatei(token);
  if (!f) {
    return new Response("Dieser Link ist abgelaufen oder ungültig. Bitte fragen Sie Ihren Berater nach einem neuen Link.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  const inline = f.contentType === "application/pdf" || f.contentType.startsWith("image/");
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": f.contentType,
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
