// Öffentliche App-Demo: In einer Demo-Anfrage geht nichts nach außen (Ole 16.11.2026). Zentrale Sperre für fetch und
// http(s).request, eingehängt beim Start (src/instrumentation.ts). Greift nur, wenn die laufende Anfrage das signierte
// Demo-Kennzeichen trägt (lib/app-demo/anfrage.ts); alle anderen Anfragen, Cron und Skripte laufen unverändert.
// Aufrufer sehen einen Netzwerkfehler wie bei einem Ausfall (die Seiten fangen das ohnehin ab).

import http from "node:http";
import https from "node:https";
import { istDemoAnfrage } from "./anfrage";

const g = globalThis as unknown as { appDemoAusgangGesperrt?: boolean };

const ziel = (x: unknown): string => {
  try {
    if (typeof x === "string") return new URL(x).host;
    if (x instanceof URL) return x.host;
    if (x && typeof x === "object" && "url" in x) return new URL(String((x as { url: string }).url)).host;
    if (x && typeof x === "object") return String((x as { hostname?: string; host?: string }).hostname ?? (x as { host?: string }).host ?? "?");
  } catch {
    /* unbekannt */
  }
  return "?";
};

function gesperrt(was: string, host: string): Error {
  console.warn(`[app-demo] Anfrage nach außen gesperrt (${was} ${host})`);
  return new Error("App-Demo: keine Anfragen nach außen.");
}

export function sperreAusgangInDerDemo(): void {
  if (g.appDemoAusgangGesperrt) return;
  g.appDemoAusgangGesperrt = true;
  const fetchVorher = globalThis.fetch;
  globalThis.fetch = function demoFetch(input: RequestInfo | URL, init?: RequestInit) {
    if (istDemoAnfrage()) return Promise.reject(gesperrt("fetch", ziel(input)));
    return fetchVorher(input, init);
  } as typeof fetch;
  for (const [name, mod] of [["http", http], ["https", https]] as const) {
    const req = mod.request.bind(mod);
    const get = mod.get.bind(mod);
    (mod as { request: unknown }).request = (...args: Parameters<typeof http.request>) => {
      if (istDemoAnfrage()) throw gesperrt(`${name}.request`, ziel(args[0]));
      return (req as (...a: unknown[]) => unknown)(...args);
    };
    (mod as { get: unknown }).get = (...args: Parameters<typeof http.get>) => {
      if (istDemoAnfrage()) throw gesperrt(`${name}.get`, ziel(args[0]));
      return (get as (...a: unknown[]) => unknown)(...args);
    };
  }
}
