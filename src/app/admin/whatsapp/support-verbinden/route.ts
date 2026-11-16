import { NextResponse } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl } from "@/lib/email";
import { onboardingLink, partnerConfig, signState } from "@/lib/whatsapp/dialog360-partner";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";
import { neuPfadAusReferer, neuRuecksprungCookie } from "@/lib/admin-neu/ruecksprung";

// Admin verbindet die Support-Nummer von performancegrowth über 360dialog (Embedded Signup,
// auch Übernahme einer bestehenden Nummer). Rücksprung über /api/whatsapp/360dialog/callback,
// der Support-Kunde landet danach wieder in Admin → WhatsApp → Einstellungen.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return appRedirect("/login", req);
  // Aus dem neuen Admin (Einstellungen → WhatsApp): Rücksprung dorthin (lib/admin-neu/ruecksprung.ts)
  const neu = neuPfadAusReferer(req.headers.get("referer"));
  const back = (s: string) => appRedirect(`${neu ?? "/admin/whatsapp/settings"}?support=${s}#support`, req);
  const cfg = partnerConfig();
  if (!cfg) return back("error");
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    return back("error");
  }
  const res = NextResponse.redirect(
    onboardingLink(cfg, {
      redirectUrl: `${base}/api/whatsapp/360dialog/callback`,
      state: signState(SUPPORT_CUSTOMER_ID, session.userId),
      name: "performancegrowth Support",
    }),
  );
  res.headers.append("Set-Cookie", neuRuecksprungCookie(neu));
  return res;
}
