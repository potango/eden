// Photo storage: uploads a full-size photo and a thumbnail to Vercel Blob (public store, unguessable URLs).
// POST { image, thumb }  (base64 JPEG)  -> { url, thumb }
// POST { action: 'delete', urls: [...] } -> { deleted }
const crypto = require('crypto');
const { gate } = require('./_lib');

const JPEG = /^\/9j\/[A-Za-z0-9+/=]+$/; // base64 of the JPEG signature FF D8 FF
const BLOB_URL = /^https:\/\/[A-Za-z0-9-]+\.public\.blob\.vercel-storage\.com\/garden\/[A-Za-z0-9._-]+\.jpg$/;
const MAX_IMAGE = 3_000_000; // base64 characters (server uploads are limited to 4.5 MB per request)
const MAX_THUMB = 250_000;

module.exports = async (req, res) => {
  const g = gate(req, res, 'photo', 120);
  if (!g) return;
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(500).json({ error: 'Photo storage is not connected. Create a Public Blob store in the Vercel Storage tab.' });
  }
  const b = g.body;
  try {
    const { put, del } = await import('@vercel/blob');
    if (b.action === 'delete') {
      const urls = (Array.isArray(b.urls) ? b.urls : []).filter((u) => typeof u === 'string' && BLOB_URL.test(u)).slice(0, 20);
      if (urls.length) await del(urls);
      return res.status(200).json({ deleted: urls.length });
    }
    const { image, thumb } = b;
    if (typeof image !== 'string' || typeof thumb !== 'string' || !JPEG.test(image) || !JPEG.test(thumb)) {
      return res.status(400).json({ error: 'Send JPEG photos as base64.' });
    }
    if (image.length > MAX_IMAGE || thumb.length > MAX_THUMB) return res.status(413).json({ error: 'Photo is too large.' });
    const id = crypto.randomBytes(16).toString('hex');
    const opts = { access: 'public', contentType: 'image/jpeg', addRandomSuffix: false, cacheControlMaxAge: 31536000 };
    const [full, small] = await Promise.all([
      put(`garden/${id}.jpg`, Buffer.from(image, 'base64'), opts),
      put(`garden/${id}-t.jpg`, Buffer.from(thumb, 'base64'), opts),
    ]);
    return res.status(200).json({ url: full.url, thumb: small.url });
  } catch (e) {
    return res.status(502).json({ error: 'Photo upload failed. Check that the Blob store is Public and connected, then try again.' });
  }
};
