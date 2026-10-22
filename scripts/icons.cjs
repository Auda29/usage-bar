const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function png(size, color = [219, 227, 237]) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const scale = size / 32;
  const bars = [[3, 17, 6, 12], [13, 10, 6, 19], [23, 3, 6, 26]];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let coverage = 0;
    for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
      const px = (x + (sx + 0.5) / 4) / scale;
      const py = (y + (sy + 0.5) / 4) / scale;
      const inside = bars.some(([bx, by, w, h]) => {
        const cx = Math.max(bx + 1, Math.min(px, bx + w - 1));
        const cy = Math.max(by + 1, Math.min(py, by + h - 1));
        return (px - cx) ** 2 + (py - cy) ** 2 <= 1;
      });
      if (inside) coverage++;
    }
    const offset = y * (1 + size * 4) + 1 + x * 4;
    raw[offset] = color[0]; raw[offset + 1] = color[1]; raw[offset + 2] = color[2]; raw[offset + 3] = Math.round(coverage / 16 * 255);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
const assets = path.join(__dirname, '..', 'assets');
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, 'tray.png'), png(32));
for (const [variant, color] of [['dark', [36, 43, 53]], ['light', [238, 242, 247]]]) {
  fs.writeFileSync(path.join(assets, `tray-${variant}.png`), png(32, color));
  fs.writeFileSync(path.join(assets, `tray-${variant}@2x.png`), png(64, color));
}
const sizes = [16, 32, 48, 256];
const images = sizes.map((size) => png(size));
const header = Buffer.alloc(6); header.writeUInt16LE(1, 2); header.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const entries = images.map((image, index) => {
  const entry = Buffer.alloc(16); entry[0] = sizes[index] % 256; entry[1] = sizes[index] % 256;
  entry.writeUInt16LE(1, 4); entry.writeUInt16LE(32, 6); entry.writeUInt32LE(image.length, 8); entry.writeUInt32LE(offset, 12);
  offset += image.length; return entry;
});
fs.writeFileSync(path.join(assets, 'app.ico'), Buffer.concat([header, ...entries, ...images]));
console.log('Created light/dark tray icons and app.ico');
