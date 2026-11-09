import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { OfferForm } from "@/components/offer-form";
import { getCurrentSession } from "@/lib/auth";
import { legalUrls } from "@/lib/offers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const metadata = { title: "Angebot erstellen | KPI-Dashboard" };

export default async function NewOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") redirect("/login");
  const { id } = await params;
  const deal = await prisma.deal.findUnique({
    where: { id },
    select: { id: true, name: true, company: true, email: true, product: true },
  });
  if (!deal) notFound();
  const legal = legalUrls();

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
      <Link href={`/admin/crm/${deal.id}`} className="mb-4 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--brand)] hover:underline">
        <ArrowLeft className="h-3 w-3" /> Zurück zum Deal
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Angebot erstellen</h1>
      <p className="mt-1 text-sm text-[color:var(--muted)]">
        {deal.name ?? "Deal"}{deal.company ? ` · ${deal.company}` : ""} — Preise nach Preisliste, Sonderkonditionen jederzeit möglich.
      </p>
      {!legal.termsUrl || !legal.dpaUrl ? (
        <p className="mt-4 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Online-Annahme noch nicht freigeschaltet: Bitte die Links zu AGB und Auftragsverarbeitungsvertrag als
          OFFER_TERMS_URL und OFFER_DPA_URL hinterlegen. Angebot und PDF funktionieren trotzdem.
        </p>
      ) : null}
      <div className="mt-6">
        <OfferForm
          target={{ dealId: deal.id }}
          backHref={`/admin/crm/${deal.id}`}
          initial={{ contactName: deal.name ?? "", company: deal.company ?? "", email: deal.email ?? "", product: deal.product ?? "" }}
        />
      </div>
    </main>
  );
}
