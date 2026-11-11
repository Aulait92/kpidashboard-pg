import { logout } from "@/lib/auth";

// Abmelden per normalem Formular-POST: volle Seitennavigation zur Login-Seite,
// damit das Root-Layout (Kopfzeile ein/aus) neu gerendert wird.
export async function POST(): Promise<Response> {
  await logout();
  return new Response(null, { status: 303, headers: { Location: "/login" } });
}
