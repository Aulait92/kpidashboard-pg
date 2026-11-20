import { connection } from "next/server";
import { Sparkles } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { Aufklapp } from "@/components/admin-neu/kunden/aufklapp";
import { LetzteLeads, WerbekontoFormulare, werbekontoStand } from "@/components/admin-neu/kunden/leads";
import { LeadQualitaetCard } from "@/components/admin/lead-qualitaet-card";
import { VerlustgruendeCard } from "@/components/admin/verlustgruende-card";
import KundenOptimierung from "@/app/admin/kunden/[id]/optimierung/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Leads | performancegrowth Admin" };

// Kundenakte › Leads (Umbau 20.11.2026, früher „Kampagne & Leads“ und „Optimierung“ als zwei Reiter):
// Was man am häufigsten braucht, steht oben: die letzten Leads. Daneben „Kampagne mit KI“ als einzige Hauptaktion,
// Optimierung (offen, wenn Maßnahmen auf Freigabe warten), Lead-Qualität, Verlustgründe und zugeklappt die Einrichtung
// (Werbekonto, CAPI, Leadformulare). /kunden/<id>/optimierung leitet hierher (#optimierung).
export default async function KundeLeads({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ optimierung?: string }> }) {
  await connection();
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const [letzterLauf, geplant, protokoll, stand] = await Promise.all([
    prisma.campaignRun.findFirst({ where: { customerId: id }, orderBy: { createdAt: "desc" }, select: { product: true, createdAt: true } }),
    prisma.optimizationMeasure.count({ where: { OR: [{ customerId: id }, { account: { customerId: id } }], status: "geplant" } }),
    prisma.optimizationMeasure.count({ where: { OR: [{ customerId: id }, { account: { customerId: id } }] } }),
    werbekontoStand(id),
  ]);
  return (
    <KundenakteSeite id={id}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <LetzteLeads customerId={id} />
        </div>
        <div className="min-w-0 space-y-5">
          <Card>
            <div className="flex items-center gap-3 px-5 py-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tracking-tight">Kampagne mit KI</span>
                <span className="block truncate text-xs text-[color:var(--muted)]">
                  {laufText(letzterLauf)}
                </span>
              </span>
              <ButtonLink href={`/admin/neu/kunden/${id}/kampagne`} variant="primary" size="md" icon={Sparkles}>
                Erstellen
              </ButtonLink>
            </div>
          </Card>

          <div data-funktion="account-view-protocolcard--protokoll-der-massnahmen-des-kunden actions-addmanualaction--massnahme-von-hand-eintragen-datum-art-text">
            <Aufklapp
              id="optimierung"
              titel="Optimierung"
              zusammenfassung={geplant ? `${geplant} ${geplant === 1 ? "Maßnahme wartet" : "Maßnahmen warten"} auf Freigabe` : `${protokoll} ${protokoll === 1 ? "Maßnahme" : "Maßnahmen"} im Protokoll`}
              offen={!!geplant || !!sp.optimierung}
            >
              <div className="-mt-5 [&>div]:!grid-cols-1">
                <KundenOptimierung params={Promise.resolve({ id })} />
              </div>
            </Aufklapp>
          </div>

          <div data-funktion="lead-qualitaet-card--lead-qualitaet-disqualifizierte-leads-nach-grund">
            <LeadQualitaetCard customerId={id} />
          </div>
          <VerlustgruendeCard customerId={id} />

          <Aufklapp titel="Werbekonto & Formulare" zusammenfassung={stand}>
            <WerbekontoFormulare customerId={id} />
          </Aufklapp>
        </div>
      </div>
    </KundenakteSeite>
  );
}

function laufText(lauf: { product: string; createdAt: Date } | null): string {
  return lauf
    ? `Zuletzt ${lauf.product}, ${lauf.createdAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}`
    : "Anzeigen, Texte und Formular, pausiert angelegt";
}
