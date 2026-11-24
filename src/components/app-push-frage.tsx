"use client";

import { useEffect, useState } from "react";
import { usePush } from "@/lib/use-push";
import { isNativeApp, nativePlatform } from "@/lib/native-bridge";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui";

const APP_FRAGE_KEY = "pg-app-push-spaeter";

/**
 * iPhone-App (Ole, 24.11.2026): eigener Hinweis vor der iOS-Abfrage für Mitteilungen. Nur „Erlauben“ löst die Abfrage
 * aus, „Später“ fragt beim nächsten Öffnen der App wieder (Merker nur für diese Sitzung). Kommt aus der Web-Oberfläche,
 * braucht also keine neue App-Version.
 */
export function AppPushFrage() {
  const { status, enable } = usePush();
  const [spaeter, setSpaeter] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      let gemerkt = false;
      try {
        gemerkt = sessionStorage.getItem(APP_FRAGE_KEY) === "1";
      } catch {
        gemerkt = false;
      }
      setSpaeter(gemerkt || !isNativeApp() || nativePlatform() !== "ios");
    }, 0);
    return () => clearTimeout(t);
  }, []);
  const zu = () => {
    try {
      sessionStorage.setItem(APP_FRAGE_KEY, "1");
    } catch {
      /* egal: dann nur bis zum Neuladen */
    }
    setSpaeter(true);
  };
  return (
    <Sheet
      open={!spaeter && status === "off"}
      onClose={zu}
      title="Keinen neuen Lead verpassen"
      footer={
        <div className="flex gap-2 border-t border-[color:var(--border)] p-4">
          <Button variant="secondary" size="md" className="flex-1" onClick={zu}>
            Später
          </Button>
          <Button
            variant="primary"
            size="md"
            className="flex-1"
            data-app-push-erlauben
            onClick={() => {
              setSpaeter(true);
              void enable();
            }}
          >
            Erlauben
          </Button>
        </div>
      }
    >
      <p className="px-5 py-4 text-[15px]">
        Tippen Sie gleich auf „Erlauben“, dann meldet sich Ihr iPhone sofort bei jedem neuen Lead, solange er noch gut erreichbar ist.
      </p>
    </Sheet>
  );
}
