"use strict";

const CFG = {
  zombieHP: 3,
  zombieSpeed: 55,
  spawnInterval: 1.1,
  cottageHP: 2,
  towerHP: 3,
  zombieDmgVsTower: 1,
  towerRange: 120,
  towerFireRate: 1.0,
  towerDamage: 1,
  arrowSpeed: 320,
};

// Picked from the start screen.
const SETTINGS = { towers: 4, zombies: 20, cottagesToWin: 3 };

const SPEED_LEVELS = [1, 2, 3, 4, 6, 8];

const SPAWN = { id: "SPAWN", x: 60, y: 300, type: "spawn" };
const NODES = {
  SPAWN,
  J1: { id: "J1", x: 230, y: 300, type: "junction" },
  J2: { id: "J2", x: 440, y: 160, type: "junction" },
  J3: { id: "J3", x: 440, y: 440, type: "junction" },
  J4: { id: "J4", x: 440, y: 300, type: "junction" },
  C1: { id: "C1", x: 760, y: 80,  type: "cottage" },
  C2: { id: "C2", x: 760, y: 230, type: "cottage" },
  C3: { id: "C3", x: 760, y: 380, type: "cottage" },
  C4: { id: "C4", x: 760, y: 520, type: "cottage" },
  C5: { id: "C5", x: 760, y: 300, type: "cottage" },
  T1: { id: "T1", x: 230, y: 200, type: "towerStub" },
  T2: { id: "T2", x: 230, y: 400, type: "towerStub" },
  T3: { id: "T3", x: 380, y: 90,  type: "towerStub" },
  T4: { id: "T4", x: 380, y: 510, type: "towerStub" },
  T5: { id: "T5", x: 550, y: 240, type: "towerStub" },
  T6: { id: "T6", x: 550, y: 360, type: "towerStub" },
};

const ROUTES = {
  J1: [
    { dir: "up",       to: "J2" },
    { dir: "down",     to: "J3" },
    { dir: "straight", to: "J4" },
    { dir: "towerN",   to: "T1" },
    { dir: "towerS",   to: "T2" },
  ],
  J2: [
    { dir: "up",    to: "C1" },
    { dir: "down",  to: "C2" },
    { dir: "tower", to: "T3" },
    { dir: "back",  to: "J1", back: true },
  ],
  J3: [
    { dir: "up",    to: "C3" },
    { dir: "down",  to: "C4" },
    { dir: "tower", to: "T4" },
    { dir: "back",  to: "J1", back: true },
  ],
  J4: [
    { dir: "straight", to: "C5" },
    { dir: "towerN",   to: "T5" },
    { dir: "towerS",   to: "T6" },
    { dir: "back",     to: "J1", back: true },
  ],
};

const EDGES = [
  ["SPAWN", "J1"],
  ["J1", "J2"], ["J1", "J3"], ["J1", "J4"],
  ["J2", "C1"], ["J2", "C2"],
  ["J3", "C3"], ["J3", "C4"],
  ["J4", "C5"],
  ["J1", "T1"], ["J1", "T2"],
  ["J2", "T3"],
  ["J3", "T4"],
  ["J4", "T5"], ["J4", "T6"],
];

const TOWER_SPOT_IDS = ["T1", "T2", "T3", "T4", "T5", "T6"];

// Map each tower stub back to the junction it's attached to (used by reverse routing).
const STUB_PARENT = {};
for (const e of EDGES) {
  for (const id of TOWER_SPOT_IDS) {
    if (e[1] === id) STUB_PARENT[id] = e[0];
    else if (e[0] === id) STUB_PARENT[id] = e[1];
  }
}

const PHASE = { SIDE: "side", SETUP: "setup", BATTLE: "battle", END: "end" };

const state = {
  phase: PHASE.SIDE,
  player: null,
  towers: {},   // stubId -> { x, y, hp, cooldown }
  signs: {},    // junctionId -> array of allowed directions
  zombies: [],
  arrows: [],
  cottages: {},
  spawnTimer: 0,
  spawnedCount: 0,
  killedCount: 0,
  speedIndex: 0,
  speed: SPEED_LEVELS[0],
  lastTime: 0,
  result: null,
};

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

function init() {
  for (const id of Object.keys(NODES)) {
    if (NODES[id].type === "cottage") {
      state.cottages[id] = { hp: CFG.cottageHP, destroyed: false };
    }
  }
  bindUI();
  draw();
}

function bindUI() {
  document.querySelectorAll("#sideSelect button").forEach(b => {
    b.addEventListener("click", () => choosePlayer(b.dataset.side));
  });
  document.getElementById("startBattleV").addEventListener("click", startBattle);
  document.getElementById("startBattleZ").addEventListener("click", startBattle);
  document.getElementById("speedUp").addEventListener("click", () => bumpSpeed(+1));
  document.getElementById("speedDown").addEventListener("click", () => bumpSpeed(-1));
  document.getElementById("restartBtn").addEventListener("click", () => location.reload());
  canvas.addEventListener("click", onCanvasClick);
}

function readSettings() {
  const t = parseInt(document.getElementById("cfgTowers").value, 10);
  const z = parseInt(document.getElementById("cfgZombies").value, 10);
  const c = parseInt(document.getElementById("cfgCottagesWin").value, 10);
  SETTINGS.towers = clamp(t || 4, 1, TOWER_SPOT_IDS.length);
  SETTINGS.zombies = clamp(z || 20, 1, 200);
  SETTINGS.cottagesToWin = clamp(c || 3, 1, 5);
}

function bumpSpeed(delta) {
  state.speedIndex = clamp(state.speedIndex + delta, 0, SPEED_LEVELS.length - 1);
  state.speed = SPEED_LEVELS[state.speedIndex];
  document.getElementById("speedDisplay").textContent = `${state.speed}×`;
  document.getElementById("speedDown").disabled = state.speedIndex === 0;
  document.getElementById("speedUp").disabled = state.speedIndex === SPEED_LEVELS.length - 1;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function choosePlayer(side) {
  readSettings();
  state.player = side;
  state.phase = PHASE.SETUP;
  document.getElementById("sideSelect").hidden = true;
  if (side === "villager") {
    document.getElementById("setupVillager").hidden = false;
    aiPlaceSigns();
    setStatus("Click a tower stub to place an archer tower.");
  } else {
    document.getElementById("setupZombie").hidden = false;
    aiPlaceTowers();
    setStatus("Click dashed arrows to route the horde. You can keep changing them mid-battle.");
  }
  updateUI();
  draw();
}

function setStatus(t) { document.getElementById("status").textContent = t; }

function placeTower(stubId) {
  const n = NODES[stubId];
  state.towers[stubId] = { x: n.x, y: n.y, hp: CFG.towerHP, cooldown: 0 };
}

function towerCount() { return Object.keys(state.towers).length; }

function aiPlaceTowers() {
  const pool = [...TOWER_SPOT_IDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  for (const id of pool.slice(0, SETTINGS.towers)) placeTower(id);
}

function aiPlaceSigns() {
  // Easy AI: leave junctions unsigned (full random) most of the time.
  if (Math.random() < 0.4) {
    const junctions = ["J1", "J2", "J3"];
    const j = junctions[Math.floor(Math.random() * junctions.length)];
    const opts = ROUTES[j].filter(o => NODES[o.to].type !== "towerStub");
    if (opts.length) {
      state.signs[j] = [opts[Math.floor(Math.random() * opts.length)].dir];
    }
  }
}

function arrowGeometry(junctionId, dir) {
  const J = NODES[junctionId];
  const route = ROUTES[junctionId].find(r => r.dir === dir);
  if (!route) return null;
  const T = NODES[route.to];
  const dx = T.x - J.x, dy = T.y - J.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d, uy = dy / d;
  // Arrows sit ~40px from the junction along the road, but no further than ~60% of the segment.
  const offset = Math.min(40, d * 0.55);
  return { cx: J.x + ux * offset, cy: J.y + uy * offset, ux, uy, dir };
}

function allJunctionArrows() {
  const out = [];
  for (const j of Object.keys(ROUTES)) {
    if (ROUTES[j].length < 2) continue;
    for (const r of ROUTES[j]) {
      const g = arrowGeometry(j, r.dir);
      if (g) out.push({ junction: j, dir: r.dir, ...g });
    }
  }
  return out;
}

function toggleSign(junctionId, dir) {
  const cur = state.signs[junctionId] || [];
  const i = cur.indexOf(dir);
  if (i >= 0) {
    cur.splice(i, 1);
    if (cur.length === 0) delete state.signs[junctionId];
    else state.signs[junctionId] = cur;
  } else {
    cur.push(dir);
    state.signs[junctionId] = cur;
  }
  updateUI();
  draw();
}

function onCanvasClick(e) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const inPlay = state.phase === PHASE.SETUP || state.phase === PHASE.BATTLE;
  if (!inPlay) return;
  if (state.phase === PHASE.SETUP && state.player === "villager") {
    let stubId = null;
    for (const id of TOWER_SPOT_IDS) {
      const n = NODES[id];
      if (Math.hypot(n.x - x, n.y - y) < 22) { stubId = id; break; }
    }
    if (!stubId) return;
    if (state.towers[stubId]) {
      delete state.towers[stubId];
    } else if (towerCount() < SETTINGS.towers) {
      placeTower(stubId);
    }
    updateUI();
    draw();
  } else if (state.player === "zombie") {
    const arrows = allJunctionArrows();
    let best = null, bestD = 24;
    for (const a of arrows) {
      const d = Math.hypot(a.cx - x, a.cy - y);
      if (d < bestD) { best = a; bestD = d; }
    }
    if (best) toggleSign(best.junction, best.dir);
  }
}

function updateUI() {
  if (state.phase === PHASE.SETUP) {
    if (state.player === "villager") {
      document.getElementById("towersLeft").textContent =
        SETTINGS.towers - towerCount();
    }
  }
  if (state.phase === PHASE.BATTLE) {
    document.getElementById("zRemaining").textContent =
      SETTINGS.zombies - state.spawnedCount + state.zombies.length;
    document.getElementById("zKilled").textContent = state.killedCount;
    let alive = 0, dead = 0;
    for (const c of Object.values(state.cottages)) {
      if (c.destroyed) dead++; else alive++;
    }
    document.getElementById("cAlive").textContent = alive;
    document.getElementById("cDead").textContent = dead;
  }
}

function startBattle() {
  state.phase = PHASE.BATTLE;
  document.getElementById("setupVillager").hidden = true;
  document.getElementById("setupZombie").hidden = true;
  document.getElementById("battleInfo").hidden = false;
  document.getElementById("zombieLiveControls").hidden = state.player !== "zombie";
  bumpSpeed(0);
  setStatus(
    state.player === "zombie"
      ? "Battle in progress — click arrows to re-route the horde."
      : "Battle in progress…"
  );
  state.lastTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dtRaw = (now - state.lastTime) / 1000;
  state.lastTime = now;
  const dt = Math.min(dtRaw, 0.1) * state.speed;
  if (state.phase === PHASE.BATTLE) {
    step(dt);
    updateUI();
  }
  draw();
  if (state.phase === PHASE.BATTLE) {
    requestAnimationFrame(loop);
  }
}

function step(dt) {
  state.spawnTimer -= dt;
  if (state.spawnedCount < SETTINGS.zombies && state.spawnTimer <= 0) {
    spawnZombie();
    state.spawnTimer = CFG.spawnInterval;
  }
  for (const z of state.zombies) moveZombie(z, dt);
  state.zombies = state.zombies.filter(z => z.alive);
  for (const id of Object.keys(state.towers)) {
    const t = state.towers[id];
    if (t.destroyed) continue;
    t.cooldown -= dt;
    if (t.cooldown > 0) continue;
    const target = pickTarget(t);
    if (target) {
      state.arrows.push({
        x: t.x, y: t.y,
        targetId: target.id,
        damage: CFG.towerDamage,
        speed: CFG.arrowSpeed,
      });
      t.cooldown = 1 / CFG.towerFireRate;
    }
  }
  for (const a of state.arrows) moveArrow(a, dt);
  state.arrows = state.arrows.filter(a => !a.dead);
  checkEnd();
}

let nextZombieId = 1;
function spawnZombie() {
  state.zombies.push({
    id: nextZombieId++,
    hp: CFG.zombieHP,
    fromId: "SPAWN",
    toId: "J1",
    progress: 0,
    x: SPAWN.x,
    y: SPAWN.y,
    alive: true,
  });
  state.spawnedCount++;
}

function isBlocked(targetId, _seen) {
  const n = NODES[targetId];
  if (n.type === "cottage") return state.cottages[targetId].destroyed;
  if (n.type === "towerStub") {
    const tw = state.towers[targetId];
    return !tw || tw.destroyed;
  }
  if (n.type === "junction") {
    const seen = _seen || new Set();
    if (seen.has(targetId)) return false; // assume open if we hit a cycle (back-edge)
    seen.add(targetId);
    const forwards = (ROUTES[targetId] || []).filter(o => !o.back);
    if (forwards.length === 0) return true;
    return forwards.every(o => isBlocked(o.to, seen));
  }
  return false;
}

function chooseRoute(junctionId, cameFromId) {
  const opts = ROUTES[junctionId];
  const allowedDirs = state.signs[junctionId];
  let candidates = opts;
  if (allowedDirs && allowedDirs.length > 0) {
    const allowed = opts.filter(o => allowedDirs.includes(o.dir));
    if (allowed.length) candidates = allowed;
  }
  // Try progressively looser pools so we strongly prefer forward + unblocked + non-U-turn,
  // but still resolve when those aren't possible.
  const pools = [
    candidates.filter(o => !o.back && !isBlocked(o.to) && o.to !== cameFromId),
    candidates.filter(o => !o.back && !isBlocked(o.to)),
    candidates.filter(o => !isBlocked(o.to) && o.to !== cameFromId),
    candidates.filter(o => !isBlocked(o.to)),
    candidates.filter(o => o.to !== cameFromId),
    candidates,
  ];
  for (const pool of pools) {
    if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
  }
  return opts[0];
}

function moveZombie(z, dt) {
  const from = NODES[z.fromId];
  const to = NODES[z.toId];
  const dx = to.x - from.x, dy = to.y - from.y;
  const segLen = Math.hypot(dx, dy);
  z.progress += (CFG.zombieSpeed * dt) / segLen;
  if (z.progress >= 1) {
    z.x = to.x; z.y = to.y; z.progress = 0;
    const arrivedId = z.toId;
    const cameFromId = z.fromId;
    z.fromId = arrivedId;
    if (to.type === "cottage") {
      const c = state.cottages[arrivedId];
      if (c.destroyed) {
        // Turn around — head back to the junction we came from.
        z.toId = parentOf(arrivedId);
        return;
      }
      c.hp -= 1;
      if (c.hp <= 0) c.destroyed = true;
      z.alive = false;
      return;
    }
    if (to.type === "towerStub") {
      const tw = state.towers[arrivedId];
      if (tw && !tw.destroyed) {
        tw.hp -= CFG.zombieDmgVsTower;
        if (tw.hp <= 0) tw.destroyed = true;
        z.alive = false;
        return;
      }
      z.toId = parentOf(arrivedId);
      return;
    }
    const chosen = chooseRoute(arrivedId, cameFromId);
    z.toId = chosen.to;
  } else {
    z.x = from.x + dx * z.progress;
    z.y = from.y + dy * z.progress;
  }
}

function parentOf(stubOrCottageId) {
  if (STUB_PARENT[stubOrCottageId]) return STUB_PARENT[stubOrCottageId];
  // For cottages, find the junction node connected by an edge.
  for (const [a, b] of EDGES) {
    if (a === stubOrCottageId) return b;
    if (b === stubOrCottageId) return a;
  }
  return "J1";
}

function pickTarget(tower) {
  let best = null, bestD = CFG.towerRange;
  for (const z of state.zombies) {
    const d = Math.hypot(z.x - tower.x, z.y - tower.y);
    if (d < bestD) { best = z; bestD = d; }
  }
  return best;
}

function moveArrow(a, dt) {
  const z = state.zombies.find(zz => zz.id === a.targetId);
  if (!z || !z.alive) { a.dead = true; return; }
  const dx = z.x - a.x, dy = z.y - a.y;
  const d = Math.hypot(dx, dy);
  const step = a.speed * dt;
  if (step >= d) {
    z.hp -= a.damage;
    if (z.hp <= 0) {
      z.alive = false;
      state.killedCount++;
    }
    a.dead = true;
  } else {
    a.x += (dx / d) * step;
    a.y += (dy / d) * step;
  }
}

function checkEnd() {
  let dead = 0;
  for (const c of Object.values(state.cottages)) if (c.destroyed) dead++;
  if (dead >= SETTINGS.cottagesToWin) {
    return endGame("zombie", "cottages");
  }
  const towers = Object.values(state.towers);
  if (towers.length > 0 && towers.every(t => t.destroyed)) {
    return endGame("zombie", "towers");
  }
  if (state.spawnedCount >= SETTINGS.zombies && state.zombies.length === 0) {
    return endGame("villager", "zombies");
  }
}

function endGame(winner, reason) {
  state.phase = PHASE.END;
  state.result = winner;
  state.endReason = reason;
  showEnd();
}

function showEnd() {
  document.getElementById("battleInfo").hidden = true;
  document.getElementById("endInfo").hidden = false;
  const won = state.result === state.player;
  let title;
  if (state.result === "villager") {
    title = "The villagers held!";
  } else if (state.endReason === "towers") {
    title = "Every tower has fallen!";
  } else {
    title = "The horde overran the village!";
  }
  document.getElementById("endTitle").textContent = title;
  document.getElementById("endText").textContent = won ? "You won." : "You lost.";
  setStatus("Battle over.");
}

// ---------- Drawing ----------

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground();
  drawRoads();
  drawTowerSpots();
  drawCottages();
  drawSigns();
  drawTowers();
  drawArrows();
  drawZombies();
  drawSpawn();
}

function drawBackground() {
  ctx.fillStyle = "#3f5a2e";
  for (let i = 0; i < 200; i++) {
    const x = (i * 137) % canvas.width;
    const y = (i * 89) % canvas.height;
    ctx.fillRect(x, y, 2, 2);
  }
}

function drawRoads() {
  ctx.lineCap = "round";
  ctx.strokeStyle = "#7a5a30";
  ctx.lineWidth = 18;
  for (const [a, b] of EDGES) {
    const A = NODES[a], B = NODES[b];
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
  ctx.strokeStyle = "#c9a36b";
  ctx.lineWidth = 12;
  for (const [a, b] of EDGES) {
    const A = NODES[a], B = NODES[b];
    ctx.beginPath();
    ctx.moveTo(A.x, A.y);
    ctx.lineTo(B.x, B.y);
    ctx.stroke();
  }
}

function drawTowerSpots() {
  // Show empty-stub markers at all times so you can see where towers can sit.
  for (const id of TOWER_SPOT_IDS) {
    if (state.towers[id]) continue;
    const n = NODES[id];
    const isSetup = state.phase === PHASE.SETUP && state.player === "villager";
    ctx.beginPath();
    ctx.arc(n.x, n.y, 14, 0, Math.PI * 2);
    ctx.fillStyle = isSetup ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.18)";
    ctx.fill();
    ctx.strokeStyle = isSetup ? "#d9b96b" : "#5a544c";
    ctx.lineWidth = 2;
    ctx.setLineDash(isSetup ? [4, 4] : [3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawCottages() {
  for (const id of Object.keys(state.cottages)) {
    const n = NODES[id];
    const c = state.cottages[id];
    drawCottage(n.x, n.y, c.destroyed, c.hp);
  }
}

function drawCottage(x, y, destroyed, hp) {
  ctx.save();
  ctx.translate(x, y);
  if (destroyed) {
    ctx.fillStyle = "#3a2a1a";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-24, 14);
    ctx.lineTo(-18, -2);
    ctx.lineTo(-6, 8);
    ctx.lineTo(4, -4);
    ctx.lineTo(16, 6);
    ctx.lineTo(22, -1);
    ctx.lineTo(24, 14);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#8a8278";
    for (const [bx, by] of [[-14, 10], [0, 12], [12, 9], [-6, 5]]) {
      ctx.fillRect(bx, by, 6, 3);
      ctx.strokeRect(bx, by, 6, 3);
    }
  } else {
    drawBrickWall(-22, -8, 44, 24);
    ctx.fillStyle = "#9a3a2a";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-26, -8); ctx.lineTo(0, -28); ctx.lineTo(26, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-26, -8); ctx.lineTo(26, -8);
    ctx.stroke();
    ctx.fillStyle = "#3a230f";
    ctx.fillRect(-5, 2, 10, 14);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(-5, 2, 10, 14);
    ctx.fillStyle = "#8a8278";
    ctx.fillRect(10, -26, 7, 14);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(10, -26, 7, 14);
    ctx.beginPath();
    ctx.moveTo(10, -19); ctx.lineTo(17, -19);
    ctx.stroke();
    ctx.fillStyle = "rgba(230,230,230,0.75)";
    const t = performance.now() / 800;
    for (let i = 0; i < 3; i++) {
      const off = (t + i * 0.6) % 1;
      ctx.beginPath();
      ctx.arc(13.5, -28 - off * 16, 3 + off * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < CFG.cottageHP; i++) {
      const px = -22 + i * 8, py = 20;
      ctx.fillStyle = i < hp ? "#e6c300" : "#1a120a";
      ctx.fillRect(px, py, 6, 4);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, 6, 4);
    }
  }
  ctx.restore();
}

function drawBrickWall(x, y, w, h) {
  ctx.fillStyle = "#9a9286";
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = "#5a544c";
  ctx.lineWidth = 1;
  const brickH = 6, brickW = 11;
  for (let row = 0, ry = y; ry < y + h; row++, ry += brickH) {
    const offset = (row % 2) * (brickW / 2);
    ctx.beginPath();
    ctx.moveTo(x, ry);
    ctx.lineTo(x + w, ry);
    ctx.stroke();
    for (let bx = x - offset; bx < x + w; bx += brickW) {
      if (bx <= x || bx >= x + w) continue;
      ctx.beginPath();
      ctx.moveTo(bx, ry);
      ctx.lineTo(bx, Math.min(ry + brickH, y + h));
      ctx.stroke();
    }
  }
}

function drawTowers() {
  for (const id of Object.keys(state.towers)) {
    const t = state.towers[id];
    if (t.destroyed) drawTowerRubble(t.x, t.y);
    else drawTower(t.x, t.y, t.hp);
  }
}

function drawTowerRubble(x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 14, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a8278";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-16, 12);
  ctx.lineTo(-12, -2);
  ctx.lineTo(-2, 6);
  ctx.lineTo(6, -4);
  ctx.lineTo(14, 4);
  ctx.lineTo(16, 12);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (const [bx, by] of [[-10, 8], [-2, 10], [8, 7]]) {
    ctx.fillRect(bx, by, 6, 3);
    ctx.strokeRect(bx, by, 6, 3);
  }
  ctx.restore();
}

function drawTower(x, y, hp) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(0, 18, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  // Stone body
  drawBrickWall(-14, -22, 28, 40);
  // Battlements
  ctx.fillStyle = "#7a766e";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  for (let i = -14; i < 14; i += 7) {
    ctx.fillRect(i, -28, 4, 8);
    ctx.strokeRect(i, -28, 4, 8);
  }
  // Window
  ctx.fillStyle = "#222";
  ctx.fillRect(-3, -10, 6, 8);
  ctx.strokeStyle = "#000";
  ctx.strokeRect(-3, -10, 6, 8);
  // Archer dot
  ctx.fillStyle = "#3b6";
  ctx.strokeStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, -26, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // HP pips below
  for (let i = 0; i < CFG.towerHP; i++) {
    const px = -12 + i * 8, py = 22;
    ctx.fillStyle = i < hp ? "#e6c300" : "#1a120a";
    ctx.fillRect(px, py, 6, 4);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1;
    ctx.strokeRect(px, py, 6, 4);
  }
  ctx.restore();
}

function drawSigns() {
  const showAll =
    state.player === "zombie" &&
    (state.phase === PHASE.SETUP || state.phase === PHASE.BATTLE);
  if (showAll) {
    for (const a of allJunctionArrows()) {
      const placed = (state.signs[a.junction] || []).includes(a.dir);
      if (placed) continue;
      drawGroundArrow(a.cx, a.cy, a.ux, a.uy, { dashed: true });
    }
  }
  for (const j of Object.keys(state.signs)) {
    for (const dir of state.signs[j]) {
      const g = arrowGeometry(j, dir);
      if (g) drawGroundArrow(g.cx, g.cy, g.ux, g.uy, { dashed: false });
    }
  }
}

function drawGroundArrow(cx, cy, ux, uy, opts) {
  const len = 30, head = 12, halfW = 6;
  const angle = Math.atan2(uy, ux);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  if (opts.dashed) {
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    drawArrowPath(len, head, halfW);
    ctx.stroke();
    ctx.strokeStyle = "#ffd24a";
    ctx.lineWidth = 2;
    drawArrowPath(len, head, halfW);
    ctx.stroke();
    ctx.setLineDash([]);
  } else {
    ctx.fillStyle = "#ffd24a";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 2;
    drawArrowPath(len, head, halfW);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawArrowPath(len, head, halfW) {
  const tail = -len / 2;
  const tip = len / 2;
  const neck = tip - head;
  ctx.beginPath();
  ctx.moveTo(tail, -halfW * 0.5);
  ctx.lineTo(neck, -halfW * 0.5);
  ctx.lineTo(neck, -halfW);
  ctx.lineTo(tip, 0);
  ctx.lineTo(neck, halfW);
  ctx.lineTo(neck, halfW * 0.5);
  ctx.lineTo(tail, halfW * 0.5);
  ctx.lineTo(tail, -halfW * 0.5);
}

function drawArrows() {
  ctx.strokeStyle = "#222";
  ctx.lineWidth = 2;
  for (const a of state.arrows) {
    const z = state.zombies.find(zz => zz.id === a.targetId);
    if (!z) continue;
    const dx = z.x - a.x, dy = z.y - a.y;
    const d = Math.hypot(dx, dy) || 1;
    const tx = a.x - (dx / d) * 8;
    const ty = a.y - (dy / d) * 8;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(a.x, a.y);
    ctx.stroke();
  }
}

function drawZombies() {
  for (const z of state.zombies) drawZombie(z);
}

function drawZombie(z) {
  ctx.save();
  ctx.translate(z.x, z.y);
  ctx.fillStyle = "#6a3";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#000";
  ctx.fillRect(-3, -2, 2, 2);
  ctx.fillRect(1, -2, 2, 2);
  const w = 14;
  ctx.fillStyle = "#1a120a";
  ctx.fillRect(-w / 2, -14, w, 3);
  ctx.fillStyle = "#e6c300";
  ctx.fillRect(-w / 2, -14, w * (z.hp / CFG.zombieHP), 3);
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1;
  ctx.strokeRect(-w / 2 - 0.5, -14.5, w + 1, 4);
  ctx.restore();
}

function drawSpawn() {
  ctx.save();
  ctx.translate(SPAWN.x, SPAWN.y);
  ctx.fillStyle = "#222";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#6a3";
  ctx.font = "bold 14px Georgia";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("Z", 0, 0);
  ctx.restore();
}

init();
