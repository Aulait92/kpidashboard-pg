import { Sparkles } from "lucide-react";
import { ButtonLink, Card } from "@/components/ui";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { LeadQualitaetCard } from "@/components/admin/lead-qualitaet-card";
import KundenLeads from "@/app/admin/kunden/[id]/leads/page";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Kampagne & Leads | performancegrowth Admin" };

// Kundenakte › Kampagne & Leads: Meta-Werbekonto, CAPI-Rückmeldung, Leadformulare und letzte Leads (derselbe Reiter wie
// /admin/kunden/[id]/leads, Bausteine und Actions von dort), dazu „Kampagne mit KI“ als Einstieg und die Lead-Qualität
// (früher in der Übersicht).
export default async function KundeKampagneLeads({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const letzterLauf = await prisma.campaignRun.findFirst({ where: { customerId: id }, orderBy: { createdAt: "desc" }, select: { product: true, createdAt: true } });
  return (
    <KundenakteSeite id={id}>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[2fr_3fr]">
          <Card>
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 text-sm">
              <Sparkles className="h-4 w-4 shrink-0 text-[color:var(--brand)]" />
              <p className="min-w-0 flex-1 text-[color:var(--muted)]">
                <span className="font-semibold text-[color:var(--foreground)]">Kampagne mit KI: </span>
                Ein KI-Team erstellt Anzeigen, Texte und Formular und legt die Kampagne pausiert an.
                {letzterLauf ? ` Zuletzt: ${letzterLauf.product}, ${letzterLauf.createdAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}.` : ""}
              </p>
              <ButtonLink href={`/admin/neu/kunden/${id}/kampagne`} variant="primary" size="md" icon={Sparkles}>
                Kampagne erstellen
              </ButtonLink>
            </div>
          </Card>
          <div data-funktion="lead-qualitaet-card--lead-qualitaet-disqualifizierte-leads-nach-grund">
            <LeadQualitaetCard customerId={id} />
          </div>
        </div>
        <div
          data-funktion="meta-account-actions-setmetaadaccountaction--meta-werbekonto-id-setzen capi-actions-setcapidatasetaction--capi-rueckmeldung-status-und-dataset-setzen actions-togglesourceaction--leadformulare-des-kunden-an-aus page--letzte-leads-mit-abschluss-storno testlead-actions-sendtestleadaction--testlead-schicken-echter-ablauf-zaehlt-nirgends"
        >
          <KundenLeads params={Promise.resolve({ id })} />
        </div>
      </div>
    </KundenakteSeite>
  );
}
