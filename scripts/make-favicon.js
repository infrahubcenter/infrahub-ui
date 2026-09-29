/* eslint-disable @typescript-eslint/no-require-imports -- plain Node script, run directly via `node`, not part of the app bundle */
// One-off script: rasterizes public/favicon.svg into 16/32/48px PNGs via
// sharp (already a project dependency) and hand-packs them into a real
// multi-resolution favicon.ico (the "PNG-compressed icon" ICO variant,
// supported by every browser and Windows Vista+ -- no external ico
// library needed, the format is simple enough to write directly).
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const SIZES = [16, 32, 48];
const SVG_PATH = path.join(__dirname, "..", "public", "favicon.svg");
const OUT_PATH = path.join(__dirname, "..", "public", "favicon.ico");

async function main() {
  const svg = fs.readFileSync(SVG_PATH);
  const pngs = await Promise.all(
    SIZES.map((size) => sharp(svg, { density: 384 }).resize(size, size).png().toBuffer())
  );

  const headerSize = 6 + 16 * pngs.length;
  let offset = headerSize;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);

  const entries = [];
  SIZES.forEach((size, i) => {
    const png = pngs[i];
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size === 256 ? 0 : size, 0); // width
    entry.writeUInt8(size === 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // color count
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // planes
    entry.writeUInt16LE(32, 6); // bit count
    entry.writeUInt32LE(png.length, 8); // bytes in resource
    entry.writeUInt32LE(offset, 12); // offset
    offset += png.length;
    entries.push(entry);
  });

  fs.writeFileSync(OUT_PATH, Buffer.concat([header, ...entries, ...pngs]));
  console.log(`Wrote ${OUT_PATH} (${SIZES.join(", ")}px)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
