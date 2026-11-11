import { redirect } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/buyer-shell";
import { Card, CardHeader } from "@/components/ui";
import { SignOutEverywhereButton } from "@/components/security/sign-out-everywhere";
import { TotpPanel } from "@/components/security/totp-panel";
import { getBuyerContext } from "@/lib/buyer-context";
import { prisma } from "@/lib/prisma";
import { confirmBuyerTotpAction, disableBuyerTotpAction, signOutEverywhereBuyerAction, startBuyerTotpAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Anmeldung & Sicherheit | performancegrowth" };

// Für alle Kunden-Logins (Inhaber und Berater): Zwei-Faktor-Login (optional)
// und „Überall abmelden“. In der Admin-Vorschau nur lesend.
export default async function BuyerSecurityPage() {
  const ctx = await getBuyerContext();
  if (!ctx) redirect("/login");
  // Vorschau: Admin sieht den Stand des Inhaber-Logins, ändern geht nicht
  const userId =
    ctx.userId ??
    (await prisma.user.findFirst({ where: { customerId: ctx.customerId, teamRole: "owner" }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader title="Anmeldung & Sicherheit" subtitle={ctx.email} />
      <div className="space-y-5">
        <Card>
          <CardHeader title="Zwei-Faktor-Login (empfohlen)" icon={ShieldCheck} />
          <div className="space-y-4 p-5 text-[15px]">
            <p className="text-sm text-[color:var(--muted)]">
              Schützt Ihre Leads und Kundendaten, auch wenn Ihr Passwort in falsche Hände gerät. Funktioniert im Browser und in der App.
            </p>
            {userId ? (
              <TotpPanel
                userId={userId}
                startAction={startBuyerTotpAction}
                confirmAction={confirmBuyerTotpAction}
                disableAction={disableBuyerTotpAction}
                doneHref="/buyer/konto/sicherheit"
                readOnly={ctx.preview}
              />
            ) : null}
          </div>
        </Card>
        <Card>
          <CardHeader title="Angemeldete Geräte" icon={LogOut} />
          <div className="space-y-3 p-5 text-[15px]">
            <p className="text-[color:var(--muted)]">
              Meldet Sie auf allen anderen Handys, Tablets und Browsern ab, z. B. nach Verlust eines Geräts. Dieses Gerät bleibt angemeldet.
              Nach einer Passwortänderung passiert das automatisch.
            </p>
            <SignOutEverywhereButton action={signOutEverywhereBuyerAction} disabled={ctx.preview} />
          </div>
        </Card>
      </div>
    </main>
  );
}
