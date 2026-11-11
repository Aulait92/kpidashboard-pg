import { getCurrentSession } from "@/lib/auth";
import { finishBankConnection, syncConnection } from "@/lib/bank/server";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";

// Rückkehr von der Bank (Enable Banking): ?code=…&state=… oder ?error=…
// Nur für angemeldete Admins; state wird gegen die gespeicherte Anfrage geprüft.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/admin/einstellungen/bank?${q}`, url), 303);
  const session = await getCurrentSession().catch(() => null);
  if (!session || session.role !== "ADMIN") return Response.redirect(new URL(`/login?next=${encodeURIComponent("/admin/einstellungen/bank")}`, url), 303);
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
