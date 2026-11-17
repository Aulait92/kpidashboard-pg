// Neue Terminvorbereitung (Ole, 15.11.2026; Entwurf docs/ux/terminvorbereitung-entwurf.html).
// Wer: Vermittler am Vortag oder 5 Minuten vor dem Termin, oft am Handy. Aufgabe: in 30 Sekunden wissen, wer das ist,
// was er will, was noch zu fragen ist, und mit einem Klick präsentieren. Hauptaktion: „Präsentation öffnen“.

import { FileDown, ImageIcon } from "lucide-react";
import Link from "next/link";
import { Card } from "@/components/ui";
import { ZurueckLink } from "@/components/zurueck-link";
import { prisma } from "@/lib/prisma";
import { nowMs } from "@/lib/now";
import { formatPhone } from "@/lib/format";
import { asAnsprache } from "@/lib/ansprache";
import type { BuyerContext } from "@/lib/buyer-context";
import { abschnitte, spartenVon, unterlagenFuer, type VorbereitungDaten } from "@/lib/termin-vorbereitung";
import { loadPraesentation } from "@/lib/termin-vorbereitung-server";
import { kundeWill, klaerenPunkte, KLAEREN_MAX } from "@/lib/terminvorbereitung-neu";
import { ladeTarifvorbereitung } from "@/lib/tarifauswahl-server";
import { ladePreisPilot } from "@/lib/preise/pilot-server";
import { rechnerAngaben } from "@/lib/preise/pilot";
import { VorbereitungNeu } from "./neu-client";
import { vorsorgeThema } from "@/lib/schutz-ueberblick";
import { BestehendeVertraege } from "@/components/bestehende-vertraege";
import { vorvertraegeAus } from "@/lib/whatsapp/vorvertraege";
import { lebenssituationAus } from "@/lib/whatsapp/gespraech";
import { listUnterlagen } from "@/lib/policen/server";
import { UnterlagenVomKunden } from "@/components/unterlagen-vom-kunden";
import { PolicenFreischaltungKarte } from "@/components/policen-freischaltung-karte";

const berlinTag = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);
// „Heute, 10:00 Uhr“ / „Morgen, …“ wie auf „Heute“ (UX Runde 4), sonst Datum
const chipZeit = (d: Date) => {
  const now = new Date(nowMs());
  const morgen = new Date(nowMs() + 86_400_000);
  const uhr = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d) + " Uhr";
  if (berlinTag(d) === berlinTag(now)) return `Heute, ${uhr}`;
  if (berlinTag(d) === berlinTag(morgen)) return `Morgen, ${uhr}`;
  return new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d) + " Uhr";
};

// Gleiche Spalten in allen Listen, lange Bezeichnungen brechen um statt zu überlappen (Ole, 16.11.2026: „Versicherungsinteresse“)
const LISTE = "grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-x-3 gap-y-1";
const BEZ = "break-words hyphens-auto text-[color:var(--muted)]";

export async function NeueVorbereitung({ ctx, d, von }: { ctx: BuyerContext; d: VorbereitungDaten & { id: string; leadId: string | null }; von?: string }) {
  const [tv, p, kunde, pilot, vomKunden] = await Promise.all([
    ladeTarifvorbereitung(d.id, ctx, d),
    loadPraesentation(d.id, ctx),
    prisma.customer.findUnique({ where: { id: ctx.customerId }, select: { leadAddress: true, vorsorgeThemenAus: true } }),
    ladePreisPilot(),
    // Policen vom Kunden per WhatsApp (lib/policen)
    d.leadId ? listUnterlagen(d.leadId, { preview: ctx.preview }) : [],
  ]);
  if (!tv || !p) return null;
  // Beiträge rechnen (Pilot, docs/preise-pilot.md): nur Rechner-Angaben der freigeschalteten Sparten
  const rechnen = {
    aktiv: pilot,
    angaben: Object.fromEntries([...new Set(pilot.map((k) => k.split("/")[1]))].map((sp) => [sp, rechnerAngaben(d, sp)])),
  };
  const will = kundeWill(d);
  const klaeren = klaerenPunkte(d);
  const ab = abschnitte(d);
  const unterlagen = unterlagenFuer(d.lead.produkt, spartenVon(d));
  const modus = d.termin.mode === "video" ? "Video" : d.lead.telefon ? `Telefon · ${formatPhone(d.lead.telefon)}` : "Telefon";

  const willKarte = (
    <Card className="h-full">
      <div className="border-b border-[color:var(--border)] px-5 py-3.5">
        <h2 className="text-[15px] font-semibold tracking-tight">Das will der Kunde</h2>
      </div>
      <div className="px-5 py-3.5 text-sm" data-kunde-will>
        {will.punkte.length ? (
          <ul className="space-y-1.5">
            {will.punkte.map((x) => (
              <li key={x} className="flex gap-2.5">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand)]" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[color:var(--muted)]">Noch keine Angaben. Fragen Sie im Termin zuerst nach dem Bedarf.</p>
        )}
        {will.quelle ? <p className="mt-2 text-xs text-[color:var(--muted)]">{will.quelle}</p> : null}
        {/* Komplettcheck (Ole, 17.11.2026): was der Kunde schon hat, neutral „noch nicht genannt“ */}
        <BestehendeVertraege v={vorvertraegeAus(d.vorvertraege)} lebenssituation={lebenssituationAus(d.formular, d.angaben)} className="mt-3 border-t border-[color:var(--border)] pt-3" />
        {d.leadId ? (
          <div className="mt-3 border-t border-[color:var(--border)] pt-3">
            <UnterlagenVomKunden leadId={d.leadId} unterlagen={vomKunden} />
          </div>
        ) : null}
      </div>
    </Card>
  );

  const mehr = (
    <details className="group rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color:var(--surface)] shadow-[var(--shadow-md)]" data-mehr-zum-kunden>
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-5 py-3.5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
        Mehr zum Kunden
        <span className="ml-auto hidden text-[13px] font-medium text-[color:var(--muted)] sm:inline">Kontakt, Formular, Angaben, Unterlagen</span>
        <svg className="ml-auto h-4 w-4 text-[color:var(--muted)] transition group-open:rotate-180 sm:ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>
      <div className="grid gap-x-8 gap-y-1 border-t border-[color:var(--border)] px-5 pb-4 pt-1 text-sm md:grid-cols-2">
        <div>
          <h3 className="mb-1 mt-3 text-[13px] font-semibold text-[color:var(--muted)]">Kontakt</h3>
          <dl className={LISTE}>
            <dt className={BEZ}>Telefon</dt>
            <dd className="font-medium">{d.lead.telefon ? formatPhone(d.lead.telefon) : "nicht bekannt"}</dd>
            <dt className={BEZ}>E-Mail</dt>
            <dd className="break-words font-medium">{d.lead.email ?? "nicht bekannt"}</dd>
            <dt className={BEZ}>Adresse</dt>
            <dd className="font-medium">{d.lead.adresse ?? "nicht bekannt"}</dd>
          </dl>
          {d.formular.length ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-[color:var(--muted)]">Aus dem Formular</h3>
              <dl className={LISTE}>
                {d.formular.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className={BEZ}>{f.label}</dt>
                    <dd className="font-medium">{f.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {d.zusammenfassung ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-[color:var(--muted)]">Zusammenfassung aus dem Chat</h3>
              <p>{d.zusammenfassung}</p>
            </>
          ) : null}
        </div>
        <div>
          {ab.map((s) => (
            <div key={s.titel}>
              <h3 className="mb-1 mt-3 text-[13px] font-semibold text-[color:var(--muted)]">{s.titel}</h3>
              <dl className={LISTE}>
                {s.felder.map((f) => (
                  <div key={f.label} className="contents">
                    <dt className={BEZ}>{f.label}</dt>
                    <dd className={f.wert ? "font-medium" : "font-medium text-amber-700"}>{f.wert ?? "offen"}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          {unterlagen.length ? (
            <>
              <h3 className="mb-1 mt-4 text-[13px] font-semibold text-[color:var(--muted)]">Unterlagen, um die gebeten wurde</h3>
              <ul className="list-disc space-y-0.5 pl-5">
                {unterlagen.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="mt-4 flex flex-col items-start gap-1.5">
            {/* Eigenes Fenster (Ole, 16.11.2026): In der App vom Home-Bildschirm (iPhone) gibt es keine Zurück-Taste; ein neues
                Fenster hat „Fertig“ und führt zurück in die App. Am Rechner öffnet sich das PDF im neuen Tab. */}
            <a href={`/api/buyer/termine/${d.id}/vorbereitung`} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center gap-1.5 font-medium text-[color:var(--brand)] hover:underline">
              <FileDown className="h-4 w-4" /> Als PDF öffnen
            </a>
            <Link href="/buyer/einstellungen/branding" className="inline-flex min-h-9 items-center gap-1.5 font-medium text-[color:var(--brand)] hover:underline">
              <ImageIcon className="h-4 w-4" /> Eigenes Logo auf die Folien bringen
            </Link>
          </div>
        </div>
      </div>
    </details>
  );

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-32 pt-6 sm:px-6 md:pb-10 lg:px-8">
      {/* von=heute: aus dem Termin auf „Heute“ geöffnet, zurück dorthin (UX Runde 4) */}
      {von === "heute" ? (
        <ZurueckLink href="/buyer" back>
          Heute
        </ZurueckLink>
      ) : d.leadId ? (
        <ZurueckLink href={`/buyer/leads/${d.leadId}`} back={von === "kontakt"}>
          Zum Kontakt
        </ZurueckLink>
      ) : null}
      {/* Freischaltung Kranken/BU/Leben (lib/policen/freischaltung.ts), nur Inhaber, bis zugestimmt oder 3-mal „Später“ */}
      <PolicenFreischaltungKarte ctx={ctx} ort="karte" className="mb-4" />
      <VorbereitungNeu
        id={d.id}
        leadId={d.leadId}
        readOnly={ctx.preview}
        kopf={{ name: d.lead.name, zeit: chipZeit(d.termin.startsAt), modus, produkt: d.lead.produkt, vorbereitet: !!d.vorbereitetAm, zugesagt: !!d.zugesagtAm, komplettcheck: d.komplettcheck === true }}
        willKarte={willKarte}
        mehr={mehr}
        klaeren={{ punkte: klaeren.slice(0, KLAEREN_MAX), erledigt: tv.klaerenErledigt }}
        angebote={{
          auswahl: tv.auswahl,
          quelle: tv.quelle,
          katalog: tv.katalog,
          vertrieb: tv.vertrieb,
          gesellschaftFehlt: tv.gesellschaftFehlt,
          gesellschaften: tv.gesellschaften,
          eigene: tv.eigene,
          meine: tv.meine,
          rechnen,
          schutzNeu: tv.schutzNeu,
          // Teil C2: höchstens ein Vorsorge-Thema, nur als Hinweis (nichts gespeichert)
          vorsorge: vorsorgeThema(d, kunde?.vorsorgeThemenAus ?? [], asAnsprache(kunde?.leadAddress)),
        }}
        vorschau={{
          termin: { ...d, termin: { ...d.termin, startsAt: d.termin.startsAt.toISOString() }, vorbereitetAm: null },
          marke: p.marke,
          css: p.css,
          ansprache: asAnsprache(kunde?.leadAddress),
        }}
      />
    </main>
  );
}
