"use client";

// Rahmen der öffentlichen App-Demo (/app-demo, Ole 16.11.2026): Banner „Demo mit Beispieldaten“, kurzer Rundgang
// (überspringbar) und die Weichen im Browser:
// - Links der echten Seiten (/buyer/…) bleiben in der Demo (/app-demo/…).
// - Anfragen an /api/… verlassen den Browser nicht (die Middleware lehnt sie aus der Demo ohnehin ab).
// Server Actions beantwortet die Middleware mit „In der Demo wird nichts gespeichert.“ (lib/app-demo/weiche.ts).

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { APP_DEMO_PREFIX } from "@/lib/app-demo/marke";
import { APP_REVIEW_COOKIE, DEMO_NICHT_ENTHALTEN, buyerZuDemo } from "@/lib/app-demo/weiche";

export type DemoTourZiele = { chat: string | null; termin: string | null };

type Schritt = { pfad: string; titel: string; text: string };

/** Rundgang: sechs Hinweise, einer je Station. Ohne Gedankenstriche (öffentliche Seite). */
export function tourSchritte(z: DemoTourZiele): Schritt[] {
  const s: Schritt[] = [
    { pfad: APP_DEMO_PREFIX, titel: "Heute", text: "Ihre Aufgaben des Tages: Termine, Rückmeldungen und Rückrufe. Abarbeiten, fertig." },
  ];
  if (z.chat) s.push({ pfad: `${APP_DEMO_PREFIX}/chats?c=${z.chat}`, titel: "Der Assistent im Chat", text: "Er schreibt neue Anfragen per WhatsApp an, klärt den Bedarf und bucht den Termin direkt im Chat." });
  s.push({ pfad: `${APP_DEMO_PREFIX}/kontakte?modus=pipeline`, titel: "Kontakte und Pipeline", text: "Jeder Kontakt mit Stand und nächstem Schritt. „Kein WhatsApp“ heißt: lieber anrufen." });
  if (z.termin) {
    s.push({ pfad: `${APP_DEMO_PREFIX}/termine/${z.termin}/vorbereitung`, titel: "Terminvorbereitung", text: "Vor dem Termin Tarife auswählen. Die Angaben aus dem Chat sind schon da." });
    s.push({ pfad: `${APP_DEMO_PREFIX}/termine/${z.termin}/praesentation`, titel: "Beratungspräsentation", text: "Im Termin Bildschirm teilen und Bausteine an- und abwählen. Der Beitrag rechnet sich sofort neu." });
  }
  s.push({ pfad: `${APP_DEMO_PREFIX}/zahlen#monatsberichte`, titel: "Zahlen und Monatsbericht", text: "Anfragen, Termine, Abschlüsse und Gewinn. Dazu jeden Monat ein Bericht." });
  return s;
}

const SPEICHER = "app-demo-tour";
const lesen = (): string | null => {
  try {
    return window.sessionStorage.getItem(SPEICHER);
  } catch {
    return null;
  }
};
const schreiben = (v: string) => {
  try {
    window.sessionStorage.setItem(SPEICHER, v);
  } catch {
    /* ohne Speicher: Rundgang nur in diesem Seitenaufruf */
  }
};

/** Mit dem Prüfer-Zugang angemeldet (lib/app-demo/app-review.ts)? Nur im Browser lesbar. */
export function hatPrueferCookie(cookie: string): boolean {
  return cookie.split(";").some((c) => c.trim() === `${APP_REVIEW_COOKIE}=1`);
}

/** Prüfer-Demo verlassen: Kennzeichen löschen, zurück zur Anmeldung. */
function demoVerlassen() {
  document.cookie = `${APP_REVIEW_COOKIE}=; Max-Age=0; path=/`;
  // Volle Navigation: Root-Layout der Anmeldung (ohne Shell) neu rendern, wie nach der Anmeldung
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

function istAction(h: HeadersInit | undefined): boolean {
  if (!h) return false;
  if (h instanceof Headers) return h.has("next-action");
  if (Array.isArray(h)) return h.some(([k]) => k.toLowerCase() === "next-action");
  return Object.keys(h).some((k) => k.toLowerCase() === "next-action");
}

function istApi(url: string): boolean {
  try {
    const u = new URL(url, window.location.href);
    return u.origin === window.location.origin && u.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

export function AppDemoRahmen({ ziele }: { ziele: DemoTourZiele }) {
  const router = useRouter();
  const toast = useToast();
  const pathname = usePathname();
  const params = useSearchParams();
  const schritte = tourSchritte(ziele);
  const [schritt, setSchritt] = useState<number | null>(null);
  const [pruefer, setPruefer] = useState(false);

  // Prüfer-Zugang der App-Store-Prüfung: „Abmelden“ im Banner (Demo verlassen)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Cookie nur im Browser lesbar
    setPruefer(hatPrueferCookie(document.cookie));
  }, []);

  // Rundgang: beim ersten Besuch automatisch, sonst über den Knopf im Banner
  useEffect(() => {
    const v = lesen();
    if (v === "aus" || (v == null && window.location.pathname !== APP_DEMO_PREFIX)) return;
    const n = v ? Number(v) : 0;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Stand aus dem Sitzungsspeicher (nur im Browser lesbar)
    setSchritt(Number.isInteger(n) && n >= 0 && n < schritte.length ? n : 0);
  }, [schritte.length]);

  // Hinweis nach Umleitung aus einem Bereich, der nicht in der Demo ist
  useEffect(() => {
    if (params.get("hinweis") === DEMO_NICHT_ENTHALTEN) toast.show({ message: "Dieser Bereich ist in der Demo nicht enthalten." });
  }, [params, toast]);

  // Links auf /buyer/… in der Demo halten; /api/… (Downloads, Abmelden) gibt es in der Demo nicht
  useEffect(() => {
    const klick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a) return;
      const u = new URL(a.href, window.location.href);
      if (u.origin !== window.location.origin) return;
      if (u.pathname.startsWith("/api/") || u.pathname === "/login") {
        e.preventDefault();
        e.stopImmediatePropagation();
        toast.show({ message: "In der Demo nicht verfügbar." });
        return;
      }
      const ziel = buyerZuDemo(u.pathname);
      if (!ziel) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      router.push(ziel + u.search + u.hash);
    };
    const absenden = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement | null;
      const action = f?.getAttribute("action");
      // Formulare mit Server Action haben kein echtes Ziel (React); nur klassische Formulare abfangen
      if (action && !action.startsWith("javascript:")) {
        e.preventDefault();
        e.stopImmediatePropagation();
        toast.show({ message: "In der Demo wird nichts gespeichert." });
      }
    };
    window.addEventListener("click", klick, true);
    window.addEventListener("submit", absenden, true);
    const fetchVorher = window.fetch;
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (istApi(url)) return Promise.resolve(Response.json({ error: "In der Demo nicht verfügbar." }, { status: 403 }));
      // Server Action: beantwortet die Middleware (nichts wird ausgeführt); hier nur der Hinweis, auch für Formulare ohne Rückgabe
      if (istAction(init?.headers)) toast.show({ message: "In der Demo wird nichts gespeichert." });
      return fetchVorher(input, init);
    };
    const beaconVorher = navigator.sendBeacon?.bind(navigator);
    if (beaconVorher) navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => (istApi(String(url)) ? true : beaconVorher(url, data));
    return () => {
      window.removeEventListener("click", klick, true);
      window.removeEventListener("submit", absenden, true);
      window.fetch = fetchVorher;
      if (beaconVorher) navigator.sendBeacon = beaconVorher;
    };
  }, [router, toast]);

  const aktuell = schritt != null ? schritte[schritt] : null;
  const gehe = (n: number) => {
    if (n >= schritte.length) {
      schreiben("aus");
      setSchritt(null);
      return;
    }
    schreiben(String(n));
    setSchritt(n);
    const ziel = schritte[n].pfad;
    if (ziel.split(/[?#]/)[0] !== pathname) router.push(ziel);
    else if (ziel.includes("?") || ziel.includes("#")) router.replace(ziel);
  };

  return (
    <>
      <div className="flex items-center justify-center gap-3 bg-[color:var(--brand)] px-4 py-2 text-center text-sm font-medium text-white" data-demo-banner>
        <span>Demo mit Beispieldaten</span>
        {aktuell ? null : (
          <button type="button" onClick={() => gehe(0)} className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25" data-demo-tour-start>
            Rundgang
          </button>
        )}
        {pruefer ? (
          <button type="button" onClick={demoVerlassen} className="rounded-md bg-white/15 px-2.5 py-1 text-xs font-semibold hover:bg-white/25" data-demo-abmelden>
            Abmelden
          </button>
        ) : null}
      </div>
      {aktuell ? (
        <div
          role="dialog"
          aria-label={`Rundgang: ${aktuell.titel}`}
          className="ui-fade-in fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-40 rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-4 shadow-[var(--shadow-lg)] md:inset-x-auto md:bottom-6 md:right-6 md:w-80"
          data-demo-tour
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium text-[color:var(--muted)]">
                {schritt! + 1} von {schritte.length}
              </p>
              <h2 className="mt-0.5 text-base font-semibold">{aktuell.titel}</h2>
            </div>
            <button
              type="button"
              aria-label="Rundgang beenden"
              onClick={() => gehe(schritte.length)}
              className="-m-2 rounded-md p-2 text-[color:var(--muted)] hover:bg-[color:var(--surface-sunken)]"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-1.5 text-[15px] leading-snug">{aktuell.text}</p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <button type="button" onClick={() => gehe(schritte.length)} className="h-10 rounded-[var(--radius-sm)] px-2 text-sm text-[color:var(--muted)] hover:underline" data-demo-tour-skip>
              Überspringen
            </button>
            <button
              type="button"
              onClick={() => gehe(schritt! + 1)}
              className="h-10 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-4 text-sm font-semibold text-white hover:bg-[color:var(--brand-dark)]"
              data-demo-tour-weiter
            >
              {schritt! + 1 < schritte.length ? "Weiter" : "Fertig"}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
