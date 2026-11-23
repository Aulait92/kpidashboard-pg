import { redirect } from "next/navigation";
import { completeSsoLogin } from "@/lib/auth";
import { redeemAppLoginCode } from "@/lib/app-handoff";
import { loginTargetFor } from "@/lib/login-ziel-server";
import { prisma } from "@/lib/prisma";
import { clientIp, hit } from "@/lib/rate-limit";

// Google/Microsoft-Anmeldung in der App: Die App bekommt nach der Anmeldung im System-Browser
// einen Einmal-Code (performancegrowth://login?code=…) und öffnet damit diese Adresse in der
// App-Ansicht. Code einlösen (einmalig, 5 Min., gehasht, Zweck app-sso), dann wie beim normalen
// Google/Microsoft-Login: 2FA-Schritt (sofern das Gerät nicht vertraut ist) oder Sitzungs-Cookie.
// Nichts protokollieren, was den Code verrät.

const LIMIT = { limit: 20, windowMs: 10 * 60_000 };

export async function GET(req: Request): Promise<never> {
  if (!hit("appLoginHandoff", clientIp(req.headers), LIMIT).ok) redirect("/login?fehler=abgelaufen");
  const code = new URL(req.url).searchParams.get("code") ?? "";
  const got = await redeemAppLoginCode(code);
  if (!got) redirect("/login?fehler=abgelaufen");
  const user = await prisma.user.findUnique({
    where: { id: got.userId },
    select: { id: true, email: true, role: true, customerId: true, sessionVersion: true, totpEnabledAt: true, totpSecretEnc: true },
  });
  if (!user) redirect("/login");
  // Cookie über next/headers setzen; redirect() übernimmt es in die Antwort (wie beim SSO-Login).
  const result = await completeSsoLogin(user, got.method);
  if (!result.ok) redirect(`/login?schritt=code${got.next ? `&next=${encodeURIComponent(got.next)}` : ""}`);
  redirect(await loginTargetFor(result.payload, got.next));
}
