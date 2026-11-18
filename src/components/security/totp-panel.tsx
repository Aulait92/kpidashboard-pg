import QRCode from "qrcode";
import { decryptSecret } from "@/lib/encryption";
import { prisma } from "@/lib/prisma";
import { otpauthUrl } from "@/lib/totp";
import type { TotpState } from "@/lib/totp-account";
import { ConfirmTotpForm, DisableTotpForm, TotpRahmen } from "./totp-forms";

type FormAction = (prev: TotpState, fd: FormData) => Promise<TotpState>;

const fmt = (d: Date) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", year: "numeric" }).format(d);

/** Zwei-Faktor-Login einrichten/ausschalten – für Admins und Kunden-Logins. */
export async function TotpPanel(props: Parameters<typeof TotpPanelInhalt>[0]) {
  // Rahmen hält die Notfall-Codes über das Neuladen nach dem Bestätigen hinweg (totp-forms.tsx)
  return (
    <TotpRahmen confirmAction={props.confirmAction} doneHref={props.doneHref} doneLabel={props.doneLabel}>
      <TotpPanelInhalt {...props} />
    </TotpRahmen>
  );
}

async function TotpPanelInhalt({
  userId,
  startAction,
  confirmAction,
  disableAction,
  doneHref,
  doneLabel,
  readOnly = false,
  aktivZusatz,
}: {
  userId: string;
  startAction: () => Promise<void>;
  confirmAction: FormAction;
  disableAction: FormAction;
  doneHref: string;
  /** Beschriftung nach dem Sichern der Notfall-Codes (Standard „Gesichert, fertig“) */
  doneLabel?: string;
  readOnly?: boolean;
  /** Statt „Ausschalten“, wenn aktiv (z. B. „Weiter“ auf der Einrichtungs-Karte) */
  aktivZusatz?: React.ReactNode;
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
        {aktivZusatz ?? (readOnly ? null : <DisableTotpForm disableAction={disableAction} />)}
      </>
    );
  }
  if (qr && secret) {
    const appLink = otpauthUrl(secret, user.email);
    const qrBild = (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={qr} alt="QR-Code für die Authenticator-App" width={220} height={220} className="rounded-[var(--radius-md)] border border-[color:var(--border)]" />
    );
    const schluessel = (
      <p className="text-sm text-[color:var(--muted)]">
        Schlüssel von Hand: <span className="select-all break-all font-mono text-[color:var(--foreground)]">{secret}</span>
      </p>
    );
    return (
      <>
        <p>1. Authenticator-App verbinden (z. B. Google Authenticator, Microsoft Authenticator, 1Password).</p>
        {/* Handy zuerst: Auf dem Handy öffnet der Link die App direkt (kein QR-Code auf demselben Bildschirm) */}
        <div className="space-y-2 sm:hidden">
          <a href={appLink} className="inline-flex h-12 w-full items-center justify-center rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white" data-totp-app-link>
            In der Authenticator-App öffnen
          </a>
          <details className="text-sm text-[color:var(--muted)]">
            <summary className="min-h-10 cursor-pointer py-2">Anderes Gerät: QR-Code anzeigen</summary>
            <div className="space-y-2 pb-1">
              {qrBild}
              {schluessel}
            </div>
          </details>
        </div>
        <div className="hidden space-y-2 sm:block">
          {qrBild}
          <details className="text-sm text-[color:var(--muted)]">
            <summary className="min-h-10 cursor-pointer py-2">Kein Scan möglich?</summary>
            {schluessel}
          </details>
        </div>
        <p>2. Den 6-stelligen Code aus der App eingeben:</p>
        <ConfirmTotpForm confirmAction={confirmAction} doneHref={doneHref} doneLabel={doneLabel} />
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
