// Génère tous les assets de marque BILLOGRAPH à partir du logo officiel uploadé :
//  - public/brand/logo-full.png        (logo complet 512px, usage UI)
//  - public/brand/logo-emblem.png      (emblème "sac + panier" 512², usage header/footer)
//  - src/app/favicon.ico               (multi-tailles 16→256)
//  - src/app/icon.png                  (192×192)
//  - src/app/apple-icon.png            (180×180)
//  - src/app/opengraph-image.png       (1200×630 — réseaux sociaux)
//  - src/app/twitter-image.png         (1200×630 — X/Twitter)
// Analyse le fichier source (bandes de contenu détectées par distance à la couleur
// de fond du coin) pour isoler l'emblème du wordmark, échantillonne les couleurs
// de marque (bleu / vert) du wordmark. Fonctionne sur fond noir OU blanc.
// Usage : bun scripts/build-brand-assets.mjs

import sharp from "sharp";
import pngToIco from "png-to-ico";
import { mkdir, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";

const ROOT = "/home/z/my-project";
const SRC = process.argv[2] ?? path.join(ROOT, "upload/billograph-logo.png");
const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");

const { data, info } = await sharp(SRC).raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const CH = info.channels;

// Couleur de fond = pixel du coin (moyenne d'une petite zone)
let bgR = 0, bgG = 0, bgB = 0, bgN = 0;
for (let y = 2; y < 10; y++) {
  for (let x = 2; x < 10; x++) {
    const i = (y * W + x) * CH;
    bgR += data[i]; bgG += data[i + 1]; bgB += data[i + 2]; bgN++;
  }
}
bgR /= bgN; bgG /= bgN; bgB /= bgN;
console.log("bgColor:", rgbToHex(bgR, bgG, bgB));

// Un pixel est « contenu » si sa distance à la couleur de fond dépasse le seuil
const DIST = 60;
const contentAt = (x, y) => {
  const i = (y * W + x) * CH;
  const dr = data[i] - bgR, dg = data[i + 1] - bgG, db = data[i + 2] - bgB;
  return dr * dr + dg * dg + db * db > DIST * DIST;
};

// Profil par ligne → bandes de contenu (emblème / wordmark / tagline)
const rowContent = new Uint32Array(H);
for (let y = 0; y < H; y++) {
  let c = 0;
  for (let x = 0; x < W; x++) if (contentAt(x, y)) c++;
  rowContent[y] = c;
}

const ROW_MIN = Math.max(8, Math.round(W * 0.008)); // nb min de px de contenu / ligne
const bands = [];
let y = 0;
while (y < H) {
  if (rowContent[y] > ROW_MIN) {
    const start = y;
    let run = 0;
    while (y < H) {
      if (rowContent[y] <= ROW_MIN) {
        run++;
        if (run >= Math.round(H * 0.02)) break;
      } else run = 0;
      y++;
    }
    bands.push([start, y - run]);
  } else y++;
}
console.log(
  "bandes:",
  bands.map(([a, b]) => `${a}-${b} (${b - a + 1}px)`),
  `ROW_MIN=${ROW_MIN}`
);

if (bands.length < 1) throw new Error("Aucune bande détectée");
const [emblemTop, emblemBottom] = bands[0];

// Profil par colonne dans la bande emblème
const COL_MIN = Math.max(3, Math.round((emblemBottom - emblemTop) * 0.01));
const colContent = new Uint32Array(W);
for (let x = 0; x < W; x++) {
  let c = 0;
  for (let y2 = emblemTop; y2 <= emblemBottom; y2++) if (contentAt(x, y2)) c++;
  colContent[x] = c;
}
let left = -1;
let right = W - 1;
for (let x = 0; x < W; x++) if (colContent[x] > COL_MIN) { left = x; break; }
for (let x = W - 1; x >= 0; x--) if (colContent[x] > COL_MIN) { right = x; break; }
console.log("emblème:", { top: emblemTop, bottom: emblemBottom, left, right });

// Couleurs du wordmark (2e bande) : bucket bleu vs vert
if (bands.length >= 2) {
  const [wt, wb] = bands[1];
  let rB = 0, gB = 0, bB = 0, nB = 0, rG = 0, gG = 0, bG = 0, nG = 0;
  for (let yy = wt; yy <= wb; yy++) {
    for (let xx = 0; xx < W; xx++) {
      const i = (yy * W + xx) * CH;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (Math.abs(r - bgR) + Math.abs(g - bgG) + Math.abs(b - bgB) < 150) continue;
      if (b > g + 30 && b > 100) { rB += r; gB += g; bB += b; nB++; }
      else if (g > b + 30 && g > 100) { rG += r; gG += g; bG += b; nG++; }
    }
  }
  if (nB) console.log("bleu wordmark:", rgbToHex(rB / nB, gB / nB, bB / nB), `(${nB}px)`);
  if (nG) console.log("vert wordmark:", rgbToHex(rG / nG, gG / nG, bG / nG), `(${nG}px)`);
}

// ---------- Génération ----------
await mkdir(path.join(ROOT, "public/brand"), { recursive: true });

const bg = { r: Math.round(bgR), g: Math.round(bgG), b: Math.round(bgB) };

// 1. Logo complet (512 de large, ratio conservé)
const full512 = await sharp(SRC).resize({ width: 512 }).png({ compressionLevel: 9 }).toBuffer();
await writeFile(path.join(ROOT, "public/brand/logo-full.png"), full512);

// 2. Emblème carré (fond de la même couleur que l'original)
const emW = right - left + 1;
const emH = emblemBottom - emblemTop + 1;
const side = Math.max(emW, emH);
const padX = Math.round((side - emW) / 2);
const padY = Math.round((side - emH) / 2);
const emblemSquare = await sharp(SRC)
  .extract({ left, top: emblemTop, width: emW, height: emH })
  .extend({
    top: padY,
    bottom: side - emH - padY,
    left: padX,
    right: side - emW - padX,
    background: bg,
  })
  .png()
  .toBuffer();

await writeFile(
  path.join(ROOT, "public/brand/logo-emblem.png"),
  await sharp(emblemSquare).resize(512, 512).png({ compressionLevel: 9 }).toBuffer()
);

// 3. Favicon ICO multi-tailles depuis l'emblème
const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuffers = await Promise.all(
  icoSizes.map((s) => sharp(emblemSquare).resize(s, s).png().toBuffer())
);
const ico = await pngToIco(icoBuffers);
await writeFile(path.join(ROOT, "src/app/favicon.ico"), ico);

// 4. icon.png 192 + apple-icon.png 180
await writeFile(
  path.join(ROOT, "src/app/icon.png"),
  await sharp(emblemSquare).resize(192, 192).png({ compressionLevel: 9 }).toBuffer()
);
await writeFile(
  path.join(ROOT, "src/app/apple-icon.png"),
  await sharp(emblemSquare).resize(180, 180).png({ compressionLevel: 9 }).toBuffer()
);

// 5. Bannière réseaux sociaux 1200×630 — logo complet centré sur le fond d'origine
const ogLogoHeight = 620;
const ogLogo = await sharp(SRC).resize({ height: ogLogoHeight }).png({ compressionLevel: 9 }).toBuffer();
const ogMeta = await sharp(ogLogo).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: bg } })
  .composite([
    {
      input: ogLogo,
      left: Math.round((1200 - ogMeta.width) / 2),
      top: Math.round((630 - ogLogoHeight) / 2),
    },
  ])
  .png({ compressionLevel: 9 })
  .toFile(path.join(ROOT, "src/app/opengraph-image.png"));
await copyFile(
  path.join(ROOT, "src/app/opengraph-image.png"),
  path.join(ROOT, "src/app/twitter-image.png")
);

console.log("✅ Assets générés : logo-full, logo-emblem, favicon.ico, icon.png, apple-icon.png, opengraph-image.png, twitter-image.png");
