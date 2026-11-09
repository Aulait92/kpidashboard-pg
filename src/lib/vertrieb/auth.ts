import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

// Vertrieb ist Teil des Admin-Bereichs: Zugriff nur mit Admin-Login.
// In jeder Server Action aufrufen – Server Functions sind per POST direkt erreichbar.
export async function requireAuth() {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  return session;
}
