import { redirect } from "next/navigation";
import { loginWithVerifiedEmail, takeSsoState, type LoginResult } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { reportError } from "@/lib/monitoring";
import { exchangeCode, type SsoProvider } from "@/lib/sso";

// Rückkehr vom Anbieter: Code eintauschen, bestätigte E-Mail einem Login zuordnen.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const saved = await takeSsoState();
  const fail = (code: "abgebrochen" | "abgelaufen" | "kein-konto" | "fehlgeschlagen" | "admin-freigabe" | "einstellung") => redirect(`/login?fehler=${code}`);

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const desc = (url.searchParams.get("error_description") ?? "").slice(0, 400);
    reportError(new Error(`${provider}: ${providerError} ${desc}`), "sso-provider-error", { provider });
    // Nutzer hat selbst abgebrochen → „abgebrochen“; sonst Einstellungsfehler mit Hinweis
    if (providerError === "access_denied" && !/AADSTS(65001|90094|90095)/.test(desc)) fail("abgebrochen");
    if (/AADSTS(65001|90094|90095)|admin/i.test(desc)) fail("admin-freigabe");
    fail("einstellung");
  }
  if (!saved || saved.provider !== provider || saved.state !== url.searchParams.get("state")) {
    fail("abgelaufen");
  }
  const code = url.searchParams.get("code");
  if (!code) fail("abgebrochen");

  let result: LoginResult;
  try {
    const email = await exchangeCode(provider as SsoProvider, publicOrigin(req), code!, saved!.verifier, saved!.nonce);
    result = await loginWithVerifiedEmail(email, provider as SsoProvider);
  } catch (err) {
    reportError(err, "sso-callback", { provider });
    return fail("fehlgeschlagen");
  }
  if (!result.ok) {
    if (result.needsTotp) redirect(`/login?schritt=code${saved!.next ? `&next=${encodeURIComponent(saved!.next)}` : ""}`);
    return fail("kein-konto");
  }
  redirect(saved!.next || (result.payload.role === "BUYER" ? "/buyer" : "/"));
}
