// Konfiguration für den Lead-Scraper.
// Jede Nische ist entweder ein "cityLoop" (lokale Gewerke: Portal-Verzeichnis pro Stadt)
// oder eine "nationalList" (bundesweite Anbieter: feste Seed-URLs). Aktuell ist der
// pflegehilfe.org-cityLoop voll implementiert; weitere Portale nach gleichem Muster ergänzbar.

export const NISCHEN = {
  badumbau: {
    typ: "cityLoop",
    portal: "pflegehilfe", // Adapter in lib.mjs (JSON-LD LocalBusiness)
    slug: "badumbau", // ergibt https://www.pflegehilfe.org/<stadt>-badumbau
    verifiziert: true,
    leadSignal: "Portal-Partner (pflegehilfe.org)",
  },

  // Weitere pflegehilfe.org-Slugs — Slug bei Bedarf verifizieren (einfach scrape.mjs laufen lassen;
  // 404 = Slug falsch). pflegehilfe.org ist pflege-fokussiert, deckt daher die lokalen Pflege-Nischen ab.
  hausnotruf: { typ: "cityLoop", portal: "pflegehilfe", slug: "hausnotruf", verifiziert: false, leadSignal: "Portal-Partner (pflegehilfe.org)" },
  treppenlift: { typ: "cityLoop", portal: "pflegehilfe", slug: "treppenlift", verifiziert: false, leadSignal: "Portal-Partner (pflegehilfe.org)" },
  "24-stunden-betreuung": { typ: "cityLoop", portal: "pflegehilfe", slug: "24-stunden-pflege", verifiziert: false, leadSignal: "Portal-Partner (pflegehilfe.org)" },
  pflegehilfsmittel: { typ: "cityLoop", portal: "pflegehilfe", slug: "pflegehilfsmittel", verifiziert: false, leadSignal: "Portal-Partner (pflegehilfe.org)" },

  // Nationale Nischen (feste Anbieterliste statt Städte-Loop). Seed-URLs = Vergleichs-/Rankingseiten,
  // aus denen der Enricher die Anbieternamen zieht. Noch als Gerüst — Seeds beim Bearbeiten der Nische füllen.
  "immobilien-teilverkauf": { typ: "nationalList", verifiziert: false, leadSignal: "nationaler Anbieter", seeds: [] },
  sterbegeldversicherung: { typ: "nationalList", verifiziert: false, leadSignal: "nationaler Anbieter", seeds: [] },
  pflegezusatzversicherung: { typ: "nationalList", verifiziert: false, leadSignal: "nationaler Anbieter", seeds: [] },
  "pflegegrad-widerspruch": { typ: "nationalList", verifiziert: false, leadSignal: "nationaler Anbieter", seeds: [] },
};

// Städte-Liste für cityLoop-Nischen (Slugs wie von pflegehilfe.org erwartet: Umlaute -> ue/oe/ae).
// ~90 Städte quer durch Deutschland inkl. Ost. Nicht existierende Seiten (404) werden übersprungen.
export const STAEDTE = [
  "berlin","hamburg","muenchen","koeln","frankfurt-am-main","stuttgart","duesseldorf","leipzig","dortmund","essen",
  "bremen","dresden","hannover","nuernberg","duisburg","bochum","wuppertal","bielefeld","bonn","muenster",
  "karlsruhe","mannheim","augsburg","wiesbaden","moenchengladbach","gelsenkirchen","aachen","braunschweig","chemnitz","kiel",
  "halle","magdeburg","freiburg","krefeld","mainz","luebeck","erfurt","oberhausen","rostock","kassel",
  "hagen","potsdam","saarbruecken","hamm","ludwigshafen","muelheim","oldenburg","osnabrueck","leverkusen","heidelberg",
  "darmstadt","solingen","herne","neuss","regensburg","paderborn","ingolstadt","offenbach","fuerth","ulm",
  "heilbronn","pforzheim","wuerzburg","wolfsburg","goettingen","bottrop","reutlingen","koblenz","bremerhaven","bergisch-gladbach",
  "jena","remscheid","trier","recklinghausen","gera","siegen","hildesheim","salzgitter","cottbus","kaiserslautern",
  "guetersloh","schwerin","witten","gladbeck","dessau-rosslau","zwickau","konstanz","flensburg","neubrandenburg","villingen-schwenningen",
];

// Diese Domains sind Portale/Verzeichnisse/Social — NICHT die offizielle Firmenseite. Bei der Auflösung überspringen.
export const BLOCK_DOMAINS = [
  "pflegehilfe.org","pflege.de","aroundhome.de","11880.com","gelbeseiten.de","dasoertliche.de","wlw.de",
  "facebook.com","instagram.com","linkedin.com","xing.com","youtube.com","meinestadt.de","cylex.de","cylex-branchenbuch.de",
  "yelp.de","yelp.com","google.com","google.de","provenexpert.com","kununu.com","wikipedia.org","branchenbuch.meinestadt.de",
  "gforum.de","werkenntdenbesten.de","myhammer.de","check24.de","goyellow.de","hotfrog.de","firmenwissen.de","northdata.de",
  "unternehmensregister.de","companyhouse.de","handwerksblatt.de","wer-zu-wem.de","stadtbranchenbuch.com","tel.local.ch",
  "creditreform.de","firmeneintrag.creditreform.de","dastelefonbuch.de","telefonbuch.de","branchen-info.net","adressen.de",
  "yellowmap.de","marktplatz-mittelstand.de","meinprospekt.de","kaufda.de","trustpilot.com","ebay-kleinanzeigen.de","kleinanzeigen.de",
  "unternehmen24.info","infobel.com","infobel.de","firmendb.de","onlinestreet.de","11880-badstudio.com","werliefertwas.de","bundes-telefonbuch.de",
];
