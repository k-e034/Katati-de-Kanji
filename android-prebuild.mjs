// Prebuild asset: derive the reading index (+ joyo set) from moji.db
// and dump as JSON for the Android app to load at startup.
// Output structure mirrors what search.mjs builds at runtime.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);
const mojiDb = new Database(path.join(ROOT, 'node_modules/@mandel59/mojidata/dist/moji.db'), { readonly: true });

const kataToHira = (s) => s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

const joyoSet = new Set(mojiDb.prepare(`SELECT 漢字 FROM joyo`).all().map(r => r.漢字));

const rows = mojiDb.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs, r.読み AS yomi, m.総画数 AS strokes
  FROM mji_reading r
  JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE m.対応するUCS IS NOT NULL
`).all();

const raw = new Map();
for (const { ucs, yomi, strokes } of rows) {
  const key = kataToHira(yomi);
  if (!raw.has(key)) raw.set(key, new Map());
  const inner = raw.get(key);
  const s = strokes ?? 99;
  if (!inner.has(ucs) || inner.get(ucs) > s) inner.set(ucs, s);
}

const readings = {};
for (const [key, inner] of raw) {
  const sorted = [...inner.entries()]
    .map(([ucs, strokes]) => {
      const cp = ucs.codePointAt(0);
      const tier = joyoSet.has(ucs) ? 0 : (cp >= 0x4E00 && cp <= 0x9FFF ? 1 : 2);
      return { ucs, tier, strokes, cp };
    })
    .sort((a, b) => a.tier - b.tier || a.strokes - b.strokes || a.cp - b.cp)
    .map(x => x.ucs);
  readings[key] = sorted;
}

const out = { readings, joyo: [...joyoSet] };
const outPath = path.join(ROOT, 'android/app/src/main/assets/reading-index.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(out));

const stat = fs.statSync(outPath);
console.log(`wrote ${outPath}`);
console.log(`  readings: ${Object.keys(readings).length}`);
console.log(`  joyo: ${out.joyo.length}`);
console.log(`  size: ${(stat.size / 1024).toFixed(1)} KB`);
