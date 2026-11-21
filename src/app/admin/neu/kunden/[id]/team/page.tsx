import { connection } from "next/server";
import { Card, CardHeader } from "@/components/ui";
import { KundenakteSeite } from "@/components/admin-neu/kunden/akte";
import { Aufklapp } from "@/components/admin-neu/kunden/aufklapp";
import { NaechsterSchrittCard } from "@/components/admin/naechster-schritt-card";
import { CreateBuyerForm } from "@/app/admin/buyers/buyer-management";
import { LoginList, type LoginRow } from "@/app/admin/buyers/login-list";
import { randomInt } from "node:crypto";
import { prisma } from "@/lib/prisma";

export const metadata = { title: "Team & Logins | performancegrowth Admin" };

const tag = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" });
const tagJahr = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
const jahr = (d: Date) => new Intl.DateTimeFormat("de-DE", { year: "numeric", timeZone: "Europe/Berlin" }).format(d);
/** „14.11.“ im laufenden Jahr, sonst „14.11.2025“ (wie /admin/buyers). */
const kurz = (d: Date) => (jahr(d) === jahr(new Date()) ? tag.format(d) : tagJahr.format(d));

// Kundenakte › Team & Logins: Logins dieses Kunden (Liste und Aktionen aus app/admin/buyers: Passwort, E-Mail,
// Einladung, anderem Kunden zuordnen, löschen), „+ Login“ zugeklappt, und der nächste Schritt je Berater.
// „Als Kunde ansehen“ steht im Kopf der Akte. Die globale Liste /admin/buyers geht in der Suche auf (Logins).
export default async function KundeTeam({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  const [buyers, customers] = await Promise.all([
    prisma.user.findMany({
      where: { role: "BUYER", customerId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, displayName: true, teamRole: true, createdAt: true, lastLoginAt: true, customer: { select: { id: true, name: true } } },
    }),
    prisma.customer.findMany({ where: { plan: { not: "internal" }, archived: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const rows: LoginRow[] = buyers.map((b) => ({
    id: b.id,
    email: b.email,
    displayName: b.displayName,
    owner: b.teamRole !== "advisor",
    created: kurz(b.createdAt),
    lastLogin: b.lastLoginAt ? kurz(b.lastLoginAt) : null,
    customer: b.customer,
  }));

  return (
    <KundenakteSeite id={id}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <div
              data-funktion="login-list--logins-des-kunden-mit-einladung-offen-zuletzt actions-resetbuyerpassword--passwort-setzen actions-changebuyeremail--e-mail-adresse-aendern actions-deletebuyeraccount--login-loeschen actions-sendbuyeraccesslink--einladung-erneut-senden-bzw-link-zum-passwort actions-reassignbuyercustomer--login-einem-anderen-kunden-zuordnen"
            >
              <CardHeader title="Logins" count={rows.length} />
              <div className="px-5 pb-4">
                {rows.length ? (
                  <LoginList rows={rows} customers={customers} />
                ) : (
                  <p className="pt-4 text-sm text-[color:var(--muted)]">Noch kein Login. Legen Sie unten den ersten an.</p>
                )}
              </div>
            </div>
          </Card>
          <div data-funktion="actions-createbuyeraccount--neuen-login-anlegen-e-mail-passwort-kunde">
            <Aufklapp titel="Login anlegen" zusammenfassung="E-Mail genügt, das Startpasswort ist vorbelegt" offen={!rows.length}>
              <div className="rounded-[var(--radius-md)] bg-white px-4 pb-4 pt-1">
                <CreateBuyerForm customers={customers} kundeId={id} startPasswort={startPasswort()} />
              </div>
            </Aufklapp>
          </div>
        </div>
        <div className="min-w-0" data-funktion="naechster-schritt-card--naechster-schritt-je-berater-quote-ohne-schritt">
          <NaechsterSchrittCard customerId={id} />
        </div>
      </div>
    </KundenakteSeite>
  );
}

/** Zufälliges Startpasswort als Standardwert (12 Zeichen ohne verwechselbare wie 0/O, 1/l). */
function startPasswort(): string {
  const z = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 12 }, () => z[randomInt(z.length)]).join("");
}
