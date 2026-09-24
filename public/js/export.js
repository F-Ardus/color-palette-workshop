// Export for Clip Studio Paint: Photoshop swatches (.aco) plus a PNG of the
// palette, bundled in a stored (uncompressed) zip. No libraries.

import { hexToRgb, valueOfHex } from './color.js';

// .aco: version 1 block (colors only) followed by version 2 (colors + names),
// big-endian, RGB channels scaled to 16 bits.
export function buildAco(cols) {
  const names = cols.map(h => `Value ${valueOfHex(h).toFixed(1)} ${h}`);
  let size = 4 + cols.length * 10 + 4;
  names.forEach(n => { size += 10 + 4 + (n.length + 1) * 2; });
  const buf = new ArrayBuffer(size), dv = new DataView(buf);
  let o = 0;
  const u16 = v => { dv.setUint16(o, v); o += 2; };
  const writeColor = h => { u16(0); hexToRgb(h).forEach(c => u16(c * 257)); u16(0); };
  u16(1); u16(cols.length); cols.forEach(writeColor);
  u16(2); u16(cols.length);
  cols.forEach((h, i) => {
    writeColor(h);
    const n = names[i];
    dv.setUint32(o, n.length + 1); o += 4;
    for (let k = 0; k < n.length; k++) u16(n.charCodeAt(k));
    u16(0);
  });
  return new Uint8Array(buf);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(d) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Writes [offset, value, byteLength] fields little-endian into a new header.
function header(length, fields) {
  const dv = new DataView(new ArrayBuffer(length));
  fields.forEach(([p, v, s]) => s === 4 ? dv.setUint32(p, v, true) : dv.setUint16(p, v, true));
  return new Uint8Array(dv.buffer);
}

const DOS_DATE = 0x21; // 1980-01-01; the entries carry no real timestamp

// files: [{name (ASCII), data: Uint8Array}] → zip bytes, method 0 (stored).
export function makeZip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let off = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), crc = crc32(f.data), n = f.data.length;
    parts.push(header(30, [
      [0, 0x04034b50, 4], [4, 20, 2], [6, 0, 2], [8, 0, 2], [10, 0, 2], [12, DOS_DATE, 2],
      [14, crc, 4], [18, n, 4], [22, n, 4], [26, name.length, 2], [28, 0, 2],
    ]), name, f.data);
    central.push(header(46, [
      [0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0, 2], [10, 0, 2], [12, 0, 2], [14, DOS_DATE, 2],
      [16, crc, 4], [20, n, 4], [24, n, 4], [28, name.length, 2], [30, 0, 2], [32, 0, 2],
      [34, 0, 2], [36, 0, 2], [38, 0, 4], [42, off, 4],
    ]), name);
    off += 30 + name.length + n;
  });
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = header(22, [
    [0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2], [8, files.length, 2], [10, files.length, 2],
    [12, cdSize, 4], [16, off, 4], [20, 0, 2],
  ]);
  const out = new Uint8Array(off + cdSize + end.length);
  let p = 0;
  for (const chunk of [...parts, ...central, end]) { out.set(chunk, p); p += chunk.length; }
  return out;
}

export function palettePng(cols) {
  return new Promise((resolve, reject) => {
    const w = 120, h = 160, c = document.createElement('canvas');
    c.width = w * cols.length; c.height = h;
    const ctx = c.getContext('2d');
    cols.forEach((hex, i) => { ctx.fillStyle = hex; ctx.fillRect(i * w, 0, w, h); });
    c.toBlob(b => {
      if (!b) { reject(new Error('No se pudo generar el PNG')); return; }
      b.arrayBuffer().then(a => resolve(new Uint8Array(a)), reject);
    }, 'image/png');
  });
}

export function download(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
