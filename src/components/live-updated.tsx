"use client";

import { useEffect, useState } from "react";

// Zeigt einen relativen Zeitstempel ("gerade eben" / "vor 23 Sek" /
// "vor 2 Min") basierend auf einem Server-Timestamp. Tickt clientseitig
// alle 15 Sek hoch. Bei einem Server-Re-Render (router.refresh) kommt
// `since` als neuer Wert rein und der Counter springt zurück auf 0.
export function LiveUpdated({ since }: { since: number }) {
  const [now, setNow] = useState(since);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, [since]);

  const diffSec = Math.max(0, Math.floor((now - since) / 1000));
  const text =
    diffSec < 5
      ? "gerade eben"
      : diffSec < 60
        ? `vor ${diffSec} Sek`
        : `vor ${Math.floor(diffSec / 60)} Min`;

  return <span suppressHydrationWarning>{text}</span>;
}
