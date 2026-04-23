import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const mojiDb = new Database(path.join(ROOT, 'node_modules/@mandel59/mojidata/dist/moji.db'), { readonly: true });
const idsDb = new Database(path.join(ROOT, 'node_modules/@mandel59/idsdb/idsfind.db'), { readonly: true });

const kataToHira = (s) => s.replace(/[\u30a1-\u30f6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

const joyoSet = new Set(mojiDb.prepare(`SELECT 漢字 FROM joyo`).all().map(r => r.漢字));

// Build reading index: hiragana reading -> ordered UCS array.
// Source: mji_reading joined with mji for UCS mapping. Candidates are sorted
// by "commonness" heuristic: joyo first → BMP CJK → others, then stroke count.
function buildReadingIndex() {
  const rows = mojiDb.prepare(`
    SELECT DISTINCT m.対応するUCS AS ucs, r.読み AS yomi, m.総画数 AS strokes
    FROM mji_reading r
    JOIN mji m ON m.MJ文字図形名 = r.MJ文字図形名
    WHERE m.対応するUCS IS NOT NULL
  `).all();

  const index = new Map();
  for (const { ucs, yomi, strokes } of rows) {
    const key = kataToHira(yomi);
    if (!index.has(key)) index.set(key, []);
    index.get(key).push({ ucs, strokes: strokes ?? 99 });
  }
  for (const [key, arr] of index) {
    const seen = new Map();
    for (const { ucs, strokes } of arr) {
      if (!seen.has(ucs) || seen.get(ucs) > strokes) seen.set(ucs, strokes);
    }
    const sorted = [...seen.entries()]
      .map(([ucs, strokes]) => {
        const cp = ucs.codePointAt(0);
        const tier = joyoSet.has(ucs) ? 0 : (cp >= 0x4E00 && cp <= 0x9FFF ? 1 : 2);
        return { ucs, tier, strokes, cp };
      })
      .sort((a, b) => a.tier - b.tier || a.strokes - b.strokes || a.cp - b.cp)
      .map(x => x.ucs);
    index.set(key, sorted);
  }
  return index;
}

const readingIndex = buildReadingIndex();
console.log(`[search] reading index: ${readingIndex.size} distinct readings`);

// Named radicals that bundle a component kanji with an implicit position.
// (Standalone readings + generic position words like "へん" are handled separately.)
const RADICAL_NAMES = {
  'くさかんむり': { kanji: '艸', position: 'top' },
  'たけかんむり': { kanji: '竹', position: 'top' },
  'うかんむり':   { kanji: '宀', position: 'top' },
  'あめかんむり': { kanji: '雨', position: 'top' },
  'あなかんむり': { kanji: '穴', position: 'top' },
  'あみがしら':   { kanji: '网', position: 'top' },
  'なべぶた':     { kanji: '亠', position: 'top' },
  'はつがしら':   { kanji: '癶', position: 'top' },
  'ひとやね':     { kanji: '人', position: 'top' },
  'はちがしら':   { kanji: '八', position: 'top' },
  'さんずい':     { kanji: '水', position: 'left' },
  'にすい':       { kanji: '冫', position: 'left' },
  'にんべん':     { kanji: '人', position: 'left' },
  'ぎょうにんべん': { kanji: '彳', position: 'left' },
  'りっしんべん': { kanji: '心', position: 'left' },
  'てへん':       { kanji: '手', position: 'left' },
  'のぎへん':     { kanji: '禾', position: 'left' },
  'いとへん':     { kanji: '糸', position: 'left' },
  'うまへん':     { kanji: '馬', position: 'left' },
  'かねへん':     { kanji: '金', position: 'left' },
  'かいへん':     { kanji: '貝', position: 'left' },
  'ごんべん':     { kanji: '言', position: 'left' },
  'しめすへん':   { kanji: '示', position: 'left' },
  'けものへん':   { kanji: '犬', position: 'left' },
  'さかなへん':   { kanji: '魚', position: 'left' },
  'こざとへん':   { kanji: '阜', position: 'left' },
  'つちへん':     { kanji: '土', position: 'left' },
  'いしへん':     { kanji: '石', position: 'left' },
  'たまへん':     { kanji: '玉', position: 'left' },
  'ゆみへん':     { kanji: '弓', position: 'left' },
  'ころもへん':   { kanji: '衣', position: 'left' },
  'くちへん':     { kanji: '口', position: 'left' },
  'めへん':       { kanji: '目', position: 'left' },
  'みみへん':     { kanji: '耳', position: 'left' },
  'つきへん':     { kanji: '月', position: 'left' },
  'ひへん':       { kanji: '日', position: 'left' },
  'のごめへん':   { kanji: '釆', position: 'left' },
  'むしへん':     { kanji: '虫', position: 'left' },
  'とりへん':     { kanji: '酉', position: 'left' },
  'おおざと':     { kanji: '邑', position: 'right' },
  'ちから':       { kanji: '力', position: 'right' },
  'りっとう':     { kanji: '刀', position: 'right' },
  'おおがい':     { kanji: '頁', position: 'right' },
  'ふるとり':     { kanji: '隹', position: 'right' },
  'ほこづくり':   { kanji: '殳', position: 'right' },
  'おのづくり':   { kanji: '斤', position: 'right' },
  'しんにょう':   { kanji: '辵', position: 'wrapBL' },
  'しんにゅう':   { kanji: '辵', position: 'wrapBL' },
  'えんにょう':   { kanji: '廴', position: 'wrapBL' },
  'くにがまえ':   { kanji: '囗', position: 'enclose' },
  'もんがまえ':   { kanji: '門', position: 'enclose' },
  'はこがまえ':   { kanji: '匚', position: 'enclose' },
  'ぎょうがまえ': { kanji: '行', position: 'enclose' },
  'きがまえ':     { kanji: '气', position: 'wrapTL' },
  'まだれ':       { kanji: '广', position: 'wrapTL' },
  'やまいだれ':   { kanji: '疒', position: 'wrapTL' },
  'がんだれ':     { kanji: '厂', position: 'wrapTL' },
  'とだれ':       { kanji: '戸', position: 'wrapTL' },
};

// Generic position words → apply position to the preceding token.
const POSITION_WORDS = {
  'へん': 'left', 'つくり': 'right',
  'かんむり': 'top', 'あし': 'bottom',
  'にょう': 'wrapBL', 'たれ': 'wrapTL', 'かまえ': 'enclose',
};

// Position → IDS token patterns. `%X%` placeholder is substituted with the
// candidate kanji. Each inner array is one pre-tokenized alternative.
const POSITION_IDCS = {
  left:    [['⿰', '%X%', '？'], ['⿲', '%X%', '？', '？']],
  right:   [['⿰', '？', '%X%'], ['⿲', '？', '？', '%X%']],
  top:     [['⿱', '%X%', '？'], ['⿳', '%X%', '？', '？']],
  bottom:  [['⿱', '？', '%X%'], ['⿳', '？', '？', '%X%']],
  wrapTL:  [['⿸', '%X%', '？']],
  wrapBL:  [['⿺', '%X%', '？']],
  wrapTR:  [['⿹', '%X%', '？']],
  enclose: [['⿴', '%X%', '？'], ['⿵', '%X%', '？'], ['⿶', '%X%', '？'], ['⿷', '%X%', '？']],
};

// Single-char separator particles. Dropped only when they can't form a
// longer reading — e.g. in "きへんにもどる" the "に" is a separator, but in
// "おに" / "くに" the 2-char reading wins first.
const PARTICLE_CHARS = new Set(['に', 'と', 'の', 'で', 'を', 'は', 'が']);
const MAX_MATCH_LEN = 8;

// Unified left-to-right greedy longest-match tokenizer.
// Priority at each position (longest-first across dictionaries):
//   radical name > position word > multi-char reading > particle (len=1) > reading (len=1)
// Particle-before-reading at len=1 ensures "に" etc. act as separators;
// multi-char readings are checked before particles so "おに"/"くに"/"のき" survive.
function segmentInput(input) {
  const s = kataToHira(input).trim();
  const rawTokens = [];
  let i = 0;
  // True right after emitting a radical/reading/position token; false at start
  // and right after a particle separator. Used to resolve "に"/"の" ambiguity:
  // at a position that directly follows a completed token, a 2-char reading
  // starting with a particle char (e.g. "にき", "にい", "にお") is rejected in
  // favor of particle-split. At other positions the reading wins, so standalone
  // "おに" / "くに" / "のき" are kept intact.
  let lastCompleted = false;
  while (i < s.length) {
    let best = null;
    for (let len = Math.min(s.length - i, MAX_MATCH_LEN); len >= 1; len--) {
      const cand = s.slice(i, i + len);
      if (RADICAL_NAMES[cand]) {
        const { kanji, position } = RADICAL_NAMES[cand];
        best = { kind: 'kanji', length: len, value: kanji, position };
        break;
      }
      if (POSITION_WORDS[cand]) {
        best = { kind: 'position', length: len, value: POSITION_WORDS[cand] };
        break;
      }
      if (len >= 2 && readingIndex.has(cand)) {
        if (lastCompleted && PARTICLE_CHARS.has(cand[0])) continue;
        best = { kind: 'reading', length: len, value: cand };
        break;
      }
      if (len === 1) {
        if (PARTICLE_CHARS.has(cand)) { best = { kind: 'particle', length: 1 }; break; }
        if (readingIndex.has(cand)) { best = { kind: 'reading', length: 1, value: cand }; break; }
      }
    }
    if (best) {
      if (best.kind !== 'particle') { rawTokens.push(best); lastCompleted = true; }
      else { lastCompleted = false; }
      i += best.length;
    } else {
      i++;
      lastCompleted = false;
    }
  }

  // Merge trailing position markers into preceding token.
  const tokens = [];
  for (const t of rawTokens) {
    if (t.kind === 'position') {
      if (tokens.length > 0 && !tokens[tokens.length - 1].position) {
        tokens[tokens.length - 1].position = t.value;
      }
    } else {
      tokens.push(t);
    }
  }
  return tokens;
}

function applyPosition(kanji, position) {
  const patterns = position ? POSITION_IDCS[position] : null;
  if (!patterns) return [[kanji]];
  return patterns.map(p => p.map(t => t === '%X%' ? kanji : t));
}

// FTS-backed search — see idsfindQueryContext in mojidata-api-core
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
const queryStmt = idsDb.prepare(idsfindQuery);

// candidateGroups: array of AND groups. Each group is an array of alternatives
// (OR). Each alternative is an array of tokens (pre-tokenized IDS fragment).
function findContainers(candidateGroups) {
  if (candidateGroups.length === 0) return [];
  const rows = queryStmt.all({ idslist: JSON.stringify(candidateGroups) });
  return rows.map(r => r.UCS).filter(c => !c.startsWith('&'));
}

// FTS does presence-only AND (no count enforcement) and tokens get fully
// expanded to primitives (e.g. 龍 disappears, becoming its leaves). So exact
// count-filtering is unreliable. We use a soft match-bonus instead:
// for each candidate set, count direct or &ol-X-N; references in the tokens,
// clip at the required multiplicity, and sum. Higher = better match.
const idsTokensStmt = idsDb.prepare(`SELECT IDS_tokens FROM idsfind WHERE UCS = ?`);
const OL_RE = /^&ol-(.+?)-\d+;$/;

function matchBonus(ucs, candidateGroups) {
  const rows = idsTokensStmt.all(ucs);
  if (rows.length === 0) return 0;
  const requirements = new Map();
  for (const g of candidateGroups) {
    const key = g.join('|');
    const prev = requirements.get(key);
    requirements.set(key, { set: new Set(g), min: (prev?.min ?? 0) + 1 });
  }
  let best = 0;
  for (const { IDS_tokens } of rows) {
    const toks = IDS_tokens.split(' ');
    let total = 0;
    for (const { set, min } of requirements.values()) {
      let c = 0;
      for (const t of toks) {
        if (set.has(t)) c++;
        else { const m = OL_RE.exec(t); if (m && set.has(m[1])) c++; }
      }
      total += Math.min(c, min);
    }
    if (total > best) best = total;
  }
  return best;
}

// Rank results: prefer common kanji (lower Unicode code point within CJK, joyo bonus)
function rankResults(ucsList, candidateGroups) {
  return ucsList
    .map(u => {
      const cp = u.codePointAt(0);
      const isBMP = cp <= 0xFFFF;
      const isCJK = cp >= 0x4E00 && cp <= 0x9FFF;
      const inJoyo = joyoSet.has(u);
      const bonus = matchBonus(u, candidateGroups);
      // Match-bonus dominates; within same bonus, prefer joyo / BMP / CJK / lower code point.
      const score = -bonus * 10_000_000 + (inJoyo ? 0 : 1_000_000) + (isBMP ? 0 : 500_000) + (isCJK ? 0 : 100_000) + cp;
      return { ucs: u, score };
    })
    .sort((a, b) => a.score - b.score)
    .map(x => x.ucs);
}

export function search(input, opts = {}) {
  const candidatePerReading = opts.candidatePerReading ?? 8;
  const tokens = segmentInput(input);
  if (tokens.length === 0) {
    return { tokens: [], candidates: [], results: [], message: '読みを認識できませんでした' };
  }

  // Per token: resolve reading → candidate kanji list, apply position to each,
  // flatten into OR alternatives (each alternative is an array of tokens).
  const candidateGroups = [];
  const plainCandidates = []; // for ranking (bare kanji only)
  const displayTokens = [];
  for (const t of tokens) {
    const kanjis = t.kind === 'kanji' ? [t.value]
      : (readingIndex.get(t.value) ?? []).slice(0, candidatePerReading);
    plainCandidates.push(kanjis);
    displayTokens.push(t.position ? `${t.value}(${t.position})` : t.value);
    const alts = [];
    for (const k of kanjis) for (const pat of applyPosition(k, t.position)) alts.push(pat);
    candidateGroups.push(alts);
  }

  if (candidateGroups.some(g => g.length === 0)) {
    return { tokens: displayTokens, candidates: plainCandidates, results: [], message: '候補なしの読みがあります' };
  }

  const raw = findContainers(candidateGroups);
  const ranked = rankResults(raw, plainCandidates);
  return { tokens: displayTokens, candidates: plainCandidates, results: ranked };
}
