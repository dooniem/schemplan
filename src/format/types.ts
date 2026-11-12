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
    heightMode: 'fill' | 'compact';
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
    /** Måneds- eller ukesvisning valgt i appen. Mangler den, gjelder valget fra Project. */
    calendarMode?: 'month' | 'week';
    /** Logo øverst til venstre: PNG som data-URL, og bredde delt på høyde. */
    logo?: { data: string; aspect: number };
    /** Logoens høyde i forhold til standard. Uavhengig av overskriften. */
    logoScale?: number;
    /** Fagfarger valgt i appen, etter fagnavn. Går foran fargene i `colors`. */
    tradeColors?: Record<string, { fill: HexColor; text?: HexColor }>;
    /** Fag laget i appen, i rekkefølgen de står i forklaringen etter fagene fra Project. Fargen står i `tradeColors`. */
    appTrades?: string[];
    /** Utseendet til den kritiske linjen: tykkelse i mm og farge. */
    criticalLine?: { width: number; color: HexColor; dash?: 'solid' | 'dashed' | 'dotted' };
    /** Utkikk: planen tegnes bare for noen uker. Lagres som regel, så perioden ruller videre. */
    lookahead?: Lookahead;
    /** Statuslinjen: loddrett strek på statusdatoen. */
    statusLine?: StatusLine;
    /** Forklaringen: oppføringer som er skjult eller har egen tekst, etter fagnavn ("(ferie)" for ferie). */
    legendItems?: Record<string, { hidden?: boolean; text?: string }>;
    /** Lane-titlenes størrelse i forhold til teksten i boksene. Lik for alle lanes. */
    laneTitleScale?: number;
    /** Teksten øverst til høyre i forhold til standard (0,6 × overskriften). */
    headerRightScale?: number;
    /** Forklaringen og datoen nederst i forhold til standardstørrelsen. Lik for alle oppføringer. */
    legendScale?: number;
    /** Dagen planen sist ble endret i appen (YYYY-MM-DD). Datoen nederst er den nyeste av denne og eksporten. */
    editedAt?: string;
    /** Bilder satt inn i appen, tegnet oppå planen i denne rekkefølgen. */
    images?: PlanImage[];
  };
  options: {
    legend: boolean;
    flag20Only: boolean;
    filterOutput: boolean;
    colorBy: 'trade' | 'lane';
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
}

export interface IsoWeek {
  year: number;
  week: number;
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
}

export type Rotation = 0 | 90 | -90;

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
  /** Milepælens utseende valgt i appen (valgfritt). Går foran `milestone` fra Project, felt for felt. */
  milestoneStyle?: Partial<Pick<MilestoneStyle, 'symbol' | 'color' | 'verticalLine' | 'showDate'>>;
  /** Med i den kritiske linjen (valgfritt). Linjen trekkes gjennom de merkede boksene i datorekkefølge. */
  critical?: boolean;
  /** Tekststørrelse i boksen i forhold til planens tekst, valgt i appen (valgfritt). 1 = som planen, høyst 2. */
  textScale?: number;
}

export interface BoxFollow {
  /** Id-en til boksen det følges etter. */
  box: string;
  edge: 'start' | 'finish';
  at: IsoDate;
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
