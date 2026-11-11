import Link from "next/link";
import { PROVIDER, SUBPROCESSORS } from "@/lib/legal-texts";

// Öffentliche Seite „Sicherheit & Datenschutz“ für Interessenten und Kunden.
// Inhalte nur aus belegten Maßnahmen (docs/datenschutz.md, AVV, TOMs).
export const metadata = {
  title: "Sicherheit & Datenschutz · performancegrowth",
  description: "Wie performancegrowth Ihre Daten und die Daten Ihrer Leads schützt.",
};

const SECTIONS: { title: string; points: string[] }[] = [
  {
    title: "Hosting in der EU",
    points: [
      "Anwendung und Datenbank laufen in einem Rechenzentrum in der EU (Amsterdam) bei Railway.",
      "Die Datenbank ist nur intern erreichbar, nicht direkt aus dem Internet.",
    ],
  },
  {
    title: "Verschlüsselung",
    points: [
      "Alle Verbindungen zur App sind per TLS (HTTPS) verschlüsselt.",
      "Zugangsdaten zu Drittdiensten, etwa Ihre Kalenderanbindung, sowie die Geheimnisse für den Zwei-Faktor-Login speichert die App zusätzlich verschlüsselt (AES-256-GCM).",
      "Passwörter werden nie im Klartext gespeichert, sondern nur als Hash.",
    ],
  },
  {
    title: "Datensicherung",
    points: [
      "Tägliche und wöchentliche Sicherungen der Datenbank.",
      "Fortlaufende Sicherung zur zeitpunktgenauen Wiederherstellung (Point-in-Time-Restore) für etwa vier Wochen.",
      "Die Wiederherstellung aus der Sicherung wird regelmäßig getestet.",
    ],
  },
  {
    title: "Zugriffsschutz",
    points: [
      "Jede Person meldet sich mit einem eigenen Konto an. Fehlversuche bei der Anmeldung werden begrenzt, Sitzungen laufen automatisch ab.",
      "Administratoren melden sich zusätzlich mit einem zweiten Faktor (Authenticator-App) an. Für Kunden-Logins ist der zweite Faktor freiwillig einschaltbar.",
      "Nach einer Passwortänderung werden alle anderen Sitzungen beendet; „Überall abmelden“ geht jederzeit. Wiederholte Anfragen werden gedrosselt.",
      "Rollen trennen, wer was sieht: Die Daten jedes Kunden sind strikt getrennt, Berater sehen nur die ihnen zugeteilten Leads.",
      "Ein Änderungsprotokoll hält Anmeldungen, Exporte, Löschungen und Änderungen an Zugängen mit Person und Zeitpunkt fest.",
      "Auf Kundendaten greifen nur berechtigte, zur Vertraulichkeit verpflichtete Personen zu, und nur soweit es für Betrieb und Support nötig ist.",
    ],
  },
  {
    title: "Datensparsamkeit und Löschfristen",
    points: [
      "Die Nutzungsstatistik ist pseudonym, enthält keine Lead-Inhalte und wird nach 180 Tagen automatisch gelöscht.",
      "Das Änderungsprotokoll wird nach einem Jahr gelöscht, fehlgeschlagene Anmeldeversuche nach 30 Tagen.",
      "Lead-Rohdaten, die noch keinem Kunden zugeordnet sind, werden nach spätestens 90 Tagen gelöscht.",
      "Einzelne Leads lassen sich auf Wunsch der betroffenen Person sofort löschen (Lead öffnen, Mehr, „Daten löschen“).",
      "Bei Vertragsende löschen wir alle Lead-Daten spätestens nach 30 Tagen. Auf Wunsch exportieren Sie die Leads vorher.",
      "Fehlerberichte an unsere Fehlerüberwachung enthalten keine personenbezogenen Inhalte.",
    ],
  },
];

export default function SicherheitPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Sicherheit &amp; Datenschutz</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-[#374151]">
          Sie vertrauen uns Ihre Leads und die Gespräche mit ihnen an. Hier sehen Sie, wie wir diese Daten schützen. Den aktuellen
          Betriebszustand der App finden Sie auf der{" "}
          <Link href="/status" className="font-medium text-[#2563EB] hover:underline">
            Statusseite
          </Link>
          .
        </p>

        <div className="mt-10 space-y-8 text-[15px] leading-relaxed">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h2 className="mb-3 text-lg font-bold text-[#111827]">{s.title}</h2>
              <ul className="list-disc space-y-1.5 pl-5 text-[#374151]">
                {s.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </section>
          ))}

          <section>
            <h2 className="mb-3 text-lg font-bold text-[#111827]">Auftragsverarbeitung</h2>
            <p className="text-[#374151]">
              Für die Daten Ihrer Leads sind Sie verantwortlich, wir verarbeiten sie in Ihrem Auftrag. Die Einzelheiten regelt unser{" "}
              <Link href="/rechtliches/avv" className="font-medium text-[#2563EB] hover:underline">
                Auftragsverarbeitungsvertrag (AVV)
              </Link>{" "}
              samt technischer und organisatorischer Maßnahmen.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-[#111827]">Unterauftragsverarbeiter</h2>
            <p className="mb-4 text-[#374151]">Diese Dienstleister setzen wir ein, jeweils mit Vertrag zur Auftragsverarbeitung:</p>
            <div className="overflow-hidden rounded-xl border border-[#e5e7eb]">
              <table className="w-full text-left text-sm">
                <thead className="hidden bg-[#f9fafb] text-xs uppercase tracking-wide text-[#6b7280] sm:table-header-group">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Dienstleister</th>
                    <th className="px-4 py-2.5 font-semibold">Zweck</th>
                    <th className="px-4 py-2.5 font-semibold">Standort</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e7eb]">
                  {SUBPROCESSORS.map((p) => (
                    <tr key={p.name} className="block px-4 py-3 sm:table-row sm:p-0">
                      <td className="block font-medium text-[#111827] sm:table-cell sm:px-4 sm:py-3">{p.name}</td>
                      <td className="block text-[#374151] sm:table-cell sm:px-4 sm:py-3">{p.purpose}</td>
                      <td className="block text-[#6b7280] sm:table-cell sm:px-4 sm:py-3">{p.location}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-[#6b7280]">
              Bei Diensten mit Sitz in den USA stützt sich die Übermittlung auf das EU-US Data Privacy Framework oder die
              Standardvertragsklauseln der EU-Kommission, wie im AVV beschrieben.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-lg font-bold text-[#111827]">Ansprechpartner Datenschutz</h2>
            <p className="text-[#374151]">
              {PROVIDER.name}
              <br />
              {PROVIDER.street}, {PROVIDER.city}
              <br />
              <a href={`mailto:${PROVIDER.email}`} className="font-medium text-[#2563EB] hover:underline">
                {PROVIDER.email}
              </a>
            </p>
            <p className="mt-3 text-[#374151]">
              Fragen zum Datenschutz, Auskunfts- oder Löschanfragen und Hinweise auf Sicherheitsprobleme richten Sie bitte an diese
              Adresse. Wir antworten so schnell wie möglich.
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
