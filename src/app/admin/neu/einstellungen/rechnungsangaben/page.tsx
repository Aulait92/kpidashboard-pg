import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { TaxNumberForm } from "@/app/admin/einstellungen/rechnungsangaben/form";
import { EinstellungSeite, LISTE } from "@/components/admin-neu/einstellungen/rahmen";
import { Card, CardHeader } from "@/components/ui";
import { effectiveTaxNumber, invoiceFooter, loadTaxNumberOverride, taxNumberWarning } from "@/lib/invoice-footer";
import { loadAccountCheck } from "@/lib/rechnungsangaben";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Rechnungsangaben | performancegrowth Admin" };

// Rechnungsangaben (Demo „e-rechnung“, heute /admin/einstellungen/rechnungsangaben): Steuernummer und Fußzeile vorn,
// Stripe-Prüfung als Liste, die einmaligen Werkzeuge (bestehende Kunden, Rechnungen zählen) eingeklappt.
export default async function Page() {
  await requireAuth();
  const [override, account] = await Promise.all([loadTaxNumberOverride(), loadAccountCheck()]);
  const taxNumber = effectiveTaxNumber(override);
  const warning = taxNumberWarning(taxNumber);
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/rechnungsangaben">
      {warning ? (
        <p className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </p>
      ) : null}

      <Card>
        <CardHeader title="USt-IdNr. bzw. Steuernummer" />
        <div className="space-y-3 p-5" data-funktion="actions-savetaxnumberaction--steuernummer-fuer-rechnungen">
          <TaxNumberForm initial={override ?? ""} />
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">So steht es auf jeder Rechnung</p>
            <p className="mt-1 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">{invoiceFooter(taxNumber)}</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Stripe-Konto" hint="nur lesen, Änderungen im Stripe-Dashboard" />
        <div data-funktion="page--stripe-konto-pruefen-pflichtangaben-testmodus">
          {"error" in account ? (
            <p className="px-5 py-4 text-sm text-rose-700">{account.error}</p>
          ) : (
            <>
              {account.livemode === false ? <p className="px-5 pt-3 text-sm text-[color:var(--muted)]">Testmodus (Sandbox).</p> : null}
              <ul className={LISTE}>
                {account.checks.map((c) => (
                  <li key={c.key} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                    {c.tone === "ok" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    ) : c.tone === "info" ? (
                      <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{c.label}:</span> <span className="break-words">{c.value}</span>
                      <span className={`block ${c.tone === "warn" ? "text-amber-800" : "text-[color:var(--muted)]"}`}>{c.hint}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </Card>
    </EinstellungSeite>
  );
}

