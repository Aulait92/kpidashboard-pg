import { bdSeitenPdf } from "@/lib/beratungsdoku-server";

// „Als PDF speichern“ auf der Seite /dokumentation/<token> (Paket B): bestätigte Fassung, sonst die gesendete.
// Nur lesen, solange die Seite gültig ist.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const f = await bdSeitenPdf(token).catch(() => null);
  if (!f) {
    return new Response("Dieser Link ist abgelaufen oder ungültig.", {
      status: 404,
      headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex, nofollow" },
    });
  }
  return new Response(new Uint8Array(f.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(f.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
