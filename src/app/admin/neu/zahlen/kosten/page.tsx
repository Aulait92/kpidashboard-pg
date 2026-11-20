import { connection } from "next/server";
import Link from "next/link";
import { ArrowRight, ChevronRight, Plus } from "lucide-react";
import { ladeBank, type BankVerbindung } from "@/components/admin/bank-bausteine";
import { LaufendeKostenListe, ladeKosten } from "@/components/admin/kosten-liste";
import { ButtonLink, Card, CardHeader } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { CostForm } from "@/app/admin/einstellungen/kosten/forms";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Kosten | performancegrowth Admin" };

// Geld › Kosten (Umbau 19.11.2026): eine Aufgabe, „Wohin geht das Geld?“. Oben nur, wenn etwas wartet: neue Ausgaben
// zuordnen (einzige Hauptaktion) und Hinweise zur Bank. Darunter die laufenden Kosten. Konten, Regeln und Annahmen
// sind Einstellungen und liegen auf der Unterseite „Konten & Regeln“ (kosten/konten). Gleiche Bausteine und Server
// Actions wie die alten Seiten (components/admin/bank-bausteine.tsx, kosten-liste.tsx, einstellungen/kosten/forms.tsx).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const hinweis = "rounded-[var(--radius-md)] border px-4 py-3 text-sm";

/** Ein Satz, wenn eine Bankverbindung Aufmerksamkeit braucht (abgelaufen, bald fällig, Fehler), sonst null. */
function bankProblem(name: string, c: BankVerbindung | undefined, bald: boolean): string | null {
  if (!c) return null;
  if (c.status === "expired") return `${name}: Zustimmung abgelaufen, bitte neu verbinden.`;
  if (c.status === "active" && c.lastError) return `${name}: letzter Abruf fehlgeschlagen.`;
  if (bald) return `${name}: Verbindung läuft bald ab, bitte neu verbinden.`;
  return null;
}

export default async function Page({ searchParams }: { searchParams: Promise<{ fehler?: string }> }) {
  await connection();
  await requireAuth();
  const sp = await searchParams;
  const [{ open, overlap, commerz, amex, soonOf }, { costs }] = await Promise.all([ladeBank(), ladeKosten()]);
  const today = new Date().toISOString().slice(0, 10);
  const monatlich = costs.filter((c) => !c.endsAt || c.endsAt.toISOString().slice(0, 10) >= today).reduce((a, c) => a + Number(c.monthlyAmount), 0);
  const bank = [bankProblem("Commerzbank", commerz, soonOf(commerz)), bankProblem("American Express", amex, soonOf(amex))].filter(Boolean);
  const keineBank = commerz?.status !== "active" && amex?.status !== "active";

  return (
    <Seite titel="Geld" reiter="geld">
      <div className="space-y-4">
        {sp.fehler ? <p className={`${hinweis} border-rose-200 bg-rose-50 text-rose-800`}>{sp.fehler}</p> : null}

        {open ? (
          <Card tone="attention">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4" data-funktion="actions-assignaction--ausgabe-zuordnen-zweck-inkl-ust-immer-so-bei">
              <div className="min-w-0 flex-1 basis-56">
                <p className="font-semibold">
                  {open} {open === 1 ? "neue Ausgabe" : "neue Ausgaben"} zuordnen
                </p>
                <p className="text-sm text-[color:var(--muted)]">Erst dann zählen sie in Marge und BWA.</p>
              </div>
              <ButtonLink href="/admin/neu/zahlen/kosten/zuordnen" variant="primary" size="md" icon={ArrowRight}>
                Zuordnen
              </ButtonLink>
            </div>
          </Card>
        ) : null}

        {bank.length || keineBank ? (
          <p className={`${hinweis} flex flex-wrap items-center gap-x-3 gap-y-1 border-amber-200 bg-amber-50 text-amber-900`}>
            <span className="min-w-0 flex-1">{keineBank ? "Keine Bank verbunden: Ausgaben von Konto und Karte fehlen." : bank.join(" ")}</span>
            <Link href="/admin/neu/zahlen/kosten/konten" className="font-semibold underline-offset-2 hover:underline">
              Konten öffnen
            </Link>
          </p>
        ) : null}

        {overlap.length ? (
          <p className={`${hinweis} border-amber-200 bg-amber-50 text-amber-900`}>
            Vielleicht doppelt gezählt: {overlap.map((o) => o.name).join(", ")} {overlap.length === 1 ? "steht" : "stehen"} unten und {overlap.length === 1 ? "kommt" : "kommen"} jetzt auch über die Bank. Bitte ein Enddatum setzen.
          </p>
        ) : null}

        <Card>
          <CardHeader title="Laufende Kosten" hint={costs.length ? `${eur(monatlich)} im Monat` : undefined} />
          <div data-funktion="actions-deleterecurringcostaction--laufende-kosten-loeschen">
            <LaufendeKostenListe costs={costs} />
          </div>
          <div className="border-t border-[color:var(--border)] px-4 py-3" data-funktion="actions-saverecurringcostaction--laufende-kosten-anlegen-aendern-zweck-zeitraum">
            <details>
              <summary className="inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm font-semibold text-[color:var(--brand)] [&::-webkit-details-marker]:hidden">
                <Plus className="h-4 w-4" /> Kosten eintragen
              </summary>
              <div className="mt-3">
                <CostForm cost={{ id: "", name: "", amount: "", purpose: "ppl", startsAt: today, endsAt: "" }} />
              </div>
            </details>
          </div>
        </Card>

        <Card>
          <ul className="divide-y divide-[color:var(--border)]">
            <li data-funktion="page--zugeordnete-ausgaben-ansehen">
              <Link href="/admin/neu/zahlen/kosten/zuordnen?ansicht=alle" className="flex min-h-12 items-center gap-3 px-5 text-[15px] hover:bg-[color:var(--surface-sunken)]">
                <span className="min-w-0 flex-1 font-medium">Alle Ausgaben</span>
                <span className="hidden text-xs text-[color:var(--muted)] sm:inline">letzte 90 Tage von Konto und Karte</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              </Link>
            </li>
            <li>
              <Link href="/admin/neu/zahlen/kosten/konten" className="flex min-h-12 items-center gap-3 px-5 text-[15px] hover:bg-[color:var(--surface-sunken)]">
                <span className="min-w-0 flex-1 font-medium">Konten & Regeln</span>
                <span className="hidden text-xs text-[color:var(--muted)] sm:inline">Bank, Zuordnungsregeln, Annahmen für Kennzahlen</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
              </Link>
            </li>
          </ul>
        </Card>
      </div>
    </Seite>
  );
}
