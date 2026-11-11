import { NextResponse } from "next/server";
import { getBuyerContext } from "@/lib/buyer-context";
import { getAppUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { onboardingLink, partnerConfig, signState } from "@/lib/whatsapp/dialog360-partner";

// Kunde (Inhaber) startet das Verbinden seiner WhatsApp-Nummer: Weiterleitung
// zum 360dialog-Onboarding (Konto anlegen + Meta Embedded Signup). Zurück
// kommt er über /api/whatsapp/360dialog/callback mit signiertem state.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const back = (wa: string) => NextResponse.redirect(new URL(`/buyer/einrichtung?wa=${wa}#whatsapp`, req.url));
  const ctx = await getBuyerContext();
  if (!ctx) return NextResponse.redirect(new URL("/login", req.url));
  if (ctx.preview || ctx.teamRole !== "owner") return back("forbidden");
  const cfg = partnerConfig();
  if (!cfg) return back("off");
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    return back("error");
  }
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true } });
  const link = onboardingLink(cfg, {
    redirectUrl: `${base}/api/whatsapp/360dialog/callback`,
    state: signState(ctx.customerId, ctx.userId),
    email: ctx.email,
    name: customer?.name ?? null,
  });
  return NextResponse.redirect(link);
}
