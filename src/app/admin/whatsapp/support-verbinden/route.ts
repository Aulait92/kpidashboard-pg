import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { getAppUrl } from "@/lib/email";
import { onboardingLink, partnerConfig, signState } from "@/lib/whatsapp/dialog360-partner";
import { SUPPORT_CUSTOMER_ID } from "@/lib/whatsapp/support-inbox";

// Admin verbindet die Support-Nummer von performancegrowth über 360dialog (Embedded Signup,
// auch Übernahme einer bestehenden Nummer). Rücksprung über /api/whatsapp/360dialog/callback,
// der Support-Kunde landet danach wieder in Admin → WhatsApp → Einstellungen.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return NextResponse.redirect(new URL("/login", req.url));
  const back = (s: string) => NextResponse.redirect(new URL(`/admin/whatsapp/settings?support=${s}#support`, req.url));
  const cfg = partnerConfig();
  if (!cfg) return back("error");
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    return back("error");
  }
  return NextResponse.redirect(
    onboardingLink(cfg, {
      redirectUrl: `${base}/api/whatsapp/360dialog/callback`,
      state: signState(SUPPORT_CUSTOMER_ID, session.userId),
      name: "performancegrowth Support",
    }),
  );
}
