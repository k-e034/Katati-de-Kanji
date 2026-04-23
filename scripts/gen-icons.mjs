// Generate Android launcher icons from assets/logo.svg.
//
// Outputs:
//   android/app/src/main/res/mipmap-<density>/ic_launcher.png        (legacy square)
//   android/app/src/main/res/mipmap-<density>/ic_launcher_round.png  (legacy round, same pixels — launcher masks)
//   android/app/src/main/res/mipmap-<density>/ic_launcher_foreground.png  (adaptive foreground, glyphs only, with safe-zone padding)
//
// The SVG's cream background rect is kept for the legacy PNGs so pre-API-26 launchers see a finished square icon.
// For the adaptive foreground we strip the rect and shrink the glyphs to fit inside the 66dp safe zone of the 108dp canvas.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SVG_PATH = path.join(ROOT, 'assets', 'logo.svg');
const RES = path.join(ROOT, 'android', 'app', 'src', 'main', 'res');

// Legacy icon sizes (dp → px at each density, launcher icon is 48dp).
const LEGACY_SIZES = {
  'mipmap-mdpi': 48,
  'mipmap-hdpi': 72,
  'mipmap-xhdpi': 96,
  'mipmap-xxhdpi': 144,
  'mipmap-xxxhdpi': 192,
};
// Adaptive foreground canvas is 108dp.
const FOREGROUND_SIZES = {
  'mipmap-mdpi': 108,
  'mipmap-hdpi': 162,
  'mipmap-xhdpi': 216,
  'mipmap-xxhdpi': 324,
  'mipmap-xxxhdpi': 432,
};

const svgSource = fs.readFileSync(SVG_PATH, 'utf8');

// Build a foreground-only SVG: drop the cream rect, and shrink the glyph group
// so its content sits within the 66dp safe zone of a 108dp adaptive canvas.
// 1080 viewBox → scale by 66/108 ≈ 0.611 around the center (540,540).
function buildForegroundSvg(src) {
  // Strip the background <rect .../> tag (self-closing).
  const noRect = src.replace(/<rect[^>]*\/>/i, '');
  // Wrap all <g>...</g> groups in a scale-around-center group.
  // The SVG in assets/logo.svg has exactly two top-level <g> groups; wrap them.
  // Insert wrapper opening tag right after <svg ...>.
  const openerMatch = noRect.match(/<svg[^>]*>/i);
  if (!openerMatch) throw new Error('no <svg> tag');
  const openerEnd = openerMatch.index + openerMatch[0].length;
  const closer = noRect.lastIndexOf('</svg>');
  if (closer < 0) throw new Error('no </svg>');
  const head = noRect.slice(0, openerEnd);
  const body = noRect.slice(openerEnd, closer);
  const tail = noRect.slice(closer);
  const WRAP_OPEN = `<g transform="translate(540 540) scale(0.611) translate(-540 -540)">`;
  const WRAP_CLOSE = `</g>`;
  return head + '\n' + WRAP_OPEN + body + WRAP_CLOSE + '\n' + tail;
}

const fgSvg = buildForegroundSvg(svgSource);

async function renderPng(svgBuf, outPath, pxSize) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(svgBuf, { density: 600 })
    .resize(pxSize, pxSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toFile(outPath);
  const s = fs.statSync(outPath);
  console.log(`  ${path.relative(ROOT, outPath)}  ${pxSize}×${pxSize}  ${(s.size / 1024).toFixed(1)} KB`);
}

console.log('legacy launcher icons:');
for (const [dir, px] of Object.entries(LEGACY_SIZES)) {
  await renderPng(Buffer.from(svgSource), path.join(RES, dir, 'ic_launcher.png'), px);
  await renderPng(Buffer.from(svgSource), path.join(RES, dir, 'ic_launcher_round.png'), px);
}

console.log('adaptive icon foreground:');
for (const [dir, px] of Object.entries(FOREGROUND_SIZES)) {
  await renderPng(Buffer.from(fgSvg), path.join(RES, dir, 'ic_launcher_foreground.png'), px);
}

console.log('done.');
