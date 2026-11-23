import { redirect } from "next/navigation";
import { setSsoState } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { safeInternalPath } from "@/lib/login-karten";
import { authorizeUrl, newPkce, ssoEnabled, type SsoProvider } from "@/lib/sso";

// Start der Anmeldung mit Microsoft/Google: Weiterleitung zum Anbieter.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") redirect("/login");
  if (!ssoEnabled(provider as SsoProvider)) redirect("/login?fehler=nicht-eingerichtet");
  const sp = new URL(req.url).searchParams;
  const next = safeInternalPath(sp.get("next") ?? "") ?? "";
  // Aus der App (?app=1, im System-Browser geöffnet): Kennzeichen nur im signierten Status,
  // der Callback leitet dann mit Einmal-Code in die App zurück (lib/app-handoff.ts).
  const app = sp.get("app") === "1";
  const p = newPkce();
  await setSsoState({ provider, state: p.state, nonce: p.nonce, verifier: p.verifier, next, ...(app ? { app: true } : {}) });
  redirect(authorizeUrl(provider as SsoProvider, publicOrigin(req), p));
}
