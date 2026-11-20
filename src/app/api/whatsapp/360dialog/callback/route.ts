import { NextResponse } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { reportError } from "@/lib/monitoring";
import { parseChannels, partnerConfig, verifyState } from "@/lib/whatsapp/dialog360-partner";
import { completeSelfConnect } from "@/lib/whatsapp/self-connect";
import { isSupportCustomer } from "@/lib/whatsapp/support-inbox";
import { neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";

// Rückkehr vom 360dialog-Onboarding: ?client=<id>&channels=[<id>,…]&state=<signiert>.
// Öffentlich erreichbar (unter /api/whatsapp), geschützt durch den signierten,
// zeitlich begrenzten state – nur so wird einem Kunden eine Nummer zugeordnet.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (wa: string) => appRedirect(`/buyer/einrichtung?wa=${wa}#whatsapp`, req);
  if (!partnerConfig()) return back("off");
  const state = verifyState(url.searchParams.get("state"));
  if (!state) return back("state");
  const clientRaw = url.searchParams.get("client");
  const clientId = clientRaw && /^[A-Za-z0-9_-]{2,64}$/.test(clientRaw) ? clientRaw : null;
  try {
    const res = await completeSelfConnect({
      customerId: state.customerId,
      userId: state.userId,
      clientId,
      channels: parseChannels(url.searchParams.get("channels")),
    });
    const wa = res.status === "connected" ? "ok" : res.status === "pending" ? "pending" : "error";
    if (isSupportCustomer(state.customerId)) {
      // Support-Nummer (nur Admins): Start aus dem neuen Admin → zurück nach Einstellungen → WhatsApp
      const res = appRedirect(ruecksprungZiel(`/admin/neu/einstellungen/whatsapp?support=${wa}#support`, req.headers.get("cookie")), req);
      res.headers.append("Set-Cookie", neuRuecksprungCookie(null));
      return res;
    }
    return back(wa);
  } catch (err) {
    reportError(err, "d360-callback");
    return back("error");
  }
}
