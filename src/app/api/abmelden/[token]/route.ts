import { appRedirect } from "@/lib/app-redirect";
import { unsubscribe } from "@/lib/bestand/abmelden";
import { checkLimit } from "@/lib/rate-limit";

// List-Unsubscribe mit One-Click (RFC 8058): Mailprogramme schicken POST „List-Unsubscribe=One-Click“.
// Meldet von E-Mail-Kampagnen ab. GET leitet auf die Abmeldeseite (ein Klick im Browser).
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null;
  if (!checkLimit("publicBooking", `abmelden-post:${ip ?? "?"}`).ok) return Response.json({ ok: false }, { status: 429 });
  const t = await unsubscribe(token, "email", { ip, userAgent: req.headers.get("user-agent") }).catch(() => null);
  return Response.json({ ok: !!t }, { status: t ? 200 : 404 });
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  return appRedirect(`/abmelden/${token}`, req, 303);
}
