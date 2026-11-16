import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { requireAuth } from "@/lib/vertrieb/auth";
import { effectiveTaxNumber, invoiceFooter, loadTaxNumberOverride, taxNumberWarning } from "@/lib/invoice-footer";
import { PROVIDER } from "@/lib/legal-texts";
import { loadAccountCheck } from "@/lib/rechnungsangaben";
import { CustomerFootersForm, InvoiceCountForm, TaxNumberForm } from "./form";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Rechnungsangaben | performancegrowth Admin" };

const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-sm)]";

export default async function RechnungsangabenPage() {
  await requireAuth();
  const [override, account] = await Promise.all([loadTaxNumberOverride(), loadAccountCheck()]);
  // Standard ist die USt-IdNr. aus den Stammdaten (PROVIDER), das Feld überschreibt sie
  const taxNumber = effectiveTaxNumber(override);
  const warning = taxNumberWarning(taxNumber);
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
        <h1 className="mb-1 mt-1 text-2xl font-semibold tracking-tight">Rechnungsangaben</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Auf jeder Stripe-Rechnung (Abo, Einmalposten, Pakete, Setup) stehen unten die Pflichtangaben nach § 14 Abs. 4 UStG und die Angaben der UG,
          unabhängig davon, was im Stripe-Konto eingetragen ist.
        </p>
      </div>

      {warning ? (
        <p className="flex items-start gap-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{warning}</span>
        </p>
      ) : null}

      <section className={card} aria-labelledby="h-steuer">
        <h2 id="h-steuer" className="mb-3 font-semibold">
          USt-IdNr. bzw. Steuernummer
        </h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Standard ist die USt-IdNr. {PROVIDER.vatId} aus den Stammdaten. Nur ausfüllen, wenn auf Rechnungen etwas anderes stehen soll.
        </p>
        <TaxNumberForm initial={override ?? ""} />
        <p className="mt-4 text-xs font-medium uppercase tracking-wide text-[color:var(--muted)]">So steht es auf jeder Rechnung</p>
        <p className="mt-1 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] px-3 py-2 text-sm">{invoiceFooter(taxNumber)}</p>
      </section>

      <section className={card} aria-labelledby="h-pruefung">
        <h2 id="h-pruefung" className="mb-1 font-semibold">
          Prüfung des Stripe-Kontos
        </h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Name, Adresse und Telefon aus dem Stripe-Konto stehen im Kopf jeder Rechnung. Nur lesen, Änderungen im Stripe-Dashboard.
        </p>
        {"error" in account ? (
          <p className="text-sm text-rose-700">{account.error}</p>
        ) : (
          <>
            {account.livemode === false ? <p className="mb-2 text-sm text-[color:var(--muted)]">Testmodus (Sandbox).</p> : null}
            <ul className="divide-y divide-[color:var(--border)]">
              {account.checks.map((c) => (
                <li key={c.key} className="flex items-start gap-3 py-2 text-sm">
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
      </section>

      <section className={card} aria-labelledby="h-kunden">
        <h2 id="h-kunden" className="mb-1 font-semibold">
          Bestehende Stripe-Kunden
        </h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Neue Kunden bekommen die Pflichtangaben automatisch. Bestehende Kunden hier einmalig aktualisieren: erst zählen, dann auf Knopfdruck alle. Gilt
          für alle künftigen Rechnungen dieser Kunden.
        </p>
        <CustomerFootersForm />
      </section>

      <section className={card} aria-labelledby="h-rechnungen">
        <h2 id="h-rechnungen" className="mb-1 font-semibold">
          Bereits verschickte Rechnungen
        </h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Zählt finalisierte Rechnungen ohne die neuen Pflichtangaben im Footer. Nur Zahlen, keine Kundendaten.
        </p>
        <InvoiceCountForm />
      </section>
    </main>
  );
}
