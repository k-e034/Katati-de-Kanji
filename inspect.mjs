import Database from 'better-sqlite3';
const db = new Database('./node_modules/@mandel59/mojidata/dist/moji.db', { readonly: true });
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log('TABLES:', tables.map(t => t.name).join(', '));

function schema(name) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE name=?").get(name);
  console.log(`\n--- ${name} ---\n${row?.sql}`);
}

for (const t of ['ids', 'mji_reading', 'unihan_each_kJapaneseKun', 'unihan_each_kJapaneseOn', 'radicals']) {
  try { schema(t); } catch(e) { console.log(`(no ${t}: ${e.message})`); }
}

console.log('\n=== ids rows for 棙 ===');
console.log(db.prepare("SELECT * FROM ids WHERE UCS='棙'").all());

console.log('\n=== ids rows for 龗 ===');
console.log(db.prepare("SELECT * FROM ids WHERE UCS='龗'").all());

console.log('\n=== readings for 木 (via mji_reading) ===');
try { console.log(db.prepare("SELECT * FROM mji_reading WHERE 図形 LIKE '%木%' LIMIT 10").all()); } catch(e) { console.log(e.message); }

console.log('\n=== mji_reading sample any ===');
try { console.log(db.prepare("SELECT * FROM mji_reading LIMIT 5").all()); } catch(e) { console.log(e.message); }

console.log('\n=== kJapaneseKun for 雨 ===');
console.log(db.prepare("SELECT * FROM unihan_each_kJapaneseKun WHERE UCS='雨'").all());
console.log('\n=== kJapaneseKun for 木 ===');
console.log(db.prepare("SELECT * FROM unihan_each_kJapaneseKun WHERE UCS='木'").all());
console.log('\n=== kJapaneseOn for 龍 ===');
console.log(db.prepare("SELECT * FROM unihan_each_kJapaneseOn WHERE UCS='龍'").all());

console.log('\n=== ids count ===');
console.log(db.prepare("SELECT COUNT(*) AS n FROM ids").get());

console.log('\n=== Look up by IDS content containing 木 and 戻 ===');
console.log(db.prepare("SELECT * FROM ids WHERE IDS LIKE '%木%' AND IDS LIKE '%戻%' LIMIT 10").all());

console.log('\n=== unihan tables ===');
const unihanTabs = tables.filter(t => t.name.startsWith('unihan')).map(t => t.name);
console.log(unihanTabs);

console.log('\n=== joyo schema sample ===');
try { console.log(db.prepare("SELECT * FROM joyo LIMIT 3").all()); } catch(e){ console.log(e.message); }

console.log('\n=== find reading-ish tables ===');
for (const t of tables) {
  if (/read|kun|on|yomi/i.test(t.name)) console.log(t.name);
}
