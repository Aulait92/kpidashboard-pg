import Link from "next/link";
import QRCode from "qrcode";
import { ShieldCheck } from "lucide-react";
import { Card, CardHeader } from "@/components/ui";
import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { otpauthUrl } from "@/lib/totp";
import { requireAuth } from "@/lib/vertrieb/auth";
import { startTotpSetupAction } from "./actions";
import { ConfirmTotpForm, DisableTotpForm } from "./forms";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sicherheit | performancegrowth Admin" };

export default async function SicherheitPage() {
  const session = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session.userId },
    select: { email: true, totpSecretEnc: true, totpEnabledAt: true, totpBackupCodes: true },
  });
  const keyReady = !!process.env.ENCRYPTION_KEY;
  let qr: string | null = null;
  let secret: string | null = null;
  if (user.totpSecretEnc && !user.totpEnabledAt && keyReady) {
    secret = decryptSecret(user.totpSecretEnc);
    qr = await QRCode.toDataURL(otpauthUrl(secret, user.email), { margin: 1, width: 220 });
  }
  const fmt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <Link href="/admin/einstellungen" className="text-xs text-[color:var(--brand)] hover:underline">
        ← Einstellungen
      </Link>
      <h1 className="mb-5 mt-1 text-2xl font-semibold tracking-tight">Sicherheit</h1>
      <Card>
        <CardHeader title="Zwei-Faktor-Login" icon={ShieldCheck} />
        <div className="space-y-4 p-5 text-[15px]">
          {!keyReady ? (
            <p className="text-amber-800">Dafür muss in Railway die Variable ENCRYPTION_KEY gesetzt sein.</p>
          ) : user.totpEnabledAt ? (
            <>
              <p className="font-medium text-emerald-700">
                Aktiv seit {fmt(user.totpEnabledAt)} · {user.totpBackupCodes.length} Notfall-Codes übrig
              </p>
              <DisableTotpForm />
            </>
          ) : qr && secret ? (
            <>
              <p>1. QR-Code mit der Authenticator-App scannen (Google Authenticator, 1Password, Microsoft Authenticator).</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} className="rounded-[var(--radius-md)] border border-[color:var(--border)]" />
              <p className="text-xs text-[color:var(--muted)]">
                Kein Scan möglich? Schlüssel von Hand eingeben: <span className="select-all font-mono">{secret}</span>
              </p>
              <p>2. Den 6-stelligen Code aus der App eingeben:</p>
              <ConfirmTotpForm />
            </>
          ) : (
            <>
              <p className="text-[color:var(--muted)]">Nach dem Passwort fragt die Anmeldung zusätzlich einen Code aus der Authenticator-App ab.</p>
              <form action={startTotpSetupAction}>
                <button className="inline-flex h-12 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)]">
                  Einrichten
                </button>
              </form>
            </>
          )}
        </div>
      </Card>
    </main>
  );
}
