import { connection } from "next/server";
import { MarketingNav } from "@/components/marketing/nav";
import { requireAuth } from "@/lib/vertrieb/auth";

// Marketing (Ole, 14.11.2026): was neue Kunden für performancegrowth anzieht – LinkedIn,
// Empfehlungsprogramm, Unterlagen für Interessenten, Rechner. Vertrieb bleibt Arbeit an Kontakten.
export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  await connection();
  await requireAuth();
  return (
    <div className="vertrieb w-full flex-1">
      <MarketingNav />
      <div className="px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </div>
  );
}
