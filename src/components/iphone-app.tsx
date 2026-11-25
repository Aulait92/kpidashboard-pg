"use client";

// iPhone-App im App Store (Ole, 24.11.2026, lib/app-store.ts):
// - Einrichtung, letzter Schritt „App aufs Handy“: Hauptknopf zum Store, am Computer zusätzlich QR-Code,
//   darunter „Ich habe kein iPhone“ (Android kommt bald, Web-App-Weg, Schritt gilt als erledigt)
// - Hinweiskarte auf „Heute“ für Logins ohne App-Anmeldung (iPhone, Computer mit QR-Code, Android)

import { useEffect, useState, useTransition } from "react";
import QRCode from "qrcode";
import { CheckCircle2, Smartphone, X } from "lucide-react";
import { buttonClass } from "@/components/ui";
import { InstallApp } from "@/components/install-app";
import { ANDROID_BALD_TEXT, IOS_APP_STORE_URL, type AppHinweisArt, type Geraet } from "@/lib/app-store";
import { skipSetupStepAction } from "@/app/buyer/einrichtung/actions";
import { appHinweisWegklickenAction } from "@/app/buyer/app-hinweis-actions";

/** QR-Code des Store-Links (Kamera des iPhones öffnet die App direkt im App Store). */
export function AppStoreQr({ size = 120 }: { size?: number }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(IOS_APP_STORE_URL, { margin: 1, width: size * 2 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, [size]);
  if (!src) return <div style={{ width: size, height: size }} className="shrink-0" aria-hidden />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QR-Code: performancegrowth im App Store"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className="shrink-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white p-1"
      data-app-store-qr
    />
  );
}

function StoreKnopf({ label, voll, neben }: { label: string; voll?: boolean; neben?: boolean }) {
  return (
    <a
      href={IOS_APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      // Auf „Heute“ nur Nebenaktion (Hauptaktion bleibt „Anrufen“), in der Einrichtung der Hauptknopf
      className={buttonClass(neben ? "secondary" : "primary", "md", voll ? "h-12 w-full text-[15px] sm:w-auto sm:min-w-[220px]" : undefined)}
      data-app-store-link
    >
      <Smartphone className="h-4 w-4" />
      {label}
    </a>
  );
}

/** Einrichtungsschritt „App aufs Handy“ (letzter Schritt). `geraet` kommt vom Server (User-Agent). */
export function IphoneAppSchritt({ geraet, appUrl, readOnly, angemeldet }: { geraet: Geraet; appUrl: string; readOnly: boolean; angemeldet: boolean }) {
  const [keinIphone, setKeinIphone] = useState(geraet === "android");
  const [pending, start] = useTransition();

  // In der App: angemeldet, hier geht es nur noch um die Mitteilungen
  if (geraet === "app") return <InstallApp appUrl={appUrl} />;

  if (angemeldet) {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" data-app-angemeldet>
        <CheckCircle2 className="h-4 w-4" /> Sie sind in der iPhone-App angemeldet.
      </p>
    );
  }

  const ohneIphone = () => {
    setKeinIphone(true);
    if (readOnly) return;
    start(async () => {
      const fd = new FormData();
      fd.set("kind", "app");
      await skipSetupStepAction({}, fd);
    });
  };

  if (keinIphone) {
    return (
      <div data-kein-iphone>
        <p className="text-[15px]">{ANDROID_BALD_TEXT}</p>
        {geraet === "android" ? (
          <div className="mt-4">
            <InstallApp appUrl={appUrl} />
          </div>
        ) : (
          // Bisheriger Weg (Web-App auf den Startbildschirm, Mitteilungen im Browser) hinter einem Klick
          <details className="mt-3 text-sm">
            <summary className="inline-flex min-h-10 cursor-pointer items-center font-semibold text-[color:var(--brand)]">Web-App aufs Handy legen</summary>
            <div className="mt-2">
              <InstallApp appUrl={appUrl} />
            </div>
          </details>
        )}
        {geraet === "android" && !readOnly ? (
          <button
            type="button"
            onClick={ohneIphone}
            disabled={pending}
            className="mt-4 text-sm font-semibold text-[color:var(--muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--brand)] disabled:opacity-60"
          >
            Schritt erledigt
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div data-iphone-app-schritt>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {geraet === "desktop" ? <AppStoreQr /> : null}
        <div className="min-w-0 flex-1">
          <p className="text-[15px]">
            Installieren Sie zum Schluss die iPhone-App, damit Sie jeden neuen Lead sofort sehen und noch in den ersten Minuten anrufen können.
          </p>
          <div className="mt-4">
            <StoreKnopf label="iPhone-App installieren" voll />
          </div>
          {geraet === "desktop" ? <p className="mt-2 text-sm text-[color:var(--muted)]">Oder den Code mit der Kamera Ihres iPhones scannen.</p> : null}
        </div>
      </div>
      <button
        type="button"
        onClick={ohneIphone}
        disabled={pending}
        className="mt-4 inline-flex min-h-10 items-center text-sm font-semibold text-[color:var(--muted)] underline decoration-dotted underline-offset-2 hover:text-[color:var(--brand)] disabled:opacity-60"
        data-kein-iphone-link
      >
        Ich habe kein iPhone
      </button>
      {/* Usability-Check 25.11.2026: Android-Nutzer sehen schon vor dem Klick, wie es für sie weitergeht */}
      <p className="mt-1 text-sm text-[color:var(--muted)]" data-android-hinweis>
        Android-App folgt, bis dahin nutzen Sie die Web-App.
      </p>
    </div>
  );
}

/** Hinweiskarte auf „Heute“ (eine Karte, wegklickbar, dauerhaft je Login). */
export function AppHinweisKarte({ art }: { art: AppHinweisArt }) {
  const [hidden, setHidden] = useState(false);
  const [, start] = useTransition();
  if (hidden) return null;
  const close = () => {
    setHidden(true);
    start(() => appHinweisWegklickenAction());
  };
  return (
    <div className="mb-4 flex items-start gap-3 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] px-4 py-3 shadow-[var(--shadow-sm)]" data-app-hinweis={art}>
      {art === "desktop" ? <AppStoreQr size={96} /> : <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-[color:var(--brand)]" />}
      <div className="min-w-0 flex-1">
        {art === "android" ? null : <div className="font-semibold">Die iPhone-App ist da</div>}
        <p className={art === "android" ? "text-sm" : "mt-0.5 text-sm text-[color:var(--muted)]"}>
          {art === "iphone"
            ? "Laden Sie die App, dann sehen Sie jeden neuen Lead sofort und können in den ersten 5 Minuten anrufen."
            : art === "desktop"
              ? "Halten Sie die Kamera Ihres iPhones auf den Code, dann öffnet sich die App direkt im App Store."
              : ANDROID_BALD_TEXT}
        </p>
        {art === "iphone" ? (
          <div className="mt-2">
            <StoreKnopf label="App laden" neben />
          </div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label="Hinweis schließen"
        className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)] hover:text-[color:var(--foreground)]"
        data-app-hinweis-zu
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
