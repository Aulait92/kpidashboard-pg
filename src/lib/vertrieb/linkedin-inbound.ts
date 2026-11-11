// Eingehende LinkedIn-Nachrichten (z.B. "Interesse an deinem Video").
// LinkedIn hat keine API für Direktnachrichten – Weg: LinkedIn-Benachrichtigungs-
// E-Mail → Zapier (Gmail-Auslöser) → Webhook. Alternativ direkt {name, profile_url, message}.
import { prisma } from "@/lib/prisma";
import { Matcher, flatten, normalizeLinkedInUrl } from "@/lib/vertrieb/linkedin";
import { handleInboundLead } from "@/lib/vertrieb/inbound";
import { classifyReply, type Sentiment } from "@/lib/vertrieb/sentiment";
import type { Prisma } from "@/generated/prisma/client";

const SUBJECT_PATTERNS = [
  /^(.+?) hat Ihnen (?:eine |1 )?(?:neue )?Nachricht gesendet/i,
  /^(.+?) hat dir (?:eine |1 )?(?:neue )?Nachricht gesendet/i,
  /^(.+?) hat Ihnen geschrieben/i,
  /^(.+?) hat dir geschrieben/i,
  /^Neue Nachricht von (.+)$/i,
  /^Nachricht von (.+)$/i,
  /^(.+?) sent you a (?:new )?message/i,
  /^(.+?) just messaged you/i,
  /^New message from (.+)$/i,
  /^(.+?) möchte sich mit Ihnen vernetzen/i,
  /^(.+?) wants to connect/i,
];

const BOILERPLATE =
  /^(antworten|reply|nachricht anzeigen|view message|alle nachrichten|abmelden|unsubscribe|hilfe|help|linkedin|©|diese e-mail|this email|sie erhalten|you are receiving|e-mail-einstellungen|email preferences|profil anzeigen|view profile|https?:\/\/|\[image|\s*$)/i;

export const LINKEDIN_READ_TASK = "LinkedIn-Nachricht lesen und beantworten";

// Zeilen der Benachrichtigung selbst („… hat Ihnen eine Nachricht gesendet“), kein Nachrichtentext
const NOTIFY_LINE =
  /(hat (ihnen|dir) (eine |1 )?(neue )?nachricht|hat (ihnen|dir) geschrieben|neue nachricht|ungelesene nachricht|sent you a (new )?message|new message|unread message|messaged you|nachricht(en)? (lesen|ansehen|öffnen)|jetzt antworten|reply now)/i;

export type LiMessage = { name: string | null; profileUrl: string | null; message: string | null; subject: string | null };

export function parseLinkedInMessage(raw: unknown): LiMessage {
  const f = flatten(raw);
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = f[k];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return null;
  };
  const subject = get("subject", "betreff");
  const bodyRaw = get("message", "nachricht", "text", "bodyplain", "body", "plain", "snippet", "bodytext") ?? "";
  let name = get("fromname", "sendername", "name", "absender", "from");
  if (name && /@/.test(name)) name = name.replace(/<.*>/, "").replace(/"/g, "").trim() || null;
  if (name && /linkedin/i.test(name)) name = null; // Absender ist "LinkedIn <messages-noreply@…>"
  if (!name && subject) {
    for (const re of SUBJECT_PATTERNS) {
      const m = subject.match(re);
      if (m) {
        name = m[1].trim();
        break;
      }
    }
  }
  const urlField = get("profileurl", "linkedinurl", "profile", "linkedin");
  const urlMatch = (urlField ?? "") + " " + bodyRaw;
  const slugM = urlMatch.match(/linkedin\.com\/(?:comm\/)?in\/([A-Za-z0-9\-_%]+)/);
  const profileUrl = slugM ? `https://www.linkedin.com/in/${slugM[1]}` : null;

  // Nachricht: Boilerplate der Benachrichtigungs-Mail herausfiltern
  const lines = bodyRaw.split(/\r?\n/).map((x) => x.trim());
  const kept = lines.filter((l) => !BOILERPLATE.test(l) && !NOTIFY_LINE.test(l) && l !== name);
  const message = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 3000) || null;
  return { name, profileUrl, message, subject };
}

const INTEREST =
  /interess|video|dienstleistung|angebot|leistung|mehr (erfahren|infos?|informationen|details)|wie funktioniert|was kostet|preis|kosten|konditionen|termin|telefonat|gespräch|austausch|call\b|zusammenarbeit|leads?\b|neukunden|kunden gewinnen|gerne|neugierig|melden sie sich|meld dich|schreib(en sie)? mir/i;

export function classifyLinkedInMessage(text: string | null): Sentiment {
  const base = classifyReply(text);
  if (base === "NEGATIV") return "NEGATIV";
  if (base === "POSITIV" || INTEREST.test(text ?? "")) return "POSITIV";
  return "NEUTRAL";
}

export async function handleLinkedInMessage(raw: unknown) {
  const msg = parseLinkedInMessage(raw);
  if (!msg.name && !msg.profileUrl) return { ignored: "Absender nicht erkannt" };
  const sentiment = classifyLinkedInMessage(msg.message);
  const [firstName, ...rest] = (msg.name ?? "").split(/\s+/);
  const lastName = rest.join(" ") || null;

  const matcher = await Matcher.load();
  const match = matcher.match({
    url: msg.profileUrl, slug: normalizeLinkedInUrl(msg.profileUrl), firstName: firstName || null, lastName,
    email: null, company: null, location: null, status: null, connectedAt: null, messageAt: null, repliedAt: null, list: null, tags: null,
  });
  const label = sentiment === "POSITIV" ? "Interesse" : sentiment === "NEGATIV" ? "kein Interesse" : "neutral";

  let contactId: string | null = match?.id ?? null;
  let created = false;
  // LinkedIn zeigt den Nachrichtentext in der Benachrichtigungs-Mail oft nicht an.
  // Dann nichts verlieren: Kontakt finden oder anlegen + Aufgabe „lesen und beantworten“.
  const hidden = !msg.message || msg.message.replace(/\s+/g, " ").trim().length < 15;
  if (hidden) {
    if (!contactId) {
      const slug = normalizeLinkedInUrl(msg.profileUrl);
      const c = await prisma.salesContact.create({
        data: {
          email: slug ? `linkedin-${slug}@ohne-email.invalid` : `linkedin-${Date.now()}@ohne-email.invalid`,
          name: msg.name ?? "LinkedIn-Kontakt",
          firstName: firstName || null,
          lastName,
          linkedinUrl: msg.profileUrl,
          description: "Über LinkedIn-Nachricht angelegt",
        },
      }).catch(async (err) => {
        // gleiche Profil-Adresse schon vorhanden
        if ((err as { code?: string }).code !== "P2002" || !slug) throw err;
        return prisma.salesContact.findUniqueOrThrow({ where: { email: `linkedin-${slug}@ohne-email.invalid` } });
      });
      contactId = c.id;
      created = true;
    }
    await prisma.salesActivity.create({
      data: { contactId, type: "LINKEDIN", outcome: "LinkedIn-Nachricht erhalten", note: "Text nur auf LinkedIn sichtbar (nicht in der Benachrichtigungs-Mail)." },
    });
    const open = await prisma.salesTask.findFirst({ where: { contactId, doneAt: null, title: LINKEDIN_READ_TASK } });
    if (!open) {
      await prisma.salesTask.create({
        data: {
          contactId,
          title: LINKEDIN_READ_TASK,
          type: "NACHFASSEN",
          dueAt: new Date(),
          note: `Nachricht auf LinkedIn lesen: ${msg.profileUrl ?? "https://www.linkedin.com/messaging/"}`,
        },
      });
    }
    await prisma.salesInboundLead.create({
      data: {
        contactId, source: "LINKEDIN", name: msg.name, campaign: "LinkedIn-Nachricht (Text nicht in der Mail)", answers: msg.profileUrl, created,
        payload: (raw ?? {}) as Prisma.InputJsonValue,
      },
    });
  } else if (sentiment === "POSITIV") {
    // Lead anlegen bzw. bestehenden Kontakt hochstufen + Aufgabe
    const r = await handleInboundLead(
      { first_name: firstName || null, last_name: lastName, linkedin_url: msg.profileUrl, message: msg.message },
      "LINKEDIN",
      { activity: "LinkedIn-Nachricht mit Interesse", taskTitle: "Auf LinkedIn-Anfrage reagieren" },
    );
    if ("contactId" in r) {
      contactId = r.contactId ?? null;
      created = !!r.created;
    }
  } else if (contactId) {
    // Bekannter Kontakt, aber kein klares Interesse: nur im Verlauf festhalten
    await prisma.salesActivity.create({
      data: { contactId, type: "LINKEDIN", outcome: `LinkedIn-Nachricht erhalten (${label})`, note: msg.message },
    });
    await prisma.salesInboundLead.create({
      data: {
        contactId, source: "LINKEDIN", name: msg.name, campaign: "LinkedIn-Nachricht", answers: msg.message, created: false,
        payload: (raw ?? {}) as Prisma.InputJsonValue,
      },
    });
  } else {
    // Unbekannt und kein Interesse erkannt: nur protokollieren (auf der Import-Seite übernehmbar)
    await prisma.salesInboundLead.create({
      data: {
        source: "LINKEDIN", name: msg.name, campaign: `LinkedIn-Nachricht (${label})`,
        answers: [msg.profileUrl, msg.message].filter(Boolean).join("\n"), created: false,
        payload: (raw ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  if (contactId) {
    const c = await prisma.salesContact.findUnique({ where: { id: contactId }, select: { linkedinUrl: true } });
    await prisma.salesContact.update({
      where: { id: contactId },
      data: {
        linkedinStatus: "GEANTWORTET",
        linkedinReplyAt: new Date(),
        linkedinUrl: normalizeLinkedInUrl(c?.linkedinUrl) ? undefined : msg.profileUrl ?? undefined,
      },
    });
  }
  return { ok: true, sentiment: hidden ? ("UNBEKANNT" as const) : sentiment, matched: match?.via ?? null, created, contactId };
}
