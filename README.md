# Gridiron GM

An NFL front-office and coaching sim in the browser. Pick a team, hire scouts, coach the season one game at a time, then run the offseason: re-sign players, a 3-week free-agency window under the salary cap, and a 7-round draft.

## Run it

No build step. Either:

- Open `index.html` directly in a browser, or
- From this folder run `python3 -m http.server 8000` and open http://localhost:8000

The game autosaves in the browser (localStorage). Use the Save tab to export/import a save.

## Files

- `index.html` – page shell and styles
- `js/data.js` – generated player, contract and schedule data (from `tools/build_data.py`)
- `js/teams.js` – 32 teams, conferences, divisions, accent colors
- `js/engine.js` – game logic: ratings, game sim, standings/playoffs, scouting, draft, free agency, cap, progression
- `js/ui.js` – rendering and input handling
- `tools/build_data.py` – rebuilds `js/data.js` from nflverse CSVs

## Data sources

All from the open nflverse project (github.com/nflverse/nflverse-data releases):
- `weekly_rosters/roster_weekly_2026.csv` – rosters as of 2026 Week 11 (active + reserve lists)
- `snap_counts/snap_counts_2025.csv`, `snap_counts_2026.csv` – playing time
- `stats_player/stats_player_reg_2025.csv`, `stats_player_reg_2026.csv` – production
- `schedules/games.csv` – real 2026 schedule and results to date
- 2026 salary cap: $301.2M (NFL announcement, reported by NFL.com and ESPN)

To refresh: download those CSVs into a folder and run `python3 tools/build_data.py <csv_folder> js/data.js`.

## Known gaps

- Player ratings are this game's own estimates from snaps, stats, draft position and age. They are not official.
- Contracts are estimated (rookie scale from draft slot; veteran pay from rating and position, scaled to realistic payrolls). The public nflverse contract feed is stale (2022), so real years/amounts are not used.
- Draft prospects and scouts are fictional.
- No trades, no coaching staff beyond scouts, simplified tiebreakers, no in-game play.

## Put it on the web (GitHub Pages)

This repo deploys itself with the workflow in `.github/workflows/pages.yml`.
1. On GitHub, open **Settings → Pages** and set **Source** to **GitHub Actions**.
2. Push to `main` (or run the workflow from the Actions tab).
3. The site appears at `https://<your-username>.github.io/<repo-name>/`.

It's a static site, so any static host (Netlify, Vercel, Cloudflare Pages) works too: point it at this folder with no build command.
