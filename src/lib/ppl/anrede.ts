// Anrede aus dem Vornamen ableiten (wie der alte Auslieferungs-Zap für die Leadbörse von
// Heinrich von Kleist): Namenslisten, sonst Endungen typisch weiblicher Vornamen, sonst leer.

const WEIBLICH = new Set(["anna","anne","annika","antje","angelika","andrea","alexandra","alina","amelie","astrid","birgit","bettina","beate","barbara","bianca","brigitte","carmen","carolin","caroline","christa","christiane","christin","christina","christine","claudia","cornelia","daniela","doris","dagmar","diana","dominique","elke","elena","elisabeth","ella","emilia","emily","emma","erika","eva","franziska","frauke","gabriele","gerda","gisela","hannah","hanna","heike","helga","helena","ilona","ines","inge","ingrid","irene","iris","isabel","isabelle","jana","janina","janine","jasmin","jennifer","jenny","jessica","johanna","josephine","judith","julia","juliane","jutta","karin","karina","katharina","kathrin","katja","katrin","kerstin","kim","klara","kristin","lara","laura","lea","lena","leonie","lisa","luisa","luise","lydia","maike","manuela","mara","maren","maria","marie","marina","marion","marlene","martina","melanie","meike","michaela","mia","monika","nadine","nadja","natalie","nathalie","nele","nicole","nina","olga","patricia","paula","pauline","petra","pia","ramona","regina","renate","rita","romy","ruth","sabine","sabrina","sandra","sara","sarah","saskia","silke","silvia","simone","sonja","sophia","sophie","stefanie","stephanie","susanne","svenja","tanja","tatjana","thea","theresa","tina","ulrike","ursula","ute","vanessa","vera","verena","veronika","viktoria","wiebke","yvonne"]);
const MAENNLICH = new Set(["achim","adam","adrian","albert","alexander","alfred","andre","andreas","anton","armin","arno","arthur","axel","bastian","benedikt","benjamin","benno","bernd","bernhard","bjoern","björn","boris","carsten","christian","christoph","clemens","daniel","david","dennis","detlef","dieter","dirk","dominik","edgar","eduard","elias","emil","erich","erik","ernst","fabian","felix","ferdinand","florian","frank","franz","friedrich","fritz","gabriel","georg","gerd","gerhard","gregor","guenter","günter","guido","gustav","hans","harald","hartmut","heiko","heinrich","heinz","helmut","hendrik","henning","henrik","herbert","hermann","holger","horst","hubert","ingo","jakob","jan","jannik","jens","joachim","johann","johannes","jonas","jonathan","joerg","jörg","josef","juergen","jürgen","julian","justus","kai","karl","kevin","klaus","konrad","kurt","lars","leon","leonard","linus","lothar","luca","lucas","ludwig","lukas","manfred","marc","marcel","marco","marius","mark","markus","martin","matthias","max","maximilian","michael","mike","moritz","niklas","nico","nils","norbert","oliver","olaf","ole","oskar","otto","patrick","paul","peter","philipp","pierre","rainer","ralf","ralph","raphael","reiner","reinhard","rene","renè","richard","robert","robin","rolf","roland","rudolf","ruediger","rüdiger","sascha","sebastian","siegfried","simon","soeren","sören","stefan","steffen","stephan","sven","theo","thomas","thorsten","tim","timo","tobias","tom","torsten","udo","ulrich","uwe","valentin","viktor","volker","walter","werner","wilhelm","wolfgang","wolfram"]);

/** "Frau" | "Herr" | "" (unbekannt). Nur der erste Vorname zählt. */
export function anredeAusVorname(vorname: string | null | undefined): "Frau" | "Herr" | "" {
  const v = String(vorname ?? "")
    .toLowerCase()
    .trim()
    .split(/[\s-]+/)[0]
    .replace(/[^a-zäöüß]/g, "");
  if (!v) return "";
  if (WEIBLICH.has(v)) return "Frau";
  if (MAENNLICH.has(v)) return "Herr";
  if (/(a|ine|ina|ika|tte|ela)$/.test(v)) return "Frau";
  return "";
}
