// Wieder in Gebrauch seit 18.11.2026 (Ole: „Anrede aus dem Vornamen raten, solange wir uns sicher sind“; vom 17.
// bis 18.11. abgeschaltet). Anrede aus dem Vornamen (Ole, 16.11.2026): „Wenn offensichtlich ist, ob Mann oder Frau, trage die Anrede
// automatisch ein.“ Nur eindeutige Vornamen; alles, was in einer verbreiteten Sprache auch das andere
// Geschlecht sein kann (Andrea, Kim, Kai, Luca, Toni, Sascha, Alex, Robin, Nicola, Deniz, Jean …), steht in
// keiner Liste und bleibt ohne Anrede („Guten Tag Vorname Nachname“). Doppelnamen nur, wenn alle Teile
// bekannt sind und übereinstimmen. Der Vermittler kann die Anrede im Kontakt jederzeit ändern.

import type { Salutation } from "@/lib/ansprache";

const FRAUEN = `
adelheid adriana agathe agnes aleksandra alexandra alicia alina aline alisa alma amalia amelie amy ana anastasia
angela angelika angelina anika anita anja anke ann anna annabell annabelle anne annegret annelie anneliese annemarie
annette anni annika antje antonia ariane astrid aylin barbara beate beatrice beatrix bella berit bettina bianca birgit
birte brigitte britta carina carla carmen carolin caroline cathrin celina charlotte christa christel christiane christin
christina christine clara claudia constanze cora cornelia dagmar daniela denise diana dora doreen doris dorothea
dorothee edith elena elfriede elif elisa elisabeth elise elke ella ellen elli elvira emilia emily emine emma erika
esra esther eva evelin evelyn fabienne fatma fenja finja franziska frauke frieda friederike gerda gertrud
gisela greta gudrun hanna hannah hannelore hatice heidi heike helena helene helga henriette hilde hildegard ida ilona
ilse ina ines inga ingeborg ingrid irene iris irina irmgard isabel isabell isabella isabelle jacqueline jana
janina janine jasmin jennifer jenny jessica johanna josefine judith julia juliane julie jutta karin karina karla
karolina katarina katharina kathrin katja katrin kerstin klara klaudia kristin kristina lara laura lea leah lena leni
leonie lilli lilly lina linda lisa lotta lotte louisa luisa luise lydia madeleine magdalena maja malin manuela mareike
margarete margit margot maria mariana marianne marie marija marina marion marlene marta martha martina mathilda mathilde
melanie melina melissa merve mia michaela milena miriam mirjam mona monika nadine nadja natalia natalie natascha nathalie
nele nicole nina nora olga patricia paula pauline petra pia ramona rebecca rebekka regina renate ricarda rita romy
ronja rosa rosemarie ruth sabine sabrina sandra sara sarah saskia selina silke silvia sina sofia sofie sonja
sophia sophie stefanie steffi stephanie susanne svenja svetlana swantje sylvia tamara tanja tatjana theresa therese
tina ulla ulrike ursula ute valentina valeria vanessa vera verena veronika viktoria vivien waltraud wiebke yasemin
yvonne zeynep
`;

const MAENNER = `
achim adam adrian ahmet albert alexander alfred ali andre andreas anton armin arne arnd arnold artur axel bastian ben
benedikt benjamin bernd bernhard björn bjoern boris bruno burak carl carsten christian christoph christopher claus
clemens constantin cornelius damian daniel david dennis detlef dieter dietmar dirk dominik egon elias emil emre enrico
erhard erich erik ernst erwin eugen fabian falk felix ferdinand finn florian frank franz fred friedrich fritz gabriel
georg gerald gerd gerhard gernot gregor guido günter guenter günther guenther gustav hakan hannes hans harald hartmut
heiko heinrich heinz helmut henning henrik herbert hermann holger horst hubert hugo ingo jakob jan jannik jens
jochen joachim johann johannes jonas jonathan jörg joerg josef julian julius jürgen juergen justus karl karsten kevin
klaus konrad konstantin kurt lars leon leonard leonhard leopold lorenz louis ludwig lukas lutz malte manfred manuel marc
marcel marco marcus mario marius mark markus martin mathias matthias max maximilian mehmet michael mike milan moritz
murat mustafa niklas nico niko nikolai nikolaus nils noah norbert olaf ole oliver oskar otto pascal patrick paul peter
philipp rainer ralf ralph reinhard reinhold richard robert roland rolf roman rüdiger ruediger rudolf samuel sebastian
siegfried simon stefan steffen stephan sven thilo thomas thorsten tilo tim timo tobias tom torsten ulrich uwe valentin
viktor vincent volker walter werner wilhelm willi wolfgang yusuf
abdul abdullah bilal hamza hassan hussein ibrahim ismail karim khalid mohamed mohammad mohammed muhammad nabil omar rachid raschid rashid samir tarik tariq walid yasin yassin youssef
`;

const liste = (s: string) => new Set(s.split(/\s+/).filter(Boolean));
const F = liste(FRAUEN);
const M = liste(MAENNER);

/** Herr/Frau aus einem eindeutigen Vornamen, sonst null. */
export function anredeAusVorname(vorname: string | null | undefined): Salutation | null {
  const teile = (vorname ?? "")
    .trim()
    .toLowerCase()
    .split(/[-\s]+/)
    .filter(Boolean);
  if (teile.length === 0 || teile.length > 3) return null;
  let ergebnis: Salutation | null = null;
  for (const t of teile) {
    const s: Salutation | null = F.has(t) ? "Frau" : M.has(t) ? "Herr" : null;
    if (!s || (ergebnis && ergebnis !== s)) return null;
    ergebnis = s;
  }
  return ergebnis;
}

/** Wurde im Formular oder vom Vermittler ausdrücklich keine Anrede gewählt (Divers, keine Angabe)? */
export function anredeBewusstOffen(v: unknown): boolean {
  if (typeof v !== "string") return false;
  const s = v.toLowerCase().replace(/[^a-z]/g, "");
  return s === "divers" || s === "d" || s === "keine" || s === "keineangabe" || s === "ohne" || s === "neutral";
}
