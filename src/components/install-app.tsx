"use client";

// Einrichtung: „App aufs Handy“ – Installationsanleitung je Gerät + Push einschalten.
// iPhone: Web-Push geht nur, wenn die App über „Zum Home-Bildschirm“ installiert ist.
// Android/Chrome: Installieren-Knopf über das beforeinstallprompt-Ereignis.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { BellRing, CheckCircle2, Share, SquarePlus } from "lucide-react";
import { Button } from "@/components/ui";
import { usePush } from "@/lib/use-push";
import { isNativeApp } from "@/lib/native-bridge";

type Device = "ios" | "android" | "desktop";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function detect(): { device: Device; standalone: boolean; inSafari: boolean } {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  // App-Store-App gilt als installiert
  const standalone =
    isNativeApp() ||
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // In-App-Browser (WhatsApp, Instagram, Chrome auf iOS) können keine Web-App installieren.
  const inSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|FBAN|FBAV|Instagram|WhatsApp/i.test(ua);
  return { device: ios ? "ios" : android ? "android" : "desktop", standalone, inSafari };
}

export function InstallApp({ appUrl }: { appUrl: string }) {
  const push = usePush();
  const [env, setEnv] = useState<ReturnType<typeof detect> | null>(null);
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setEnv(detect()), 0);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  if (!env) return null;

  const pushPart =
    push.status === "on" ? (
      <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-700">
        <CheckCircle2 className="h-4 w-4" /> Benachrichtigungen sind an
      </p>
    ) : push.status === "off" ? (
      <div className="mt-4">
        <Button variant="primary" size="md" icon={BellRing} disabled={push.busy} onClick={() => void push.enable()}>
          Benachrichtigungen einschalten
        </Button>
        {push.message ? <p className="mt-2 text-xs text-[color:var(--muted)]">{push.message}</p> : null}
      </div>
    ) : push.status === "denied" ? (
      <p className="mt-3 text-sm text-[color:var(--muted)]">
        {isNativeApp()
          ? "Benachrichtigungen sind für die App ausgeschaltet. Bitte in den Einstellungen des Handys unter performancegrowth → Mitteilungen erlauben."
          : "Benachrichtigungen sind im Browser blockiert. Bitte in den Einstellungen des Browsers für diese Seite erlauben."}
      </p>
    ) : null;

  if (env.standalone) {
    return (
      <div>
        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" /> Die App ist auf diesem Gerät installiert.
        </p>
        {pushPart}
      </div>
    );
  }

  if (env.device === "ios") {
    return (
      <div className="text-sm">
        <p className="text-[color:var(--muted)]">
          So bekommen Sie neue Leads sofort aufs iPhone. Einmalig, dauert 30 Sekunden:
        </p>
        <ol className="mt-3 space-y-2.5">
          {!env.inSafari ? (
            <li className="flex gap-2.5"><Num n={1} /><span>Diese Seite in <b>Safari</b> öffnen (nicht in WhatsApp oder Chrome): https://{appUrl}</span></li>
          ) : null}
          <li className="flex gap-2.5"><Num n={env.inSafari ? 1 : 2} /><span>Unten auf die <b>drei Punkte (…)</b> und dann auf <Share className="inline h-4 w-4 align-[-3px]" /> <b>Teilen</b> tippen. Bei älteren iPhones ist <b>Teilen</b> direkt unten zu sehen.</span></li>
          <li className="flex gap-2.5"><Num n={env.inSafari ? 2 : 3} /><span><SquarePlus className="inline h-4 w-4 align-[-3px]" /> <b>„Zum Home-Bildschirm“</b> wählen, dann „Hinzufügen“.</span></li>
          <li className="flex gap-2.5"><Num n={env.inSafari ? 3 : 4} /><span>Die App über das neue Symbol öffnen und dort <b>Benachrichtigungen einschalten</b>.</span></li>
        </ol>
      </div>
    );
  }

  if (env.device === "android") {
    return (
      <div className="text-sm">
        <p className="text-[color:var(--muted)]">Legen Sie die App auf Ihren Startbildschirm, dann ist sie wie eine normale App mit einem Tipp da.</p>
        {prompt ? (
          <div className="mt-4">
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                void prompt.prompt();
                setPrompt(null);
              }}
            >
              App installieren
            </Button>
          </div>
        ) : (
          <p className="mt-3">In Chrome oben rechts auf <b>⋮</b> tippen, dann <b>„App installieren“</b> bzw. „Zum Startbildschirm hinzufügen“.</p>
        )}
        {pushPart}
      </div>
    );
  }

  // Computer: QR-Code zum Scannen und die Kurzanleitung für beide Handys gleich hier (Ole, 20.11.2026: „die Anleitung
  // fehlt“; vorher stand hier nur, dass sie auf dem Handy erscheint)
  return (
    <div className="text-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <HandyQr />
        <div className="min-w-0 flex-1">
          <p className="text-[color:var(--muted)]">
            Mit der Handy-Kamera scannen oder <b className="text-[color:var(--foreground)]">https://{appUrl}</b> (ohne „www“) auf dem Handy öffnen und anmelden. Dann:
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="font-semibold">iPhone (Safari)</p>
              <ol className="mt-1.5 space-y-1.5">
                <li className="flex gap-2"><Num n={1} /><span>Unten auf <Share className="inline h-4 w-4 align-[-3px]" /> <b>Teilen</b> tippen (bei neuen iPhones erst auf <b>…</b>).</span></li>
                <li className="flex gap-2"><Num n={2} /><span><SquarePlus className="inline h-4 w-4 align-[-3px]" /> <b>„Zum Home-Bildschirm“</b>, dann „Hinzufügen“.</span></li>
                <li className="flex gap-2"><Num n={3} /><span>App über das neue Symbol öffnen, <b>Benachrichtigungen einschalten</b>.</span></li>
              </ol>
            </div>
            <div>
              <p className="font-semibold">Android (Chrome)</p>
              <ol className="mt-1.5 space-y-1.5">
                <li className="flex gap-2"><Num n={1} /><span>Oben rechts auf <b>⋮</b> tippen.</span></li>
                <li className="flex gap-2"><Num n={2} /><span><b>„App installieren“</b> bzw. „Zum Startbildschirm hinzufügen“.</span></li>
                <li className="flex gap-2"><Num n={3} /><span>App öffnen, <b>Benachrichtigungen einschalten</b>.</span></li>
              </ol>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-4 text-[color:var(--muted)]">Auf diesem Computer können Sie Benachrichtigungen direkt einschalten:</p>
      {pushPart}
    </div>
  );
}

/** QR-Code zur Einrichtung auf dem Handy (gleiche Seite, nach dem Anmelden geht es dort weiter). */
function HandyQr() {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/buyer/einrichtung`, { margin: 1, width: 240 })
      .then(setSrc)
      .catch(() => setSrc(null));
  }, []);
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="QR-Code: App auf dem Handy öffnen" width={120} height={120} className="h-[120px] w-[120px] shrink-0 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white p-1" />
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-xs font-bold text-[color:var(--brand-dark)]">
      {n}
    </span>
  );
}
