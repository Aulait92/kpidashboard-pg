import { LogOut, ShieldCheck } from "lucide-react";
import { confirmTotpAction, disableTotpAction, signOutEverywhereAction, startTotpSetupAction } from "@/app/admin/einstellungen/sicherheit/actions";
import { EinstellungSeite } from "@/components/admin-neu/einstellungen/rahmen";
import { FaceIdKarte } from "@/components/security/face-id-karte";
import { SignOutEverywhereButton } from "@/components/security/sign-out-everywhere";
import { TotpPanel } from "@/components/security/totp-panel";
import { Card, CardHeader } from "@/components/ui";
import { ToastProvider } from "@/components/ui/toast";
import { requireAuth } from "@/lib/vertrieb/auth";

export const dynamic = "force-dynamic";
export const metadata = { title: "Zwei-Faktor & Geräte | performancegrowth Admin" };

// Zwei-Faktor & Geräte (Demo „e-sicherheit“, heute /admin/einstellungen/sicherheit): dieselben Bausteine und Actions.
export default async function Page() {
  const session = await requireAuth();
  return (
    <EinstellungSeite pfad="/admin/neu/einstellungen/sicherheit">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Face ID in der App an/aus (nur in der iPhone-App sichtbar, components/app-sperre.tsx) */}
        <ToastProvider>
          <FaceIdKarte />
        </ToastProvider>
        <Card>
          <CardHeader title="Zwei-Faktor-Login" icon={ShieldCheck} />
          <div className="space-y-4 p-5 text-[15px]" data-funktion="actions-starttotpsetupaction--zwei-faktor-einrichten-bestaetigen-abschalten">
            <TotpPanel
              userId={session.userId}
              startAction={startTotpSetupAction}
              confirmAction={confirmTotpAction}
              disableAction={disableTotpAction}
              doneHref="/admin/neu/einstellungen/sicherheit"
            />
          </div>
        </Card>
        <Card>
          <CardHeader title="Angemeldete Geräte" icon={LogOut} />
          <div className="space-y-3 p-5 text-[15px]" data-funktion="actions-signouteverywhereaction--ueberall-abmelden">
            <p className="text-sm text-[color:var(--muted)]">Meldet Sie auf allen anderen Geräten ab, z. B. nach Verlust eines Handys. Dieses Gerät bleibt angemeldet.</p>
            <SignOutEverywhereButton action={signOutEverywhereAction} />
          </div>
        </Card>
      </div>
    </EinstellungSeite>
  );
}
