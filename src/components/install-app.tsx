"use client";

// Einrichtung: „App aufs Handy“ – Installationsanleitung je Gerät + Push einschalten.
// iPhone: Web-Push geht nur, wenn die App über „Zum Home-Bildschirm“ installiert ist.
// Android/Chrome: Installieren-Knopf über das beforeinstallprompt-Ereignis.

import { useEffect, useState } from "react";
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
            <li className="flex gap-2.5"><Num n={1} /><span>Diese Seite in <b>Safari</b> öffnen (nicht in WhatsApp oder Chrome): {appUrl}</span></li>
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
        <p className="text-[color:var(--muted)]">Legen Sie die App auf Ihren Startbildschirm – dann ist sie wie eine normale App mit einem Tipp da.</p>
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

  return (
    <div className="text-sm">
      <p className="text-[color:var(--muted)]">
        Öffnen Sie <b className="text-[color:var(--foreground)]">{appUrl}</b> auf Ihrem Handy und melden Sie sich an. Hier erscheint dann die
        Anleitung für Ihr Gerät. Auf diesem Computer können Sie Benachrichtigungen direkt einschalten:
      </p>
      {pushPart}
    </div>
  );
}

function Num({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[11px] font-bold text-[color:var(--brand-dark)]">
      {n}
    </span>
  );
}
