import Database from 'better-sqlite3';
const db = new Database('./node_modules/@mandel59/mojidata/dist/moji.db', { readonly: true });

console.log('=== mji schema ===');
console.log(db.prepare("SELECT sql FROM sqlite_master WHERE name='mji'").get()?.sql);

console.log('\n=== mji sample row ===');
console.log(db.prepare("SELECT * FROM mji LIMIT 3").all());

console.log('\n=== mji for 木 ===');
console.log(db.prepare("SELECT * FROM mji WHERE 対応するUCS='木'").all());

console.log('\n=== readings for 木 via mji+mji_reading ===');
console.log(db.prepare(`
  SELECT r.読み FROM mji_reading r
  JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE m.対応するUCS = '木'
`).all());

console.log('\n=== readings for 戾 ===');
console.log(db.prepare(`
  SELECT r.読み FROM mji_reading r
  JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE m.対応するUCS = '戾'
`).all());

console.log('\n=== readings for 龍 ===');
console.log(db.prepare(`
  SELECT r.読み FROM mji_reading r
  JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE m.対応するUCS = '龍'
`).all());

console.log('\n=== count: distinct readings ===');
console.log(db.prepare(`
  SELECT COUNT(DISTINCT 読み) FROM mji_reading
`).get());

// Katakana to hiragana via code shift
const kataToHira = (s) => s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

console.log('\n=== candidates for き (hiragana) ===');
const forKi = db.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs
  FROM mji_reading r JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE r.読み = 'き' AND m.対応するUCS IS NOT NULL
`).all();
console.log(`count=${forKi.length}`, forKi.slice(0, 15).map(x => x.ucs).join(','));

console.log('\n=== candidates for もどる ===');
const forModoru = db.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs
  FROM mji_reading r JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE r.読み = 'もどる' AND m.対応するUCS IS NOT NULL
`).all();
console.log(`count=${forModoru.length}`, forModoru.map(x => x.ucs).join(','));

console.log('\n=== candidates for りゅう (after converting katakana) ===');
// Try with katakana normalization
const forRyuu = db.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs
  FROM mji_reading r JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE r.読み IN ('りゅう', 'リュウ') AND m.対応するUCS IS NOT NULL
`).all();
console.log(`count=${forRyuu.length}`, forRyuu.slice(0, 15).map(x => x.ucs).join(','));

console.log('\n=== candidates for あめ ===');
const forAme = db.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs
  FROM mji_reading r JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE r.読み = 'あめ' AND m.対応するUCS IS NOT NULL
`).all();
console.log(`count=${forAme.length}`, forAme.slice(0, 15).map(x => x.ucs).join(','));

console.log('\n=== candidates for くち ===');
const forKuchi = db.prepare(`
  SELECT DISTINCT m.対応するUCS AS ucs
  FROM mji_reading r JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
  WHERE r.読み = 'くち' AND m.対応するUCS IS NOT NULL
`).all();
console.log(`count=${forKuchi.length}`, forKuchi.slice(0, 15).map(x => x.ucs).join(','));
