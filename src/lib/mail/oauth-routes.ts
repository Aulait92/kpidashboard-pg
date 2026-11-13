// Anmelde-Routen fürs eigene Postfach. Start: /api/mail/connect?anbieter=google|microsoft.
// Rücksprung über die Kalender-Callbacks (state „mail:…“) → mailCallback.

import { getCurrentSession } from "@/lib/auth";
import { publicOrigin } from "@/lib/calendar/oauth-routes";
import { googleMailExchange, microsoftMailExchange, userFromMailState } from "@/lib/mail/postfach";

const BACK = "/buyer/postfach";

export async function mailCallback(req: Request, provider: "google" | "microsoft"): Promise<Response> {
  const url = new URL(req.url);
  const back = (status: string) => {
    const dest = new URL(BACK, publicOrigin(req));
    dest.searchParams.set("postfach", status);
    return new Response(null, { status: 302, headers: { Location: dest.toString() } });
  };
  const session = await getCurrentSession();
  const userId = userFromMailState(url.searchParams.get("state") ?? "");
  // Nur der Login, der die Anmeldung gestartet hat
  if (!session || session.role !== "BUYER" || !userId || session.userId !== userId) return back("error");
  if (url.searchParams.get("error")) return back(url.searchParams.get("error")!.includes("consent") ? "consent" : "denied");
  const code = url.searchParams.get("code");
  if (!code) return back("error");
  try {
    await (provider === "google" ? googleMailExchange(code, userId) : microsoftMailExchange(code, userId));
    return back("connected");
  } catch (err) {
    console.error(`[mail ${provider} callback]`, err);
    return back(err instanceof Error && err.message.includes("erlauben") ? "scope" : "error");
  }
}
