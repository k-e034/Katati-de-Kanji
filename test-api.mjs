import { createNodeApp } from '@mandel59/mojidata-api/node';

const app = createNodeApp({ backend: 'better-sqlite3' });

async function call(path) {
  const res = await app.request(path);
  const json = await res.json();
  console.log(`\n=== ${path} ===`);
  console.log(JSON.stringify(json, null, 2).slice(0, 1500));
  return json;
}

// 1. Find kanji by reading き (should include 木)
await call('/api/v1/idsfind?p=mji.%E8%AA%AD%E3%81%BF&q=%E3%81%8D&limit=10');

// 2. Find kanji by reading もどる (should include 戻)
await call('/api/v1/idsfind?p=mji.%E8%AA%AD%E3%81%BF&q=%E3%82%82%E3%81%A9%E3%82%8B&limit=10');

// 3. Find kanji whose IDS contains 木 AND 戻 - should include 棙?
await call('/api/v1/idsfind?ids=%E6%9C%A8&ids=%E6%88%BB&limit=10');

// 4. Same but with 戾 variant (official IDS for 棙)
await call('/api/v1/idsfind?ids=%E6%9C%A8&ids=%E6%88%BE&limit=10');

// 5. Find 龗 via 雨 + 口 + 龍
await call('/api/v1/idsfind?ids=%E9%9B%A8&ids=%E5%8F%A3&ids=%E9%BE%8D&limit=10');

// 6. Reading あめ
await call('/api/v1/idsfind?p=mji.%E8%AA%AD%E3%81%BF&q=%E3%81%82%E3%82%81&limit=5');
