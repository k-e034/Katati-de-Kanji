import { search } from './src/search.mjs';

for (const q of [
  'きへんにもどる',
  'あめくちくちくちりゅう',
  'きへんつきへん',     // negative: nonsense
  'ひへんにあき',        // 暁 = ⿰日⿱堯(尭) — test
  'さんずいにき',        // 洓? try
  'くさかんむりにいぬ',   // 茵 / 苟 etc
  'おに',                 // 鬼 — particle-に must not split
  'くに',                 // 国 / 國 / 邦
  'くにがまえにおに',      // ⿴囗鬼 = 𡆜? (test 國-style construction with 鬼)
  'のき',                 // 軒 — 2-char reading with の
]) {
  console.log(`\n>>> ${q}`);
  const out = search(q);
  console.log('tokens:', out.tokens);
  console.log('candidate counts:', out.candidates?.map(c => c.length));
  console.log('results (top 20):', out.results.slice(0, 20).join(' '));
  if (out.message) console.log('msg:', out.message);
}
