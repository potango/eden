# Garden Planner (hybrid identification)

Static app (`index.html`) plus serverless functions in `api/`:

- `api/identify.js` identifies a plant from a photo. Uses Plant.id by default; set `IDENTIFIER=claude` to use Claude vision instead (handy for comparing the two on your own photos).
- `api/care.js` asks Claude (text only, Haiku by default) for pruning/feeding tasks, priorities, hardiness zones and care notes for a species. It is only called for species not already in the app's list.
- `api/garden.js` cloud sync: your whole garden is stored as one JSON row in Postgres (Neon), protected by the same password.
- `api/_lib.js` shared helpers (password check, rate limit, validation).

Flow for a new plant: photo -> Plant.id (1 credit) -> species already known? use saved care : one cheap Claude text call -> you review and add. Species learned this way are saved in your browser, so each is looked up once.

## Deploy
1. Push this folder to GitHub, then in Vercel: Add New > Project > import it (framework preset: Other).
2. Project Settings > Environment Variables:

| Name | Required | Purpose |
| --- | --- | --- |
| `APP_PASSWORD` | yes | Passphrase the app asks for on first photo use |
| `PLANT_ID_API_KEY` | for Plant.id mode | Key from admin.kindwise.com (100 free credits at signup) |
| `ANTHROPIC_API_KEY` | yes | Care lookups (and Claude-only mode) from console.anthropic.com |
| `IDENTIFIER` | no | Set to `claude` to skip Plant.id |
| `CLAUDE_MODEL` | no | Vision model for Claude-only mode (default `claude-sonnet-5-5`) |
| `CARE_MODEL` | no | Model for care lookups (default `claude-haiku-4-5-20251001`) |

3. Add the database: in your Vercel project open the Storage tab, add **Neon** (Postgres) from the Marketplace and connect it to the project. This injects `DATABASE_URL` automatically. The sync code uses Neon's driver, so pick Neon specifically.
4. Redeploy so the functions see the variables (the table is created automatically on first use).
5. Set a monthly spend limit in the Anthropic Console.

## Using sync
- On each device, tap "Sync off (tap to enable)" at the top of the app and enter your password. The status then reads Synced, Syncing, or Offline.
- Edits save locally first and upload a moment later; the app also checks for changes from other devices when you return to it.
- Every save carries a version number. If two devices edit the same version, the second one is asked whether to keep its own copy or use the cloud copy, so nothing is overwritten silently.
- Settings > Backup downloads or restores your garden as a file. Download one before first enabling sync.
- Limits: one shared garden per password, whole-document sync (about 4 MB max, mostly photo thumbnails; move photos to Vercel Blob if you outgrow this), and species learned from photos depend on the built-in list order, so keep every device on the same deployment.

## Local testing
`npm i -g vercel`, then `vercel dev` (put the variables in a git-ignored `.env.local`).

## Protections
- API keys stay on the server.
- Shared password on every request; 20 identifications and 40 care lookups per IP per hour (in-memory, best effort).
- Photos resized in the browser (1024 px) and capped on the server.
- Model and Plant.id output is validated and trimmed before reaching the page.
- Species names sent to Claude must match a strict pattern (letters, spaces, a few symbols).

## Known limits
- Data lives in the browser (localStorage) per device. Syncing and full-size photo storage need a database and file storage.
- Species learned from photos are stored after the built-in list. Export before changing the built-in list.
- Plant.id health checks return issue names and probabilities only; treatment text could be added later.
- Plant.id's own text is licensed, so this app does not display it. Credit them if you add it.
