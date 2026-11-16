import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, FileText } from "lucide-react";
import { Badge, Card, CardHeader, EmptyState } from "@/components/ui";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { MonatsberichtDetail } from "@/components/admin/monatsbericht-detail";
import { CustomerReportsToggle } from "@/app/admin/monatsberichte/forms";
import { monthLabel, STATUS_LABEL } from "@/lib/monatsbericht/shared";
import { prisma } from "@/lib/prisma";
import { cn } from "@/lib/utils";
import { RATING_TONE } from "@/components/admin-neu/kunden/bericht-bewertung";

export const metadata = { title: "Monatsberichte | performancegrowth Admin" };


// Kundenakte › Monatsberichte: alle Berichte dieses Kunden; Klick öffnet den Bericht darunter (Vorschau, Prüfbefunde,
// Senden, Bearbeiten, Anrufen statt Mail, Aussetzen: components/admin/monatsbericht-detail.tsx, Actions aus
// app/admin/monatsberichte). Der Schalter „keine Monatsberichte für diesen Kunden“ steht unter der Liste.
export default async function KundeBerichte({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bericht?: string }> }) {
  await connection();
  const { id } = await params;
  const { bericht } = await searchParams;
  const [reports, customer] = await Promise.all([
    prisma.monthlyReport.findMany({ where: { customerId: id }, orderBy: { month: "desc" }, take: 24, select: { id: true, month: true, rating: true, status: true, sentAt: true } }),
    prisma.customer.findUnique({ where: { id }, select: { monthlyReportsOff: true } }),
  ]);
  const offen = reports.find((r) => r.id === bericht) ?? null;
  const basis = `/admin/neu/kunden/${id}/berichte`;

  return (
    <KundenakteSeite id={id}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="min-w-0 space-y-3">
          <Card>
            <CardHeader
              title="Monatsberichte"
              count={reports.length}
              actions={
                <Link href="/admin/einstellungen/monatsberichte" className="inline-flex min-h-10 items-center text-sm text-[color:var(--muted)] hover:text-[color:var(--foreground)]">
                  Vorlage
                </Link>
              }
            />
            {reports.length ? (
              <ul className="divide-y divide-[color:var(--border)]" data-funktion="page--bericht-ansehen-mit-vorschau-und-pruefbefunden">
                {reports.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={r.id === offen?.id ? basis : `${basis}?bericht=${r.id}#bericht`}
                      aria-current={r.id === offen?.id ? "true" : undefined}
                      className={cn("flex min-h-12 items-center gap-3 px-5 py-2.5 text-sm transition hover:bg-[color:var(--surface-sunken)]", r.id === offen?.id && "bg-[color:var(--surface-sunken)]")}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{monthLabel(r.month)}</span>
                        <span className="block text-xs text-[color:var(--muted)]">
                          {STATUS_LABEL[r.status] ?? r.status}
                          {r.sentAt ? ` am ${r.sentAt.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}` : ""}
                        </span>
                      </span>
                      <Badge tone={RATING_TONE[r.rating] ?? "neutral"}>{r.rating}</Badge>
                      <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={FileText} title="Noch kein Bericht" text="Berichte entstehen automatisch ab dem 2. des Folgemonats, sobald der Kunde Leads hatte." />
            )}
          </Card>
          <div className="px-1" data-funktion="actions-togglecustomerreportsaction--monatsberichte-fuer-diesen-kunden-an-aus">
            <CustomerReportsToggle id={reports[0]?.id ?? ""} customerId={id} off={!!customer?.monthlyReportsOff} />
          </div>
        </div>
        <div
          id="bericht"
          className="min-w-0 scroll-mt-20 space-y-5"
          data-funktion="actions-sendreportaction--bericht-senden actions-sendreportaction--bericht-bearbeiten-betreff-einstieg-und-senden actions-callinsteadaction--anrufen-statt-mail actions-skipreportaction--diesen-monat-aussetzen"
        >
          {offen ? (
            <MonatsberichtDetail id={offen.id} ohneSchalter />
          ) : reports.length ? (
            <p className="hidden rounded-[var(--radius-lg)] border border-dashed border-[color:var(--border)] px-5 py-10 text-center text-sm text-[color:var(--muted)] lg:block">
              Bericht links wählen: Vorschau, Prüfbefunde und Senden.
            </p>
          ) : null}
        </div>
      </div>
    </KundenakteSeite>
  );
}
