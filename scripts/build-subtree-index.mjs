import crypto from 'node:crypto';
import fs from 'node:fs';
import Database from 'better-sqlite3';

const source = new Database('android/app/src/main/assets/idsfind.db', { readonly: true });
const outputPath = 'android/app/src/main/assets/subtree-index.db';
fs.rmSync(outputPath, { force: true });
const out = new Database(outputPath);
out.pragma('journal_mode = WAL');
out.pragma('synchronous = OFF');
out.pragma('temp_store = MEMORY');
out.exec(`
  CREATE TABLE ids_signature (
    UCS TEXT NOT NULL,
    signature TEXT NOT NULL
  );
  CREATE INDEX ids_signature_UCS ON ids_signature(UCS);
  CREATE TABLE subtree_ref (
    docid INTEGER PRIMARY KEY,
    char TEXT NOT NULL,
    rank_tokens TEXT NOT NULL
  );
  CREATE VIRTUAL TABLE subtree_fts USING fts4(
    content="",
    tokenize=unicode61,
    signatures
  );
`);

const binary = new Set(['⿰','⿱','⿴','⿵','⿶','⿷','⿸','⿹','⿺','⿻','⿼','⿽','⿾','⿿']);
const ternary = new Set(['⿲','⿳','&OL3;']);
const positionPrefixes = {
  '⿰': ['l', 'r'],
  '⿲': ['l', null, 'r'],
  '⿱': ['t', 'b'],
  '⿳': ['t', null, 'b'],
  '⿸': ['d', null],
  '⿺': ['n', null],
  '⿹': ['q', null],
  '⿴': ['e', null],
  '⿵': ['e', null],
  '⿶': ['e', null],
  '⿷': ['e', null],
};

function parse(tokens, index) {
  const token = tokens[index];
  const arity = binary.has(token) ? 2 : ternary.has(token) ? 3 : 0;
  let next = index + 1;
  const children = [];
  for (let i = 0; i < arity; i++) {
    const child = parse(tokens, next);
    children.push(child);
    next = child.next;
  }
  return { start: index, next, token, children };
}

function parseForest(tokens) {
  const roots = [];
  let next = 0;
  while (next < tokens.length) {
    const root = parse(tokens, next);
    roots.push(root);
    next = root.next;
  }
  return roots;
}

const hashCache = new Map();
function signature(value) {
  let sig = hashCache.get(value);
  if (!sig) {
    sig = `s${crypto.createHash('sha1').update(value).digest('hex').slice(0, 20)}`;
    hashCache.set(value, sig);
  }
  return sig;
}

function collect(node, tokens, output, positionPrefix = null) {
  const sig = signature(tokens.slice(node.start, node.next).join(' '));
  output.add(sig);
  if (positionPrefix) output.add(`${positionPrefix}${sig.slice(1)}`);
  const prefixes = positionPrefixes[node.token] ?? [];
  node.children.forEach((child, index) => collect(child, tokens, output, prefixes[index] ?? null));
}

const insertSig = out.prepare('INSERT INTO ids_signature(UCS, signature) VALUES (?, ?)');
const insertRef = out.prepare('INSERT INTO subtree_ref(docid, char, rank_tokens) VALUES (?, ?, ?)');
const insertFTS = out.prepare('INSERT INTO subtree_fts(rowid, signatures) VALUES (?, ?)');
const build = out.transaction(() => {
  let count = 0;
  for (const row of source.prepare(`
    SELECT i.rowid AS docid, i.UCS, i.IDS_tokens, r.char
    FROM idsfind i
    JOIN idsfind_ref r ON r.docid = i.rowid
  `).iterate()) {
    const tokens = row.IDS_tokens.split(' ');
    const fullSignature = signature(row.IDS_tokens);
    insertSig.run(row.UCS, fullSignature);

    const signatures = new Set();
    for (const root of parseForest(tokens)) collect(root, tokens, signatures);
    const rankTokens = tokens.flatMap(token => {
      const ol = /^&ol-(.+?)-\d+;$/.exec(token);
      if (ol) return [ol[1]];
      if (binary.has(token) || ternary.has(token) || token.startsWith('{') || token.startsWith('&OL')) return [];
      return [token];
    }).join(' ');
    insertRef.run(row.docid, row.char, rankTokens);
    insertFTS.run(row.docid, [...signatures].join(' '));

    count++;
    if (count % 20_000 === 0) console.log(`indexed ${count}`);
  }
});

const started = performance.now();
build();
out.exec(`INSERT INTO subtree_fts(subtree_fts) VALUES ('optimize');`);
out.pragma('wal_checkpoint(TRUNCATE)');
out.pragma('journal_mode = DELETE');
out.exec('VACUUM');
out.close();
source.close();
console.log(`done in ${((performance.now() - started) / 1000).toFixed(1)}s`);
console.log(`size ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(1)} MiB`);
