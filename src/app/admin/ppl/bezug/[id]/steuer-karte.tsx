// Admin → Pay-per-Lead → Bezug: „Umsatzsteuer und Vermittlerregister“ (Ole, 20.11.2026; lib/ppl/steuer.ts).
// Zeigt, wie Bestellungen dieses Bezugs abgerechnet werden, und nimmt die Registerprüfung am Kunden auf.
import { Badge, Card, CardHeader } from "@/components/ui";
import { prisma } from "@/lib/prisma";
import { effektiveSteuer } from "@/lib/ppl/steuer";
import { registerVorschlag } from "@/lib/ppl/erste-woche";
import { RegisterForm } from "./register-form";
import { PartnerForm } from "./partner-form";

const berlinIso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin" }).format(d);

export async function SteuerKarte({ sub }: { sub: { id: string; customerId: string; productKey: string; steuer: string | null } }) {
  const [kunde, wartet] = await Promise.all([
    prisma.customer.findUnique({
      where: { id: sub.customerId },
      select: { vermittlerRegisterNr: true, vermittlerRegisterStatus: true, vermittlerGeprueftAt: true, vermittlerGeprueftVon: true, partnerFirma: true, partnerAnschrift: true, partnerRegisterNr: true },
    }),
    prisma.leadOrder.count({ where: { subscriptionId: sub.id, status: "wartet" } }),
  ]);
  const { steuer, grund } = effektiveSteuer(sub, kunde);
  const vorschlag = kunde?.vermittlerRegisterNr ?? (await registerVorschlag(null, sub.customerId).catch(() => null)) ?? "";
  const geprueft = kunde?.vermittlerGeprueftAt;
  return (
    <Card>
      <CardHeader
        title="Umsatzsteuer und Vermittlerregister"
        actions={<Badge tone={steuer === "steuerfrei_4_11" ? "success" : "neutral"}>{steuer === "steuerfrei_4_11" ? "steuerfrei § 4 Nr. 11" : "19 % USt."}</Badge>}
      />
      <div className="space-y-1 px-5 pb-3 text-sm">
        <p>
          Abrechnung: <b>{steuer === "steuerfrei_4_11" ? "steuerfrei nach § 4 Nr. 11 UStG" : "steuerpflichtig, 19 %"}</b> ({grund}).
        </p>
        <p className="text-[color:var(--muted)]">
          {geprueft
            ? `Geprüft am ${geprueft.toLocaleDateString("de-DE", { timeZone: "Europe/Berlin" })}${kunde?.vermittlerGeprueftVon ? ` von ${kunde.vermittlerGeprueftVon}` : ""}.`
            : kunde?.vermittlerRegisterNr
              ? "Registernummer vom Kunden angegeben, noch zu prüfen."
              : "Noch nicht geprüft."}
          {wartet ? ` ${wartet} Bestellung${wartet === 1 ? "" : "en"} wartet auf die Prüfung.` : ""}
        </p>
      </div>
      <RegisterForm
        customerId={sub.customerId}
        registerNr={vorschlag}
        status={kunde?.vermittlerRegisterStatus ?? ""}
        geprueftAm={geprueft ? berlinIso(geprueft) : ""}
        heute={berlinIso(new Date())}
      />
      <PartnerForm customerId={sub.customerId} firma={kunde?.partnerFirma ?? ""} anschrift={kunde?.partnerAnschrift ?? ""} registerNr={kunde?.partnerRegisterNr ?? ""} />
    </Card>
  );
}
