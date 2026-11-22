// Diagnose „lead-felder“ (Ole, 22.11.2026: „Bernd … hat kein Gebdat bei Kfz“): welche Formularfelder bei einem Lead
// angekommen sind, ohne Inhalte (nur Feldname und ob befüllt; beim Geburtsdatum das Format, nicht der Wert).
//   ?q=lead-felder&kunde=<customerId>&name=<Teil des Namens>
import { prisma } from "@/lib/prisma";

const format = (v: string) => v.replace(/\d/g, "9");

export async function leadFelderDiagnose(p: URLSearchParams) {
  const kunde = (p.get("kunde") ?? "").trim();
  const name = (p.get("name") ?? "").trim();
  if (!kunde || name.length < 3) return { fehler: "kunde und name (mind. 3 Zeichen) nötig" };
  const leads = await prisma.lead.findMany({
    where: { customerId: kunde, name: { contains: name, mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, createdAt: true, source: true, adFormId: true, formData: true, waUnavailableAt: true, status: true, email: true, customer: { select: { mailFeaturesOff: true, agentConfig: { select: { active: true, outreachEnabled: true } } } }, history: { orderBy: { createdAt: "desc" }, take: 12, select: { createdAt: true, kind: true, text: true } } },
  });
  return leads.map((l) => {
    const fd = l.formData as unknown;
    const eintraege: { label: string; value: string }[] = Array.isArray(fd)
      ? (fd as { label?: string; value?: string }[]).map((x) => ({ label: String(x.label ?? ""), value: String(x.value ?? "") }))
      : fd && typeof fd === "object"
        ? Object.entries(fd as Record<string, unknown>).map(([k, v]) => ({ label: k, value: String(v ?? "") }))
        : [];
    return {
      id: l.id,
      eingang: l.createdAt,
      quelle: l.source,
      formular: l.adFormId,
      keinWhatsappSeit: l.waUnavailableAt,
      status: l.status,
      emailVorhanden: !!l.email?.includes("@"),
      kundeMailAus: l.customer?.mailFeaturesOff ?? null,
      assistent: l.customer?.agentConfig ?? null,
      verlauf: l.history.map((h) => `${h.createdAt.toISOString().slice(11, 16)} ${h.kind}: ${h.text.slice(0, 160)}`),
      felder: eintraege.map((e) => ({ feld: e.label, befuellt: !!e.value.trim(), ...(/geburt/i.test(e.label) ? { format: format(e.value) } : {}) })),
    };
  });
}
