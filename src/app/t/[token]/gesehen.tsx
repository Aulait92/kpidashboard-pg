"use client";

import { useEffect } from "react";
import { gesehenAction } from "./actions";

/**
 * Meldet einmal nach dem Laden im Browser, dass der Lead die Seite geöffnet hat (zählt als Reaktion und stoppt das
 * Nachfassen). Link-Scanner der Mailprogramme rufen die Seite nur ab, ohne Skripte auszuführen.
 */
export function Gesehen({ token }: { token: string }) {
  useEffect(() => {
    const t = setTimeout(() => void gesehenAction(token).catch(() => null), 1500);
    return () => clearTimeout(t);
  }, [token]);
  return null;
}
