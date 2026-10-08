// Cloud sync: stores your whole garden as one JSON row in Postgres (Neon).
// GET  -> { version, data }       PUT { version, data } -> { version } or 409 with the current copy
const { neon } = require('@neondatabase/serverless');
const { gate } = require('./_lib');

const MAX_CHARS = 4_000_000; // Vercel request bodies are capped at 4.5 MB
let ready;

function init(sql) {
  if (!ready) {
    ready = sql`CREATE TABLE IF NOT EXISTS garden (
      id text PRIMARY KEY, version integer NOT NULL, data jsonb NOT NULL, updated_at timestamptz NOT NULL DEFAULT now())`;
  }
  return ready;
}

module.exports = async (req, res) => {
  const g = gate(req, res, 'sync', 600, ['GET', 'PUT']);
  if (!g) return;
  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'Database is not connected. Add Neon from the Vercel Storage tab.' });
  }
  const sql = neon(process.env.DATABASE_URL);
  try {
    await init(sql);
    if (req.method === 'GET') {
      const r = await sql`SELECT version, data FROM garden WHERE id = 'main'`;
      return res.status(200).json(r[0] ? { version: r[0].version, data: r[0].data } : { version: 0, data: null });
    }
    const { version, data } = g.body;
    if (!Number.isInteger(version) || version < 0 || !data || typeof data !== 'object' ||
        !Array.isArray(data.plants) || !Array.isArray(data.spots) || typeof data.set !== 'object') {
      return res.status(400).json({ error: 'Invalid garden data.' });
    }
    const text = JSON.stringify(data);
    if (text.length > MAX_CHARS) return res.status(413).json({ error: 'Garden data is too large.' });
    const r = version === 0
      ? await sql`INSERT INTO garden (id, version, data) VALUES ('main', 1, ${text}::jsonb) ON CONFLICT (id) DO NOTHING RETURNING version`
      : await sql`UPDATE garden SET data = ${text}::jsonb, version = version + 1, updated_at = now() WHERE id = 'main' AND version = ${version} RETURNING version`;
    if (r[0]) return res.status(200).json({ version: r[0].version });
    const cur = await sql`SELECT version, data FROM garden WHERE id = 'main'`;
    return res.status(409).json({ error: 'conflict', version: cur[0] ? cur[0].version : 0, data: cur[0] ? cur[0].data : null });
  } catch (e) {
    ready = undefined;
    return res.status(502).json({ error: 'Database error. Try again.' });
  }
};
