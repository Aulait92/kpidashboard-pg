import type { LucideIcon } from "lucide-react";
import { BarChart3, Briefcase, Building2, Map as MapIcon, Megaphone, MessagesSquare, Settings, Sun } from "lucide-react";
import type { BereichId } from "@/lib/admin-neu/navigation";

/** Symbol je Bereich (navigation.ts bleibt reine Daten). */
export const BEREICH_SYMBOL: Record<BereichId, LucideIcon> = {
  heute: Sun,
  vertrieb: Briefcase,
  kunden: Building2,
  leads: MessagesSquare,
  marketing: Megaphone,
  zahlen: BarChart3,
  einstellungen: Settings,
  "was-wo-ist": MapIcon,
};
