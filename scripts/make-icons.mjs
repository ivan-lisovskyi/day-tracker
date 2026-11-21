/**
 * Generates the app's PNG icons with plain Node (no dependencies).
 * The design mirrors icons/icon.svg: a ring with a check mark on a dark background.
 *
 * Usage: npm run icons
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT_DIR = new URL('../icons/', import.meta.url);

const BG = [0x0f, 0x11, 0x15];
const ACCENT = [0x7c, 0x9c, 0xff];

// Shapes in unit coordinates (0..1), so every size renders the same picture.
const RING = { cx: 0.5, cy: 0.5, r: 0.3, width: 0.06 };
const CHECK = { points: [[0.37, 0.51], [0.465, 0.605], [0.645, 0.415]], width: 0.065 };
const SUPERSAMPLE = 4; // 4x4 samples per pixel for smooth edges

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function isInk(x, y) {
  const ringDist = Math.abs(Math.hypot(x - RING.cx, y - RING.cy) - RING.r);
  if (ringDist <= RING.width / 2) return true;

  const [p0, p1, p2] = CHECK.points;
  const checkDist = Math.min(distanceToSegment(x, y, p0, p1), distanceToSegment(x, y, p1, p2));
  return checkDist <= CHECK.width / 2;
}

function renderRgb(size) {
  const pixels = Buffer.alloc(size * size * 3);
  const step = 1 / SUPERSAMPLE;

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let hits = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const x = (px + (sx + 0.5) * step) / size;
          const y = (py + (sy + 0.5) * step) / size;
          if (isInk(x, y)) hits++;
        }
      }
      const a = hits / (SUPERSAMPLE * SUPERSAMPLE);
      const i = (py * size + px) * 3;
      for (let c = 0; c < 3; c++) pixels[i + c] = Math.round(BG[c] + (ACCENT[c] - BG[c]) * a);
    }
  }
  return pixels;
}

// ---- Minimal PNG encoder (8-bit RGB, no alpha: iOS fills transparency with black anyway) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(size, rgb) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: RGB
  // compression, filter, interlace = 0

  // Each scanline starts with filter type 0 (None).
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    rgb.copy(raw, y * (size * 3 + 1) + 1, y * size * 3, (y + 1) * size * 3);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const TARGETS = [
  ['apple-touch-icon.png', 180],
  ['icon-192.png', 192],
  ['icon-512.png', 512],
];

mkdirSync(OUT_DIR, { recursive: true });
for (const [name, size] of TARGETS) {
  writeFileSync(new URL(name, OUT_DIR), encodePng(size, renderRgb(size)));
  console.log(`icons/${name} (${size}×${size})`);
}
