import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { safeInternalPath } from "@/lib/login-karten";
import { countLoginCardClick } from "@/lib/login-karten-server";
import { loginTargetFor } from "@/lib/login-ziel-server";

// Klick auf den Link einer Infokarte der Login-Seite: zählen und weiterleiten.
// Interne Seiten liegen hinter dem Login → zur Anmeldung mit next=…, danach
// geht es direkt dorthin (nur, wenn der Nutzer die Seite sehen darf).
export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";
  const to = (path: string) => redirect(path);
  const link = await countLoginCardClick(id);
  if (!link) return to("/login");
  // Externe Links (vom Admin gepflegt, beim Speichern auf http(s) geprüft)
  if (/^https?:\/\//i.test(link)) return NextResponse.redirect(link, 303);
  const path = safeInternalPath(link);
  if (!path) return to("/login");
  const session = await getCurrentSession().catch(() => null);
  if (session) return to(await loginTargetFor(session, path));
  return to(`/login?next=${encodeURIComponent(path)}&karte=${encodeURIComponent(id)}`);
}
