// Pakker ut WOFF til TTF, så skriften kan bygges inn i PDF-en med pdf-lib.
// Kjør: node scripts/woff-til-ttf.mjs inn.woff ut.ttf
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const [src, dst] = process.argv.slice(2);
const w = readFileSync(src);
if (w.readUInt32BE(0) !== 0x774f4646) throw new Error('Ikke en WOFF-fil');
const flavor = w.readUInt32BE(4);
const numTables = w.readUInt16BE(12);
const tables = [];
for (let i = 0; i < numTables; i++) {
  const o = 44 + i * 20;
  const t = { tag: w.readUInt32BE(o), offset: w.readUInt32BE(o + 4), compLength: w.readUInt32BE(o + 8), origLength: w.readUInt32BE(o + 12), checksum: w.readUInt32BE(o + 16) };
  const raw = w.subarray(t.offset, t.offset + t.compLength);
  t.data = t.compLength < t.origLength ? inflateSync(raw) : Buffer.from(raw);
  tables.push(t);
}
let es = 0;
while (1 << (es + 1) <= numTables) es++;
const searchRange = (1 << es) * 16;
const head = Buffer.alloc(12 + numTables * 16);
head.writeUInt32BE(flavor, 0);
head.writeUInt16BE(numTables, 4);
head.writeUInt16BE(searchRange, 6);
head.writeUInt16BE(es, 8);
head.writeUInt16BE(numTables * 16 - searchRange, 10);
let off = head.length;
const parts = [head];
tables.forEach((t, i) => {
  const o = 12 + i * 16;
  head.writeUInt32BE(t.tag, o);
  head.writeUInt32BE(t.checksum, o + 4);
  head.writeUInt32BE(off, o + 8);
  head.writeUInt32BE(t.data.length, o + 12);
  const pad = (4 - (t.data.length % 4)) % 4;
  parts.push(t.data, Buffer.alloc(pad));
  off += t.data.length + pad;
});
writeFileSync(dst, Buffer.concat(parts));
console.log(`${dst}: ${off} byte`);
