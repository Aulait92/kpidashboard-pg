import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { leadScope } from "@/lib/team";
import { pruefeLink } from "@/lib/policen/ablage";
import { ladeUnterlage } from "@/lib/policen/server";

// Policen vom Kunden ausliefern (Rechtsprüfung A6): nur mit kurzlebigem signiertem Link (lib/policen/ablage.ts,
// 2 Minuten) UND demselben Login, der den Lead sehen darf. Jeder Abruf steht im Änderungsprotokoll (policen.abruf).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const d = pruefeLink(new URL(req.url).searchParams.get("t") ?? "");
  if (!d) return new Response("Link abgelaufen. Bitte die Unterlage in der App erneut öffnen.", { status: 410 });
  const ctx = await getBuyerContext();
  if (!ctx || ctx.demo || ctx.preview || ctx.userId !== d.userId) return new Response("Nicht gefunden.", { status: 404 });
  const lead = await prisma.lead.findFirst({ where: { id: d.leadId, ...leadScope(ctx) }, select: { id: true } });
  if (!lead) return new Response("Nicht gefunden.", { status: 404 });
  const doc = await ladeUnterlage(lead.id, d.docId, { customerId: ctx.customerId, preview: ctx.preview, userId: ctx.userId, email: ctx.email, download: d.download });
  if (!doc) return new Response("Nicht gefunden.", { status: 404 });
  // Zwei-Faktor-Login fehlt (AVV § 5) bzw. Virenprüfung steht aus oder hat angeschlagen
  if ("gesperrt" in doc) {
    if (doc.gesperrt === "zwei_faktor") {
      const zurueck = encodeURIComponent(`/buyer/leads/${lead.id}#dokumente`);
      return new Response(null, { status: 303, headers: { Location: `/buyer/konto/sicherheit/zwei-faktor?zurueck=${zurueck}`, "Cache-Control": "private, no-store" } });
    }
    const text =
      doc.gesperrt === "befund"
        ? "Diese Datei wurde bei der Virenprüfung abgelehnt und gelöscht. Ihr Kontakt wurde gebeten, sie neu zu schicken."
        : "Diese Datei wird noch auf Viren geprüft. Bitte versuchen Sie es in ein paar Minuten noch einmal.";
    return new Response(text, { status: doc.gesperrt === "befund" ? 410 : 409, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "private, no-store" } });
  }
  return new Response(new Uint8Array(doc.data), {
    headers: {
      "Content-Type": doc.mimeType,
      "Content-Length": String(doc.data.length),
      "Content-Disposition": `${d.download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
