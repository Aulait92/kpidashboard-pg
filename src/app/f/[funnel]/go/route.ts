import { prisma } from "@/lib/prisma";
import { FUNNELS } from "@/lib/funnel/definition";
import { anteilEigen, EIGEN_URL_DEFAULT, nurPerspective, weichenArm, weichenZiel } from "@/lib/funnel/weiche";
import { parseFunnelHosts, WEICHE_HOSTS_DEFAULT } from "@/lib/funnel/host";

// Weiche eigener Funnel gegen Perspective (lib/funnel/weiche.ts). Auf beitrag.pkv-tarife.com unter /go erreichbar.
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ funnel: string }> }): Promise<Response> {
  const { funnel } = await ctx.params;
  if (!FUNNELS[funnel]) return new Response("Nicht gefunden", { status: 404 });
  const url = new URL(req.url);
  const hvk = nurPerspective(url.search);
  const arm = hvk ? "perspective" : weichenArm(Math.random(), anteilEigen(process.env.WEICHE_ANTEIL_EIGEN));
  await prisma.funnelEreignis
    .create({ data: { besuchId: crypto.randomUUID(), funnel, schritt: "weiche", art: "zuteilung", variante: hvk ? "hvk" : arm } })
    .catch((err) => console.error("[funnel weiche]", err instanceof Error ? err.message : err));
  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? url.host).split(",")[0].trim();
  // Weiche auf start.pkv-tarife.com: unser Funnel liegt unter beitrag.pkv-tarife.com
  const aufWeichenDomain = parseFunnelHosts(process.env.WEICHE_HOSTS ?? WEICHE_HOSTS_DEFAULT).get(host.toLowerCase().replace(/:\d+$/, "")) === funnel;
  const ziel = weichenZiel(arm, url.search, { perspectiveUrl: process.env.PERSPECTIVE_URL, eigenUrl: aufWeichenDomain ? process.env.WEICHE_EIGEN_URL || EIGEN_URL_DEFAULT : null });
  if (arm === "eigen" && aufWeichenDomain) return new Response(null, { status: 302, headers: { Location: ziel, "Cache-Control": "no-store" } });
  // Eigen: auf der Funnel-Domain „/“ (dort zum Funnel umgeschrieben), sonst /f/<funnel> auf der App-Domain
  const proto = (req.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")).split(",")[0].trim() || "https";
  const aufFunnelDomain = parseFunnelHosts(process.env.FUNNEL_HOSTS).get(host.toLowerCase().replace(/:\d+$/, "")) === funnel;
  const pfad = aufFunnelDomain ? ziel : ziel.replace(/^\//, `/f/${funnel}`);
  const location = arm === "eigen" ? `${proto}://${host}${pfad}` : ziel;
  return new Response(null, { status: 302, headers: { Location: location, "Cache-Control": "no-store" } });
}
