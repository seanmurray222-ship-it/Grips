// Draws the app icons as PNGs with no dependencies (signed-distance shapes, 4x4 supersampling).
// Run: npm run icons
import { mkdirSync, writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const PINE = [14, 102, 85], WHITE = [246, 247, 244], OCHRE = [210, 122, 34];

function crc32(buf) {
  let c, crc = ~0;
  for (const b of buf) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) { raw[y * (size * 4 + 1)] = 0; px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4); }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

// Coordinates are in units of the icon: 0..1. `scale` shrinks the glyph for the maskable safe zone.
function sample(x, y, { rounded, scale }) {
  // Background: full square (maskable) or rounded square (any).
  if (rounded) {
    const r = 0.22, qx = Math.abs(x - 0.5) - (0.5 - r), qy = Math.abs(y - 0.5) - (0.5 - r);
    const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
    if (d > 0) return null;
  }
  const gx = (x - 0.5) / scale, gy = (y - 0.5) / scale - 0.09;
  // Handle: a thick ring open at the top, like a gripper seen from the side.
  const rr = Math.hypot(gx, gy + 0.04);
  const ang = Math.atan2(gx, -(gy + 0.04)); // 0 = straight up
  const inRing = rr > 0.2 && rr < 0.32 && Math.abs(ang) > 0.62;
  // Two jaws rising from the ring ends.
  const jaw = (cx) => Math.abs(gx - cx) < 0.06 && gy > -0.4 && gy < -0.12;
  const capL = Math.hypot(gx + 0.155, gy + 0.4) < 0.06, capR = Math.hypot(gx - 0.155, gy + 0.4) < 0.06;
  if (inRing || jaw(-0.155) || jaw(0.155) || capL || capR) return WHITE;
  if (Math.hypot(gx, gy + 0.04) < 0.09) return OCHRE;
  return PINE;
}

function draw(size, opts) {
  const px = Buffer.alloc(size * size * 4), S = 4;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const c = sample((x + (sx + 0.5) / S) / size, (y + (sy + 0.5) / S) / size, opts);
      if (c) { r += c[0]; g += c[1]; b += c[2]; a++; }
    }
    const i = (y * size + x) * 4;
    if (a) { px[i] = r / a; px[i + 1] = g / a; px[i + 2] = b / a; }
    px[i + 3] = (a / (S * S)) * 255;
  }
  return png(size, px);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", draw(192, { rounded: true, scale: 0.92 }));
writeFileSync("public/icons/icon-512.png", draw(512, { rounded: true, scale: 0.92 }));
writeFileSync("public/icons/maskable-512.png", draw(512, { rounded: false, scale: 0.72 }));
console.log("icons written");
