import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAco, crc32, makeZip } from '../public/js/export.js';

const PAL = ['#F2E3B3', '#D98E73', '#1E1B3A'];

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('buildAco writes v1 and v2 blocks that parse back', () => {
  const bytes = buildAco(PAL), dv = new DataView(bytes.buffer);
  let o = 0;
  const u16 = () => { const v = dv.getUint16(o); o += 2; return v; };
  const color = () => { const space = u16(); const rgb = [u16(), u16(), u16()]; u16(); return { space, rgb }; };
  const hexOf = rgb => '#' + rgb.map(c => (c / 257).toString(16).padStart(2, '0')).join('').toUpperCase();

  assert.equal(u16(), 1);
  assert.equal(u16(), PAL.length);
  PAL.forEach(h => { const c = color(); assert.equal(c.space, 0); assert.equal(hexOf(c.rgb), h); });

  assert.equal(u16(), 2);
  assert.equal(u16(), PAL.length);
  PAL.forEach(h => {
    assert.equal(hexOf(color().rgb), h);
    const len = dv.getUint32(o); o += 4;
    const name = Array.from({ length: len }, () => String.fromCharCode(u16()));
    assert.equal(name.pop(), '\0');
    assert.match(name.join(''), new RegExp(`^Value \\d+\\.\\d ${h}$`));
  });
  assert.equal(o, bytes.length);
});

test('makeZip produces a valid stored archive', () => {
  const files = [
    { name: 'a.aco', data: buildAco(PAL) },
    { name: 'b.png', data: new Uint8Array([1, 2, 3, 4, 5]) },
  ];
  const zip = makeZip(files), dv = new DataView(zip.buffer);
  const eocd = zip.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), files.length);
  const cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  assert.equal(cdOff + cdSize, eocd);

  let p = cdOff;
  const dec = new TextDecoder();
  files.forEach(f => {
    assert.equal(dv.getUint32(p, true), 0x02014b50);
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true), local = dv.getUint32(p + 42, true);
    assert.equal(dec.decode(zip.subarray(p + 46, p + 46 + nameLen)), f.name);
    assert.equal(crc, crc32(f.data));
    assert.equal(size, f.data.length);

    assert.equal(dv.getUint32(local, true), 0x04034b50);
    assert.equal(dv.getUint16(local + 8, true), 0, 'stored');
    const start = local + 30 + dv.getUint16(local + 26, true);
    assert.deepEqual(zip.subarray(start, start + size), f.data);
    p += 46 + nameLen;
  });
});
