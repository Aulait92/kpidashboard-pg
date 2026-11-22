import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth";

// „Leads & Werbung“ ist in den neuen Admin umgezogen (Ole, 22.11.2026): Geld → Leads & Werbung. „/“ leitet weiter,
// Filter (range, from, to, customerId, product) bleiben erhalten; Vermittler wie bisher nach /buyer.
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export const dynamic = "force-dynamic";

export default async function Start({ searchParams }: { searchParams: SearchParams }) {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  if (session.role === "BUYER") redirect("/buyer");
  const sp = await searchParams;
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && v) q.set(k, v);
  redirect(`/admin/neu/zahlen/leads${q.size ? `?${q.toString()}` : ""}`);
}
