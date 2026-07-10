# Hyperbounce Leaderboard Worker

This Worker backs the public top-10 leaderboard when the game is hosted on GitHub Pages.

## Cloudflare setup

1. Create a Worker.
2. Create a D1 database and apply `schema.sql` to it.
3. Bind that database to the Worker as `HYPERBOUNCE_DB`.
4. Create a Supabase project and enable Email plus Google auth.
5. Set `ALLOWED_ORIGINS` to the exact permitted origins, separated by commas. For example: `https://raymunozeng.github.io,http://127.0.0.1:8765`.
6. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` as Worker variables.
7. Add the GitHub Pages URL to Supabase Auth redirect URLs.
8. Deploy `leaderboard-worker.js`.
9. Set `window.HYPERBOUNCE_LEADERBOARD_URL`, `window.HYPERBOUNCE_SUPABASE_URL`, and `window.HYPERBOUNCE_SUPABASE_ANON_KEY` in `site-config.js`.

For an existing database created before unique player names were introduced, first check for duplicates, then apply the migration before deploying the updated Worker:

```powershell
npx wrangler@3 d1 execute hyperbounce-leaderboard --remote --command "SELECT lower(name) AS name_key, count(*) AS total FROM hyperbounce_scores GROUP BY lower(name) HAVING count(*) > 1"
npx wrangler@3 d1 execute hyperbounce-leaderboard --remote --file workers/migrations/0002_unique_player_names.sql
npx wrangler@3 deploy
```

If the duplicate check returns rows, resolve those names before applying the unique index.

`ALLOWED_ORIGIN` remains supported for a single-origin deployment. The Supabase anon key is designed to be public; never put a service-role key in this repository or Worker configuration.

The game calls:

- `GET /leaderboard` (public board; an authenticated request also receives its private saved `playerName`)
- `POST /leaderboard` with `{ "name": "Ray", "score": 42 }` and `Authorization: Bearer <supabase-access-token>`
- `PATCH /leaderboard` with `{ "name": "Nova" }` and `Authorization: Bearer <supabase-access-token>`

Each authenticated account keeps one case-insensitively unique name and personal best. A player can rename their account without changing its score; because the leaderboard row is keyed to that account, any top-10 appearance updates immediately. D1 performs an atomic upsert, then the Worker returns the top 10 without exposing Supabase user IDs or email addresses.

The board is appropriate for a casual portfolio game: identity is verified, inputs are sanitized, and one account cannot occupy several slots. Scores still originate in browser gameplay, so a determined user can fabricate a score. A competitive leaderboard would need server-authoritative gameplay or replay validation.
