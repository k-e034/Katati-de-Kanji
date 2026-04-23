import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search } from './search.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

app.get('/api/search', (req, res) => {
  const input = String(req.query.q ?? '').trim();
  if (!input) return res.json({ tokens: [], candidates: [], results: [] });
  const t0 = Date.now();
  const out = search(input);
  out.elapsedMs = Date.now() - t0;
  res.json(out);
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => {
  console.log(`[server] http://localhost:${PORT}`);
});
