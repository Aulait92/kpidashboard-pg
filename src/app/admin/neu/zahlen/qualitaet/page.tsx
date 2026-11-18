import Link from "next/link";
import { connection } from "next/server";
import { HilfeAnfragenKarte, KiHilfeKarte, NutzungJeKunde } from "@/components/admin/nutzung-bausteine";
import { StornoQuoteUebersicht } from "@/components/admin/storno-quote";
import { WhatsAppZustellung } from "@/components/admin/whatsapp-zustellung";
import { VerlustgruendeCard } from "@/components/admin/verlustgruende-card";
import { Seite } from "@/components/admin-neu/ui/seite";
import { Aufklapp } from "@/components/admin-neu/zahlen/aufklapp";
import { ModuleCandidatesCard } from "@/app/admin/nutzung/module-card";
import { NpsCard } from "@/app/admin/nutzung/nps-card";
import { loadHelpQuestions } from "@/lib/hilfe-report";
import { loadSupportRequests } from "@/lib/support-server";
import { computeUsageReport } from "@/lib/usage-report";
import { requireAuth } from "@/lib/vertrieb/auth";
import { cn } from "@/lib/utils";

export const metadata = { title: "Qualität & Nutzung | performancegrowth Admin" };

// Zahlen → Qualität & Nutzung: früher drei Seiten (Zahlen → Stornoquote, Zahlen → WhatsApp-Zustellung, Nutzung).
// Oben die Qualität der Leads und Verträge, darunter die Nutzung der App (?tage=7|14|30, Standard 14).
// Gleiche Bausteine und Daten wie die alten Seiten (components/admin/storno-quote, whatsapp-zustellung, nutzung-bausteine,
// app/admin/nutzung/nps-card, module-card). Seltenes (Modul-Kandidaten, Nutzung je Kunde) ist eingeklappt.
export default async function Page({ searchParams }: { searchParams: Promise<{ tage?: string; ankuendigung?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const days = [7, 14, 30].includes(Number(sp.tage)) ? Number(sp.tage) : 14;
  const [report, help, support] = await Promise.all([computeUsageReport(days), loadHelpQuestions(days), loadSupportRequests(days)]);
  const stockend = report.customers.filter((c) => c.stalled.outcomesOpen + c.stalled.followUpsOverdue + c.stalled.attentionOver24h > 0).length;

  return (
    <Seite titel="Betreuen" reiter="betreuen" breit>
      <div className="space-y-6">
        <div data-funktion="storno-quote-stornoquoteuebersicht--stornoquote-der-vertraege-je-kunde-und-sparte">
          <StornoQuoteUebersicht leerHinweis />
        </div>
        <div data-funktion="whatsapp-zustellung--leads-ohne-whatsapp-je-kunde-30-tage-gesamt whatsapp-zustellung--zustellfehler-der-letzten-14-tage-je-kunde-und">
          <WhatsAppZustellung />
        </div>
        <VerlustgruendeCard />

        <section aria-label="Nutzung der App" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--border)] pt-5">
            <h2 className="text-lg font-semibold tracking-tight">Nutzung der App</h2>
            <div className="flex gap-1 text-xs font-semibold" aria-label="Zeitraum">
              {[7, 14, 30].map((d) => (
                <Link
                  key={d}
                  href={`/admin/neu/zahlen/qualitaet?tage=${d}`}
                  scroll={false}
                  aria-current={d === days ? "page" : undefined}
                  className={cn("inline-flex min-h-10 items-center rounded-full px-3", d === days ? "bg-[color:var(--foreground)] text-white" : "border border-[color:var(--border)] bg-white")}
                >
                  {d} Tage
                </Link>
              ))}
            </div>
          </div>

          <div data-funktion="nps-card--weiterempfehlung-nps">
            <NpsCard />
          </div>
          <div data-funktion="page--hilfe-anfragen-an-das-team">
            <HilfeAnfragenKarte support={support} />
          </div>
          <div data-funktion="page--ki-hilfe-fragen-der-vertreter-mit-bewertung">
            <KiHilfeKarte help={help} />
          </div>
          <Aufklapp
            titel="Nutzung je Kunde"
            hinweis={stockend ? `${stockend} mit liegen gebliebenen Aufgaben` : `${report.customers.length} ${report.customers.length === 1 ? "Kunde" : "Kunden"}`}
            funktion="page--nutzung-je-kunde-liegt-herum-genutzte-aktionen"
          >
            <NutzungJeKunde report={report} />
          </Aufklapp>
          <Aufklapp titel="Zusatzmodul: Kandidaten fürs Gespräch" offen={!!sp.ankuendigung} funktion="module-card--zusatzmodul-empfehlungen-kandidaten-fuers">
            <ModuleCandidatesCard message={sp.ankuendigung ?? null} zurueck="/admin/neu/zahlen/qualitaet" />
          </Aufklapp>
        </section>
      </div>
    </Seite>
  );
}
