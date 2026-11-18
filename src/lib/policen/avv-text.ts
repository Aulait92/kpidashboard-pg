// AVV-Ergänzung (b) „Versicherungsunterlagen über WhatsApp“ aus docs/recht/policen-whatsapp-gesundheitsdaten.md
// (Rechtsprüfung A5, Ole 18.11.2026). Der Vermittler stimmt unter Einstellungen → Policen per WhatsApp zu; erst dann
// (und mit hinterlegter Datenschutzhinweis-URL) sind Kranken/BU/Leben für ihn an. Version: regeln.ts AVV_POLICEN_VERSION.
// Platzhalter der Vorlage sind gefüllt: Vermittler (Firma), Speicher (aus der Ablage-Konfiguration), KI-Dienst (wird vor
// dem ersten Einsatz angezeigt), Sicherungszyklus (Hosting-Anbieter). Diese Füllungen prüft die Anwältin mit.

import { euEndpunkt } from "@/lib/policen/ablage";

/** Speicher für § 4 Nr. 3 aus POLICEN_S3_ENDPOINT (ohne Zugangsdaten). */
export function speicherAngabe(endpoint: string | null | undefined): string {
  const e = (endpoint ?? "").trim();
  const eu = euEndpunkt(e);
  if (eu.ok && eu.region === "auto") return "Cloudflare, Inc. (R2, privater Speicher mit EU-Jurisdiktion; Konzern in den USA) für die Ablage der Unterlagen; Railway Corporation (Anwendung und Datenbank, Rechenzentrum in der EU)";
  if (eu.ok) return `Amazon Web Services EMEA SARL, Luxemburg (S3, Region ${eu.region}; Konzern in den USA) für die Ablage der Unterlagen; Railway Corporation (Anwendung und Datenbank, Rechenzentrum in der EU)`;
  return "der bei Freischaltung genannte Speicher mit Rechenzentrumsregion EU; Railway Corporation (Anwendung und Datenbank, Rechenzentrum in der EU)";
}

export function avvPolicenAbsaetze(o: { vermittler: string; speicher: string }): { titel: string; text: string }[] {
  return [
    {
      titel: `Anlage „Versicherungsunterlagen über WhatsApp“ zum Auftragsverarbeitungsvertrag zwischen ${o.vermittler} (Verantwortlicher) und Ole Kannapinn UG (haftungsbeschränkt), performancegrowth (Auftragsverarbeiter)`,
      text: "",
    },
    {
      titel: "§ 1 Gegenstand.",
      text: "Der Auftragsverarbeiter fordert im Auftrag des Verantwortlichen bei Interessenten mit gebuchtem Beratungstermin über den WhatsApp-Assistenten Kopien bestehender Versicherungsunterlagen an, empfängt sie, legt sie verschlüsselt ab und stellt sie ausschließlich dem Verantwortlichen bereit. Eine Weitergabe an Versicherer oder Dritte findet nicht statt.",
    },
    {
      titel: "§ 1a KI-Auslesen.",
      text: "Hat der Interessent auch in das automatische Auslesen eingewilligt, übermittelt der Auftragsverarbeiter die Unterlagen an den in § 4 genannten KI-Dienst, um ausschließlich folgende Vertragsfelder zu erfassen: Versicherer, Sparte, Tarif, Vertragsnummer, Beitrag, Zahlweise, Beginn, Ablauf, Kündigungsfrist, Deckungs- und Versicherungssummen, Selbstbeteiligung, Schadenfreiheitsklasse und vergleichbare Vertragsdaten. Gesundheitsangaben (insbesondere Risikozuschläge, Leistungsausschlüsse, Diagnosen) werden nicht ausgegeben und nicht gespeichert; das Ausgabeschema enthält dafür keine Felder, Freitextfelder sind ausgeschlossen. Anfragen und Antworten werden beim KI-Dienst nicht gespeichert (Null-Speicherung) und nicht zum Training verwendet; Verarbeitung ausschließlich in der EU. Die ausgelesenen Felder sind als maschinell erfasst gekennzeichnet und werden vom Verantwortlichen vor Verwendung geprüft; eine automatisierte Entscheidung im Sinne von Art. 22 DSGVO findet nicht statt. Für Sparten, für die die Null-Speicherung nicht schriftlich bestätigt ist, unterbleibt das Auslesen.",
    },
    {
      titel: "§ 2 Daten und Betroffene.",
      text: "Versicherungsscheine, Nachträge und Bedingungen einschließlich darin enthaltener Gesundheitsdaten im Sinne von Art. 9 Abs. 1 DSGVO (z. B. Risikozuschläge, Leistungsausschlüsse); Vertrags-, Bestands- und Kommunikationsdaten. Betroffene: Interessenten und in deren Verträgen genannte Personen.",
    },
    {
      titel: "§ 3 Weisung zur Einwilligung.",
      text: "Der Auftragsverarbeiter speichert Unterlagen nur, wenn eine ausdrückliche Einwilligung des Interessenten nach Art. 9 Abs. 2 lit. a DSGVO im vom Verantwortlichen freigegebenen Wortlaut vorliegt und mit Zeitpunkt, Wortlaut, Version, Nachrichtenkennung und Interessenten-ID protokolliert ist. Ohne Einwilligung werden eingehende Unterlagen nicht gespeichert und, soweit technisch möglich, beim Unterauftragnehmer gelöscht. Bei Widerruf werden die Unterlagen unverzüglich gelöscht und der Verantwortliche informiert.",
    },
    {
      titel: "§ 4 Unterauftragnehmer.",
      text: `Der Verantwortliche genehmigt: (1) 360dialog GmbH, Berlin (Zugang zur WhatsApp Business Platform); (2) WhatsApp Ireland Ltd., Dublin, mit Meta Platforms, Inc. und WhatsApp LLC, USA (Nachrichtenübermittlung, Zwischenspeicherung von Medien bis zu 30 Tage, Übermittlung in die USA auf Grundlage des EU-US Data Privacy Framework); (3) ${o.speicher} (Speicherung); (4) den KI-Dienst für das Auslesen von Vertragsfeldern nach § 1a mit Verarbeitung in der EU und Null-Speicherung, den der Auftragsverarbeiter vor dem ersten Einsatz mit Name, Sitz, Ort und Transfergrundlage in Textform anzeigt. Der Auftragsverarbeiter erlegt jedem Unterauftragnehmer vertraglich dieselben Datenschutzpflichten auf (Art. 28 Abs. 4 DSGVO). Änderungen zeigt der Auftragsverarbeiter mindestens 30 Tage vorher in Textform an; der Verantwortliche kann widersprechen. Fällt die Angemessenheitsgrundlage für die USA weg, setzt der Auftragsverarbeiter die Funktion für Gesundheitsdaten aus, bis eine neue Grundlage besteht.`,
    },
    {
      titel: "§ 5 Technische und organisatorische Maßnahmen.",
      text: "Ergänzend zur Anlage TOM: Verschlüsselung ruhender Daten mit mandantenbezogenem Schlüssel; Speicherung ausschließlich in der EU; kein öffentlicher Abruf; Zugriff nur für Nutzer des Verantwortlichen mit Zwei-Faktor-Anmeldung; Zugriff von Personal des Auftragsverarbeiters nur im dokumentierten Notfall mit Protokoll und Benachrichtigung des Verantwortlichen; Protokollierung jedes Zugriffs (wer, wann, welche Datei), Aufbewahrung der Protokolle 12 Monate; keine Inhalte in Anwendungs- und Fehlerprotokollen; Schadsoftwareprüfung eingehender Dateien.",
    },
    {
      titel: "§ 6 Löschung.",
      text: "Unterlagen werden 90 Tage nach dem Termin gelöscht; ist der Termin abgesagt oder nicht wahrgenommen worden, 90 Tage nach dem geplanten Termin. Der Verantwortliche kann vorher exportieren; danach liegt die Aufbewahrung in seiner Verantwortung. Datensicherungen werden spätestens mit Ablauf des Sicherungszyklus des Hosting-Anbieters überschrieben. Medien beim Unterauftragnehmer Meta werden nach Abruf gelöscht, soweit die Schnittstelle dies zulässt, sonst nach dessen Fristen.",
    },
    {
      titel: "§ 7 Verschwiegenheit nach § 203 StGB.",
      text: "Der Auftragsverarbeiter ist mitwirkende Person im Sinne von § 203 Abs. 3 StGB. Er ist zur Verschwiegenheit verpflichtet, verschafft sich Kenntnis von fremden Geheimnissen nur, soweit dies zur Vertragserfüllung erforderlich ist, hat alle Beschäftigten und Unterauftragnehmer mit möglichem Zugriff in Textform zur Verschwiegenheit verpflichtet und über die Strafbarkeit nach § 203 Abs. 4 StGB belehrt und weist dies auf Anforderung nach.",
    },
    {
      titel: "§ 8 Unterstützung.",
      text: "Der Auftragsverarbeiter unterstützt bei Betroffenenanfragen, meldet Verletzungen des Schutzes dieser Daten ohne schuldhaftes Zögern, möglichst binnen 24 Stunden, und stellt eine Muster-Datenschutz-Folgenabschätzung bereit.",
    },
    {
      titel: "§ 9 Keine eigenen Zwecke.",
      text: "Unterlagen und ausgelesene Felder nach dieser Anlage sind von jeder Auswertung für eigene Zwecke des Auftragsverarbeiters ausgeschlossen, auch in anonymisierter oder aggregierter Form, und werden nicht zum Training oder zur Verbesserung von KI-Modellen verwendet.",
    },
  ];
}
