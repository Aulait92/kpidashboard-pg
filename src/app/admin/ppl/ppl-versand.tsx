// Admin → Pay-per-Lead → HvK-Abrechnungen, Zeile „Versand an Pivacom“: Microsoft-365-Postfach, über das die
// Lead-Mails an Pivacom (ISO-8859-1) rausgehen (lib/ppl/versand-postfach.ts). Status, verbinden, Testmail.

import { AlertTriangle, Send } from "lucide-react";
import { hvkMailAvailable } from "@/lib/ppl/hvk-mail";
import { versandPostfach, versandPostfachStatus } from "@/lib/ppl/versand-postfach";
import { VersandTest } from "./hvk-client";

const dt = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

const MELDUNG: Record<string, { tone: "success" | "warning"; text: string }> = {
  verbunden: { tone: "success", text: "Versand-Postfach verbunden. Lead-Mails an Pivacom gehen ab jetzt darüber raus." },
  recht: { tone: "warning", text: "Das Senden von E-Mails wurde nicht erlaubt. Bitte erneut verbinden und zustimmen." },
  freigabe: { tone: "warning", text: "Microsoft verlangt eine Admin-Freigabe für Mail.Send (Entra, API-Berechtigungen)." },
  abgelehnt: { tone: "warning", text: "Anmeldung abgebrochen." },
  fehler: { tone: "warning", text: "Verbinden hat nicht geklappt. Bitte erneut versuchen." },
};

export async function PplVersandPostfach({ meldung }: { meldung?: string }) {
  const box = await versandPostfachStatus();
  const postfach = versandPostfach();
  const notice = meldung ? MELDUNG[meldung] : null;
  const stand = box
    ? [`verbunden als ${box.email}`, ...(box.email !== postfach ? [`sendet als ${postfach}`] : []), box.lastCheckAt ? `zuletzt gesendet ${dt(box.lastCheckAt)}` : "noch nichts gesendet"].join(", ")
    : `Versand-Postfach nicht verbunden (${postfach})`;
  return (
    <div className="space-y-1.5 border-b border-[color:var(--border)] px-5 py-2.5 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex min-w-0 items-center gap-2">
          <Send className="h-4 w-4 shrink-0 text-[color:var(--muted)]" />
          <span className="font-medium">Versand an Pivacom</span>
        </span>
        <span className={`min-w-0 ${box ? "text-[color:var(--muted)]" : "text-amber-800"}`}>{stand}</span>
        <span className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {box ? <VersandTest /> : null}
          {!hvkMailAvailable() ? (
            <span className="text-xs text-amber-800">Microsoft-Anmeldung ist nicht eingerichtet (MICROSOFT_CLIENT_ID).</span>
          ) : (
            <a
              href="/api/admin/ppl-versand/verbinden"
              className="inline-flex h-9 items-center rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 text-sm font-semibold"
            >
              {box ? "Neu verbinden" : "Versand-Postfach verbinden"}
            </a>
          )}
        </span>
      </div>
      {box?.status === "error" ? (
        <p className="flex items-center gap-2 text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Versand-Postfach meldet einen Fehler: {box.lastError ?? "unbekannt"}
        </p>
      ) : null}
      {notice ? <p className={notice.tone === "success" ? "text-emerald-700" : "text-amber-800"}>{notice.text}</p> : null}
    </div>
  );
}
