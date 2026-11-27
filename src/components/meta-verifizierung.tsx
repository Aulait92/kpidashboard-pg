// Unternehmensverifizierung bei Meta (Ole, 27.11.2026, lib/whatsapp/meta-verifizierung.ts): im Schritt „WhatsApp
// verbinden“ der Einrichtung und als Hinweis auf „Heute“, solange Meta das Unternehmen als nicht verifiziert meldet.
// Nicht blockierend (ohne Verifizierung schicken Leads Policen als Foto im Chat). Eine Hauptaktion: der Link zu Meta.

import { BadgeCheck, CheckCircle2, ExternalLink } from "lucide-react";
import { buttonClass, Card, CardHeader } from "@/components/ui";
import { ladeMetaVerifizierung, META_VERIFIZIERUNG_URL, type MetaVerifizierungStand } from "@/lib/whatsapp/meta-verifizierung";

export const META_TITEL = "Unternehmen bei Meta verifizieren";
export const META_NUTZEN = "Damit Ihre Kunden Policen bequem per Formular im Chat schicken können, bis dahin geht es per Foto.";
export const META_SCHRITTE = [
  "Öffnen Sie business.facebook.com → Einstellungen → Sicherheitscenter.",
  "Tippen Sie bei „Unternehmensverifizierung“ auf „Verifizierung starten“.",
  "Laden Sie den Handelsregisterauszug oder die Gewerbeanmeldung hoch.",
  "Name und Anschrift im Dokument müssen genau zu den Angaben im Business Manager passen.",
];
export const META_DAUER = "Die Prüfung dauert meist 1 bis 5 Werktage, danach hakt die App das von selbst ab.";
export const META_KNOPF = "Verifizierung bei Meta starten";
export const META_ERLEDIGT = "Unternehmen bei Meta verifiziert";

/** Inhalt (ohne Rahmen): Satz, Hauptaktion, „So geht's“ zum Aufklappen. */
export function MetaVerifizierungInhalt({ stand }: { stand: MetaVerifizierungStand }) {
  if (stand === "erledigt") {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700" data-meta-verifiziert>
        <CheckCircle2 className="h-4 w-4" /> {META_ERLEDIGT}
      </p>
    );
  }
  return (
    <div data-meta-verifizierung-offen>
      <p className="text-[15px] text-[color:var(--muted)]">{META_NUTZEN}</p>
      <a href={META_VERIFIZIERUNG_URL} target="_blank" rel="noopener noreferrer" className={buttonClass("primary", "md", "mt-3 w-full sm:w-auto")}>
        {META_KNOPF} <ExternalLink className="h-4 w-4" />
      </a>
      <details className="mt-3 text-sm [&>summary::-webkit-details-marker]:hidden">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-[color:var(--brand)]">So geht&apos;s</summary>
        <ol className="mt-1 list-decimal space-y-1 pl-5">
          {META_SCHRITTE.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ol>
        <p className="mt-2 text-[color:var(--muted)]">{META_DAUER}</p>
      </details>
    </div>
  );
}

/** Im Schritt „WhatsApp verbinden“: Zwischentitel und Inhalt. */
export function MetaVerifizierungSchritt({ stand }: { stand: MetaVerifizierungStand | null }) {
  if (!stand) return null;
  if (stand === "erledigt") return <div className="mt-4"><MetaVerifizierungInhalt stand={stand} /></div>;
  return (
    <div className="mt-5 border-t border-[color:var(--border)] pt-4" id="meta-verifizierung">
      <p className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <BadgeCheck className="h-4 w-4 text-[color:var(--muted)]" /> {META_TITEL}
      </p>
      <MetaVerifizierungInhalt stand={stand} />
    </div>
  );
}

/** Hinweis auf „Heute“: nur offen, nur für den Inhaber (Teammitglieder können das Unternehmen nicht verifizieren). */
export async function MetaVerifizierungHinweis({ ctx }: { ctx: { customerId: string; teamRole?: string | null } }) {
  if (ctx.teamRole === "advisor") return null;
  const stand = await ladeMetaVerifizierung(ctx.customerId).catch(() => null);
  if (stand !== "offen") return null;
  return (
    <div data-meta-verifizierung-hinweis>
      <Card id="meta-verifizierung">
        <CardHeader title={META_TITEL} icon={BadgeCheck} />
        <div className="px-5 pb-5 pt-4">
          <MetaVerifizierungInhalt stand="offen" />
        </div>
      </Card>
    </div>
  );
}
