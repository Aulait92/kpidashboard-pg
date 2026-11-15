"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect, useState } from "react";
import { isNewVersionError, NEUE_VERSION_TEXT, reloadForNewVersion } from "@/lib/neue-version";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  // Server Action nach einem Deploy unbekannt (alter Tab): einmal neu laden statt Fehlerseite
  const newVersion = isNewVersionError(error);
  const [reloading, setReloading] = useState(newVersion);
  useEffect(() => {
    if (newVersion) {
      const t = setTimeout(() => {
        if (!reloadForNewVersion()) setReloading(false);
      }, 0);
      return () => clearTimeout(t);
    }
    Sentry.captureException(error);
  }, [error, newVersion]);

  return (
    <html lang="de">
      <body style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        {newVersion ? (
          reloading ? null : (
            <>
              <p>{NEUE_VERSION_TEXT}</p>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ marginTop: "1rem", padding: "0.7rem 1.2rem", borderRadius: 8, border: 0, background: "#2563eb", color: "#fff", fontWeight: 600, fontSize: "1rem" }}
              >
                Neu laden
              </button>
            </>
          )
        ) : (
          <>
            <h1>Etwas ist schiefgelaufen.</h1>
            <p>Der Fehler wurde gemeldet. Bitte laden Sie die Seite neu.</p>
          </>
        )}
      </body>
    </html>
  );
}
