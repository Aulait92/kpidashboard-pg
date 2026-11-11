import Link from "next/link";
import { LogOut, ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { SignOutEverywhereButton } from "@/components/security/sign-out-everywhere";
import { TotpPanel } from "@/components/security/totp-panel";
import { requireAuth } from "@/lib/vertrieb/auth";
import { confirmTotpAction, disableTotpAction, signOutEverywhereAction, startTotpSetupAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sicherheit | performancegrowth Admin" };

export default async function SicherheitPage() {
  const session = await requireAuth();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-5 mt-1 text-2xl font-semibold tracking-tight">Sicherheit</h1>
      <div className="space-y-5">
        <Card>
          <CardHeader title="Zwei-Faktor-Login" icon={ShieldCheck} />
          <div className="space-y-4 p-5 text-[15px]">
            <TotpPanel
              userId={session.userId}
              startAction={startTotpSetupAction}
              confirmAction={confirmTotpAction}
              disableAction={disableTotpAction}
              doneHref="/admin/einstellungen/sicherheit"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Angemeldete Geräte" icon={LogOut} />
          <div className="space-y-3 p-5 text-[15px]">
            <p className="text-[color:var(--muted)]">
              Meldet Sie auf allen anderen Geräten und Browsern ab (z. B. nach Verlust eines Handys). Dieses Gerät bleibt angemeldet.
            </p>
            <SignOutEverywhereButton action={signOutEverywhereAction} />
          </div>
        </Card>
      </div>
    </main>
  );
}
