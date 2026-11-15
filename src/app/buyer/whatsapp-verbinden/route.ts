import { NextResponse } from "next/server";
import { appRedirect } from "@/lib/app-redirect";
import { getBuyerContext } from "@/lib/buyer-context";
import { getAppUrl } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/monitoring";
import { createPartnerClient, onboardingLink, partnerConfig, signState } from "@/lib/whatsapp/dialog360-partner";

// Kunde (Inhaber) verbindet seine WhatsApp-Nummer über 360dialog.
// Ole, 15.11.2026: Die Registrierung auf der 360dialog-Seite verliert den Partner (Kunde landet direkt bei
// 360dialog, Tarifwahl, kein Rücksprung). Deshalb legen wir das 360dialog-Konto selbst unter unserem Partner an
// und 360dialog schickt eine Einladung (Passwort festlegen). Danach („weiter=1“) geht es angemeldet über den
// Partner-Link zum Meta-Fenster; zurück kommt der Kunde über /api/whatsapp/360dialog/callback.
// Hat die E-Mail schon ein 360dialog-Konto, geht es direkt zur Anmeldung.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const back = (wa: string) => appRedirect(`/buyer/einrichtung?wa=${wa}#whatsapp`, req);
  const ctx = await getBuyerContext();
  if (!ctx) return appRedirect("/login", req);
  if (ctx.preview || ctx.teamRole !== "owner") return back("forbidden");
  const cfg = partnerConfig();
  if (!cfg) return back("off");
  let base: string;
  try {
    base = getAppUrl();
  } catch {
    return back("error");
  }
  const customer = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { name: true, whatsAppAccount: { select: { status: true, dialog360ClientId: true } } } });
  const acc = customer?.whatsAppAccount;
  const go = (next: "signup" | "login") =>
    NextResponse.redirect(
      onboardingLink(cfg, {
        redirectUrl: `${base}/api/whatsapp/360dialog/callback`,
        state: signState(ctx.customerId, ctx.userId),
        email: ctx.email,
        name: customer?.name ?? null,
        customerId: ctx.customerId,
        next,
      }),
    );
  const url = new URL(req.url);
  // Schon eingeladen bzw. Konto vorhanden: angemeldet weiter zum Verbinden
  if (url.searchParams.get("weiter") === "1" || acc?.dialog360ClientId) return go("login");
  if (!ctx.email) return go("signup");

  const created = await createPartnerClient(cfg, { email: ctx.email, name: customer?.name ?? ctx.email, customerId: ctx.customerId });
  await audit("whatsapp.d360_invite", { entity: "Customer", entityId: ctx.customerId, customerId: ctx.customerId, details: { result: created.kind, ...(created.kind === "error" ? { status: created.status, message: created.message } : {}) }, actor: { id: ctx.userId ?? undefined, email: ctx.email, role: "kunde" } });
  if (created.kind === "exists") return go("login");
  if (created.kind === "error") {
    reportError(new Error(`360dialog Kunde anlegen: ${created.status} ${created.message}`), "d360-create-client", { customer: ctx.customerId });
    // Rückfall: bisheriger Weg (Registrierung bei 360dialog), „Verbindung prüfen“ hilft danach
    return go("signup");
  }
  await prisma.whatsAppAccount.upsert({
    where: { customerId: ctx.customerId },
    create: { customerId: ctx.customerId, provider: "360dialog", status: "invited", dialog360ClientId: created.clientId },
    update: { status: "invited", dialog360ClientId: created.clientId },
  });
  return back("invited");
}
