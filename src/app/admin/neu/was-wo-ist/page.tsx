import { Seite } from "@/components/admin-neu/ui/seite";
import { Funktionsliste, type FunktionZeile } from "@/components/admin-neu/was-wo-ist/funktionsliste";
import { BEREICHE, NEU, SEITEN, type BereichId } from "@/lib/admin-neu/navigation";
import { requireAuth } from "@/lib/vertrieb/auth";
import inventar from "../../../../../docs/ux/admin-neu/funktionsinventar.json";

export const metadata = { title: "Was wo ist | performancegrowth Admin" };

// Was wo ist (Demo „landkarte“): alle Funktionen des heutigen Admins aus dem Funktionsinventar mit heutigem Ort und
// neuem Ort samt Link. Seit Admin v2 steht vorne die Rolle (Bereich im Inventar, tools/admin-neu/inventar-stand.mjs). Hilfe für den Umzug; Ole entscheidet später, ob die Seite bleibt.
// Neuer Ort = Seite der Demo-Ansicht aus navigation.ts. Detailseiten ([id]) verlinken auf die nächste Liste darüber
// (z. B. „in jedem Kontakt“ → Kontakte). Stand „neu da / noch alt“ kommt aus status_neu (tools/admin-neu/inventar-stand.mjs).

type Eintrag = { id: string; funktion: string; heute: string; neu: string; demo_view: string; bereich: string; status_neu: string };

const ohneId = SEITEN.filter((s) => !s.pfad.includes("["));

/** Bereichsnamen der ersten Fassung, die im Ort durch die Rolle (Admin v2) ersetzt werden. Marketing bleibt als Unterpunkt. */
const ALTE_BEREICHE = new Set(["Heute", "Vertrieb", "Kunden", "Leads & Kampagnen", "Zahlen", "Einstellungen"]);

/** Neuer Ort mit Rolle vorne, z. B. „Zahlen › Qualität & Nutzung“ → „Betreuen › Qualität & Nutzung“. */
function ortText(neu: string, view: string, bereich: string): string {
  const teile = neu.split(" › ");
  // Rahmen (Seitenleiste, Suche, Push …) gehört zu keiner Rolle
  if (["heute", "mehr", "landkarte"].includes(view) && teile[0] !== "Heute") return neu;
  const rolle = BEREICHE.find((b) => b.id === bereich)?.label;
  if (!rolle) return neu;
  if (ALTE_BEREICHE.has(teile[0])) teile.shift();
  return [rolle, ...teile.filter((t, i) => !(i === 0 && t === rolle))].join(" › ");
}

/** Link und ggf. Hinweis „über …“ für eine Demo-Ansicht. */
function ort(view: string, bereich: string): { href: string; ueber: string | null } {
  const seiten = SEITEN.filter((s) => s.view === view);
  const direkt = seiten.find((s) => !s.pfad.includes("["));
  if (direkt) return { href: direkt.pfad, ueber: null };
  const detail = seiten[0];
  if (detail) {
    // Nächste Seite ohne [id] darüber, z. B. /admin/neu/vertrieb/kontakte/[id]/angebot → /admin/neu/vertrieb/kontakte
    let p = detail.pfad.slice(0, detail.pfad.indexOf("[")).replace(/\/$/, "");
    while (p.length > NEU.length && !ohneId.some((s) => s.pfad === p)) p = p.slice(0, p.lastIndexOf("/"));
    const liste = ohneId.find((s) => s.pfad === p);
    if (liste) return { href: liste.pfad, ueber: `in jedem Eintrag unter ${liste.titel}` };
  }
  const b = BEREICHE.find((x) => x.id === (bereich as BereichId)) ?? BEREICHE[0];
  return { href: b.pfad, ueber: null };
}

export default async function Page() {
  await requireAuth();
  const zeilen: FunktionZeile[] = (inventar as Eintrag[]).map((e) => {
    const o = ort(e.demo_view, e.bereich);
    return {
      id: e.id,
      funktion: e.funktion,
      heute: e.heute,
      neu: ortText(e.neu, e.demo_view, e.bereich),
      href: o.href,
      ueber: o.ueber,
      status: e.status_neu === "vorhanden" || e.status_neu === "bleibt" ? e.status_neu : "offen",
    };
  });
  const da = zeilen.filter((z) => z.status === "vorhanden").length;
  return (
    <Seite titel="Was wo ist" untertitel={`Jede Funktion des heutigen Admins und ihr neuer Ort. ${da} von ${zeilen.length} sind schon im neuen Admin.`}>
      <Funktionsliste zeilen={zeilen} />
    </Seite>
  );
}
