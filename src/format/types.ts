// Planformat v1: det VBA-eksporten (Generate in Web) skriver, og det appen leser.
// Beskrevet for mennesker i docs/planformat.md. Endres formatet, økes `version`.

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
  };
  options: {
    legend: boolean;
    flag20Only: boolean;
    filterOutput: boolean;
    colorBy: 'trade' | 'lane';
  };
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
  /** false = skjult av lane-filter i userformen. */
  shown: boolean;
  boxes: Box[];
}

export type Rotation = 0 | 90 | -90;

export interface Box {
  /** "laneId_boxId", som pTwoID i VBA. */
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
  /** Det Excel ville tegnet. null = tegnes ikke (ingen gyldige aktiviteter, eller utenfor Flag20-utvalget). */
  resolved: ResolvedBox | null;
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
