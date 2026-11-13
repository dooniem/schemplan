import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { cell, COLUMNS, planRows, plainText, progressOf } from './rows';
import { buildXlsx, excelDate, zip } from './xlsx';
import { testplan } from '../test/testplaner';

/** Leser filene i en zip ved å gå gjennom de lokale filhodene. */
function unzip(z: Uint8Array): Map<string, string> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const out = new Map<string, string>();
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extra = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(z.subarray(p + 30, p + 30 + nameLen));
    const start = p + 30 + nameLen + extra;
    const data = z.subarray(start, start + size);
    expect(method).toBe(0);
    // Kontrollsummen i filhodet må stemme, ellers nekter Excel å åpne filen
    expect(dv.getUint32(p + 14, true)).toBe(crc32(data));
    out.set(name, new TextDecoder().decode(data));
    p = start + size;
  }
  return out;
}

describe('datafanen', () => {
  it('gir én rad per synlig boks med lane, tekst og datoer', () => {
    const p = testplan();
    const rows = planRows(p);
    const shown = p.lanes.filter((l) => l.shown).reduce((n, l) => n + l.boxes.filter((b) => b.shown).length, 0);
    expect(rows).toHaveLength(shown);
    const b = p.lanes[0].boxes[0];
    const r = rows.find((x) => x.id === b.id)!;
    expect(r.lane).toBe(plainText(p.lanes[0].name));
    expect(r.text).toBe(plainText(b.text));
    expect(r.finish).toBe(b.resolved!.finish);
    expect(r.edited).toBe(false);
    expect(cell(r, 'edited')).toBe('Nei');
  });

  it('merker det som er endret i appen', () => {
    const p = testplan();
    const b = p.lanes[0].boxes[0];
    b.original = { text: b.text, rotation: b.rotation };
    b.text = 'Ny tekst';
    b.fill = '#ff0000';
    p.lanes[1].hidden = true;
    const rows = planRows(p);
    const r = rows.find((x) => x.id === b.id)!;
    expect(r.edited).toBe(true);
    expect(r.changes).toEqual(['tekst', 'farge']);
    expect(r.text).toBe('Ny tekst');
    expect(r.fill).toBe('#FF0000');
    const hiddenLane = rows.filter((x) => x.laneOrder === 1);
    expect(hiddenLane.every((x) => x.hidden && x.edited)).toBe(true);
  });

  it('gjør linjeskift og tvunget callout om til vanlig tekst', () => {
    expect(plainText('*Første|andre/|tredje')).toBe('Første andre tredje');
  });
});

describe('Excel-fil', () => {
  it('regner datoer som Excel gjør', () => {
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-11-06')).toBe(46332);
  });

  it('lager en gyldig zip med arbeidsbok, ark og stiler', () => {
    const p = testplan();
    const rows = planRows(p);
    const x = buildXlsx('Data', COLUMNS, rows.map((r) => COLUMNS.map((c) => cell(r, c.key))));
    const files = unzip(x);
    expect([...files.keys()]).toEqual(['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
    const sheet = files.get('xl/worksheets/sheet1.xml')!;
    expect(sheet.match(/<row /g)).toHaveLength(rows.length + 1);
    expect(sheet).toContain('<autoFilter ref="A1:R');
    // Datoer lagres som tall med datoformat
    expect(sheet).toContain(`<c r="C2" s="2"><v>${excelDate(rows[0].start)}</v></c>`);
  });

  it('skriver tegn som må escapes, og zip-hodet har riktig størrelse', () => {
    const x = buildXlsx('Ark', [{ title: 'A', width: 10 }], [['<Æ & "Ø">']]);
    expect(unzip(x).get('xl/worksheets/sheet1.xml')).toContain('&lt;Æ &amp; &quot;Ø&quot;&gt;');
    const z = zip([{ name: 'a.txt', data: new TextEncoder().encode('hei') }]);
    expect(unzip(z).get('a.txt')).toBe('hei');
    const dv = new DataView(z.buffer);
    expect(dv.getUint32(z.length - 22, true)).toBe(0x06054b50);
  });
});

describe('% ferdig og baseline', () => {
  const t = (p: number, bf?: string) => ({ uid: 1, name: 'a', start: '2026-01-01', finish: '2026-02-01', deadline: null, milestone: false, summary: false, flag20: false, percentComplete: p, trade: null, baselineFinish: bf });
  it('gir snitt og avvik i dager', () => {
    expect(progressOf([t(50, '2026-01-28'), t(100)], '2026-02-01')).toEqual({ progress: '75 %', baseline: '4 dager senere' });
    expect(progressOf([t(0, '2026-02-02')], '2026-02-01').baseline).toBe('1 dag tidligere');
    expect(progressOf([], '2026-02-01')).toEqual({ progress: '', baseline: '' });
  });
});
