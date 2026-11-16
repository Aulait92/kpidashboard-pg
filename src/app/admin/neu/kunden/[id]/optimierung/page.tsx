import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import KundenOptimierung from "@/app/admin/kunden/[id]/optimierung/page";

export const metadata = { title: "Optimierung | performancegrowth Admin" };

// Kundenakte › Optimierung: mit eigenem Werbekonto die volle Konto-Ansicht (geplante Maßnahmen freigeben, Protokoll,
// Maßnahme eintragen), sonst Protokoll und „Maßnahme eintragen“. Derselbe Reiter wie /admin/kunden/[id]/optimierung.
export default async function KundeOptimierung({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <KundenakteSeite id={id}>
      <div className="-mt-5" data-funktion="account-view-protocolcard--protokoll-der-massnahmen-des-kunden actions-addmanualaction--massnahme-von-hand-eintragen-datum-art-text">
        <KundenOptimierung params={Promise.resolve({ id })} />
      </div>
    </KundenakteSeite>
  );
}
