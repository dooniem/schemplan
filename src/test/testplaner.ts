// Testdata for enhetstestene. Bare fyllord og oppdiktede datoer.
import type { PlanFile } from '../format/types';

const PLAN = {"format":"schemplan","version":1,"exportedAt":"2026-11-06T10:00:00","anonymized":true,"plan":{"title":"Eksempelplan","schemNumber":1,"calendar":{"mode":"month","start":"2026-01-01","end":"2026-12-31","workingDaysPerWeek":5,"bottomCalendar":false},"layout":{"orientation":"landscape","heightMode":"fill","textSize":9,"calloutMaxWidthCm":5,"excelWidthMultiplier":1},"options":{"legend":true,"flag20Only":false,"filterOutput":false,"colorBy":"trade"}},"colors":[{"name":"(none)","fill":"#FFF9C8","border":null,"text":"#000000"},{"name":"Prosjektering","fill":"#D9E2F3","border":"#2F5597","text":"#000000"},{"name":"Grunnarbeid","fill":"#C9B79C","border":null,"text":"#000000"},{"name":"Betong","fill":"#A6A6A6","border":null,"text":"#FFFFFF"},{"name":"Stål","fill":"#7F7F7F","border":null,"text":"#FFFFFF"},{"name":"Elektro","fill":"#FFC000","border":null,"text":"#000000"},{"name":"VVS","fill":"#9DC3E6","border":null,"text":"#000000"}],"holidays":[{"start":"2026-07-06","end":"2026-07-31"},{"start":"2026-12-21","end":"2026-12-31"}],"lanes":[{"id":"1","name":"Loremipsumdol","fill":null,"shown":true,"boxes":[{"id":"1_1","text":"Ipiscingeli","taskIds":[100,101],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-01-05","finish":"2026-03-20","isMilestone":false,"trade":"Prosjektering"}},{"id":"1_2","text":"Emagnaaliqualoremip|sum 1","taskIds":[102,103],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-03-23","finish":"2026-06-12","isMilestone":false,"trade":"Prosjektering"}},{"id":"1_3","text":"*Doeiusmodtemporincid","taskIds":[104,105],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-04-01","finish":"2026-04-15","isMilestone":false,"trade":"Prosjektering"}}]},{"id":"2","name":"Iduntutlabore","fill":null,"shown":true,"boxes":[{"id":"2_1","text":"Emip su mdolo","taskIds":[106,107],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-02-02","finish":"2026-11-27","isMilestone":false,"trade":"Grunnarbeid"}},{"id":"2_2","text":"Eiusmod te mporincidi","taskIds":[108,109],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-03-02","finish":"2026-05-15","isMilestone":false,"trade":"Grunnarbeid"}},{"id":"2_3","text":"Gnaaliqualo","taskIds":[110,111],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-05-04","finish":"2026-06-19","isMilestone":false,"trade":"Betong"}}]},{"id":"3","name":"Remips","fill":null,"shown":true,"boxes":[{"id":"3_1","text":"Scingelit seddoe","taskIds":[112,113],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-06-01","finish":"2026-08-14","isMilestone":false,"trade":"Betong"}},{"id":"3_2","text":"Laboreetdolo","taskIds":[114,115],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-07-06","finish":"2026-09-25","isMilestone":false,"trade":"Stål"}},{"id":"3_3","text":"Emip sumd","taskIds":[116,117],"rotation":0,"milestone":{"dateSource":"scheduled","symbol":"flag","verticalLine":false,"color":"red","rotateText":false,"showDate":true},"shown":true,"resolved":{"start":"2026-10-01","finish":"2026-10-01","isMilestone":true,"trade":"Betong"}}]},{"id":"4","name":"Olorsita met","fill":null,"shown":true,"boxes":[{"id":"4_1","text":"Emporin cididuntutla","taskIds":[118,119],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2026-08-17","finish":"2026-11-20","isMilestone":false,"trade":"Elektro"}},{"id":"4_2","text":"MDO lorsitametcon","taskIds":[120,121],"rotation":90,"milestone":null,"shown":true,"resolved":{"start":"2026-10-19","finish":"2026-12-11","isMilestone":false,"trade":"VVS"}}]},{"id":"5","name":"Secteturadip","fill":null,"shown":true,"boxes":[{"id":"5_1","text":"Incididuntutla","taskIds":[122,123],"rotation":0,"milestone":{"dateSource":"scheduled","symbol":"diamond","verticalLine":true,"color":"green","rotateText":false,"showDate":true},"shown":true,"resolved":{"start":"2026-12-14","finish":"2026-12-14","isMilestone":true,"trade":"(none)"}},{"id":"5_2","text":"Sumdolo rsitamet","taskIds":[124,125],"rotation":0,"milestone":null,"shown":true,"resolved":{"start":"2027-02-01","finish":"2027-02-10","isMilestone":false,"trade":"(none)"}}]}],"tasks":[{"uid":100,"name":"Orsitametco 1","start":"2026-01-05","finish":"2026-03-20","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":101,"name":"Nsecteturad 2","start":"2026-01-05","finish":"2026-03-20","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":102,"name":"Tseddoeiusmodtempor inc 1 1","start":"2026-03-23","finish":"2026-06-12","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":103,"name":"Ididuntutlaboreetdo lor 1 2","start":"2026-03-23","finish":"2026-06-12","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":104,"name":"Dolorsitametconsecte 1","start":"2026-04-01","finish":"2026-04-15","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":105,"name":"Turadipiscingelitsed 2","start":"2026-04-01","finish":"2026-04-15","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Prosjektering"},{"uid":106,"name":"Etdo lo remag 1","start":"2026-02-02","finish":"2026-11-27","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Grunnarbeid"},{"uid":107,"name":"Naal iq ualor 2","start":"2026-02-02","finish":"2026-11-27","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Grunnarbeid"},{"uid":108,"name":"Rsitame tc onsectetur 1","start":"2026-03-02","finish":"2026-05-15","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Grunnarbeid"},{"uid":109,"name":"Adipisc in gelitseddo 2","start":"2026-03-02","finish":"2026-05-15","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Grunnarbeid"},{"uid":110,"name":"Duntutlabor 1","start":"2026-05-04","finish":"2026-06-19","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":111,"name":"Eetdolorema 2","start":"2026-05-04","finish":"2026-06-19","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":112,"name":"Umdolorsi tametc 1","start":"2026-06-01","finish":"2026-08-14","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":113,"name":"Onsectetu radipi 2","start":"2026-06-01","finish":"2026-08-14","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":114,"name":"Iusmodtempor 1","start":"2026-07-06","finish":"2026-09-25","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Stål"},{"uid":115,"name":"Incididuntut 2","start":"2026-07-06","finish":"2026-09-25","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Stål"},{"uid":116,"name":"Rema gnaa 1","start":"2026-10-01","finish":"2026-10-01","deadline":null,"milestone":true,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":117,"name":"Liqu alor 2","start":"2026-10-01","finish":"2026-10-01","deadline":null,"milestone":true,"summary":false,"flag20":false,"percentComplete":0,"trade":"Betong"},{"uid":118,"name":"Consect eturadipisci 1","start":"2026-08-17","finish":"2026-11-20","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Elektro"},{"uid":119,"name":"Ngelits eddoeiusmodt 2","start":"2026-08-17","finish":"2026-11-20","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"Elektro"},{"uid":120,"name":"BOR eetdoloremagn 1","start":"2026-10-19","finish":"2026-12-11","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"VVS"},{"uid":121,"name":"AAL iqualoremipsu 2","start":"2026-10-19","finish":"2026-12-11","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":"VVS"},{"uid":122,"name":"Iscingelitsedd 1","start":"2026-12-14","finish":"2026-12-14","deadline":null,"milestone":true,"summary":false,"flag20":false,"percentComplete":0,"trade":null},{"uid":123,"name":"Oeiusmodtempor 2","start":"2026-12-14","finish":"2026-12-14","deadline":null,"milestone":true,"summary":false,"flag20":false,"percentComplete":0,"trade":null},{"uid":124,"name":"Boreetd oloremag 1","start":"2027-02-01","finish":"2027-02-10","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":null},{"uid":125,"name":"Naaliqu aloremip 2","start":"2027-02-01","finish":"2027-02-10","deadline":null,"milestone":false,"summary":false,"flag20":false,"percentComplete":0,"trade":null}]};

/** En liten plan med milepæler, flagg og callouts. Ny kopi hver gang. */
export const testplan = (): PlanFile => structuredClone(PLAN) as unknown as PlanFile;

const ORD = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis nostrud exercitation ullamco laboris nisi aliquip commodo consequat'.split(' ');
const FAG = [
  ['Prosjektering', '#A9A9A9'], ['Grunnarbeid', '#F58231'], ['Bergarbeid', '#3CB44B'], ['Betong', '#4363D8'],
  ['Tilbakefylling', '#9A6324'], ['VA', '#808000'], ['Elektro', '#FFE119'], ['Kabelkanaler', '#BFEF45'],
  ['Etterarbeid', '#FFD8B1'], ['Asfalt', '#000000'], ['Testing', '#FABED4'], ['Slakk', '#42D4F4'],
  ['Sikkerhetssone', '#E6194B'], ['Avretting', '#DCBEFF'], ['Stål', '#469990'], ['Tak', '#911EB4'],
];
const LANEFARGER = ['#DDDDDD', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#CEE5ED', '#FFFFFF', '#F8F1AE'];

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const DAY = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);

interface Form { fil: string; navn: string; seed: number; lanes: number; bokserPerLane: number; start: string; maneder: number; modus?: 'month' | 'week'; tittelLengde?: [number, number] }

function lagPlan({ navn, seed, lanes, bokserPerLane, start, maneder, modus = 'month', tittelLengde = [1, 3] }: Form): PlanFile {
  const r = rng(seed);
  const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
  const tekst = (min: number, max: number) => {
    const n = min + Math.floor(r() * (max - min + 1));
    return cap(Array.from({ length: n }, () => pick(ORD)).join(' '));
  };
  const t0 = Date.parse(start);
  const t1 = t0 + maneder * 30.4 * DAY;
  const span = t1 - t0;
  let uid = 1;
  const tasks: object[] = [];
  const laneList: object[] = [];
  for (let l = 0; l < lanes; l++) {
    const boxes: object[] = [];
    // Hver lane har en "kjede" som starter et sted i perioden og går i trapp, pluss noen frie bokser
    let cursor = t0 + r() * span * 0.5;
    for (let b = 0; b < bokserPerLane; b++) {
      const kort = r() < 0.35; // smale bokser gir callouts
      const lengde = (kort ? 3 + r() * 12 : 15 + r() * span / DAY / 5) * DAY;
      let s = r() < 0.7 ? cursor - r() * lengde * 0.4 : t0 + r() * span * 0.9;
      s = Math.max(t0, Math.min(s, t1 - 2 * DAY));
      const f = Math.min(t1 - DAY, s + lengde);
      cursor = f + DAY;
      if (cursor > t1 - 10 * DAY) cursor = t0 + r() * span * 0.6;
      const erMilepael = r() < 0.12;
      const [fag] = pick(FAG);
      const linjer = r() < 0.25 ? `${tekst(1, 3)}|${tekst(1, 3)}` : tekst(1, 4);
      const tekstUt = (kort && r() < 0.3 ? '*' : '') + linjer;
      const id = uid++;
      tasks.push({ uid: id, name: linjer.replace('|', ' '), start: iso(s), finish: iso(erMilepael ? s : f), deadline: null, milestone: erMilepael, summary: false, flag20: false, percentComplete: 0, trade: erMilepael ? null : fag });
      boxes.push({
        id: `${l + 1}_${b + 1}`,
        text: tekstUt,
        taskIds: [id],
        rotation: 0,
        milestone: erMilepael ? { dateSource: 'scheduled', symbol: r() < 0.5 ? 'diamond' : 'flag', verticalLine: false, color: pick(['red', 'green', 'orange', 'blue']), rotateText: false, showDate: true } : null,
        shown: true,
        resolved: { start: iso(s), finish: iso(erMilepael ? s : f), isMilestone: erMilepael, trade: erMilepael ? '(none)' : fag },
      });
    }
    laneList.push({ id: String(l + 1), name: tekst(tittelLengde[0], tittelLengde[1]), fill: pick(LANEFARGER), shown: true, boxes });
  }
  return ({
    format: 'schemplan',
    version: 1,
    exportedAt: '2026-11-06T12:00:00',
    anonymized: true,
    plan: {
      title: `Testplan: ${navn}`,
      schemNumber: 1,
      calendar: { mode: modus, start: iso(t0), end: iso(t1), workingDaysPerWeek: 5, bottomCalendar: true },
      layout: { orientation: 'landscape', heightMode: 'fill', textSize: 10, calloutMaxWidthCm: 5, excelWidthMultiplier: 1 },
      options: { legend: true, flag20Only: false, filterOutput: false, colorBy: 'trade' },
    },
    colors: [{ name: '(none)', fill: '#FFFAC8', border: '#000000', text: '#000000' }, ...FAG.map(([name, fill]) => ({ name, fill, border: '#000000', text: '#000000' }))],
    holidays: [],
    lanes: laneList,
    tasks,
  } as unknown) as PlanFile;
}

const FORMER: Form[] = [
  { fil: 'mange-lanes-faa-bokser', navn: 'mange lanes, få bokser', seed: 11, lanes: 24, bokserPerLane: 3, start: '2027-01-01', maneder: 24 },
  { fil: 'faa-lanes-mange-bokser', navn: 'få lanes, mange bokser', seed: 22, lanes: 4, bokserPerLane: 30, start: '2027-01-01', maneder: 18 },
  { fil: 'mange-av-begge', navn: 'mange lanes og mange bokser', seed: 33, lanes: 16, bokserPerLane: 16, start: '2027-01-01', maneder: 30 },
  { fil: 'middels', navn: 'middels', seed: 44, lanes: 9, bokserPerLane: 9, start: '2027-01-01', maneder: 24 },
  { fil: 'ukeplan', navn: 'ukeplan', seed: 55, lanes: 8, bokserPerLane: 10, start: '2027-03-01', maneder: 6, modus: 'week' },
  { fil: 'lange-lanetitler', navn: 'lange lanetitler', seed: 66, lanes: 10, bokserPerLane: 6, start: '2027-01-01', maneder: 20, tittelLengde: [4, 7] },
];


/** Planer i ulike former (mange/få lanes og bokser, ukeplan, lange titler), laget med fast frø. */
export function testform(fil: string): PlanFile {
  const f = FORMER.find((x) => x.fil === fil);
  if (!f) throw new Error(`Ukjent testform ${fil}`);
  return lagPlan(f);
}
