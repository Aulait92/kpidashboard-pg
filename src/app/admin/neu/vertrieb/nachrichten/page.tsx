import { connection } from "next/server";
import { Send } from "lucide-react";
import { ButtonLink, Card, EmptyState } from "@/components/ui";
import { Seite } from "@/components/admin-neu/ui/seite";
import { V } from "@/components/admin-neu/vertrieb/listen";
import { GeplanteNachrichtenListe } from "@/components/admin-neu/vertrieb/geplante-nachrichten";
import { requireAuth } from "@/lib/vertrieb/auth";
import { ladeGeplanteNachrichten, TAGE_STANDARD } from "@/lib/vertrieb/geplante-nachrichten-server";

export const metadata = { title: "Geplante Nachrichten | performancegrowth Admin" };

// Verkaufen → Geplante Nachrichten (Ole, 20.11.2026: „Übersicht über die nächsten automatisierten Nachrichten“): alle
// automatischen E-Mails und WhatsApps an Kontakte und Neukunden der nächsten 14 Tage, chronologisch nach Heute, Morgen,
// nächste 7 Tage, später eingeklappt. Gleiche Regeln wie der Versand (lib/vertrieb/geplante-nachrichten.ts).
// Erreichbar über Mein Tag → Vertrieb und die Suche; Kurzfassung je Kontakt in der Kontaktakte.
export default async function GeplanteNachrichtenPage() {
  await connection();
  await requireAuth();
  const now = new Date();
  const items = await ladeGeplanteNachrichten({ now });
  return (
    <Seite titel="Geplante Nachrichten" untertitel={`Was die App in den nächsten ${TAGE_STANDARD} Tagen automatisch verschickt, antippen für die Vorschau.`} zurueck={{ href: V, label: "Verkaufen" }}>
      <div data-geplante-nachrichten>
        {items.length ? (
          <GeplanteNachrichtenListe items={items} now={now} />
        ) : (
          <Card>
            <EmptyState
              icon={Send}
              title={`In den nächsten ${TAGE_STANDARD} Tagen geht keine automatische Nachricht raus.`}
              text="Erinnerungen entstehen von selbst, sobald ein Termin gebucht oder ein Angebot verschickt ist."
              action={
                <ButtonLink href={`${V}/termine`} size="md">
                  Termine ansehen
                </ButtonLink>
              }
            />
          </Card>
        )}
      </div>
    </Seite>
  );
}
