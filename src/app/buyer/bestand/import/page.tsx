import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { ImportFlow } from "./import-flow";

export const metadata = { title: "Bestandskunden importieren | performancegrowth" };

export default async function ImportPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const c = await prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { existingCustomersEnabled: true } });
  if (!c?.existingCustomersEnabled || ctx.teamRole !== "owner") redirect("/buyer");
  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/buyer/bestand" className="text-sm text-[color:var(--brand)] hover:underline">
        ← Bestand
      </Link>
      <PageHeader title="Bestandskunden importieren" subtitle="Excel oder CSV aus Ihrem Bestandssystem. Erneut hochladen aktualisiert vorhandene Kunden." />
      <ImportFlow />
    </main>
  );
}
