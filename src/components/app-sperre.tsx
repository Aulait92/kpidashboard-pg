"use client";

// Sperrbildschirm der App-Store-App mit Face ID (Ole, 25.11.2026: Face ID bei jedem Öffnen).
// - Beim Start und nach mehr als einer Minute im Hintergrund: Face ID → Geräte-Schlüssel einlösen
//   (lib/native-bridge.ts, faceIdEntsperren) → neue Sitzung. Auf /login geht es danach direkt zum Ziel.
// - Bis dahin ist die Seite verdeckt: Das Inline-Skript in app/layout.tsx setzt schon vor dem ersten Bild die
//   Klasse pg-gesperrt (globals.css blendet dann alles außer #pg-sperre aus) und lässt den Startbildschirm stehen.
// - Angemeldet in der iPhone-App, Face ID eingerichtet und nicht abgewählt: Face ID automatisch einrichten.
// Im Browser rendert und tut das nichts.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ScanFace } from "lucide-react";
import { Button } from "@/components/ui";
import { biometrie, faceIdAbgewaehlt, faceIdAn, faceIdBeenden, faceIdEinrichten, faceIdEntsperren, forgetNativeDevice, isNativeApp, nativePlatform } from "@/lib/native-bridge";

/** Ab so langer Zeit im Hintergrund fragt die App beim Zurückkehren wieder nach Face ID. */
const SPERRE_NACH_MS = 60_000;

type Zustand = "aus" | "laeuft" | "wartet";

function splashAusblenden() {
  const p = (window as unknown as { Capacitor?: { Plugins?: { SplashScreen?: { hide?: (o: unknown) => Promise<void> } } } }).Capacitor?.Plugins?.SplashScreen;
  void p?.hide?.({ fadeOutDuration: 200 }).catch(() => {});
}

function seiteFreigeben() {
  document.documentElement.classList.remove("pg-gesperrt");
}

export function AppSperre() {
  const router = useRouter();
  const [zustand, setZustand] = useState<Zustand>("aus");
  const [name, setName] = useState("Face ID");
  const laeuft = useRef(false);

  const entsperren = useCallback(async () => {
    if (laeuft.current) return;
    laeuft.current = true;
    setZustand("laeuft");
    const next = new URLSearchParams(window.location.search).get("next");
    const r = await faceIdEntsperren(next, "App entsperren");
    laeuft.current = false;
    if (r.status === "abgebrochen") {
      setZustand("wartet");
      return;
    }
    if (r.status === "angemeldet" && window.location.pathname.startsWith("/login")) {
      // Sperre bleibt sichtbar, bis die Zielseite geladen ist
      window.location.replace(r.ziel);
      return;
    }
    setZustand("aus");
    seiteFreigeben();
    if (r.status === "angemeldet") router.refresh();
  }, [router]);

  const sperren = useCallback(() => {
    document.documentElement.classList.add("pg-gesperrt");
    void entsperren();
  }, [entsperren]);

  // Start
  useEffect(() => {
    if (!isNativeApp()) return;
    void biometrie().then((b) => setName(b.name));
    if (faceIdAn()) {
      const t = setTimeout(() => {
        sperren();
        // Startbildschirm erst ausblenden, wenn die Sperre gezeichnet ist
        requestAnimationFrame(() => splashAusblenden());
      }, 0);
      return () => clearTimeout(t);
    }
    seiteFreigeben();
    // Automatisch einrichten: nur iPhone (Android-App kommt später), nur angemeldet, nicht vom Nutzer abgewählt
    const p = window.location.pathname;
    if (nativePlatform() === "ios" && !faceIdAbgewaehlt() && (p.startsWith("/buyer") || p.startsWith("/admin"))) {
      void faceIdEinrichten();
    }
  }, [sperren]);

  // Zurück aus dem Hintergrund
  useEffect(() => {
    if (!isNativeApp()) return;
    type CapApp = { addListener?: (e: string, cb: () => void) => Promise<{ remove: () => void }> | { remove: () => void } };
    const app = (window as unknown as { Capacitor?: { Plugins?: { App?: CapApp } } }).Capacitor?.Plugins?.App;
    let weg = 0;
    const handles: Array<Promise<{ remove: () => void }> | { remove: () => void } | undefined> = [
      app?.addListener?.("pause", () => {
        weg = Date.now();
      }),
      app?.addListener?.("resume", () => {
        if (faceIdAn() && weg && Date.now() - weg > SPERRE_NACH_MS) sperren();
        weg = 0;
      }),
    ];
    return () => {
      for (const h of handles) void Promise.resolve(h).then((x) => x?.remove());
    };
  }, [sperren]);

  const mitPasswort = () => {
    faceIdBeenden();
    forgetNativeDevice();
    const f = document.createElement("form");
    f.method = "POST";
    f.action = "/api/auth/logout";
    document.body.appendChild(f);
    f.submit();
  };

  if (zustand === "aus") return null;
  return (
    <div
      id="pg-sperre"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pg-sperre-titel"
      className="fixed inset-0 z-[1000] flex flex-col items-center justify-center overscroll-contain bg-[color:var(--background)] px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
    >
      <div className="flex w-full max-w-xs flex-1 flex-col items-center justify-center text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-[color:var(--brand)]">
          <ScanFace className="h-8 w-8" aria-hidden="true" />
        </span>
        <h1 id="pg-sperre-titel" className="mt-5 text-balance text-xl font-semibold">
          App entsperren
        </h1>
      </div>
      {zustand === "wartet" ? (
        <div className="flex w-full max-w-xs flex-col gap-2">
          <Button variant="primary" size="md" icon={ScanFace} onClick={() => void entsperren()} className="w-full">
            Mit {name} entsperren
          </Button>
          <Button variant="ghost" size="md" onClick={mitPasswort} className="w-full">
            Mit Passwort anmelden
          </Button>
        </div>
      ) : null}
    </div>
  );
}
