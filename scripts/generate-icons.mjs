// Generate the full Tauri icon set from public/favicon.svg.
//
// Produces the PNGs plus platform containers (.ico for Windows, .icns for
// macOS) so `tauri build` works on every OS without an extra tooling step.
// Both containers embed PNG-encoded entries, which modern Windows and macOS
// both accept. Run with: node scripts/generate-icons.mjs

import sharp from "sharp";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const iconsDir = join(root, "src-tauri", "icons");
mkdirSync(iconsDir, { recursive: true });
const svg = readFileSync(join(root, "public", "favicon.svg"));

const png = (size) =>
  sharp(svg, { density: 512 }).resize(size, size, { fit: "cover" }).png().toBuffer();

function buildIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const entries = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  images.forEach((img, i) => {
    const e = entries.subarray(i * 16);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 0);
    e.writeUInt8(img.size >= 256 ? 0 : img.size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(img.buf.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += img.buf.length;
  });
  return Buffer.concat([header, entries, ...images.map((i) => i.buf)]);
}

function buildIcns(entries) {
  const parts = [];
  for (const en of entries) {
    const h = Buffer.alloc(8);
    h.write(en.type, 0, "ascii");
    h.writeUInt32BE(en.buf.length + 8, 4);
    parts.push(h, en.buf);
  }
  const body = Buffer.concat(parts);
  const head = Buffer.alloc(8);
  head.write("icns", 0, "ascii");
  head.writeUInt32BE(body.length + 8, 4);
  return Buffer.concat([head, body]);
}

const write = (name, buf) => {
  writeFileSync(join(iconsDir, name), buf);
  console.log(`  ${name}  (${(buf.length / 1024).toFixed(1)} KB)`);
};

console.log("Generating Tauri icons →", iconsDir);

// Standard Tauri PNGs
write("32x32.png", await png(32));
write("128x128.png", await png(128));
write("128x128@2x.png", await png(256));
write("icon.png", await png(1024));

// Windows Store logos (harmless extras Tauri references on Windows)
write("Square30x30Logo.png", await png(30));
write("Square44x44Logo.png", await png(44));
write("Square71x71Logo.png", await png(71));
write("Square89x89Logo.png", await png(89));
write("Square107x107Logo.png", await png(107));
write("Square142x142Logo.png", await png(142));
write("Square150x150Logo.png", await png(150));
write("Square284x284Logo.png", await png(284));
write("Square310x310Logo.png", await png(310));
write("StoreLogo.png", await png(50));

// Windows .ico (multi-size, PNG-encoded entries)
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoImgs = await Promise.all(icoSizes.map(async (s) => ({ size: s, buf: await png(s) })));
write("icon.ico", buildIco(icoImgs));

// macOS .icns (PNG-encoded entries; ic07..ic14)
const icns = [
  { type: "ic07", buf: await png(128) },
  { type: "ic08", buf: await png(256) },
  { type: "ic09", buf: await png(512) },
  { type: "ic10", buf: await png(1024) },
  { type: "ic11", buf: await png(32) },
  { type: "ic12", buf: await png(64) },
  { type: "ic13", buf: await png(256) },
  { type: "ic14", buf: await png(512) },
];
write("icon.icns", buildIcns(icns));

console.log("Done.");
