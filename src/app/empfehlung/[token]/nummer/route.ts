import { loadReferralPage } from "@/lib/empfehlung/requests";
import { advisorVcard } from "@/lib/empfehlung/shared";
import { clientIp, limitResponse } from "@/lib/rate-limit";

// „Nummer speichern“ auf der Erfolgsseite der Kontaktseite (Paket 3, 20.11.2026): Kontaktkarte (vCard) des
// Vermittlers, damit die empfohlene Person den Rückruf erkennt. Nur bei gültigem Link und aktivem Modul.
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const limited = limitResponse("publicApi", `empfehlung-vcard:${clientIp(req.headers)}`);
  if (limited) return limited;
  const { token } = await params;
  const page = /^[\w-]{10,64}$/.test(token) ? await loadReferralPage(token).catch(() => null) : null;
  if (!page?.advisorPhone) return new Response("Dieser Link ist nicht mehr aktiv.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  const card = advisorVcard({ name: page.vertreter, phone: page.advisorPhone });
  const file = `${page.vertreter.replace(/[^\p{L}\p{N} ]/gu, "").trim().replace(/\s+/g, "-") || "kontakt"}.vcf`;
  return new Response(card, {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": `attachment; filename="kontakt.vcf"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "cache-control": "no-store",
    },
  });
}
