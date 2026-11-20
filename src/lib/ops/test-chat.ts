// Diagnose „test-chat“ (Ole, 20.11.2026: „Bot antwortet wieder nicht“): letzte Nachrichten eines Chats, NUR für
// interne Kunden (Testchats von Ole, z. B. „Ole Agentur“). Richtung, Art, Absender, Status, Fehler, Zeit und die
// ersten 80 Zeichen; interne Merker nur mit Art und Anfang. Für echte Leads verweigert.
import { prisma } from "@/lib/prisma";

export async function testChatDiagnose(p: URLSearchParams) {
  const id = (p.get("id") ?? "").trim();
  if (!id) return { fehler: "id fehlt" };
  const conv = await prisma.conversation.findUnique({ where: { id }, select: { id: true, botActive: true, status: true, customer: { select: { name: true, plan: true } } } });
  if (!conv) return { fehler: "nicht gefunden" };
  if (conv.customer.plan !== "internal") return { fehler: "nur für interne Testchats" };
  const n = Math.min(60, Math.max(1, Number(p.get("n") ?? 25) || 25));
  const msgs = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "desc" },
    take: n,
    select: { createdAt: true, direction: true, kind: true, sentBy: true, status: true, errorCode: true, errorTitle: true, body: true },
  });
  return {
    kunde: conv.customer.name,
    botActive: conv.botActive,
    status: conv.status,
    nachrichten: msgs.reverse().map((m) => ({ at: m.createdAt, dir: m.direction, kind: m.kind, von: m.sentBy, status: m.status, fehler: m.errorCode ? `${m.errorCode} ${m.errorTitle ?? ""}` : null, text: (m.body ?? "").slice(0, 80) })),
  };
}
