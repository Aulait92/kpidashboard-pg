"use client";

import { useEffect } from "react";

// Klappt einen <details>-Abschnitt auf, wenn ein Link auf seinen Anker zeigt (#id), und scrollt hin.
// Gemeinsamer Baustein: jede Seite mit aufklappbaren Abschnitten und Sprunglinks (z. B. Einrichten-Liste) kann ihn nutzen.
export function AnkerOeffnen() {
  useEffect(() => {
    const oeffnen = () => {
      const id = decodeURIComponent(window.location.hash.slice(1));
      if (!id) return;
      const el = document.getElementById(id);
      if (el instanceof HTMLDetailsElement) {
        el.open = true;
        el.scrollIntoView({ block: "start" });
      }
    };
    oeffnen();
    window.addEventListener("hashchange", oeffnen);
    return () => window.removeEventListener("hashchange", oeffnen);
  }, []);
  return null;
}
