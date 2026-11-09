"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="de">
      <body style={{ fontFamily: "sans-serif", padding: "2rem" }}>
        <h1>Etwas ist schiefgelaufen.</h1>
        <p>Der Fehler wurde gemeldet. Bitte lade die Seite neu.</p>
      </body>
    </html>
  );
}
