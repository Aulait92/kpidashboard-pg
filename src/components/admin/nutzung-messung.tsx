"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import {
  ADMIN_NUTZUNG_ROUTE,
  BEDIENBAR,
  bereinige,
  ereignisseFuerKlick,
  MAX_JE_SENDUNG,
  normalisiereAdminPfad,
  oberflaecheFuer,
  type AdminNutzungEreignis,
} from "@/lib/admin-nutzung";

// Nutzungsmessung im Admin (Ole, 18.11.2026), eingebunden in beide Rahmen (alte AdminShell, neue AdminNeuShell).
// Merkt sich Seitenwechsel (normalisierter Pfad) und Klicks auf bedienbare Elemente in einem [data-funktion] und
// schickt sie gebündelt per sendBeacon (alle 15 s, beim Verlassen oder Verstecken der Seite). Kein Rendern, kein
// Warten: der Klick selbst läuft unverändert weiter. Regeln und Datenschutz: lib/admin-nutzung.ts.

const SENDEN_ALLE_MS = 15_000;
let warteschlange: AdminNutzungEreignis[] = [];
const zuletzt = new Map<string, number>();

function senden() {
  if (warteschlange.length === 0) return;
  const e = warteschlange.slice(0, MAX_JE_SENDUNG);
  warteschlange = warteschlange.slice(MAX_JE_SENDUNG);
  const body = JSON.stringify({ n: Date.now(), e });
  try {
    // Text statt JSON-Blob: keine Preflight-Anfrage, geht auch beim Schließen des Tabs noch raus
    if (navigator.sendBeacon?.(ADMIN_NUTZUNG_ROUTE, body)) return;
  } catch {
    // weiter mit fetch
  }
  fetch(ADMIN_NUTZUNG_ROUTE, { method: "POST", body, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

function merken(neu: AdminNutzungEreignis[]) {
  const gueltig = bereinige(neu, zuletzt);
  if (gueltig.length === 0) return;
  warteschlange.push(...gueltig);
  if (warteschlange.length >= MAX_JE_SENDUNG) senden();
}

export function AdminNutzungMessung() {
  const pathname = usePathname();

  useEffect(() => {
    const k = normalisiereAdminPfad(pathname);
    if (k) merken([{ a: "seite", k, o: oberflaecheFuer(k), t: Date.now() }]);
  }, [pathname]);

  useEffect(() => {
    const onClick = (ev: MouseEvent) => {
      try {
        const ziel = ev.target instanceof Element ? ev.target.closest(BEDIENBAR) : null;
        const el = ziel?.closest("[data-funktion]");
        if (!el) return;
        const pfad = normalisiereAdminPfad(window.location.pathname);
        if (!pfad) return;
        merken(ereignisseFuerKlick(el.getAttribute("data-funktion"), oberflaecheFuer(pfad), Date.now()));
      } catch {
        // Messung darf nie stören
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") senden();
    };
    // Capture-Phase: zählt auch Klicks, deren Weitergabe ein anderer Handler stoppt (z. B. Umzugs-Links im neuen Admin)
    document.addEventListener("click", onClick, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", senden);
    const timer = window.setInterval(senden, SENDEN_ALLE_MS);
    return () => {
      document.removeEventListener("click", onClick, { capture: true });
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", senden);
      window.clearInterval(timer);
      senden();
    };
  }, []);

  return null;
}
