import { redirect } from "next/navigation";
import { findSsoUser, loginWithVerifiedEmail, takeSsoState, type LoginResult } from "@/lib/auth";
import { appLoginRedirect, createAppLoginCode } from "@/lib/app-handoff";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { loginTargetFor } from "@/lib/login-ziel-server";
import { reportError } from "@/lib/monitoring";
import { exchangeCode, providerErrorCode, type SsoProvider } from "@/lib/sso";

// Rückkehr vom Anbieter: Code eintauschen, bestätigte E-Mail einem Login zuordnen.
// Start aus der App (Kennzeichen im signierten Status): keine Sitzung im System-Browser,
// sondern Einmal-Code per performancegrowth://login zurück in die App.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const url = new URL(req.url);
  const saved = await takeSsoState();
  // Nur ein gültig signierter Status zum selben Anbieter darf in die App zurückleiten.
  const fromApp = !!saved?.app && saved.provider === provider;
  const fail = (code: "abgebrochen" | "abgelaufen" | "kein-konto" | "fehlgeschlagen" | "admin-freigabe" | "einstellung") =>
    redirect(fromApp ? appLoginRedirect({ fehler: code }) : `/login?fehler=${code}`);

  const providerError = url.searchParams.get("error");
  if (providerError) {
    const desc = (url.searchParams.get("error_description") ?? "").slice(0, 400);
    // Nutzer hat selbst abgebrochen → „abgebrochen“, kein Fehler (nicht an Sentry melden)
    const adminConsent = /AADSTS(65001|90094|90095)|admin/i.test(desc);
    if (providerErrorCode(providerError) === "access_denied" && !adminConsent) fail("abgebrochen");
    reportError(new Error(`${provider}: ${providerError} ${desc}`), "sso-provider-error", { provider });
    if (/AADSTS(65001|90094|90095)|admin/i.test(desc)) fail("admin-freigabe");
    fail("einstellung");
  }
  if (!saved || saved.provider !== provider || saved.state !== url.searchParams.get("state")) {
    fail("abgelaufen");
  }
  const code = url.searchParams.get("code");
  if (!code) fail("abgebrochen");

  if (fromApp) {
    // 2FA und „Gerät vertrauen“ prüft erst die App beim Einlösen (Cookies liegen dort, nicht im Browser).
    let appCode: string | null = null;
    try {
      const email = await exchangeCode(provider as SsoProvider, publicOrigin(req), code!, saved!.verifier, saved!.nonce);
      const found = await findSsoUser(email, provider as SsoProvider);
      if (found.ok) appCode = await createAppLoginCode(found.user.id, provider as SsoProvider, saved!.next);
    } catch (err) {
      reportError(err, "sso-callback", { provider, app: true });
      return fail("fehlgeschlagen");
    }
    if (!appCode) return fail("kein-konto");
    redirect(appLoginRedirect({ code: appCode }));
  }

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
  redirect(await loginTargetFor(result.payload, saved!.next));
}
