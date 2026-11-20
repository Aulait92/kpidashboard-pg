import { getCurrentSession } from "@/lib/auth";
import { finishBankConnection, syncConnection } from "@/lib/bank/server";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";

// Rückkehr von der Bank (Enable Banking): ?code=…&state=… oder ?error=…
// Nur für angemeldete Admins; state wird gegen die gespeicherte Anfrage geprüft.
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Start aus dem neuen Admin (Cookie, lib/admin-neu/ruecksprung.ts): zurück auf Zahlen → Kosten & Bank
  const back = (q: string) =>
    new Response(null, {
      status: 303,
      headers: [
        ["Location", new URL(ruecksprungZiel(`/admin/neu/zahlen/kosten/konten?${q}`, req.headers.get("cookie")), url).toString()],
        ["Set-Cookie", neuRuecksprungCookie(null)],
      ],
    });
  const session = await getCurrentSession().catch(() => null);
  if (!session || session.role !== "ADMIN") return Response.redirect(new URL(`/login?next=${encodeURIComponent("/admin/neu/zahlen/kosten/konten")}`, url), 303);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!code || !state) {
    const err = url.searchParams.get("error_description") ?? url.searchParams.get("error") ?? "Abgebrochen";
    return back(`fehler=${encodeURIComponent(err.slice(0, 200))}`);
  }
  const r = await finishBankConnection(code, state);
  if ("error" in r) return back(`fehler=${encodeURIComponent(r.error.slice(0, 200))}`);
  await audit("bank.connect", { entity: "BankConnection", entityId: r.connectionId, actor: { id: session.userId, email: session.email, role: session.role } });
  // Erster Abruf direkt (bis 90 Tage zurück); Fehler stehen danach auf der Seite
  await syncConnection(r.connectionId).catch((e: unknown) => reportError(e, "bank-first-sync"));
  return back("verbunden=1");
}
