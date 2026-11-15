import { prisma } from "@/lib/prisma";

// Hochgeladene Erstinformation (PDF) eines Vermittlers, öffentlich über den Token (lib/erstinformation.ts).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{6,64}$/.test(token)) return new Response("Nicht gefunden", { status: 404 });
  const e = await prisma.erstinformation.findUnique({ where: { token }, select: { data: true, fileName: true } });
  if (!e?.data || !e.fileName) return new Response("Nicht gefunden", { status: 404 });
  const name = e.fileName.replace(/[^\w.\- ]+/g, "_");
  return new Response(new Uint8Array(e.data), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${name}"`,
      "cache-control": "public, max-age=300",
      "x-robots-tag": "noindex",
      "x-content-type-options": "nosniff",
    },
  });
}
