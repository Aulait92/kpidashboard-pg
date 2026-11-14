// Terminart (Appointment.mode): phone | video | onsite (vor Ort, nur von Hand eingetragen, Ole 14.11.2026)
export type TerminArt = "phone" | "video" | "onsite";

export const TERMIN_ART_LABEL: Record<TerminArt, string> = { phone: "Telefonat", video: "Videocall", onsite: "Vor Ort" };
export const TERMIN_ART_KURZ: Record<TerminArt, string> = { phone: "Telefon", video: "Video", onsite: "Vor Ort" };

export const asTerminArt = (m: string | null | undefined): TerminArt => (m === "video" || m === "onsite" ? m : "phone");
export const terminArtLabel = (m: string | null | undefined) => TERMIN_ART_LABEL[asTerminArt(m)];
export const terminArtKurz = (m: string | null | undefined) => TERMIN_ART_KURZ[asTerminArt(m)];
