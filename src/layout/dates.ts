// Datoregning på rene datoer (UTC), så sommertid og tidssone aldri flytter en dag.
const DAY = 86_400_000;

export const parseIso = (iso: string): number => Date.parse(`${iso}T00:00:00Z`);
export const toIso = (t: number): string => new Date(t).toISOString().slice(0, 10);
export const addDays = (t: number, n: number): number => t + n * DAY;
export const daysBetween = (a: number, b: number): number => Math.round((b - a) / DAY);

export const year = (t: number) => new Date(t).getUTCFullYear();
export const month = (t: number) => new Date(t).getUTCMonth(); // 0–11
export const day = (t: number) => new Date(t).getUTCDate();
/** 0 = mandag … 6 = søndag */
export const weekday = (t: number) => (new Date(t).getUTCDay() + 6) % 7;
export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
export const monthStart = (y: number, m: number) => Date.UTC(y, m, 1);

/** ISO-ukenummer og ISO-år (året torsdagen ligger i). */
export function isoWeek(t: number): { year: number; week: number } {
  const thursday = addDays(t, 3 - weekday(t));
  const y = year(thursday);
  const jan4 = Date.UTC(y, 0, 4);
  const week1Monday = addDays(jan4, -weekday(jan4));
  return { year: y, week: Math.floor(daysBetween(week1Monday, thursday) / 7) + 1 };
}

export const MONTHS_NB = ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'];

/** dd.mm.åååå, tom tekst for manglende dato. */
export const formatLong = (iso: string) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '');

export const formatShort = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
};
