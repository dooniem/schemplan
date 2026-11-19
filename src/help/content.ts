// Innholdet i hjelpen: stegene i «Kom i gang» og emnene som kan søkes i.
// Teksten er HTML med bare <span class="ui-name">, <kbd>, <strong> og <em>. Bildene lages av
// scripts/hjelpebilder.mjs og ligger i ./img med samme navn som i feltet img.

/** Et bilde, eller to bilder som viser før og etter. */
export type HelpImage = string | { before: string; after: string };

export interface HelpTopic {
  id: string;
  group: string;
  title: string;
  /** To–tre setninger. */
  text: string;
  img?: HelpImage;
  /** Beskrivelse av bildet for skjermleser. */
  alt?: string;
  /** Ekstra søkeord som ikke står i teksten. */
  words?: string;
  /** Emner som hører sammen med dette. */
  see?: string[];
}

export interface TourStep {
  title: string;
  text: string;
  img: HelpImage;
  alt: string;
  /** Emnet steget lenker videre til, og teksten på lenken. */
  topic: string;
  more: string;
}

const ui = (s: string) => `<span class="ui-name">${s}</span>`;
const k = (...keys: string[]) => keys.map((x) => `<kbd>${x}</kbd>`).join('+');

export const TOUR: TourStep[] = [
  {
    title: 'Åpne planen',
    text: `Trykk ${ui('Generate New file')} i Project, så åpnes planen her i nettleseren. En arbeidsfil du har lagret før, åpner du med ${ui('Åpne')} eller ved å dra den inn i vinduet.`,
    img: 'oversikt',
    alt: 'Appen med en hel plan på arket: lanes til venstre, bokser i tid og forklaring nederst.',
    topic: 'apne', more: 'Mer om å åpne planer',
  },
  {
    title: 'Se deg rundt',
    text: `Zoom med ${k('Ctrl')} og hjulet, og dra for å flytte arket. Klikk et fag i forklaringen nederst for å fremheve boksene i faget, og hold musen over en boks for å se datoene.`,
    img: 'fremhev',
    alt: 'Faget Betong er fremhevet. De andre boksene er nedtonet, og en linje øverst gir valg for faget.',
    topic: 'fremhev', more: 'Mer om å fremheve fag',
  },
  {
    title: 'Slå på Rediger og flytt bokser',
    text: `Trykk ${ui('Rediger')}. Klikk en boks for å velge den, og dra den opp, ned eller til en annen lane. Panelet til høyre viser tekst, fag og farge for boksen du har valgt.`,
    img: { before: 'flytte-1', after: 'flytte-2' },
    alt: 'En valgt boks dras fra én lane ned til lanen under.',
    topic: 'flytte', more: 'Mer om å flytte bokser',
  },
  {
    title: 'Ordne lanes',
    text: `Klikk et lane-navn for å endre navn, farge og høyde. Dra navnet opp eller ned for ny rekkefølge, og høyreklikk det for ny lane, grupper eller for å slå lanes sammen.`,
    img: 'lanes',
    alt: 'En lane er valgt, og panelet viser navn, tekstfarge, farge og plass.',
    topic: 'lanes', more: 'Mer om lanes',
  },
  {
    title: 'Fag og farger',
    text: `Klikk et fag i forklaringen for å endre fargen på alle boksene i faget på én gang. En enkelt boks kan få en annen farge, og ${ui('Fagets farge')} setter den tilbake.`,
    img: 'fag',
    alt: 'Faget Betong er valgt i forklaringen, og panelet viser navn og farge for faget.',
    topic: 'fag', more: 'Mer om fag',
  },
  {
    title: 'Tegn kritisk linje',
    text: `Trykk ${ui('Kritisk linje')} og klikk boksene som ligger på linjen. Linjen tegnes gjennom dem i datorekkefølge, og planen kan ha inntil tre linjer.`,
    img: 'kritisk',
    alt: 'En rød kritisk linje går gjennom seks bokser i fire lanes.',
    topic: 'kritisk', more: 'Mer om kritisk linje',
  },
  {
    title: 'Lagre arbeidsfil eller PDF',
    text: `${ui('Lagre arbeidsfil')} lagrer planen og alle endringene inne i en PDF du kan åpne og redigere igjen. ${ui('Lagre PDF for deling')} gir en vanlig PDF til å sende ut.`,
    img: 'lagre',
    alt: 'Lagre-menyen med arbeidsfil, PDF for deling, én PDF per fag, kopier som bilde og skriv ut.',
    topic: 'lagre', more: 'Mer om å lagre',
  },
  {
    title: 'Oppdater når Project endrer seg',
    text: `Trykk ${ui('Update Existing file')} i Project og velg arbeidsfilen din. Ny framdrift hentes fra Project, og alt du har endret, blir med.`,
    img: 'oppdater',
    alt: 'Vinduet som ber om arbeidsfilen som skal oppdateres.',
    topic: 'oppdater', more: 'Mer om oppdatering fra Project',
  },
];

export const GROUPS = ['Se planen', 'Bokser', 'Lanes', 'Fag og farger', 'Arket', 'Lagre og dele'];

export const TOPICS: HelpTopic[] = [
  // Se planen
  {
    id: 'apne', group: 'Se planen', title: 'Åpne en plan',
    text: `En ny plan kommer fra ${ui('Generate New file')} i Project. En arbeidsfil (.pdf) eller planfil (.json) åpner du med ${ui('Åpne')}, eller ved å dra filen inn i vinduet. Linjen under verktøylinjen viser hvor mange lanes, bokser og milepæler planen har.`,
    img: 'oversikt', alt: 'Appen med en hel plan på arket.',
    words: 'start fil arbeidsfil json pdf dra slipp generate', see: ['lagre', 'oppdater'],
  },
  {
    id: 'zoom', group: 'Se planen', title: 'Zoom og flytt arket',
    text: `Zoom med ${k('Ctrl')} og hjulet, eller med + og − øverst. Dra i arket for å flytte det. Prosenten i midten viser hele arket igjen, og ↔ lar arket fylle bredden av vinduet.`,
    img: 'zoom', alt: 'Arket zoomet inn så boksene er store.',
    words: 'forstørre panorere skalere bredde', see: ['fremhev'],
  },
  {
    id: 'fremhev', group: 'Se planen', title: 'Fremhev fag og perioder',
    text: `Klikk et fag i forklaringen eller en periode i kalenderen, så tones resten ned. ${k('Ctrl')}- eller ${k('Shift')}-klikk velger flere fag. Linjen øverst kan vise bare faget og lagre en PDF slik planen vises.`,
    img: 'fremhev', alt: 'Faget Betong fremhevet, resten nedtonet.',
    words: 'fokus filter nedtone uthev forklaring legend måned uke', see: ['fag', 'merking', 'delepdf'],
  },
  {
    id: 'sok', group: 'Se planen', title: 'Søk i planen',
    text: `Skriv i søkefeltet øverst (${k('Ctrl', 'F')}), så lyser boksene med ordene opp. ${k('Enter')} går til neste treff og ${k('Shift', 'Enter')} til forrige.`,
    img: 'sok', alt: 'Søk etter «lorem» med treffene uthevet på arket.',
    words: 'finne lete treff', see: ['data'],
  },
  {
    id: 'utkikk', group: 'Se planen', title: 'Utkikk: bare noen uker',
    text: `${ui('Utkikk')} viser bare noen uker av planen, for eksempel de neste tre fra denne uken eller fra statuslinjen. Bokser som stikker utenfor, kuttes ved kanten, og PDF-en får perioden i navnet.`,
    img: 'utkikk', alt: 'Utkikk-menyen med valg for start og lengde.',
    words: 'lookahead periode uker utsnitt framover', see: ['innstillinger'],
  },
  {
    id: 'data', group: 'Se planen', title: 'Data: alle bokser som tabell',
    text: `${ui('Data')} øverst viser alle boksene i en tabell med datoer og lane. Filtrer og sorter, klikk en rad for å finne boksen på arket, og eksporter tabellen til Excel.`,
    img: 'data', alt: 'Tabellen med alle boksene.',
    words: 'tabell liste excel eksport filter sorter', see: ['sok'],
  },
  // Bokser
  {
    id: 'rediger', group: 'Bokser', title: 'Velg og endre en boks',
    text: `Trykk ${ui('Rediger')} og klikk en boks. Panelet til høyre viser tekst, størrelse, fag, farge, callout og datoer. Prikken i hjørnet viser at boksen er endret i appen.`,
    img: 'rediger', alt: 'En valgt boks med panelet for boksen til høyre.',
    words: 'redigere panel egenskaper callout blå prikk vis endret', see: ['tekst', 'farger', 'boksmeny'],
  },
  {
    id: 'flytte', group: 'Bokser', title: 'Flytt bokser',
    text: `Dra en boks opp eller ned for å gi den fast plass i lanen, eller til en annen lane for å flytte den dit. Hold ${k('Ctrl')} mens du drar for å skyve boksene under ned, så de beholder formen.`,
    img: { before: 'flytte-1', after: 'flytte-2' }, alt: 'En boks flyttes ned til lanen under.',
    words: 'dra slipp plassere skyve ctrl lane', see: ['flervalg', 'omplasser'],
  },
  {
    id: 'flervalg', group: 'Bokser', title: 'Velg flere bokser',
    text: `${k('Shift')}-klikk bokser, eller hold ${k('Shift')} og dra et rektangel på et tomt sted. Drar du én av dem, flyttes alle like langt, og ett ${k('Ctrl', 'Z')} angrer hele flyttingen.`,
    img: 'flervalg', alt: 'Tre bokser valgt samtidig.',
    words: 'flervalg markere rektangel shift samtidig', see: ['flytte', 'hoyde'],
  },
  {
    id: 'tekst', group: 'Bokser', title: 'Tekst og linjeskift',
    text: `Dobbeltklikk en boks for å skrive i den. ${k('Enter')} eller | gir linjeskift. Størrelsen på teksten endres i panelet, og ${ui('Omplasser')} › ${ui('Størst mulig tekst')} gir hver boks så stor tekst som får plass.`,
    img: 'tekst', alt: 'Teksten i en boks redigeres rett på arket.',
    words: 'skrive navn linjeskift enter skriftstørrelse font', see: ['rediger', 'omplasser'],
  },
  {
    id: 'boksmeny', group: 'Bokser', title: 'Høyreklikk en boks',
    text: `Høyreklikk en boks for overskriftsboks, Multi Lane-boks, merking, datoer, dupliser og kopier. Høyreklikk et tomt sted i en lane for å lage en ny boks eller milepæl der.`,
    img: 'boksmeny', alt: 'Høyreklikkmenyen for en boks.',
    words: 'kontekstmeny meny overskrift multi lane ny boks milepæl dupliser kopier lim inn skjul', see: ['overskrift', 'merking', 'datoer'],
  },
  {
    id: 'overskrift', group: 'Bokser', title: 'Overskriftsbokser og egne bokser',
    text: `En overskriftsboks har teksten øverst, og andre bokser kan ligge inne i den. Drar du overskriftsboksen, følger innholdet med. Egne bokser du lager i appen, kan følge start- eller sluttdatoen til en annen boks.`,
    words: 'header gruppe ny boks egen boks følg dato kobling', see: ['boksmeny'],
  },
  {
    id: 'hoyde', group: 'Bokser', title: 'Høyde og lik høyde',
    text: `Dra i den blå streken under en valgt boks for å endre høyden. Bunnen snapper til kanten av andre bokser (hold ${k('Alt')} for å dra fritt). ${ui('Gi andre bokser samme høyde …')} i høyreklikkmenyen gjør flere bokser like høye.`,
    words: 'høy lav størrelse snap samme høyde standard høyde', see: ['flervalg', 'omplasser'],
  },
  {
    id: 'datoer', group: 'Bokser', title: 'Datoer på boksene',
    text: `Start- og sluttdato slås på for alle under ${ui('Innstillinger')} › ${ui('Vis på arket')}, der du også velger format. Høyreklikk en boks og velg ${ui('Datoer')} for å slå dem av eller på bare for den.`,
    words: 'dato start slutt format vis', see: ['boksmeny', 'innstillinger'],
  },
  {
    id: 'merking', group: 'Bokser', title: 'Høylytt arbeid og nattarbeid',
    text: `Merk bokser med høylytt arbeid, nattarbeid eller et eget merke fra høyreklikkmenyen. Merkene står i forklaringen, og der kan du fremheve dem som et fag.`,
    words: 'ikon merke støy natt symbol', see: ['boksmeny', 'fremhev'],
  },
  {
    id: 'angre', group: 'Bokser', title: 'Angre og hurtigtaster',
    text: `${k('Ctrl', 'Z')} angrer og ${k('Ctrl', 'Y')} gjør om. ${k('Ctrl', 'D')} dupliserer, ${k('Ctrl', 'C')} og ${k('Ctrl', 'V')} kopierer og limer inn, ${k('Delete')} skjuler og ${k('Esc')} fjerner valget.`,
    words: 'tastatur snarvei undo redo tilbake', see: ['rediger'],
  },
  // Lanes
  {
    id: 'lanes', group: 'Lanes', title: 'Lanes: navn, farge og rekkefølge',
    text: `Klikk et lane-navn for å endre navn, tekstfarge og farge. Dra navnet opp eller ned for ny rekkefølge, og dra i nederste kant av en lane for å gi den fast høyde.`,
    img: 'lanepanel', alt: 'Panelet for en valgt lane.',
    words: 'rad rekke flytte høyde bakgrunn lanefarge', see: ['lanemeny', 'planomrade'],
  },
  {
    id: 'lanemeny', group: 'Lanes', title: 'Nye lanes, grupper og sammenslåing',
    text: `Høyreklikk et lane-navn for ny lane over eller under, skjulte lanes og ${ui('Grupper med …')}, som samler lanes under en smal bar med tekst. ${ui('Slå sammen med …')} legger boksene fra to lanes i én.`,
    img: 'lanemeny', alt: 'Høyreklikkmenyen for et lane-navn.',
    words: 'ny lane gruppe gruppere slå sammen skjul vis skjulte', see: ['lanes'],
  },
  {
    id: 'planomrade', group: 'Lanes', title: 'Gi plass til kart og bilder',
    text: `${ui('Innstillinger')} › ${ui('Ark')} › ${ui('Egendefinert')} gir en stiplet topp- og bunnkant du kan dra. Dra et hvitt punkt for å lage et knekkpunkt, så flyttes lanes og bokser til det er plass.`,
    words: 'planområde kant knekkpunkt plass kart egendefinert kompakt fyll arket', see: ['bilder'],
  },
  // Fag og farger
  {
    id: 'fag', group: 'Fag og farger', title: 'Fag',
    text: `Klikk et fag i forklaringen for å endre fargen eller navnet for alle boksene i faget. Høyreklikk forklaringen for nytt fag, eller for å gi valgte bokser faget. En boks bytter fag i panelet.`,
    img: 'fag', alt: 'Et fag valgt i forklaringen med panelet for faget.',
    words: 'trade fagfarge forklaring legend nytt fag', see: ['farger', 'fremhev'],
  },
  {
    id: 'farger', group: 'Fag og farger', title: 'Farger på bokser',
    text: `Panelet har de samme 22 fargene som i Project, pluss ${ui('Egen farge')}. Velger du en egen farge, kan du prøve den på arket før du trykker ${ui('Behold')}. ${ui('Fagets farge')} og ${ui('Fargen fra Project')} setter fargen tilbake.`,
    words: 'farge fargekode egen farge tekstfarge gjennomsiktighet', see: ['fag', 'rediger'],
  },
  // Arket
  {
    id: 'kritisk', group: 'Arket', title: 'Kritisk linje',
    text: `Trykk ${ui('Kritisk linje')} og klikk boksene på linjen; klikk igjen for å ta en boks ut. Linjen følger datoene, så rekkefølgen du klikker i, spiller ingen rolle. Velg linje 1, 2 eller 3 for flere linjer.`,
    img: 'kritisk', alt: 'En rød kritisk linje gjennom seks bokser.',
    words: 'kritisk sti linje critical path tykkelse stiplet', see: ['delepdf'],
  },
  {
    id: 'omplasser', group: 'Arket', title: 'Omplasser',
    text: `${ui('Omplasser')} pakker boksene i lanene på nytt, for eksempel etter at du har endret høyder, eller gir dem størst mulig tekst. Du ser forslaget på arket og velger ${ui('Behold')} eller ${ui('Angre')}.`,
    words: 'pakke rydde tettest tidligst først stable', see: ['flytte', 'tekst'],
  },
  {
    id: 'innstillinger', group: 'Arket', title: 'Ark, kalender og visning',
    text: `${ui('Innstillinger')} har arkstørrelse og retning, kalender med måned eller uke, start og slutt på tidsaksen, statuslinje, tekst og logo. ${ui('Vis på arket')} slår av og på det som tegnes, som forklaring, fremdrift, baseline og datoer.`,
    img: 'innstillinger', alt: 'Innstillinger med undermenyen Kalender og stil åpen.',
    words: 'innstillinger a3 a4 liggende stående måned uke kalender tidsakse statuslinje ferie logo revisjon', see: ['utkikk', 'datoer'],
  },
  {
    id: 'bilder', group: 'Arket', title: 'Bilder og fritekst',
    text: `Høyreklikk arket og velg ${ui('Sett inn bilde')} eller ${ui('Sett inn tekst')}, eller lim inn et bilde med ${k('Ctrl', 'V')}. Dobbeltklikk et bilde for å beskjære det. En fritekst kan få en pil som festes til en boks.`,
    words: 'bilde kart logo beskjær rotere tekst pil notat milepæl symbol', see: ['planomrade'],
  },
  // Lagre og dele
  {
    id: 'lagre', group: 'Lagre og dele', title: 'Lagre arbeidsfil',
    text: `${ui('Lagre')} › ${ui('Lagre arbeidsfil')} lagrer planen og alle endringene inne i en PDF. Åpne den her igjen for å fortsette. Appen husker ingenting selv, så ta vare på filen.`,
    img: 'lagre', alt: 'Lagre-menyen.',
    words: 'lagre arbeidsfil pdf fil ta vare', see: ['delepdf', 'oppdater'],
  },
  {
    id: 'delepdf', group: 'Lagre og dele', title: 'PDF for deling og bilde',
    text: `${ui('Lagre PDF for deling')} gir en vanlig PDF til å sende ut, uten planen inni. Du kan også lagre én PDF per fag, en PDF med bare kritiske aktiviteter, eller kopiere arket som bilde til e-post og Teams.`,
    words: 'dele sende utskrift skriv ut png bilde fag zip kritiske teams powerpoint', see: ['lagre', 'fremhev'],
  },
  {
    id: 'oppdater', group: 'Lagre og dele', title: 'Oppdater fra Project',
    text: `Trykk ${ui('Update Existing file')} i Project og velg arbeidsfilen. Ny framdrift hentes, og alt du har endret, blir med. Bokser du har endret, får blå prikk, og endringer fra Project kan vises med ramme.`,
    img: 'oppdater', alt: 'Vinduet som ber om arbeidsfilen.',
    words: 'oppdatere update project ny framdrift endringer', see: ['lagre'],
  },
];
