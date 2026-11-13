import { describe, expect, it } from 'vitest';
import { plainText } from './text';
import { formatLong } from '../layout/dates';

describe('felles teksthjelpere', () => {
  it('gjør bokstekst om til én linje', () => {
    expect(plainText('*Montasje|  av /| rør ')).toBe('Montasje av rør');
    expect(plainText('')).toBe('');
  });
  it('skriver dato som dd.mm.åååå', () => {
    expect(formatLong('2026-03-07')).toBe('07.03.2026');
    expect(formatLong('')).toBe('');
  });
});
