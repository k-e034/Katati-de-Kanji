import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname);
const idsDb = new Database(path.join(ROOT, 'node_modules/@mandel59/idsdb/idsfind.db'), { readonly: true });

const idsfindQuery = `
with tokens as (
    select idslist.key as key0, ts0.key as key1, ts.key as key, ts.value as token
    from json_each(:idslist) as idslist
    join json_each(idslist.value) as ts0
    join json_each(ts0.value) as ts
),
decomposed as (
    select tokens.key0, tokens.key1, tokens.key,
        ifnull(idsfind.IDS_tokens, tokens.token) as tokens
    from tokens left join idsfind on idsfind.UCS = tokens.token
),
combinations as (
    select decomposed.key0, decomposed.key1, tokens, 0 as level
    from decomposed where decomposed.key = 0
    union all
    select decomposed.key0, decomposed.key1,
        combinations.tokens || ' ' || decomposed.tokens, decomposed.key
    from combinations join decomposed
    where decomposed.key0 = combinations.key0
      and decomposed.key1 = combinations.key1
      and decomposed.key = combinations.level + 1
),
patterns as (
    select combinations.key0, combinations.key1,
        group_concat('("' || replace(replace(replace(replace(tokens, ' ？ ', '" AND "'), '？ ', ''), '" AND "？', ''), ' ？', '') || '")', ' OR ') as pattern
    from combinations
    where level = (
        select max(decomposed.key) from decomposed
        where decomposed.key0 = combinations.key0
          and decomposed.key1 = combinations.key1
    )
    group by key0, key1
),
token_pattern as (
    select group_concat('(' || pattern || ')', ' AND ') as pattern
    from (
        select key0, group_concat('(' || pattern || ')', ' OR ') as pattern
        from patterns group by key0
    )
),
results as (
    select char AS UCS
    from idsfind_fts
    join token_pattern
    join idsfind_ref using (docid)
    where IDS_tokens match pattern
)
SELECT DISTINCT UCS FROM results LIMIT 60
`;
const stmt = idsDb.prepare(idsfindQuery);

// Show the actual pattern being used
const debugQuery = idsfindQuery.replace('SELECT DISTINCT UCS FROM results LIMIT 60', 'SELECT pattern FROM token_pattern');
const debugStmt = idsDb.prepare(debugQuery);

function time(label, fn) {
  const t0 = Date.now();
  const r = fn();
  console.log(`${label}: ${Date.now() - t0}ms`);
  return r;
}

// Simulate the problematic query: あめくちくちくちりゅう with no position
const amekuchi5 = [
  // あめ candidates (first 18)
  ['天', '穹', '雨', '飴', '餃', '糖', '饄', '鯇', '𥹥', '䬮', '糛', '餳', '餹', '餦', '饄'].map(k => [k]),
  // くち (first 40)
  Array.from({length: 40}, (_, i) => [['口', '咡', '扢', '杚', '矻', '烼', '堀', '崫', '淈', '欻'][i % 10]]),
  Array.from({length: 40}, (_, i) => [['口', '咡', '扢', '杚', '矻', '烼', '堀', '崫', '淈', '欻'][i % 10]]),
  Array.from({length: 40}, (_, i) => [['口', '咡', '扢', '杚', '矻', '烼', '堀', '崫', '淈', '欻'][i % 10]]),
  // りゅう (first 40)
  Array.from({length: 40}, (_, i) => [['龍', '竜', '留', '立', '流', '隆', '柳', '粒', '律', '了'][i % 10]]),
];

// Simplified inputs
console.log('--- [木] AND [戻, 戾] ---');
time('q1', () => console.log('results:', stmt.all({ idslist: JSON.stringify([[['木']], [['戻'], ['戾']]]) }).length));

console.log('\n--- [雨] AND [口] AND [口] AND [口] AND [龍] ---');
time('q2', () => console.log('results:', stmt.all({ idslist: JSON.stringify([[['雨']], [['口']], [['口']], [['口']], [['龍']]]) }).length));

console.log('\n--- 5 groups, 40 candidates each (あめくちくちくちりゅう scale) ---');
const ame = ['䬮','䭉','天','穹','糖','糛','雨','飴','餃','餦','餳','餹','饄','鯇','𥹥'].map(k => [k]);
const kuchi = ['口','孒','𠀔','𠠶','扢','𠦄','㩿','䂗','杚','𠘼','泏','矻','𡶏','𣢊','𤆞','咡','欪','胐','虳','𥐬','骨','𣢯','𧺙','䖦','堀','崫','淈','烼','𠦪','𤟎','䓛','䯇','厥','欻','詘','趉','𥆋','𦜇','𧿺','㨡'].slice(0, 40).map(k => [k]);
const ryuu = ['㐬','㕇','㕸','㙀','㙧','㚅','㝫','㡻','㦕','㧕','㩅','㳅','㶯','㻲','㽞','龍','竜','留','立','流','隆','柳','粒','律','了'].slice(0, 40).map(k => [k]);
const big5 = [ame, kuchi, kuchi, kuchi, ryuu];
time('q3', () => console.log('results:', stmt.all({ idslist: JSON.stringify(big5) }).length));

console.log('\n--- same, but reduced to top 5 candidates per reading ---');
const ame5 = ame.slice(0, 5);
const kuchi5 = kuchi.slice(0, 5);
const ryuu5 = ryuu.slice(0, 5);
time('q4', () => console.log('results:', stmt.all({ idslist: JSON.stringify([ame5, kuchi5, kuchi5, kuchi5, ryuu5]) }).length));

console.log('\n--- top 10 each ---');
const ame10 = ame.slice(0, 10);
const kuchi10 = kuchi.slice(0, 10);
const ryuu10 = ryuu.slice(0, 10);
time('q5', () => console.log('results:', stmt.all({ idslist: JSON.stringify([ame10, kuchi10, kuchi10, kuchi10, ryuu10]) }).length));

console.log('\n--- top 20 each ---');
const ame20 = ame.slice(0, 20);
const kuchi20 = kuchi.slice(0, 20);
const ryuu20 = ryuu.slice(0, 20);
time('q6', () => console.log('results:', stmt.all({ idslist: JSON.stringify([ame20, kuchi20, kuchi20, kuchi20, ryuu20]) }).length));
