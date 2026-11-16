import Link from "next/link";
import { EinstellungSeite, LISTE, Zeile, ziel } from "@/components/admin-neu/einstellungen/rahmen";
import { Card, CardHeader } from "@/components/ui";
import {
  ABSTAENDE_MIT_DATUM,
  ABSTAENDE_OHNE_DATUM,
  PUSH_NACH_TAGEN,
  TAGE_NACH_ANNAHME,
  TAGE_VOR_START,
  VERSAND_AB_STUNDE,
  VERSAND_BIS_STUNDE,
} from "@/lib/angebot-zahlungserinnerung";
import { requireAuth } from "@/lib/vertrieb/auth";

export const metadata = { title: "Zahlungserinnerungen | performancegrowth Admin" };

// Zahlungserinnerungen (Demo „e-zahlung“, neu): angenommene, aber nicht bezahlte Angebote. Die Regeln sind heute fest
// im Code (lib/angebot-zahlungserinnerung.ts) und laufen im WhatsApp-Cron; diese Seite zeigt sie nur an, damit man
// sie findet. Ein Schalter je Regel kommt erst, wenn es dafür eine Einstellung gibt. Je Angebot: Vertrieb → Angebote.
const tage = (a: readonly number[]) => a.slice(1).map((d, i) => d - a[i]);

export default async function Page() {
  await requireAuth();
  const ohne = tage(ABSTAENDE_OHNE_DATUM);
  const mit = ABSTAENDE_MIT_DATUM.slice(1);
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/zahlungserinnerungen">
      <Card>
        <CardHeader title="So wird erinnert" hint="fest eingestellt" />
        <ul className={LISTE}>
          <Zeile
            titel="Ohne Wunschdatum"
            text={`${TAGE_NACH_ANNAHME} Tage nach der Annahme, dann alle ${ohne[0]} Tage, höchstens ${ABSTAENDE_OHNE_DATUM.length}-mal`}
          />
          <Zeile titel="Kunde wählt Erinnerungsdatum" text={`„Ich zahle später“: am Datum, dann nach ${mit.join(" und ")} Tagen, höchstens ${ABSTAENDE_MIT_DATUM.length}-mal`} />
          <Zeile titel="Vor dem Start" text={`Spätestens ${TAGE_VOR_START} Tage vor dem Startdatum`} />
          <Zeile titel="Versandzeit" text={`${VERSAND_AB_STUNDE} bis ${VERSAND_BIS_STUNDE} Uhr, per E-Mail und WhatsApp über die Support-Nummer`} />
          <Zeile titel="Push an Sie" text={`Wenn ${PUSH_NACH_TAGEN} Tage nach der ersten Erinnerung noch nicht gezahlt ist`} />
          <Zeile titel="Stopp" text="Sobald Zahlung oder Mandat eingerichtet ist oder das Angebot nicht mehr angenommen ist" />
        </ul>
      </Card>
      <p className="text-sm text-[color:var(--muted)]">
        Offene Zahlungen und Erinnerungsdatum je Angebot:{" "}
        <Link href={ziel("/admin/vertrieb/angebote")} className="text-[color:var(--brand)] hover:underline">
          Vertrieb → Angebote
        </Link>
      </p>
    </EinstellungSeite>
  );
}
