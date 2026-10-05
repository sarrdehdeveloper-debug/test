#!/usr/bin/env node
/**
 * Regenerates the raster brand assets from brand/logo.svg (repo root) with sharp
 * (installed as a Next.js dependency). Run from frontend/:  npm run brand:assets
 *
 * Outputs
 *   public/brand/logo.svg            full logo (copy)
 *   public/brand/emblem.svg          circular emblem only (viewBox crop, no wordmark)
 *   public/brand/logo.png            512 px wide, transparent (used by emails)
 *   public/brand/logo@2x.png         1024 px wide, transparent
 *   public/brand/emblem.png          512x512 transparent
 *   public/brand/emblem-128.png      128x128 transparent (header / small UI)
 *   public/brand/og-image.png        1200x630 Open Graph card
 *   public/brand/icon-192.png        PWA icons (navy rounded square)
 *   public/brand/icon-512.png
 *   public/brand/icon-maskable-512.png
 *   src/app/icon.png                 favicon (Next.js file convention)
 *   src/app/apple-icon.png           180x180 Apple touch icon
 *   src/app/favicon.ico              16/32/48 ICO
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, "..");
const brandDir = resolve(frontend, "..", "brand");
const out = join(frontend, "public", "brand");
const appDir = join(frontend, "src", "app");
mkdirSync(out, { recursive: true });

const NAVY = "#0E1726";
const NAVY_2 = "#16223A";

const logoSvgPath = join(brandDir, "logo.svg");
const logoSvg = readFileSync(logoSvgPath, "utf8");

// The emblem (dragon, scales, "ZB") occupies x 108..589, y 0..513 of the 696.1 x 661.19 viewBox;
// the wordmark starts at y≈527. A centred 530-unit square keeps the whole circle.
const EMBLEM_VIEWBOX = "83.5 -8 530 530";
const emblemSvg = logoSvg.replace(/viewBox="[^"]*"/, `viewBox="${EMBLEM_VIEWBOX}"`);

writeFileSync(join(out, "logo.svg"), logoSvg); // not copyFileSync: keep default (world-readable) mode
writeFileSync(join(out, "emblem.svg"), emblemSvg);

const svgBuffer = (svg) => Buffer.from(svg);

async function renderSvg(svg, width, height) {
  // Render large, then downscale for clean anti-aliasing.
  return sharp(svgBuffer(svg), { density: 400 })
    .resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function background(width, height, { radius = 0, stars = true } = {}) {
  let starMarkup = "";
  if (stars) {
    let seed = 11;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < Math.round((width * height) / 9000); i++) {
      const x = (rand() * width).toFixed(1);
      const y = (rand() * height).toFixed(1);
      const r = (0.4 + rand() * 1.2).toFixed(2);
      const o = (0.25 + rand() * 0.6).toFixed(2);
      const fill = rand() > 0.7 ? "#E9C77B" : "#FBF7EF";
      starMarkup += `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" opacity="${o}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
  <defs>
    <linearGradient id="base" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${NAVY}"/>
      <stop offset="1" stop-color="${NAVY_2}"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="45%" r="50%">
      <stop offset="0" stop-color="#C78933" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#C78933" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#base)"/>
  <rect width="${width}" height="${height}" rx="${radius}" ry="${radius}" fill="url(#glow)"/>
  ${starMarkup}
</svg>`;
}

async function onBackground(size, emblemScale, { radius = 0, stars = false } = {}) {
  const inner = Math.round(size * emblemScale);
  const emblem = await renderSvg(emblemSvg, inner, inner);
  return sharp(svgBuffer(background(size, size, { radius, stars })))
    .composite([{ input: emblem, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toBuffer();
}

function ico(images) {
  // ICO with embedded PNGs (supported by all current browsers).
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  const entries = [];
  let offset = 6 + 16 * images.length;
  for (const { size, data } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

async function main() {
  const logoRatio = 661.19 / 696.1;

  // Full logo, transparent (emails use logo.png at 512 px wide).
  await sharp(await renderSvg(logoSvg, 512, Math.round(512 * logoRatio))).toFile(join(out, "logo.png"));
  await sharp(await renderSvg(logoSvg, 1024, Math.round(1024 * logoRatio))).toFile(join(out, "logo@2x.png"));

  // Emblem only, transparent.
  await sharp(await renderSvg(emblemSvg, 512, 512)).toFile(join(out, "emblem.png"));
  await sharp(await renderSvg(emblemSvg, 128, 128)).toFile(join(out, "emblem-128.png"));

  // Open Graph card: night sky + full logo.
  const ogLogoH = 540;
  const ogLogo = await renderSvg(logoSvg, Math.round(ogLogoH / logoRatio), ogLogoH);
  await sharp(svgBuffer(background(1200, 630, { stars: true })))
    .composite([{ input: ogLogo, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(join(out, "og-image.png"));

  // App icons: emblem on a navy rounded square.
  writeFileSync(join(out, "icon-192.png"), await onBackground(192, 0.86, { radius: 40 }));
  writeFileSync(join(out, "icon-512.png"), await onBackground(512, 0.86, { radius: 108 }));
  writeFileSync(join(out, "icon-maskable-512.png"), await onBackground(512, 0.66, { radius: 0 }));
  writeFileSync(join(appDir, "icon.png"), await onBackground(192, 0.9, { radius: 40 }));
  writeFileSync(join(appDir, "apple-icon.png"), await onBackground(180, 0.82, { radius: 0 }));

  const icoImages = [];
  for (const size of [16, 32, 48]) {
    icoImages.push({ size, data: await onBackground(size, 0.96, { radius: Math.round(size * 0.2) }) });
  }
  writeFileSync(join(appDir, "favicon.ico"), ico(icoImages));

  console.log("Brand assets written to public/brand and src/app.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
