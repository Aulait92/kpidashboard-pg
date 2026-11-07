import { getCurrentSession } from "@/lib/auth";
import { exchangeCode } from "@/lib/whatsapp/google-calendar";

// Google-OAuth-Callback: Code gegen Tokens tauschen (verschlüsselt speichern)
// und zurück in die WhatsApp-Inbox leiten. Der Admin-Browser trägt die Session
// mit, daher hier dieselbe Admin-Prüfung wie beim Connect.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") {
    return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const customerId = url.searchParams.get("state"); // state = customerId
  const oauthError = url.searchParams.get("error");

  const back = (status: string) => {
    const dest = new URL("/admin/whatsapp", url.origin);
    dest.searchParams.set("gcal", status);
    return Response.redirect(dest.toString(), 302);
  };

  if (oauthError) return back("denied");
  if (!code || !customerId) return back("error");

  try {
    await exchangeCode(code, customerId);
    return back("connected");
  } catch (err) {
    console.error("[google callback]", err);
    return back("error");
  }
}
