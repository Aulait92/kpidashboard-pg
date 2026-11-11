import { NextResponse } from "next/server";
import { reportError } from "@/lib/monitoring";
import { parseChannels, partnerConfig, verifyState } from "@/lib/whatsapp/dialog360-partner";
import { completeSelfConnect } from "@/lib/whatsapp/self-connect";

// Rückkehr vom 360dialog-Onboarding: ?client=<id>&channels=[<id>,…]&state=<signiert>.
// Öffentlich erreichbar (unter /api/whatsapp), geschützt durch den signierten,
// zeitlich begrenzten state – nur so wird einem Kunden eine Nummer zugeordnet.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (wa: string) => NextResponse.redirect(new URL(`/buyer/einrichtung?wa=${wa}#whatsapp`, req.url));
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
    return back(res.status === "connected" ? "ok" : res.status === "pending" ? "pending" : "error");
  } catch (err) {
    reportError(err, "d360-callback");
    return back("error");
  }
}
