import { Seite } from "@/components/admin-neu/ui/seite";
import { Funktionsliste, type FunktionZeile } from "@/components/admin-neu/was-wo-ist/funktionsliste";
import { ort, ortText, type InventarEintrag } from "@/lib/admin-neu/funktionen";
import { requireAuth } from "@/lib/vertrieb/auth";
import inventar from "../../../../../docs/ux/admin-neu/funktionsinventar.json";

export const metadata = { title: "Was wo ist | performancegrowth Admin" };

// Was wo ist (Demo „landkarte“): alle Funktionen des heutigen Admins aus dem Funktionsinventar mit heutigem Ort und
// neuem Ort samt Link. Seit Admin v2 steht vorne die Rolle (Bereich im Inventar, tools/admin-neu/inventar-stand.mjs). Hilfe für den Umzug; Ole entscheidet später, ob die Seite bleibt.
// Neuer Ort = Seite der Demo-Ansicht aus navigation.ts. Detailseiten ([id]) verlinken auf die nächste Liste darüber
// (z. B. „in jedem Kontakt“ → Kontakte). Stand „neu da / noch alt“ kommt aus status_neu (tools/admin-neu/inventar-stand.mjs).

export default async function Page() {
  await requireAuth();
  const zeilen: FunktionZeile[] = (inventar as InventarEintrag[]).map((e) => {
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
