import { getCurrentSession } from "@/lib/auth";
import { getPresentation, isAudience, isFormat } from "@/lib/vertrieb/praesentationen";

// Download einer hinterlegten Präsentation (nur Admins).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ audience: string; format: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const { audience, format } = await params;
  if (!isAudience(audience) || !isFormat(format)) return new Response("Nicht gefunden.", { status: 404 });
  const file = await getPresentation(audience, format);
  if (!file) return new Response("Noch keine Datei hinterlegt.", { status: 404 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.contentType,
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
