import { PROVIDER } from "@/lib/legal-texts";

// Datenschutzhinweis Sitzungsaufnahmen im Kundenbereich (Ole, 17.11.2026). Wortlaut nach Rechtsprüfung
// docs/rechtstexte/sitzungsaufnahme-2026-11-17.md Abschnitt 3 (mit den dort genannten Ersatzfassungen für
// Speicherdauer, Drittland und Löschung). Verlinkt aus der Einwilligungsfrage (lib/nutzungsanalyse.ts).
// Öffentlich (middleware: /rechtliches). Keine Gedankenstriche.

export const metadata = { title: "Sitzungsaufnahmen · performancegrowth", robots: { index: false, follow: true } };

export default function SitzungsaufnahmenPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed text-[#374151]" id="sitzungsaufnahmen">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#111827]">Sitzungsaufnahmen im Kundenbereich (nur mit Ihrer Einwilligung)</h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city}
          </p>
        </header>
        <p>
          Wenn Sie in unserer Software zustimmen, zeichnen wir bei einem Teil Ihrer Sitzungen im Kundenbereich (etwa 30 %) auf, wie Sie die Software
          bedienen. Zweck ist, umständliche Abläufe, Fehler und Stellen zu finden, an denen Klicks ins Leere gehen oder mehrfach nötig sind, und die
          Software zu verbessern. Verantwortlich sind wir, die {PROVIDER.name}.
        </p>
        <p>
          Aufgezeichnet werden Klicks, Tippen, Scrollen und Mausbewegungen, der Aufbau der aufgerufenen Seiten, die besuchten Seiten (ohne Kennungen
          einzelner Kontakte und ohne URL-Parameter), technische Angaben zu Anfragen an unseren Server (Adresse ohne Kennungen, Dauer, Statuscode),
          Fehlermeldungen sowie Browser, Betriebssystem, Gerätetyp, Bildschirmgröße, Zeitpunkt und Dauer der Sitzung. Alle Texte, Eingaben, Bilder und
          sonstigen Medien werden bereits in Ihrem Browser vor der Übermittlung unkenntlich gemacht; wir sehen daher weder Inhalte noch Daten Ihrer
          Kontakte, Leads oder Kunden. Ihren Namen oder Ihre E-Mail-Adresse übermitteln wir nicht; Ihre IP-Adresse wird nur zur Übertragung verwendet
          und nicht gespeichert. Auf Seiten für Ihre Kunden (zum Beispiel Buchungs-, Angebots- und Empfehlungsseiten) und im Verwaltungsbereich findet
          keine Aufnahme statt.
        </p>
        <p>
          Rechtsgrundlage ist Ihre Einwilligung nach § 25 Abs. 1 TDDDG und Art. 6 Abs. 1 lit. a DSGVO. Die Einwilligung ist freiwillig; ohne sie können
          Sie die Software uneingeschränkt nutzen. Jeder Nutzer entscheidet für sich; Ihr Arbeitgeber oder Inhaber Ihres Kontos sieht Ihre Entscheidung
          und die Aufnahmen nicht. Zum Nachweis speichern wir Zeitpunkt, Ihre Entscheidung und die Fassung des Einwilligungstextes.
        </p>
        <p>
          Empfänger ist unser Auftragsverarbeiter Functional Software, Inc. (Sentry), 45 Fremont Street, 8th Floor, San Francisco, CA 94105, USA. Die
          Daten werden in der Datenregion EU (Deutschland) gespeichert. Ein Zugriff aus den USA ist nicht ausgeschlossen; er ist durch
          EU-Standardvertragsklauseln und, soweit Sentry darunter zertifiziert ist, durch den Angemessenheitsbeschluss der EU-Kommission zum EU-US Data
          Privacy Framework abgesichert. Auf die Aufnahmen haben bei uns nur wenige berechtigte Personen Zugriff; wir werten sie nicht zur Leistungs-
          oder Verhaltenskontrolle aus und geben sie nicht an Ihren Arbeitgeber oder Dritte weiter.
        </p>
        <p>
          Die Aufnahmen werden spätestens nach 90 Tagen automatisch gelöscht. Sie können Ihre Einwilligung jederzeit mit Wirkung für die Zukunft
          widerrufen, in der Software unter Einstellungen (Schalter „Sitzungsaufnahme zur Verbesserung der App“) oder per E-Mail an{" "}
          <a className="text-[#2563EB] underline" href={`mailto:${PROVIDER.email}`}>
            {PROVIDER.email}
          </a>
          . Die Aufnahme endet dann sofort. Bereits gespeicherte Aufnahmen werden mit Ablauf der Speicherdauer gelöscht; auf Wunsch löschen wir sie
          früher, soweit wir sie Ihnen zuordnen können. Die Rechtmäßigkeit der bis zum Widerruf erfolgten Verarbeitung bleibt unberührt. Den Nachweis
          Ihrer Entscheidung bewahren wir bis drei Jahre nach Ende des Jahres auf, in dem die Einwilligung endet.
        </p>
        <p>
          Ihre weiteren Rechte (Auskunft, Berichtigung, Löschung, Einschränkung, Datenübertragbarkeit, Beschwerde bei einer Aufsichtsbehörde) finden Sie
          in unserer{" "}
          <a className="text-[#2563EB] underline" href="https://performancegrowth.de/datenschutz">
            Datenschutzerklärung
          </a>
          .
        </p>
      </article>
    </main>
  );
}
