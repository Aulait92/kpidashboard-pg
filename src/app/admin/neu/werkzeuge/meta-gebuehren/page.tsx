import Link from "next/link";
import { connection } from "next/server";
import { ChevronRight, MessageCircle } from "lucide-react";
import { Card, EmptyState } from "@/components/ui";
import { Kennzahlen } from "@/components/admin-neu/ui/kennzahlen";
import { Seite } from "@/components/admin-neu/ui/seite";
import { ladeMetaGebuehren } from "@/lib/admin-neu/meta-gebuehren";
import { NEU } from "@/lib/admin-neu/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Meta-Gebühren | performancegrowth Admin" };

// Werkzeuge › Meta-Gebühren (Admin v2, Paket A5, F186): WhatsApp-Gebühren von Meta über alle Kunden an einem Ort,
// laufender Monat und Vormonat, teuerste zuerst. Je Kunde weiter in der Kundenakte › WhatsApp (dort mit Abrechnung).

const eur = (n: number) => n.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
const monatName = (m: string) => {
  const [y, mo] = m.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(y, mo - 1, 15)));
};

export default async function MetaGebuehren() {
  await connection();
  await requireAuth();
  const { monat, vormonat, kunden } = await ladeMetaGebuehren();
  const summe = (k: "monat" | "vormonat") => kunden.reduce((s, x) => s + x[k], 0);
  return (
    <Seite titel="Meta-Gebühren" untertitel="WhatsApp-Gebühren von Meta je Kunde, im Preis enthalten (interne Kosten)." zurueck={{ href: `${NEU}/werkzeuge`, label: "Werkzeuge" }}>
      <Kennzahlen
        werte={[
          { label: `${monatName(monat)} bisher`, wert: eur(summe("monat")), hinweis: `${kunden.filter((k) => k.monat > 0).length} Kunden` },
          { label: monatName(vormonat), wert: eur(summe("vormonat")) },
        ]}
      />
      <Card>
        {kunden.length ? (
          <ul className="divide-y divide-[color:var(--border)]" data-meta-gebuehren="">
            {kunden.map((k) => (
              <li key={k.kundeId}>
                <Link href={`${NEU}/kunden/${k.kundeId}/whatsapp`} className="flex min-h-14 items-center gap-3 px-4 py-3 text-sm hover:bg-[color:var(--surface-sunken)] sm:px-5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{k.name}</span>
                    <span className="block text-xs text-[color:var(--muted)]">{k.nachrichten} berechnete Nachrichten im {monatName(monat)}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold tabular-nums">{eur(k.monat)}</span>
                    <span className="block text-xs text-[color:var(--muted)]">
                      {monatName(vormonat)}: {eur(k.vormonat)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-[color:var(--border-strong)]" />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon={MessageCircle} title="Noch keine berechneten Nachrichten." text="Gebühren entstehen vor allem bei Vorlagen-Nachrichten, z. B. der ersten Nachricht an neue Leads." />
        )}
      </Card>
    </Seite>
  );
}
