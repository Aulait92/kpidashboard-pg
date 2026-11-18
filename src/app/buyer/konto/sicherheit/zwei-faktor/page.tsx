import { redirect } from "next/navigation";
import { PageHeader } from "@/components/buyer-shell";
import { buttonClass, Card } from "@/components/ui";
import { TotpPanel } from "@/components/security/totp-panel";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { sichererRuecksprung, startTotpSetup } from "@/lib/totp-account";
import {
  confirmBuyerTotpAction,
  disableBuyerTotpAction,
  startBuyerTotpAction,
} from "../actions";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Zwei-Faktor-Login einrichten | performancegrowth",
};

// Einrichtungs-Karte Zwei-Faktor-Login (Ole, 18.11.2026, AVV-Ergänzung § 5): Pflicht, bevor ein Login Policen vom
// Kunden öffnet oder Kranken/BU/Leben freischaltet. Wer: Vermittler (Inhaber oder Berater) am Handy, kurz vor dem
// Termin. Eine Aufgabe: Code-App verbinden, Notfall-Codes sichern, zurück zu den Unterlagen (?zurueck=…). Der Schlüssel
// wird beim Aufruf erzeugt, damit der QR-Code sofort da ist (kein Zwischenklick). Admin-Vorschau: nur Hinweis.
export default async function ZweiFaktorEinrichtenPage({
  searchParams,
}: {
  searchParams: Promise<{ zurueck?: string }>;
}) {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  const zurueck = sichererRuecksprung((await searchParams).zurueck);

  if (ctx.preview || !ctx.userId) {
    return (
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
        <PageHeader back={zurueck} title="Zwei-Faktor-Login einrichten" />
        <Card className="p-5 text-[15px] text-[color:var(--muted)]">
          In der Vorschau nicht möglich. Den Zwei-Faktor-Login richtet jeder
          Login selbst ein.
        </Card>
      </main>
    );
  }

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: ctx.userId },
    select: { totpEnabledAt: true, totpSecretEnc: true },
  });
  // Noch kein Schlüssel: gleich anlegen, damit der QR-Code ohne Zwischenschritt erscheint (ein vorhandener bleibt)
  if (!user.totpEnabledAt && !user.totpSecretEnc && process.env.ENCRYPTION_KEY)
    await startTotpSetup(ctx.userId);

  return (
    <main className="mx-auto w-full max-w-xl flex-1 px-4 py-6 sm:px-6">
      <PageHeader
        back={zurueck}
        title="Zwei-Faktor-Login einrichten"
        subtitle={ctx.email}
      />
      <Card className="p-5 text-[15px]">
        <div className="space-y-4" data-zwei-faktor-karte>
          {user.totpEnabledAt ? null : <p className="text-sm text-[color:var(--muted)]">Pflicht zum Öffnen von Policen vom Kunden, dauert etwa eine Minute.</p>}
          {/* Immer TotpPanel an derselben Stelle: hält die Notfall-Codes nach dem Bestätigen (Seite lädt dann neu) */}
          <TotpPanel
            userId={ctx.userId}
            startAction={startBuyerTotpAction}
            confirmAction={confirmBuyerTotpAction}
            disableAction={disableBuyerTotpAction}
            doneHref={zurueck}
            doneLabel="Gesichert, weiter"
            aktivZusatz={
              <a href={zurueck} className={buttonClass("primary", "md", "w-full sm:w-auto")}>
                Weiter
              </a>
            }
          />
        </div>
      </Card>
    </main>
  );
}
