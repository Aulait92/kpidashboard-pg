import { PROVIDER } from "@/lib/legal-texts";

// Anleitung zur Datenlöschung (Ole, 16.11.2026): Pflichtangabe der Meta-App „performancegrowth Messaging“
// (Tech Provider für WhatsApp über 360dialog, App settings → Basic → Data deletion instructions URL).
// Öffentlich (middleware: /rechtliches). Inhalt deckt sich mit AGB „Daten bei Vertragsende“ und AVV
// (Löschfunktion je Lead, Unterstützung bei Betroffenenrechten). Text an Leads und Kunden: keine Gedankenstriche.

export const metadata = { title: "Datenlöschung · performancegrowth", robots: { index: false, follow: true } };

const DATENSCHUTZ = "https://performancegrowth.de/datenschutz";

export default function DatenloeschungPage() {
  const mail = PROVIDER.email;
  return (
    <main className="min-h-screen bg-white px-4 py-12">
      <article className="mx-auto max-w-3xl space-y-8 text-[15px] leading-relaxed text-[#374151]">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#2563EB]">performancegrowth</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-[#111827]">Anleitung zur Datenlöschung</h1>
          <p className="mt-2 text-sm text-[#6b7280]">
            {PROVIDER.name}, {PROVIDER.street}, {PROVIDER.city}
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-bold text-[#111827]">Worum es geht</h2>
          <p>
            Versicherungsvermittler nutzen unsere Software, um mit ihren Interessenten und Kunden per WhatsApp zu
            schreiben und Termine zu vereinbaren. Für diese Daten ist der jeweilige Vermittler verantwortlich; wir
            verarbeiten sie in seinem Auftrag.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-[#111827]">Sie haben mit einem Vermittler per WhatsApp geschrieben</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Keine weiteren Nachrichten: Antworten Sie im Chat mit <b>STOPP</b>. Danach schreibt Ihnen der Vermittler
              über unsere Software nicht mehr, auch nicht per E-Mail.
            </li>
            <li>
              Löschung Ihrer Daten: Wenden Sie sich an den Vermittler, mit dem Sie geschrieben haben, oder schreiben
              Sie uns an <a className="font-medium text-[#2563EB] underline" href={`mailto:${mail}`}>{mail}</a> mit
              Ihrer WhatsApp-Nummer und dem Namen des Vermittlers. Wir leiten Ihre Anfrage an ihn weiter und unterstützen
              ihn bei der Löschung.
            </li>
            <li>
              Damit Ihr Widerspruch dauerhaft beachtet wird, behalten wir nur einen pseudonymisierten Sperreintrag
              (Hashwert), aus dem sich Ihre Nummer nicht zurückrechnen lässt.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-[#111827]">Sie sind Kunde von performancegrowth</h2>
          <ul className="list-disc space-y-2 pl-5">
            <li>Einzelne Kontakte löschen Sie in der App direkt am Kontakt.</li>
            <li>
              Alle Daten können Sie jederzeit unter <b>Konto &amp; Rechnungen</b> herunterladen. Nach Vertragsende
              bewahren wir sie 24 Monate auf; dort können Sie stattdessen 3 Monate oder die Löschung sofort nach
              Vertragsende wählen.
            </li>
            <li>
              Ihr WhatsApp-Konto bei uns trennen oder löschen lassen: Schreiben Sie uns an{" "}
              <a className="font-medium text-[#2563EB] underline" href={`mailto:${mail}`}>{mail}</a>.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold text-[#111827]">Mehr dazu</h2>
          <p>
            Einzelheiten stehen in unserer{" "}
            <a className="font-medium text-[#2563EB] underline" href={DATENSCHUTZ}>Datenschutzerklärung</a>.
          </p>
        </section>

        <section lang="en" className="border-t border-[#e5e7eb] pt-8 text-sm">
          <h2 className="mb-2 text-base font-bold text-[#111827]">Data deletion instructions (English)</h2>
          <p>
            Insurance agents use our software to message their leads and customers on WhatsApp; the agent is the
            controller, we process the data on their behalf. To stop messages, reply <b>STOPP</b> in the chat. To have
            your data deleted, contact the agent or email us at{" "}
            <a className="text-[#2563EB] underline" href={`mailto:${mail}`}>{mail}</a> with your WhatsApp number and the
            agent&apos;s name; we forward the request and support the deletion. Our customers can delete contacts in the
            app, export all data under &quot;Konto &amp; Rechnungen&quot; and choose deletion after the end of their
            contract there.
          </p>
        </section>
      </article>
    </main>
  );
}
