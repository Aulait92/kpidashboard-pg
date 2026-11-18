import Link from "next/link";
import { Download } from "lucide-react";
import { tarifVorschlagAblehnenAction, tarifVorschlagUebernehmenAction, tarifVorschlagZuruecknehmenAction } from "@/app/admin/neu/einstellungen/tarife/actions";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonClass, Card, CardHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { EMPFOHLEN_AB, FOLIE_MAX_WERT, TARIF_MERKMAL, type VorschlagGruppe, type VorschlagStatus, type VorschlagWert } from "@/lib/tarif-vorschlaege";
import type { VorschlaegeAnsicht } from "@/lib/tarif-vorschlaege-server";
import { LISTE } from "./rahmen";

// Vorschläge von Vermittlern zum Tarifkatalog (Ole, 18.11.2026; Einstellungen › Tarifkatalog). Wer: Ole, wenn er den
// Katalog pflegt. Aufgabe: je Tarif und Merkmal entscheiden, ob der Wert der Vermittler in den Katalog kommt.
// Ungeprüfte zuerst, je Wert die Zahl verschiedener Vermittler, „Empfohlen“ ab 3. Hauptaktion je Wert „Übernehmen“
// (wirkt sofort für alle Vermittler), daneben leise „Ablehnen“. Erledigtes hinter den Chips „Übernommen“, „Abgelehnt“.

const PFAD = "/admin/neu/einstellungen/tarife";
const ART: Record<VorschlagWert["art"], string> = { ergaenzt: "ergänzt", geaendert: "weicht ab", bestaetigt: "wie im Katalog", neu: "fehlt im Katalog" };
const STATUS: { key: VorschlagStatus; label: string }[] = [
  { key: "offen", label: "Offen" },
  { key: "uebernommen", label: "Übernommen" },
  { key: "abgelehnt", label: "Abgelehnt" },
];
const ZEIGEN = 30;

function Felder({ g, w }: { g: VorschlagGruppe; w: VorschlagWert }) {
  return (
    <>
      <input type="hidden" name="tarifId" value={g.tarifId} />
      <input type="hidden" name="merkmal" value={g.merkmal} />
      <input type="hidden" name="wert" value={w.wert} />
    </>
  );
}

function WertZeile({ g, w, status }: { g: VorschlagGruppe; w: VorschlagWert; status: VorschlagStatus }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-2" data-vorschlag-wert={w.wert}>
      <div className="min-w-[10rem] flex-1">
        <span className="text-sm font-semibold">{w.wert}</span>
        {w.empfohlen ? (
          <span title={`Mindestens ${EMPFOHLEN_AB} Vermittler bei einem ungeprüften Merkmal`}>
            <Badge tone="brand" className="ml-2 align-middle">
              Empfohlen
            </Badge>
          </span>
        ) : null}
        <div className="text-xs text-[color:var(--muted)]">
          {w.vermittler} Vermittler · {ART[w.art]}
          {w.zuLang && status === "offen" ? <span className="text-amber-700"> · für die Folie zu lang (höchstens {FOLIE_MAX_WERT} Zeichen)</span> : null}
        </div>
      </div>
      {status === "offen" ? (
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <form action={tarifVorschlagAblehnenAction}>
            <Felder g={g} w={w} />
            <SubmitButton pendingLabel="…" className={buttonClass("ghost", "sm")}>
              Ablehnen
            </SubmitButton>
          </form>
          {w.zuLang ? null : (
            <form action={tarifVorschlagUebernehmenAction}>
              <Felder g={g} w={w} />
              <SubmitButton pendingLabel="Übernehme …" className={buttonClass(w.empfohlen ? "primary" : "secondary", "sm")}>
                Übernehmen
              </SubmitButton>
            </form>
          )}
        </div>
      ) : (
        <form action={tarifVorschlagZuruecknehmenAction} className="ml-auto shrink-0">
          <Felder g={g} w={w} />
          <SubmitButton pendingLabel="…" className={buttonClass("ghost", "sm")}>
            Zurücknehmen
          </SubmitButton>
        </form>
      )}
    </li>
  );
}

function Gruppe({ g, status }: { g: VorschlagGruppe; status: VorschlagStatus }) {
  const neu = g.merkmal === TARIF_MERKMAL;
  return (
    <li className="px-5 py-3.5" data-vorschlag-gruppe={g.key}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-sm font-semibold">{neu ? `${g.gesellschaftName}: neuer Tarif` : `${g.gesellschaftName} ${g.tarif ?? ""} · ${g.merkmalLabel}`}</span>
        {g.ungeprueft ? <Badge tone="warning">ungeprüft</Badge> : g.bestaetigt ? <Badge tone="success">von Vermittlern bestätigt</Badge> : null}
      </div>
      <div className="text-sm text-[color:var(--muted)]">
        {g.sparteLabel}
        {neu ? " · kommt mit dem Export in die Katalogdatei" : g.fehlt ? " · Tarif nicht mehr im Katalog" : ` · Katalog: ${g.katalogWert ?? "leer"}`}
      </div>
      <ul className="mt-2 grid gap-1.5">
        {g.werte.map((w) => (
          <WertZeile key={w.wert} g={g} w={w} status={status} />
        ))}
      </ul>
    </li>
  );
}

/** Karte „Vorschläge von Vermittlern“ auf Einstellungen › Tarifkatalog. */
export function TarifVorschlaege({ ansicht, status, alle }: { ansicht: VorschlaegeAnsicht; status: VorschlagStatus; alle: boolean }) {
  const { gruppen, anzahl } = ansicht;
  const gezeigt = alle ? gruppen : gruppen.slice(0, ZEIGEN);
  const leer = !anzahl.offen && !anzahl.uebernommen && !anzahl.abgelehnt;
  const link = (s: VorschlagStatus, mehr = false) => `${PFAD}?vorschlaege=${s}${mehr ? "&alle=1" : ""}#vorschlaege`;
  return (
    <Card id="vorschlaege">
      <CardHeader
        title="Vorschläge von Vermittlern"
        count={anzahl.offen || undefined}
        actions={
          anzahl.uebernommen ? (
            <a href={`${PFAD}/vorschlaege/export`} className={buttonClass("ghost", "sm")} data-funktion="tarif-vorschlaege--export-fuer-katalogdateien" download>
              <Download className="h-3.5 w-3.5" /> Export
            </a>
          ) : null
        }
      />
      <div data-funktion="tarif-vorschlaege--liste-nach-tarif-und-merkmal tarif-vorschlaege--uebernehmen-oder-ablehnen" data-tarif-vorschlaege>
        {leer ? (
          <p className="px-5 py-4 text-sm text-[color:var(--muted)]">Noch keine Vorschläge. Sie entstehen, wenn Vermittler Werte zu Katalogtarifen von Hand eintragen.</p>
        ) : (
          <>
            <div className="flex gap-1.5 overflow-x-auto px-5 pt-3 [scrollbar-width:none]" aria-label="Status">
              {STATUS.map((s) => (
                <Link
                  key={s.key}
                  href={link(s.key)}
                  aria-current={status === s.key ? "page" : undefined}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center rounded-full border px-3 text-sm font-medium transition",
                    status === s.key ? "border-[color:var(--foreground)] bg-[color:var(--foreground)] text-white" : "border-[color:var(--border)] bg-white text-[color:var(--muted)] hover:text-[color:var(--foreground)]",
                  )}
                >
                  {s.label} {anzahl[s.key]}
                </Link>
              ))}
            </div>
            {gezeigt.length ? (
              <ul className={LISTE}>
                {gezeigt.map((g) => (
                  <Gruppe key={g.key} g={g} status={status} />
                ))}
              </ul>
            ) : (
              <p className="px-5 py-4 text-sm text-[color:var(--muted)]">{status === "offen" ? "Alles entschieden." : "Keine Einträge."}</p>
            )}
            {gruppen.length > gezeigt.length ? (
              <div className="border-t border-[color:var(--border)] px-5 py-2.5">
                <Link href={link(status, true)} className="text-sm font-medium text-[color:var(--brand)]">
                  Alle {gruppen.length} zeigen
                </Link>
              </div>
            ) : null}
            {status === "offen" && gruppen.length ? (
              <p className="border-t border-[color:var(--border)] px-5 py-2.5 text-xs text-[color:var(--muted)]">
                Übernommene Werte gelten sofort für alle Vermittler.
              </p>
            ) : null}
          </>
        )}
      </div>
    </Card>
  );
}
