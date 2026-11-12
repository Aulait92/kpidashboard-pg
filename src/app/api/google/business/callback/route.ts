import { getBuyerContext } from "@/lib/buyer-context";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { gbpExchangeCode, verifyState } from "@/lib/empfehlung/google-business";

// Bewertungs-Wächter: OAuth-Callback (signierter state, nur der eigene Kunde).
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => {
    const dest = new URL("/buyer/empfehlungen", publicOrigin(req));
    dest.searchParams.set("google", status);
    dest.hash = "bewertungen";
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const ctx = await getBuyerContext();
  const customerId = verifyState(url.searchParams.get("state") ?? "");
  if (!ctx || ctx.preview || ctx.teamRole !== "owner" || !customerId || customerId !== ctx.customerId) {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }
  if (url.searchParams.get("error")) return back("abgelehnt");
  const code = url.searchParams.get("code");
  if (!code) return back("fehler");
  try {
    await gbpExchangeCode(code, customerId);
    return back("verbunden");
  } catch (err) {
    console.error("[google business callback]", err);
    return back("fehler");
  }
}
