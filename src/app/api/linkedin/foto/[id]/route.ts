import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Foto aus der LinkedIn-Fotoablage anzeigen (nur Admin).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const { id } = await params;
  const f = await prisma.linkedInPhoto.findUnique({ where: { id }, select: { data: true, contentType: true, size: true } });
  if (!f) return new Response("Nicht gefunden.", { status: 404 });
  return new Response(new Uint8Array(f.data), {
    headers: { "Content-Type": f.contentType, "Content-Length": String(f.size), "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
