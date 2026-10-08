// Shared helpers (the leading underscore keeps Vercel from exposing this file as an endpoint).
const crypto = require('crypto');

const TASK_KEYS = ['heavy', 'light', 'dead', 'fert', 'div', 'cut'];
const TYPES = ['Rose', 'Perennial', 'Shrub', 'Tree', 'Herb', 'Annual', 'Bulb'];
const hits = new Map();

const RULES = `Task keys: heavy = hard pruning in late winter, light = pruning right after flowering, dead = deadheading spent blooms,
fert = spring feeding, div = dividing clumps in early fall, cut = cutting back after first frost.
- Include only tasks that genuinely benefit this species. priority: 3 = critical for plant health, 2 = recommended, 1 = optional.
- why is one short sentence about plant health. notes is 1-3 sentences of practical care advice (sun, soil, water).
- hardiness is the USDA zone range where the plant is reliably perennial. For true annuals use min 0 and max 99.
- toxicity is a short warning if the plant is toxic to people or pets, otherwise an empty string.`;

const clean = (s, n) => (typeof s === 'string' ? s.replace(/[<>]/g, '').trim().slice(0, n) : '');

function limited(ip, bucket, max) {
  const now = Date.now(), k = bucket + '|' + ip;
  const recent = (hits.get(k) || []).filter((t) => now - t < 3600_000);
  if (recent.length >= max) return true;
  recent.push(now);
  hits.set(k, recent);
  return false;
}

function passwordOk(given) {
  const want = process.env.APP_PASSWORD || '';
  if (!want || typeof given !== 'string') return false;
  const h = (x) => crypto.createHash('sha256').update(x).digest();
  return crypto.timingSafeEqual(h(given), h(want));
}

// Returns { body, zone } or null (after sending the error response).
function gate(req, res, bucket, max, methods = ['POST']) {
  if (!methods.includes(req.method)) return void res.status(405).json({ error: 'Method not allowed.' });
  if (!process.env.APP_PASSWORD) return void res.status(500).json({ error: 'Server is not configured yet. Set the environment variables in Vercel.' });
  const ip = String(req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  if (limited(ip, bucket, max)) return void res.status(429).json({ error: 'Too many requests. Try again in an hour.' });
  if (!passwordOk(req.headers['x-app-password'])) return void res.status(401).json({ error: 'Wrong password.' });
  const body = req.body || {};
  const zone = Number.isInteger(body.zone) && body.zone >= 1 && body.zone <= 13 ? body.zone : 7;
  return { body, zone };
}

async function claude({ model, system, content, max }) {
  if (!process.env.ANTHROPIC_API_KEY) throw Object.assign(new Error('no key'), { user: 'ANTHROPIC_API_KEY is not set on the server.' });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: max, system, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error('claude ' + r.status);
  const data = await r.json();
  const text = (data.content || []).map((c) => (c.type === 'text' ? c.text : '')).join('');
  return JSON.parse(text.replace(/```json|```/g, '').trim());
}

function sanitizeCare(raw) {
  raw = raw || {};
  const z = (v, d) => (Number.isFinite(+v) ? Math.max(0, Math.min(99, Math.round(+v))) : d);
  return {
    type: TYPES.includes(raw.type) ? raw.type : 'Perennial',
    hardiness: { min: z(raw.hardiness && raw.hardiness.min, 5), max: z(raw.hardiness && raw.hardiness.max, 9) },
    tasks: (Array.isArray(raw.tasks) ? raw.tasks : [])
      .filter((t) => t && TASK_KEYS.includes(t.key))
      .slice(0, 6)
      .map((t) => ({ key: t.key, priority: [1, 2, 3].includes(+t.priority) ? +t.priority : 2, why: clean(t.why, 160) })),
    notes: clean(raw.notes, 400),
    toxicity: clean(raw.toxicity, 200),
  };
}

module.exports = { gate, claude, clean, sanitizeCare, RULES };
