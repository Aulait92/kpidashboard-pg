import { getCurrentSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// PDF einer HvK-Abrechnung anzeigen (nur Admins).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return new Response("Nicht erlaubt.", { status: 403 });
  const { id } = await params;
  const inv = await prisma.hvkInvoice.findUnique({ where: { id }, select: { pdf: true, pdfName: true, invoiceNo: true } });
  if (!inv) return new Response("Nicht gefunden.", { status: 404 });
  const name = inv.pdfName || `HvK-Abrechnung-${inv.invoiceNo}.pdf`;
  return new Response(new Uint8Array(inv.pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(inv.pdf.length),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
