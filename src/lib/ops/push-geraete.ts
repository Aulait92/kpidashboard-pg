// Diagnose „push-geraete“ (Ole, 22.11.2026: Admin-Pushs kommen nicht an, Logs „sent=0“): welche Geräte (Web-Push,
// App-Store-App) hängen an welchem Login. Ohne Endpunkte, Schlüssel und Tokens; E-Mail nur gekürzt.
import { prisma } from "@/lib/prisma";

const kurz = (e: string | null | undefined) => (e ? e.replace(/^(.{3}).*(@.*)$/, "$1…$2") : null);
const geraet = (ua: string | null | undefined) =>
  !ua ? "unbekannt" : /iphone|ipad/i.test(ua) ? "iPhone/iPad" : /android/i.test(ua) ? "Android" : /mac os/i.test(ua) ? "Mac" : /windows/i.test(ua) ? "Windows" : "anderes";

export async function pushGeraeteDiagnose() {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true, lastLoginAt: true } });
  const ids = admins.map((a) => a.id);
  const [web, nativ, neueste] = await Promise.all([
    prisma.pushSubscription.findMany({ where: { OR: [{ userId: { in: ids } }, { userId: null }] }, select: { userId: true, userAgent: true, createdAt: true, lastUsedAt: true } }),
    prisma.deviceToken.findMany({ where: { userId: { in: ids } }, select: { userId: true, platform: true, createdAt: true, lastSeenAt: true } }),
    // Die zuletzt angelegten Abos überhaupt (an wen sie gerade hängen), um verirrte Admin-Geräte zu finden
    prisma.pushSubscription.findMany({ orderBy: { lastUsedAt: "desc" }, take: 10, select: { userId: true, userAgent: true, createdAt: true, lastUsedAt: true } }),
  ]);
  const nutzer = await prisma.user.findMany({ where: { id: { in: neueste.map((n) => n.userId).filter((x): x is string => !!x) } }, select: { id: true, email: true, role: true } });
  const nameVon = (id: string | null) => {
    const u = nutzer.find((x) => x.id === id) ?? admins.find((x) => x.id === id);
    return u ? `${kurz(u.email)} (${"role" in u ? u.role : "ADMIN"})` : id ? "unbekannt" : "ohne Login";
  };
  return {
    admins: admins.map((a) => ({
      email: kurz(a.email),
      letzterLogin: a.lastLoginAt,
      web: web.filter((w) => w.userId === a.id).map((w) => ({ geraet: geraet(w.userAgent), seit: w.createdAt, zuletzt: w.lastUsedAt })),
      app: nativ.filter((n) => n.userId === a.id).map((n) => ({ plattform: n.platform, seit: n.createdAt, zuletzt: n.lastSeenAt })),
    })),
    ohneLogin: web.filter((w) => !w.userId).length,
    zuletztAngelegteAbos: neueste.map((n) => ({ an: nameVon(n.userId), geraet: geraet(n.userAgent), seit: n.createdAt, zuletzt: n.lastUsedAt })),
    vapid: !!process.env.VAPID_PRIVATE_KEY && !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
  };
}
