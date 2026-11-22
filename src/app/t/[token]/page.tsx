import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck, CheckCircle2, Clock, Phone, Video } from "lucide-react";
import { LeadLegalFooter } from "@/components/lead-legal-footer";
import { AddToCalendar } from "@/components/add-to-calendar";
import { PhoneField } from "@/components/phone-field";
import { SubmitButton } from "@/components/submit-button";
import { buttonClass } from "@/components/ui";
import { a, type Ansprache } from "@/lib/ansprache";
import { pruefeStreckenToken } from "@/lib/mail-strecke/token";
import { seitenStand, type SeitenStand } from "@/lib/mail-strecke/server";
import { abmeldenAction, adresseAction, angabenAction, antwortAction, komplettcheckAction, terminAction } from "./actions";
import { Gesehen } from "./gesehen";

// Antwortseite der Mail-Strecke für Leads ohne WhatsApp (Ole, 18.11.2026, E3/E4). Der Link aus der E-Mail bzw. SMS
// zeigt nur an (Vorauswahl über ?a= bzw. ?z=); gespeichert und gebucht wird erst mit einem Klick auf der Seite (POST),
// damit Link-Scanner nichts auslösen. Nach der Buchung: Komplettcheck, Angaben fürs Angebot, Bereitlegen, Adresse.
// Eine Hauptaktion je Schritt, Handy zuerst.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Ihr Termin", robots: { index: false, follow: false }, referrer: "no-referrer" };

const TZ = "Europe/Berlin";
const fmt = (d: Date | string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, ...o }).format(new Date(d));
const tag = (d: Date | string) => fmt(d, { weekday: "long", day: "numeric", month: "long" });
const uhr = (d: Date | string) => fmt(d, { hour: "2-digit", minute: "2-digit" });

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ a?: string; z?: string; f?: string; ab?: string; danke?: string }> };

function fehlerText(an: Ansprache, f: string | undefined): string | null {
  if (!f) return null;
  const T: Record<string, string> = {
    vergeben: a(an, "Diese Zeit ist leider gerade vergeben worden. Hier sind neue Zeiten für dich.", "Diese Zeit ist leider gerade vergeben worden. Hier sind neue Zeiten für Sie."),
    zeit: a(an, "Diese Zeit ist nicht mehr frei. Bitte wähle eine der Zeiten unten.", "Diese Zeit ist nicht mehr frei. Bitte wählen Sie eine der Zeiten unten."),
    telefon: a(an, "Für ein Telefonat brauchen wir deine Nummer.", "Für ein Telefonat brauchen wir Ihre Nummer."),
    laeuft: a(an, "Dein Termin wird gerade gebucht. Einen Moment bitte.", "Ihr Termin wird gerade gebucht. Einen Moment bitte."),
    email: a(an, "Bitte gib eine gültige E-Mail-Adresse an.", "Bitte geben Sie eine gültige E-Mail-Adresse an."),
    busy: a(an, "Gerade ist viel los. Bitte versuch es gleich noch einmal.", "Gerade ist viel los. Bitte versuchen Sie es gleich noch einmal."),
  };
  return T[f] ?? a(an, "Etwas hat nicht geklappt. Bitte versuch es noch einmal.", "Etwas hat nicht geklappt. Bitte versuchen Sie es noch einmal.");
}

export default async function StreckenSeite({ params, searchParams }: Props) {
  const { token } = await params;
  const sp = await searchParams;
  const id = pruefeStreckenToken(token);
  const st = id ? await seitenStand(id) : null;
  if (!st) {
    return (
      <Shell>
        <h1 className="text-xl font-bold">Link nicht gültig</h1>
        <p className="mt-2 text-sm text-[color:var(--muted)]">Dieser Link ist nicht (mehr) gültig. Antworten Sie einfach auf die E-Mail.</p>
      </Shell>
    );
  }
  const an = st.an;
  const fehler = fehlerText(an, sp.f);

  return (
    <Shell customerId={st.customerId}>
      <Gesehen token={token} />
      <Kopf st={st} />
      {fehler ? (
        <div className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 ring-1 ring-amber-200" role="alert" data-fehler={sp.f}>
          {fehler}
        </div>
      ) : null}
      {sp.ab ? <Abmelden st={st} token={token} fertig={sp.ab === "fertig"} /> : st.termin ? <NachBuchung st={st} token={token} /> : <VorBuchung st={st} token={token} sp={sp} />}
      {/* Abmelden auch ohne Link in der SMS (SMS mit Rückruf zu Geschäftszeiten, Ole 22.11.2026) */}
      {!sp.ab && !st.termin && !st.abgemeldet ? (
        <a href="?ab=1" className="mt-6 block text-center text-xs text-[color:var(--muted)] underline" data-abmelden-link>
          Keine Nachrichten mehr? Abmelden
        </a>
      ) : null}
    </Shell>
  );
}

function Kopf({ st }: { st: SeitenStand }) {
  const initialen = st.advisor
    .replace(/^Allianz\s+/i, "")
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <div className="flex items-center gap-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--brand-soft)] text-sm font-bold text-[color:var(--brand-dark)]">{initialen}</span>
      <div className="min-w-0">
        <div className="text-xs text-[color:var(--muted)]">Kostenloses Beratungsgespräch</div>
        <div className="truncate text-base font-semibold leading-tight">{st.advisor}</div>
      </div>
    </div>
  );
}

const auswahl =
  "flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[var(--radius-sm)] border border-[color:var(--border)] bg-white px-3 py-3 text-center text-[15px] font-semibold transition hover:border-[color:var(--brand)] has-checked:border-[color:var(--brand)] has-checked:bg-[color:var(--brand-soft)] has-checked:text-[color:var(--brand-dark)]";

function VorBuchung({ st, token, sp }: { st: SeitenStand; token: string; sp: { a?: string; z?: string; danke?: string } }) {
  const an = st.an;
  const ai = sp.a != null ? Number(sp.a) : null;
  // Frage zuerst, wenn der Lead in der E-Mail eine Antwort gewählt hat und sie noch nicht gespeichert ist
  if (st.frage && ai != null && Number.isInteger(ai) && st.frage.knoepfe[ai] && st.antwort !== st.frage.knoepfe[ai]) {
    return (
      <form action={antwortAction.bind(null, token)} className="mt-6" data-schritt="frage">
        <h1 className="text-xl font-semibold tracking-tight">{st.frage.text}</h1>
        <div className="mt-4 grid gap-2">
          {st.frage.knoepfe.map((k, i) => (
            <label key={k} className={auswahl}>
              <input type="radio" name="antwort" value={i} defaultChecked={i === ai} className="sr-only" required />
              {k}
            </label>
          ))}
        </div>
        <SubmitButton pendingLabel="Wird gesendet …" className={buttonClass("primary", "md", "mt-5 h-12 w-full text-base")}>
          {a(an, "Antwort senden", "Antwort senden")}
        </SubmitButton>
      </form>
    );
  }

  const zi = sp.z != null ? Number(sp.z) : 0;
  const danke = sp.danke || st.antwort ? a(an, "Danke, ist notiert.", "Danke, ist notiert.") : null;
  if (!st.kalender || !st.zeiten.length) {
    return (
      <div className="mt-6" data-schritt="ohne-zeiten">
        {danke ? <p className="mb-3 text-sm font-medium text-emerald-700">{danke}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight">{a(an, "Wähl einen Termin, der dir passt", "Wählen Sie einen Termin, der Ihnen passt")}</h1>
        {st.andereZeitUrl ? (
          <a href={st.andereZeitUrl} className={buttonClass("primary", "md", "mt-5 h-12 w-full text-base")}>
            {a(an, "Freie Zeiten ansehen", "Freie Zeiten ansehen")}
          </a>
        ) : (
          <p className="mt-3 text-[15px] text-[color:var(--muted)]">{a(an, `${st.person.nom} meldet sich in Kürze bei dir.`, `${st.person.nom} meldet sich in Kürze bei Ihnen.`)}</p>
        )}
      </div>
    );
  }
  return (
    <form action={terminAction.bind(null, token)} className="mt-6 space-y-5" data-schritt="termin">
      <div>
        {danke ? <p className="mb-2 text-sm font-medium text-emerald-700" data-danke>{danke}</p> : null}
        <h1 className="text-xl font-semibold tracking-tight">{a(an, `Dein Termin mit ${st.person.dat}`, `Ihr Termin mit ${st.person.dat}`)}</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-[color:var(--muted)]">
          <Clock className="h-4 w-4" /> {st.durationMin} Minuten, kostenlos
        </p>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-2 text-sm font-semibold">{a(an, "Zeit", "Zeit")}</legend>
        {st.zeiten.map((z, i) => (
          <label key={z} className={`${auswahl} justify-between`}>
            <input type="radio" name="start" value={z} defaultChecked={i === (Number.isInteger(zi) && zi < st.zeiten.length ? zi : 0)} className="sr-only" required />
            <span>{tag(z)}</span>
            <span className="tabular-nums">{uhr(z)} Uhr</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="group">
        <legend className="mb-2 text-sm font-semibold">{a(an, "Wie möchtest du sprechen?", "Wie möchten Sie sprechen?")}</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={auswahl}>
            <input type="radio" name="mode" value="video" defaultChecked className="sr-only" />
            <Video className="h-4 w-4" /> Video
          </label>
          <label className={auswahl}>
            <input type="radio" name="mode" value="phone" className="sr-only" data-telefon />
            <Phone className="h-4 w-4" /> Telefon
          </label>
        </div>
        {!st.hatTelefon ? (
          <div className="mt-3 hidden group-has-[[data-telefon]:checked]:block">
            <PhoneField name="phone" label={a(an, "Deine Nummer für den Anruf", "Ihre Nummer für den Anruf")} required={false} />
          </div>
        ) : null}
      </fieldset>
      <SubmitButton pendingLabel="Wird gebucht …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
        Termin festmachen
      </SubmitButton>
      {st.andereZeitUrl ? (
        <a href={st.andereZeitUrl} className="block py-1 text-center text-sm text-[color:var(--muted)] underline" data-andere-zeit>
          Andere Zeit
        </a>
      ) : null}
    </form>
  );
}

function TerminBox({ st }: { st: SeitenStand }) {
  const t = st.termin!;
  return (
    <div className="mt-5 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4" data-gebucht>
      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <div>
        <div className="font-semibold">{a(st.an, "Dein Termin steht", "Ihr Termin steht")}</div>
        <div className="text-[15px]">
          {tag(t.startsAt)}, {uhr(t.startsAt)} Uhr
        </div>
        <div className="text-sm text-[color:var(--muted)]">
          {t.mode === "video" ? "Videocall" : "Telefonat"} mit {st.person.dat}
        </div>
      </div>
    </div>
  );
}

function NachBuchung({ st, token }: { st: SeitenStand; token: string }) {
  const an = st.an;
  const t = st.termin!;
  if (st.nach === "komplettcheck") {
    return (
      <>
        <TerminBox st={st} />
        <form action={komplettcheckAction.bind(null, token)} className="mt-6" data-schritt="komplettcheck">
          <p className="text-[17px] font-semibold leading-snug">{st.komplettcheckText.replace(/^Danke! /, "")}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <button name="ja" value="1" className={buttonClass("primary", "md", "h-12 w-full text-base")} data-ja>
              Ja, gern
            </button>
            <button name="ja" value="0" className={buttonClass("secondary", "md", "h-12 w-full text-base")} data-nein>
              Nein, danke
            </button>
          </div>
        </form>
      </>
    );
  }
  if (st.nach === "angaben") {
    return (
      <>
        <TerminBox st={st} />
        <form action={angabenAction.bind(null, token)} className="mt-6 space-y-4" data-schritt="angaben">
          <p className="text-[17px] font-semibold leading-snug">{a(an, `Damit ${st.person.nom} dir gleich passende Beiträge zeigen kann:`, `Damit ${st.person.nom} Ihnen gleich passende Beiträge zeigen kann:`)}</p>
          {st.folgefragen.map((f) =>
            f.knoepfe?.length ? (
              <fieldset key={f.key}>
                <legend className="mb-1.5 text-sm font-medium">{f.text}</legend>
                <div className="grid grid-cols-2 gap-2">
                  {f.knoepfe.map((k) => (
                    <label key={k} className={auswahl}>
                      <input type="radio" name={`f_${f.key}`} value={k} className="sr-only" />
                      {k}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <label key={f.key} className="block">
                <span className="mb-1 block text-sm font-medium">{f.text}</span>
                <input name={`f_${f.key}`} {...(f.key === "wohnflaeche" ? { inputMode: "decimal" as const } : {})} className="w-full rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base focus:border-[color:var(--brand)] focus:outline-none" />
              </label>
            ),
          )}
          <SubmitButton pendingLabel="Wird gespeichert …" className={buttonClass("primary", "md", "h-12 w-full text-base")}>
            Weiter
          </SubmitButton>
          <button name="ueberspringen" value="1" formNoValidate className="block w-full py-1 text-center text-sm text-[color:var(--muted)] underline">
            {a(an, "Lieber im Termin klären", "Lieber im Termin klären")}
          </button>
        </form>
      </>
    );
  }
  const bereit = st.bereitlegen.length ? (
    <div className="mt-6" data-bereitlegen>
      <p className="text-sm font-semibold">{a(an, "Bitte leg zum Termin bereit:", "Bitte legen Sie zum Termin bereit:")}</p>
      <ul className="mt-2 space-y-1.5 text-[15px]">
        {st.bereitlegen.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--brand)]" />
            <span>{b.charAt(0).toUpperCase() + b.slice(1)}</span>
          </li>
        ))}
      </ul>
    </div>
  ) : null;
  if (st.nach === "adresse") {
    return (
      <>
        <TerminBox st={st} />
        {bereit}
        <form action={adresseAction.bind(null, token)} className="mt-6" data-schritt="adresse">
          <p className="text-[17px] font-semibold leading-snug">
            {st.email ? (
              <>
                {a(an, "Die Einladung mit Kalendereintrag geht an ", "Die Einladung mit Kalendereintrag geht an ")}
                <span className="break-all">{st.email}</span>. {a(an, "Stimmt die Adresse?", "Stimmt die Adresse?")}
              </>
            ) : (
              a(an, "An welche E-Mail-Adresse soll die Einladung gehen?", "An welche E-Mail-Adresse soll die Einladung gehen?")
            )}
          </p>
          {st.email ? (
            <>
              <SubmitButton pendingLabel="…" className={buttonClass("primary", "md", "mt-4 h-12 w-full text-base")}>
                Ja, stimmt
              </SubmitButton>
              <details className="mt-3">
                <summary className="cursor-pointer py-1 text-center text-sm text-[color:var(--muted)] underline">Andere Adresse</summary>
                <div className="mt-2 flex gap-2">
                  <input name="email" type="email" autoComplete="email" placeholder="name@beispiel.de" className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base" />
                  <button className={buttonClass("secondary", "md", "h-12")}>Speichern</button>
                </div>
              </details>
            </>
          ) : (
            <div className="mt-3 flex gap-2">
              <input name="email" type="email" required autoComplete="email" className="min-w-0 flex-1 rounded-[var(--radius-sm)] border border-[color:var(--border)] px-3 py-2.5 text-base" />
              <SubmitButton pendingLabel="…" className={buttonClass("primary", "md", "h-12")}>
                Speichern
              </SubmitButton>
            </div>
          )}
        </form>
      </>
    );
  }
  // Fertig
  return (
    <div data-schritt="fertig">
      <div className="mt-6 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200">
        <CalendarCheck className="h-6 w-6" />
      </div>
      <h1 className="mt-3 text-xl font-semibold tracking-tight">{a(an, "Alles fertig, bis bald!", "Alles fertig, bis bald!")}</h1>
      <p className="mt-1 text-[15px]">
        {tag(t.startsAt)}, {uhr(t.startsAt)} Uhr · {t.mode === "video" ? "Videocall" : "Telefonat"} mit {st.person.dat}
      </p>
      <p className="mt-2 text-sm text-[color:var(--muted)]">
        {t.einladungAt
          ? a(an, "Die Einladung mit Kalendereintrag ist per E-Mail unterwegs.", "Die Einladung mit Kalendereintrag ist per E-Mail unterwegs.")
          : a(an, "Die Einladung mit Kalendereintrag kommt gleich per E-Mail.", "Die Einladung mit Kalendereintrag kommt gleich per E-Mail.")}
      </p>
      {bereit}
      {t.mode === "video" && t.meetUrl ? (
        <a href={t.meetUrl} className={buttonClass("primary", "md", "mt-6 h-12 w-full text-base")}>
          <Video className="h-4 w-4" /> Link zum Videocall
        </a>
      ) : null}
      {t.manageToken ? <AddToCalendar token={t.manageToken} /> : null}
      {t.manageToken ? (
        <Link href={`/book/manage/${t.manageToken}`} className="mt-1 block py-2.5 text-center text-sm text-[color:var(--muted)] underline">
          Termin verschieben oder absagen
        </Link>
      ) : null}
    </div>
  );
}

function Abmelden({ st, token, fertig }: { st: SeitenStand; token: string; fertig: boolean }) {
  const an = st.an;
  if (fertig || st.abgemeldet) {
    return (
      <div className="mt-6" data-abgemeldet>
        <h1 className="text-xl font-semibold tracking-tight">{a(an, "Du bist abgemeldet", "Sie sind abgemeldet")}</h1>
        <p className="mt-2 text-[15px] text-[color:var(--muted)]">{a(an, `Du bekommst keine E-Mails und SMS mehr von ${st.advisor}.`, `Sie bekommen keine E-Mails und SMS mehr von ${st.advisor}.`)}</p>
      </div>
    );
  }
  return (
    <form action={abmeldenAction.bind(null, token)} className="mt-6" data-schritt="abmelden">
      <h1 className="text-xl font-semibold tracking-tight">{a(an, "Keine Nachrichten mehr?", "Keine Nachrichten mehr?")}</h1>
      <p className="mt-2 text-[15px] text-[color:var(--muted)]">{a(an, `Dann bekommst du von ${st.advisor} keine E-Mails und SMS mehr zu deiner Anfrage.`, `Dann bekommen Sie von ${st.advisor} keine E-Mails und SMS mehr zu Ihrer Anfrage.`)}</p>
      <SubmitButton pendingLabel="…" className={buttonClass("primary", "md", "mt-5 h-12 w-full text-base")}>
        Abmelden
      </SubmitButton>
      <Link href={`/t/${token}`} className="mt-2 block py-1 text-center text-sm text-[color:var(--muted)] underline">
        {a(an, "Doch lieber einen Termin wählen", "Doch lieber einen Termin wählen")}
      </Link>
    </form>
  );
}

function Shell({ children, customerId }: { children: React.ReactNode; customerId?: string | null }) {
  return (
    <>
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6 sm:py-10">
        <div className="rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-white p-5 shadow-[var(--shadow-md)] sm:p-7">{children}</div>
      </main>
      <LeadLegalFooter customerId={customerId} />
    </>
  );
}
