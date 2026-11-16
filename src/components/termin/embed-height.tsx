"use client";

import { useEffect, useRef } from "react";

/**
 * Eingebettet auf performancegrowth.de (/termin?einbetten=1): meldet die Höhe an die Webseite,
 * damit das iframe ohne eigene Scrollleiste mitwächst, und nach einer Buchung „pg-termin-gebucht“.
 */
export function EmbedHeight({ children, booked = false }: { children: React.ReactNode; booked?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined" || window.parent === window) return;
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const send = () => {
      const hoehe = Math.ceil(el.getBoundingClientRect().height);
      if (hoehe === last) return;
      last = hoehe;
      window.parent.postMessage({ type: "pg-termin-hoehe", hoehe }, "*");
    };
    send();
    const ro = new ResizeObserver(send);
    ro.observe(el);
    if (booked) window.parent.postMessage({ type: "pg-termin-gebucht" }, "*");
    return () => ro.disconnect();
  }, [booked]);
  return (
    <div ref={ref} className="flow-root">
      {children}
    </div>
  );
}
