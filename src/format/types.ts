// Planformat v1. Endres formatet, økes `version`.

export const FORMAT_NAME = 'schemplan';
export const FORMAT_VERSION = 1;

/** Dato som tekst, "YYYY-MM-DD". */
export type IsoDate = string;
/** Farge som "#RRGGBB". */
export type HexColor = string;

export interface PlanFile {
  format: typeof FORMAT_NAME;
  version: number;
  exportedAt: string;
  anonymized: boolean;
  plan: PlanSettings;
  colors: TradeColor[];
  holidays: Holiday[];
  lanes: Lane[];
  tasks: Task[];
}

export interface PlanSettings {
  title: string;
  /** Statusdato fra Project. Mangler den, er det ingen statusdato. */
  statusDate?: IsoDate | null;
  /** Baselinen som er sendt med aktivitetene. Mangler den, er ingen baseline sendt. */
  baseline?: BaselineInfo | null;
  /** Hvilken av de fire skjematiske planene i .mpp-filen (1–4). */
  schemNumber: number;
  calendar: {
    mode: 'month' | 'week';
    start: IsoDate;
    end: IsoDate;
    workingDaysPerWeek: number;
    bottomCalendar: boolean;
  };
  layout: {
    orientation: 'landscape' | 'portrait';
    /** custom: som fill, men med topp- og bunnkant valgt i appen (planArea). */
    heightMode: 'fill' | 'compact' | 'custom';
    /** Skriftstørrelse i punkter. */
    textSize: number;
    calloutMaxWidthCm: number;
    /** Background size fra Excel-løpet. Brukes ikke av web-appen, tas med for sammenligning. */
    excelWidthMultiplier: number;
    /** Valgene fra appen, lagret i arbeidsfilen så planen åpnes likt igjen. */
    paper?: 'A4' | 'A3' | 'A2' | 'A1';
    style?: 'excel' | 'ny';
    fitToSheet?: boolean;
    /** Minste tekststørrelse ved tilpasning til arket, i punkter. */
    minTextSize?: number;
    /** Overskriftens størrelse i punkter. Krympes ikke når planen tilpasses arket. */
    titleSize?: number;
    /** Overskrift skrevet i appen. Går foran `plan.title` fra Project. */
    title?: string;
    /** Tekst øverst til høyre, høyrejustert. | gir linjeskift. */
    headerRight?: string;
    /** Vis forklaringen. Mangler den, gjelder valget fra Project. */
    showLegend?: boolean;
    /** Vis kalenderen også under planen. Mangler den, gjelder valget fra Project. */
    showBottomCalendar?: boolean;
    /** Ferier vises bare når de er minst så mange dager sammenhengende, helg inntil medregnet. Standard 4. */
    minHolidayDays?: number;
    /** Måneds- eller ukesvisning valgt i appen. Mangler den, gjelder valget fra Project. */
    calendarMode?: 'month' | 'week';
    /** Kalenderens start og slutt valgt i appen. En ende som mangler, følger Project. */
    calendarRange?: CalendarRange;
    /** Logo øverst til venstre: PNG som data-URL, og bredde delt på høyde. */
    logo?: { data: string; aspect: number };
    /** Logoens høyde i forhold til standard. Uavhengig av overskriften. */
    logoScale?: number;
    /** Fagfarger valgt i appen, etter fagnavn. Går foran fargene i `colors`. */
    tradeColors?: Record<string, { fill: HexColor; text?: HexColor }>;
    /** Lys innerkant per fag: på eller av. Uten valg avgjøres det automatisk. */
    innerEdge?: Record<string, 'on' | 'off'>;
    /** Fag laget i appen, i rekkefølgen de står i forklaringen etter fagene fra Project. Fargen står i `tradeColors`. */
    appTrades?: string[];
    /** Utseendet til den kritiske linjen (linje 1): tykkelse i mm og farge. */
    criticalLine?: { width: number; color: HexColor; dash?: 'solid' | 'dashed' | 'dotted' };
    /** Utseendet til kritisk linje 2. */
    criticalLine2?: { width: number; color: HexColor; dash?: 'solid' | 'dashed' | 'dotted' };
    /** Utseendet til kritisk linje 3. */
    criticalLine3?: { width: number; color: HexColor; dash?: 'solid' | 'dashed' | 'dotted' };
    /** Utkikk: planen tegnes bare for noen uker. Lagres som regel, så perioden ruller videre. */
    lookahead?: Lookahead;
    /** Statuslinjen: loddrett strek på statusdatoen. */
    statusLine?: StatusLine;
    /** Forklaringen: oppføringer som er skjult eller har egen tekst, etter fagnavn ("(ferie)" for ferie). */
    legendItems?: Record<string, { hidden?: boolean; text?: string }>;
    /** Lane-titlenes størrelse i forhold til teksten i boksene. Lik for alle lanes. */
    laneTitleScale?: number;
    /** Valgt bredde på lane-kolonnen, i ganger lane-navnenes tekststørrelse. Uten: automatisk. */
    laneTitleWidth?: number;
    /** Teksten øverst til høyre i forhold til standard (0,6 × overskriften). */
    headerRightScale?: number;
    /** Forklaringen og datoen nederst i forhold til standardstørrelsen. Lik for alle oppføringer. */
    legendScale?: number;
    /** Ikonene for høylytt arbeid og nattarbeid i forhold til standardstørrelsen (en tekstlinje). Lik for alle bokser. */
    markScale?: number;
    /** Start- og sluttdato som egen rad i alle boksene. Hver boks kan ha eget valg (Box.showDates). */
    showDates?: boolean;
    /** Formatet på datoraden i boksene. Uten valg: dd.mm–dd.mm. */
    dateFormat?: BoxDateFormat;
    /** Eget merke lastet opp i appen: navn og bilde (data-URL, PNG eller JPEG). Står ved siden av høylytt arbeid og nattarbeid. */
    customMark?: { name: string; image: string };
    /** Dagen planen sist ble endret i appen (YYYY-MM-DD). Datoen nederst er den nyeste av denne og eksporten. */
    editedAt?: string;
    /** Bilder satt inn i appen, tegnet oppå planen i denne rekkefølgen. */
    images?: PlanImage[];
    /** Endringer fra Project ved siste oppdatering: nye bokser, og bokser med nye datoer (med datoene de hadde før). */
    changes?: Record<string, BoxChange>;
    /** Revisjon nede til høyre, foran datoen. Kan skrus av uten at nummer og tekst glemmes. */
    revision?: { on: boolean; number: string; text?: string };
    /** % ferdig som mørk stripe nederst i boksene. */
    showProgress?: boolean;
    /** Hvordan fremdriften vises: stripe nederst (standard) eller felt som fyller den ferdige delen av boksen. */
    progressStyle?: 'stripe' | 'fill';
    /** Baseline som tynn strek under boksene. */
    showBaseline?: boolean;
    /** Tynn linje på dagens dato, uavhengig av statuslinjen. */
    todayLine?: boolean;
    /** Marker endringene fra siste oppdatering på arket. */
    showChanges?: boolean;
    /** Egendefinert planområde: topp- og bunnkanten som punkter [x, y], andeler av arket fra venstre til høyre. */
    planArea?: { top?: [number, number][]; bottom?: [number, number][] };
    /** Grupper av lanes som står etter hverandre: en smal bar med rotert tekst til venstre for lane-navnene. */
    laneGroups?: LaneGroup[];
  };
  options: {
    legend: boolean;
    flag20Only: boolean;
    filterOutput: boolean;
    /** Fra eldre eksport, brukes ikke. */
    colorBy?: 'trade' | 'lane';
  };
}

/** Bilde satt inn i appen. Plass og størrelse er andeler av arket, så bildet står likt på A4 og A1. */
export interface PlanImage {
  id: string;
  /** PNG eller JPEG som data-URL. */
  data: string;
  /** Bildets opprinnelige størrelse i piksler, til «Opprinnelig størrelse». */
  px: [number, number];
  /** Midten av hele bildet (uten beskjæring), som andel av arkets bredde og høyde. */
  x: number;
  y: number;
  /** Bredde og høyde på hele bildet, begge som andel av arkets bredde. */
  w: number;
  h: number;
  /** Grader med klokken, fra −180 til 180. */
  rotation: number;
  /** Vanlig beskjæring: det som er igjen, som [venstre, topp, høyre, bunn] fra 0 til 1 over hele bildet. */
  crop?: [number, number, number, number];
  /** Punktbeskjæring: hjørnene i en mangekant, fra 0 til 1 over hele bildet. Gjelder sammen med `crop`. */
  points?: [number, number][];
  /**
   * Festet til en dato: midten av det synlige står dx (andel av arkets bredde) til høyre for midten av dagen,
   * og følger datoen når kalenderen endres. Bildet flyttes da bare opp og ned.
   */
  date?: { day: IsoDate; dx: number };
  /**
   * Bildet er symbolet til en milepæl (boks-id) og følger den. dx og dy er avstanden fra milepælens
   * punkt til midten av det synlige, som andel av arkets bredde. Milepælens eget symbol tegnes ikke.
   */
  milestone?: { id: string; dx: number; dy: number };
  /**
   * Festet til en lane: midten av det synlige står v ned i lanen (0 er toppen, 1 bunnen) og følger
   * lanen når den flyttes eller endrer høyde. Kan kombineres med `date`. Vises ikke lanen, brukes y.
   */
  lane?: { id: string; v: number };
  /** Fritekst: bildet er tegnet fra denne teksten og tegnes på nytt når den endres. */
  note?: PlanNote;
}

/** Fritekst på arket. */
export interface PlanNote {
  /** Linjeskift med \n. */
  text: string;
  sizePt: number;
  bold?: boolean;
  /** Hvit bakgrunn med tynn ramme. */
  frame?: boolean;
  /** Luft mellom rammen og teksten i mm, [sideveis, opp og ned]. Gjelder bare med ramme; uten den en halv skrifthøyde. */
  pad?: [number, number];
  color?: string;
  /** Skrift; uten den brukes planens skrift. */
  font?: NoteFont;
  italic?: boolean;
  underline?: boolean;
  /** Justering av linjene; uten den venstrejustert. */
  align?: 'center' | 'right';
  /** Pil fra teksten til et punkt på arket, gjerne en boks teksten gjelder. */
  arrow?: NoteArrow;
}

/** Pil fra en fritekst. Streken starter på kanten av teksten. */
export interface NoteArrow {
  /** Pilspissen, som andel av arkets bredde og høyde. */
  x: number;
  y: number;
  /**
   * Pilspissen står på en boks eller milepæl (id) og følger den. u og v er plassen i boksen,
   * fra 0 til 1 fra venstre og fra toppen. Vises ikke boksen, brukes x og y.
   */
  to?: { id: string; u: number; v: number };
  /**
   * Pilspissen står på den kritiske linjen, så langt ut langs den (0 er starten, 1 slutten), og
   * følger linjen når den endres. Uten kritisk linje brukes x og y.
   */
  line?: number;
  /** Hvilken kritisk linje spissen står på (2 eller 3). Uten den linje 1. */
  lineNo?: number;
  /** Strekbredde i pt; uten den følger den skriftstørrelsen. */
  width?: number;
  /** Farge på streken og pilspissen; uten den samme som teksten. */
  color?: string;
  /** Størrelsen på pilspissen; uten den middels. */
  head?: 'small' | 'large';
  /**
   * Kurve: hvor langt midten av streken bøyes ut til siden, som andel av avstanden fra teksten
   * til spissen. Positiv bøyer mot venstre sett fra teksten. Uten den er streken rett.
   */
  bend?: number;
}

export type NoteFont = 'arimo' | 'tinos' | 'cousine';

export interface IsoWeek {
  year: number;
  week: number;
}

/** Rundes ut til hele måneder eller uker når planen tegnes. */
export interface CalendarRange {
  start?: IsoDate;
  end?: IsoDate;
}

export interface Lookahead {
  /** Slått på: planen tegnes bare for perioden. */
  on: boolean;
  /** Startuke. null = denne uken, som ruller med dagens dato. 'status' = uken statuslinjen står i. */
  from: IsoWeek | null | 'status';
  /** Ta med uken før startuken. */
  prevWeek: boolean;
  /** Antall uker fra og med startuken, eller til og med en ISO-uke. */
  length: { weeks: number } | IsoWeek;
  /** Ta bort lanes uten bokser i perioden. */
  hideEmptyLanes: boolean;
  /** Vis hele planen i miniatyr under planen, også på PDF og utskrift. Mangler den, vises den. */
  showOverview?: boolean;
}

export interface StatusLine {
  on: boolean;
  /** project: statusdatoen fra Project (slutten av dagen). monday: mandag denne uken. custom: `date`. */
  source: 'project' | 'monday' | 'custom';
  /** Egendefinert dato. Beholdes når et annet valg er aktivt. */
  date?: IsoDate;
  /** Tykkelse i mm. */
  width: number;
  color: HexColor;
  /** Vis «Status 6.11» øverst ved streken. */
  label: boolean;
  /** Fremdriftsfronten langs statuslinjen. Mangler den, er fronten av. */
  front?: ProgressFront;
}

export interface BaselineInfo {
  /** 0 = Baseline, 1–10 = Baseline1–Baseline10. */
  number: number;
  name: string;
  /** Når baselinen ble lagret. */
  saved: IsoDate | null;
}

export interface ProgressFront {
  on: boolean;
  /** Hva fronten måles mot. baseline krever baseline i planen. */
  against: 'plan' | 'baseline';
  /** Ta også med bokser som skulle vært ferdige, men ikke er 100 %. */
  late: boolean;
  /** Vis avviket i arbeidsdager ved hvert knekkpunkt. */
  deviation: boolean;
}

export interface TradeColor {
  name: string;
  fill: HexColor | null;
  /** null = ingen kantlinje. */
  border: HexColor | null;
  text: HexColor | null;
}

export interface Holiday {
  start: IsoDate;
  end: IsoDate;
}

/** Gruppe av lanes, laget i appen. En lane er i høyst én gruppe. */
export interface LaneGroup {
  id: string;
  /** Teksten i baren. | gir linjeskift. */
  name: string;
  fill: HexColor;
  /** Lane-id-ene i gruppen. Rekkefølgen på arket følger lanene. */
  lanes: string[];
  /** Lane-navnene i gruppen står loddrett, lest nedenfra og opp. */
  rotateNames?: boolean;
  /** Valgt bredde på baren, i ganger lane-navnenes tekststørrelse. Uten: like bred som teksten. */
  barWidth?: number;
}

export interface Lane {
  id: string;
  name: string;
  fill: HexColor | null;
  /** false = skjult. */
  shown: boolean;
  boxes: Box[];
  /** Fast høyde valgt i appen, i tekstlinjer (valgfritt). Uten den blir lanen så høy som innholdet krever. */
  height?: number;
  /** Skjult i appen (valgfritt). Skilt fra `shown`, som kommer fra Project. */
  hidden?: boolean;
  /** Lanen er laget i appen, ikke hentet fra Project. */
  manual?: boolean;
  /** Navn og farge før første endring i appen, så de kan tilbakestilles og flettes (valgfritt). */
  original?: { name: string; fill: HexColor | null };
  /** Rekkefølgen boksene pakkes i, valgt med «Omplasser» (boks-id-er, valgfritt). Uten den: tidligst først. */
  order?: string[];
  /** Lanen er slått sammen med denne lanen i appen (valgfritt). Bare lanes fra Project; de skjules. Nye bokser fra Project i lanen flyttes dit. */
  mergedInto?: string;
  /** Lanefargen vises også dempet som bakgrunn bak boksene (valgfritt). */
  tintBackground?: boolean;
  /** Hvor sterk lanefargen bak boksene er, i prosent av standard (valgfritt, 25–200). Uten den: 100. */
  tintStrength?: number;
  /** Hvit skrift på lanenavnet (valgfritt). Uten den er navnet svart. */
  whiteText?: boolean;
}

export type Rotation = 0 | 90 | -90;

/** Egen farge på en del av teksten: tegnene fra og med `from` til (men ikke med) `to` i `Box.text`. */
export interface TextColorRun {
  from: number;
  to: number;
  color: HexColor;
}

export interface Box {
  /** "laneId_boxId". */
  id: string;
  /** Teksten slik den er lagret: "|" = linjeskift, "/|" = loddrett strek, "*" først = tvunget callout. */
  text: string;
  taskIds: number[];
  rotation: Rotation;
  milestone: MilestoneStyle | null;
  shown: boolean;
  /** Brukerens valg i appen (valgfritt). Uten valg bestemmer appen: "*" først i teksten betyr callout. */
  callout?: 'auto' | 'on' | 'off';
  /** Hvilken side callouten står på (valgfritt). */
  calloutSide?: 'auto' | 'left' | 'right';
  /** Egen største bredde på callouten, i cm på arket (valgfritt). Uten den gjelder planens bredde. */
  calloutWidthCm?: number;
  /** Det som tegnes. null = tegnes ikke. */
  resolved: ResolvedBox | null;
  /** Fag valgt i appen (valgfritt). Går foran `resolved.trade` fra Project. */
  trade?: string;
  /** Bakgrunnsfarge valgt i appen (valgfritt). Uten den brukes fagets farge. */
  fill?: HexColor;
  /** Tekstfarge valgt i appen (valgfritt). Uten den velges svart eller hvit etter kontrast når fill er satt. */
  textColor?: HexColor;
  /** Egen farge på deler av teksten, valgt i appen (valgfritt). Går foran `textColor` for de tegnene. */
  textColors?: TextColorRun[];
  /** Tekst og rotasjon før første endring i appen, så de kan tilbakestilles (valgfritt). */
  original?: { text: string; rotation: Rotation };
  /** Høyde valgt i appen, i tekstlinjer (valgfritt). Boksen blir aldri lavere enn teksten krever. */
  height?: number;
  /** Fast plass i lanen valgt i appen: avstand fra toppen av lanen, i tekstlinjer (valgfritt). */
  top?: number;
  /** Skjult i appen (valgfritt). Skilt fra `shown`, som kommer fra Project. */
  hidden?: boolean;
  /** Boksen er laget i appen (ny eller kopi), ikke hentet fra Project. Datoene står i `resolved`. */
  manual?: boolean;
  /**
   * Bare bokser laget i appen: datoene følger start- eller sluttdatoen til en annen boks (valgfritt).
   * `at` er datoen den andre boksen hadde sist, så flyttes boksen like mange dager som den andre har flyttet seg.
   */
  follows?: BoxFollow;
  /** Lanen boksen lå i før den ble flyttet i appen (valgfritt). */
  fromLane?: string;
  /** Overskriftsboks (valgfritt): teksten står øverst, og andre bokser kan ligge inne i den. */
  header?: boolean;
  /**
   * Multi Lane-boks (valgfritt): boksen strekker seg ned til bunnen av denne lanen (id), som kan være
   * dens egen. Den gjør ingen lane høyere, tegnes bak de andre boksene, og andre bokser kan ligge inni.
   */
  spanTo?: string;
  /** Multi Lane-boks: bunnen står så langt ned i lanen `spanTo`, i tekstlinjer fra toppen. Uten går den til bunnen av lanen. */
  spanEnd?: number;
  /** Plassen i lanen i Kompakt, i tekstlinjer fra toppen. Uten brukes `top`, uten tomrom over. Påvirker ikke «Fyll hele arket». */
  compactTop?: number;
  /** Multi Lane-boks i Kompakt: som `spanEnd`, men bare i Kompakt. Uten brukes `spanEnd`. */
  compactSpanEnd?: number;
  /** Multi Lane-boks: teksten midt i boksen i stedet for øverst (valgfritt). */
  textMiddle?: boolean;
  /** Fet tekst i overskrifts- og Multi Lane-bokser (valgfritt). */
  bold?: boolean;
  /**
   * Gjennomsiktig fyll på overskrifts- og Multi Lane-bokser, i prosent fra 0 til 90 (valgfritt).
   * Kanten og teksten er hele.
   */
  transparency?: number;
  /** Justering av teksten i boksen (valgfritt). Uten er teksten midtstilt. Gjelder vannrett tekst, ikke callout. */
  textAlign?: TextAlign;
  /** Rotert tekst i en boks som er høyere enn teksten: oppe eller nede (valgfritt). Uten står teksten i midten. */
  textAt?: 'top' | 'bottom';
  /** Tegnes over alle andre bokser, uansett type (valgfritt). Endrer ikke plassen i lanen. */
  front?: boolean;
  /** Skravering over fyllet, valgt i appen (valgfritt). Teksten får et felt uten streker rundt seg. */
  hatch?: BoxHatch;
  /** Milepælens utseende valgt i appen (valgfritt). Går foran `milestone` fra Project, felt for felt. */
  milestoneStyle?: Partial<Pick<MilestoneStyle, 'symbol' | 'color' | 'verticalLine' | 'showDate'>> & {
    /** Rotert milepælstekst. Uten valg gjelder `rotation`, eller −90 når `milestone.rotateText` er satt. */
    rotation?: Rotation;
    /** Bare rotert tekst og flagg: stangen ligger øverst og flagget henger ned, teksten står under. */
    flagTurned?: boolean;
    /** Bare rotert tekst og ruter: ruteren står under teksten i stedet for over. */
    diamondBelow?: boolean;
  };
  /**
   * Med i en kritisk linje (valgfritt). Linjen trekkes gjennom de merkede boksene i datorekkefølge.
   * true er linje 1; ellers linjenumrene (1–3) boksen er med i.
   */
  critical?: boolean | number[];
  /** Merket med høylytt arbeid (valgfritt). Vises som et ikon på høyre kant av boksen. */
  loud?: boolean;
  /** Merket med nattarbeid (valgfritt). Vises som et ikon på høyre kant av boksen. */
  night?: boolean;
  /** Merket med planens eget merke (valgfritt). Vises bare når plan.layout.customMark finnes. */
  custom?: boolean;
  /** Tekststørrelse i boksen i forhold til planens tekst, valgt i appen (valgfritt). 1 = som planen, høyst 2. */
  textScale?: number;
  /** Start- og sluttdato under teksten, valgt for boksen (valgfritt). Uten valg gjelder plan.layout.showDates. */
  showDates?: boolean;
  /**
   * Kommentar med tekst og bilder (valgfritt). Vises bare når musen holdes over boksen på skjermen,
   * aldri på arket eller i PDF-en for deling. Lagres i arbeidsfilen.
   */
  comment?: BoxComment;
}

export interface BoxComment {
  /** "\n" = linjeskift. */
  text?: string;
  images?: CommentImage[];
}

/** Bilde i en kommentar: PNG eller JPEG som data-URL, med størrelsen i piksler. */
export interface CommentImage {
  data: string;
  w: number;
  h: number;
}

/** Mønsteret i skraveringen: skrå, skrå andre vei, skrå kryss, vannrett, loddrett eller rutenett. */
export type HatchPattern = 'diagUp' | 'diagDown' | 'diagCross' | 'horizontal' | 'vertical' | 'grid';
/** Hvor tett strekene står. */
export type HatchDensity = 'tight' | 'normal' | 'loose';

export interface BoxHatch {
  pattern: HatchPattern;
  /** Fargen på strekene. Uten er de røde. */
  color?: HexColor;
  /** Uten står strekene middels tett. */
  density?: HatchDensity;
}

/** Formatet på datoraden i boksene. Eksemplene gjelder 03.11–14.11.2026. */
export type BoxDateFormat =
  | 'dm' // 03.11–14.11
  | 'dmShort' // 3.11–14.11
  | 'dmy' // 03.11.26–14.11.26
  | 'dmyyyy' // 03.11.2026–14.11.2026
  | 'dmon' // 3. nov–14. nov
  | 'dmonyyyy' // 3. nov 2026–14. nov 2026
  | 'wdm' // ti 03.11–lø 14.11
  | 'week'; // uke 45–46

export interface BoxFollow {
  /** Id-en til boksen det følges etter. */
  box: string;
  edge: 'start' | 'finish';
  at: IsoDate;
}

/** En boks som er ny fra Project, eller som har fått nye datoer (start og finish er datoene før). */
export interface BoxChange {
  kind: 'new' | 'moved';
  start?: string;
  finish?: string;
}

export interface MilestoneStyle {
  dateSource: 'deadline' | 'scheduled';
  symbol: 'flag' | 'diamond';
  verticalLine: boolean;
  color: 'red' | 'yellow' | 'green' | 'blue' | 'orange' | 'black';
  rotateText: boolean;
  showDate: boolean;
}

export interface ResolvedBox {
  start: IsoDate;
  finish: IsoDate;
  isMilestone: boolean;
  trade: string;
}

export interface Task {
  uid: number;
  name: string;
  start: IsoDate;
  finish: IsoDate;
  deadline: IsoDate | null;
  milestone: boolean;
  summary: boolean;
  flag20: boolean;
  percentComplete: number;
  trade: string | null;
  /** Start og slutt i baseline. Mangler de, har aktiviteten ingen baseline. */
  baselineStart?: IsoDate | null;
  baselineFinish?: IsoDate | null;
}

/** Justering av tekst i en boks. */
export type TextAlign = 'left' | 'center' | 'right';
