import { getPresentation } from "@/lib/vertrieb/praesentationen";
import { ladeVerkaufsLink } from "@/lib/vertrieb/verkaufspraesentation-server";

// PDF zur Vertriebspräsentation (Unterlagen der Zielgruppe, Vertrieb → Unterlagen), nur mit gültigem Link.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const p = await ladeVerkaufsLink(token);
  const file = p ? await getPresentation(p.audience, "pdf") : null;
  if (!file) return new Response("Dieser Link ist abgelaufen oder ungültig.", { status: 404, headers: { "X-Robots-Tag": "noindex, nofollow" } });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow",
      "Referrer-Policy": "no-referrer",
    },
  });
}
