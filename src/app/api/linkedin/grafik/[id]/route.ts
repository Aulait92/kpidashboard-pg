import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { graphicResponse } from "@/lib/linkedin/graphic";

// Vorschau der Text-Grafik eines Entwurfs (nur Admin). ?t= überschreibt den Text (Live-Vorschau beim Bearbeiten).
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const { id } = await params;
  const override = new URL(req.url).searchParams.get("t");
  const post = override ? null : await prisma.linkedInPost.findUnique({ where: { id }, select: { graphic: true } });
  const text = (override ?? post?.graphic ?? "").trim();
  if (!text) return new Response("Keine Grafik.", { status: 404 });
  return graphicResponse(text.slice(0, 140));
}
