'use strict';
// King of the Bins — a raccoon knocks over bins in the suburbs at night.
// Everything is drawn procedurally on the 960×540 canvas; sound is synthesized with Web Audio.

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const W = 960, H = 540, GRAV = 1900;
// BACK is where houses, fences and cars stand. The pavement in front of them is a strip you can walk up and down,
// beat-'em-up style: z runs from ZMIN (back) to ZMAX (front, by the road).
const BACK = 400, ZMIN = 414, ZMAX = 520, BACKSTRIP = ZMIN + 18;
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), SHOT = Q.get('shot');

const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sgn = v => v < 0 ? -1 : 1;
const hash = n => { n = Math.sin(n * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n); };
// mobile mode is for touch-first devices only (phones/tablets); ?mobile forces it for testing
const TOUCH = Q.has('mobile') || (!Q.has('desktop') && (
  matchMedia('(pointer: coarse)').matches ||
  (matchMedia('(any-pointer: coarse)').matches && matchMedia('(hover: none)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))));      // iPads pretend to be Macs
const FONT = s => `${s}px Bangers, Impact, sans-serif`;

// ---------------------------------------------------------------- tunables
const CFG = {
  run: 270, zrun: 200, zoomMul: 1.6, jump: 760, springJump: 980,
  rummageTime: 0.85,
  binW: 40, binH: 56,
  humans: {
    dad:     { speed: 175, chase: 10, say: ['OI! My bins!', 'Get back here!', 'You bandit!', 'Not AGAIN!'] },
    mum:     { speed: 185, chase: 10, say: ['RACCOON!!', 'Shoo! SHOO!', 'Look at this mess!', 'Come here, you!'] },
    granny:  { speed: 130, chase: 9,  say: ['You rascal!', 'My begonias!', 'Wait till I catch you!', 'Cheeky bandit!'] },
    watch:   { speed: 190, chase: 11, say: ['Neighbourhood Watch!', 'Stop right there!', 'I see you, bandit!', 'Halt!'] },
    catcher: { speed: 235, chase: 16, say: ['Animal Control!', 'Got a live one!', 'Come quietly!', "You're nicked!"] },
  },
};

const LOOT = {
  pizza:    { n: 'Pizza Crust', k: 'food', p: 20 },
  fish:     { n: 'Fish Bones', k: 'food', p: 25 },
  donut:    { n: 'Old Donut', k: 'food', p: 30 },
  chicken:  { n: 'Chicken Leg', k: 'food', p: 35 },
  apple:    { n: 'Apple Core', k: 'food', p: 15 },
  sandwich: { n: 'Soggy Sandwich', k: 'food', p: 25 },
  sock:     { n: 'Smelly Sock...', k: 'food', p: 5 },
  coin:     { n: 'Shiny Coin', k: 'treasure', p: 60 },
  spoon:    { n: 'Silver Spoon', k: 'treasure', p: 80 },
  ring:     { n: 'Lost Ring!', k: 'treasure', p: 150 },
  watch:    { n: 'Gold Watch!', k: 'treasure', p: 200 },
  gem:      { n: 'DIAMOND!!', k: 'treasure', p: 400 },
  zoom:     { n: 'Zoom Juice', k: 'power', p: 10, d: 8, desc: 'Super speed!' },
  spring:   { n: 'Springy Shoe', k: 'power', p: 10, d: 10, desc: 'Mega jumps!' },
  stink:    { n: 'Stinky Cheese', k: 'power', p: 10, d: 9, desc: "Humans can't grab you!" },
  ninja:    { n: 'Ninja Mask', k: 'power', p: 10, d: 7, desc: "Humans can't see you!" },
  butter:   { n: 'Butter Fur', k: 'power', p: 10, desc: 'Slip free once!' },
};
const LOOT_TABLE = [
  ['pizza', 10], ['fish', 10], ['donut', 8], ['chicken', 7], ['apple', 8], ['sandwich', 8], ['sock', 4],
  ['coin', 9], ['spoon', 6], ['ring', 4], ['watch', 3], ['gem', 1],
  ['zoom', 5], ['spring', 5], ['stink', 4], ['ninja', 4], ['butter', 4],
];
const GOLD_TABLE = [['ring', 5], ['watch', 5], ['gem', 3], ['butter', 2], ['spring', 2]];
function roll(table) {
  let t = table.reduce((s, e) => s + e[1], 0) * Math.random();
  for (const [k, w] of table) { if ((t -= w) < 0) return k; }
  return table[0][0];
}

const RANKS = [[0, 'Bin Rookie'], [5, 'Trash Panda'], [12, 'Garbage Goblin'], [20, 'Bin Baron'], [30, 'Rubbish Prince'], [42, 'KING OF THE BINS']];
const rankIdx = n => { let r = 0; RANKS.forEach((e, i) => { if (n >= e[0]) r = i; }); return r; };

const HOUSE_COLS = ['#4d5b80', '#6d4f63', '#4f6b5c', '#7a6a4a', '#5e5585', '#7a5146', '#4a6572'];
const CAR_COLS = ['#7a2f35', '#2f4f7a', '#4a6a3a', '#6a6a72', '#8a6a2a'];
const PJ = { dad: '#3c5fa8', mum: '#d46aa0', granny: '#7d4fa0', catcher: '#a08a4a', watch: '#d8e040' };

// ---------------------------------------------------------------- sound
let AC = null, muted = false;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(f, d, type = 'sine', v = 0.15, f2 = 0, delay = 0) {
  const a = ac(); if (!a || muted) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d + 0.02);
}
let noiseBuf = null;
function noise(d, v = 0.2, f = 2000, q = 1, delay = 0) {
  const a = ac(); if (!a || muted) return;
  if (!noiseBuf) {
    noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
    const ch = noiseBuf.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  const t = a.currentTime + delay, s = a.createBufferSource(), fl = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; fl.type = 'bandpass'; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  s.connect(fl).connect(g).connect(a.destination); s.start(t, Math.random() * 0.5); s.stop(t + d + 0.02);
}
const SFX = {
  clang(big = 1) {
    const k = rand(0.9, 1.1);
    [[523, .5], [1187, .35], [1731, .25], [2410, .15], [3170, .1]].forEach(([f, v]) => tone(f * k, rand(.4, .9) * big, 'sine', v * .25 * big));
    noise(.25, .35 * big, 3000, .7);
  },
  tick(v = 1) { tone(rand(1500, 1800), .12, 'sine', .07 * v); tone(rand(2600, 2900), .08, 'sine', .04 * v); },
  thud() { tone(140, .18, 'sine', .25, 60); noise(.12, .2, 400, 1); },
  jump() { tone(330, .16, 'square', .05, 660); },
  spring() { tone(220, .35, 'sine', .14, 990); tone(300, .3, 'triangle', .06, 1200, .03); },
  rustle() { noise(.09, .12, rand(1500, 4000), 2); },
  food() { tone(520, .1, 'square', .06); tone(780, .14, 'square', .06, 0, .08); },
  treasure() { [988, 1319, 1568, 1976].forEach((f, i) => tone(f, .22, 'triangle', .1, 0, i * .07)); },
  power() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, .16, 'square', .06, 0, i * .05)); },
  stomp() { tone(180, .2, 'square', .1, 520); noise(.08, .15, 900, 1); },
  huh() { tone(260, .25, 'triangle', .1, 340); },
  door() { tone(120, .2, 'sawtooth', .05, 90); noise(.15, .1, 600, 2); },
  siren() { for (let i = 0; i < 4; i++) { tone(700, .25, 'square', .035, 0, i * .5); tone(950, .25, 'square', .035, 0, i * .5 + .25); } },
  swish() { noise(.18, .2, 1200, .8); },
  slip() { tone(800, .3, 'sine', .1, 200); },
  cage() { tone(90, .8, 'sawtooth', .12, 50); SFX.clang(1.4); },
  bars() { tone(70, 1, 'sawtooth', .16, 40); SFX.clang(1.6); noise(.4, .4, 500, .6); },
  poof() { noise(.35, .3, 900, .5); tone(600, .25, 'sine', .08, 150); },
  rank() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .2, 'square', .07, 0, i * .09)); },
  sad() { [392, 370, 349, 330].forEach((f, i) => tone(f, i === 3 ? .9 : .35, 'sawtooth', .07, i === 3 ? 300 : 0, i * .38)); },
};
function sfx(n, ...a) { try { SFX[n](...a); } catch (e) { } }

// ---------------------------------------------------------------- input
const keys = {}, pressed = {};
const KEYMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  Space: 'jump', KeyZ: 'jump', KeyK: 'jump', KeyX: 'act', KeyE: 'act', KeyJ: 'act', Enter: 'act' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code];
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (!k) return;
  e.preventDefault(); ac();
  if (!keys[k]) pressed[k] = true;
  keys[k] = true;
  if ((k === 'act' || k === 'jump') && mode === 'title') startGame();
  if (k === 'act' && mode === 'ending' && E.t > 3) startGame();
});
addEventListener('keyup', e => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
if (TOUCH) document.body.classList.add('touch');
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); ac(); if (!keys[k]) pressed[k] = true; keys[k] = true; b.classList.add('on'); };
  const off = e => { e.preventDefault(); keys[k] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off);
  b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
});
// floating joystick: put your thumb down anywhere on the left half and drag
const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
(() => {
  const zone = document.getElementById('joyZone'), base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
  const move = e => {
    const R = base.offsetWidth / 2 || 1;
    let dx = (e.clientX - joy.cx) / R, dy = (e.clientY - joy.cy) / R;
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len; }
    joy.x = dx; joy.y = dy;
    knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  zone.addEventListener('pointerdown', e => {
    if (joy.id !== null) return;
    e.preventDefault(); ac();
    joy.id = e.pointerId; zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    joy.cx = e.clientX; joy.cy = e.clientY;
    base.style.left = (e.clientX - r.left) + 'px'; base.style.top = (e.clientY - r.top) + 'px';
    base.classList.add('active'); move(e);
  });
  zone.addEventListener('pointermove', e => { if (e.pointerId === joy.id) move(e); });
  const end = e => {
    if (e.pointerId !== joy.id) return;
    joy.id = null; joy.x = joy.y = 0;
    base.classList.remove('active'); base.style.left = base.style.top = ''; knob.style.transform = '';
  };
  zone.addEventListener('pointerup', end); zone.addEventListener('pointercancel', end);
})();
const docEl = document.documentElement;
const fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
const isFs = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
function goFullscreen() {
  if (!TOUCH || AUTO || isFs() || !fsSupported) return;
  try {
    const p = docEl.requestFullscreen ? docEl.requestFullscreen({ navigationUI: 'hide' }) : docEl.webkitRequestFullscreen?.();
    Promise.resolve(p).then(() => screen.orientation?.lock?.('landscape')).catch(() => { });
  } catch (e) { }
}
if (!fsSupported) document.body.classList.add('nofs');
const fsChange = () => document.body.classList.toggle('fs', isFs());
document.addEventListener('fullscreenchange', fsChange); document.addEventListener('webkitfullscreenchange', fsChange);
document.getElementById('fsBtn').onclick = () => { ac(); goFullscreen(); };
document.getElementById('rotateFs').onclick = () => { ac(); goFullscreen(); };
document.getElementById('anyway').onclick = () => document.body.classList.add('portraitOk');
const muteBtn = document.getElementById('mute');
function toggleMute() { muted = !muted; muteBtn.textContent = muted ? '🔇' : '🔊'; }
muteBtn.onclick = () => { ac(); toggleMute(); muteBtn.blur(); };
document.getElementById('playBtn').onclick = () => { ac(); goFullscreen(); startGame(); };
document.getElementById('againBtn').onclick = () => { ac(); goFullscreen(); startGame(); };

// ---------------------------------------------------------------- state
let mode = 'title', T = 0;
let G, P, C, E;                       // game, player, caught-sequence, ending
let lots, plats, bins, junk, lids, humans, vans, parts, floats;
let nextLotX, lotIdx;
const STARS = Array.from({ length: 130 }, () => ({ x: Math.random() * W, y: Math.random() * 300, r: rand(.5, 1.8), tw: rand(0, 6) }));
const lc = document.createElement('canvas'); lc.width = W; lc.height = H; const lx = lc.getContext('2d');
let lights = [];

function loadBest() { try { return +localStorage.getItem('kotb-best') || 0; } catch (e) { return 0; } }
function saveBest(v) { try { localStorage.setItem('kotb-best', v); } catch (e) { } }

function resetWorld() {
  lots = []; plats = []; bins = []; junk = []; lids = []; humans = []; vans = []; parts = []; floats = [];
  nextLotX = -120; lotIdx = 0;
  G = { score: 0, knocked: 0, rummaged: 0, treasure: 0, stomps: 0, best: loadBest(), cam: 0, shake: 0, rank: 0,
    nextVan: 7, tWatch: 14, banner: null, far: 0, time: 0, hint: 0, causeOfCapture: '' };
  P = { x: 140, z: 470, h: 0, y: 470, vx: 0, vz: 0, vh: 0, face: 1, onGround: true, coyote: 0, jbuf: 0, anim: 0, rum: null,
    inv: 0, squash: 1, pw: { zoom: 0, spring: 0, stink: 0, ninja: 0 }, butter: false, prevH: 0, sup: 0 };
  ensureWorld();
}
function startGame() {
  resetWorld(); mode = 'play'; C = null;
  document.getElementById('titleUI').hidden = true;
  document.getElementById('endUI').hidden = true;
  document.body.classList.add('playing');
  G.hint = 6;
}

// ---------------------------------------------------------------- world generation
function ensureWorld() {
  const edge = (G ? G.cam : 0) + W + 700;
  while (nextLotX < edge) genLot();
  // forget things far behind
  const back = G.cam - 900;
  lots = lots.filter(l => l.x + l.w > back);
  plats = plats.filter(p => p.x + p.w > back);
  bins = bins.filter(b => b.x > back);
  junk = junk.filter(j => j.x > back);
  lids = lids.filter(l => l.x > back);
  if (junk.length > 700) junk.splice(0, junk.length - 700);
}

function genLot() {
  const x = nextLotX, i = lotIdx++, w = ri(500, 640);
  const hw = ri(240, 320), hh = ri(150, 205), hx = x + ri(30, 60);
  const door = hx + Math.round(hw * rand(.28, .72));
  const house = {
    x: hx, w: hw, h: hh, col: pick(HOUSE_COLS), roof: pick(['gable', 'gable', 'hip', 'flat']), door,
    lit: 0, st: 'sleep', t: 0, open: 0, sleepy: i === 0, res: pick(['dad', 'mum', 'granny']),
    wins: [], chim: Math.random() < .5, porch: Math.random() < .55, num: ri(1, 99), wl: [],
  };
  const rows = hh > 178 ? 2 : 1;
  for (let r = 0; r < rows; r++) {
    const wy = BACK - hh + 26 + r * 76;
    for (let wx = hx + 22; wx + 40 < hx + hw - 14; wx += 70) {
      if (r === rows - 1 && Math.abs(wx + 20 - door) < 44) continue;
      house.wins.push({ x: wx - hx, y: wy, w: 40, h: 44, on: Math.random() < .15 });
    }
  }
  if (house.porch) plats.push({ x: door - 50, y: BACK - 106, w: 100 });
  if (house.roof === 'flat') plats.push({ x: hx - 6, y: BACK - hh - 8, w: hw + 12 });
  const lot = { x, w, house, car: null, fence: null, tree: null, lamp: null, hedge: null };

  const fw = ri(90, 150);
  if (Math.random() < .65) { lot.fence = { x: x + w - fw, w: fw }; plats.push({ x: x + w - fw, y: BACK - 58, w: fw }); }
  const space = (lot.fence ? lot.fence.x : x + w) - (hx + hw);
  if (space >= 175 && Math.random() < .5) {
    const cx = hx + hw + ri(8, space - 165);
    lot.car = { x: cx, w: 155, col: pick(CAR_COLS) };
    plats.push({ x: cx + 4, y: BACK - 46, w: 147 });
    plats.push({ x: cx + 38, y: BACK - 80, w: 78 });
  } else if (space > 90 && Math.random() < .6) {
    lot.hedge = { x: hx + hw + 10, w: Math.min(space - 20, ri(70, 130)) };
  }
  if (Math.random() < .4) {
    const tx = hx + (Math.random() < .5 ? ri(-10, 30) : hw - ri(-10, 30));
    lot.tree = { x: tx };
    plats.push({ x: tx - 4, y: BACK - 132, w: 74 });
    plats.push({ x: tx - 50, y: BACK - 228, w: 100 });
  }
  if (Math.random() < .5) lot.lamp = { x: x + ri(40, w - 40) };
  lots.push(lot);

  // bins along the sidewalk, not on top of cars
  const n = i === 0 ? 2 : ri(2, 3), slots = [];
  for (let sx = x + 40; sx < x + w - 30; sx += 80) slots.push(sx + ri(-8, 8));
  const okSlots = slots.filter(s => !(lot.car && s > lot.car.x - 24 && s < lot.car.x + lot.car.w + 24) && !(i === 0 && s < 300));
  for (let k = 0; k < n && okSlots.length; k++) {
    const s = okSlots.splice(ri(0, okSlots.length - 1), 1)[0];
    bins.push({ x: s, z: ri(ZMIN + 6, ZMAX - 6), w: CFG.binW, h: CFG.binH, st: 'up', ang: 0, av: 0, dir: 1, emit: 0, done: false,
      gold: i > 1 && Math.random() < .07, wob: 0, dent: Math.random() });
  }
  nextLotX = x + w;
}

// ---------------------------------------------------------------- helpers
function addScore(n, x, y, col = '#fff') { G.score += n; floats.push({ x, y, txt: '+' + n, col, t: 0, big: false }); }
function say(h, txt) { h.say = txt; h.sayT = 1.8; }
function shake(a) { G.shake = Math.max(G.shake, a); }
function puff(x, y, n, col, sp = 120) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-sp, sp), vy: rand(-sp, sp * .3), life: rand(.4, .8), t: 0, r: rand(4, 9), col, k: 'puff' });
}
function sparkle(x, y, n, col = '#ffe680') {
  for (let i = 0; i < n; i++) { const a = rand(0, 6.28), s = rand(60, 220); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(.4, .9), t: 0, r: rand(2, 4), col, k: 'spark' }); }
}
function binMouth(b) {
  const px = b.x + b.dir * b.w / 2, lx0 = -b.dir * b.w / 2, ly0 = -b.h, c = Math.cos(b.ang), s = Math.sin(b.ang);
  return { x: px + lx0 * c - ly0 * s, y: b.z + lx0 * s + ly0 * c };
}
const JUNK_KINDS = ['can', 'paper', 'paper', 'banana', 'bone', 'bottle', 'apple', 'bag', 'box', 'paper'];
function spawnJunk(x, y, dir, n, sp, z) {
  for (let i = 0; i < n; i++) {
    junk.push({ x, y, z: clamp(z + rand(-18, 18), ZMIN - 4, ZMAX + 12), vx: dir * rand(60, 380) * sp + rand(-40, 40), vy: -rand(80, 380) * sp,
      r: rand(0, 6), vr: rand(-12, 12), k: pick(JUNK_KINDS), rest: false, c: Math.random() });
  }
}

// ---------------------------------------------------------------- bins
function knock(b, dir) {
  b.st = 'fall'; b.dir = dir; b.av = dir * 4.5; b.emit = ri(12, 18);
  G.knocked++;
  addScore(b.gold ? 30 : 10, b.x, b.z - 80, b.gold ? '#ffd84a' : '#fff');
  lids.push({ x: b.x, z: b.z + rand(-4, 4), y: b.z - b.h - 4, vx: dir * rand(200, 420) + P.vx * .3, vy: -rand(420, 650), rot: 0,
    vr: dir * rand(10, 20), st: 'fly', wob: 0, wt: 0, gold: b.gold, tick: 0 });
  sfx('clang'); shake(5);
  wake(b.x);
  const r = rankIdx(G.knocked);
  if (r > G.rank) { G.rank = r; G.banner = { txt: RANKS[r][1], t: 0, sub: r === RANKS.length - 1 ? 'You wear the crown!' : 'NEW RANK!' }; sfx('rank'); }
  if (G.knocked >= G.nextVan && !vans.length) { spawnVan(); G.nextVan += ri(6, 9); }
}
function updateBins(dt) {
  for (const b of bins) {
    if (b.st === 'up') { b.wob *= Math.pow(.02, dt); continue; }
    if (b.st === 'fall') {
      b.av += b.dir * (10 + 18 * Math.abs(Math.sin(b.ang))) * dt;
      b.ang += b.av * dt;
      if (b.dir * b.ang >= Math.PI / 2) {
        b.ang = b.dir * Math.PI / 2;
        if (Math.abs(b.av) > 3) { b.av = -b.av * .28; sfx('thud'); shake(3); puff(binMouth(b).x, b.z, 5, 'rgba(150,150,170,.5)', 60); }
        else { b.st = 'down'; b.av = 0; }
      }
      // a falling bin bonks any human it lands on
      for (const h of humans) {
        const lo = Math.min(b.x, b.x + b.dir * b.h), hi = Math.max(b.x, b.x + b.dir * b.h);
        if (h.st !== 'stun' && h.st !== 'home' && h.x > lo && h.x < hi && Math.abs(h.z - b.z) < 18 && b.dir * b.ang > .9) stun(h, 2.2, 'OOF!');
      }
    }
    if (b.emit > 0 && b.dir * b.ang > .6) {
      const m = binMouth(b), k = Math.min(b.emit, 3);
      spawnJunk(m.x, m.y, b.dir, k, 1, b.z); b.emit -= k;
    }
  }
}

// ---------------------------------------------------------------- lids and rubbish
function updateLids(dt) {
  for (const l of lids) {
    if (l.st === 'fly') {
      l.vy += GRAV * dt; l.x += l.vx * dt; l.y += l.vy * dt; l.rot += l.vr * dt;
      if (Math.hypot(l.vx, l.vy) > 220) {
        for (const h of humans) {
          if (h.st !== 'stun' && h.st !== 'home' && Math.abs(h.x - l.x) < 22 && Math.abs(h.z - l.z) < 20 && l.y > h.z - 86 && l.y < h.z - 10) {
            stun(h, 2.5, 'BONK!'); l.vx *= -.4; l.vy = -200; sfx('clang', .7); addScore(25, h.x, h.z - 110, '#8ef');
          }
        }
      }
      if (l.y >= l.z - 4) {
        l.y = l.z - 4;
        if (l.vy > 260) { l.vy *= -.42; l.vx *= .7; l.vr *= .6; sfx('clang', .5); }
        else { l.st = 'wob'; l.vy = 0; l.wob = 1; l.wt = 0; l.rot = 0; }
      }
    } else if (l.st === 'wob') {
      // the classic "wubba-wubba-wubba" of a lid spinning down on the pavement
      l.x += l.vx * dt; l.vx *= Math.pow(.05, dt);
      l.wt += dt * (8 + 26 * (1 - l.wob)); l.wob -= dt * .6;
      const tk = Math.floor(l.wt / Math.PI);
      if (tk !== l.tick) { l.tick = tk; if (onScreen(l.x)) sfx('tick', l.wob); }
      if (l.wob <= 0) { l.st = 'rest'; l.wob = 0; }
    }
  }
}
function updateJunk(dt) {
  for (const j of junk) {
    if (j.rest) {
      if (mode === 'play' && P.h < 1 && Math.abs(P.vx) > 150 && Math.abs(P.x - j.x) < 16 && Math.abs(P.z - j.z) < 12 && Math.random() < .5) {
        j.rest = false; j.vy = -rand(90, 240); j.vx = P.vx * rand(.4, .9); j.vr = rand(-10, 10);
      }
      continue;
    }
    j.vy += GRAV * dt; j.x += j.vx * dt; j.y += j.vy * dt; j.r += j.vr * dt;
    if (j.y >= j.z) {
      j.y = j.z;
      if (j.vy > 140) { j.vy *= -.35; j.vx *= .55; j.vr *= .5; }
      else { j.rest = true; j.vy = 0; j.vx = 0; }
    }
  }
}

// ---------------------------------------------------------------- houses and humans
function wake(x) {
  // wake houses AHEAD of the raccoon first, so people come out in front of you, not just behind
  const hs = lots.map(l => l.house).filter(h => h.st === 'sleep' && !h.sleepy && h.door > x - 300 && h.door < x + 850);
  const score = h => (h.door > P.x + 150 ? 0 : 1000) + Math.abs(h.door - (P.x + 520));
  hs.sort((a, b) => score(a) - score(b));
  const p = Math.min(.95, .55 + G.knocked * .03), n = G.knocked >= 12 ? 2 : 1;
  for (let i = 0; i < Math.min(n, hs.length); i++) if (Math.random() < p) { hs[i].st = 'waking'; hs[i].t = rand(.3, .7) + i * .8; }
}
function updateHouses(dt) {
  for (const l of lots) {
    const h = l.house;
    if (h.st === 'waking') { h.t -= dt; if (h.t <= 0) { h.lit = 1; h.st = 'opening'; h.t = .6; if (onScreen(h.door)) sfx('huh'); } }
    else if (h.st === 'opening') {
      h.t -= dt; h.open = Math.min(1, h.open + dt * 3);
      if (h.t <= 0) { spawnHuman(h.res, h.door, h, ZMIN + 2); h.st = 'out'; if (onScreen(h.door)) sfx('door'); }
    } else if (h.st === 'out') { h.open = Math.max(.6, h.open); }
    else if (h.st === 'cool') {
      h.t -= dt; h.open = Math.max(0, h.open - dt * 2);
      if (h.t < 8) h.lit = Math.max(0, h.lit - dt * .5);
      if (h.t <= 0) { h.st = 'sleep'; h.lit = 0; }
    }
  }
}
function spawnHuman(type, x, house, z) {
  const cf = CFG.humans[type];
  const hum = { type, x, z, vx: 0, vz: 0, face: sgn(P.x - x), st: 'out', t: .5, house, anim: 0, say: '', sayT: 0, stun: 0,
    chaseT: 0, patience: 0, speed: cf.speed * (1 + Math.min(.3, G.far / 30000)), van: null, swing: 0, hair: Math.random(), pz: z };
  say(hum, pick(cf.say));
  humans.push(hum);
  return hum;
}
function spawnWatch() {
  const h = spawnHuman('watch', G.cam + W + 40, null, rand(ZMIN + 10, ZMAX - 10));
  h.st = 'patrol'; h.face = -1; h.t = 0; h.sayT = 0;
}
function stun(h, d, txt) { h.st = 'stun'; h.stun = d; h.vx = 0; h.vz = 0; say(h, txt); sparkle(h.x, h.z - 80, 8, '#fff6a0'); }
function goHome(h, txt) { h.st = 'home'; if (txt) say(h, txt); }
// grown-ups can grab a raccoon up to 70px off the ground; the catcher's net reaches 130
const reachable = h => P.h < (h && h.type === 'catcher' ? 130 : 70);
const HEAD = 82;

function updateHumans(dt) {
  for (const h of humans) {
    h.sayT -= dt; h.anim += dt * (Math.abs(h.vx) + Math.abs(h.vz)) / 18;
    const dx = P.x - h.x, dz = P.z - h.z, cf = CFG.humans[h.type];
    let tz = null;                       // the depth this human is walking toward
    if (h.st === 'out') { h.vx = 0; h.t -= dt; if (h.t <= 0) h.st = 'chase'; }
    else if (h.st === 'patrol') {
      h.vx = h.face * 70; h.t -= dt; tz = h.pz;
      if (h.t <= 0) { h.t = rand(1, 2.5); h.pz = rand(ZMIN + 10, ZMAX - 10); }
      if (mode === 'play' && P.pw.ninja <= 0 && Math.abs(dx) < 380) { h.st = 'chase'; say(h, pick(cf.say)); if (onScreen(h.x)) sfx('huh'); }
      if (h.x < G.cam - 200) h.gone = true;
    } else if (h.st === 'stun') {
      h.vx = 0; h.stun -= dt;
      if (h.stun <= 0) h.st = h.chaseT > cf.chase ? 'home' : 'chase';
    } else if (h.st === 'flee') {
      h.t -= dt; h.face = -sgn(dx); h.vx = h.face * h.speed * 1.1; tz = h.z - sgn(dz) * 60;
      if (h.t <= 0) h.st = 'chase';
    } else if (h.st === 'search') {
      h.chaseT += dt * .5; h.t -= dt; tz = h.pz;
      if (h.t <= 0) { h.t = rand(.6, 1.4); h.face = pick([-1, 1]); h.pz = rand(ZMIN, ZMAX); if (Math.random() < .4) say(h, pick(["Where'd it go?", 'Hmm...', "I know you're here!"])); }
      h.vx = h.face * 60;
      if (P.pw.ninja <= 0) h.st = 'chase';
      if (h.chaseT > cf.chase) goHome(h, 'Pesky bandit...');
    } else if (h.st === 'chase') {
      h.chaseT += dt;
      if (mode !== 'play') { h.vx = 0; }
      else if (P.pw.ninja > 0) { h.st = 'search'; h.t = 0; say(h, "Huh? Where'd it go?"); }
      else if (h.chaseT > cf.chase || Math.abs(dx) > 900) goHome(h, pick(['Pesky bandit!', 'Next time...', 'Ugh, raccoons!']));
      else if (!reachable(h) && Math.abs(dx) < 70 && Math.abs(dz) < 40) {
        h.vx = 0; h.face = sgn(dx); h.patience += dt;
        if (h.sayT < -.3) say(h, pick(['Get DOWN here!', 'I can see you!', 'Come down!']));
        if (h.patience > 3.5) goHome(h, 'Fine! Stay up there!');
      } else if (h.type === 'catcher' && Math.abs(dx) < 92 && Math.abs(dz) < 16 && reachable(h)) {
        h.st = 'swing'; h.t = 0; h.vx = 0; h.face = sgn(dx);
      } else {
        h.face = sgn(dx); h.vx = Math.abs(dx) < 6 ? 0 : h.face * h.speed; tz = P.z;
        if (h.sayT < -2.5 && Math.random() < dt) say(h, pick(cf.say));
      }
    } else if (h.st === 'swing') {
      h.t += dt; h.swing = h.t;
      if (h.t >= .42 && h.t - dt < .42) {
        sfx('swish');
        const rel = (P.x - h.x) * h.face;
        if (mode === 'play' && rel > -5 && rel < 105 && Math.abs(P.z - h.z) < 20 && P.h < 130) grabbed(h);
      }
      if (h.t > .85) { h.st = 'chase'; h.swing = 0; }
    } else if (h.st === 'home') {
      if (h.van || h.house) {
        const tx = h.van ? h.van.x + 30 : h.house.door; tz = h.van ? ZMAX : ZMIN + 2;
        h.face = sgn(tx - h.x); h.vx = h.face * h.speed * .55;
        if (Math.abs(tx - h.x) < 8) {
          h.gone = true;
          if (h.house) { h.house.st = 'cool'; h.house.t = 14; sfx('door'); }
          if (h.van) h.van.st = 'leave';
        }
      } else {
        // neighbourhood watch just wanders off
        h.face = h.x > P.x ? 1 : -1; h.vx = h.face * h.speed * .6;
        if (h.x < G.cam - 150 || h.x > G.cam + W + 150) h.gone = true;
      }
    }
    if (tz !== null) h.vz = clamp((tz - h.z) * 5, -h.speed * .45, h.speed * .45); else h.vz = 0;
    h.x += h.vx * dt; h.z = clamp(h.z + h.vz * dt, ZMIN, ZMAX);

    // contact with the raccoon
    if (mode === 'play' && h.st !== 'stun' && h.st !== 'home' && h.st !== 'out' && P.inv <= 0) {
      if (Math.abs(dx) < 30 && Math.abs(dz) < 18 && P.vh < 0 && P.prevH >= HEAD - 14 && P.h <= HEAD + 4) {
        stun(h, 2.6, pick(['OW!', 'OOF!', 'My head!', 'Argh!']));
        P.vh = P.pw.spring > 0 ? 820 : 640; P.h = HEAD + 4; P.onGround = false;
        G.stomps++; addScore(25, h.x, h.z - 112, '#8ef'); sfx('stomp');
      } else if (Math.abs(dx) < 24 && Math.abs(dz) < 13 && reachable(h) && P.pw.ninja <= 0 && h.st !== 'swing') {
        grabbed(h);
      }
    }
  }
  humans = humans.filter(h => !h.gone);
}
function grabbed(h) {
  if (P.inv > 0) return;
  if (P.pw.stink > 0) { h.st = 'flee'; h.t = 1.6; say(h, 'PEE-YEW!!'); puff(P.x, P.y - 20, 8, 'rgba(150,200,60,.5)', 80); P.inv = .4; return; }
  if (P.butter) {
    P.butter = false; P.inv = 1.6; stun(h, 1.5, 'Slippery!'); sfx('slip');
    floats.push({ x: P.x, y: P.y - 60, txt: 'SLIPPED FREE!', col: '#ffe27a', t: 0, big: true });
    P.vh = 560; P.onGround = false; P.vx = -sgn(h.x - P.x) * 400;
    return;
  }
  caught(h);
}

// ---------------------------------------------------------------- animal control van (drives in from ahead)
function spawnVan() {
  vans.push({ x: G.cam + W + 240, st: 'in', t: 0, flash: 0 });
  sfx('siren');
  floats.push({ x: W / 2, y: 150, txt: 'ANIMAL CONTROL!', col: '#ff9a3a', t: 0, big: true, screen: true });
}
function updateVans(dt) {
  for (const v of vans) {
    v.flash += dt;
    if (v.st === 'in') {
      v.x -= 460 * dt;
      if (v.x <= Math.max(P.x + 240, G.cam + W * .45)) {
        v.st = 'park';
        const hm = spawnHuman('catcher', v.x + 30, null, ZMAX - 4); hm.van = v; hm.t = .35; sfx('door');
      }
    } else if (v.st === 'leave') {
      v.x -= 520 * dt;
      if (v.x < G.cam - 400) v.gone = true;
    } else if (v.st === 'park' && v.x < G.cam - 700) {
      v.gone = true; humans.forEach(h => { if (h.van === v) h.gone = true; });
    }
  }
  vans = vans.filter(v => !v.gone);
}

// ---------------------------------------------------------------- player
// The raccoon has a depth (z: up/down the pavement) and a height (h: jumping).
// Its feet are drawn at screen y = z - h.
function supports() {
  const s = [0];
  if (P.z <= BACKSTRIP) for (const p of plats) if (P.x + 14 > p.x && P.x - 14 < p.x + p.w) s.push(ZMIN + 6 - p.y);
  for (const b of bins) if (b.st === 'up' && Math.abs(P.x - b.x) < b.w / 2 + 6 && Math.abs(P.z - b.z) < 14) s.push(b.h + 6);
  return s;
}
function updatePlayer(dt) {
  let ax = (keys.right ? 1 : 0) - (keys.left ? 1 : 0), az = (keys.down ? 1 : 0) - (keys.up ? 1 : 0);
  if (joy.id !== null) {
    // joystick: small dead zone, then full speed comes quickly so it doesn't feel sluggish
    ax = Math.abs(joy.x) < .2 ? 0 : clamp(joy.x * 1.5, -1, 1);
    az = Math.abs(joy.y) < .3 ? 0 : clamp(joy.y * 1.5, -1, 1);
  }
  for (const k in P.pw) P.pw[k] = Math.max(0, P.pw[k] - dt);
  P.inv = Math.max(0, P.inv - dt);
  P.prevH = P.h;

  if (P.rum) {
    ax = 0; az = 0; P.rum.t += dt;
    if (Math.random() < dt * 14) { const m = binMouth(P.rum.b); spawnJunk(m.x, m.y - 6, P.rum.b.dir, 1, .7, P.rum.b.z); sfx('rustle'); }
    if (pressed.jump) { P.rum = null; }
    else if (P.rum.t >= CFG.rummageTime) finishRummage();
  }

  const fast = P.pw.zoom > 0 ? CFG.zoomMul : 1;
  P.vx += (ax * CFG.run * fast - P.vx) * Math.min(1, dt * (P.onGround ? 12 : 6));
  P.vz += (az * CFG.zrun * fast - P.vz) * Math.min(1, dt * 14);
  if (ax) P.face = sgn(ax);
  if (P.pw.zoom > 0 && Math.abs(P.vx) > 200 && Math.random() < .5) parts.push({ x: P.x - P.face * 20, y: P.y - rand(5, 30), vx: -P.face * 60, vy: 0, life: .3, t: 0, r: 3, col: '#ff6a3a', k: 'spark' });

  if (pressed.jump && !P.rum) P.jbuf = .13;
  P.jbuf -= dt; P.coyote -= dt;
  if (P.jbuf > 0 && P.coyote > 0) {
    P.vh = P.pw.spring > 0 ? CFG.springJump : CFG.jump; P.coyote = 0; P.jbuf = 0; P.onGround = false; P.squash = .7;
    sfx(P.pw.spring > 0 ? 'spring' : 'jump');
  }
  if (!keys.jump && P.vh > 250) P.vh -= GRAV * 1.4 * dt;   // short hop when you let go
  P.vh -= GRAV * dt;

  if (pressed.act && P.onGround && !P.rum) {
    const b = bins.find(b => b.st === 'down' && !b.done && Math.abs(P.x - (binMouth(b).x + b.dir * 14)) < 46 && Math.abs(P.z - b.z) < 18);
    if (b) { P.rum = { b, t: 0 }; P.face = -b.dir; P.x = binMouth(b).x + b.dir * 18; P.z = b.z; P.vx = 0; P.vz = 0; }
  }

  P.x = Math.max(30, P.x + P.vx * dt);
  P.z = clamp(P.z + P.vz * dt, ZMIN, ZMAX);

  // falling / landing on the ground, a platform or a bin lid
  const sup = supports();
  let nh = P.h + P.vh * dt, best = -1;
  if (P.vh <= 0) for (const s of sup) if (s <= P.h + 1 && nh <= s && s > best) best = s;
  P.sup = Math.max(...sup.filter(s => s <= P.h + 1));
  if (best >= 0) {
    if (!P.onGround && P.vh < -500) { P.squash = 1.3; puff(P.x, P.z - best, 4, 'rgba(160,160,180,.45)', 50); }
    if (best > 0) bins.forEach(b => { if (b.st === 'up' && Math.abs(P.x - b.x) < b.w / 2 + 6 && Math.abs(P.z - b.z) < 14 && !P.onGround) b.wob = 1; });
    nh = best; P.vh = 0; P.onGround = true; P.coyote = .1;
  } else P.onGround = false;
  P.h = nh; P.y = P.z - P.h;

  G.far = Math.max(G.far, P.x);
  P.squash += (1 - P.squash) * Math.min(1, dt * 10);
  P.anim += dt * (P.onGround ? Math.hypot(P.vx, P.vz) / 22 : 0);

  // run into a standing bin — but only if you're lined up with it
  for (const b of bins) {
    if (b.st !== 'up') continue;
    if (Math.abs(P.x - b.x) < b.w / 2 + 14 && Math.abs(P.z - b.z) < 13 && P.h < b.h - 6) {
      knock(b, Math.abs(P.vx) > 20 ? sgn(P.vx) : sgn(b.x - P.x));
      P.vx *= .6;
    }
  }
}
function finishRummage() {
  const b = P.rum.b; P.rum = null; b.done = true; G.rummaged++;
  const id = roll(b.gold ? GOLD_TABLE : LOOT_TABLE), it = LOOT[id], m = binMouth(b);
  floats.push({ x: m.x, y: b.z - 60, item: id, txt: it.n, col: it.k === 'treasure' ? '#ffd84a' : it.k === 'power' ? '#8ef' : '#fff', t: 0, big: true, sub: it.desc });
  addScore(it.p, m.x, b.z - 120, '#fff');
  if (it.k === 'treasure') { G.treasure++; sfx('treasure'); sparkle(m.x, b.z - 60, 16); }
  else if (it.k === 'power') {
    sfx('power'); sparkle(m.x, b.z - 60, 12, '#8ef');
    if (id === 'butter') P.butter = true; else P.pw[id] = it.d;
  } else sfx('food');
}

// ---------------------------------------------------------------- caught!
function caught(h) {
  mode = 'caught';
  C = { t: 0, h, cageY: P.y - 320, landed: false };
  h.st = 'grab'; h.vx = 0; h.vz = 0; h.face = sgn(P.x - h.x);
  say(h, h.type === 'catcher' ? 'GOT YOU!' : 'GOTCHA!');
  P.rum = null; P.vx = 0; P.vz = 0;
  G.causeOfCapture = { dad: 'a grumpy dad in his dressing gown', mum: 'an angry mum in hair curlers', granny: 'a very cross granny',
    catcher: 'the Animal Control officer', watch: 'the Neighbourhood Watch' }[h.type];
  sfx('huh');
}
function updateCaught(dt) {
  C.t += dt;
  if (P.h > 0) { P.vh -= GRAV * dt; P.h = Math.max(0, P.h + P.vh * dt); }
  P.y = P.z - P.h;
  if (C.t > .45 && !C.landed) {
    C.cageY = Math.min(P.y, C.cageY + (C.t - .45) * 1800 * dt * 3);
    if (C.cageY >= P.y) { C.landed = true; sfx('cage'); shake(10); puff(P.x, P.z, 10, 'rgba(170,170,190,.5)', 120); }
  }
  if (C.t > 2.4) startEnding();
}

// ---------------------------------------------------------------- ending
function startEnding() {
  mode = 'ending';
  const newBest = G.score > G.best;
  if (newBest) saveBest(G.score);
  E = { t: 0, newBest, puffs: [], barsDone: false, stripesDone: false };
  document.body.classList.remove('playing');
}
function showEndCard() {
  const s = document.getElementById('endStats');
  s.innerHTML = `Caught by ${G.causeOfCapture}!<br>
    <b>${G.score}</b> points ${E.newBest ? '<div class="new">★ NEW HIGH SCORE ★</div>' : `<br>Best: ${Math.max(G.best, G.score)}`}<br>
    Bins knocked over: <b>${G.knocked}</b><br>
    Bins rummaged: ${G.rummaged} · Treasures: ${G.treasure}<br>
    Humans bonked: ${G.stomps}<br>
    Rank: <b>${RANKS[G.rank][1]}</b>`;
  document.getElementById('endUI').hidden = false;
}
function updateEnding(dt) {
  const was = E.t; E.t += dt;
  if (was < 1.3 && E.t >= 1.3) { sfx('poof'); for (let i = 0; i < 26; i++) E.puffs.push({ x: 330 + rand(-150, 150), y: 330 + rand(-110, 150), r: rand(20, 50), t: 0 }); }
  if (was < 2.5 && E.t >= 2.75) { }
  if (was < 2.62 && E.t >= 2.62) { sfx('bars'); E.shake = 16; }
  if (was < 3.4 && E.t >= 3.4) { sfx('sad'); showEndCard(); }
  E.shake = (E.shake || 0) * Math.pow(.004, dt);
  E.puffs.forEach(p => p.t += dt);
}

// ---------------------------------------------------------------- main update
function onScreen(x) { return x > G.cam - 60 && x < G.cam + W + 60; }
function update(dt) {
  T += dt;
  if (mode === 'title') { titleCam += dt * 35; return; }
  if (mode === 'ending') { updateEnding(dt); return; }
  G.time += dt; G.hint -= dt;
  if (mode === 'play') {
    updatePlayer(dt);
    G.tWatch -= dt;
    if (G.tWatch <= 0) {
      G.tWatch = Math.max(5, rand(9, 15) - G.knocked * .15);
      if (G.knocked >= 2 && humans.length < 2 + G.knocked / 8) spawnWatch();
    }
  }
  else if (mode === 'caught') updateCaught(dt);
  updateBins(dt); updateLids(dt); updateJunk(dt); updateHouses(dt); updateHumans(dt); updateVans(dt);
  for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.k === 'spark') p.vy += 400 * dt; else { p.vx *= .92; p.vy -= 20 * dt; } }
  parts = parts.filter(p => p.t < p.life);
  for (const f of floats) { f.t += dt; f.y -= dt * (f.big ? 22 : 50); }
  floats = floats.filter(f => f.t < (f.big ? 2.2 : 1));
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 2.6) G.banner = null; }
  G.shake *= Math.pow(.01, dt);
  const target = P.x - W * .38;
  G.cam += (target - G.cam) * Math.min(1, dt * 5);
  G.cam = Math.max(-40, G.cam);
  ensureWorld();
  for (const k in pressed) pressed[k] = false;
}

// ================================================================ drawing
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function ell(x, y, rx, ry, rot = 0) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(.1, rx), Math.max(.1, ry), rot, 0, 6.2832); }
function text(t, x, y, size, col, align = 'center', stroke = '#0a0a12', sw = 5) {
  ctx.font = FONT(size); ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = sw; ctx.strokeStyle = stroke; ctx.strokeText(t, x, y);
  ctx.fillStyle = col; ctx.fillText(t, x, y);
}

function drawSky(cam) {
  const g = ctx.createLinearGradient(0, 0, 0, BACK);
  g.addColorStop(0, '#060818'); g.addColorStop(.6, '#141a44'); g.addColorStop(1, '#2b2557');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of STARS) {
    const a = .45 + .45 * Math.sin(T * 2 + s.tw);
    ctx.fillStyle = `rgba(255,250,220,${a})`;
    const x = ((s.x - cam * .02) % W + W) % W;
    ctx.fillRect(x, s.y, s.r, s.r);
  }
  // moon
  const mx = 790 - cam * .01 % 40, my = 92;
  const mg = ctx.createRadialGradient(mx, my, 30, mx, my, 140);
  mg.addColorStop(0, 'rgba(255,245,200,.35)'); mg.addColorStop(1, 'rgba(255,245,200,0)');
  ctx.fillStyle = mg; ctx.fillRect(mx - 140, my - 140, 280, 280);
  ctx.fillStyle = '#fff4c8'; ell(mx, my, 40, 40); ctx.fill();
  ctx.fillStyle = 'rgba(200,190,150,.5)';
  ell(mx - 12, my - 8, 8, 7); ctx.fill(); ell(mx + 14, my + 10, 10, 8); ctx.fill(); ell(mx + 8, my - 18, 5, 4); ctx.fill();
  // clouds
  ctx.fillStyle = 'rgba(120,120,170,.12)';
  for (let i = 0; i < 5; i++) {
    const cx = ((i * 260 - cam * .06 - T * 6) % (W + 300) + W + 300) % (W + 300) - 150, cy = 60 + i * 37 % 120;
    ell(cx, cy, 90, 16); ctx.fill(); ell(cx + 40, cy - 10, 50, 14); ctx.fill();
  }
}
function drawFar(cam) {
  // distant rooftops
  let off = cam * .25, sw = 90;
  ctx.fillStyle = '#121838';
  for (let i = Math.floor(off / sw) - 1; i < (off + W) / sw + 1; i++) {
    const x = i * sw - off, h = 50 + hash(i) * 70, base = BACK - 40;
    if (hash(i + .3) < .65) {
      ctx.fillRect(x, base - h, sw - 6, h + 40);
      ctx.beginPath(); ctx.moveTo(x - 6, base - h); ctx.lineTo(x + (sw - 6) / 2, base - h - 30); ctx.lineTo(x + sw, base - h); ctx.fill();
      if (hash(i + .7) < .35) { ctx.fillStyle = 'rgba(255,210,110,.55)'; ctx.fillRect(x + 20, base - h + 18, 10, 10); ctx.fillStyle = '#121838'; }
    } else { ell(x + sw / 2, base - h + 10, 50, 55); ctx.fill(); ctx.fillRect(x + 20, base - h + 10, 50, h + 30); }
  }
  // nearer trees
  off = cam * .5; sw = 150; ctx.fillStyle = '#161f33';
  for (let i = Math.floor(off / sw) - 1; i < (off + W) / sw + 1; i++) {
    if (hash(i * 3.1) < .45) continue;
    const x = i * sw - off + hash(i) * 60, h = 90 + hash(i + 9) * 80;
    ctx.fillRect(x - 5, BACK - h, 10, h);
    ell(x, BACK - h, 45 + hash(i + 2) * 25, 40 + hash(i + 4) * 20); ctx.fill();
    ell(x - 30, BACK - h + 25, 35, 30); ctx.fill(); ell(x + 30, BACK - h + 20, 35, 30); ctx.fill();
  }
}
function drawGround(cam) {
  ctx.fillStyle = '#1f3326'; ctx.fillRect(0, BACK - 6, W, 14);
  ctx.fillStyle = '#454a62'; ctx.fillRect(0, BACK + 8, W, 92);
  ctx.fillStyle = '#5d6382'; ctx.fillRect(0, BACK + 8, W, 3);
  ctx.strokeStyle = '#393d54'; ctx.lineWidth = 2; ctx.beginPath();
  for (let x = -((cam % 80) + 80) % 80; x < W + 40; x += 80) { ctx.moveTo(x, BACK + 11); ctx.lineTo(x - 26, BACK + 100); }
  ctx.moveTo(0, BACK + 55); ctx.lineTo(W, BACK + 55);
  ctx.stroke();
  ctx.fillStyle = '#7c8199'; ctx.fillRect(0, BACK + 100, W, 7);
  ctx.fillStyle = '#1c1e2c'; ctx.fillRect(0, BACK + 107, W, H - BACK - 107);
  ctx.fillStyle = 'rgba(230,200,90,.35)';
  for (let x = -((cam % 120) + 120) % 120; x < W; x += 120) ctx.fillRect(x, H - 9, 60, 4);
}

function drawHouse(h, cam) {
  const sx = h.x - cam, y0 = BACK - h.h;
  if (sx > W + 40 || sx + h.w < -40) return;
  ctx.fillStyle = h.col; ctx.fillRect(sx, y0, h.w, h.h);
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let y = y0 + 10; y < BACK; y += 11) { ctx.moveTo(sx, y); ctx.lineTo(sx + h.w, y); }
  ctx.stroke();
  const roofC = '#2a2233';
  if (h.chim) { ctx.fillStyle = '#5a3a34'; ctx.fillRect(sx + h.w * .72, y0 - 62, 24, 50); ctx.fillStyle = '#3a2622'; ctx.fillRect(sx + h.w * .72 - 3, y0 - 66, 30, 7); }
  ctx.fillStyle = roofC; ctx.beginPath();
  if (h.roof === 'gable') { ctx.moveTo(sx - 16, y0 + 4); ctx.lineTo(sx + h.w / 2, y0 - h.w * .3); ctx.lineTo(sx + h.w + 16, y0 + 4); }
  else if (h.roof === 'hip') { ctx.moveTo(sx - 16, y0 + 4); ctx.lineTo(sx + 50, y0 - 46); ctx.lineTo(sx + h.w - 50, y0 - 46); ctx.lineTo(sx + h.w + 16, y0 + 4); }
  else { ctx.rect(sx - 8, y0 - 8, h.w + 16, 12); }
  ctx.fill();
  for (const w of h.wins) {
    const wx = sx + w.x, lit = w.on || h.lit > 0;
    ctx.fillStyle = '#20232f'; ctx.fillRect(wx - 3, w.y - 3, w.w + 6, w.h + 6);
    if (lit) {
      const a = w.on ? 1 : h.lit;
      ctx.fillStyle = `rgba(255,${200 + 10 * a},${100},${.35 + .65 * a})`; ctx.fillRect(wx, w.y, w.w, w.h);
      ctx.fillStyle = `rgba(150,60,60,${.6 * a})`; ctx.fillRect(wx, w.y, 9, w.h); ctx.fillRect(wx + w.w - 9, w.y, 9, w.h);
      lights.push({ x: wx + w.w / 2, y: w.y + w.h / 2, r: 70, a: .7 * a });
    } else {
      ctx.fillStyle = '#1a2036'; ctx.fillRect(wx, w.y, w.w, w.h);
      ctx.fillStyle = 'rgba(160,180,255,.12)'; ctx.beginPath(); ctx.moveTo(wx + 6, w.y + w.h); ctx.lineTo(wx + 20, w.y); ctx.lineTo(wx + 28, w.y); ctx.lineTo(wx + 14, w.y + w.h); ctx.fill();
    }
    ctx.strokeStyle = '#20232f'; ctx.lineWidth = 3; ctx.beginPath();
    ctx.moveTo(wx + w.w / 2, w.y); ctx.lineTo(wx + w.w / 2, w.y + w.h); ctx.moveTo(wx, w.y + w.h / 2); ctx.lineTo(wx + w.w, w.y + w.h / 2); ctx.stroke();
  }
  // door
  const dx = h.door - cam;
  ctx.fillStyle = '#2a1e1a'; ctx.fillRect(dx - 19, BACK - 66, 38, 66);
  if (h.open > 0) {
    ctx.fillStyle = '#ffd98a'; ctx.fillRect(dx - 16, BACK - 63, 32, 63);
    lights.push({ x: dx, y: BACK - 30, r: 110, a: .8 * h.open });
    ctx.fillStyle = '#6a3a28'; ctx.fillRect(dx - 16, BACK - 63, 32 * (1 - h.open * .8), 63);
  } else {
    ctx.fillStyle = '#6a3a28'; ctx.fillRect(dx - 16, BACK - 63, 32, 63);
    ctx.fillStyle = '#d8b04a'; ell(dx + 10, BACK - 32, 2.5, 2.5); ctx.fill();
  }
  ctx.fillStyle = '#ddd'; ctx.font = FONT(13); ctx.textAlign = 'center'; ctx.fillText(h.num, dx, BACK - 72);
  // porch light
  ctx.fillStyle = h.lit > 0 ? '#ffe9a0' : '#555'; ctx.fillRect(dx + 24, BACK - 58, 6, 9);
  if (h.lit > 0) lights.push({ x: dx + 27, y: BACK - 54, r: 90, a: .7 * h.lit, glow: true });
  if (h.porch) {
    ctx.fillStyle = '#3a2f3a'; ctx.fillRect(dx - 50, BACK - 106, 100, 9);
    ctx.fillStyle = '#2a222a'; ctx.beginPath(); ctx.moveTo(dx - 54, BACK - 106); ctx.lineTo(dx + 54, BACK - 106); ctx.lineTo(dx + 48, BACK - 114); ctx.lineTo(dx - 48, BACK - 114); ctx.fill();
    ctx.fillStyle = '#b8b0a0'; ctx.fillRect(dx - 47, BACK - 97, 5, 97); ctx.fillRect(dx + 42, BACK - 97, 5, 97);
  }
  ctx.fillStyle = '#5a5560'; ctx.fillRect(dx - 26, BACK - 6, 52, 6);
}
function drawFence(f, cam) {
  const sx = f.x - cam; if (sx > W || sx + f.w < 0) return;
  ctx.fillStyle = '#8f8a80';
  ctx.fillRect(sx, BACK - 44, f.w, 6); ctx.fillRect(sx, BACK - 20, f.w, 6);
  ctx.fillStyle = '#b5afa2';
  for (let x = sx + 2; x < sx + f.w - 8; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, BACK); ctx.lineTo(x, BACK - 52); ctx.lineTo(x + 5, BACK - 58); ctx.lineTo(x + 10, BACK - 52); ctx.lineTo(x + 10, BACK); ctx.fill();
  }
}
function drawHedge(hd, cam) {
  const sx = hd.x - cam; if (sx > W || sx + hd.w < 0) return;
  ctx.fillStyle = '#1d3a26';
  rr(sx, BACK - 46, hd.w, 46, 18); ctx.fill();
  ctx.fillStyle = '#244a30';
  for (let x = sx + 12; x < sx + hd.w - 8; x += 20) { ell(x, BACK - 40, 13, 10); ctx.fill(); }
}
function drawCar(c, cam) {
  const sx = c.x - cam; if (sx > W || sx + c.w < 0) return;
  ctx.fillStyle = c.col;
  rr(sx + 34, BACK - 82, 86, 40, 12); ctx.fill();
  rr(sx, BACK - 50, c.w, 36, 10); ctx.fill();
  ctx.fillStyle = '#1b2236'; rr(sx + 42, BACK - 76, 33, 28, 5); ctx.fill(); rr(sx + 80, BACK - 76, 33, 28, 5); ctx.fill();
  ctx.fillStyle = 'rgba(160,180,255,.15)'; ctx.fillRect(sx + 48, BACK - 74, 6, 24);
  ctx.fillStyle = '#ffe9a0'; ctx.fillRect(sx + c.w - 8, BACK - 44, 7, 7);
  ctx.fillStyle = '#a03030'; ctx.fillRect(sx + 1, BACK - 44, 6, 7);
  for (const wx of [sx + 32, sx + c.w - 32]) {
    ctx.fillStyle = '#111'; ell(wx, BACK - 12, 15, 15); ctx.fill();
    ctx.fillStyle = '#777'; ell(wx, BACK - 12, 6, 6); ctx.fill();
  }
}
function drawTree(t, cam) {
  const sx = t.x - cam; if (sx > W + 80 || sx < -100) return;
  ctx.fillStyle = '#3a2a22'; ctx.fillRect(sx + 18, BACK - 230, 20, 230);
  ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(sx + 28, BACK - 120); ctx.lineTo(sx + 70, BACK - 132); ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = '#1b3324';
  ell(sx + 28, BACK - 240, 70, 32); ctx.fill(); ell(sx - 12, BACK - 210, 44, 30); ctx.fill(); ell(sx + 70, BACK - 205, 44, 30); ctx.fill();
  ctx.fillStyle = '#21402c'; ell(sx + 20, BACK - 248, 40, 18); ctx.fill();
}
function drawLamp(l, cam) {
  const sx = l.x - cam; if (sx > W + 200 || sx < -200) return;
  ctx.fillStyle = '#2a2d38'; ctx.fillRect(sx - 3, BACK - 200, 6, 200);
  ctx.fillRect(sx - 3, BACK - 200, 26, 5);
  ctx.fillStyle = '#fff2c0'; rr(sx + 12, BACK - 197, 20, 9, 3); ctx.fill();
  lights.push({ x: sx + 22, y: BACK - 190, r: 210, a: .95, glow: true, cone: true });
}

// ----- the old metal bin
function binBody(w, h, gold, dent, mouth) {
  const g = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
  if (gold) { g.addColorStop(0, '#7a5a10'); g.addColorStop(.35, '#ffe27a'); g.addColorStop(.6, '#c9a23a'); g.addColorStop(1, '#6a4a08'); }
  else { g.addColorStop(0, '#4e535e'); g.addColorStop(.35, '#c4cad3'); g.addColorStop(.6, '#8c939e'); g.addColorStop(1, '#474c57'); }
  ctx.fillStyle = g; ctx.strokeStyle = '#15161c'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-w / 2 + 4, 0); ctx.lineTo(-w / 2, -h); ctx.lineTo(w / 2, -h); ctx.lineTo(w / 2 - 4, 0); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.lineWidth = 2;
  for (const f of [.22, .5, .78]) {
    const y = -h * f, ww = w / 2 - 4 * (1 - f) - .5;
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(-ww, y); ctx.lineTo(ww, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.moveTo(-ww, y + 2); ctx.lineTo(ww, y + 2); ctx.stroke();
  }
  if (dent > .5) { ctx.fillStyle = 'rgba(0,0,0,.18)'; ell(-w * .15, -h * .36, 6, 4); ctx.fill(); }
  ctx.strokeStyle = '#2a2c34'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(-w / 2 - 1, -h * .7, 5, Math.PI * .5, Math.PI * 1.5); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2 + 1, -h * .7, 5, -Math.PI * .5, Math.PI * .5); ctx.stroke();
  ctx.fillStyle = gold ? '#a8851f' : '#9aa0aa'; ctx.fillRect(-w / 2 - 1, -h - 3, w + 2, 5);
  if (mouth) { ctx.fillStyle = '#0c0c10'; ell(0, -h, w / 2 - 2, 5); ctx.fill(); }
}
function lidShape(w, gold) {
  ctx.fillStyle = gold ? '#e8c450' : '#b4bac4'; ctx.strokeStyle = '#15161c'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(0, 0, w / 2 + 3, 9, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillRect(-w / 2 - 4, -1, w + 8, 4); ctx.strokeRect(-w / 2 - 4, -1, w + 8, 4);
  ctx.fillStyle = 'rgba(255,255,255,.45)'; ell(-w * .18, -5, w * .15, 2.5); ctx.fill();
  ctx.strokeStyle = '#2a2c34'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -10, 5, Math.PI, 0); ctx.stroke();
}
function drawBin(b, cam) {
  const sx = b.x - cam; if (sx > W + 80 || sx < -80) return;
  ctx.save();
  if (b.st === 'up') {
    shadow(sx, b.z, 24, .3);
    ctx.translate(sx, b.z); ctx.rotate(Math.sin(T * 30) * b.wob * .05);
    binBody(b.w, b.h, b.gold, b.dent, false);
    ctx.translate(0, -b.h - 2); lidShape(b.w, b.gold);
    if (b.gold && Math.random() < .08) parts.push({ x: b.x + rand(-20, 20), y: b.z - rand(10, 60), vx: 0, vy: -20, life: .6, t: 0, r: 2.5, col: '#ffe680', k: 'spark' });
  } else {
    ctx.translate(sx + b.dir * b.w / 2, b.z); ctx.rotate(b.ang); ctx.translate(-b.dir * b.w / 2, 0);
    binBody(b.w, b.h, b.gold, b.dent, true);
  }
  ctx.restore();
  if (b.st === 'down' && !b.done && mode === 'play' && !(P.rum && P.rum.b === b)) {
    const m = binMouth(b), near = Math.abs(P.x - (m.x + b.dir * 14)) < 46 && Math.abs(P.z - b.z) < 18 && P.onGround;
    const bob = Math.sin(T * 5) * 3;
    ctx.globalAlpha = near ? 1 : .55;
    text(near ? (TOUCH ? '🔍 RUMMAGE' : 'X = RUMMAGE') : '?', m.x + b.dir * 6 - cam, b.z - 52 + bob, near ? 18 : 22, near ? '#ffe27a' : '#fff', 'center', '#0a0a12', 4);
    ctx.globalAlpha = 1;
  }
}
function drawLid(l, cam) {
  const sx = l.x - cam; if (sx > W + 60 || sx < -60) return;
  ctx.save(); ctx.translate(sx, l.y);
  if (l.st === 'fly') ctx.rotate(l.rot);
  else if (l.st === 'wob') { ctx.rotate(Math.sin(l.wt) * l.wob * .35); }
  if (l.st !== 'fly') ctx.translate(0, -1);
  lidShape(CFG.binW, l.gold);
  ctx.restore();
}
function drawJunk(j, cam) {
  const sx = j.x - cam; if (sx > W + 20 || sx < -20) return;
  ctx.save(); ctx.translate(sx, j.y); ctx.rotate(j.rest ? Math.round(j.r / 3.14) * 3.14 + (j.c - .5) * .6 : j.r);
  switch (j.k) {
    case 'can': ctx.fillStyle = j.c < .5 ? '#c03a3a' : '#3a7ac0'; ctx.fillRect(-4, -6, 8, 12); ctx.fillStyle = '#ccc'; ctx.fillRect(-4, -6, 8, 2); break;
    case 'paper': ctx.fillStyle = j.c < .5 ? '#e8e4d8' : '#d8d0b0'; ctx.beginPath(); ctx.moveTo(-6, -3); ctx.lineTo(-1, -6); ctx.lineTo(6, -4); ctx.lineTo(5, 4); ctx.lineTo(-4, 5); ctx.fill(); break;
    case 'banana': ctx.strokeStyle = '#e8c838'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -6, 7, .3, 2.8); ctx.stroke(); ctx.strokeStyle = '#5a4a10'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -3); ctx.lineTo(8, -1); ctx.stroke(); break;
    case 'bone': ctx.strokeStyle = '#e8e0d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); for (let i = -4; i <= 4; i += 4) { ctx.moveTo(i, -4); ctx.lineTo(i, 4); } ctx.stroke(); ctx.fillStyle = '#e8e0d0'; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(11, -4); ctx.lineTo(11, 4); ctx.fill(); break;
    case 'bottle': ctx.fillStyle = 'rgba(60,160,80,.85)'; ctx.fillRect(-3, -9, 6, 13); ctx.fillRect(-1.5, -13, 3, 5); break;
    case 'apple': ctx.fillStyle = '#e8d8a0'; ctx.fillRect(-2, -6, 4, 10); ctx.fillStyle = '#c03030'; ell(0, -7, 4, 2.5); ctx.fill(); ell(0, 4, 4, 2.5); ctx.fill(); break;
    case 'bag': ctx.fillStyle = '#222'; ell(0, -5, 9, 7); ctx.fill(); ctx.fillStyle = '#444'; ctx.fillRect(-2, -14, 4, 4); break;
    case 'box': ctx.fillStyle = '#a07a4a'; ctx.fillRect(-6, -9, 12, 9); ctx.fillStyle = '#7a5a30'; ctx.fillRect(-6, -9, 12, 2); break;
  }
  ctx.restore();
}

// ----- the raccoon (side view, feet at 0, facing +x)
function drawRaccoon(x, y, face, o = {}) {
  ctx.save(); ctx.translate(x, y); ctx.scale(face, 1);
  const sq = o.squash || 1; ctx.scale(1 / Math.sqrt(sq), sq);
  const run = o.run || 0, air = o.air, a = o.anim || 0;
  if (o.rum) ctx.rotate(.55 + Math.sin(T * 30) * .05);
  const fur = '#8d93a0', dark = '#2b2d36', light = '#d8dbe2';
  // tail
  const sw = Math.sin(T * (o.rum ? 22 : 6)) * (o.rum ? .5 : .25);
  for (let i = 0; i < 7; i++) {
    const t = i / 6, tx = -20 - t * 26, ty = -18 - t * 16 - Math.sin(t * 3) * 6 + sw * t * 18;
    ctx.fillStyle = i % 2 ? dark : fur; ell(tx, ty, 8 - t * 2, 7 - t * 1.5); ctx.fill();
  }
  // legs
  ctx.strokeStyle = dark; ctx.lineWidth = 5; ctx.lineCap = 'round';
  const legs = [[-14, 0], [-7, Math.PI], [10, Math.PI], [17, 0]];
  for (const [lx0, ph] of legs) {
    const s = air ? (lx0 < 0 ? -.6 : .6) : Math.sin(a + ph) * run * .7;
    ctx.beginPath(); ctx.moveTo(lx0, -12); ctx.lineTo(lx0 + Math.sin(s) * 11, -12 + Math.cos(s) * 11 - (air ? 3 : 0)); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // body
  const bob = air ? 0 : Math.abs(Math.sin(a)) * run * 2;
  ctx.fillStyle = fur; ell(0, -20 - bob, 23, 12.5); ctx.fill();
  ctx.fillStyle = light; ell(4, -13 - bob, 14, 5); ctx.fill();
  // head
  const hy = -27 - bob;
  ctx.fillStyle = fur;
  ctx.beginPath(); ctx.moveTo(15, hy - 9); ctx.lineTo(17, hy - 19); ctx.lineTo(23, hy - 10); ctx.fill();
  ctx.beginPath(); ctx.moveTo(23, hy - 10); ctx.lineTo(28, hy - 18); ctx.lineTo(30, hy - 7); ctx.fill();
  ell(23, hy, 12, 10.5); ctx.fill();
  ctx.fillStyle = light; ell(31, hy + 3, 7, 5); ctx.fill(); ell(24, hy - 7, 7, 2.5); ctx.fill();
  ctx.fillStyle = '#16171d'; ctx.beginPath(); ctx.moveTo(14, hy - 2); ctx.quadraticCurveTo(24, hy - 7, 33, hy - 2); ctx.quadraticCurveTo(26, hy + 4, 14, hy + 2); ctx.fill();
  ctx.fillStyle = '#fff'; ell(27, hy - 2, 2.6, 2.4); ctx.fill();
  ctx.fillStyle = '#111'; ell(27.8, hy - 1.8, 1.3, 1.5); ctx.fill();
  ctx.fillStyle = '#111'; ell(37, hy + 2, 2.6, 2.2); ctx.fill();
  if (o.crown) {
    ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#6a4a08'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(15, hy - 12); ctx.lineTo(15, hy - 22); ctx.lineTo(19, hy - 17); ctx.lineTo(23, hy - 25); ctx.lineTo(27, hy - 17); ctx.lineTo(31, hy - 22); ctx.lineTo(31, hy - 12); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e83a5a'; ell(23, hy - 15, 2, 2); ctx.fill();
  }
  if (o.ninja) { ctx.fillStyle = '#c03030'; ctx.fillRect(13, hy - 6, 6, 3); ctx.beginPath(); ctx.moveTo(13, hy - 5); ctx.lineTo(4, hy - 10 + Math.sin(T * 12) * 3); ctx.lineTo(5, hy - 3); ctx.fill(); }
  ctx.restore();
}

// ----- humans (feet at 0, ~82px tall)
function drawHuman(h, cam) {
  const sx = h.x - cam; if (sx > W + 60 || sx < -60) return;
  shadow(sx, h.z, 20, .35);
  ctx.save(); ctx.translate(sx, h.z); ctx.scale(h.face, 1);
  const moving = Math.abs(h.vx) > 5, a = h.anim, stunned = h.st === 'stun';
  if (stunned) ctx.rotate(Math.sin(T * 6) * .08);
  const skin = h.type === 'granny' ? '#e8c4a8' : h.hair < .5 ? '#e0b090' : '#9a6a48';
  const pj = PJ[h.type];
  // legs
  ctx.strokeStyle = h.type === 'catcher' || h.type === 'watch' ? '#3a3a48' : '#d8cfc0'; ctx.lineWidth = 7; ctx.lineCap = 'round';
  const s = moving ? Math.sin(a) * .6 : 0;
  ctx.beginPath(); ctx.moveTo(-3, -30); ctx.lineTo(-3 + Math.sin(s) * 18, -30 + Math.cos(s) * 26); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(3, -30); ctx.lineTo(3 - Math.sin(s) * 18, -30 + Math.cos(s) * 26); ctx.stroke();
  ctx.fillStyle = h.type === 'catcher' ? '#222' : h.type === 'mum' ? '#ff9ad0' : '#7a5040';
  ell(-3 + Math.sin(s) * 18 + 4, -3, 7, 4); ctx.fill(); ell(3 - Math.sin(s) * 18 + 4, -3, 7, 4); ctx.fill();
  ctx.lineCap = 'butt';
  // body (dressing gown / uniform)
  ctx.fillStyle = pj; rr(-14, -64, 28, 40, 8); ctx.fill();
  if (h.type === 'dad') { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.beginPath(); for (let y = -60; y < -26; y += 7) { ctx.moveTo(-14, y); ctx.lineTo(14, y); } ctx.stroke(); }
  if (h.type === 'watch') { ctx.fillStyle = '#c0c0c0'; ctx.fillRect(-14, -50, 28, 3); ctx.fillRect(-14, -38, 28, 3); }
  if (h.type === 'catcher') { ctx.fillStyle = '#ff9a3a'; ctx.fillRect(-14, -50, 28, 5); ctx.fillStyle = '#e8d070'; ell(6, -56, 4, 4); ctx.fill(); }
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-14, -42, 28, 4);
  // head
  ctx.fillStyle = skin; ell(0, -73, 10, 11); ctx.fill();
  ctx.fillStyle = '#111'; ell(5, -75, 1.6, 2); ctx.fill();
  if (stunned) { ctx.strokeStyle = '#111'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(2, -78); ctx.lineTo(8, -72); ctx.moveTo(8, -78); ctx.lineTo(2, -72); ctx.stroke(); }
  ctx.strokeStyle = '#5a2a2a'; ctx.lineWidth = 2; ctx.beginPath();
  if (h.st === 'chase' || h.st === 'swing' || h.st === 'grab') { ctx.moveTo(3, -67); ctx.lineTo(9, -67); } else { ctx.arc(6, -65, 3, Math.PI * 1.1, Math.PI * 1.9); }
  ctx.stroke();
  if (h.st === 'chase') { ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.moveTo(2, -81); ctx.lineTo(9, -78); ctx.stroke(); }
  // hair / hats
  if (h.type === 'dad') { ctx.fillStyle = '#4a3a2a'; ctx.beginPath(); ctx.arc(0, -76, 10.5, Math.PI, Math.PI * 1.9); ctx.fill(); }
  else if (h.type === 'mum') {
    ctx.fillStyle = '#8a4a2a'; ctx.beginPath(); ctx.arc(-1, -75, 11.5, Math.PI * .8, Math.PI * 1.9); ctx.fill();
    ctx.fillStyle = '#ff9ad0'; for (const [cx, cy] of [[-8, -82], [-1, -86], [6, -84], [-10, -74]]) { ell(cx, cy, 3.5, 2.5, .5); ctx.fill(); }
  } else if (h.type === 'granny') {
    ctx.fillStyle = '#d8d8e0'; ctx.beginPath(); ctx.arc(-1, -76, 11, Math.PI * .85, Math.PI * 1.95); ctx.fill(); ell(-10, -82, 6, 6); ctx.fill();
    ctx.strokeStyle = '#222'; ctx.lineWidth = 1.2; ell(5, -75, 3.5, 3); ctx.stroke();
  } else {
    ctx.fillStyle = h.type === 'watch' ? '#2a3a6a' : '#3a4a2a'; ctx.fillRect(-11, -86, 22, 8); ctx.fillRect(0, -80, 16, 3);
  }
  // arms + held thing
  ctx.strokeStyle = pj; ctx.lineWidth = 6; ctx.lineCap = 'round';
  const reach = h.st === 'chase' || h.st === 'grab';
  if (h.type === 'catcher') {
    const sw = h.st === 'swing' ? (h.t < .42 ? -1.6 * (h.t / .42) : -1.6 + (h.t - .42) * 7) : -.3;
    const ang = clamp(sw, -1.6, 1.2);
    ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(12, -50); ctx.stroke();
    ctx.save(); ctx.translate(12, -50); ctx.rotate(ang);
    ctx.strokeStyle = '#6a5030'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(70, 0); ctx.stroke();
    ctx.strokeStyle = '#ddd'; ctx.lineWidth = 2; ell(84, 0, 15, 11); ctx.stroke();
    ctx.strokeStyle = 'rgba(220,220,220,.5)'; ctx.lineWidth = 1; ctx.beginPath();
    for (let i = -10; i <= 10; i += 5) { ctx.moveTo(84 + i, -10); ctx.lineTo(84 + i * .5, 12); }
    ctx.stroke(); ctx.restore();
  } else {
    const sw2 = reach ? Math.sin(a * 2) * .3 : 0;
    ctx.beginPath(); ctx.moveTo(0, -58); ctx.lineTo(reach ? 20 : 6, reach ? -60 + sw2 * 10 : -38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2, -58); ctx.lineTo(reach ? 18 : -6, reach ? -52 - sw2 * 10 : -38); ctx.stroke();
    if (h.type === 'dad' || h.type === 'watch') { ctx.fillStyle = '#333'; ctx.fillRect(18, -64, 10, 6); lights.push({ x: sx + h.face * 28, y: h.z - 61, cone: h.face, a: .55 }); }
    if (h.type === 'granny') { ctx.strokeStyle = '#a07a4a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8, -70); ctx.lineTo(-14, -2); ctx.stroke(); ctx.fillStyle = '#c8a050'; ctx.beginPath(); ctx.moveTo(-14, -6); ctx.lineTo(-24, 0); ctx.lineTo(-4, 0); ctx.fill(); }
    if (h.type === 'mum') { ctx.fillStyle = '#c8a070'; ctx.save(); ctx.translate(20, -58); ctx.rotate(-.6 + sw2); ctx.fillRect(-3, -14, 6, 22); ctx.restore(); }
  }
  ctx.lineCap = 'butt';
  ctx.restore();
  if (stunned) for (let i = 0; i < 3; i++) { const an = T * 5 + i * 2.1; text('★', sx + Math.cos(an) * 14, h.z - 92 + Math.sin(an) * 4, 13, '#ffe27a', 'center', '#0a0a12', 3); }
  if (h.st === 'search') text('?', sx, h.z - 100, 24, '#fff');
  if (h.st === 'chase' && !reachable(h) && Math.abs(P.x - h.x) < 70) text('!', sx + h.face * 4, h.z - 100, 24, '#ff6a5a');
  if (h.sayT > 0) bubble(h.say, sx, h.z - 106);
}
function bubble(t, x, y) {
  ctx.font = FONT(16); const w = ctx.measureText(t).width + 16;
  x = clamp(x, w / 2 + 6, W - w / 2 - 6);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 2.5;
  rr(x - w / 2, y - 26, w, 24, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x - 5, y - 3); ctx.lineTo(x, y + 6); ctx.lineTo(x + 5, y - 3); ctx.fill();
  ctx.fillStyle = '#0a0a12'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y - 13);
}
function drawVan(v, cam) {
  const sx = v.x - cam; if (sx > W + 300 || sx < -260) return;
  const y = H - 2;
  shadow(sx + 106, y - 2, 110, .4);
  ctx.fillStyle = '#e8e4da'; rr(sx + 42, y - 82, 170, 66, 8); ctx.fill();
  rr(sx, y - 62, 52, 46, 8); ctx.fill();
  ctx.fillStyle = '#1b2236'; rr(sx + 10, y - 58, 30, 20, 4); ctx.fill();
  ctx.fillStyle = '#ff8a2a'; ctx.fillRect(sx, y - 46, 212, 8);
  ctx.fillStyle = '#c84a1a'; ctx.font = FONT(15); ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText('ANIMAL CONTROL', sx + 66, y - 64);
  ctx.fillStyle = '#ffe9a0'; ctx.fillRect(sx + 1, y - 40, 7, 8);
  const on = Math.floor(v.flash * 6) % 2;
  ctx.fillStyle = on ? '#ff3a2a' : '#3a6aff'; rr(sx + 112, y - 92, 40, 10, 3); ctx.fill();
  lights.push({ x: sx + 132, y: y - 90, r: 140, a: .6, glow: true, col: on ? 'rgba(255,60,40,.35)' : 'rgba(60,100,255,.35)' });
  for (const wx of [sx + 32, sx + 176]) { ctx.fillStyle = '#111'; ell(wx, y - 14, 15, 15); ctx.fill(); ctx.fillStyle = '#888'; ell(wx, y - 14, 6, 6); ctx.fill(); }
}
function shadow(x, y, r, a) { ctx.fillStyle = `rgba(0,0,0,${a})`; ell(x, y, r, r * .28); ctx.fill(); }
function drawCage(x, y) {
  ctx.save(); ctx.translate(x, y);
  ctx.strokeStyle = '#c8ccd4'; ctx.lineWidth = 3;
  ctx.strokeRect(-40, -56, 80, 56);
  ctx.lineWidth = 2; ctx.beginPath();
  for (let i = -30; i <= 30; i += 10) { ctx.moveTo(i, -56); ctx.lineTo(i, 0); }
  ctx.moveTo(-40, -28); ctx.lineTo(40, -28); ctx.stroke();
  ctx.strokeStyle = '#8a8f9a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, -56, 12, Math.PI, 0); ctx.stroke();
  ctx.restore();
}

// ----- night lighting: darken everything, then cut holes for lamps, windows and torches
function drawLighting() {
  lx.globalCompositeOperation = 'source-over'; lx.clearRect(0, 0, W, H);
  lx.fillStyle = 'rgba(4,6,26,.6)'; lx.fillRect(0, 0, W, H);
  lx.globalCompositeOperation = 'destination-out';
  const hole = (x, y, r, a) => {
    const g = lx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(0,0,0,${a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    lx.fillStyle = g; lx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  for (const l of lights) {
    if (l.cone === true) { hole(l.x, BACK + 60, 170, l.a * .9); hole(l.x, l.y + 60, l.r * .7, l.a * .6); }
    else if (l.cone) {
      const g = lx.createRadialGradient(l.x, l.y, 0, l.x, l.y, 220);
      g.addColorStop(0, `rgba(0,0,0,${l.a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      lx.fillStyle = g; lx.beginPath(); lx.moveTo(l.x, l.y); lx.lineTo(l.x + l.cone * 220, l.y - 50); lx.lineTo(l.x + l.cone * 220, l.y + 90); lx.fill();
    } else hole(l.x, l.y, l.r, l.a);
  }
  if (mode === 'play' || mode === 'caught') hole(P.x - G.cam, P.y - 20, 110, .45);
  ctx.drawImage(lc, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    if (!l.glow) continue;
    const r = l.cone ? 60 : 40, g = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
    g.addColorStop(0, l.col || 'rgba(255,220,140,.4)'); g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g; ctx.fillRect(l.x - r, l.y - r, r * 2, r * 2);
    if (l.cone === true) {
      const cg = ctx.createLinearGradient(0, l.y, 0, BACK + 100);
      cg.addColorStop(0, 'rgba(255,220,140,.14)'); cg.addColorStop(1, 'rgba(255,220,140,.02)');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(l.x - 8, l.y); ctx.lineTo(l.x + 8, l.y); ctx.lineTo(l.x + 110, BACK + 100); ctx.lineTo(l.x - 110, BACK + 100); ctx.fill();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

function drawWorld(cam, actors) {
  lights = [];
  drawSky(cam); drawFar(cam); drawGround(cam);
  for (const l of lots) drawHouse(l.house, cam);
  for (const l of lots) { if (l.tree) drawTree(l.tree, cam); if (l.hedge) drawHedge(l.hedge, cam); if (l.fence) drawFence(l.fence, cam); if (l.car) drawCar(l.car, cam); if (l.lamp) drawLamp(l.lamp, cam); }
  const list = [];
  for (const j of junk) if (j.x > cam - 20 && j.x < cam + W + 20) list.push([j.z - 30, () => drawJunk(j, cam)]);
  for (const b of bins) list.push([b.z, () => drawBin(b, cam)]);
  for (const l of lids) list.push([l.z + .5, () => drawLid(l, cam)]);
  if (actors) {
    for (const h of humans) list.push([h.z + .2, () => drawHuman(h, cam)]);
    for (const v of vans) list.push([H, () => drawVan(v, cam)]);
    list.push([P.z + .1, () => drawPlayer(cam)]);
  }
  list.sort((a, b) => a[0] - b[0]);
  for (const e of list) e[1]();
}
function drawPlayer(cam) {
  const sx = P.x - cam;
  shadow(sx, P.z - P.sup, 22 * (1 - Math.min(.5, (P.h - P.sup) / 300)), .4);
  const flicker = P.inv > 0 && Math.floor(T * 20) % 2;
  if (!flicker) {
    if (P.pw.ninja > 0) ctx.globalAlpha = .45;
    drawRaccoon(sx, P.y, P.face, { run: clamp(Math.hypot(P.vx, P.vz) / CFG.run, 0, 1.3), anim: P.anim, air: !P.onGround && mode === 'play', squash: P.squash, rum: !!P.rum, crown: G.rank === RANKS.length - 1, ninja: P.pw.ninja > 0 });
    ctx.globalAlpha = 1;
  }
  if (P.butter) { ctx.fillStyle = `rgba(255,230,120,${.15 + .1 * Math.sin(T * 6)})`; ell(sx, P.y - 20, 34, 26); ctx.fill(); }
  if (mode === 'caught') drawCage(sx, C.cageY);
}

// ----- item icons (for loot popups and the HUD)
function drawItem(id, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s); ctx.lineWidth = 2; ctx.strokeStyle = '#0a0a12';
  const P2 = (pts, fill) => { ctx.fillStyle = fill; ctx.beginPath(); pts.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath(); ctx.fill(); ctx.stroke(); };
  switch (id) {
    case 'pizza': P2([[-12, -10], [12, -10], [0, 14]], '#f0c050'); ctx.fillStyle = '#c84030'; ell(-3, -3, 3, 3); ctx.fill(); ell(4, -5, 2.5, 2.5); ctx.fill(); ctx.fillStyle = '#b07030'; ctx.fillRect(-13, -13, 26, 4); break;
    case 'fish': ctx.strokeStyle = '#eee'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(10, 0); for (let i = -8; i < 8; i += 4) { ctx.moveTo(i, -6); ctx.lineTo(i + 2, 6); } ctx.stroke(); P2([[10, 0], [16, -7], [16, 7]], '#eee'); ctx.fillStyle = '#ccc'; ell(-13, 0, 5, 5); ctx.fill(); break;
    case 'donut': ctx.fillStyle = '#c8904a'; ell(0, 0, 13, 13); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ff8ac8'; ell(0, -1, 11, 10); ctx.fill(); ctx.fillStyle = '#20232f'; ell(0, 0, 4, 4); ctx.fill(); break;
    case 'chicken': ctx.fillStyle = '#c87a3a'; ell(-3, -3, 10, 8, -.5); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#eee'; ctx.fillRect(4, 2, 8, 4); ell(13, 2, 3, 3); ctx.fill(); ell(13, 6, 3, 3); ctx.fill(); break;
    case 'apple': ctx.fillStyle = '#f0e0b0'; ctx.fillRect(-4, -8, 8, 16); ctx.fillStyle = '#c83030'; ell(0, -10, 8, 4); ctx.fill(); ell(0, 10, 8, 4); ctx.fill(); break;
    case 'sandwich': P2([[-13, 8], [13, 8], [-13, -12]], '#e8d090'); ctx.fillStyle = '#5ab04a'; ctx.fillRect(-13, 2, 22, 3); break;
    case 'sock': P2([[-6, -14], [4, -14], [4, 4], [12, 8], [10, 14], [-6, 12]], '#d8d0a0'); ctx.fillStyle = '#8a8'; for (let i = 0; i < 3; i++) { ctx.fillText('~', -10 + i * 8, -18 - i * 2); } break;
    case 'coin': ctx.fillStyle = '#ffd040'; ell(0, 0, 12, 12); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#c89a20'; ctx.font = FONT(16); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('$', 0, 1); break;
    case 'spoon': ctx.fillStyle = '#dde'; ell(0, -8, 6, 8); ctx.fill(); ctx.stroke(); ctx.fillRect(-1.5, 0, 3, 14); break;
    case 'ring': ctx.strokeStyle = '#ffd040'; ctx.lineWidth = 4; ell(0, 3, 10, 10); ctx.stroke(); P2([[-5, -8], [5, -8], [0, -14]], '#8ef'); P2([[-5, -8], [5, -8], [0, -2]], '#5ce'); break;
    case 'watch': ctx.fillStyle = '#a07030'; ctx.fillRect(-5, -16, 10, 32); ctx.fillStyle = '#ffd040'; ell(0, 0, 10, 10); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ell(0, 0, 7, 7); ctx.fill(); ctx.strokeStyle = '#111'; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -5); ctx.moveTo(0, 0); ctx.lineTo(4, 1); ctx.stroke(); break;
    case 'gem': P2([[-12, -4], [-6, -11], [6, -11], [12, -4], [0, 13]], '#8ef'); ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.moveTo(-12, -4); ctx.lineTo(12, -4); ctx.moveTo(-4, -4); ctx.lineTo(0, 13); ctx.stroke(); break;
    case 'zoom': ctx.fillStyle = '#d83030'; rr(-8, -14, 16, 28, 3); ctx.fill(); ctx.stroke(); P2([[2, -10], [-4, 1], [1, 1], [-2, 10], [5, -2], [0, -2]], '#ffe040'); break;
    case 'spring': ctx.strokeStyle = '#ccc'; ctx.lineWidth = 3; ctx.beginPath(); for (let i = 0; i < 5; i++) { ctx.moveTo(-8, 8 - i * 4); ctx.lineTo(8, 6 - i * 4); } ctx.stroke(); ctx.fillStyle = '#3a8ae8'; rr(-12, -14, 24, 9, 4); ctx.fill(); ctx.strokeStyle = '#0a0a12'; ctx.lineWidth = 2; ctx.stroke(); break;
    case 'stink': P2([[-13, 10], [13, 10], [13, -2], [-13, 6]], '#f0d040'); ctx.fillStyle = '#c8a020'; ell(-4, 5, 2, 2); ctx.fill(); ell(6, 4, 2.5, 2); ctx.fill(); ctx.strokeStyle = '#8c4'; ctx.beginPath(); for (let i = -6; i <= 6; i += 6) { ctx.moveTo(i, -4); ctx.quadraticCurveTo(i + 4, -10, i, -16); } ctx.stroke(); break;
    case 'ninja': ctx.fillStyle = '#222'; rr(-14, -6, 28, 12, 5); ctx.fill(); ctx.fillStyle = '#fff'; ell(-6, 0, 3, 2); ctx.fill(); ell(6, 0, 3, 2); ctx.fill(); ctx.fillStyle = '#c03030'; ctx.fillRect(12, -4, 8, 3); break;
    case 'butter': ctx.fillStyle = '#e8e0c8'; rr(-13, -6, 26, 16, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#ffe070'; rr(-10, -12, 20, 8, 3); ctx.fill(); ctx.stroke(); break;
  }
  ctx.restore();
}

function drawHUD() {
  // score
  text(String(G.score), 20, 32, 38, '#fff', 'left');
  ctx.font = FONT(14); ctx.fillStyle = '#c8cce0'; ctx.textAlign = 'left'; ctx.fillText('SCORE', 22, 58);
  // rank
  const r = G.rank, nxt = RANKS[r + 1];
  const king = r === RANKS.length - 1;
  text(RANKS[r][1], W / 2, 26, 26, king ? '#ffcf3a' : '#fff');
  if (nxt) {
    const p = (G.knocked - RANKS[r][0]) / (nxt[0] - RANKS[r][0]);
    ctx.fillStyle = 'rgba(0,0,0,.5)'; rr(W / 2 - 90, 44, 180, 10, 5); ctx.fill();
    ctx.fillStyle = '#ffcf3a'; rr(W / 2 - 90, 44, 180 * clamp(p, 0, 1), 10, 5); ctx.fill();
    ctx.font = FONT(12); ctx.fillStyle = '#c8cce0'; ctx.textAlign = 'center'; ctx.fillText(`next: ${nxt[1]} (${nxt[0] - G.knocked} bins)`, W / 2, 66);
  }
  // bins
  ctx.save(); ctx.translate(W - 100, 50); ctx.scale(.5, .5); binBody(CFG.binW, CFG.binH, false, 0, false); ctx.translate(0, -CFG.binH - 2); lidShape(CFG.binW, false); ctx.restore();
  text('× ' + G.knocked, W - 82, 34, 30, '#fff', 'left');
  ctx.font = FONT(14); ctx.fillStyle = '#c8cce0'; ctx.textAlign = 'right'; ctx.fillText('BEST ' + Math.max(G.best, G.score), W - 20, 64);
  // power-ups
  let px = 30;
  for (const k of ['zoom', 'spring', 'stink', 'ninja']) {
    if (P.pw[k] <= 0) continue;
    ctx.fillStyle = 'rgba(0,0,0,.45)'; ell(px, 92, 20, 20); ctx.fill();
    drawItem(k, px, 92, .9);
    ctx.strokeStyle = '#8ef'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(px, 92, 20, -Math.PI / 2, -Math.PI / 2 + 6.283 * P.pw[k] / LOOT[k].d); ctx.stroke();
    px += 48;
  }
  if (P.butter) { ctx.fillStyle = 'rgba(0,0,0,.45)'; ell(px, 92, 20, 20); ctx.fill(); drawItem('butter', px, 92, .9); }
}

function drawPlay() {
  const cam = G.cam + (G.shake > .3 ? rand(-G.shake, G.shake) : 0);
  ctx.save();
  if (G.shake > .3) ctx.translate(0, rand(-G.shake, G.shake) * .6);
  drawWorld(cam, true);
  if (P.pw.stink > 0 && Math.random() < .3) parts.push({ x: P.x + rand(-20, 20), y: P.y - rand(10, 40), vx: rand(-10, 10), vy: -20, life: .8, t: 0, r: rand(5, 9), col: 'rgba(150,200,60,.35)', k: 'puff' });
  for (const p of parts) {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = k; ctx.fillStyle = p.col; ell(p.x - cam, p.y, p.r * (p.k === 'puff' ? 2 - k : 1), p.r * (p.k === 'puff' ? 2 - k : 1)); ctx.fill();
  }
  ctx.globalAlpha = 1;
  drawLighting();
  ctx.restore();

  for (const f of floats) {
    const a = clamp((f.big ? 2.2 : 1) - f.t, 0, 1) * 1.5;
    ctx.globalAlpha = clamp(a, 0, 1);
    const fx = f.screen ? f.x : f.x - G.cam;
    if (f.item) { drawItem(f.item, fx, f.y - 34, 1.4 + Math.min(.4, f.t * 3) - .4 * Math.max(0, .3 - f.t)); }
    text(f.txt, fx, f.y, f.big ? 24 : 20, f.col);
    if (f.sub) text(f.sub, fx, f.y + 22, 15, '#cfe');
    ctx.globalAlpha = 1;
  }
  drawHUD();
  if (G.banner) {
    const b = G.banner, s = Math.min(1, b.t * 4), a = clamp(2.6 - b.t, 0, 1);
    ctx.globalAlpha = a;
    ctx.save(); ctx.translate(W / 2, 170); ctx.scale(s, s); ctx.rotate(-.04);
    text(b.sub, 0, -36, 22, '#fff'); text(b.txt, 0, 4, 54, '#ffcf3a', 'center', '#0a0a12', 7);
    if (G.rank === RANKS.length - 1) { ctx.save(); ctx.translate(0, -90); ctx.scale(3, 3); drawRaccoon(-24, 0, 1, { crown: true }); ctx.restore(); }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  if (G.hint > 0 && mode === 'play') {
    ctx.globalAlpha = clamp(G.hint, 0, 1);
    text('Line up with a bin and run into it!', W / 2, 112, 26, '#fff');
    text('↑ ↓ to dodge the humans', W / 2, 140, 20, '#cfe');
    ctx.globalAlpha = 1;
  }
  if (mode === 'caught' && C.t > 1.7) { ctx.fillStyle = `rgba(0,0,0,${clamp((C.t - 1.7) / .7, 0, 1)})`; ctx.fillRect(0, 0, W, H); }
}

// ----- the big bandit face (title screen and mugshot)
function drawFace(cx, cy, s, o = {}) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  const fur = '#959baa', dark = '#1b1c23', white = '#eef0f4', line = '#14151b';
  ctx.lineJoin = 'round';
  // ears
  for (const m of [-1, 1]) {
    ctx.fillStyle = fur; ctx.strokeStyle = line; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(m * 42, -82); ctx.quadraticCurveTo(m * 92, -150, m * 102, -128); ctx.quadraticCurveTo(m * 108, -84, m * 92, -48); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#3a3238'; ctx.beginPath(); ctx.moveTo(m * 56, -82); ctx.quadraticCurveTo(m * 88, -126, m * 94, -116); ctx.quadraticCurveTo(m * 96, -88, m * 86, -62); ctx.closePath(); ctx.fill();
    ctx.fillStyle = white; ctx.beginPath(); ctx.moveTo(m * 94, -130); ctx.quadraticCurveTo(m * 104, -128, m * 104, -112); ctx.lineTo(m * 96, -114); ctx.fill();
  }
  // head with cheek tufts
  ctx.fillStyle = fur; ctx.strokeStyle = line; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -100);
  ctx.quadraticCurveTo(72, -102, 96, -40);
  ctx.lineTo(128, -14); ctx.lineTo(104, -4); ctx.lineTo(134, 22); ctx.lineTo(100, 26); ctx.lineTo(118, 50); ctx.lineTo(78, 46);
  ctx.quadraticCurveTo(44, 92, 0, 94);
  ctx.quadraticCurveTo(-44, 92, -78, 46);
  ctx.lineTo(-118, 50); ctx.lineTo(-100, 26); ctx.lineTo(-134, 22); ctx.lineTo(-104, -4); ctx.lineTo(-128, -14); ctx.lineTo(-96, -40);
  ctx.quadraticCurveTo(-72, -102, 0, -100);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // forehead stripe
  ctx.fillStyle = '#6e7482'; ctx.beginPath(); ctx.moveTo(-10, -98); ctx.quadraticCurveTo(0, -60, 0, -30); ctx.quadraticCurveTo(0, -60, 10, -98); ctx.fill();
  // white cheeks + muzzle
  ctx.fillStyle = white;
  ctx.beginPath(); ctx.moveTo(-96, 6); ctx.quadraticCurveTo(-60, 26, -30, 20); ctx.quadraticCurveTo(-40, 70, -6, 84); ctx.quadraticCurveTo(-50, 82, -78, 44); ctx.lineTo(-108, 38); ctx.lineTo(-92, 24); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(96, 6); ctx.quadraticCurveTo(60, 26, 30, 20); ctx.quadraticCurveTo(40, 70, 6, 84); ctx.quadraticCurveTo(50, 82, 78, 44); ctx.lineTo(108, 38); ctx.lineTo(92, 24); ctx.closePath(); ctx.fill();
  ell(0, 46, 42, 36); ctx.fill();
  // eyebrows (white fur over the mask) — angled for a scheming look
  const sad = o.sad ? 1 : 0, surprise = o.surprise ? 1 : 0;
  for (const m of [-1, 1]) {
    ctx.fillStyle = white; ctx.beginPath();
    const inner = -40 + 10 * (1 - sad) - surprise * 14, outer = -52 - 6 * sad - surprise * 8;
    ctx.moveTo(m * 14, inner); ctx.quadraticCurveTo(m * 50, outer - 14, m * 88, outer + 8); ctx.quadraticCurveTo(m * 50, outer - 2, m * 14, inner + 9); ctx.fill();
  }
  // the bandit mask
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.moveTo(-112, -4); ctx.quadraticCurveTo(-82, -44, -40, -36); ctx.quadraticCurveTo(-14, -30, 0, -20);
  ctx.quadraticCurveTo(14, -30, 40, -36); ctx.quadraticCurveTo(82, -44, 112, -4);
  ctx.quadraticCurveTo(88, 34, 50, 24); ctx.quadraticCurveTo(20, 14, 0, 10);
  ctx.quadraticCurveTo(-20, 14, -50, 24); ctx.quadraticCurveTo(-88, 34, -112, -4);
  ctx.fill();
  // eyes
  const look = o.look || 0;
  for (const m of [-1, 1]) {
    const ex = m * 46, ey = -6;
    const wink = o.wink && m === 1;
    if (wink) { ctx.strokeStyle = white; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ex - 14, ey); ctx.quadraticCurveTo(ex, ey + 8, ex + 14, ey); ctx.stroke(); continue; }
    const rr2 = surprise ? 17 : 15;
    ctx.fillStyle = '#fffbea'; ell(ex, ey, rr2, rr2 - 1); ctx.fill();
    ctx.fillStyle = '#2a1a10'; ell(ex + look * 6, ey + 1, surprise ? 5 : 8, surprise ? 5 : 9); ctx.fill();
    ctx.fillStyle = '#000'; ell(ex + look * 6, ey + 1, surprise ? 3 : 4.5, surprise ? 3 : 5); ctx.fill();
    ctx.fillStyle = '#fff'; ell(ex + look * 6 - 3, ey - 3, 2.6, 2.6); ctx.fill();
    // heavy eyelid = shifty
    if (!surprise) {
      ctx.fillStyle = dark; ctx.beginPath();
      const lid = sad ? -6 : 2;
      ctx.moveTo(ex - 17, ey - 18); ctx.lineTo(ex + 17, ey - 18); ctx.lineTo(ex + 17, ey + (m === 1 ? lid - 4 : lid - 8) + (sad ? m * 4 : -m * 4)); ctx.lineTo(ex - 17, ey + (m === 1 ? lid - 8 : lid - 4) - (sad ? m * 4 : -m * 4)); ctx.fill();
    }
  }
  // nose
  ctx.fillStyle = '#121216'; ctx.beginPath(); ctx.moveTo(-17, 30); ctx.quadraticCurveTo(0, 22, 17, 30); ctx.quadraticCurveTo(10, 46, 0, 47); ctx.quadraticCurveTo(-10, 46, -17, 30); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.55)'; ell(-6, 31, 5, 2.5); ctx.fill();
  // mouth
  ctx.strokeStyle = line; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 47); ctx.lineTo(0, 56);
  if (surprise) { ctx.stroke(); ctx.fillStyle = '#3a1418'; ell(0, 66, 9, 11); ctx.fill(); ctx.stroke(); }
  else if (sad) { ctx.moveTo(-26, 66); ctx.quadraticCurveTo(0, 50, 26, 66); ctx.stroke(); }
  else {
    ctx.moveTo(-30, 54); ctx.quadraticCurveTo(-12, 64, 0, 56); ctx.quadraticCurveTo(18, 66, 38, 46); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, 60); ctx.lineTo(20, 60); ctx.lineTo(17, 69); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.lineCap = 'butt';
  // whiskers
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2;
  for (const m of [-1, 1]) for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(m * 34, 44 + i * 7); ctx.lineTo(m * (90 + i * 6), 34 + i * 14); ctx.stroke(); }
  // headwear
  if (o.crown) {
    ctx.save(); ctx.translate(18, -104); ctx.rotate(.14);
    ctx.fillStyle = '#ffcf3a'; ctx.strokeStyle = '#5a3a06'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-50, 14); ctx.lineTo(-56, -36); ctx.lineTo(-28, -10); ctx.lineTo(0, -48); ctx.lineTo(28, -10); ctx.lineTo(56, -36); ctx.lineTo(50, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#e8304a'; ell(0, -2, 7, 7); ctx.fill(); ctx.fillStyle = '#3ac8e8'; ell(-32, 2, 5, 5); ctx.fill(); ell(32, 2, 5, 5); ctx.fill();
    ctx.fillStyle = '#fff6b0'; ell(-56, -38, 4, 4); ctx.fill(); ell(0, -50, 5, 5); ctx.fill(); ell(56, -38, 4, 4); ctx.fill();
    ctx.restore();
  }
  if (o.cap) {
    ctx.save(); ctx.translate(0, -96);
    ctx.beginPath(); ctx.moveTo(-62, 10); ctx.quadraticCurveTo(-60, -36, 0, -38); ctx.quadraticCurveTo(60, -36, 62, 10); ctx.closePath();
    ctx.save(); ctx.clip();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#15161c' : '#f4f4f0'; ctx.fillRect(-70, -40 + i * 9, 140, 9); }
    ctx.restore();
    ctx.strokeStyle = line; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}
function drawTorso(cx, cy, s, stripes) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.beginPath(); ctx.moveTo(-70, 60); ctx.quadraticCurveTo(-150, 90, -165, 240); ctx.lineTo(165, 240); ctx.quadraticCurveTo(150, 90, 70, 60); ctx.closePath();
  if (stripes) {
    ctx.save(); ctx.clip();
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#15161c' : '#f4f4f0'; ctx.fillRect(-170, 58 + i * 20, 340, 20); }
    ctx.restore();
  } else { ctx.fillStyle = '#7d8392'; ctx.fill(); }
  ctx.strokeStyle = '#14151b'; ctx.lineWidth = 5; ctx.stroke();
  if (stripes) {
    ctx.fillStyle = '#f4f4f0'; ctx.strokeStyle = '#14151b'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-40, 66); ctx.lineTo(0, 110); ctx.lineTo(40, 66); ctx.lineTo(20, 64); ctx.lineTo(0, 86); ctx.lineTo(-20, 64); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

let titleCam = 0;
const TITLE_BINS = [];
function drawTitle() {
  // a slowly panning street in the background
  if (!G) resetWorld();
  G.cam = titleCam; ensureWorld();
  drawWorld(titleCam, false);
  drawLighting();
  ctx.fillStyle = 'rgba(5,6,20,.45)'; ctx.fillRect(0, 0, W, H);
  // raccoon face peeking over a giant bin
  const bob = Math.sin(T * 1.6) * 6, look = Math.sin(T * .9) > .3 ? 1 : Math.sin(T * .9) < -.3 ? -1 : 0;
  const sp = ctx.createRadialGradient(480, 320, 40, 480, 320, 330);
  sp.addColorStop(0, 'rgba(255,230,150,.25)'); sp.addColorStop(1, 'rgba(255,230,150,0)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
  drawFace(480, 350 + bob, 1.18, { crown: true, look, wink: (T % 6) > 5.6 });
  ctx.save(); ctx.translate(480, H + 20); ctx.scale(5.6, 2.6);
  binBody(CFG.binW, CFG.binH, false, 0, true);
  ctx.restore();
  // paws gripping the rim
  for (const m of [-1, 1]) {
    ctx.fillStyle = '#3a3c46'; ctx.strokeStyle = '#14151b'; ctx.lineWidth = 4;
    ell(480 + m * 78, H + 20 - 2.6 * CFG.binH - 4, 26, 15); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(480 + m * 78 + i * 10, H + 20 - 2.6 * CFG.binH - 14); ctx.lineTo(480 + m * 78 + i * 10, H + 20 - 2.6 * CFG.binH - 4); ctx.stroke(); }
  }
  // title
  ctx.save(); ctx.translate(480, 82); ctx.rotate(-.035);
  ctx.font = FONT(96); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.fillStyle = '#0a0a12'; ctx.fillText('KING OF THE BINS', 8, 8);
  ctx.fillStyle = '#ff4d3a'; ctx.fillText('KING OF THE BINS', 4, 4);
  ctx.lineWidth = 8; ctx.strokeStyle = '#0a0a12'; ctx.strokeText('KING OF THE BINS', 0, 0);
  ctx.fillStyle = '#ffcf3a'; ctx.fillText('KING OF THE BINS', 0, 0);
  ctx.restore();
  text('Knock them over. Rummage for treasure. Don\'t get caught!', 480, 150, 24, '#fff');
  const best = loadBest();
  if (best) text('BEST: ' + best, W - 20, H - 24, 22, '#ffcf3a', 'right');
}

function drawEnding() {
  const t = E.t, sh = E.shake > .5 ? rand(-E.shake, E.shake) : 0;
  ctx.save(); ctx.translate(sh, sh * .5);
  // mugshot wall with a height chart measured in bins
  ctx.fillStyle = '#3c4560'; ctx.fillRect(-20, -20, W + 40, H + 40);
  ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
  ctx.font = FONT(16); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 9; i++) {
    const y = H - 30 - i * 60; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    ctx.fillText(i + (i === 1 ? ' BIN' : ' BINS'), 10, y - 12);
    for (let j = 1; j < 4; j++) { ctx.beginPath(); ctx.moveTo(0, y - j * 15); ctx.lineTo(20, y - j * 15); ctx.stroke(); }
  }
  const sp = ctx.createRadialGradient(340, 260, 60, 340, 260, 460);
  sp.addColorStop(0, 'rgba(255,250,220,.25)'); sp.addColorStop(1, 'rgba(0,0,10,.55)');
  ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
  // the raccoon
  const stripes = t >= 1.3, barsT = t - 2.4;
  const look = t < 1.3 ? (Math.sin(t * 7) > 0 ? -1 : 1) : 0;
  const zoom = 1 + Math.min(1, t / 1.3) * .05;
  drawTorso(340, 250, zoom, stripes);
  drawFace(340, 250, zoom * 1.02, { look, cap: stripes, surprise: stripes && barsT < .5, wink: t > 4.2 && (t % 3) < .5, sad: false });
  // placard
  const pa = clamp((t - .4) * 3, 0, 1);
  if (pa > 0) {
    ctx.save(); ctx.translate(340, 470 + (1 - pa) * 120);
    ctx.fillStyle = '#15161c'; ctx.strokeStyle = '#8a8f9a'; ctx.lineWidth = 4; rr(-150, -42, 300, 84, 6); ctx.fill(); ctx.stroke();
    ctx.font = FONT(18); ctx.fillStyle = '#ddd'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('SUBURB POLICE DEPT', 0, -24);
    ctx.font = FONT(30); ctx.fillStyle = '#fff'; ctx.fillText('BIN BANDIT  #' + String(G.score).padStart(5, '0'), 0, 6);
    ctx.font = FONT(15); ctx.fillStyle = '#aaa'; ctx.fillText(`${G.knocked} BINS · ${RANKS[G.rank][1]}`, 0, 30);
    ctx.restore();
  }
  // the outfit appears in a puff of smoke
  for (const p of E.puffs) {
    const k = clamp(1 - p.t / .7, 0, 1); if (k <= 0) continue;
    ctx.fillStyle = `rgba(240,240,250,${k * .9})`; ell(p.x, p.y, p.r * (1.6 - k * .6), p.r * (1.6 - k * .6)); ctx.fill();
  }
  if (t >= 1.3 && t < 2.2) text('FWOOMP!', 560, 160, 44 + Math.sin(t * 20) * 2, '#fff', 'center', '#0a0a12', 6);
  // bars slam down
  if (barsT > 0) {
    const p = clamp(barsT / .22, 0, 1);
    let y = -H + p * p * H;
    if (barsT > .22) y = -Math.abs(Math.sin((barsT - .22) * 14)) * 30 * Math.max(0, 1 - (barsT - .22) * 3);
    ctx.save(); ctx.translate(0, y);
    for (let x = 43; x < W; x += 66) {
      const g = ctx.createLinearGradient(x - 9, 0, x + 9, 0);
      g.addColorStop(0, '#3a3d48'); g.addColorStop(.4, '#c8ccd6'); g.addColorStop(1, '#3a3d48');
      ctx.fillStyle = g; ctx.fillRect(x - 8, -10, 16, H + 20);
    }
    for (const by of [64, H - 14]) {
      const g = ctx.createLinearGradient(0, by - 12, 0, by + 12);
      g.addColorStop(0, '#3a3d48'); g.addColorStop(.4, '#c8ccd6'); g.addColorStop(1, '#3a3d48');
      ctx.fillStyle = g; ctx.fillRect(0, by - 12, W, 24);
      for (let x = 43; x < W; x += 66) { ctx.fillStyle = '#2a2d36'; ell(x, by, 5, 5); ctx.fill(); }
    }
    ctx.restore();
    if (barsT > .22 && barsT < 1.2) text('SLAM!', 340, 120, 64, '#ff4d3a', 'center', '#0a0a12', 8);
  }
  ctx.restore();
  if (t < .5) { ctx.fillStyle = `rgba(0,0,0,${1 - t * 2})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------------------------------------------------------- auto-play (for testing: index.html?auto)
function autoPilot() {
  if (mode === 'title') { startGame(); return; }
  for (const k of ['left', 'right', 'up', 'down', 'jump']) keys[k] = false;
  if (mode !== 'play') return;
  keys.right = !P.rum;
  // line up with the next standing bin, but sidestep any human close by
  const bin = bins.filter(b => b.st === 'up' && b.x > P.x + 20 && b.x < P.x + 400).sort((a, b) => a.x - b.x)[0];
  const foe = humans.filter(h => h.st !== 'stun' && h.st !== 'home' && h.st !== 'patrol' && Math.abs(h.x - P.x) < 180).sort((a, b) => Math.abs(a.x - P.x) - Math.abs(b.x - P.x))[0];
  let tz = bin ? bin.z : P.z;
  if (foe) tz = foe.z > (ZMIN + ZMAX) / 2 ? ZMIN : ZMAX;
  if (tz < P.z - 6) keys.up = true; else if (tz > P.z + 6) keys.down = true;
  if (foe && Math.abs(foe.x - P.x) < 90 && Math.abs(foe.z - P.z) < 20 && P.onGround) { pressed.jump = true; keys.jump = true; }
  const near = bins.find(b => b.st === 'down' && !b.done && Math.abs(P.x - (binMouth(b).x + b.dir * 14)) < 40 && Math.abs(P.z - b.z) < 16);
  if (near && !foe && P.onGround) pressed.act = true;
}

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (AUTO) autoPilot();
  update(dt);
  if (mode === 'title') drawTitle();
  else if (mode === 'ending') drawEnding();
  else drawPlay();
}
if (SHOT === 'end') {
  resetWorld(); G.score = 1234; G.knocked = 17; G.rank = rankIdx(17); G.causeOfCapture = 'a grumpy dad in his dressing gown';
  startEnding(); document.getElementById('titleUI').hidden = true;
}
if (AUTO || SHOT) {
  last = 0; let vt = 0; setInterval(() => { vt += 1000 / 60; frame(vt); }, 1000 / 60);
} else {
  const raf = now => { frame(now); requestAnimationFrame(raf); };
  requestAnimationFrame(now => { last = now; raf(now); });
}
