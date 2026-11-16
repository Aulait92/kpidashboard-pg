import { connection } from "next/server";
import { ArrowRight } from "lucide-react";
import { ZahlenView } from "@/components/admin/zahlen-view";
import { ButtonLink } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { KundenNachKanal } from "@/components/admin-neu/zahlen/kunden-nach-kanal";
import { loadBwa } from "@/lib/bwa";
import { loadProdukte } from "@/lib/produkte";
import { requireAuth } from "@/lib/vertrieb/auth";
import { loadVertriebZahlen } from "@/lib/vertrieb-zahlen";
import { loadZahlen } from "@/lib/zahlen";
import { parseSicht } from "@/lib/zahlen-sicht";

export const metadata = { title: "Zahlen | performancegrowth Admin" };

// Zahlen → Übersicht: Kennzahlen-Kacheln, Sicht (Kerngeschäft/Gesamt), Investoren-Ansicht und -Update wie /admin/zahlen.
// EINE Reiterebene (Ole, 16.11.2026): Die früheren Reiter in der Seite (Wachstum, Kunden, …, BWA) stehen hier als
// aufklappbare Abschnitte untereinander (components/admin/zahlen-view.tsx, Prop `eingebettet`). Gleiche Daten und
// Server Actions wie /admin/zahlen; ?zeitraum=, ?vzeitraum=, ?bwa=, ?sicht= wie dort.
// Einrichtungsgebühren und „Kunden ohne Betreuungsgebühr“ stehen unter Umsatz & Buchungen.
export default async function Page({ searchParams }: { searchParams: Promise<{ zeitraum?: string; vzeitraum?: string; bwa?: string; sicht?: string }> }) {
  await connection();
  await requireAuth();
  const { zeitraum, vzeitraum, bwa: bwaParam, sicht } = await searchParams;
  const [data, produkte, vertrieb, bwa] = await Promise.all([loadZahlen(new Date(), parseSicht(sicht)), loadProdukte(zeitraum), loadVertriebZahlen(vzeitraum), loadBwa(bwaParam)]);

  return (
    <Seite titel="Zahlen" reiter="zahlen" breit>
      <ZahlenView
        data={data}
        produkte={produkte}
        vertrieb={vertrieb}
        bwa={bwa}
        eingebettet
        funktionen={{
          kacheln: "zahlen-view--kennzahlen-kacheln-mrr-kunden-churn-cac zahlen-view-setdrill--kachel-aufklappen-drill-down-kunden-je-kennzahl",
          sicht: "zahlen-view-sicht--sicht-kerngeschaeft-oder-gesamt-mit-pay-per-lead",
          investor: "zahlen-view-toggleinvestor--investoren-ansicht-interne-reiter-ausblenden",
          update: "actions-saveupdatetextsaction--investoren-update-highlights-texte-speichern",
          wachstum: "zahlen-view--reiter-wachstum-umsatz-je-strom-umsatzmix",
          kunden: "zahlen-view--reiter-kunden-kohorten-kundenbasis-abhaengigkeit",
          wirtschaft: "zahlen-view--reiter-wirtschaftlichkeit-kundengewinnung",
          wirkung: "zahlen-view--reiter-wirkung-beim-vertreter-pro-1-lead-bis",
          produkte: "zahlen-view--reiter-produkte-ueber-alle-vertreter-und-je",
          vertrieb: "zahlen-view--reiter-vertrieb-pipeline-woher-kunden-kommen",
          ppl: "zahlen-view--reiter-pay-per-lead-verkaufte-leads-je-monat",
          bwa: "zahlen-view-bwa--reiter-bwa-mit-drill-down-je-zeile-und-hinweis",
        }}
        abschnittExtra={{ vertrieb: <KundenNachKanal /> }}
      />
      <div className="mt-5 flex justify-end">
        <span data-funktion="zahlen-tabs--link-leads-werbung-dashboard">
          <ButtonLink href="/" variant="ghost" icon={ArrowRight}>
            Leads & Werbung (Dashboard)
          </ButtonLink>
        </span>
      </div>
    </Seite>
  );
}
