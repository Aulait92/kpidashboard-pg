import { redirect } from "next/navigation";
import { setSsoState } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { authorizeUrl, newPkce, ssoEnabled, type SsoProvider } from "@/lib/sso";

// Start der Anmeldung mit Microsoft/Google: Weiterleitung zum Anbieter.
export async function GET(req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  if (provider !== "google" && provider !== "microsoft") redirect("/login");
  if (!ssoEnabled(provider as SsoProvider)) redirect("/login?fehler=nicht-eingerichtet");
  const nextRaw = new URL(req.url).searchParams.get("next") ?? "";
  const next = nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : "";
  const p = newPkce();
  await setSsoState({ provider, state: p.state, nonce: p.nonce, verifier: p.verifier, next });
  redirect(authorizeUrl(provider as SsoProvider, publicOrigin(req), p));
}
