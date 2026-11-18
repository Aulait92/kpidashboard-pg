import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { AdvisorHeader } from "@/components/empfehlung/advisor-header";
import { ladeSeite } from "@/lib/maklervollmacht/server";
import { bekannteGesellschaften, gesellschaftName } from "@/lib/tarifkatalog";
import { a } from "@/lib/ansprache";
import { VollmachtFormular } from "./formular";

// Maklervollmacht digital (Ole, 18.11.2026): öffentliche Seite für den Kunden des Maklers, ohne Login, Handy zuerst.
// Daten prüfen, Verträge eintragen, ggf. Einwilligung Gesundheitsdaten, mit dem Finger unterschreiben.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Maklervollmacht", robots: { index: false, follow: false } };

export default async function VollmachtPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await ladeSeite(token).catch(() => ({ zustand: "ungueltig" as const }));
  if (s.zustand === "ungueltig" || s.zustand === "abgelaufen") {
    return (
      <Shell advisor={s.zustand === "abgelaufen" ? s.makler.name : undefined}>
        <h1 className="text-xl font-bold">{s.zustand === "abgelaufen" ? "Dieser Link ist abgelaufen" : "Link nicht gültig"}</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">
          {s.zustand === "abgelaufen" ? `Bitte fordern Sie bei ${s.makler.name} einen neuen Link an.` : "Dieser Link ist nicht (mehr) aktiv."}
        </p>
      </Shell>
    );
  }
  if (s.zustand === "fertig") {
    return (
      <Shell advisor={s.makler.name} customerId={s.customerId}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
          <CheckCircle2 className="h-6 w-6" />
        </div>
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Schon erledigt</h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted)]">{a(s.an, "Deine Vollmacht ist unterschrieben. Mehr musst du nicht tun.", "Ihre Vollmacht ist unterschrieben. Mehr müssen Sie nicht tun.")}</p>
      </Shell>
    );
  }
  const versichererVorschlaege = bekannteGesellschaften().map(gesellschaftName);
  return (
    <Shell advisor={s.makler.name} customerId={s.customerId}>
      <VollmachtFormular token={token} an={s.an} makler={s.makler} vorschlag={s.vorschlag} versichererVorschlaege={versichererVorschlaege} erstinfoUrl={s.erstinfoUrl} />
    </Shell>
  );
}

function Shell({ children, advisor, customerId }: { children: React.ReactNode; advisor?: string; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        {advisor ? <AdvisorHeader name={advisor} /> : null}
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
