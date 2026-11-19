"use client";

import { useEffect } from "react";
import { buchungsseiteGezeigtAction } from "./actions";

/**
 * Meldet einmal nach dem Laden im Browser, dass die Buchungsseite angezeigt wurde (Splittest buchungsseite_kompakt,
 * lib/experimente.ts). Abrufe ohne Skript (Link-Vorschau, Scanner) zählen so nicht mit.
 */
export function Gezeigt({ aufruf }: { aufruf: string }) {
  useEffect(() => {
    const t = setTimeout(() => void buchungsseiteGezeigtAction(aufruf).catch(() => null), 800);
    return () => clearTimeout(t);
  }, [aufruf]);
  return null;
}
