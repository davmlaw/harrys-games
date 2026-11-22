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
- `survive_the_night/` — "Survive the Night" (started November 2026), a blocky side-scrolling choose-your-own-adventure:
  build a base, then survive as many nights as you can. Split into `index.html`, `style.css`, `game.js`. Harry's spec is
  `1_game_design.txt` plus his sketch `design_sketch.jpg`.
- `king_of_the_bins/` — "King of the Bins" (started November 2026), a night-time side-scrolling platformer: a raccoon
  knocks over metal bins, rummages for loot and dodges humans. Split into `index.html`, `style.css`, `game.js`.
  Harry's spec is `1_game_design.txt`.
- `mega_cookie/` — "Mega Cookie" (started November 2026), a maths cookie game (Mum vetoed pure clicking as "brain
  rot"): click the big cookie 12 times (the fun
  bit), then a quick sum appears: click the cookie with the right answer of three. Buy items (each many times) that add
  cookies per right answer, aim for THE GOLDEN COOKIE (+100 billion per answer, costs 1 trillion). Split into `index.html`,
  `style.css`, `game.js`. Harry asked for "Cookie Clicker" but that's an existing game's name, so it's called Mega Cookie.
- `brick_racers/` — "Brick Racers" (started November 2026), a top-down car racing game in a toy-brick world (never
  call it "Lego"; it's a real brand) mixed with times tables. Race 3 laps, then a Pit Stop maths quiz, then the garage to
  buy car upgrades (ending in jet engines so the car flies). Split into `index.html`, `style.css`, `game.js`.
- `park_dodgeball/` — "Park Dodgeball" (started November 2026), a top-down free-for-all dodgeball game on a park field
  (Harry and Dad play it for real). Two sticks: run, and point your hands. A flying ball that meets your hands is a catch.
  Split into `index.html`, `style.css`, `game.js`.
- `times_table_soccer/` — "Times Table Soccer" (started November 2026), top-down 6-a-side soccer mixed with times tables
  (never call it "FIFA"; it's a real brand). You pick goalie / defence / midfield / striker and control that one player. Every
  tackle, dribble, shot and save is a 5-second times-table question in slow motion. Split into `index.html`, `style.css`, `game.js`.

## Working with Harry

- These sessions are often driven by Harry himself (age 9). Keep replies short, friendly and in plain words a
  kid can follow; avoid jargon and long technical explanations.
- **Commit every version of a game**: one commit per round of feedback, as soon as it works, before starting the
  next round. Work on a feature branch (not `main`).
- **"Push to the site", "update the site", "put it online so I can play" etc. means push to `main`** (merge the
  branch into `main` and push), so GitHub Pages redeploys the live site.

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

### survive_the_night (`game.js`)

- **The story is async code.** `play()` loops `night()` → `morning()` → `day()`; branch functions (`goOutAndLook`,
  `fight`, `bombs`/`resolveBombs`, `dayChop`/`dayBuild`/`dayMine`/`dayExplore`) read top to bottom. Each cutscene
  helper (`walkTo`, `tween`, `wait`, `say`, `swing`, `hop`) returns a promise resolved by the frame loop's `tasks`
  list. `ask`/`narrate`/`menu` show DOM choice buttons and resolve with the chosen key. Death throws `GameOver`,
  caught in `play()`.
- **Two state objects**: `S` is what's on screen (camera, trees, base blocks, particles, dug cells); `G` is progress
  (night/day, wood, stone, tool tiers `axe`/`sword`, mine depth, `friends` actors).
- **Friends never pick the same option as you** in the bomb choice (`bombs()`), and their outcome follows the same rules.
- **Base** blocks come from `wantedCells(b)` (main room + extra rooms to the left); `syncCells` + `buildCells`
  animate any new/changed blocks. Bombs always destroy the whole base (`b.gone`); rebuilding is a day action
  costing `REBUILD_WOOD`/`REBUILD_STONE`, and until then nights run through `noBaseNight()`.
- **Difficulty**: `armourFor(night)` raises the zombie's armour a tier every 2 nights; the sword tier (`SWORDS`) must be
  at least the armour tier. Survivors you turn away go into `G.rejected` and may come back as the zombie (the baddie is a zombie with a bat: Harry's rule, no knives).
- **World** is a column heightmap (`gh(c)`, block size `B`=30); `oreAt(c,r)` places iron/crystal in the stone.
  `SPOTS` are the build sites. The camera zooms by `Z` and tracks `S.cam.focus` / `S.cam.focusY`.
- **Testing**: `index.html?auto=y,2,2,1` plays itself, answering each question in turn (y/n or menu number;
  falls back to option 1 when the list runs out). It ticks on a timer so headless Chromium
  `--virtual-time-budget` screenshots advance. Results vary run to run (random friends/loot/armour).

### king_of_the_bins (`game.js`)

- **Belt-scroller depth** (since v2): scenery stands on the `BACK` line; the pavement in front is a walkable strip
  `ZMIN`..`ZMAX`. Raccoon, humans, bins, lids and rubbish each have a depth `z`; the raccoon also has a jump height
  `h` (feet drawn at `z - h`). Collisions need matching depth (`|dz|` small). `drawWorld` sorts everything by `z`.
  One-way platforms (fences, cars, porches, trees) only work from the back strip (`z <= BACKSTRIP`); walk down to drop off.
- **Endless street** generated in lots (`genLot`): each lot has a house (resident `dad`/`mum`/`granny`), maybe a
  porch roof, fence, car, tree, lamp, and 1–3 bins. `plats` are one-way platforms (land from above, ↓ drops through);
  upright bins add their lids as platforms in `allPlats()`. `ensureWorld` generates ahead and prunes behind the camera.
- **Bin physics**: running into an upright bin at the same depth calls `knock()`: the bin pivots on its bottom corner (`ang`/`av`) until it
  lies flat, the lid flies off (`lids`, ends in a wobble), and rubbish spills from `binMouth()` into `junk`
  (bouncing particles the raccoon kicks around). Fallen bins are rummaged once (↓) for a roll on `LOOT_TABLE`.
- **Humans**: knocking a bin `wake()`s a sleeping house, preferring ones ahead of the raccoon → lights on → door opens → human chases with a
  timer and gives up (`st` = `out`/`chase`/`stun`/`search`/`flee`/`swing`/`home`). Stomp their heads to stun them;
  flying lids and falling bins stun them too. Neighbourhood Watch patrols (`spawnWatch`, `G.tWatch`) walk in from
  ahead. Every few bins (`G.nextVan`) an Animal Control van drives in from ahead with a faster
  `catcher` with a net. Touch (or net) = `caught()` unless Stinky Cheese / Butter Fur / Ninja Mask saves you.
- **Mobile mode** (`TOUCH`: `pointer: coarse` only, so touchscreen laptops keep the desktop layout): `body.touch` makes
  the stage fill the screen, a floating joystick (`joy`, left half) plus Jump/Rummage buttons overlay it, and portrait
  shows a turn-sideways message. Desktop layout and keyboard controls are unchanged.
- **Modes**: `title` → `play` → `caught` (cage drops) → `ending` (mugshot, stripes poof on, bars slam, `#endUI` card).
  Night lighting is an offscreen dark layer with holes cut for lamps/windows/torches (`drawLighting`).
- **Testing**: `index.html?auto` plays itself (runs right, jumps humans, rummages); `?shot=end` jumps to the ending;
  `?shot=title` holds the title; `?mobile` forces mobile mode. `share.png` (link preview, 1200×630) is rendered from `?mobile&shot=share`
  (1200×675 window, centre-cropped); regenerate it if the title art changes. These use a timer loop so headless `--virtual-time-budget` screenshots advance.

### mega_cookie (`game.js`)

- **Two modes**: clicking (`startClicking`, big `#cookie`, `perClick()` = perAns/10, `CLICKS_PER_Q` clicks) then
  quiz (`body.quizMode`). After any answer or timeout it goes back to clicking. `?quiz` starts in quiz mode.
- **Quiz**: `pickQuestion()` → `gen(stage)` builds a sum and 3 options (wrong ones are near misses). **No time limit**. Right
  first go = `earnAns()` plus +25% if within `QUICK` seconds, then back to clicking. Wrong = lose `perAns()`, the sum shows its
  answer for 2.5s, then **the same sum again** (`Q.tries`) until it's right (a quarter of the cookies for that), and it's queued in
  `G.due` to come back `REPEAT_AFTER` sums later. Only first goes count (`record` → `recordFirst`) for accuracy, levels and the report.
- **Levels** (`STAGES`, 20 of them, mastery-based, since v9): + and − to 10, to 20, ×2/×10, ×5, ÷2/5/10, two-digit +/− without
  carrying, ×3/×4, ÷3/÷4, with carrying, ×6/×8 … ×11/×12, then bigger × and ÷ (2-digit × 1-digit), then a champion mix.
  **Adding and taking away never go past two digits** (Mum: harder ones get guessed). `stagePassed` = 9 of the last 10 right
  first time, and for times/dividing stages 80% of the facts asked and none red. 20% of sums are review from earlier levels
  (`reviewStage`, weighted to the weak ones), 60% while `struggling()`. Times/dividing facts are keyed `x7_8` / `d7_8`
  (56 ÷ 7) and picked weighted by `factLevel` (none/good/some/bad).
- **Report** (`#report`, 📊 button, `?report=x|d|p`): times and dividing grids (row = table, column = 1–12) and a grown-ups
  tab (levels table, last days, facts to practise, recent mistakes, set level, clear maths progress). **Harry is protan
  (red-green) colour blind**: the grid colours (`--c-good` teal, `--c-some` amber, `--c-bad` dark crimson, `--c-none` pale
  grey) differ in lightness and blue/yellow, and each cell has a symbol (✓ ~ ✗). Check new colours with a protan simulation.
- **Accuracy**: `G.last` holds the last `ACC_N` = 10 first-go answers; `accMult()` (×2 at 100%, ×1 at 80%, ×0.15 when guessing)
  multiplies every right answer and click (`earnAns`, `perClick`), shown top right (`#acc`). Keys 1/2/3 also answer.
- `ITEMS` is the shop: base `cost`, adds `pa` per right answer. Bought many times; `price()` grows by `PRICE_UP`
  (15%) per one owned. **Harry's rules: everything is plus, never times, and cookies only come from clicking and
  right answers** (no per-second baking). Harry wants a mix: some brainless clicking, then maths. Tuned so a quick player reaches 1 trillion in roughly 40–60 minutes. `loop()` runs the timer.
- State `G` (cookies, `n` = owned counts, right, muted, won, plus the maths progress from `freshMaths()`: stage, st, f, days,
  miss, due, qn) saves to `localStorage` (`megaCookie2`), so a reload keeps your score. ↺ resets cookies but keeps the maths. `index.html` loads `style.css?v=N`/`game.js?v=N` and shows `vN` bottom-right: bump N every release
  so phones don't run a cached old version.
- **Mobile**: CSS-only (`max-width:820px` portrait and `max-height:520px` landscape): the page fits the screen and only
  the shop list scrolls. The shop lists the Golden Cookie first, then the items in price order (`renderShop`).
- `?shot=N` loads N cookies with a few items owned and made-up maths progress (`fakeMaths`, for screenshots).

### brick_racers (`game.js`)

- **Flow** (`mode`): `title` (pick Blue Bugatti / Orange McLaren / Red Ferrari) → `race` → `result` → `pit` (6 timed
  questions, `PIT_QS`/`PIT_TIME`) → `garage` (shop + times-table grid) → `race`. The first race skips the garage.
- **Track** = closed Catmull-Rom loop through `TRACKS[i].pts`, resampled every ~12px into `T.X/T.Y/T.A`. `bake()` draws the
  baseplate, road, kerbs and themed scenery once into `T.img`; the race only blits the visible part. Tracks rotate by
  `G.races`. Car progress (`prog`) comes from the nearest sample each frame (wrapped delta), so laps/positions just work and
  corner-cutting over grass counts. Off the road (`TW` half-width) = half speed unless Glider Wings.
- **Physics** (`physics`): arcade forward/lateral split with `grip`; stats from `statsFor` (player = `BASE` + upgrades,
  rivals are built from the player's own stats × `RIVAL_K`, plus a Mario-Kart style rubber band in `stepRace`: `c.rb` speed-up and extra boosts the further behind they are, none when ahead, so you need maths turbos to win). Car-car collisions are circles with mass (Crash Bumper);
  hard hits spin the lighter car and burst brick particles. Flying cars (`alt`) skip collisions and grass.
- **Maths brain**: facts are unordered pairs `fkey(a,b)` (so 3×4 fills both grid cells), b 2–12 (ones don't count). Tables
  unlock in `ORDER` (2, 10, 5, 3, 4, 11, 9, 6, 8, 12, 7) once the newest is going well. Leitner boxes (`b`, intervals `IV`
  counted in questions, `G.qn`); wrong answers drop 2 boxes and come back in 2 questions. Box ≥3 = gold ⭐ on the grid;
  a fully gold row = +100 bricks once (`G.rows`). `?` bricks on the track ask in slow-mo (`SLOWMO`); right = turbo + 5 bricks.
- `UPG` is the shop; each part is drawn on the car in `drawCar` (works for the garage preview and thumbnails too).
- State `G` saves to `localStorage` (`brickRacers1`). The title screen has a two-tap "Start again from zero" button (`#resetBtn`) that wipes it. `index.html` loads `style.css?v=N`/`game.js?v=N`: bump N each release.
- **Mobile** copies King of the Bins: `TOUCH`, floating joystick (push the way you want to go), NITRO/FLY buttons.
- **Testing**: `?auto` plays itself forever (race, pit, garage buys, next race; `&right=60` sets how many answers it gets right, results are logged to the console); `?shot=garage|race|fly|pit`, `&track=N`,
  `&mobile`. Timer loop so headless `--virtual-time-budget` screenshots advance. A full auto race is ~100–140s virtual time.

### park_dodgeball (`game.js`)

- **Controls**: touch = two floating sticks drawn on the canvas (left half `move`, right half `aim`; a tap or letting go of the aim
  stick throws; tilting the phone upright leaves full screen). Desktop = WASD/arrows, mouse points the hands, click/Space throws. `control(p)` reads them.
- **The catch rule** is `ballMeetsPlayer`: when a live ball touches a body, compare the angle to the ball with `p.hand`.
  Within `CFG.CATCH_ARC` (1/6 of a circle) and empty hands = catch (thrower loses a heart); holding a ball = block (wider `BLOCK_ARC`, ball plops back);
  otherwise a hit. Balls are only "live" for `CFG.FLY` px or until they touch the trees; dead balls get picked up by walking over them.
- `G.balls` holds only balls not in hands (a held ball is just `p.ball = true`). 3 hearts each, last one standing wins.
- **AI** (`think`): fetch a ball, pick a target, hold the ball up for a wind-up (red ring = warning), throw with aim error.
  On an incoming ball it rolls catch / dodge / "oops" from `DIFF[level]`. Tunables are in `CFG` and `DIFF`.
- **Anti-turtle rules**: a held ball pops out after `CFG.HOLD` (5s). The referee moves play in through the chalk-line
  rectangles in `ZONES` every `CFG.SHRINK_EVERY` seconds (yellow line + whistle for `CFG.WARN` seconds first); fully
  crossing the active line costs a heart and bumps you back in. AI is steered to stay inside; stray balls roll back in.
  The whole referee/shrinking thing is a menu option (`SET.shrink`, default on; `&shrink=0` to test without).
- **Trees option** (`SET.trees`): a few random trunks in `G.trees` block players and balls (leaves are drawn see-through).
- The title screen runs a 6-player AI demo behind the menu (`G.demo`). Settings save to `localStorage` (`parkDodgeball1`).
- **Testing**: `?auto` plays itself over and over (logs each result to the console), `&n=6`, `&diff=hard`, `&trees`, `&zt=6` (first line move after 6s), `&mobile`. Bump `?v=N` each release.

### times_table_soccer (`game.js`)

- **You are one player** (`G.human`, team 0 "Blues", shooting right); everyone else is AI. `FORM` is the formation; `teamThink`
  picks chasers (`CFG.PRESS` = 3 chase YOU, 2 chase a computer player) and slides the rest with the ball; `carrierAI` dribbles /
  passes / shoots; `keeperAI` guards the line. Teammates like passing to you, and PASS without the ball shouts for it (`G.call`).
- **Duels are the maths** (`startDuel(type, me, other)`, `answer(i)`): `dribble` (they touch you while you have the ball),
  `tackle` (you touch their player with the ball), `shoot` (you press shoot) and `save` (they shoot while you are the goalie).
  **No time limit** (since v3: Harry was guessing under time pressure). The game pauses completely (`G.ts` = 0) while a question
  is on screen; the `CFG.BONUS` = 3 second quick-bonus window still counts down. Right = win it; right within the bonus = SUPER SHOT, or a bigger
  boost/knock for dribbles and tackles. Wrong = lose it, so guessing never pays. The top bar shows % right this match (`G.stats`). Computer v computer contacts are a dice roll (`D.tk`) in `contacts()`.
- **Ball**: `G.ball.owner` dribbles it; free balls slow with `CFG.DRAG` and bounce off the edges (no throw-ins or corners).
  A shot is `hot`: it flies past everyone except goalies. Goals only count from a free ball crossing the line in the goal mouth.
- **Match**: `CFG.MATCH` seconds (the clock stops during questions), a draw goes to golden goal. `DIFF` tunes the other team,
  `MATES` your own computer players.
- **Maths brain** is copied from Brick Racers (`ORDER`, Leitner boxes, `nextFact`/`answerFact`), saved with the settings in `M`
  (`localStorage` `timesTableSoccer1`). A brand-new player starts from their Brick Racers tables if there are any.
- The title screen runs an AI v AI demo (`newMatch(null)`). Mobile copies Park Dodgeball (one floating stick + SHOOT/PASS buttons).
- **Testing**: `?auto` plays itself over and over (logs goals and results to the console), `&right=75` (percent of answers it
  gets right), `&pos=gk|def|mid|str`, `&diff=hard`, `&tables=6`, `&hold` (freeze on the first question, for screenshots; `&hold=5` freezes 5 seconds in, after the bonus),
  `&mobile`. Bump `?v=N` each release.

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
