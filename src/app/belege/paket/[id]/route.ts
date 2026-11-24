import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { checkLimit } from "@/lib/rate-limit";
import { paketLinkGueltig } from "@/lib/belege/paket-link";

// Belegpaket als ZIP für das Steuerbüro (Ole, 24.11.2026: Download-Link statt vieler Mails). Ohne Login, nur mit
// signiertem Link (Ablauf 30 Tage). Enthält genau die beim Versand festgehaltenen Belege samt Liste und USt-Vorschau.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  const id = (await ctx.params).id;
  const url = new URL(req.url);
  if (!paketLinkGueltig(id, url.searchParams.get("e"), url.searchParams.get("t"))) {
    return new Response("Dieser Link ist ungültig oder abgelaufen. Bitte fordern Sie bei Ole Kannapinn einen neuen an.", { status: 403, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
  if (!checkLimit("opsAktion", `paket:${id}`).ok) return new Response("Zu viele Abrufe, bitte später erneut.", { status: 429 });
  const paket = await prisma.belegPaket.findUnique({ where: { id }, select: { titel: true, belegIds: true } });
  if (!paket) return new Response("Paket nicht gefunden.", { status: 404 });
  const { belegPaketZip } = await import("@/lib/belege/monatspaket");
  const zip = await belegPaketZip(paket.belegIds, paket.titel);
  await prisma.belegPaket.update({ where: { id }, data: { abgerufen: { increment: 1 } } });
  await audit("belege.paket_abgerufen", { entity: "BelegPaket", entityId: id, actor: { role: "system", email: "download-link" } });
  const name = `Belege Ole Kannapinn UG ${paket.titel}.zip`.replace(/[^\w .äöüÄÖÜß-]/g, "");
  return new Response(new Uint8Array(zip), {
    headers: { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "private, no-store" },
  });
}
