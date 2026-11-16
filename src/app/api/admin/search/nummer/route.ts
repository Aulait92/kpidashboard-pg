import { getCurrentSession } from "@/lib/auth";
import { adoptFoundPhone } from "@/lib/telefonsuche-server";

// „Als weitere Nummer übernehmen“ im Suchtreffer (Ole, 16.11.2026): Nummer aus einer Mail-Signatur oder Buchung
// an den Vertriebskontakt übernehmen, über die Kontaktdaten-Übernahme (addContactPhone: keine Dubletten,
// fehlt die Hauptnummer, wird sie Haupt; Verlaufseintrag „Neue Telefonnummer erkannt“).
export const dynamic = "force-dynamic";

const TEXT = {
  added: "Als weitere Nummer übernommen",
  main: "Als Hauptnummer übernommen",
  known: "Schon am Kontakt",
  skipped: "Nicht übernommen",
  notfound: "Nicht mehr vorhanden",
} as const;

export async function POST(req: Request): Promise<Response> {
  const session = await getCurrentSession();
  if (!session || session.role !== "ADMIN") return Response.json({ error: "Nicht erlaubt." }, { status: 403 });
  // Nur per fetch mit JSON (kein einfaches Formular von fremden Seiten)
  if (!req.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Ungültig." }, { status: 415 });
  const body = (await req.json().catch(() => ({}))) as { quelle?: unknown; id?: unknown };
  const quelle = typeof body.quelle === "string" ? body.quelle : "";
  const id = typeof body.id === "string" ? body.id.slice(0, 40) : "";
  if (!id || !["mail", "buchung"].includes(quelle)) return Response.json({ error: "Ungültig." }, { status: 400 });
  const result = await adoptFoundPhone(quelle, id);
  return Response.json({ ok: result === "added" || result === "main" || result === "known", result, text: TEXT[result] });
}
