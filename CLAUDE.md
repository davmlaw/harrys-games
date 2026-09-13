# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A collection of Harry Lawrence's browser games. Each game lives in its own top-level directory and is a
self-contained static web page: plain HTML/CSS/JS, no framework, no package manager, no build step, no tests.
The games are independent and share no code.

- `index.html` — landing page linking to the games (sticker-sheet design, Bangers + Nunito from Google Fonts). Thumbnails live in `assets/`
  and are cropped screenshots of the games; regenerate them with headless Chromium if a game's look changes.
- `food_wars2/` — "Food Wars!" (started April 2026, Harry's first game), an idle/clicker fast-food shop tycoon for 8–10 year olds.
  Entirely in one `index.html` (CSS + ~1,800 lines of inline JS).
- `apocalypse/` — "Apocalypse" (started May 2026), a medieval tower-defence game (villagers vs. zombies). Split into `index.html`, `style.css`, `game.js`.

## Running

Open a game's `index.html` directly in a browser, or serve the repo root and browse to `/<game>/`:

```
python3 -m http.server 8000
```

There is no lint, build, or test tooling. Verify changes by loading the page and playing.

## Deployment

`.github/workflows/pages.yml` deploys the whole repo root to GitHub Pages on every push to `main` (no build step;
`.nojekyll` keeps Jekyll out of the way). New games only need a folder with an `index.html` plus a sticker on the landing page.

## Repo quirks

- Food Wars' early standalone git history (before it was moved into this repo) is kept outside the repo at
  `~/localwork/food_wars2-history.git`.
- `food_wars2/1_game_design.txt` and `2_refinements.txt` are the original prompts / design spec for Food Wars.
  Treat them as the feature requirements when extending that game.

## Architecture

### apocalypse (`game.js`)

- **Graph-based map, not a grid.** `NODES` defines fixed canvas coordinates for the spawn, junctions (`J1`–`J4`),
  cottages (`C1`–`C5`), and tower stubs (`T1`–`T6`). `ROUTES` lists the directions available at each junction,
  and `EDGES` is the drawable road list. Zombies move node-to-node along this graph.
- **Phases**: `PHASE.SIDE` → `SETUP` → `BATTLE` → `END`, tracked in the single global `state` object. The human
  picks a side; the AI does the other side's setup (`aiPlaceTowers` / `aiPlaceSigns`).
- **Zombie side controls routing via signs**: `state.signs[junctionId]` is the list of allowed directions;
  `chooseRoute` picks randomly among them (or fully random if none). Signs can be toggled mid-battle.
  `isBlocked` prunes routes leading only to destroyed targets.
- **Loop**: `loop()` runs via `requestAnimationFrame` only during `BATTLE`; `dt` is clamped to 0.1s and
  multiplied by the speed setting. `step(dt)` handles spawn/move/fire/collision, then `draw()` renders
  everything procedurally on the 900×600 canvas (no image assets).
- Tunables live in `CFG` (HP, speeds, ranges) and `SETTINGS` (read from the start-screen inputs).

### food_wars2 (`index.html`)

- **Single global state `G`** built by `initState(k)` (`k` = shop type key). Upgrade categories are stored as
  numeric levels 0–10 on `G` (`sg`, `deco`, `pg`, `mascot`, `sec`, `fr`, `app`); levels 6+ require `G.twoStory`
  (`req2s` in the upgrade table).
- **Data tables drive everything**: `TYPES` (player shop options), `RIVALS` (the 4 AI competitors), `UPG`
  (per-category level names/appeal/cost). Adding an upgrade level or shop type means editing these tables, then
  the matching `draw*` function so the shop's appearance changes.
- **Entity arrays** (`customers`, `robbers`, `cars`, `deliveryBikes`, `rats`, `barfPiles`, …) are module-level
  globals, each with a paired `updateX(dt)` / `drawX()` function. `gameLoop` calls every `update*` then `draw()`;
  `restartGame()` must reset every one of these arrays by hand.
- **Customer flow** is a shared pool: pedestrians walk the street and pick a shop weighted by appeal
  (`playerAppeal()` vs. rival appeal, which rises over time via `upgradeRival`). Reputation (`G.rep`) and
  sickness/barf reduce appeal.
- **Timed events** are countdown fields on `G` prefixed `t` (`tRobber`, `tFridge`, `tRival`, `tDisaster`,
  `tEarthquake`, …), decremented in `updateEvents`. Player-facing alerts go through `addEv`/`removeEv`
  (events panel with fix buttons), `toast`, and `badgePop`.
- **Views**: the canvas shows the street by default; `viewInside` / `viewUpstairs` switch `draw()` to
  `drawInterior` / `drawUpstairs`.
- **Rendering**: all graphics are procedural canvas drawing plus emoji; sound is synthesized with the Web Audio
  API (`beep`). UI panels (upgrades, events, header) are DOM, re-rendered on a throttle (`updateUI` every 0.2s,
  `renderUpgrades` when `upgDirty` or every 1.5s).
- Code style in this file is deliberately dense (minified-looking one-liners, short names like `dk`/`lt` for
  colour helpers). Match it rather than reformatting.
