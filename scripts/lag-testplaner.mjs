// Lager fiktive testplaner i ulike former, for å måle hvordan tilpasningen til arket virker.
// Alt innhold er oppdiktet (lorem-tekst), så filene kan ligge i det offentlige repoet.
// Kjør: node scripts/lag-testplaner.mjs   (skriver til examples/former/)
import { mkdirSync, writeFileSync } from 'node:fs';

const ORD = 'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua enim minim veniam quis nostrud exercitation ullamco laboris nisi aliquip commodo consequat'.split(' ');
const FAG = [
  ['Prosjektering', '#A9A9A9'], ['Grunnarbeid', '#F58231'], ['Bergarbeid', '#3CB44B'], ['Betong', '#4363D8'],
  ['Tilbakefylling', '#9A6324'], ['VA', '#808000'], ['Elektro', '#FFE119'], ['Kabelkanaler', '#BFEF45'],
  ['Etterarbeid', '#FFD8B1'], ['Asfalt', '#000000'], ['Testing', '#FABED4'], ['Slakk', '#42D4F4'],
  ['Sikkerhetssone', '#E6194B'], ['Avretting', '#DCBEFF'], ['Stål', '#469990'], ['Tak', '#911EB4'],
];
const LANEFARGER = ['#DDDDDD', '#FFFFFF', '#FFFFFF', '#FFFFFF', '#CEE5ED', '#FFFFFF', '#F8F1AE'];

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const DAY = 86400000;
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const cap = (w) => w[0].toUpperCase() + w.slice(1);

function lagPlan({ navn, seed, lanes, bokserPerLane, start, maneder, modus = 'month', tittelLengde = [1, 3] }) {
  const r = rng(seed);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const tekst = (min, max) => {
    const n = min + Math.floor(r() * (max - min + 1));
    return cap(Array.from({ length: n }, () => pick(ORD)).join(' '));
  };
  const t0 = Date.parse(start);
  const t1 = t0 + maneder * 30.4 * DAY;
  const span = t1 - t0;
  let uid = 1;
  const tasks = [];
  const laneList = [];
  for (let l = 0; l < lanes; l++) {
    const boxes = [];
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
    laneList.push({ id: String(l + 1), name: tekst(...tittelLengde), fill: pick(LANEFARGER), shown: true, boxes });
  }
  return {
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
  };
}

export const FORMER = [
  { fil: 'mange-lanes-faa-bokser', navn: 'mange lanes, få bokser', seed: 11, lanes: 24, bokserPerLane: 3, start: '2027-01-01', maneder: 24 },
  { fil: 'faa-lanes-mange-bokser', navn: 'få lanes, mange bokser', seed: 22, lanes: 4, bokserPerLane: 30, start: '2027-01-01', maneder: 18 },
  { fil: 'mange-av-begge', navn: 'mange lanes og mange bokser', seed: 33, lanes: 16, bokserPerLane: 16, start: '2027-01-01', maneder: 30 },
  { fil: 'middels', navn: 'middels', seed: 44, lanes: 9, bokserPerLane: 9, start: '2027-01-01', maneder: 24 },
  { fil: 'ukeplan', navn: 'ukeplan', seed: 55, lanes: 8, bokserPerLane: 10, start: '2027-03-01', maneder: 6, modus: 'week' },
  { fil: 'lange-lanetitler', navn: 'lange lanetitler', seed: 66, lanes: 10, bokserPerLane: 6, start: '2027-01-01', maneder: 20, tittelLengde: [4, 7] },
];

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync('examples/former', { recursive: true });
  for (const f of FORMER) writeFileSync(`examples/former/${f.fil}.json`, JSON.stringify(lagPlan(f), null, 1) + '\n');
  console.log(`Skrev ${FORMER.length} testplaner til examples/former/`);
}
