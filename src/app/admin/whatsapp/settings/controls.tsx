"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Check, Info, Loader2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  saveAgentSettingsAction,
  saveTemplateResultAction,
  setAgentActiveAction,
  setFollowUpSequencesAction,
  setTemplateApprovedAction,
  submitTemplatesAction,
  resubmitTemplateAction,
  type SaveResult,
} from "./actions";

// ─── Schalter mit Sofort-Reaktion ──────────────────────────────────────
// Springt sofort um; schlägt das Speichern fehl, springt er zurück und
// zeigt den Fehler (kein Lade-Rädchen).
export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => Promise<SaveResult>;
  label: string;
  disabled?: boolean;
}) {
  const [on, setOn] = useState(checked);
  const [shake, setShake] = useState(false);
  const toast = useToast();
  const router = useRouter();
  // Neuer Wert vom Server → übernehmen (ohne Effekt).
  const [prev, setPrev] = useState(checked);
  if (prev !== checked) {
    setPrev(checked);
    setOn(checked);
  }
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={async () => {
        const next = !on;
        setOn(next);
        const res = await onChange(next);
        if (!res.ok) {
          setOn(!next);
          setShake(true);
          setTimeout(() => setShake(false), 400);
          toast.show({ message: res.error, tone: "error" });
        } else router.refresh();
      }}
      className={cn(
        "relative h-8 w-[52px] shrink-0 rounded-full transition-colors duration-150 disabled:opacity-50",
        on ? "bg-emerald-500" : "bg-slate-300",
        shake && "animate-[wiggle_0.3s_ease-in-out]",
      )}
    >
      <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all duration-150", on ? "left-[24px]" : "left-1")} />
    </button>
  );
}

function Hint({ text }: { text: string }) {
  return (
    <span title={text} className="inline-flex cursor-help text-[color:var(--muted)]">
      <Info className="h-4 w-4" />
    </span>
  );
}

function SavedBadge({ state }: { state: "idle" | "saving" | "saved" }) {
  if (state === "idle") return null;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-[color:var(--muted)]">
      {state === "saving" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 text-emerald-600" />}
      {state === "saving" ? "Speichert" : "Gespeichert"}
    </span>
  );
}

const field =
  "h-10 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm outline-none transition focus:border-[color:var(--brand)] focus:ring-2 focus:ring-[color:var(--brand)]/15";

// ─── Assistent: Einstellungen als Sätze, speichern automatisch ─────────
export function AgentSettings(p: {
  customerId: string;
  active: boolean;
  outreachEnabled: boolean;
  delayMin: number;
  videoRoomUrl: string;
  advisorEmail: string;
  hasIcs: boolean;
  outreachTemplateReady: boolean;
  sequencesEnabled: boolean;
  /** Fehlende freigegebene Vorlagen für die Abfolgen (Anzeigenamen). */
  sequenceTemplatesMissing: string[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [, start] = useTransition();
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [v, setV] = useState({
    outreachEnabled: p.outreachEnabled,
    delay: String(p.delayMin),
    videoRoomUrl: p.videoRoomUrl,
    advisorEmail: p.advisorEmail,
    ics: "",
  });
  const last = useRef(JSON.stringify(v));

  function save(next = v, extra: Record<string, string> = {}) {
    const key = JSON.stringify(next);
    if (key === last.current && !Object.keys(extra).length) return;
    last.current = key;
    const fd = new FormData();
    fd.set("customerId", p.customerId);
    if (next.outreachEnabled) fd.set("outreachEnabled", "on");
    fd.set("outreachDelayMin", next.delay || "0");
    fd.set("videoRoomUrl", next.videoRoomUrl);
    fd.set("advisorEmail", next.advisorEmail);
    fd.set("availabilityIcsUrl", next.ics);
    for (const [k, val] of Object.entries(extra)) fd.set(k, val);
    setState("saving");
    start(async () => {
      const res = await saveAgentSettingsAction(fd);
      if (!res.ok) {
        setState("idle");
        toast.show({ message: res.error, tone: "error" });
        return;
      }
      setState("saved");
      if (next.ics || extra.removeIcs) setV((x) => ({ ...x, ics: "" }));
      router.refresh();
    });
  }

  return (
    <div className="divide-y divide-[color:var(--border)] rounded-xl border border-[color:var(--border)] bg-white">
      <div className="flex min-h-[60px] items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Assistent aktiv</div>
          <div className="text-xs text-[color:var(--muted)]">Antwortet Leads auf WhatsApp und bucht Termine.</div>
        </div>
        <Switch label="Assistent aktiv" checked={p.active} onChange={(next) => setAgentActiveAction(p.customerId, next)} />
      </div>

      <div className="flex min-h-[60px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-[15px]">
        <span>Neue Leads nach</span>
        <input
          inputMode="numeric"
          value={v.delay}
          onChange={(e) => setV({ ...v, delay: e.target.value.replace(/\D/g, "").slice(0, 4) })}
          onBlur={() => save()}
          className={cn(field, "w-16 text-center")}
          aria-label="Minuten bis zum Anschreiben"
        />
        <span>Minuten anschreiben</span>
        <Hint text="0 = sofort (empfohlen): Je schneller der erste Kontakt, desto besser die Erreichbarkeit. Eine Wartezeit gibt dem Lead die Chance, zuerst selbst über die Danke-Seite zu buchen." />
        <span className="ml-auto flex items-center gap-3">
          <SavedBadge state={state} />
          <Switch
            label="Neue Leads automatisch anschreiben"
            checked={v.outreachEnabled}
            onChange={async (next) => {
              const n = { ...v, outreachEnabled: next };
              setV(n);
              save(n);
              return { ok: true };
            }}
          />
        </span>
        {v.outreachEnabled && !p.outreachTemplateReady ? (
          <p className="w-full text-xs font-medium text-amber-700">Es fehlt noch eine freigegebene Vorlage „Erstanschreiben“ (unten).</p>
        ) : null}
      </div>

      <div className="flex min-h-[60px] flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="font-medium">Automatisch nachfassen (Abfolgen)</div>
          <div className="text-xs text-[color:var(--muted)]">
            Nicht erreicht: WhatsApp sofort, Anruf-Aufgabe an Tag 2, letzte WhatsApp an Tag 6. Angebot: WhatsApp an Tag 3, Anruf an
            Tag 7. Nicht erschienen: WhatsApp mit Buchungslink sofort, Anruf an Tag 2. Stoppt bei Antwort, Termin, Abschluss,
            Kein Interesse, Reklamation oder „Stopp“. WhatsApp nur Mo–Sa 9–19 Uhr.
          </div>
        </div>
        <Switch label="Automatisch nachfassen" checked={p.sequencesEnabled} onChange={(next) => setFollowUpSequencesAction(p.customerId, next)} />
        {p.sequencesEnabled && p.sequenceTemplatesMissing.length ? (
          <p className="w-full text-xs font-medium text-amber-700">
            Ohne freigegebene Vorlage geht außerhalb des 24-h-Fensters keine WhatsApp raus – stattdessen entsteht eine Anruf-Aufgabe. Es
            fehlen: {p.sequenceTemplatesMissing.join(", ")}.
          </p>
        ) : null}
      </div>

      <label className="flex min-h-[60px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-[15px]">
        <span>Einladung zu jedem Termin an</span>
        <input
          type="email"
          value={v.advisorEmail}
          placeholder="vorname.nachname@allianz.de"
          onChange={(e) => setV({ ...v, advisorEmail: e.target.value })}
          onBlur={() => save()}
          className={cn(field, "min-w-[240px] flex-1")}
        />
      </label>

      <label className="flex min-h-[60px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-[15px]">
        <span>Videocalls im Raum</span>
        <input
          type="url"
          value={v.videoRoomUrl}
          placeholder="leer = Google Meet / Teams"
          onChange={(e) => setV({ ...v, videoRoomUrl: e.target.value })}
          onBlur={() => save()}
          className={cn(field, "min-w-[240px] flex-1")}
        />
      </label>

      <div className="flex min-h-[60px] flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3 text-[15px]">
        <span>Belegte Zeiten auch aus</span>
        {p.hasIcs ? (
          <>
            <span className="inline-flex items-center gap-1 text-sm font-medium text-emerald-700">
              <Check className="h-4 w-4" /> Firmenkalender hinterlegt
            </span>
            <button type="button" onClick={() => save(v, { removeIcs: "on" })} className="text-sm text-rose-700 hover:underline">
              entfernen
            </button>
          </>
        ) : (
          <input
            type="password"
            autoComplete="off"
            value={v.ics}
            placeholder="ICS-Link (optional)"
            onChange={(e) => setV({ ...v, ics: e.target.value })}
            onBlur={() => v.ics && save()}
            className={cn(field, "min-w-[240px] flex-1")}
          />
        )}
        <Hint text="Veröffentlichter Kalender (z. B. Outlook, nur Frei/Gebucht). Dort belegte Zeiten bietet der Assistent nicht an." />
      </div>
    </div>
  );
}

// ─── Vorlagen ──────────────────────────────────────────────────────────
export function TemplateApproved({ id, approved }: { id: string; approved: boolean }) {
  return (
    <label className="flex shrink-0 items-center gap-2 text-xs text-[color:var(--muted)]">
      {approved ? "freigegeben" : "wartet"}
      <Switch label="Von Meta freigegeben" checked={approved} onChange={(next) => setTemplateApprovedAction(id, next)} />
    </label>
  );
}

/** Status einer automatisch eingereichten Vorlage (wird von 360dialog nachgezogen). */
export function TemplateAutoStatus({ status, reason }: { status: string; reason: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    approved: { label: "freigegeben", cls: "bg-emerald-50 text-emerald-700" },
    pending: { label: "in Prüfung bei Meta", cls: "bg-amber-50 text-amber-700" },
    rejected: { label: "abgelehnt", cls: "bg-rose-50 text-rose-700" },
    paused: { label: "pausiert", cls: "bg-amber-50 text-amber-700" },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
      <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", m.cls)}>{m.label}</span>
      {status === "rejected" && reason ? <span className="max-w-40 text-[11px] text-rose-700">{reason}</span> : null}
      <span className="text-[11px] text-[color:var(--muted)]">automatisch</span>
    </span>
  );
}

/** Knopf: fehlende Vorlagen einreichen und Status bei 360dialog abfragen. */
export function SubmitTemplatesButton({ customerId }: { customerId: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await submitTemplatesAction(customerId);
          toast.show(res.ok ? { message: res.message ?? "Vorlagen abgeglichen" } : { message: res.error, tone: "error" });
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1.5 rounded-lg border border-[color:var(--border)] px-2.5 py-1 text-xs font-medium hover:bg-[color:var(--surface-2,#f5f7fb)] disabled:opacity-60"
    >
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      Vorlagen einreichen &amp; prüfen
    </button>
  );
}

/** Abgelehnte Vorlage mit aktuellem Text neu einreichen. */
export function ResubmitTemplateButton({ customerId, purpose }: { customerId: string; purpose: string }) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await resubmitTemplateAction(customerId, purpose);
          toast.show(res.ok ? { message: res.message ?? "Neu eingereicht" } : { message: res.error, tone: "error" });
          router.refresh();
        })
      }
      className="pt-1.5 text-xs font-medium text-[color:var(--brand)] hover:underline disabled:opacity-60"
    >
      {pending ? "…" : "neu einreichen"}
    </button>
  );
}

/** Kleine Handy-Vorschau, wie die Nachricht beim Lead aussieht. */
export function PhonePreview({ text, sender }: { text: string; sender: string }) {
  return (
    <div className="mx-auto w-[260px] shrink-0 rounded-[32px] border-[6px] border-slate-800 bg-slate-800 shadow-lg">
      <div className="overflow-hidden rounded-[26px] bg-[#efeae2]">
        <div className="flex items-center gap-2 bg-[#075e54] px-3 py-2.5 text-white">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
            {sender.slice(0, 1).toUpperCase()}
          </span>
          <span className="truncate text-[13px] font-semibold">{sender}</span>
        </div>
        <div className="min-h-[260px] p-3">
          <div className="max-w-[92%] whitespace-pre-wrap rounded-[10px] rounded-tl-none bg-white px-2.5 py-1.5 text-[13px] leading-snug text-slate-900 shadow-sm">
            {text || <span className="text-slate-400">Nachrichtentext …</span>}
            <div className="mt-0.5 text-right text-[10px] text-slate-400">10:42</div>
          </div>
        </div>
      </div>
    </div>
  );
}

const EXAMPLES: Record<string, string> = {
  Vorname: "Julia",
  "Datum/Uhrzeit": "Di., 18.11., 10:00 Uhr",
  Art: "Telefonat",
  "Link/Hinweis": "Wir rufen dich an.",
  "Thema (z. B. Hausrat, Haftpflicht)": "Hausrat",
};

export function TemplateEditor({
  customerId,
  sender,
  purposes,
}: {
  customerId: string;
  sender: string;
  purposes: { key: string; label: string; params: string[]; suggested: string }[];
}) {
  const toast = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [purpose, setPurpose] = useState(purposes[0]?.key ?? "");
  const cur = purposes.find((x) => x.key === purpose) ?? purposes[0];
  const [name, setName] = useState("");
  const [body, setBody] = useState(cur?.suggested ?? "");
  const [approved, setApproved] = useState(false);
  const preview = body.replace(/\{\{(\d+)\}\}/g, (_, n: string) => EXAMPLES[cur?.params[Number(n) - 1] ?? ""] ?? `[${n}]`);

  return (
    <div className="flex flex-col gap-6 rounded-xl border border-[color:var(--border)] bg-white p-4 lg:flex-row">
      <form
        className="min-w-0 flex-1 space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData();
          fd.set("customerId", customerId);
          fd.set("purpose", purpose);
          fd.set("name", name.trim());
          fd.set("language", "de");
          fd.set("body", body);
          if (approved) fd.set("approved", "on");
          start(async () => {
            const res = await saveTemplateResultAction(fd);
            if (!res.ok) return toast.show({ message: res.error, tone: "error" });
            toast.show({ message: `Vorlage „${cur?.label}“ gespeichert` });
            setName("");
            router.refresh();
          });
        }}
      >
        <div className="flex flex-wrap gap-1.5">
          {purposes.map((x) => (
            <button
              key={x.key}
              type="button"
              onClick={() => {
                setPurpose(x.key);
                setBody(x.suggested);
              }}
              className={cn(
                "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                x.key === purpose ? "border-[color:var(--brand)] bg-[color:var(--brand-soft)] text-[color:var(--brand-dark)]" : "border-[color:var(--border)] hover:border-[color:var(--border-strong)]",
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name der Vorlage bei 360dialog, z. B. erstanschreiben_v1"
          className={cn(field, "w-full")}
          required
        />
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2 text-sm outline-none focus:border-[color:var(--brand)]"
        />
        <p className="text-xs text-[color:var(--muted)]">
          Platzhalter: {cur?.params.map((x, i) => `{{${i + 1}}} ${x}`).join(" · ")}
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              label="Von Meta freigegeben"
              checked={approved}
              onChange={async (next) => {
                setApproved(next);
                return { ok: true };
              }}
            />
            Von Meta schon freigegeben
          </label>
          <button
            type="submit"
            disabled={pending || !name.trim()}
            className="inline-flex h-11 items-center gap-2 rounded-[var(--radius-sm)] bg-[color:var(--brand)] px-5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Vorlage speichern
          </button>
        </div>
      </form>
      <PhonePreview text={preview} sender={sender} />
    </div>
  );
}
