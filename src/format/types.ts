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
    /** Fagfarger valgt i appen, etter fagnavn. Går foran fargene i `colors`. */
    tradeColors?: Record<string, { fill: HexColor; text?: HexColor }>;
    /** Utseendet til den kritiske linjen: tykkelse i mm og farge. */
    criticalLine?: { width: number; color: HexColor; dash?: 'solid' | 'dashed' | 'dotted' };
    /** Utkikk: planen tegnes bare for noen uker. Lagres som regel, så perioden ruller videre. */
    lookahead?: Lookahead;
    /** Statuslinjen: loddrett strek på statusdatoen. */
    statusLine?: StatusLine;
    /** Lane-titlenes størrelse i forhold til teksten i boksene. Lik for alle lanes. */
    laneTitleScale?: number;
  };
  options: {
    legend: boolean;
    flag20Only: boolean;
    filterOutput: boolean;
    colorBy: 'trade' | 'lane';
  };
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
  /** Det som tegnes. null = tegnes ikke. */
  resolved: ResolvedBox | null;
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
  /** Lanen boksen lå i før den ble flyttet i appen (valgfritt). */
  fromLane?: string;
  /** Overskriftsboks (valgfritt): teksten står øverst, og andre bokser kan ligge inne i den. */
  header?: boolean;
  /** Milepælens utseende valgt i appen (valgfritt). Går foran `milestone` fra Project, felt for felt. */
  milestoneStyle?: Partial<Pick<MilestoneStyle, 'symbol' | 'color' | 'verticalLine' | 'showDate'>>;
  /** Med i den kritiske linjen (valgfritt). Linjen trekkes gjennom de merkede boksene i datorekkefølge. */
  critical?: boolean;
  /** Tekststørrelse i boksen i forhold til planens tekst, valgt i appen (valgfritt). 1 = som planen, høyst 2. */
  textScale?: number;
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
}
