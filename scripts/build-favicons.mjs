// BILLOGRAPH — Génération des favicons et icônes PWA à partir du logo SVG.
// Produit :
//   public/favicon.ico            (16 + 32 + 48 px, conteneur ICO)
//   public/icons/icon-192.png     (Android / manifest)
//   public/icons/icon-512.png     (Android / manifest)
//   public/apple-touch-icon.png   (180 px, fond opaque)
//   public/site.webmanifest       (manifeste PWA)
// Usage : bun scripts/build-favicons.mjs
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const SVG_PATH = new URL("../public/logo.svg", import.meta.url).pathname;
const OUT_DIR = new URL("../public/", import.meta.url).pathname;
const ICONS_DIR = new URL("../public/icons/", import.meta.url).pathname;

async function renderPng(size) {
  const svg = await readFile(SVG_PATH);
  return sharp(svg, { density: 384 })
    .resize(size, size, { fit: "contain", background: { r: 11, g: 122, b: 107, alpha: 1 } })
    .png()
    .toBuffer();
}

// Conteneur ICO : images embarquées au format PNG (supporté par tous les
// navigateurs modernes depuis Windows Vista+ ; dégradé propre ailleurs).
function buildIco(pngBuffers) {
  const count = pngBuffers.length;
  const headerSize = 6 + count * 16;
  let totalSize = headerSize;
  for (const { data } of pngBuffers) totalSize += data.length;

  const buffer = Buffer.alloc(totalSize);
  let offset = 0;

  // ICONDIR : reserved(2) type(2)=1 count(2)
  buffer.writeUInt16LE(0, offset); offset += 2;
  buffer.writeUInt16LE(1, offset); offset += 2;
  buffer.writeUInt16LE(count, offset); offset += 2;

  // ICONDIRENTRY × n
  let dataOffset = headerSize;
  for (const { size, data } of pngBuffers) {
    buffer.writeUInt8(size === 256 ? 0 : size, offset); // width (0 = 256)
    buffer.writeUInt8(size === 256 ? 0 : size, offset + 1); // height
    buffer.writeUInt8(0, offset + 2); // palette
    buffer.writeUInt8(0, offset + 3); // reserved
    buffer.writeUInt16LE(1, offset + 4); // color planes
    buffer.writeUInt16LE(32, offset + 6); // bits per pixel
    buffer.writeUInt32LE(data.length, offset + 8); // size
    buffer.writeUInt32LE(dataOffset, offset + 12); // offset
    dataOffset += data.length;
    offset += 16;
  }

  // Données PNG
  for (const { data } of pngBuffers) {
    data.copy(buffer, offset);
    offset += data.length;
  }
  return buffer;
}

await mkdir(ICONS_DIR, { recursive: true });

const png16 = await renderPng(16);
const png32 = await renderPng(32);
const png48 = await renderPng(48);
const png180 = await renderPng(180);
const png192 = await renderPng(192);
const png512 = await renderPng(512);

await writeFile(`${OUT_DIR}favicon.ico`, buildIco([
  { size: 16, data: png16 },
  { size: 32, data: png32 },
  { size: 48, data: png48 },
]));
await writeFile(`${OUT_DIR}apple-touch-icon.png`, png180);
await writeFile(`${ICONS_DIR}icon-192.png`, png192);
await writeFile(`${ICONS_DIR}icon-512.png`, png512);

const manifest = {
  name: "BILLOGRAPH",
  short_name: "BILLOGRAPH",
  description:
    "Place de marché des entrepreneurs du Bénin et d'Afrique francophone — produits numériques et physiques en FCFA.",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#0B7A6B",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};
await writeFile(`${OUT_DIR}site.webmanifest`, JSON.stringify(manifest, null, 2) + "\n");

console.log("✅ Favicons générés : favicon.ico (16/32/48), apple-touch-icon.png (180), icons/icon-192.png, icons/icon-512.png, site.webmanifest");
