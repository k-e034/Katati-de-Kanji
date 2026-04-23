import Database from 'better-sqlite3';
const db = new Database('./node_modules/@mandel59/idsdb/idsfind.db', { readonly: true });
const tables = db.prepare("SELECT name, sql FROM sqlite_master WHERE type IN ('table','view','index') ORDER BY type, name").all();
for (const t of tables) console.log(`[${t.name}]`, t.sql?.slice(0, 200));

console.log('\n=== row counts ===');
for (const t of tables.filter(x => x.sql?.startsWith('CREATE TABLE'))) {
  try {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t.name}"`).get().n;
    console.log(t.name, n);
  } catch (e) { console.log(t.name, 'err', e.message); }
}

console.log('\n=== sample idsfind rows ===');
console.log(db.prepare('SELECT * FROM idsfind WHERE UCS IN (?, ?, ?)').all('棙', '龗', '木'));

console.log('\n=== FTS match: 木 AND 戾 ===');
console.log(db.prepare("SELECT r.char, f.IDS_tokens FROM idsfind_fts f JOIN idsfind_ref r ON r.docid=f.rowid WHERE f.IDS_tokens MATCH '木 戾' LIMIT 10").all());

console.log('\n=== FTS match: 木 AND (戻 OR 戾) ===');
console.log(db.prepare("SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r ON r.docid=f.rowid WHERE f.IDS_tokens MATCH '木 (戻 OR 戾)' LIMIT 20").all());

console.log('\n=== FTS match: 雨 AND 口 AND 龍 ===');
console.log(db.prepare("SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r ON r.docid=f.rowid WHERE f.IDS_tokens MATCH '雨 口 龍' LIMIT 20").all());
