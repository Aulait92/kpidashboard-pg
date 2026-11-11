import QRCode from "qrcode";
import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { otpauthUrl } from "@/lib/totp";
import type { TotpState } from "@/lib/totp-account";
import { ConfirmTotpForm, DisableTotpForm } from "./totp-forms";

type FormAction = (prev: TotpState, fd: FormData) => Promise<TotpState>;

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Zwei-Faktor-Login einrichten/ausschalten – für Admins und Kunden-Logins. */
export async function TotpPanel({
  userId,
  startAction,
  confirmAction,
  disableAction,
  doneHref,
  readOnly = false,
}: {
  userId: string;
  startAction: () => Promise<void>;
  confirmAction: FormAction;
  disableAction: FormAction;
  doneHref: string;
  readOnly?: boolean;
}) {
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true, totpSecretEnc: true, totpEnabledAt: true, totpBackupCodes: true },
  });
  const keyReady = !!process.env.ENCRYPTION_KEY;
  let qr: string | null = null;
  let secret: string | null = null;
  if (!readOnly && user.totpSecretEnc && !user.totpEnabledAt && keyReady) {
    try {
      secret = decryptSecret(user.totpSecretEnc);
      qr = await QRCode.toDataURL(otpauthUrl(secret, user.email), { margin: 1, width: 220 });
    } catch {
      // Angefangene Einrichtung nicht lesbar (z. B. Schlüssel gewechselt) → neu „Einrichten“
      secret = null;
      qr = null;
    }
  }

  if (!keyReady) return <p className="text-amber-800">Zwei-Faktor-Login ist gerade nicht verfügbar (Schlüssel fehlt auf dem Server).</p>;
  if (user.totpEnabledAt) {
    return (
      <>
        <p className="font-medium text-emerald-700">
          Aktiv seit {fmt(user.totpEnabledAt)} · {user.totpBackupCodes.length} Notfall-Codes übrig
        </p>
        {readOnly ? null : <DisableTotpForm disableAction={disableAction} />}
      </>
    );
  }
  if (qr && secret) {
    return (
      <>
        <p>1. QR-Code mit der Authenticator-App scannen (z. B. Google Authenticator, Microsoft Authenticator, 1Password).</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} className="rounded-[var(--radius-md)] border border-[color:var(--border)]" />
        <p className="text-xs text-[color:var(--muted)]">
          Kein Scan möglich (z. B. in der App auf demselben Handy)? Schlüssel von Hand eingeben:{" "}
          <span className="select-all break-all font-mono">{secret}</span>
        </p>
        <p>2. Den 6-stelligen Code aus der App eingeben:</p>
        <ConfirmTotpForm confirmAction={confirmAction} doneHref={doneHref} />
      </>
    );
  }
  return (
    <>
      <p className="text-[color:var(--muted)]">Nach dem Passwort fragt die Anmeldung zusätzlich einen Code aus der Authenticator-App ab.</p>
      {readOnly ? null : (
        <form action={startAction}>
          <button className="inline-flex h-12 items-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)]">
            Einrichten
          </button>
        </form>
      )}
    </>
  );
}
