import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { loadErscheinensquote } from "@/lib/erscheinensquote-server";

// Diagnose (Show-up-Paket, Ole 17.11.2026): Erscheinensquote je Vorlaufzeit, Produkt und Wochentag als JSON.
// GET /api/admin/erscheinensquote?tage=90[&customerId=…] (ohne customerId alle Kunden außer Testkunden). Nur Admins.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return NextResponse.json({ error: "Nur Admins." }, { status: 403 });
  const url = new URL(req.url);
  const tage = Number(url.searchParams.get("tage") ?? 90);
  const customerId = url.searchParams.get("customerId");
  return NextResponse.json(await loadErscheinensquote({ tage: Number.isFinite(tage) ? tage : 90, customerId }));
}
