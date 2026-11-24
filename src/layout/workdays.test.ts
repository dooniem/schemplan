import { describe, expect, it } from 'vitest';
import { workDayCount } from './workdays';

const file = (holidays: { start: string; end: string }[] = [], workingDaysPerWeek = 5) =>
  ({ plan: { calendar: { workingDaysPerWeek } }, holidays }) as unknown as Parameters<typeof workDayCount>[0];

describe('workDayCount', () => {
  it('teller dagene i arbeidsuka, med start- og sluttdagen', () => {
    // man 6.3.2028–søn 12.3.2028
    expect(workDayCount(file(), '2028-03-06', '2028-03-12')).toBe(5);
    expect(workDayCount(file(), '2028-03-06', '2028-03-06')).toBe(1);
    expect(workDayCount(file(), '2028-03-11', '2028-03-12')).toBe(0);
    expect(workDayCount(file(), '2028-03-06', '2028-04-02')).toBe(20);
  });
  it('trekker fra fridager i planen', () => {
    const f = file([{ start: '2028-03-08', end: '2028-03-09' }, { start: '2028-05-17', end: '2028-05-17' }]);
    expect(workDayCount(f, '2028-03-06', '2028-03-12')).toBe(3);
  });
  it('følger antall arbeidsdager i uka', () => {
    expect(workDayCount(file([], 6), '2028-03-06', '2028-03-12')).toBe(6);
  });
  it('gir 0 for ugyldige datoer', () => {
    expect(workDayCount(file(), '2028-03-12', '2028-03-06')).toBe(0);
    expect(workDayCount(file(), '', '2028-03-06')).toBe(0);
  });
});
