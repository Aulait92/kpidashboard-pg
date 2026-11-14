import { getBuyerContext } from "@/lib/buyer-context";
import { getAppUrl } from "@/lib/email";
import { berichtPdf, berichtPdfName } from "@/lib/monatsbericht/pdf";
import { prisma } from "@/lib/prisma";

// Monatsbericht als PDF: nur gesendete Berichte des eigenen Kunden, nur für Inhaber (wie die Zahlen-Seite).
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ctx = await getBuyerContext();
  if (!ctx || ctx.teamRole !== "owner") return new Response("Nicht gefunden.", { status: 404 });
  const { id } = await params;
  const r = await prisma.monthlyReport.findFirst({
    where: { id, customerId: ctx.customerId, status: "sent" },
    select: { month: true, body: true, sentAt: true, customer: { select: { name: true } } },
  });
  if (!r) return new Response("Nicht gefunden.", { status: 404 });
  const data = await berichtPdf(r, { customerName: r.customer.name, appUrl: getAppUrl() });
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(data.byteLength),
      "Content-Disposition": `attachment; filename="${berichtPdfName(r.month)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
