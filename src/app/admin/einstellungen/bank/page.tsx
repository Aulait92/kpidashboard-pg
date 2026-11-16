import Link from "next/link";
import { Building2, CreditCard } from "lucide-react";
import { BankKarte, BankRegeln, ladeBank } from "@/components/admin/bank-bausteine";
import { requireAuth } from "@/lib/vertrieb/auth";
import { CsvUpload } from "./forms";
import { AdminBack } from "@/components/admin/admin-back";

export const metadata = { title: "Bank & Karten | performancegrowth Admin" };

const card = "rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-sm)] sm:p-5";

// Bank & Karten: Konten verbinden (Enable Banking) oder CSV hochladen; Ausgaben
// fließen nach der Zuordnung als Kosten in die Zahlen-Seite. Bausteine gemeinsam mit dem neuen Admin
// (components/admin/bank-bausteine.tsx).
export default async function BankPage({ searchParams }: { searchParams: Promise<{ fehler?: string; verbunden?: string }> }) {
  await requireAuth();
  const sp = await searchParams;
  const { open, rules, overlap, configured, redirectUrl, commerz, amex, csvCount, soonOf } = await ladeBank();

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-8 sm:px-6">
      <div>
        <AdminBack href="/admin/einstellungen">Einstellungen</AdminBack>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bank & Karten</h1>
        <p className="text-sm text-[color:var(--muted)]">
          Ausgaben vom Geschäftskonto und der Kreditkarte holen und als Kosten zuordnen. Zugeordnete Ausgaben fließen netto in Marge und Kundengewinnungskosten auf der Zahlen-Seite.
        </p>
      </div>

      {sp.fehler ? <p className="rounded-[var(--radius-md)] border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{sp.fehler}</p> : null}
      {sp.verbunden ? <p className="rounded-[var(--radius-md)] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Verbunden. Die Umsätze der letzten 90 Tage wurden abgerufen.</p> : null}

      {open > 0 ? (
        <Link href="/admin/einstellungen/bank/zuordnen" className="flex items-center justify-between rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            <b>{open}</b> {open === 1 ? "Ausgabe wartet" : "Ausgaben warten"} auf eine Zuordnung.
          </span>
          <span className="font-semibold">Zuordnen →</span>
        </Link>
      ) : (
        <Link href="/admin/einstellungen/bank/zuordnen" className="block text-sm text-[color:var(--brand)] hover:underline">Zugeordnete Ausgaben ansehen →</Link>
      )}

      {overlap.length ? (
        <p className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Möglicherweise doppelt gezählt: {overlap.map((o) => o.name).join(", ")} {overlap.length === 1 ? "steht" : "stehen"} unter „Laufende Kosten“ und kommt jetzt auch über die Bank. Bitte dort ein Enddatum setzen.{" "}
          <Link href="/admin/einstellungen/kosten" className="font-semibold underline">Laufende Kosten</Link>
        </p>
      ) : null}

      {!configured ? (
        <p className="rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color:var(--surface-sunken)] px-4 py-3 text-sm text-[color:var(--muted)]">
          Für die direkte Verbindung fehlen noch <code>ENABLE_BANKING_APP_ID</code> und <code>ENABLE_BANKING_PRIVATE_KEY</code> in Railway. Bis dahin funktioniert der CSV-Import. Weiterleitungs-Adresse für Enable Banking: <code className="break-all">{redirectUrl}</code>
        </p>
      ) : null}

      <BankKarte title="Commerzbank (Geschäftskonto)" icon={Building2} aspsp="Commerzbank" c={commerz} csv={csvCount("csv:commerzbank")} configured={configured} soon={soonOf(commerz)} csvHint="Ohne Verbindung: Online-Banking → Umsätze → Export „CSV“ und unten hochladen. Die Bank-Zustimmung gilt höchstens 180 Tage; 7 Tage vorher kommt eine Erinnerung." />
      <BankKarte title="American Express" icon={CreditCard} aspsp="American Express" c={amex} csv={csvCount("csv:amex")} configured={configured} soon={soonOf(amex)} csvHint="Amex ist über Open Banking in Deutschland meist nicht verfügbar. Dann: amex.de → Umsätze → „Herunterladen“ → Format „CSV“ und unten hochladen (am besten einmal im Monat nach der Abrechnung)." />

      <section className={card}>
        <h2 className="mb-1 font-semibold">CSV hochladen</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">Doppelt hochladen schadet nicht: schon vorhandene Buchungen werden übersprungen.</p>
        <CsvUpload />
      </section>

      <section className={card}>
        <h2 className="mb-1 font-semibold">Regeln</h2>
        <p className="mb-3 text-sm text-[color:var(--muted)]">
          Enthält Gegenpartei oder Verwendungszweck das Muster, wird die Ausgabe automatisch zugeordnet. Neue Regeln entstehen beim Zuordnen mit „immer so“. „inkl. USt“: Betrag enthält 19 % Umsatzsteuer und wird netto gerechnet (ausländische Tools ohne deutsche USt: aus).
        </p>
        <BankRegeln rules={rules} />
      </section>
    </main>
  );
}
