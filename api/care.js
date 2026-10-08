const { gate, claude, clean, sanitizeCare, RULES } = require('./_lib');

const SYSTEM = `You are a horticulture expert. Given a plant species and the gardener's USDA zone, respond with ONLY a JSON object, no prose and no code fences:
{"recognized":boolean,"common":string,"scientific":string,
"type":"Rose"|"Perennial"|"Shrub"|"Tree"|"Herb"|"Annual"|"Bulb",
"hardiness":{"min":number,"max":number},
"tasks":[{"key":"heavy"|"light"|"dead"|"fert"|"div"|"cut","priority":1|2|3,"why":string}],
"notes":string,"toxicity":string}
The input may be a common name or a scientific name. Set recognized to false (and leave the rest empty) if it is not a specific garden plant you can identify with confidence.
${RULES}`;

module.exports = async (req, res) => {
  const g = gate(req, res, 'care', 40);
  if (!g) return;
  const sci = clean(g.body.scientific, 80), com = clean(g.body.common, 80);
  if (!/^[A-Za-z][A-Za-z .'x-]{2,79}$/.test(sci)) return res.status(400).json({ error: 'Invalid species name.' });
  try {
    const raw = await claude({
      model: process.env.CARE_MODEL || 'claude-haiku-4-5-20251001', system: SYSTEM, max: 700,
      content: `Species: ${sci}${com && com !== sci ? ` (${com})` : ''}\nGardener's USDA zone: ${g.zone}`,
    });
    const ok = raw && raw.recognized === true && clean(raw.scientific, 80);
    return res.status(200).json({ ...sanitizeCare(raw), recognized: !!ok, common: clean(raw && raw.common, 80), scientific: clean(raw && raw.scientific, 80) });
  } catch (e) {
    return res.status(502).json({ error: e.user || 'Care lookup failed.' });
  }
};
