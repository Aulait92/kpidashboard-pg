import Link from "next/link";
import { EinstellungSeite, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { KatalogListe, WhatsAppListe } from "@/components/admin-neu/einstellungen/vorlagen-liste";
import { GEPLANTE_NACHRICHTEN_PFAD } from "@/components/admin-neu/vertrieb/geplante-nachrichten";
import { Card, CardHeader } from "@/components/ui";
import { requireAuth } from "@/lib/vertrieb/auth";
import { vorlagenKatalog, whatsappVorlagenKatalog } from "@/lib/vertrieb/nachricht-vorschau";
import { cn } from "@/lib/utils";
import { CrmVorlagenListe } from "@/components/admin-neu/einstellungen/crm-vorlagen-liste";
import { ladeCrmVorlagen } from "@/lib/vertrieb/crm-mail-server";

export const metadata = { title: "Mail- und WhatsApp-Vorlagen | performancegrowth Admin" };

// Einstellungen → Mail- und WhatsApp-Vorlagen (Ole, 22.11.2026): alle automatischen Nachrichten an Vertriebskontakte
// und neue Kunden mit Beispieldaten, aus denselben Funktionen wie der Versand (lib/vertrieb/nachricht-vorschau.ts).
// Nur ansehen; die Texte stehen im Code. Mit echten Daten je Nachricht: Verkaufen → Geplante Nachrichten → Vorschau.
// Oben (23.11.2026): eigene Vorlagen für E-Mails aus der Kontaktakte, hier anlegen, ändern und löschen.
const PFAD = "/admin/neu/einstellungen/nachrichten";

export default async function Page({ searchParams }: { searchParams: Promise<{ an?: string }> }) {
  await requireAuth();
  const du = (await searchParams).an === "du";
  const gruppen = vorlagenKatalog(du ? "du" : "sie");
  const [wa, crmVorlagen] = await Promise.all([whatsappVorlagenKatalog(), ladeCrmVorlagen()]);
  const umschalter = (
    <div className="inline-flex rounded-[var(--radius-md)] border border-[color:var(--border)] bg-white p-0.5 text-sm" role="group" aria-label="Ansprache">
      {(["sie", "du"] as const).map((a) => {
        const aktiv = (a === "du") === du;
        return (
          <Link
            key={a}
            href={a === "du" ? `${PFAD}?an=du` : PFAD}
            aria-current={aktiv ? "true" : undefined}
            className={cn("inline-flex min-h-9 items-center rounded-[calc(var(--radius-md)-2px)] px-3 font-medium", aktiv ? "bg-[color:var(--brand)] text-white" : "text-[color:var(--muted)] hover:text-[color:var(--foreground)]")}
          >
            {a === "du" ? "Du" : "Sie"}
          </Link>
        );
      })}
    </div>
  );
  return (
    <EinstellungSeite pfad={PFAD} aktionen={umschalter}>
      <Card data-vorlagen-gruppe="kontakt-mails">
        <CardHeader title="E-Mails aus dem Kontakt" hint="Zum Auswählen im Fenster „E-Mail“" />
        <CrmVorlagenListe vorlagen={crmVorlagen} />
      </Card>
      <p className="text-sm text-[color:var(--muted)]">
        Automatische Nachrichten mit Beispieldaten. Die echte Nachricht je Kontakt:{" "}
        <Link href={ziel(GEPLANTE_NACHRICHTEN_PFAD)} className="text-[color:var(--brand)] hover:underline">
          Geplante Nachrichten › Vorschau
        </Link>
      </p>
      {gruppen.map((g) => (
        <Card key={g.key} data-vorlagen-gruppe={g.key}>
          <CardHeader title={g.titel} hint={`${g.eintraege.length} E-Mails`} />
          <KatalogListe eintraege={g.eintraege} du={du} />
        </Card>
      ))}
      <Card data-vorlagen-gruppe="whatsapp">
        <CardHeader title="WhatsApp" hint="Support-Nummer, Freigabe durch Meta" />
        <WhatsAppListe vorlagen={wa} />
      </Card>
      <p className="text-sm text-[color:var(--muted)]">
        Später-Follow-ups schreibt die KI je Kontakt:{" "}
        <Link href={ziel("/admin/neu/einstellungen/follow-ups")} className="text-[color:var(--brand)] hover:underline">
          Später-Follow-ups
        </Link>
        . Kaltmails liegen in Instantly.
      </p>
    </EinstellungSeite>
  );
}
