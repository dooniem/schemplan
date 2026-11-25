// Innholdet i hjelpen: stegene i «Kom i gang» og emnene som kan søkes i.
// Teksten er HTML med bare <span class="ui-name">, <kbd>, <strong> og <em>. Bildene lages av
// scripts/hjelpebilder.mjs og ligger i ./img med samme navn som i feltet img.

/** Ett bilde i en rekke, med navn på knappen og en kort forklaring under. */
export interface HelpFrame {
  img: string;
  label: string;
  note?: string;
}

/** Et bilde, eller en rekke bilder som viser for eksempel før og etter. */
export type HelpImage = string | { frames: HelpFrame[] };

export interface HelpTopic {
  id: string;
  group: string;
  title: string;
  /** Hva funksjonen gjør og hvordan den brukes, to–tre setninger. */
  text: string;
  /** Når den er nyttig, og hva som skjer med planen. */
  when?: string;
  /** Et eksempel i noen få steg. */
  steps?: string[];
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

const FLYTT: HelpImage = {
  frames: [
    { img: 'flytte-1', label: 'Før', note: 'Boksen er valgt. Den blå rammen viser hvilken.' },
    { img: 'flytte-2', label: 'Etter', note: 'Boksen er dratt ned til lanen under og står fast der den ble sluppet.' },
  ],
};

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
    text: `Zoom med ${k('Ctrl')} og hjulet, og dra for å flytte arket. Klikk et fag i forklaringen nederst for å fremheve boksene i faget, og hold musen over en boks for å se datoene og eventuell kommentar.`,
    img: 'fremhev',
    alt: 'Faget Betong er fremhevet. De andre boksene er nedtonet, og en linje øverst gir valg for faget.',
    topic: 'fremhev', more: 'Mer om å fremheve fag',
  },
  {
    title: 'Slå på Rediger og flytt bokser',
    text: `Trykk ${ui('Rediger')}. Klikk en boks for å velge den, og dra den opp, ned eller til en annen lane. Holder du ${k('Ctrl')} mens du drar, skyves boksene under ned i stedet for at lanen ordnes på nytt.`,
    img: FLYTT,
    alt: 'En valgt boks dras fra én lane ned til lanen under.',
    topic: 'flytte', more: 'Mer om å flytte bokser',
  },
  {
    title: 'Ordne lanes',
    text: `Klikk et lane-navn for å endre navn, farge og høyde. Dra navnet opp eller ned for ny rekkefølge. Har en lane blitt rotete etter mye flytting, rydder ${ui('Omplasser')} den mens lane-navnet er valgt.`,
    img: 'lanes',
    alt: 'En lane er valgt med blå ramme rundt navnet.',
    topic: 'lanes', more: 'Mer om lanes',
  },
  {
    title: 'Fag og farger',
    text: `Klikk et fag i forklaringen for å endre fargen på alle boksene i faget på én gang. En enkelt boks kan få en annen farge, og ${ui('Fagets farge')} setter den tilbake.`,
    img: 'fag',
    alt: 'Faget Betong er valgt i forklaringen, og panelet viser fargene for faget.',
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
  // ---- Se planen ----
  {
    id: 'apne', group: 'Se planen', title: 'Åpne en plan',
    text: `En ny plan kommer fra ${ui('Generate New file')} i Project. En arbeidsfil (.pdf) eller planfil (.json) åpner du med ${ui('Åpne')}, eller ved å dra filen inn i vinduet. Linjen under verktøylinjen viser hvor mange lanes, bokser og milepæler planen har, og hvilken periode den dekker.`,
    when: `Fortsetter du på en plan du har jobbet med, åpner du arbeidsfilen, ikke en ny plan fra Project. Da er alle endringene dine med. Skal du ha ny framdrift inn, bruk ${ui('Update Existing file')} i stedet.`,
    img: 'oversikt', alt: 'Appen med en hel plan på arket.',
    words: 'start fil arbeidsfil json pdf dra slipp generate', see: ['lagre', 'oppdater'],
  },
  {
    id: 'zoom', group: 'Se planen', title: 'Zoom og flytt arket',
    text: `Zoom med ${k('Ctrl')} og hjulet, eller med + og − øverst. Dra i arket for å flytte det. Prosenten i midten viser hele arket igjen, og ↔ lar arket fylle bredden av vinduet.`,
    when: `Zoom inn når du skal flytte små bokser eller lese callouts. Zoom tilbake til hele arket før du vurderer helheten, for det er slik PDF-en blir.`,
    img: 'zoom', alt: 'Arket zoomet inn så boksene er store.',
    words: 'forstørre panorere skalere bredde', see: ['fremhev'],
  },
  {
    id: 'fremhev', group: 'Se planen', title: 'Fremhev fag og perioder',
    text: `Klikk et fag i forklaringen eller en periode i kalenderen, så tones resten ned. ${k('Ctrl')}- eller ${k('Shift')}-klikk velger flere fag. Linjen øverst kan vise bare faget og lagre en PDF slik planen vises.`,
    when: `Nyttig i møter med én entreprenør: fremhev faget deres, og send dem en PDF der bare deres arbeid står tydelig. Planen endres ikke; ${k('Esc')} eller × fjerner fremhevingen.`,
    steps: [
      `Klikk «Elektro» i forklaringen. Alle andre fag tones ned.`,
      `${k('Ctrl')}-klikk «Kabelkanaler» for å ta med det også.`,
      `Velg ${ui('Lagre PDF')} i linjen øverst for en PDF med akkurat dette utvalget.`,
    ],
    img: 'fremhev', alt: 'Faget Betong fremhevet, resten nedtonet.',
    words: 'fokus filter nedtone uthev forklaring legend måned uke', see: ['fag', 'merking', 'delepdf'],
  },
  {
    id: 'sok', group: 'Se planen', title: 'Søk i planen',
    text: `Skriv i søkefeltet øverst (${k('Ctrl', 'F')}), så lyser boksene med ordene opp. Søket ser også i kommentarene. ${k('Enter')} går til neste treff og ${k('Shift', 'Enter')} til forrige.`,
    when: `Raskeste vei til en bestemt aktivitet i en stor plan. I redigering kan du søke, trykke ${k('Enter')} til riktig boks og så endre den.`,
    img: 'sok', alt: 'Søk etter «lorem» med treffene uthevet på arket.',
    words: 'finne lete treff', see: ['data'],
  },
  {
    id: 'utkikk', group: 'Se planen', title: 'Utkikk: bare noen uker',
    text: `${ui('Utkikk')} viser bare noen uker av planen, for eksempel de neste tre fra denne uken eller fra statuslinjen. Bokser som stikker utenfor, kuttes ved kanten, og PDF-en får perioden i navnet.`,
    when: `Til ukemøter og arbeidsplaner på byggeplassen: skriv ut de neste tre ukene i stedet for hele prosjektet. ${ui('Ta med uken før')} viser også det som skulle vært ferdig. Selve planen endres ikke.`,
    img: 'utkikk', alt: 'Utkikk-menyen med valg for start og lengde.',
    words: 'lookahead periode uker utsnitt framover ukeplan', see: ['innstillinger'],
  },
  {
    id: 'data', group: 'Se planen', title: 'Data: alle bokser som tabell',
    text: `${ui('Data')} øverst viser alle boksene i en tabell med datoer og lane. Filtrer og sorter, klikk en rad for å finne boksen på arket, og eksporter tabellen til Excel.`,
    when: `Bruk det for å kontrollere planen, for eksempel finne bokser uten fag, skjulte bokser (${ui('Vis skjulte')}) eller alt som starter en bestemt måned.`,
    img: 'data', alt: 'Tabellen med alle boksene.',
    words: 'tabell liste excel eksport filter sorter skjulte', see: ['sok'],
  },
  // ---- Bokser ----
  {
    id: 'rediger', group: 'Bokser', title: 'Velg og endre en boks',
    text: `Trykk ${ui('Rediger')} og klikk en boks. Panelet til høyre viser tekst, størrelse, fag, farge, callout og datoer. Bokser du har endret, får en blå prikk, så du ser hva som er gjort i appen og ikke kommer fra Project.`,
    when: `Endringer i appen gjelder bare arket. Datoer og navn i Project påvirkes ikke, og endringene dine blir med når du oppdaterer fra Project. ${ui('Tilbakestill')} i panelet tar boksen tilbake til slik den kom fra Project.`,
    img: 'rediger', alt: 'En valgt boks med panelet for boksen til høyre.',
    words: 'redigere panel egenskaper callout blå prikk vis endret tilbakestill', see: ['tekst', 'farger', 'boksmeny'],
  },
  {
    id: 'flytte', group: 'Bokser', title: 'Flytt bokser',
    text: `Dra en boks opp eller ned i lanen, eller til en annen lane. Der du slipper, blir den stående fast. De andre løse boksene i lanen ordnes på nytt rundt den, i datorekkefølge og så høyt opp som de får plass.`,
    when: `Vanlig dra er best når du bare vil ha én boks et annet sted. Fordi resten av lanen ordnes på nytt, kan bokser du ikke har rørt, bytte plass. Vil du at alt under skal bli liggende som det er, holder du ${k('Ctrl')} mens du drar (se «Skyv bokser ned med Ctrl»).`,
    img: FLYTT, alt: 'En boks flyttes ned til lanen under.',
    words: 'dra slipp plassere flytte lane fast feste løsne', see: ['skyv', 'flervalg', 'omplasser'],
  },
  {
    id: 'skyv', group: 'Bokser', title: 'Skyv bokser ned med Ctrl',
    text: `Hold ${k('Ctrl')} mens du drar en boks. Boksene den treffer i lanen skyves ned like langt, sammen med det de igjen treffer, og blir stående fast der. Stiplede skygger viser hvor de havner før du slipper.`,
    when: `Bruk det når du har bygd opp en «trapp» eller et mønster av bokser og vil sette inn en boks i det uten at mønsteret brytes. Uten ${k('Ctrl')} flytter boksene rundt seg hver for seg, og trappen kan brytes. Du kan trykke og slippe ${k('Ctrl')} underveis og se forskjellen.`,
    steps: [
      `Ta tak i boksen du vil sette inn, og dra den dit den skal stå i trappen.`,
      `Hold ${k('Ctrl')} nede. Skyggene viser at boksene under flyttes ned like mye.`,
      `Slipp musen. Trappen står som før, bare lenger ned, og ${k('Ctrl', 'Z')} angrer alt på én gang.`,
    ],
    img: {
      frames: [
        { img: 'skyv-1', label: 'Start', note: 'Tre bokser i trapp, og en ny boks som skal inn som andre trinn.' },
        { img: 'skyv-2', label: 'Vanlig dra', note: 'Uten Ctrl kommer den nye boksen inn, men boksene rundt flytter seg hver for seg, og trappen brytes.' },
        { img: 'skyv-3', label: 'Med Ctrl', note: 'Med Ctrl skyves trappen ned som én blokk og beholder formen.' },
      ],
    },
    alt: 'En boks settes inn øverst i en trapp av bokser, med og uten Ctrl.',
    words: 'ctrl skyv skyve dytte trapp mønster sett inn mellom beholde form', see: ['flytte', 'omplasser'],
  },
  {
    id: 'flervalg', group: 'Bokser', title: 'Velg flere bokser',
    text: `${k('Shift')}-klikk bokser, eller hold ${k('Shift')} og dra et rektangel på et tomt sted. Drar du én av dem, flyttes alle like langt, og ett ${k('Ctrl', 'Z')} angrer hele flyttingen.`,
    when: `Nyttig når en hel fase skal flyttes ned i lanen, når flere bokser skal få samme fag eller høyde, eller når ${ui('Omplasser')} bare skal gjelde noen få bokser.`,
    img: 'flervalg', alt: 'Tre bokser valgt samtidig.',
    words: 'flervalg markere rektangel shift samtidig', see: ['flytte', 'hoyde', 'omplasser'],
  },
  {
    id: 'tekst', group: 'Bokser', title: 'Tekst og linjeskift',
    text: `Dobbeltklikk en boks for å skrive i den. ${k('Enter')} eller | gir linjeskift. Får ikke teksten plass i boksen, havner den i en callout ved siden av. Vil du ha noen ord i en annen farge, marker dem i tekstfeltet og trykk ${ui('A')} ved ${ui('Ordfarge')}, eller pilen ved siden av for flere farger.`,
    when: `Korte, delte linjer gir mer lesbare bokser enn én lang linje. Teksten i appen endrer ikke navnet i Project. Etter større tekstendringer gir ${ui('Omplasser')} › ${ui('Størst mulig tekst')} hver boks så stor tekst som det er plass til.`,
    img: 'tekst', alt: 'Teksten i en boks redigeres rett på arket.',
    words: 'skrive navn linjeskift enter skriftstørrelse font callout farge ordfarge skriftfarge rød ord markere', see: ['rediger', 'omplasser'],
  },
  {
    id: 'boksmeny', group: 'Bokser', title: 'Høyreklikk en boks',
    text: `Høyreklikk en boks for overskriftsboks, Multi Lane-boks, tegn fremst, merking, datoer, dupliser og kopier. Høyreklikk et tomt sted i en lane for å lage en ny boks eller milepæl der.`,
    when: `Pek på et valg i menyen, så står det nederst hva det gjør. Valg som er grå, gjelder ikke boksen, for eksempel ${ui('Løsne')} på en boks som ikke er festet.`,
    img: 'boksmeny', alt: 'Høyreklikkmenyen for en boks.',
    words: 'kontekstmeny meny overskrift multi lane ny boks milepæl dupliser kopier lim inn skjul', see: ['overskrift', 'merking', 'datoer'],
  },
  {
    id: 'overskrift', group: 'Bokser', title: 'Overskriftsbokser og egne bokser',
    text: `En overskriftsboks har teksten øverst, og andre bokser kan ligge inne i den. Drar du overskriftsboksen, følger innholdet med. En Multi Lane-boks går ned over flere lanes, uten at noen lane blir høyere.`,
    when: `Bruk overskriftsbokser til å samle en fase eller et område, for eksempel «Akse 1–3» med aktivitetene inni. Egne bokser du lager i appen, kan følge start- eller sluttdatoen til en annen boks, så de flytter seg når Project endrer seg.`,
    words: 'header gruppe ny boks egen boks følg dato kobling multi lane fase', see: ['boksmeny', 'fremst'],
  },
  {
    id: 'fremst', group: 'Bokser', title: 'Hvilken boks ligger foran',
    text: `Vanlige bokser ligger alltid foran overskrifts- og Multi Lane-bokser. Mellom overskrifts- og Multi Lane-boksene ligger den minste foran, så ingen boks gjemmes bak en større. ${ui('Tegn fremst')} i høyreklikkmenyen legger en boks over alt annet.`,
    when: `Bruk ${ui('Tegn fremst')} når en boks skal ligge oppå andre bokser, for eksempel en loddrett boks over en overskriftsboks. Plassen i lanen endres ikke, bare hva som ligger øverst. Dekker boksen teksten i en annen boks, kan teksten der justeres til venstre eller høyre (${ui('Justering')} under Form i panelet).`,
    words: 'foran bak bakerst fremst over under rekkefølge skjult gjemt dekker z justering venstre høyre midtstilt', see: ['overskrift', 'boksmeny'],
  },
  {
    id: 'hoyde', group: 'Bokser', title: 'Høyde og lik høyde',
    text: `Dra i den blå streken under en valgt boks for å endre høyden. Bunnen snapper til kanten av andre bokser (hold ${k('Alt')} for å dra fritt). ${ui('Gi andre bokser samme høyde …')} i høyreklikkmenyen gjør flere bokser like høye.`,
    when: `Like høye bokser i samme fase ser ryddigere ut og blir lettere å lese. Høyere bokser gir plass til mer tekst inne i boksen i stedet for i callout. Etter at du har endret høyder, kan ${ui('Omplasser')} pakke lanen tett igjen.`,
    words: 'høy lav størrelse snap samme høyde standard høyde', see: ['flervalg', 'omplasser'],
  },
  {
    id: 'datoer', group: 'Bokser', title: 'Datoer på boksene',
    text: `Start- og sluttdato slås på for alle under ${ui('Innstillinger')} › ${ui('Vis på arket')}, der du også velger format. Høyreklikk en boks og velg ${ui('Vis datoer')}, eller bruk bryteren i panelet, for å slå dem av eller på bare for den.`,
    when: `Datoer på alle bokser gjør arket fullt. Ofte er det nok å vise dem på milepæler og de viktigste boksene, og slå dem på per boks.`,
    words: 'dato start slutt format vis', see: ['boksmeny', 'innstillinger'],
  },
  {
    id: 'kommentar', group: 'Bokser', title: 'Kommentarer med tekst og bilder',
    text: `Velg en boks eller milepæl og åpne ${ui('Kommentar')} i panelet. Skriv en kommentar, og legg til bilder med ${ui('Legg til bilde')}, ved å lime inn i tekstfeltet eller dra dem inn. Kommentaren vises når musen holdes over boksen, og en liten rød trekant i hjørnet viser hvilke bokser som har kommentar. Klikk boksen for å se hele kommentaren; nettadresser kan da klikkes og åpnes i en ny fane, og bildene vises store når musen holdes over dem. Med ${ui('Legg til gjøremål')} blir en linje til et gjøremål som kan krysses av i kortet, også i et møte uten å gå inn i redigering.`,
    when: `Nyttig i møter: mer detaljer i planen uten at arket blir fullt. Kommentarer kommer aldri med på arket, i utskrift eller i PDF for deling, men lagres i arbeidsfilen og følger boksen ved oppdatering fra Project. Bildene gjøres mindre, så arbeidsfilen ikke blir unødig stor.`,
    words: 'notat merknad bilde foto mouse-over musepeker detaljer møte lenke url nettadresse gjøremål todo sjekkliste avkrysning huskeliste', see: ['rediger', 'lagre'],
  },
  {
    id: 'merking', group: 'Bokser', title: 'Høylytt arbeid og nattarbeid',
    text: `Merk bokser med høylytt arbeid, nattarbeid eller et eget merke fra høyreklikkmenyen. Merkene vises som små ikoner på boksene og står i forklaringen.`,
    when: `Nyttig til nabovarsel og varsling: klikk merket i forklaringen for å fremheve alle boksene med det, og lagre en PDF av utvalget. Med begge valgt kan du vise bare boksene som har begge merkene.`,
    words: 'ikon merke støy natt symbol nabovarsel', see: ['boksmeny', 'fremhev'],
  },
  {
    id: 'angre', group: 'Bokser', title: 'Angre og hurtigtaster',
    text: `${k('Ctrl', 'Z')} angrer og ${k('Ctrl', 'Y')} gjør om. ${k('Ctrl', 'D')} dupliserer, ${k('Ctrl', 'C')} og ${k('Ctrl', 'V')} kopierer og limer inn, ${k('Delete')} skjuler og ${k('Esc')} fjerner valget.`,
    when: `Prøv deg fram: alt i redigeringen kan angres, også ${ui('Omplasser')} og flytting av mange bokser samtidig, som hver er ett angresteg.`,
    words: 'tastatur snarvei undo redo tilbake', see: ['rediger'],
  },
  // ---- Lanes ----
  {
    id: 'lanes', group: 'Lanes', title: 'Lanes: navn, farge og rekkefølge',
    text: `Klikk et lane-navn for å endre navn, tekstfarge og farge. Dra navnet opp eller ned for ny rekkefølge, og dra i nederste kant av en lane for å gi den fast høyde. ${ui('Også bak boksene')} legger en dempet lanefarge bak boksene.`,
    when: `Fast høyde er nyttig når en lane skal ha luft eller plass til et bilde. ${ui('Automatisk')} gjør lanen akkurat så høy som boksene trenger. Med lane-navnet valgt gjelder ${ui('Omplasser')} bare den lanen.`,
    img: 'lanepanel', alt: 'Panelet for en valgt lane.',
    words: 'rad rekke flytte høyde bakgrunn lanefarge fast automatisk', see: ['lanemeny', 'omplasser-lane', 'planomrade'],
  },
  {
    id: 'lanemeny', group: 'Lanes', title: 'Nye lanes, grupper og sammenslåing',
    text: `Høyreklikk et lane-navn for ny lane over eller under, og for å skjule lanen. ${ui('Grupper med …')} samler lanes under en smal bar med tekst. ${ui('Slå sammen med …')} legger boksene fra to lanes i én.`,
    when: `I gruppepanelet kan lane-navnene i gruppen stå loddrett, som teksten i baren, og lanene blir da høye nok til navnene. Dra i høyre kant av baren for å endre bredden på den. Grupper når flere lanes hører til samme område eller entreprise. Slå sammen når to lanes fra Project har få bokser hver og like gjerne kan stå sammen. Sammenslåingen kan løses opp igjen med ${ui('Skill ut … igjen')}.`,
    img: 'lanemeny', alt: 'Høyreklikkmenyen for et lane-navn.',
    words: 'ny lane gruppe gruppere slå sammen skjul vis skjulte skill ut loddrett rotert roter navn bredde bar', see: ['lanes'],
  },
  {
    id: 'lanebredde', group: 'Lanes', title: 'Bredden på navnefeltet',
    text: `Dra i høyre kant av navnefeltet for å gjøre det bredere eller smalere. Kanten stopper der et navn får plass på færre linjer, og bredden står ved kanten mens du drar. Hold Alt for å dra fritt. Høyreklikk et lane-navn og velg ${ui('Automatisk')} for å gå tilbake.`,
    when: `Bruk det når et navn skal stå på én linje uten større tekst, eller når boksene trenger mer plass. Bredden følger tekststørrelsen på navnene, så linjeskiftene blir de samme på A4 og A3, i ${ui('Kompakt')} og når du endrer tekststørrelsen. Er feltet smalere enn et ord, deles ordet med bindestrek. En bindestrek du har skrevet i navnet, brukes først.`,
    words: 'bredde bredere smalere kolonne navnefelt lane-navn linjeskift bindestrek dele ord automatisk', see: ['lanes', 'tekst'],
  },
  {
    id: 'planomrade', group: 'Lanes', title: 'Gi plass til kart og bilder',
    text: `${ui('Innstillinger')} › ${ui('Ark')} har tre valg for lanene. ${ui('Fyll arket')} strekker lanene over hele arket, ${ui('Kompakt')} gjør dem så lave som boksene tillater, og ${ui('Egendefinert')} gir en stiplet topp- og bunnkant du drar selv.`,
    when: `Med ${ui('Egendefinert')} kan du lage et tomt felt til et kart eller en tegning. Dra et hvitt punkt på kanten for å lage et knekkpunkt, så flyttes lanes og bokser til det er plass.`,
    words: 'planområde kant knekkpunkt plass kart egendefinert kompakt fyll arket', see: ['bilder'],
  },
  // ---- Fag og farger ----
  {
    id: 'fag', group: 'Fag og farger', title: 'Fag',
    text: `Klikk et fag i forklaringen for å endre fargen eller navnet for alle boksene i faget. Høyreklikk forklaringen for nytt fag, eller for å gi valgte bokser faget. En enkelt boks bytter fag i panelet.`,
    when: `Fargen per fag er det som gjør planen lesbar på avstand. Sett fargene på fagene først, og gi bare enkeltbokser egen farge når de skal skille seg ut. ${ui('Velg boksene i faget')} er en rask vei til å flytte eller endre alle samtidig.`,
    img: 'fag', alt: 'Et fag valgt i forklaringen med panelet for faget.',
    words: 'trade fagfarge forklaring legend nytt fag', see: ['farger', 'fremhev'],
  },
  {
    id: 'farger', group: 'Fag og farger', title: 'Farger på bokser',
    text: `Panelet har de samme 22 fargene som i Project, med samme nummer, pluss ${ui('Egen farge')}. En egen farge vises på arket mens du prøver, og du velger ${ui('Behold')} eller ${ui('Avbryt')}.`,
    when: `Bruk egen farge sparsomt, for eksempel på én aktivitet som skal vekke oppmerksomhet. ${ui('Fagets farge')} og ${ui('Fargen fra Project')} setter fargen tilbake.`,
    words: 'farge fargekode egen farge tekstfarge gjennomsiktighet prøve', see: ['fag', 'rediger', 'innerkant', 'skravering'],
  },
  {
    id: 'skravering', group: 'Fag og farger', title: 'Skravering',
    text: `Under ${ui('Skravering')} i panelet velger du mønster (skrå, skrå andre vei, skrå kryss, vannrett, loddrett eller rutenett), hvor tett strekene står og fargen på dem. Det gjelder alle bokser, også overskrifts- og Multi Lane-bokser, og kommer med i PDF-en. Teksten og ikonene får et felt uten streker rundt seg.`,
    when: `Skravering skiller noe som ikke er vanlig arbeid, for eksempel et område som er stengt. Røde skrå streker på hvit boks gir et tydelig «stopp». ${ui('Ingen')} tar skraveringen bort.`,
    words: 'skravering skravur hatch striper streker mønster stopp stengt kryss rutenett', see: ['farger'],
  },
  {
    id: 'innerkant', group: 'Fag og farger', title: 'Lys innerkant',
    text: `Når to bokser i samme fag og samme mellomtone, for eksempel grå eller oransje, ligger kant i kant, får alle boksene i faget en tynn lys linje innenfor kanten. Lyse og mørke farger får den ikke. Klikk faget i forklaringen og velg ${ui('Auto')}, ${ui('På')} eller ${ui('Av')} under ${ui('Lys innerkant')}.`,
    when: `Innerkanten gjør det lettere å se hvor én boks slutter og neste begynner i fag med mange bokser tett i tett. Hele faget får den samtidig, så forskjellen ikke kan leses som om den betyr noe. Velg ${ui('Av')} om du vil ha faget helt rolig.`,
    words: 'innerkant kant ramme linje skille pop lesbarhet grå like bokser inntil', see: ['fag', 'farger'],
  },
  // ---- Arket ----
  {
    id: 'kritisk', group: 'Arket', title: 'Kritisk linje',
    text: `Trykk ${ui('Kritisk linje')} og klikk boksene på linjen; klikk igjen for å ta en boks ut. Linjen følger datoene, så rekkefølgen du klikker i, spiller ingen rolle. Velg linje 1, 2 eller 3 for flere linjer, og sett farge, tykkelse og strek i panelet.`,
    when: `Viser hvilke aktiviteter som styrer sluttdatoen. ${ui('Vis bare kritiske aktiviteter')} skjuler resten mens du ser på den, og ${ui('Lagre')} kan lage en PDF med bare de kritiske aktivitetene.`,
    img: 'kritisk', alt: 'En rød kritisk linje gjennom seks bokser.',
    words: 'kritisk sti linje critical path tykkelse stiplet', see: ['delepdf'],
  },
  {
    id: 'omplasser', group: 'Arket', title: 'Omplasser: rydd lanene',
    text: `${ui('Omplasser')} legger boksene i lanene på plass på nytt. Du velger mellom tre måter, ser forslaget på arket med de flyttede boksene merket, og trykker ${ui('Behold')} eller ${ui('Angre')}. Linjen øverst sier hvor mange bokser som ble flyttet, og hvor mye lavere eller høyere lanen ble.`,
    when: `<strong>Tettest</strong> gjør lanene så lave som mulig, og boksene kan da bytte plass. Velg den når arket er trangt. Plassen som blir ledig, gir planen større tekst, og linjen øverst tilbyr ${ui('Størst mulig tekst')} for å bruke resten. <strong>Trapp</strong> legger boksene i datorekkefølge ovenfra og ned, som i Project: en boks som starter senere, havner aldri over en tidligere den overlapper. Den er lettest å lese, men lanen blir høyere. <strong>Samle fag</strong> er en trapp der boksene i samme fag ligger samlet, i rekkefølgen fagene har i forklaringen. Velg den når en lane har flere fag. Bokser du har dratt på plass, blir stående, med mindre du slår på ${ui('Løsne festede bokser også')}.`,
    steps: [
      `Klikk lane-navnet til lanen som er blitt rotete, så gjelder det bare den lanen.`,
      `Velg ${ui('Omplasser')} › ${ui('Trapp')}, og slå på ${ui('Løsne festede bokser også')} hvis boksene er dratt på plass.`,
      `Se forslaget. Er lanen blitt for høy, trykker du ${ui('Angre')} og prøver ${ui('Tettest')} i stedet. Trykk ${ui('Behold')} når du er fornøyd.`,
    ],
    img: {
      frames: [
        { img: 'omplasser-1', label: 'Før', note: 'Etter mye flytting står boksene spredt, med hull mellom. De blå prikkene viser at de er dratt på plass.' },
        { img: 'omplasser-2', label: 'Tettest', note: 'Lanen ble 21 % lavere. Boksene står tett, men ikke i datorekkefølge.' },
        { img: 'omplasser-3', label: 'Trapp', note: 'Boksene går i trapp etter startdato. Lettest å lese, men lanen ble høyere.' },
        { img: 'omplasser-4', label: 'Samle fag', note: 'Hvert fag samlet, i rekkefølgen fra forklaringen, og i trapp innenfor faget.' },
      ],
    },
    alt: 'En rotete lane før, og etter Omplasser › Tettest, Trapp og Samle fag.',
    words: 'pakke rydde tettest trapp samle fag tidligst først datorekkefølge stable orden rekkefølge løsne festede lavere høyere', see: ['omplasser-lane', 'storsttekst', 'skyv'],
  },
  {
    id: 'omplasser-lane', group: 'Arket', title: 'Omplasser bare én lane eller noen bokser',
    text: `${ui('Omplasser')} gjelder det du har valgt før du åpner menyen. Med et lane-navn valgt gjelder det bare den lanen. Med én boks valgt gjelder det lanen boksen står i, og med flere bokser valgt flyttes bare de. Uten valg gjelder det hele planen.`,
    when: `Rydd én lane om gangen. Da blir resten av planen stående akkurat som du har lagt den, og du ser lettere hva som endret seg. Øverst i menyen står det alltid hva den gjelder.`,
    img: 'omplasser-meny', alt: 'Omplasser-menyen med teksten «Gjelder lanen» øverst.',
    words: 'omplasser per lane én lane valgt utvalg', see: ['omplasser', 'lanes', 'flervalg'],
  },
  {
    id: 'storsttekst', group: 'Arket', title: 'Størst mulig tekst',
    text: `${ui('Omplasser')} › ${ui('Størst mulig tekst')} gir hver boks så stor tekst som det er plass til, høyst dobbelt så stor som planens. Boksene blir høyere der det er ledig plass, og lane-navnene får én felles, større størrelse.`,
    when: `Ta det til slutt, når boksene står der de skal. Etter ${ui('Omplasser')} › ${ui('Tettest')} finner du samme knapp i linjen øverst. Da utnytter du den ledige plassen på arket, og planen blir lettere å lese på utskrift. ${ui('Standard tekststørrelse')} tar teksten tilbake.`,
    words: 'tekststørrelse større tekst lesbar fyll plass', see: ['tekst', 'omplasser'],
  },
  {
    id: 'innstillinger', group: 'Arket', title: 'Ark, kalender og visning',
    text: `${ui('Innstillinger')} har arkstørrelse og retning, kalender med måned eller uke, start og slutt på tidsaksen, statuslinje, tekst og logo. ${ui('Vis på arket')} slår av og på det som tegnes, som forklaring, fremdrift, baseline og datoer.`,
    when: `A3 liggende passer de fleste planer; A4 er laget for å lime inn i Word. Ukekalender passer korte planer. Bokser utenfor en kortere tidsakse ligger urørt og kommer tilbake når den utvides.`,
    img: 'innstillinger', alt: 'Innstillinger med undermenyen Kalender og stil åpen.',
    words: 'innstillinger a3 a4 liggende stående måned uke kalender tidsakse statuslinje ferie logo revisjon', see: ['utkikk', 'datoer'],
  },
  {
    id: 'bilder', group: 'Arket', title: 'Bilder og fritekst',
    text: `Høyreklikk arket og velg ${ui('Sett inn bilde')} eller ${ui('Sett inn tekst')}, eller lim inn et bilde med ${k('Ctrl', 'V')}. Dobbeltklikk et bilde for å beskjære det. En fritekst kan få en pil som festes til en boks.`,
    when: `Et kart over området gjør planen lettere å forstå for folk utenfra. Fritekst med pil passer til korte merknader, som «Avhengig av tillatelse». Et bilde kan også brukes som symbol på en milepæl: velg milepælen og ${ui('Bruk bilde som symbol')} under Utseende i panelet. Der kan du også redigere, bytte eller fjerne bildet. Høyreklikk et bilde eller en tekst og velg ${ui('Fest til dato')} og ${ui('Fest til lane')}, så følger den planen når du bytter ark eller lanene flytter seg.`,
    words: 'bilde kart logo beskjær rotere tekst pil notat milepæl symbol fest dato lane', see: ['planomrade'],
  },
  // ---- Lagre og dele ----
  {
    id: 'lagre', group: 'Lagre og dele', title: 'Lagre arbeidsfil',
    text: `${ui('Lagre')} › ${ui('Lagre arbeidsfil')} lagrer planen og alle endringene inne i en PDF. Åpne den her igjen for å fortsette.`,
    when: `Appen husker ingenting selv, så lagre arbeidsfilen før du lukker fanen, og ta vare på den. Arbeidsfilen er internt dokument; til andre sender du ${ui('Lagre PDF for deling')}.`,
    img: 'lagre', alt: 'Lagre-menyen.',
    words: 'lagre arbeidsfil pdf fil ta vare', see: ['delepdf', 'oppdater'],
  },
  {
    id: 'delepdf', group: 'Lagre og dele', title: 'PDF for deling og bilde',
    text: `${ui('Lagre PDF for deling')} gir en vanlig PDF til å sende ut, uten planen inni. Du kan også lagre én PDF per fag, en PDF med bare kritiske aktiviteter, eller kopiere arket som bilde til e-post og Teams.`,
    when: `Én PDF per fag er nyttig før oppstartsmøter: hver entreprenør får sin egen. Kopier som bilde når planen skal rett inn i en presentasjon eller e-post.`,
    words: 'dele sende utskrift skriv ut png bilde fag zip kritiske teams powerpoint', see: ['lagre', 'fremhev'],
  },
  {
    id: 'oppdater', group: 'Lagre og dele', title: 'Oppdater fra Project',
    text: `Trykk ${ui('Update Existing file')} i Project og velg arbeidsfilen. Ny framdrift hentes, og alt du har endret, blir med.`,
    when: `Gjør det hver gang framdriften i Project er endret, i stedet for å lage en ny plan. ${ui('Endringer fra Project')} under ${ui('Vis på arket')} setter ramme rundt nye bokser og nye datoer, så du ser hva som er flyttet siden sist.`,
    img: 'oppdater', alt: 'Vinduet som ber om arbeidsfilen.',
    words: 'oppdatere update project ny framdrift endringer', see: ['lagre'],
  },
];
