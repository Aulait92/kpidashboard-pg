import { getCurrentSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { audit } from "@/lib/audit";
import { exchangeCode, fetchMember, userFromLinkedInState } from "@/lib/linkedin/api";
import { saveConnection } from "@/lib/linkedin/posts";
import { neuRuecksprungCookie, ruecksprungZiel } from "@/lib/admin-neu/ruecksprung";

// LinkedIn-Rücksprung: Code gegen Zugang tauschen, Profil lesen, verschlüsselt speichern.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const origin = publicOrigin(req);
  // Start aus dem neuen Admin (Cookie): zurück auf diese Seite, sonst wie bisher
  const back = (status: string) =>
    new Response(null, {
      status: 302,
      headers: [
        ["Location", new URL(ruecksprungZiel(`/admin/neu/marketing?li=${status}`, req.headers.get("cookie")), origin).toString()],
        ["Set-Cookie", neuRuecksprungCookie(null)],
      ],
    });
  const session = await getCurrentSession();
  const userId = userFromLinkedInState(url.searchParams.get("state") ?? "");
  // Nur der Login, der die Anmeldung gestartet hat
  if (!session || session.role !== "ADMIN" || !userId || session.userId !== userId) return back("error");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error") === "user_cancelled_authorize" ? "cancelled" : "denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error");
  try {
    const token = await exchangeCode(code, origin);
    const member = await fetchMember(token.accessToken);
    await saveConnection(userId, { ...member, accessToken: token.accessToken, expiresAt: token.expiresAt, scopes: token.scopes });
    await audit("linkedin.connect", { entity: "LinkedInConnection", entityId: userId, details: { name: member.name, scopes: token.scopes } }).catch(() => null);
    return back("connected");
  } catch (err) {
    console.error("[linkedin callback]", err);
    return back("error");
  }
}
