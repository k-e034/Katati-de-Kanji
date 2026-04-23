import Database from 'better-sqlite3';
const db = new Database('C:\\Users\\kaiki\\AppData\\Local\\Temp\\idsfind.db', {readonly: true});

console.log("-- 鮗 direct row --");
console.log(db.prepare("SELECT UCS, IDS_tokens FROM idsfind WHERE UCS = '鮗'").all());

console.log("\n-- 魚 tokens --");
console.log(db.prepare("SELECT UCS, IDS_tokens FROM idsfind WHERE UCS = '魚'").all());

console.log("\n-- 冬 tokens --");
console.log(db.prepare("SELECT UCS, IDS_tokens FROM idsfind WHERE UCS = '冬'").all());

// Android log pattern:
const pattern = `("⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿲ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿲ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿰ ⿱ ⿱ ⿰ 丶 ㇒ ⿴ 囗 &OL3; &ol-十-1; 一 丨 &OL3; &ol-大-1; 一 人" OR "⿲ ⿱ ⿱ ⿰ 丶 ㇒ ⿴ 囗 &OL3; &ol-十-1; 一 丨 &OL3; &ol-大-1; 一 人" OR "⿰ ⿱ ⿱ ⿰ ㇒ 一 ⿴ 囗 &OL3; &ol-十-1; 一 丨 &OL3; &ol-大-1; 一 人" OR "⿲ ⿱ ⿱ ⿰ ㇒ 一 ⿴ 囗 &OL3; &ol-十-1; 一 丨 &OL3; &ol-大-1; 一 人" OR "⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿲ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿰ ⿱ ⿱ ⿰ ㇒ 一 ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" OR "⿲ ⿱ ⿱ ⿰ ㇒ 一 ⿴ 囗 &OL3; &ol-十-1; 一 丨 火") AND "⿱ 夂 ⺀"`;

console.log("\n-- full AND pattern --");
try {
  const r = db.prepare(`SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 20`).all(pattern);
  console.log("hits:", r.length, r);
} catch (e) {
  console.log("error:", e.message);
}

console.log("\n-- just 魚-hen part (the big OR) --");
const uoHen = `("⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火")`;
const r1 = db.prepare(`SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 5`).all(uoHen);
console.log("uohen hits (sample):", r1);

console.log("\n-- just 冬 part --");
const fuyu = `"⿱ 夂 ⺀"`;
const r2 = db.prepare(`SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 5`).all(fuyu);
console.log("fuyu hits (sample):", r2);

console.log("\n-- 魚-hen AND 冬 simple --");
const combo = `"⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火" AND "⿱ 夂 ⺀"`;
try {
  const r3 = db.prepare(`SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 10`).all(combo);
  console.log("combo hits:", r3);
} catch (e) { console.log("combo err:", e.message); }

console.log("\n-- with OR wrapper --");
const combo2 = `("⿰ ⿳ ⺈ ⿴ 囗 &OL3; &ol-十-1; 一 丨 火") AND "⿱ 夂 ⺀"`;
try {
  const r4 = db.prepare(`SELECT r.char FROM idsfind_fts f JOIN idsfind_ref r USING (docid) WHERE f.IDS_tokens MATCH ? LIMIT 10`).all(combo2);
  console.log("combo2 hits:", r4);
} catch (e) { console.log("combo2 err:", e.message); }
