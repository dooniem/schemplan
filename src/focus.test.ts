import { describe, expect, it } from 'vitest';
import { duration, periodLabel, rowsIn } from './focus';
import { planRows } from './data/rows';
import { testplan } from './test/testplaner';

describe('støtte for diskusjon', () => {
  it('skriver varighet i dager eller uker', () => {
    expect(duration('2028-03-01', '2028-03-01')).toBe('1 dag');
    expect(duration('2028-03-01', '2028-03-05')).toBe('5 dager');
    expect(duration('2028-03-01', '2028-03-28')).toBe('28 dager');
  });

  it('gir perioden et navn ut fra datoene', () => {
    expect(periodLabel('2028-03-01', '2028-03-31')).toBe('mars 2028');
    expect(periodLabel('2028-01-01', '2028-12-31')).toBe('2028');
    // Uke 1 kan starte i desember året før, og uke 53 kan slutte i januar
    expect(periodLabel('2025-12-29', '2026-01-04')).toMatch(/^uke 1 2026 /);
    expect(periodLabel('2026-12-28', '2027-01-03')).toMatch(/^uke 53 2026 /);
    expect(periodLabel('2028-03-06', '2028-03-12')).toBe('uke 10 2028 (06.03–12.03)');
    expect(periodLabel('2028-03-01', '2028-04-30')).toBe('mars–april 2028');
    expect(periodLabel('2028-11-01', '2029-01-31')).toBe('november 2028–januar 2029');
    expect(periodLabel('2028-03-06', '2028-03-19')).toBe('06.03.2028–19.03.2028');
  });

  it('finner bokser som ligger helt eller delvis i perioden', () => {
    const rows = planRows(testplan());
    const r = rows.find((x) => x.start && x.finish && x.start < x.finish)!;
    expect(rowsIn(rows, r.finish, r.finish).map((x) => x.id)).toContain(r.id);
    expect(rowsIn(rows, r.start, r.start).map((x) => x.id)).toContain(r.id);
    expect(rowsIn(rows, '1900-01-01', '1900-12-31')).toEqual([]);
  });
});
