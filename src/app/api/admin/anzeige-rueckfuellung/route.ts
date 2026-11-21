import { after } from "next/server";
import { getCurrentSession } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { sendToAdmins } from "@/lib/push";
import { reportError } from "@/lib/monitoring";

// Anzeige am Lead nachtragen (Ole, 17.11.2026, lib/anzeige-rueckfuellung.ts), nur Admins.
//   GET   Trockenlauf (zählt nur, ohne Meta-Abruf, schreibt nichts) mit Knopf „Jetzt ausführen“
//   POST  Rückfüllung ausführen (Meta-Abruf der letzten 90 Tage, nur leere Felder, nur Leads ab Startdatum je Kunde),
//         danach Kosten je Anzeige bis 90 Tage zurück abgleichen. Läuft nach der Antwort; Ergebnis per Push und im Log.
// Idempotent: ein zweiter Lauf setzt nichts doppelt und überschreibt nichts.
export const dynamic = "force-dynamic";

const g = globalThis as typeof globalThis & { __anzeigeRueckfuellung?: boolean };

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const page = (title: string, body: string) =>
  new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>` +
      `<style>body{font-family:system-ui,sans-serif;margin:16px;max-width:900px}pre{white-space:pre-wrap;background:#f4f4f5;padding:12px;border-radius:8px;font-size:13px}button{font-size:16px;padding:10px 16px;border-radius:8px}</style></head>` +
      `<body><h1>${esc(title)}</h1>${body}</body></html>`,
    { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );

async function admin() {
  const session = await getCurrentSession();
  return session && session.role === "ADMIN" ? session : null;
}

export async function GET(): Promise<Response> {
  if (!(await admin())) return new Response("Nicht erlaubt.", { status: 403 });
  const { fuelleAnzeigenNach } = await import("@/lib/anzeige-rueckfuellung");
  const v = await fuelleAnzeigenNach({ dryRun: true });
  const kurz = {
    leadsZuPruefen: v.leads.geprueft,
    ausDatenbankFuellbar: v.leads.aktualisiert,
    felder: v.leads.felder,
    einsendungen: v.einsendungen,
    metaAbfragen: v.meta.abfragen,
    aelterAls90Tage: v.meta.aelterAls90Tage,
    kundenOhneStartdatum: v.ohneStartdatum,
    kunden: v.kunden.map((k) => ({ name: k.name, start: k.start?.slice(0, 10), quelle: k.quelle, leads: k.leads, ohneAnzeige: k.ohneAnzeige })),
  };
  return page(
    "Anzeige am Lead nachtragen",
    `<p>Trockenlauf: nichts geändert. Beim Ausführen fragt die App bei Meta je Lead der letzten 90 Tage die Anzeige ab (keine Personendaten) und füllt nur leere Felder, je Kunde nur ab dem Startdatum.</p>` +
      `<form method="post"><button type="submit">Jetzt ausführen</button></form><pre>${esc(JSON.stringify(kurz, null, 2))}</pre>`,
  );
}

export async function POST(req: Request): Promise<Response> {
  const session = await admin();
  if (!session) return new Response("Nicht erlaubt.", { status: 403 });
  // Nur aus der App selbst (Formular oben), nicht von fremden Seiten
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host && new URL(origin).host !== host) return new Response("Nicht erlaubt.", { status: 403 });
  if (g.__anzeigeRueckfuellung) return page("Läuft bereits", "<p>Die Rückfüllung läuft schon. Ergebnis kommt per Mitteilung.</p>");
  g.__anzeigeRueckfuellung = true;
  after(async () => {
    try {
      const { fuelleAnzeigenNach } = await import("@/lib/anzeige-rueckfuellung");
      const r = await fuelleAnzeigenNach({ dryRun: false });
      const { syncAnzeigeKosten } = await import("@/lib/anzeige-kosten");
      const k = await syncAnzeigeKosten({ voll: true });
      const text = `Leads ergänzt: ${r.leads.aktualisiert} von ${r.leads.geprueft}, Einsendungen: ${r.einsendungen.aktualisiert}, Meta-Abrufe ${r.meta.ok}/${r.meta.abfragen}${r.meta.abgebrochen ? " (abgebrochen)" : ""}. Kosten je Anzeige: ${k.gespeichert} Zeilen${k.fehler ? `, ${k.fehler} Konten mit Fehler` : ""}.`;
      console.log(`[anzeige-rueckfuellung] ${text}`, JSON.stringify({ felder: r.leads.felder, quellen: r.quellen, fehler: r.fehler, konten: k.konten }));
      await audit("anzeige.rueckfuellung", { actor: { id: session.userId, email: session.email, role: session.role }, details: { leads: r.leads.aktualisiert, einsendungen: r.einsendungen.aktualisiert, kostenZeilen: k.gespeichert } }).catch(() => {});
      await sendToAdmins({ title: "Anzeige am Lead nachgetragen", body: text, url: "/admin/neu", tag: "anzeige-rueckfuellung" }).catch(() => {});
    } catch (err) {
      reportError(err, "anzeige-rueckfuellung");
    } finally {
      g.__anzeigeRueckfuellung = false;
    }
  });
  return page("Rückfüllung gestartet", "<p>Läuft im Hintergrund (je nach Anzahl der Leads einige Minuten). Das Ergebnis kommt als Mitteilung; Abdeckung danach in der Diagnose „anzeige-abdeckung“.</p>");
}
