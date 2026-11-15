import { NextResponse } from "next/server";
import { confirmEmailChange } from "@/lib/email-aendern";

// Bestätigungslink aus der Mail an die neue Adresse (lib/email-aendern.ts). Öffentlich, geschützt durch den Token.
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const token = new URL(req.url).searchParams.get("token") ?? "";
  const res = await confirmEmailChange(token);
  const to = new URL("/login", req.url);
  if (res.ok) to.searchParams.set("hinweis", "email-geaendert");
  else to.searchParams.set("hinweis", "email-link-ungueltig");
  return NextResponse.redirect(to);
}
