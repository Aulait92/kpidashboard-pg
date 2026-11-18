"use client";

// „Nächste Nachrichten“ am Kontakt (Paket P6, Ole 17.11.2026). Eine Hauptaktion oben („Später melden“ bzw.
// „Fortsetzen“; „Später melden“ fasst seit 18.11.2026 die Pause aus P6 und die Bedenkzeit aus P5 in einem Blatt zusammen,
// components/spaeter-melden.tsx), je Eintrag Zeit, Kanal, Titel und eine Zeile Vorschau; Antippen zeigt den ganzen Text. Seltenes
// („Jetzt senden“, „Verschieben“, „Überspringen“) liegt im Menü je Zeile. Übersprungene Einträge bleiben durchgestrichen
// stehen und lassen sich mit einem Tipp zurückholen. Handy zuerst: alles einspaltig, Tippziele mindestens 40 px.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, CalendarClock, ChevronDown, Mail, MessageCircle, MoreHorizontal, Phone, Play, Send, SkipForward, Undo2, type LucideIcon } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { ActionMenu } from "@/components/ui/menu";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { NachrichtVorschau } from "@/components/nachricht-vorschau";
import type { PlanEintrag, PlanKanal } from "@/lib/nachrichtenplan";
import { nachrichtenAktion, type NachrichtenAktion } from "@/app/buyer/nachrichtenplan-actions";
import { stopLeadSequenceAction } from "@/app/buyer/sequence-actions";
import { SpaeterMelden, type SpaeterProps } from "@/components/spaeter-melden";
import { cn } from "@/lib/utils";

export type VerlaufZeile = { at: string | null; text: string; leise?: boolean };

const TZ = "Europe/Berlin";
const KANAL: Record<PlanKanal, { icon: LucideIcon; farbe: string; name: string }> = {
  whatsapp: { icon: MessageCircle, farbe: "bg-emerald-50 text-emerald-700", name: "WhatsApp" },
  email: { icon: Mail, farbe: "bg-blue-50 text-blue-700", name: "E-Mail" },
  push: { icon: Bell, farbe: "bg-violet-50 text-violet-700", name: "Push an Sie" },
  anruf: { icon: Phone, farbe: "bg-amber-50 text-amber-800", name: "Anruf-Aufgabe" },
};
/** Ohne Einträge vorn: so viele zeigen, Rest über „Alle anzeigen“. */
const ZUERST = 4;

const tagKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const uhr = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
function tagLabel(d: Date, jetzt: Date): string {
  const k = tagKey(d);
  if (k === tagKey(jetzt)) return "Heute";
  if (k === tagKey(new Date(jetzt.getTime() + 86_400_000))) return "Morgen";
  return new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short", day: "numeric", month: "numeric" }).format(d);
}
const kurz = (iso: string, jetzt: Date) => `${tagLabel(new Date(iso), jetzt)}, ${uhr(new Date(iso))}`;

/** „Angebot gesendet: WhatsApp (Schritt 1 von 5) …“ → Titel und kleiner Zusatz. */
function teileTitel(t: string): { titel: string; zusatz: string | null } {
  const m = /^(.*?)\s*\((Schritt \d+ von \d+)\)\s*(.*)$/.exec(t);
  if (!m) return { titel: t, zusatz: null };
  const rest = m[3].replace(/^\(|\)$/g, "").trim();
  return { titel: m[1], zusatz: [m[2], rest].filter(Boolean).join(", ") };
}

/**
 * Anzeige je Zeile: Abfolge-Schritte mit klarem Titel („Nachfrage per WhatsApp“) und der Abfolge im Zusatz
 * („Angebot gesendet, Schritt 1 von 5“); der Kanal steht nur dann im Zusatz, wenn er nicht schon im Titel steckt.
 */
function anzeige(e: PlanEintrag): { titel: string; zusatz: string | null } {
  const roh = teileTitel(e.titel);
  const titel = roh.titel;
  // „Schritt 2 von 5“ nicht umbrechen
  const zusatz = roh.zusatz?.replace(/Schritt (\d+) von (\d+)/, "Schritt\u00a0$1\u00a0von\u00a0$2") ?? null;
  if (e.quelle === "abfolge") {
    const i = titel.indexOf(": ");
    const abfolge = i > 0 ? titel.slice(0, i) : null;
    const rest = i > 0 ? titel.slice(i + 2) : titel;
    const klar =
      e.kanal === "whatsapp" ? "Nachfrage per WhatsApp" : e.kanal === "anruf" ? "Anruf-Aufgabe für Sie" : rest.replace(/\[([^\]]+)\]/g, "„$1“");
    return { titel: klar, zusatz: [abfolge, zusatz].filter(Boolean).join(", ") || null };
  }
  if (e.quelle === "vorschlag") return { titel: titel.replace(/^Vorschlag: /, ""), zusatz: "Vorschlag für Sie, mit einem Tipp" };
  const kanal = KANAL[e.kanal].name;
  return { titel, zusatz: [titel.includes(kanal) || e.kanal === "anruf" ? null : kanal, zusatz].filter(Boolean).join(", ") || null };
}

/** Pushes, die nur einen Schritt begleiten (Vorab-Check, Push zur Anruf-Aufgabe), stehen nicht als eigene Zeile da. */
const begleitend = (e: PlanEintrag) => /^(vorab|push):/.test(e.key);

const ymd = (d: Date) => tagKey(d);
const hhmm = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

export function NaechsteNachrichten({
  leadId,
  eintraege: alleEintraege,
  pausiertAt,
  laeuft,
  verlauf,
  readOnly,
  jetzt: jetztIso,
  spaeter = null,
  bedenkzeitBis = null,
  pausiertBis = null,
}: {
  /** Blatt „Später melden“ (Tage, Angebot, E-Mail-Haken); null = nicht anbieten */
  spaeter?: SpaeterProps | null;
  /** Laufende Bedenkzeit zum Angebot („Di, 2.12.“) */
  bedenkzeitBis?: string | null;
  /** „Später melden“ mit Tag: Pause endet von selbst („Di, 2.12.“) */
  pausiertBis?: string | null;
  leadId: string;
  eintraege: PlanEintrag[];
  pausiertAt: string | null;
  /** Läuft eine Nachfass-Abfolge (für „Nachfassen beenden“)? */
  laeuft: boolean;
  verlauf: VerlaufZeile[];
  readOnly: boolean;
  /** Serverzeit beim Laden (gleiche Tagesnamen auf Server und Handy) */
  jetzt: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [alle, setAlle] = useState(false);
  const [offen, setOffen] = useState<string | null>(null);
  const [verschieben, setVerschieben] = useState<PlanEintrag | null>(null);
  const [senden, setSenden] = useState<PlanEintrag | null>(null);
  const [spaeterOffen, setSpaeterOffen] = useState(false);
  const jetzt = useMemo(() => new Date(jetztIso), [jetztIso]);
  const eintraege = alleEintraege.filter((e) => !begleitend(e));
  const pausiert = !!pausiertAt;
  // Vorschläge (M7) gehen nicht von selbst raus: zählen nicht als Nachricht an den Lead
  const anLead = eintraege.filter((e) => (e.kanal === "whatsapp" || e.kanal === "email") && e.quelle !== "vorschlag" && !e.uebersprungen);
  const gezeigt = alle ? eintraege : eintraege.slice(0, ZUERST);

  function los(a: NachrichtenAktion, opts: { danach?: () => void; rueckgaengig?: NachrichtenAktion } = {}) {
    start(async () => {
      const res = await nachrichtenAktion(leadId, a);
      if (!res.ok) {
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      opts.danach?.();
      const zurueck = opts.rueckgaengig;
      toast.show({
        message: res.text,
        tone: "success",
        ...(zurueck ? { actionLabel: "Rückgängig", onAction: () => los(zurueck) } : {}),
      });
      router.refresh();
    });
  }

  // Gruppen nach Tag
  const gruppen: { label: string; zeilen: PlanEintrag[] }[] = [];
  for (const e of gezeigt) {
    const l = tagLabel(new Date(e.at), jetzt);
    const g = gruppen.at(-1);
    if (g?.label === l) g.zeilen.push(e);
    else gruppen.push({ label: l, zeilen: [e] });
  }

  const naechste = anLead.find((e) => !e.pausiert);
  const unterzeile = pausiert
    ? pausiertBis
      ? `Pausiert bis ${pausiertBis}, danach geht es von selbst weiter.`
      : `Pausiert seit ${kurz(pausiertAt!, jetzt)} Uhr. Bis Sie fortsetzen, geht nichts automatisch raus.`
    : bedenkzeitBis
      ? `Bedenkzeit bis ${bedenkzeitBis}, danach fasst die App wieder nach.`
      : naechste
      ? `Nächste an den Kontakt: ${kurz(naechste.at, jetzt)} Uhr, ${KANAL[naechste.kanal].name}`
      : eintraege.length
        ? "Nur Aufgaben und Hinweise für Sie geplant"
        : "Nichts geplant";

  return (
    <Card id="nachfassen" className="mb-6" menus>
      <div data-naechste-nachrichten={pausiert ? "pausiert" : "laeuft"}>
        <div className="flex flex-col gap-3 border-b border-[color:var(--border)] px-5 py-3.5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Send className="h-5 w-5 shrink-0 text-[color:var(--brand)]" />
            <div className="min-w-0">
              <h2 className="font-semibold">Nächste Nachrichten</h2>
              <p className={cn("text-xs", pausiert ? "font-medium text-amber-800" : "text-[color:var(--muted)]")} data-naechste-status>
                {unterzeile}
              </p>
            </div>
          </div>
          {!readOnly && (anLead.length || pausiert || laeuft) ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:flex sm:items-center">
              {pausiert ? (
                <Button variant="primary" size="md" icon={Play} disabled={pending} onClick={() => los({ aktion: "fortsetzen" })} data-nachrichten-fortsetzen>
                  Fortsetzen
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  size="md"
                  icon={CalendarClock}
                  disabled={pending || !spaeter || (!anLead.length && !laeuft)}
                  onClick={() => setSpaeterOffen(true)}
                  data-spaeter-melden
                >
                  Später melden
                </Button>
              )}
              {laeuft || (pausiert && spaeter) ? (
                <ActionMenu
                  label="Mehr"
                  labelClassName="sr-only"
                  icon={MoreHorizontal}
                  items={[
                    ...(pausiert && spaeter ? [{ label: "Anderen Tag wählen", hint: "Pause bis zu einem Tag, danach geht es von selbst weiter", onSelect: () => setSpaeterOffen(true) }] : []),
                    ...(laeuft ? [{
                      label: "Nachfassen beenden",
                      hint: "Die laufende Abfolge endet ganz, Erinnerungen bleiben.",
                      tone: "danger" as const,
                      onSelect: () =>
                        start(async () => {
                          const res = await stopLeadSequenceAction(leadId);
                          if (!res.ok) return toast.show({ message: res.error ?? "Das hat nicht geklappt.", tone: "error" });
                          toast.show({ message: "Nachfassen beendet", tone: "success" });
                          router.refresh();
                        }),
                    }] : []),
                  ]}
                />
              ) : null}
            </div>
          ) : null}
        </div>

        {eintraege.length ? (
          <div>
            {gruppen.map((g) => (
              <div key={g.label}>
                <div className="bg-[color:var(--surface-sunken,#f8fafc)] px-5 py-1.5 text-xs font-semibold text-[color:var(--muted)]">{g.label}</div>
                <ul className="divide-y divide-[color:var(--border)]">
                  {g.zeilen.map((e) => (
                    <Zeile
                      key={e.key}
                      e={e}
                      offen={offen === e.key}
                      umschalten={() => setOffen((o) => (o === e.key ? null : e.key))}
                      readOnly={readOnly}
                      pending={pending}
                      aktion={(x) => {
                        if (x === "jetzt") return setSenden(e);
                        if (x === "verschieben") return setVerschieben(e);
                        if (x === "ueberspringen") return los({ aktion: "ueberspringen", key: e.key }, { rueckgaengig: { aktion: "rueckgaengig", key: e.key } });
                        los({ aktion: "rueckgaengig", key: e.key });
                      }}
                    />
                  ))}
                </ul>
              </div>
            ))}
            {eintraege.length > ZUERST ? (
              <button
                type="button"
                onClick={() => setAlle((v) => !v)}
                className="w-full border-t border-[color:var(--border)] py-2.5 text-xs font-semibold text-[color:var(--brand)] hover:bg-[color:var(--surface-sunken)]"
                data-nachrichten-alle
              >
                {alle ? "Weniger anzeigen" : `Alle ${eintraege.length} anzeigen`}
              </button>
            ) : null}
          </div>
        ) : (
          <p className="px-5 py-3.5 text-sm text-[color:var(--muted)]">
            Gerade ist nichts geplant. Neue Schritte erscheinen hier von selbst, z. B. nach einer Buchung oder einem gesendeten Angebot.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-x-4 border-t border-[color:var(--border)] px-5 text-xs">
          {verlauf.length ? (
            <details className="group min-w-0 flex-1 basis-full sm:basis-auto">
              <summary className="flex min-h-10 cursor-pointer list-none items-center gap-1 font-semibold text-[color:var(--muted)] [&::-webkit-details-marker]:hidden">
                Bisher
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
              </summary>
              <ul className="space-y-1.5 pb-3 text-sm" data-nachrichten-verlauf>
                {verlauf.map((v, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="w-24 shrink-0 text-xs text-[color:var(--muted)]">{v.at ? kurz(v.at, jetzt) : ""}</span>
                    <span className={v.leise ? "text-[color:var(--muted)]" : undefined}>{v.text}</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <Link href="/buyer/einstellungen/assistent/ablauf" className="inline-flex min-h-10 items-center font-semibold text-[color:var(--brand)] hover:underline" data-nachrichten-ablauf>
            Ablauf ansehen
          </Link>
        </div>
      </div>

      {spaeter && !readOnly ? <SpaeterMelden leadId={leadId} offen={spaeterOffen} onOffen={setSpaeterOffen} spaeter={spaeter} /> : null}
      <VerschiebenSheet
        e={verschieben}
        pending={pending}
        onClose={() => setVerschieben(null)}
        onSave={(datum, uhrzeit) => verschieben && los({ aktion: "verschieben", key: verschieben.key, datum, uhrzeit }, { danach: () => setVerschieben(null) })}
      />
      <Sheet open={!!senden} onClose={() => setSenden(null)} title="Jetzt senden?" message={senden ? `${KANAL[senden.kanal].name}, statt ${kurz(senden.at, jetzt)} Uhr` : undefined}>
        {senden ? (
          <div className="space-y-4 px-5 py-4">
            <Vorschau e={senden} />
            <Button
              variant="primary"
              size="md"
              icon={Send}
              className="w-full"
              disabled={pending}
              onClick={() => los({ aktion: "jetzt", key: senden.key }, { danach: () => setSenden(null) })}
              data-nachrichten-jetzt-senden
            >
              Jetzt senden
            </Button>
          </div>
        ) : null}
      </Sheet>
    </Card>
  );
}

const AKTION: Record<"jetzt" | "verschieben" | "ueberspringen", { label: string; icon: LucideIcon }> = {
  jetzt: { label: "Jetzt senden", icon: Send },
  verschieben: { label: "Verschieben", icon: CalendarClock },
  ueberspringen: { label: "Überspringen", icon: SkipForward },
};

function Zeile({
  e,
  offen,
  umschalten,
  readOnly,
  pending,
  aktion,
}: {
  e: PlanEintrag;
  offen: boolean;
  umschalten: () => void;
  readOnly: boolean;
  pending: boolean;
  aktion: (a: "jetzt" | "verschieben" | "ueberspringen" | "rueckgaengig") => void;
}) {
  const k = KANAL[e.kanal];
  const { titel, zusatz } = anzeige(e);
  const menue = (e.aktionen ?? []).filter((a): a is "jetzt" | "verschieben" | "ueberspringen" => a !== "rueckgaengig");
  const zurueck = (e.aktionen ?? []).includes("rueckgaengig");
  const leise = e.uebersprungen || e.pausiert;
  return (
    <li className="flex items-start gap-3 px-5 py-3" data-nachricht={e.key} data-nachricht-kanal={e.kanal} data-uebersprungen={e.uebersprungen ? "" : undefined}>
      <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", leise ? "bg-zinc-100 text-zinc-500" : k.farbe)} title={k.name}>
        <k.icon className="h-4 w-4" />
      </span>
      <button type="button" onClick={umschalten} className="min-w-0 flex-1 text-left" aria-expanded={offen}>
        <div className={cn("flex flex-wrap items-baseline gap-x-2 text-sm", e.uebersprungen && "text-[color:var(--muted)] line-through")}>
          {/* „ca.“: hängt vom Versandfenster bzw. von den Schritten davor ab */}
          <span className="font-semibold tabular-nums">
            {e.voraussichtlich && !leise ? "ca. " : ""}
            {uhr(new Date(e.at))}
          </span>
          <span className="font-medium">{titel}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-[color:var(--muted)]">
          {e.uebersprungen ? <span className="font-medium text-[color:var(--foreground)]">Übersprungen</span> : null}
          {zusatz ? <span>{zusatz}</span> : null}
        </div>
        {offen ? (
          <div className="mt-2">
            <Vorschau e={e} />
          </div>
        ) : (
          <p className={cn("mt-1 line-clamp-1 text-xs", leise ? "text-[color:var(--muted)]" : "text-[color:var(--foreground)]/80")}>{vorschauZeile(e)}</p>
        )}
      </button>
      {!readOnly && zurueck ? (
        <Button variant="ghost" icon={Undo2} disabled={pending} onClick={() => aktion("rueckgaengig")} data-nachricht-rueckgaengig>
          Doch senden
        </Button>
      ) : null}
      {!readOnly && menue.length ? (
        <ActionMenu
          label="Aktionen"
          labelClassName="sr-only"
          icon={MoreHorizontal}
          className="shrink-0"
          items={menue.map((a) => ({ label: AKTION[a].label, icon: AKTION[a].icon, onSelect: () => aktion(a) }))}
        />
      ) : null}
    </li>
  );
}

/** Eine Zeile Vorschau ohne Formatierung (Betreff der Mail bzw. Anfang der Nachricht). */
function vorschauZeile(e: PlanEintrag): string {
  return e.vorschau.replace(/[*_~]/g, "").replace(/\s+/g, " ").trim();
}

/** Ganzer Text (gemeinsam mit der Ablaufübersicht). */
function Vorschau({ e }: { e: PlanEintrag }) {
  return <NachrichtVorschau kanal={e.kanal} text={e.vorschau} />;
}

function VerschiebenSheet({ e, pending, onClose, onSave }: { e: PlanEintrag | null; pending: boolean; onClose: () => void; onSave: (datum: string, uhrzeit: string) => void }) {
  return (
    <Sheet open={!!e} onClose={onClose} title="Verschieben" message={e ? anzeige(e).titel : undefined}>
      {e ? <VerschiebenForm key={e.key} e={e} pending={pending} onSave={onSave} /> : null}
    </Sheet>
  );
}

function VerschiebenForm({ e, pending, onSave }: { e: PlanEintrag; pending: boolean; onSave: (datum: string, uhrzeit: string) => void }) {
  const at = new Date(e.at);
  const [datum, setDatum] = useState(ymd(at));
  const [uhrzeit, setUhrzeit] = useState(hhmm(at));
  const heute = ymd(new Date());
  const schnell = [
    { label: "+1 Tag", tage: 1 },
    { label: "+3 Tage", tage: 3 },
    { label: "+1 Woche", tage: 7 },
  ];
  const feld = "h-11 w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-[15px]";
  return (
    <form
      className="space-y-4 px-5 py-4"
      onSubmit={(ev) => {
        ev.preventDefault();
        onSave(datum, uhrzeit);
      }}
    >
      <div className="flex flex-wrap gap-2">
        {schnell.map((s) => (
          <button
            key={s.tage}
            type="button"
            onClick={() => setDatum(ymd(new Date(at.getTime() + s.tage * 86_400_000)))}
            className="min-h-10 rounded-full border border-[color:var(--border)] px-3 text-sm font-medium hover:border-[color:var(--brand)] hover:text-[color:var(--brand)]"
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-3">
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Datum
          <input type="date" required min={heute} value={datum} onChange={(ev) => setDatum(ev.target.value)} className={cn(feld, "mt-1")} data-verschieben-datum />
        </label>
        <label className="block text-xs font-medium text-[color:var(--muted)]">
          Uhrzeit
          <input type="time" required value={uhrzeit} onChange={(ev) => setUhrzeit(ev.target.value)} className={cn(feld, "mt-1")} data-verschieben-uhrzeit />
        </label>
      </div>
      {e.quelle === "abfolge" ? <p className="text-xs text-[color:var(--muted)]">Die folgenden Schritte rücken um dieselbe Zeit mit.</p> : null}
      <Button type="submit" variant="primary" size="md" className="w-full" disabled={pending} data-verschieben-speichern>
        Verschieben
      </Button>
    </form>
  );
}
