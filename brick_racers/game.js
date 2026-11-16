'use strict';
// Brick Racers — race brick-built cars on studded baseplates, answer times tables for boosts and bricks,
// and bolt upgrades onto your car until it can fly. Everything is drawn procedurally; sound is Web Audio.

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const W = 960, H = 540, DPR = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * DPR; cv.height = H * DPR;
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), SHOT = Q.get('shot'), AUTO_RIGHT = Q.has('right') ? +Q.get('right') / 100 : .85;
const TOUCH = Q.has('mobile') || (!Q.has('desktop') && (
  matchMedia('(pointer: coarse)').matches ||
  (matchMedia('(any-pointer: coarse)').matches && matchMedia('(hover: none)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))));

const rand = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rand(a, b + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;
const wrapA = a => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const FONT = s => `${s}px Bangers, Impact, sans-serif`;
const $ = id => document.getElementById(id);
function seeded(s) { return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function shade(hex, f) {   // f > 0 lighter, f < 0 darker
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = n >> 8 & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------------------------------------------------------------- tunables
const LAPS = 3, TW = 92, S = 20;            // laps per race, half road width, stud size
const PIT_QS = 6, PIT_TIME = 10, RACE_Q_TIME = 7, SLOWMO = 0.3;
const PRIZE = [40, 30, 24, 18, 14, 10];
const RIVAL_K = [.99, 1.03];   // rival top speed compared to yours
const BASE = { max: 300, acc: 330, turn: 2.7, grip: 5 };

const LOOKS = {
  bugatti: { name: 'Blue Bugatti',   c: '#1f5fd6', d: '#0d2c7a', a: '#0a1a44', shape: 'round', twotone: true },
  mclaren: { name: 'Orange McLaren', c: '#ff7a12', d: '#b84d00', a: '#1a1a1a', shape: 'pointy', stripe: true },
  ferrari: { name: 'Red Ferrari',    c: '#e2231a', d: '#8c0c0c', a: '#ffd21a', shape: 'sport', badge: true },
  taxi:    { name: 'Yellow Taxi',    c: '#ffd21a', d: '#b38f00', a: '#111111', shape: 'box', sign: true },
  police:  { name: 'Police Car',     c: '#f4f4f4', d: '#8f98a8', a: '#1f3fae', shape: 'box', lights: true },
  jeep:    { name: 'Green Jeep',     c: '#3e8e3a', d: '#22561f', a: '#222222', shape: 'box', spare: true },
  buggy:   { name: 'Pink Buggy',     c: '#ff5fb3', d: '#b02d76', a: '#ffffff', shape: 'round' },
  lime:    { name: 'Lime Racer',     c: '#9be22d', d: '#5a8f10', a: '#1a1a1a', shape: 'pointy', stripe: true },
  purple:  { name: 'Purple Rocket',  c: '#8a4fe0', d: '#4f2390', a: '#ffd21a', shape: 'sport' },
  white:   { name: 'Ice Cream Van',  c: '#ffffff', d: '#b5c8d6', a: '#ff8fc4', shape: 'box', van: true },
};
const MY_CARS = ['bugatti', 'mclaren', 'ferrari'];
const OTHERS = ['taxi', 'police', 'jeep', 'buggy', 'lime', 'purple', 'white'];

const UPG = [
  { k: 'engine',  name: 'Turbo Engine',   ic: '⚙️', max: 3, cost: [50, 110, 190], desc: 'Faster top speed' },
  { k: 'tyres',   name: 'Grippy Tyres',   ic: '🛞', max: 3, cost: [40, 90, 150],  desc: 'Turn sharper, slide less' },
  { k: 'spoiler', name: 'Big Spoiler',    ic: '🏁', max: 2, cost: [70, 140],      desc: 'Grip in the corners' },
  { k: 'bumper',  name: 'Crash Bumper',   ic: '🛡️', max: 2, cost: [60, 130],      desc: 'Bash cars! Level 2: you never spin' },
  { k: 'nitro',   name: 'Nitro Tanks',    ic: '💨', max: 3, cost: [60, 110, 170], desc: 'A speed boost each race, per tank' },
  { k: 'rocket',  name: 'Rocket Booster', ic: '🚀', max: 1, cost: [180], need: 'nitro', desc: 'Bigger, longer boosts' },
  { k: 'wings',   name: 'Glider Wings',   ic: '🕊️', max: 1, cost: [250], desc: "Grass doesn't slow you down" },
  { k: 'jets',    name: 'Jet Engines',    ic: '✈️', max: 1, cost: [400], need: 'wings', desc: 'Your car can FLY!' },
];

// tracks: control points of a closed loop (Catmull-Rom); you drive in the order the points are listed
const TRACKS = [
  { name: 'Brick City', theme: 'city', base: '#3e9a36',
    pts: [[400, 400], [1300, 300], [2200, 380], [2600, 800], [2300, 1200], [1800, 1100], [1400, 1300], [1750, 1650], [2450, 1750], [2350, 2150], [1300, 2200], [550, 2050], [300, 1550], [650, 1150], [350, 800]] },
  { name: 'Sandy Desert', theme: 'desert', base: '#e2b85c',
    pts: [[400, 650], [1000, 350], [1700, 520], [2300, 330], [2750, 720], [2550, 1250], [2000, 1150], [1600, 1450], [2150, 1850], [1500, 2050], [800, 1900], [430, 1400]] },
  { name: 'Snowy Peaks', theme: 'snow', base: '#e9f2fb',
    pts: [[500, 500], [1500, 380], [2050, 780], [2650, 600], [2850, 1250], [2250, 1550], [2550, 2050], [1700, 2150], [1300, 1650], [900, 2050], [400, 1750], [650, 1100]] },
  { name: 'Moon Base', theme: 'space', base: '#5b5f70',
    pts: [[600, 400], [2000, 450], [2550, 900], [2050, 1350], [1350, 1150], [950, 1450], [1450, 1850], [2450, 1900], [2250, 2350], [700, 2300], [350, 1550], [400, 900]] },
];

// times tables: the order they unlock in (ones don't count)
const ORDER = [2, 10, 5, 3, 4, 11, 9, 6, 8, 12, 7];
const IV = [1, 2, 4, 7, 12, 20];             // questions until a fact comes back, by box (spaced repetition)

// ---------------------------------------------------------------- save state
const SAVE = 'brickRacers1';
function fresh() {
  return { car: 'bugatti', bricks: 0, up: {}, facts: {}, qn: 0, tables: 1, rows: [], races: 0, wins: 0, last: '', muted: false };
}
let G = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s) G = Object.assign(fresh(), s); } catch (e) { }
const save = () => { try { if (!SHOT) localStorage.setItem(SAVE, JSON.stringify(G)); } catch (e) { } };
const lv = k => G.up[k] || 0;

// ---------------------------------------------------------------- sound
let AC = null, master = null, eng = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.connect(AC.destination); } catch (e) { return; } }
  if (AC.state === 'suspended') AC.resume();
  master.gain.value = G.muted ? 0 : 1;
}
function tone(f, d, type = 'square', v = .06, f2 = null, delay = 0) {
  if (!AC || G.muted) return;
  const t = AC.currentTime + delay, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + d + .02);
}
function noise(d, v = .15, hp = 400) {
  if (!AC || G.muted) return;
  const n = AC.sampleRate * d | 0, b = AC.createBuffer(1, n, AC.sampleRate), a = b.getChannelData(0);
  for (let i = 0; i < n; i++) a[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const s = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = hp; s.buffer = b; g.gain.value = v;
  s.connect(f); f.connect(g); g.connect(master); s.start();
}
const sfx = {
  beep: () => tone(440, .18, 'square', .07), go: () => tone(880, .4, 'square', .08),
  right: () => { tone(660, .12, 'triangle', .1); tone(990, .2, 'triangle', .1, null, .1); },
  wrong: () => tone(180, .35, 'sawtooth', .06, 110),
  coin: () => { tone(1200, .08, 'square', .04); tone(1600, .12, 'square', .04, null, .06); },
  crash: v => { noise(.25, .12 + .2 * v, 200); tone(120, .2, 'square', .05, 60); },
  boost: () => { noise(.5, .1, 1200); tone(200, .5, 'sawtooth', .04, 600); },
  buy: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, .15, 'triangle', .08, null, i * .07)); },
  fanfare: () => { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, .2, 'square', .05, null, i * .12)); },
};
function engineOn() {
  if (!AC || eng) return;
  const o = AC.createOscillator(), o2 = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  o.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 700; g.gain.value = 0;
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(); o2.start();
  eng = { o, o2, g };
}
function engineSet(sp, on) {
  if (!eng) return;
  const t = AC.currentTime, f = 45 + sp * .22;
  eng.o.frequency.setTargetAtTime(f, t, .05); eng.o2.frequency.setTargetAtTime(f * .5, t, .05);
  eng.g.gain.setTargetAtTime(on && !G.muted ? .035 : 0, t, .1);
}

// ---------------------------------------------------------------- times-table brain (spaced repetition)
const fkey = (a, b) => a < b ? a + ',' + b : b + ',' + a;
const fact = k => G.facts[k] || (G.facts[k] = { b: -1, d: 0 });   // b: box (-1 = never asked), d: due at question number
const unlocked = () => ORDER.slice(0, G.tables);
const factsOf = t => { const r = []; for (let n = 2; n <= 12; n++) r.push(fkey(t, n)); return r; };
function pool() { const s = new Set(); for (const t of unlocked()) factsOf(t).forEach(k => s.add(k)); return [...s]; }
function nextFact() {
  const keys = pool().filter(k => k !== G.last);
  const seen = keys.filter(k => fact(k).b >= 0), unseen = keys.filter(k => fact(k).b < 0);
  const due = seen.filter(k => fact(k).d <= G.qn);
  const shaky = seen.filter(k => fact(k).b < 2).length;
  const newest = ORDER[G.tables - 1];
  const freshNew = unseen.filter(k => k.split(',').includes(String(newest)));
  let k;
  if (unseen.length && shaky < 3 && (!due.length || Math.random() < .35)) k = pick(freshNew.length ? freshNew : unseen);
  else if (due.length) { due.sort((a, b) => fact(a).d - fact(b).d); k = pick(due.slice(0, 3)); }
  else if (unseen.length) k = pick(unseen);
  else { seen.sort((a, b) => fact(a).d - fact(b).d); k = pick(seen.slice(0, 3)); }
  G.last = k;
  let [a, b] = k.split(',').map(Number);
  if (Math.random() < .5) [a, b] = [b, a];
  // ask the unlocked table first so it reads like "3 × 7" while learning the 3s
  if (!unlocked().includes(a) && unlocked().includes(b)) [a, b] = [b, a];
  return { k, a, b, ans: a * b, opts: makeOpts(a, b) };
}
function makeOpts(a, b) {
  const ans = a * b, set = new Set([ans]);
  const near = shuffle([a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b]);
  const far = shuffle([ans + 1, ans - 1, ans + 2, ans + 10, ans - 10]);
  for (const c of [...near, ...far]) if (c > 1 && c !== a && c !== b && set.size < 3) set.add(c);
  return shuffle([...set]);
}
function answerFact(k, right) {
  const f = fact(k), wasGold = f.b >= 3;
  G.qn++;
  if (right) { f.b = f.b < 0 ? 1 : Math.min(5, f.b + 1); f.r = 1; f.d = G.qn + IV[f.b]; }
  else { f.b = f.b < 0 ? 0 : Math.max(0, f.b - 2); f.d = G.qn + 2; }
  const [a, b] = k.split(',');
  if (!wasGold && f.b >= 3) toast(`⭐ ${a} × ${b} learned!`);
  // unlock the next table once the newest one is going well
  const newest = ORDER[G.tables - 1], nf = factsOf(newest);
  if (G.tables < ORDER.length && nf.every(x => fact(x).b >= 1) && nf.filter(x => fact(x).b >= 2).length >= nf.length * .75) {
    G.tables++;
    toast(`🔓 New: the ${ORDER[G.tables - 1]} times table!`, true);
  }
  for (let t = 2; t <= 12; t++) if (!G.rows.includes(t) && factsOf(t).every(x => fact(x).b >= 3)) {
    G.rows.push(t); G.bricks += 100; sfx.fanfare();
    toast(`🏆 You finished the ${t} times table! +100 🧱`, true);
  }
  save();
}

// ---------------------------------------------------------------- track building
let T = null;   // current track: samples X/Y/A, N, world size, baked image, minimap
function buildTrack(tr) {
  const P = tr.pts, n = P.length, raw = [];
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n], p1 = P[i], p2 = P[(i + 1) % n], p3 = P[(i + 2) % n];
    for (let s = 0; s < 40; s++) {
      const t = s / 40, t2 = t * t, t3 = t2 * t;
      const cr = j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      raw.push([cr(0), cr(1)]);
    }
  }
  const cum = [0];
  for (let i = 1; i < raw.length; i++) cum[i] = cum[i - 1] + Math.hypot(raw[i][0] - raw[i - 1][0], raw[i][1] - raw[i - 1][1]);
  const total = cum[raw.length - 1] + Math.hypot(raw[0][0] - raw[raw.length - 1][0], raw[0][1] - raw[raw.length - 1][1]);
  const N = Math.round(total / 12), X = new Float32Array(N), Y = new Float32Array(N), A = new Float32Array(N);
  let j = 0;
  for (let i = 0; i < N; i++) {
    const s = i * total / N;
    while (j < raw.length - 1 && cum[j + 1] < s) j++;
    const a = raw[j], b = raw[(j + 1) % raw.length], seg = (j + 1 < raw.length ? cum[j + 1] : total) - cum[j];
    const f = seg ? (s - cum[j]) / seg : 0;
    X[i] = a[0] + (b[0] - a[0]) * f; Y[i] = a[1] + (b[1] - a[1]) * f;
  }
  let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
  for (let i = 0; i < N; i++) { mnx = Math.min(mnx, X[i]); mny = Math.min(mny, Y[i]); mxx = Math.max(mxx, X[i]); mxy = Math.max(mxy, Y[i]); }
  const M = 420;
  for (let i = 0; i < N; i++) { X[i] += M - mnx; Y[i] += M - mny; }
  for (let i = 0; i < N; i++) { const a = (i - 1 + N) % N, b = (i + 1) % N; A[i] = Math.atan2(Y[b] - Y[a], X[b] - X[a]); }
  T = { tr, N, X, Y, A, len: total, ds: total / N, w: Math.ceil(mxx - mnx + 2 * M), h: Math.ceil(mxy - mny + 2 * M) };
  bake();
  // minimap path
  const sc = Math.min(170 / T.w, 120 / T.h);
  T.mm = { sc, w: T.w * sc, h: T.h * sc };
}
function nearest(x, y) {
  let bi = 0, bd = 1e18;
  for (let i = 0; i < T.N; i++) { const dx = T.X[i] - x, dy = T.Y[i] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; bi = i; } }
  return { i: bi, d: Math.sqrt(bd) };
}
function trackDistFast(x, y) {   // distance to the road's centre line (coarse, for scenery placement)
  let bd = 1e18;
  for (let i = 0; i < T.N; i += 3) { const dx = T.X[i] - x, dy = T.Y[i] - y, d = dx * dx + dy * dy; if (d < bd) bd = d; }
  return Math.sqrt(bd);
}

// ---------------------------------------------------------------- brick drawing helpers
function stud(g, x, y, col, r = S * .3) {
  g.fillStyle = 'rgba(0,0,0,.22)'; g.beginPath(); g.arc(x + r * .25, y + r * .3, r, 0, TAU); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - r * .25, y - r * .25, r * .45, 0, TAU); g.fill();
}
function brick(g, x, y, sw, sh, col, ht = 1) {   // a brick seen from above, sw × sh studs, ht = how tall (shadow)
  const w = sw * S, h = sh * S;
  g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(x + 5 * ht, y + 6 * ht, w, h);
  g.fillStyle = col; g.fillRect(x, y, w, h);
  g.strokeStyle = shade(col, -.35); g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  const sc = shade(col, .08);
  for (let i = 0; i < sw; i++) for (let j = 0; j < sh; j++) stud(g, x + S / 2 + i * S, y + S / 2 + j * S, sc);
}
function roundPlate(g, x, y, r, col, ht = 1) {
  g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 5 * ht, y + 6 * ht, r, 0, TAU); g.fill();
  g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.strokeStyle = shade(col, -.35); g.lineWidth = 2; g.stroke();
  const sc = shade(col, .1), n = Math.max(1, Math.round(r / S));
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const sx = x + i * S, sy = y + j * S;
    if (Math.hypot(sx - x, sy - y) < r - S * .45) stud(g, sx, sy, sc);
  }
}
function studTile(base) {
  const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(0,0,0,.04)'; g.fillRect(0, S - 1, S, 1); g.fillRect(S - 1, 0, 1, S);
  stud(g, S / 2, S / 2, shade(base, .06), S * .28);
  return c;
}

// bake the whole track (baseplate, road, scenery) into one big image
function bake() {
  const tr = T.tr, c = document.createElement('canvas'); c.width = T.w; c.height = T.h;
  const g = c.getContext('2d'), R = seeded(tr.name.length * 999 + 7);
  g.fillStyle = g.createPattern(studTile(tr.base), 'repeat'); g.fillRect(0, 0, T.w, T.h);
  if (tr.theme === 'space') {   // craters
    for (let i = 0; i < 40; i++) {
      const x = R() * T.w, y = R() * T.h, r = 30 + R() * 70;
      if (trackDistFast(x, y) < TW + r) continue;
      g.fillStyle = 'rgba(0,0,0,.18)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.06)'; g.beginPath(); g.arc(x - r * .15, y - r * .15, r * .75, 0, TAU); g.fill();
    }
  }
  const path = () => { g.beginPath(); for (let i = 0; i <= T.N; i++) { const k = i % T.N; i ? g.lineTo(T.X[k], T.Y[k]) : g.moveTo(T.X[k], T.Y[k]); } g.closePath(); };
  g.lineJoin = g.lineCap = 'round';
  // shadow, kerbs (red and white bricks), road
  g.save(); g.translate(5, 6); path(); g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = TW * 2 + 26; g.stroke(); g.restore();
  path(); g.strokeStyle = '#e2231a'; g.lineWidth = TW * 2 + 26; g.stroke();
  g.lineCap = 'butt'; path(); g.strokeStyle = '#ffffff'; g.setLineDash([S * 2, S * 2]); g.stroke(); g.setLineDash([]); g.lineCap = 'round';
  path(); g.strokeStyle = tr.theme === 'space' ? '#3a3d4a' : '#6f737b'; g.lineWidth = TW * 2; g.stroke();
  // road plate seams
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 2;
  for (let i = 0; i < T.N; i += 8) {
    const a = T.A[i] + Math.PI / 2, cx = Math.cos(a), sy = Math.sin(a);
    g.beginPath(); g.moveTo(T.X[i] + cx * TW, T.Y[i] + sy * TW); g.lineTo(T.X[i] - cx * TW, T.Y[i] - sy * TW); g.stroke();
  }
  g.lineCap = 'butt'; path(); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.setLineDash([30, 34]); g.stroke(); g.setLineDash([]);
  // chequered start line
  g.save(); g.translate(T.X[0], T.Y[0]); g.rotate(T.A[0]);
  const q = 12;
  for (let r = 0; r < 2; r++) for (let k = -TW / q; k < TW / q; k++) { g.fillStyle = (r + k) & 1 ? '#111' : '#fff'; g.fillRect(-q + r * q, k * q, q, q); }
  g.restore();
  // grid boxes for the starting cars
  g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 3;
  for (let s = 0; s < 6; s++) { const p = gridSpot(s); g.save(); g.translate(p.x, p.y); g.rotate(p.a); g.strokeRect(-26, -16, 52, 32); g.restore(); }

  // scenery: place things that don't touch the road or each other
  const placed = [];
  const free = (x, y, r) => trackDistFast(x, y) > TW + 34 + r && placed.every(p => Math.hypot(p[0] - x, p[1] - y) > p[2] + r + 10) && x > r && y > r && x < T.w - r && y < T.h - r;
  // grandstand by the start line
  for (const side of [1, -1]) {
    const a = T.A[0] + side * Math.PI / 2, d = TW + 90, x = T.X[0] + Math.cos(a) * d, y = T.Y[0] + Math.sin(a) * d;
    if (!free(x, y, 70)) continue;
    g.save(); g.translate(x, y); g.rotate(T.A[0]);
    brick(g, -120, -40, 12, 4, '#a0a5ad', 2);
    const heads = ['#ffd21a', '#ffd21a', '#ffd21a', '#c98b4b'], shirts = ['#e2231a', '#1f5fd6', '#3fae3a', '#ff7a12', '#8a4fe0'];
    for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) {
      const hx = -110 + i * S, hy = -22 + j * 30;
      g.fillStyle = shirts[(i * 3 + j) % 5]; g.fillRect(hx - 8, hy + 2, 16, 10);
      g.fillStyle = heads[(i + j * 2) % 4]; g.beginPath(); g.arc(hx, hy, 6, 0, TAU); g.fill();
    }
    g.restore(); placed.push([x, y, 140]); break;
  }
  const items = {
    city: () => R() < .45 ? 'tree' : 'house',
    desert: () => { const r = R(); return r < .4 ? 'cactus' : r < .75 ? 'rock' : 'pyramid'; },
    snow: () => { const r = R(); return r < .55 ? 'pine' : r < .75 ? 'snowman' : 'ice'; },
    space: () => { const r = R(); return r < .35 ? 'dome' : r < .65 ? 'moonrock' : r < .85 ? 'antenna' : 'alien'; },
  }[tr.theme];
  const colours = ['#e2231a', '#1f5fd6', '#ffd21a', '#3fae3a', '#ffffff', '#ff7a12', '#8a4fe0', '#a0a5ad'];
  for (let tries = 0; tries < 1400 && placed.length < 150; tries++) {
    const kind = items(), x = R() * T.w, y = R() * T.h;
    if (kind === 'house' || kind === 'pyramid' || kind === 'ice' || kind === 'alien') {
      const sw = 3 + (R() * 4 | 0), sh = 3 + (R() * 3 | 0), r = Math.hypot(sw, sh) * S / 2;
      if (!free(x, y, r)) continue; placed.push([x, y, r]);
      const bx = Math.round((x - sw * S / 2) / S) * S, by = Math.round((y - sh * S / 2) / S) * S;
      if (kind === 'house') {
        brick(g, bx, by, sw, sh, colours[R() * colours.length | 0], 3);
        brick(g, bx + S, by + S, sw - 2, sh - 2, R() < .5 ? '#a0352a' : '#4a4f5a', 4);
      } else if (kind === 'pyramid') {
        for (let k = 0; k < 3; k++) if (sw - 2 * k > 0 && sh - 2 * k > 0) brick(g, bx + k * S, by + k * S, sw - 2 * k, sh - 2 * k, shade('#d8a34a', -k * .08), 2 + k);
      } else if (kind === 'ice') brick(g, bx, by, sw, sh, '#9fd8f5', 2);
      else { brick(g, bx, by, sw, sh, '#7be04a', 2); stud(g, bx + sw * S / 2, by + sh * S / 2, '#e2231a', 7); }
    } else {
      const r = kind === 'tree' ? 30 + R() * 22 : kind === 'pine' ? 26 + R() * 14 : 22;
      if (!free(x, y, r)) continue; placed.push([x, y, r]);
      if (kind === 'tree') roundPlate(g, x, y, r, R() < .5 ? '#2f7d2b' : '#4fb83f', 3);
      else if (kind === 'pine') { roundPlate(g, x, y, r, '#1f6a3a', 3); roundPlate(g, x, y, r * .55, '#2c8a4c', 4); }
      else if (kind === 'cactus') { brick(g, x - 10, y - 30, 1, 3, '#3a9a3a', 3); brick(g, x - 30, y - 10, 1, 1, '#3a9a3a', 2); brick(g, x + 10, y - 20, 1, 1, '#3a9a3a', 2); }
      else if (kind === 'rock') roundPlate(g, x, y, r, R() < .5 ? '#b5651d' : '#9b7b55', 2);
      else if (kind === 'snowman') { roundPlate(g, x, y + 8, 18, '#ffffff', 2); roundPlate(g, x, y - 14, 12, '#ffffff', 3); stud(g, x + 12, y - 14, '#ff7a12', 4); }
      else if (kind === 'dome') { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.arc(x + 6, y + 7, r + 10, 0, TAU); g.fill(); g.fillStyle = 'rgba(160,220,255,.55)'; g.beginPath(); g.arc(x, y, r + 10, 0, TAU); g.fill(); g.strokeStyle = '#ddd'; g.lineWidth = 3; g.stroke(); stud(g, x - 8, y - 8, '#fff', 6); }
      else if (kind === 'moonrock') roundPlate(g, x, y, r, '#8a8e9c', 2);
      else if (kind === 'antenna') { brick(g, x - 20, y - 20, 2, 2, '#c8ccd4', 2); g.strokeStyle = '#ddd'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 18, -2.5, -.6); g.stroke(); stud(g, x, y, '#e2231a', 5); }
    }
  }
  T.img = c;
}
function gridSpot(slot) {   // starting grid: two cars side by side, rows behind the line
  const i = (T.N - 4 - Math.floor(slot / 2) * 6 + T.N) % T.N, a = T.A[i], side = slot % 2 ? 1 : -1, off = TW * .45 * side;
  return { i, x: T.X[i] + Math.cos(a + Math.PI / 2) * off, y: T.Y[i] + Math.sin(a + Math.PI / 2) * off, a };
}

// ---------------------------------------------------------------- the cars
function statsFor(car) {
  if (car.me) {
    const e = lv('engine'), t = lv('tyres'), s = lv('spoiler'), b = lv('bumper');
    return {
      max: BASE.max + 35 * e, acc: BASE.acc + 60 * e + 15 * t, turn: BASE.turn + .22 * t + .18 * s, grip: BASE.grip + 2 * t + 1.6 * s,
      mass: 1 + .8 * b, noSpin: b >= 2, nitro: lv('nitro'), nitroPow: lv('rocket') ? 1.65 : 1.4, nitroT: lv('rocket') ? 2.6 : 1.8,
      glide: lv('wings') > 0, fly: lv('jets') > 0,
    };
  }
  // rivals are built about as fast as YOUR car, so the race is won with maths turbos and good driving
  const my = statsFor({ me: true }), k = rand(RIVAL_K[0], RIVAL_K[1]);
  return { max: my.max * k, acc: my.acc * k, turn: Math.max(BASE.turn + .1, my.turn - .1), grip: Math.max(BASE.grip + 1, my.grip - .5), mass: 1, noSpin: false, nitro: 0, nitroPow: 1.4, nitroT: 1.8, glide: false, fly: false };
}
function makeCar(look, slot, me) {
  const p = gridSpot(slot);
  const c = { look, me, x: p.x, y: p.y, ang: p.a, vx: 0, vy: 0, idx: p.i, prog: p.i - T.N, off: false,
    spin: 0, spinDir: 1, boost: 0, alt: 0, flyE: 1, flying: false, done: false, place: 0, lane: rand(-.5, .5), laneT: rand(1, 4), steer: 0, bump: 0, boostT: rand(6, 14) };
  c.st = statsFor(c); c.nitro = c.st.nitro;
  return c;
}

// ---------------------------------------------------------------- input
const keys = {}, pressed = {};
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  Space: 'nitro', ShiftLeft: 'nitro', KeyF: 'fly', KeyE: 'fly', Digit1: 'a0', Digit2: 'a1', Digit3: 'a2', Numpad1: 'a0', Numpad2: 'a1', Numpad3: 'a2', KeyM: 'mute', Enter: 'enter' };
addEventListener('keydown', e => {
  const k = KEYMAP[e.code]; if (!k) return;
  if (['up', 'down', 'left', 'right', 'nitro'].includes(k)) e.preventDefault();
  ac();
  if (!keys[k]) pressed[k] = true; keys[k] = true;
  if (k === 'mute') toggleMute();
  if (k[0] === 'a' && k.length === 2) answerKey(+k[1]);
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
// floating joystick: thumb down anywhere on the left half, push the way you want the car to go
const joy = { id: null, x: 0, y: 0, cx: 0, cy: 0 };
(() => {
  const zone = $('joyZone'), base = $('joyBase'), knob = $('joyKnob');
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
$('fsBtn').onclick = () => { ac(); goFullscreen(); };
$('rotateFs').onclick = () => { ac(); goFullscreen(); };
$('anyway').onclick = () => document.body.classList.add('portraitOk');
function toggleMute() { G.muted = !G.muted; $('mute').textContent = G.muted ? '🔇' : '🔊'; if (master) master.gain.value = G.muted ? 0 : 1; save(); }
$('mute').onclick = () => { ac(); toggleMute(); };
$('mute').textContent = G.muted ? '🔇' : '🔊';

// ---------------------------------------------------------------- toasts
function toast(msg, big) {
  const d = document.createElement('div'); d.className = 'toast' + (big ? ' big' : ''); d.textContent = msg;
  $('toasts').appendChild(d); setTimeout(() => d.remove(), 2700);
  while ($('toasts').children.length > 3) $('toasts').firstChild.remove();
}

// ---------------------------------------------------------------- race
let mode = 'title', R = null, parts = [], scene = { t: 0 };
function show(id) {
  for (const u of ['titleUI', 'resultUI', 'pitUI', 'garageUI']) $(u).hidden = u !== id;
  document.body.classList.toggle('racing', mode === 'race');
  document.body.classList.toggle('garage', mode === 'garage');
}
function startRace() {
  ac(); goFullscreen();
  buildTrack(TRACKS[G.races % TRACKS.length]);
  const rivals = shuffle([...MY_CARS.filter(k => k !== G.car), ...shuffle(OTHERS.slice()).slice(0, 3)]);
  const cars = [];
  const mySlot = Math.min(5, 2 + Math.floor(G.races / 3));   // start further back as you get better
  for (let s = 0, r = 0; s < 6; s++) cars.push(s === mySlot ? makeCar(G.car, s, true) : makeCar(rivals[r++], s, false));
  const me = cars.find(c => c.me);
  const boxes = [];
  for (const f of [.14, .38, .62, .86]) {
    const i = Math.floor(f * T.N), off = rand(-.45, .45) * TW, a = T.A[i] + Math.PI / 2;
    boxes.push({ i, x: T.X[i] + Math.cos(a) * off, y: T.Y[i] + Math.sin(a) * off, t: 0 });
  }
  R = { cars, me, boxes, t: -3.6, lastBeep: 4, finished: 0, endT: 0, q: null, earned: { q: 0, bash: 0 }, order: [], cam: { x: me.x, y: me.y, z: 1 } };
  parts = [];
  mode = 'race'; show(null);
  $('touch').querySelector('.nitro').classList.toggle('off', !me.st.nitro);
  $('touch').querySelector('.fly').classList.toggle('off', !me.st.fly);
  engineOn();
}
function aiInput(c) {
  const sp = Math.hypot(c.vx, c.vy), look = Math.round((70 + sp * .32) / T.ds);
  const i = (c.idx + look) % T.N, a = T.A[i] + Math.PI / 2;
  c.laneT -= 1 / 60; if (c.laneT < 0) { c.laneT = rand(1.5, 4); c.lane = rand(-.55, .55); }
  const tx = T.X[i] + Math.cos(a) * c.lane * TW, ty = T.Y[i] + Math.sin(a) * c.lane * TW;
  const diff = wrapA(Math.atan2(ty - c.y, tx - c.x) - c.ang);
  // how sharp is the road ahead? slow down a bit for hairpins
  const bend = Math.abs(wrapA(T.A[(c.idx + look * 2) % T.N] - T.A[c.idx]));
  return { thr: Math.abs(diff) > .7 ? .5 : bend > 1.2 ? .75 : 1, steer: clamp(diff * 3, -1, 1) };
}
function playerInput(c) {
  if (AUTO || SHOT || c.done) return aiInput(c);
  if (joy.id !== null) {
    const m = Math.hypot(joy.x, joy.y);
    if (m < .2) return { thr: 0, steer: 0 };
    const diff = wrapA(Math.atan2(joy.y, joy.x) - c.ang);
    return { thr: clamp(m * 1.4, 0, 1), steer: clamp(diff * 2.5, -1, 1) };
  }
  return { thr: keys.up ? 1 : keys.down ? -1 : 0, steer: (keys.right ? 1 : 0) - (keys.left ? 1 : 0) };
}
function physics(c, inp, dt) {
  const st = c.st;
  // flying (jet engines): hold F; burns fuel, refills on the ground
  const wantFly = st.fly && !c.done && (c.me ? (keys.fly || (AUTO && c.flyE > .9 && Math.random() < .01) || (AUTO && c.flying)) : false);
  if (c.flyE <= 0) c.flyLock = true; else if (c.flyE > .35) c.flyLock = false;   // run out of fuel: land and refill a bit first
  c.flying = wantFly && c.flyE > 0 && !c.flyLock;
  if (c.flying && SHOT !== 'fly') c.flyE = Math.max(0, c.flyE - dt / 3.5); else c.flyE = Math.min(1, c.flyE + dt / 7);
  c.alt = lerp(c.alt, c.flying ? 1 : 0, Math.min(1, dt * 4));
  const air = c.alt > .5;
  let fx = Math.cos(c.ang), fy = Math.sin(c.ang);
  let fs = c.vx * fx + c.vy * fy, ls = -c.vx * fy + c.vy * fx;
  const slow = c.off && !st.glide && !air;
  const max = st.max * (c.boost > 0 ? st.nitroPow : 1) * (slow ? .5 : 1) * (air ? 1.18 : 1) * (c.rb || 1);
  if (c.spin > 0) { c.spin -= dt; c.ang += c.spinDir * 10 * dt; inp = { thr: 0, steer: 0 }; }
  if (inp.thr > 0) { if (fs < max) fs += st.acc * inp.thr * dt * (c.boost > 0 ? 2.2 : 1); }
  else if (inp.thr < 0) { fs -= (fs > 0 ? 650 : 220) * dt; fs = Math.max(fs, -130); }
  else fs *= 1 - .9 * dt;
  if (fs > max) fs -= (fs - max) * 2.5 * dt;
  fs *= 1 - .15 * dt;
  ls *= Math.max(0, 1 - st.grip * (c.spin > 0 ? .25 : 1) * dt);
  c.steer = lerp(c.steer, inp.steer, Math.min(1, dt * 12));
  c.ang += c.steer * st.turn * dt * clamp(fs / 110, -1, 1);
  fx = Math.cos(c.ang); fy = Math.sin(c.ang);
  c.vx = fx * fs - fy * ls; c.vy = fy * fs + fx * ls;
  c.x += c.vx * dt; c.y += c.vy * dt;
  if (c.x < 30) { c.x = 30; c.vx = Math.abs(c.vx) * .4; } if (c.y < 30) { c.y = 30; c.vy = Math.abs(c.vy) * .4; }
  if (c.x > T.w - 30) { c.x = T.w - 30; c.vx = -Math.abs(c.vx) * .4; } if (c.y > T.h - 30) { c.y = T.h - 30; c.vy = -Math.abs(c.vy) * .4; }
  if (c.boost > 0) { c.boost -= dt; if (Math.random() < .7) flame(c); }
  if (c.flying && Math.random() < .6) jetFlame(c);
  // where am I on the track?
  const n = nearest(c.x, c.y);
  let d = n.i - c.idx; if (d > T.N / 2) d -= T.N; if (d < -T.N / 2) d += T.N;
  c.prog += d; c.idx = n.i; c.off = n.d > TW + 8;
  if (slow && Math.hypot(c.vx, c.vy) > 80 && Math.random() < .3) parts.push({ x: c.x, y: c.y, vx: rand(-30, 30), vy: rand(-30, 30), z: 0, vz: 0, life: .6, max: .6, kind: 'dust', col: T.tr.base });
}
function flame(c) {
  const bx = c.x - Math.cos(c.ang) * 28, by = c.y - Math.sin(c.ang) * 28;
  parts.push({ x: bx + rand(-4, 4), y: by + rand(-4, 4), vx: -Math.cos(c.ang) * 120 + rand(-30, 30), vy: -Math.sin(c.ang) * 120 + rand(-30, 30), z: c.alt * 30, vz: 0, life: .3, max: .3, kind: 'fire' });
}
function jetFlame(c) {
  for (const s of [-1, 1]) {
    const a = c.ang + Math.PI / 2, bx = c.x - Math.cos(c.ang) * 10 + Math.cos(a) * s * 26, by = c.y - Math.sin(c.ang) * 10 + Math.sin(a) * s * 26;
    parts.push({ x: bx, y: by, vx: -Math.cos(c.ang) * 160, vy: -Math.sin(c.ang) * 160, z: 30, vz: 0, life: .25, max: .25, kind: 'fire' });
  }
}
function brickBurst(x, y, n, cols) {
  for (let i = 0; i < n; i++) parts.push({ x, y, vx: rand(-160, 160), vy: rand(-160, 160), z: 5, vz: rand(150, 320), rot: rand(0, TAU), vr: rand(-10, 10), life: 1.4, max: 1.4, kind: 'brick', col: pick(cols) });
}
function collide(dt) {
  const cs = R.cars, RAD = 17;
  for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
    const a = cs[i], b = cs[j];
    if (a.alt > .5 || b.alt > .5) continue;   // flying cars go over the top
    const dx = a.x - b.x, dy = a.y - b.y, d = Math.hypot(dx, dy);
    if (d >= RAD * 2 || d === 0) continue;
    const nx = dx / d, ny = dy / d, ma = a.st.mass, mb = b.st.mass, ov = RAD * 2 - d;
    a.x += nx * ov * mb / (ma + mb); a.y += ny * ov * mb / (ma + mb);
    b.x -= nx * ov * ma / (ma + mb); b.y -= ny * ov * ma / (ma + mb);
    const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (vn >= 0) continue;
    const jj = -(1.5) * vn / (1 / ma + 1 / mb);
    a.vx += jj / ma * nx; a.vy += jj / ma * ny; b.vx -= jj / mb * nx; b.vy -= jj / mb * ny;
    const hit = -vn;
    if (hit > 110 && (a.bump <= 0 || b.bump <= 0)) {
      a.bump = b.bump = .4;
      brickBurst((a.x + b.x) / 2, (a.y + b.y) / 2, Math.min(10, hit / 30 | 0), [LOOKS[a.look].c, LOOKS[b.look].c]);
      if (a.me || b.me) sfx.crash(Math.min(1, hit / 400));
      for (const [x, y] of [[a, b], [b, a]]) {
        if (hit > 190 && !x.st.noSpin && x.st.mass <= y.st.mass * 1.2) {
          x.spin = .55; x.spinDir = Math.random() < .5 ? -1 : 1;
          if (y.me && !x.me) { R.earned.bash += 2; G.bricks += 2; floatText(x.x, x.y, 'BASH! +2 🧱'); }
        }
      }
    }
  }
}
let floats = [];
function floatText(x, y, s, col = '#ffd21a') { floats.push({ x, y, s, t: 0, col }); }

function stepRace(dt) {
  const me = R.me;
  // questions slow everything down so there's time to think
  const slow = R.q && !R.q.fb ? SLOWMO : 1;
  const sdt = dt * slow;
  R.t += R.t < 0 ? dt : sdt;
  if (R.t < 0) {
    const n = Math.ceil(-R.t);
    if (n < R.lastBeep && n <= 3) { R.lastBeep = n; sfx.beep(); }
  } else if (R.lastBeep > 0) { R.lastBeep = 0; sfx.go(); }
  const going = R.t >= 0;
  // rubber band: rivals far behind speed up, far ahead ease off a little
  // and they get boosts too: lots when they're a long way back, none when they're ahead (so the pack stays near you)
  for (const c of R.cars) if (!c.me) {
    const g = (me.prog - c.prog) / T.N;   // laps behind you (minus = ahead)
    c.rb = g > 0 ? 1 + clamp(g * 1.2, 0, .2) : 1 - clamp(-g * .5, 0, .08);
    if (going && !c.done && c.boost <= 0 && (c.boostT -= sdt) <= 0) {
      c.boostT = rand(10, 16) / (1 + clamp(g, 0, .5) * 8);
      if (g > .03) c.boost = 1.5;
    }
  }
  for (const c of R.cars) {
    c.bump -= sdt;
    const inp = going ? (c.me ? playerInput(c) : aiInput(c)) : { thr: 0, steer: 0 };
    if (c.me && going && !c.done) {
      if ((pressed.nitro || (AUTO && Math.random() < .004)) && c.nitro > 0 && c.boost <= 0) { c.nitro--; c.boost = c.st.nitroT; sfx.boost(); }
    }
    physics(c, inp, sdt);
    if (!c.done && c.prog >= LAPS * T.N) {
      c.done = true; c.place = ++R.finished; R.order.push(c);
      if (c.me) finishMe();
    }
    if (c.me && going && !c.done) {
      const lap = Math.floor(c.prog / T.N) + 1;
      if (lap > (R.lap || 1) && lap <= LAPS) { R.lap = lap; toast(lap === LAPS ? 'FINAL LAP!' : `LAP ${lap}`); sfx.beep(); }
    }
  }
  collide(sdt);
  // question bricks
  for (const b of R.boxes) {
    if (b.t > 0) { b.t -= sdt; continue; }
    if (!R.q && !me.done && going && me.alt < .5 && Math.hypot(me.x - b.x, me.y - b.y) < 34) {
      b.t = 9; brickBurst(b.x, b.y, 6, ['#ffd21a']); sfx.coin(); askRace();
    }
  }
  if (R.q) stepRaceQ(dt);
  // particles
  for (const p of parts) {
    p.life -= sdt; p.x += p.vx * sdt; p.y += p.vy * sdt;
    if (p.kind === 'brick') { p.vz -= 700 * sdt; p.z += p.vz * sdt; p.rot += p.vr * sdt; if (p.z < 0) { p.z = 0; p.vz *= -.35; p.vx *= .6; p.vy *= .6; p.vr *= .5; } }
    else { p.vx *= .92; p.vy *= .92; }
  }
  parts = parts.filter(p => p.life > 0);
  if (parts.length > 400) parts.splice(0, parts.length - 400);
  for (const f of floats) f.t += dt; floats = floats.filter(f => f.t < 1.4);
  // camera: look ahead of the car, zoom out a little at speed
  const sp = Math.hypot(me.vx, me.vy);
  R.cam.x = lerp(R.cam.x, me.x + me.vx * .35, Math.min(1, dt * 5));
  R.cam.y = lerp(R.cam.y, me.y + me.vy * .35, Math.min(1, dt * 5));
  R.cam.z = lerp(R.cam.z, (TOUCH ? .92 : 1) - clamp(sp / 400, 0, 1) * .14 - me.alt * .1, Math.min(1, dt * 2));
  engineSet(sp, true);
  if (R.endT) {
    R.endT += dt;
    if (R.endT > 3 && !R.ended) { R.ended = true; endRace(); }
  }
  for (const k in pressed) pressed[k] = false;
}
function finishMe() {
  R.endT = .001;
  const p = R.me.place;
  toast(p === 1 ? '🏆 YOU WIN!' : `You came ${ord(p)}!`, true);
  if (p === 1) sfx.fanfare(); else sfx.right();
  if (R.q) closeRaceQ();
}
const ord = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

// in-race maths question
function askRace() {
  const f = nextFact();
  R.q = { ...f, t: RACE_Q_TIME, fb: 0 };
  const p = $('qPanel'); p.hidden = false;
  p.querySelector('.qq').textContent = `${f.a} × ${f.b} = ?`;
  p.querySelectorAll('.qopts button').forEach((b, i) => { b.textContent = f.opts[i]; b.className = ''; });
}
function stepRaceQ(dt) {
  const q = R.q;
  if (q.fb) { q.fb -= dt; if (q.fb <= 0) closeRaceQ(); return; }
  q.t -= dt;
  $('qPanel').querySelector('.qbar i').style.transform = `scaleX(${Math.max(0, q.t / RACE_Q_TIME)})`;
  if (AUTO && q.t < RACE_Q_TIME - 1.2) answerRace(Math.random() < AUTO_RIGHT ? q.opts.indexOf(q.ans) : (q.opts.indexOf(q.ans) + 1) % 3);
  else if (q.t <= 0) answerRace(-1);
}
function answerRace(i) {
  const q = R.q; if (!q || q.fb) return;
  const right = q.opts[i] === q.ans;
  answerFact(q.k, right);
  const p = $('qPanel');
  p.querySelectorAll('.qopts button').forEach((b, j) => b.className = q.opts[j] === q.ans ? 'right' : 'wrong');
  p.querySelector('.qq').textContent = `${q.a} × ${q.b} = ${q.ans}`;
  if (right) {
    sfx.right(); sfx.boost(); R.me.boost = Math.max(R.me.boost, 2.2);
    G.bricks += 5; R.earned.q += 5; floatText(R.me.x, R.me.y - 30, 'TURBO! +5 🧱');
  } else sfx.wrong();
  q.fb = right ? .7 : 1.6;
  save();
}
function closeRaceQ() { R.q = null; $('qPanel').hidden = true; }
$('qPanel').querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ac(); answerRace(+b.dataset.i); }));
function answerKey(i) { if (mode === 'race' && R?.q) answerRace(i); else if (mode === 'pit') answerPit(i); }

function endRace() {
  engineSet(0, false);
  // anyone not finished is placed by how far they got
  const rest = R.cars.filter(c => !c.done).sort((a, b) => b.prog - a.prog);
  const order = [...R.order, ...rest];
  const place = order.indexOf(R.me) + 1, prize = PRIZE[place - 1];
  G.bricks += prize; G.races++; if (place === 1) G.wins++;
  save();
  mode = 'result'; show('resultUI');
  $('resTitle').textContent = place === 1 ? '🏆 YOU WON!' : `You came ${ord(place)}!`;
  $('resList').innerHTML = order.map(c => `<li class="${c.me ? 'me' : ''}"><i style="background:${LOOKS[c.look].c}"></i>${c.me ? 'YOU' : LOOKS[c.look].name}</li>`).join('');
  $('resBricks').innerHTML = `Prize for ${ord(place)}: <b>+${prize} 🧱</b>` +
    (R.earned.q ? `<br>Maths turbos: <b>+${R.earned.q} 🧱</b>` : '') + (R.earned.bash ? `<br>Bashing cars: <b>+${R.earned.bash} 🧱</b>` : '');
  R.place = place;
  if (AUTO) console.log(`auto race ${G.races}: place ${place}, ${R.t.toFixed(0)}s, gaps ` + order.map(c => ((c.prog - R.me.prog) / T.N).toFixed(2)).join(' '));
  scene.t = 0;
  if (AUTO) setTimeout(() => mode === 'result' && startPit(), 1500);
}
$('pitBtn').onclick = () => { ac(); startPit(); };

// ---------------------------------------------------------------- pit stop maths
let P = null;
function startPit() {
  mode = 'pit'; show('pitUI');
  P = { n: 0, right: 0, streak: 0, earned: 0, q: null, wait: .6 };
  $('pitBody').hidden = false; $('pitDone').hidden = true;
  $('pitBody').querySelector('.pq').textContent = 'Ready…';
  $('pitBody').querySelectorAll('.popts button').forEach(b => { b.textContent = ''; b.className = ''; b.style.visibility = 'hidden'; });
  $('pitBody').querySelector('.pfb').textContent = '';
  pitUI();
}
function pitUI() {
  $('pitNum').textContent = `Question ${Math.min(PIT_QS, P.n + (P.q ? 1 : 0)) || 1} of ${PIT_QS}`;
  $('pitStreak').textContent = P.streak >= 2 ? `🔥 ${P.streak} in a row` : `🧱 +${P.earned}`;
}
function pitNext() {
  if (P.n >= PIT_QS) return pitFinish();
  const f = nextFact();
  P.q = { ...f, t: PIT_TIME, done: false };
  const body = $('pitBody');
  body.querySelector('.pq').textContent = `${f.a} × ${f.b}`;
  body.querySelectorAll('.popts button').forEach((b, i) => { b.textContent = f.opts[i]; b.className = ''; b.style.visibility = ''; });
  body.querySelector('.pfb').textContent = ''; body.querySelector('.pfb').className = 'pfb';
  pitUI();
}
function answerPit(i) {
  const q = P?.q; if (!q || q.done) return;
  q.done = true; P.n++;
  const right = i >= 0 && q.opts[i] === q.ans, body = $('pitBody'), fb = body.querySelector('.pfb');
  body.querySelectorAll('.popts button').forEach((b, j) => b.className = q.opts[j] === q.ans ? 'right' : 'wrong');
  body.querySelector('.pq').textContent = `${q.a} × ${q.b} = ${q.ans}`;
  if (right) {
    P.right++; P.streak++;
    let g = 6 + Math.ceil(q.t / 2.5);
    if (P.streak >= 3) g += 5;
    P.earned += g; G.bricks += g;
    fb.className = 'pfb good'; fb.textContent = (q.t > PIT_TIME - 3 ? 'SUPER FAST! ' : 'YES! ') + `+${g} 🧱` + (P.streak >= 3 ? ' (streak bonus!)' : '');
    sfx.right();
  } else {
    P.streak = 0;
    fb.className = 'pfb bad'; fb.textContent = i < 0 ? `Too slow! It's ${q.ans}` : `Oops! ${q.a} × ${q.b} = ${q.ans}`;
    sfx.wrong();
  }
  answerFact(q.k, right);
  pitUI();
  P.wait = right ? 1.1 : 2.4;
}
function stepPit(dt) {
  if (!P) return;
  if (P.wait > 0) { P.wait -= dt; if (P.wait <= 0) pitNext(); return; }
  const q = P.q; if (!q || q.done) return;
  q.t -= dt;
  $('pitBody').querySelector('.pbar i').style.transform = `scaleX(${Math.max(0, q.t / PIT_TIME)})`;
  if (AUTO && q.t < PIT_TIME - 1.5) answerPit(Math.random() < AUTO_RIGHT ? q.opts.indexOf(q.ans) : (q.opts.indexOf(q.ans) + 1) % 3);
  else if (q.t <= 0) answerPit(-1);
}
function pitFinish() {
  P.q = null;
  $('pitBody').hidden = true; $('pitDone').hidden = false;
  $('pitDone').querySelector('.pdTitle').innerHTML = `You got ${P.right} out of ${PIT_QS}!<br>+${P.earned} 🧱`;
  sfx.fanfare(); save();
  if (AUTO) setTimeout(() => mode === 'pit' && openGarage(), 1500);
}
$('pitBody').querySelectorAll('.popts button').forEach(b => b.addEventListener('pointerdown', e => { e.preventDefault(); ac(); answerPit(+b.dataset.i); }));
$('garBtn').onclick = () => { ac(); openGarage(); };

// ---------------------------------------------------------------- garage
function openGarage() {
  mode = 'garage'; show('garageUI'); renderGarage();
  if (AUTO) setTimeout(() => {
    if (mode !== 'garage') return;
    const it = UPG.find(u => canBuy(u)); if (it) buy(it);
    setTimeout(() => mode === 'garage' && startRace(), 800);
  }, 900);
}
const canBuy = u => lv(u.k) < u.max && (!u.need || lv(u.need) > 0) && G.bricks >= u.cost[lv(u.k)];
function buy(u) {
  if (!canBuy(u)) return;
  G.bricks -= u.cost[lv(u.k)]; G.up[u.k] = lv(u.k) + 1; save();
  sfx.buy(); toast(`${u.ic} ${u.name} bolted on!`);
  scene.pop = { k: u.k, t: 0 };
  renderGarage();
}
function renderGarage() {
  $('gBricks').textContent = G.bricks;
  $('gTrack').textContent = `Race ${G.races + 1}: ${TRACKS[G.races % TRACKS.length].name}`;
  $('gCars').innerHTML = '';
  for (const k of MY_CARS) {
    const b = document.createElement('button'); b.className = k === G.car ? 'on' : ''; b.title = LOOKS[k].name;
    b.appendChild(carThumb(k, 120, 64, 2)); b.onclick = () => { ac(); G.car = k; save(); renderGarage(); };
    $('gCars').appendChild(b);
  }
  $('shop').innerHTML = '';
  for (const u of UPG) {
    const l = lv(u.k), maxed = l >= u.max, locked = u.need && !lv(u.need);
    const b = document.createElement('button');
    b.className = 'item' + (maxed ? ' maxed' : canBuy(u) ? '' : ' cant');
    const dots = u.max > 1 ? `<span class="dots">${'●'.repeat(l)}${'○'.repeat(u.max - l)}</span> ` : '';
    const need = locked ? `Needs ${UPG.find(x => x.k === u.need).name} first` : u.desc;
    b.innerHTML = `<span class="ic">${u.ic}</span><span class="tx"><b>${u.name}</b>${dots}${need}</span><span class="cost">${maxed ? 'DONE ✓' : u.cost[l] + ' 🧱'}</span>`;
    b.onclick = () => { ac(); if (canBuy(u)) buy(u); else if (!maxed) { sfx.wrong(); toast(locked ? `Buy ${UPG.find(x => x.k === u.need).name} first!` : 'Not enough bricks! Do maths to win more.'); } };
    $('shop').appendChild(b);
  }
  // the times table grid
  const g = $('grid'); g.innerHTML = '';
  const un = unlocked(), cur = ORDER[G.tables - 1];
  const cell = (cls, txt) => { const d = document.createElement('div'); d.className = cls; d.textContent = txt; g.appendChild(d); };
  cell('hd', '×');
  for (let c = 1; c <= 12; c++) cell('hd' + (c === cur ? ' cur' : G.rows.includes(c) ? ' done' : ''), c);
  for (let r = 1; r <= 12; r++) {
    cell('hd' + (r === cur ? ' cur' : G.rows.includes(r) ? ' done' : ''), G.rows.includes(r) ? '⭐' : r);
    for (let c = 1; c <= 12; c++) {
      if (r === 1 || c === 1) { cell('one', r * c); continue; }
      const f = fact(fkey(r, c)), avail = un.includes(r) || un.includes(c);
      const cls = !avail ? 'locked' : f.b < 0 ? 'new' : f.b >= 3 ? 'gold' : 'b' + f.b;
      cell(cls, f.r ? r * c : '');
    }
  }
}
function carThumb(k, w, h, sc) {
  const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2;
  const g = c.getContext('2d'); g.scale(2, 2); g.translate(w / 2, h / 2); g.scale(sc, sc);
  drawCar(g, { look: k, me: true, boost: 0, alt: 0, flying: false, t: 0 }, k === G.car || mode !== 'garage' ? G.up : G.up);
  return c;
}
$('raceBtn').onclick = () => startRace();

// ---------------------------------------------------------------- title
function buildTitle() {
  const words = ['BRICK', 'RACERS'], cols = ['#e2231a', '#1f5fd6', '#ffd21a', '#3fae3a', '#ff7a12', '#8a4fe0'];
  let n = 0;
  document.querySelector('.logo').innerHTML = words.map(w => `<span class="w">${[...w].map(ch => `<span class="l" style="background:${cols[n++ % 6]}">${ch}</span>`).join('')}</span>`).join('');
  const box = $('carPick'); box.innerHTML = '';
  for (const k of MY_CARS) {
    const b = document.createElement('button'); b.className = 'carBtn' + (k === G.car ? ' on' : '');
    b.appendChild(carThumb(k, 200, 110, 3.2));
    b.appendChild(document.createTextNode(LOOKS[k].name));
    b.onclick = () => { ac(); G.car = k; save(); document.querySelectorAll('.carBtn').forEach(x => x.classList.toggle('on', x === b)); sfx.coin(); };
    box.appendChild(b);
  }
  $('goBtn').textContent = G.races ? 'TO THE GARAGE! 🛠️' : "LET'S RACE! 🏁";
}
$('goBtn').onclick = () => { ac(); goFullscreen(); G.races ? openGarage() : startRace(); };

// ---------------------------------------------------------------- drawing cars
function bodyPath(g, sh, L, Wd) {
  g.beginPath();
  if (sh === 'pointy') {
    g.moveTo(-L / 2 + 3, -Wd / 2); g.lineTo(L / 2 - 12, -Wd / 2); g.lineTo(L / 2, -Wd / 2 + 7); g.lineTo(L / 2, Wd / 2 - 7);
    g.lineTo(L / 2 - 12, Wd / 2); g.lineTo(-L / 2 + 3, Wd / 2); g.lineTo(-L / 2, Wd / 2 - 3); g.lineTo(-L / 2, -Wd / 2 + 3); g.closePath();
  } else g.roundRect(-L / 2, -Wd / 2, L, Wd, sh === 'round' ? 10 : sh === 'sport' ? 6 : 3);
}
// a car drawn from above, pointing right (+x), centred on 0,0
function drawCar(g, c, up, t = performance.now() / 1000) {
  const lk = LOOKS[c.look], L = lk.van ? 54 : 48, Wd = 26;
  const u = k => (c.me ? (up[k] || 0) : 0);
  const tyre = u('tyres');
  // wings go under everything
  if (u('wings')) {
    g.fillStyle = '#c8ccd4'; g.strokeStyle = '#6a707c'; g.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(8, s * Wd / 2); g.lineTo(-4, s * (Wd / 2 + 24)); g.lineTo(-16, s * (Wd / 2 + 24)); g.lineTo(-14, s * Wd / 2); g.closePath(); g.fill(); g.stroke();
      stud(g, -6, s * (Wd / 2 + 10), '#dfe3ea', 3);
      if (u('jets')) {
        g.fillStyle = '#4a4f5a'; g.beginPath(); g.roundRect(-18, s * (Wd / 2 + 17) - 5, 22, 10, 4); g.fill();
        g.fillStyle = '#e2231a'; g.fillRect(2, s * (Wd / 2 + 17) - 4, 3, 8);
        if (c.flying) { g.fillStyle = `rgba(255,${150 + Math.random() * 100 | 0},0,.9)`; g.beginPath(); g.moveTo(-18, s * (Wd / 2 + 17) - 4); g.lineTo(-30 - Math.random() * 12, s * (Wd / 2 + 17)); g.lineTo(-18, s * (Wd / 2 + 17) + 4); g.fill(); }
        g.fillStyle = '#c8ccd4';
      }
    }
  }
  // wheels
  const ww = 12 + tyre * 2, wh = 6 + tyre * 1.5;
  g.fillStyle = '#151515';
  for (const sx of [L / 2 - 12, -L / 2 + 10]) for (const s of [-1, 1]) {
    g.fillRect(sx - ww / 2, s * (Wd / 2 + wh / 2 - 2) - wh / 2, ww, wh);
    if (tyre) { g.fillStyle = '#ffd21a'; g.fillRect(sx - 2, s * (Wd / 2 + wh / 2 - 2) - wh / 2, 4, wh); g.fillStyle = '#151515'; }
  }
  // nitro tanks along the sides
  for (let i = 0; i < u('nitro'); i++) for (const s of [-1, 1]) {
    g.fillStyle = '#2bb4ff'; g.strokeStyle = '#0a5a8a'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(-10 + i * 8 - 3, s * (Wd / 2 + 2) - 3, 7, 6, 3); g.fill(); g.stroke();
  }
  // body
  bodyPath(g, lk.shape, L, Wd);
  g.fillStyle = lk.c; g.fill(); g.strokeStyle = lk.d; g.lineWidth = 2; g.stroke();
  g.save(); bodyPath(g, lk.shape, L, Wd); g.clip();
  if (lk.twotone) { g.fillStyle = lk.d; g.fillRect(-L / 2, -Wd / 2, L * .42, Wd); g.fillStyle = lk.c; g.beginPath(); g.ellipse(-L * .1, 0, 8, Wd / 2 - 3, 0, 0, TAU); g.fill(); }
  if (lk.stripe) { g.fillStyle = lk.a; g.fillRect(-L / 2, -3, L, 6); }
  if (c.look === 'police') { g.fillStyle = lk.a; g.fillRect(-L / 2, -Wd / 2, 12, Wd); g.fillRect(L / 2 - 12, -Wd / 2, 12, Wd); }
  if (c.look === 'taxi') { for (let i = 0; i < 6; i++) { g.fillStyle = i & 1 ? '#111' : '#fff'; g.fillRect(-L / 2 + 4 + i * 5, Wd / 2 - 4, 5, 4); g.fillRect(-L / 2 + 4 + i * 5, -Wd / 2, 5, 4); } }
  g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-L / 2, -Wd / 2, L, 4);
  g.restore();
  // studs on the bonnet
  const sc = shade(lk.c, .1);
  stud(g, L / 2 - 13, -5, sc, 3.4); stud(g, L / 2 - 13, 5, sc, 3.4);
  if (lk.shape !== 'pointy') { stud(g, L / 2 - 5, -5, sc, 3.4); stud(g, L / 2 - 5, 5, sc, 3.4); }
  if (lk.badge) { g.fillStyle = lk.a; g.beginPath(); g.roundRect(L / 2 - 9, -3, 5, 6, 1); g.fill(); }
  // cockpit + minifig driver
  const cw = lk.shape === 'box' ? 24 : 16, cx = lk.shape === 'box' ? -6 : -2;
  g.fillStyle = 'rgba(20,30,50,.75)'; g.beginPath(); g.roundRect(cx - cw / 2, -Wd / 2 + 4, cw, Wd - 8, 4); g.fill();
  g.fillStyle = 'rgba(160,210,255,.35)'; g.fillRect(cx + cw / 2 - 4, -Wd / 2 + 5, 3, Wd - 10);
  if (lk.shape !== 'box') {
    g.fillStyle = c.me ? '#ffffff' : lk.a; g.beginPath(); g.arc(cx - 1, 0, 6, 0, TAU); g.fill();
    g.fillStyle = '#ffd21a'; g.beginPath(); g.arc(cx - 1, 0, 4, 0, TAU); g.fill();
    g.fillStyle = '#111'; g.fillRect(cx + 1, -2, 1.5, 1.5); g.fillRect(cx + 1, 1, 1.5, 1.5);
  } else { g.fillStyle = shade(lk.c, -.1); g.fillRect(cx - cw / 2 + 2, -Wd / 2 + 6, cw - 4, Wd - 12); stud(g, cx - 4, -4, shade(lk.c, .1), 3); stud(g, cx - 4, 4, shade(lk.c, .1), 3); stud(g, cx + 4, -4, shade(lk.c, .1), 3); stud(g, cx + 4, 4, shade(lk.c, .1), 3); }
  if (lk.sign) { g.fillStyle = '#fff'; g.fillRect(cx - 3, -6, 6, 12); g.fillStyle = '#111'; g.fillRect(cx - 1, -4, 2, 8); }
  if (lk.lights) { const on = (t * 6 | 0) % 2; g.fillStyle = on ? '#ff2a2a' : '#5a0000'; g.fillRect(cx - 3, -8, 6, 7); g.fillStyle = on ? '#00316b' : '#3aa0ff'; g.fillRect(cx - 3, 1, 6, 7); }
  if (lk.spare) { g.fillStyle = '#151515'; g.beginPath(); g.arc(-L / 2 - 2, 0, 6, 0, TAU); g.fill(); g.fillStyle = '#777'; g.beginPath(); g.arc(-L / 2 - 2, 0, 2.5, 0, TAU); g.fill(); }
  if (lk.van) { g.fillStyle = '#ff8fc4'; g.beginPath(); g.arc(-12, 0, 7, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(-12, 0, 4, 0, TAU); g.fill(); g.fillStyle = '#ffd21a'; g.beginPath(); g.moveTo(-12, -3); g.lineTo(-18, 0); g.lineTo(-12, 3); g.fill(); }
  // headlights
  g.fillStyle = '#fff7c0';
  g.fillRect(L / 2 - 3, -Wd / 2 + 3, 3, 4); g.fillRect(L / 2 - 3, Wd / 2 - 7, 3, 4);
  // engine on the back
  const e = u('engine');
  if (e) {
    g.fillStyle = '#7a808c'; g.beginPath(); g.roundRect(-L / 2 + 3, -7, 10, 14, 2); g.fill();
    stud(g, -L / 2 + 8, -3, '#a6acb8', 2.6); stud(g, -L / 2 + 8, 3, '#a6acb8', 2.6);
    g.fillStyle = '#c8ccd4';
    for (let i = 0; i < e; i++) { const y = (i - (e - 1) / 2) * 6; g.beginPath(); g.arc(-L / 2 - 1, y, 2.6, 0, TAU); g.fill(); }
    if (e >= 3) { g.fillStyle = '#e2231a'; g.fillRect(-L / 2 + 13, -2, 3, 4); }
  }
  // rocket booster
  if (u('rocket')) {
    g.fillStyle = '#e2e2e2'; g.beginPath(); g.roundRect(-L / 2 - 12, -5, 16, 10, 5); g.fill();
    g.fillStyle = '#e2231a'; g.beginPath(); g.moveTo(-L / 2 + 4, -5); g.lineTo(-L / 2 + 9, 0); g.lineTo(-L / 2 + 4, 5); g.fill();
    g.fillStyle = '#e2231a'; g.fillRect(-L / 2 - 12, -7, 4, 14);
  }
  // spoiler
  const sp = u('spoiler');
  if (sp) {
    g.fillStyle = '#222'; g.fillRect(-L / 2 + 2, -6, 3, 3); g.fillRect(-L / 2 + 2, 3, 3, 3);
    g.fillStyle = sp > 1 ? lk.c : '#2a2a2a'; g.strokeStyle = '#111'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(-L / 2 - 4, -(Wd / 2 + sp * 3), 6, Wd + sp * 6, 2); g.fill(); g.stroke();
  }
  // bumper
  const bu = u('bumper');
  if (bu) {
    g.fillStyle = '#c8ccd4'; g.strokeStyle = '#555'; g.lineWidth = 1.5;
    g.beginPath(); g.roundRect(L / 2 - 1, -(Wd / 2 + 2), 5, Wd + 4, 2); g.fill(); g.stroke();
    if (bu > 1) { g.fillStyle = '#ffd21a'; for (const y of [-9, 0, 9]) { g.beginPath(); g.moveTo(L / 2 + 4, y - 3); g.lineTo(L / 2 + 10, y); g.lineTo(L / 2 + 4, y + 3); g.fill(); } }
  }
}
function drawCarAt(c) {
  const sc = 1 + c.alt * .5, sh = 5 + c.alt * 40;
  // shadow
  ctx.save(); ctx.translate(c.x + sh, c.y + sh * 1.1); ctx.rotate(c.ang); ctx.scale(1 - c.alt * .1, 1 - c.alt * .1);
  ctx.fillStyle = `rgba(0,0,0,${.3 - c.alt * .12})`; ctx.beginPath(); ctx.roundRect(-26, -15, 52, 30, 8); ctx.fill();
  ctx.restore();
  ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(c.ang); ctx.scale(sc, sc);
  drawCar(ctx, c, G.up);
  ctx.restore();
  if (c.me && R.t < 2 && R.t > -4) {   // arrow over your car at the start
    ctx.fillStyle = '#ffd21a'; ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 3;
    const y = c.y - 44 + Math.sin(R.t * 8) * 4;
    ctx.beginPath(); ctx.moveTo(c.x - 10, y - 14); ctx.lineTo(c.x + 10, y - 14); ctx.lineTo(c.x, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    txt('YOU', c.x, y - 20, 18, '#ffd21a');
  }
}
function txt(s, x, y, size, col = '#fff', align = 'center', stroke = '#1d1a33', lw = 5) {
  ctx.font = FONT(size); ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round'; ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(s, x, y);
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}

// ---------------------------------------------------------------- drawing the race
function drawRace() {
  const cam = R.cam, z = cam.z, vw = W / z, vh = H / z;
  const sx = cam.x - vw / 2, sy = cam.y - vh / 2;
  ctx.fillStyle = T.tr.base; ctx.fillRect(0, 0, W, H);
  ctx.save(); ctx.scale(z, z); ctx.translate(-sx, -sy);
  // the baked track: only copy the bit on screen
  const x0 = Math.max(0, sx), y0 = Math.max(0, sy), x1 = Math.min(T.w, sx + vw), y1 = Math.min(T.h, sy + vh);
  if (x1 > x0 && y1 > y0) ctx.drawImage(T.img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  // question bricks
  const now = performance.now() / 1000;
  for (const b of R.boxes) {
    if (b.t > 0) continue;
    const bob = Math.sin(now * 4 + b.i) * 3;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(b.x - 17, b.y - 13, 40, 40);
    brickAt(b.x - 20, b.y - 20 + bob, '#ffd21a');
    txt('?', b.x, b.y + 11 + bob, 30, '#fff', 'center', '#b38f00', 5);
  }
  for (const p of parts) if (p.kind === 'dust') {
    ctx.globalAlpha = p.life / p.max * .5; ctx.fillStyle = shade(p.col, -.15);
    ctx.beginPath(); ctx.arc(p.x, p.y, 6 + (1 - p.life / p.max) * 10, 0, TAU); ctx.fill();
  }
  ctx.globalAlpha = 1;
  const cars = R.cars.slice().sort((a, b) => a.alt - b.alt);
  for (const c of cars) drawCarAt(c);
  for (const p of parts) {
    if (p.kind === 'fire') {
      const k = p.life / p.max; ctx.globalAlpha = k;
      ctx.fillStyle = k > .5 ? '#ffe36a' : '#ff7a12';
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, 3 + k * 5, 0, TAU); ctx.fill();
    } else if (p.kind === 'brick') {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(p.x - 4, p.y - 2, 8, 5);
      ctx.save(); ctx.translate(p.x, p.y - p.z * .6); ctx.rotate(p.rot); const s = 1 + p.z / 150;
      ctx.scale(s, s); ctx.fillStyle = p.col; ctx.fillRect(-5, -3.5, 10, 7); ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillRect(-3, -2, 2.5, 2.5); ctx.fillRect(1, -2, 2.5, 2.5);
      ctx.restore();
    }
  }
  ctx.globalAlpha = 1;
  for (const f of floats) { ctx.globalAlpha = Math.min(1, (1.4 - f.t) * 2); txt(f.s, f.x, f.y - 30 - f.t * 40, 22, f.col); }
  ctx.globalAlpha = 1;
  ctx.restore();
  drawHud();
}
function brickAt(x, y, col) {
  ctx.fillStyle = col; ctx.fillRect(x, y, 40, 40); ctx.strokeStyle = shade(col, -.35); ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, 38, 38);
  for (const [a, b] of [[10, 10], [30, 10], [10, 30], [30, 30]]) stud(ctx, x + a, y + b, shade(col, .1), 6);
}
function drawHud() {
  const me = R.me;
  const order = R.cars.slice().sort((a, b) => (b.done ? 1e9 - b.place : b.prog) - (a.done ? 1e9 - a.place : a.prog));
  const pos = me.done ? me.place : order.indexOf(me) + 1;
  const lap = clamp(Math.floor(me.prog / T.N) + 1, 1, LAPS);
  // position + lap (top left)
  ctx.fillStyle = 'rgba(29,26,51,.55)'; ctx.beginPath(); ctx.roundRect(12, 12, 170, 92, 14); ctx.fill();
  txt(ord(pos), 28, 70, 56, pos === 1 ? '#ffd21a' : '#fff', 'left');
  txt('of 6', 110, 70, 22, '#fff', 'left');
  txt(`LAP ${lap}/${LAPS}`, 28, 96, 22, '#fff', 'left');
  // bricks
  txt(`🧱 ${G.bricks}`, 196, 42, 26, '#ffd21a', 'left');
  // minimap (top right)
  const mm = T.mm, mx = W - mm.w - 16, my = 14;
  ctx.fillStyle = 'rgba(29,26,51,.7)'; ctx.beginPath(); ctx.roundRect(mx - 6, my - 6, mm.w + 12, mm.h + 12, 10); ctx.fill();
  ctx.strokeStyle = '#ddd'; ctx.lineWidth = 4; ctx.beginPath();
  for (let i = 0; i <= T.N; i += 4) { const k = i % T.N; const px = mx + T.X[k] * mm.sc, py = my + T.Y[k] * mm.sc; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
  ctx.closePath(); ctx.stroke();
  for (const c of R.cars) {
    ctx.fillStyle = LOOKS[c.look].c; ctx.strokeStyle = c.me ? '#fff' : '#1d1a33'; ctx.lineWidth = c.me ? 3 : 1.5;
    ctx.beginPath(); ctx.arc(mx + c.x * mm.sc, my + c.y * mm.sc, c.me ? 6 : 4, 0, TAU); ctx.fill(); ctx.stroke();
  }
  // nitro + fly fuel (bottom right on desktop; touch has buttons there, so go bottom middle)
  const bx = TOUCH ? W / 2 - 80 : W - 190, by = H - 28;
  if (me.st.nitro) {
    txt(TOUCH ? 'NITRO' : 'NITRO (Space)', bx, by - 18, 18, '#fff', 'left', '#1d1a33', 4);
    for (let i = 0; i < me.st.nitro; i++) { ctx.fillStyle = i < me.nitro ? '#2bb4ff' : 'rgba(255,255,255,.25)'; ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(bx + i * 30, by - 10, 24, 16, 5); ctx.fill(); ctx.stroke(); }
  }
  if (me.st.fly) {
    const fy = by - 50;
    txt(TOUCH ? 'FLY' : 'FLY (hold F)', bx, fy - 8, 18, '#fff', 'left', '#1d1a33', 4);
    ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.fillRect(bx, fy, 150, 10);
    ctx.fillStyle = me.flying ? '#ff7a12' : '#ffd21a'; ctx.fillRect(bx, fy, 150 * me.flyE, 10);
    ctx.strokeStyle = '#1d1a33'; ctx.lineWidth = 2; ctx.strokeRect(bx, fy, 150, 10);
  }
  // countdown lights
  if (R.t < .8) {
    const n = Math.ceil(-R.t), cx = W / 2;
    ctx.fillStyle = 'rgba(29,26,51,.8)'; ctx.beginPath(); ctx.roundRect(cx - 110, 150, 220, 74, 16); ctx.fill();
    for (let i = 0; i < 3; i++) {
      const lit = R.t < 0 ? 3 - n >= i : true;
      ctx.fillStyle = R.t >= 0 ? '#3fdc3a' : lit ? '#e2231a' : '#444';
      ctx.beginPath(); ctx.arc(cx - 66 + i * 66, 187, 24, 0, TAU); ctx.fill();
    }
    txt(R.t < 0 ? (n <= 3 ? String(n) : 'READY?') : 'GO!', cx, 310, R.t < 0 ? 80 : 110, R.t < 0 ? '#fff' : '#3fdc3a');
  }
  if (me.off && !me.st.glide && me.alt < .5 && R.t > 0 && !me.done) txt('ON THE GRASS!', W / 2, H - 30, 28, '#fff');
  if (!me.done && R.t > 0) {   // wrong way?
    const dir = Math.cos(wrapA(Math.atan2(me.vy, me.vx) - T.A[me.idx]));
    if (dir < -.5 && Math.hypot(me.vx, me.vy) > 60) txt('WRONG WAY!', W / 2, 140, 46, '#ff5050');
  }
}

// menus: baseplate background with your car parked on it
const scenePat = {};
function drawScene(dt) {
  scene.t += dt;
  const base = mode === 'title' ? '#3e9a36' : '#5a6070';
  if (!scenePat[base]) scenePat[base] = ctx.createPattern(studTile(base), 'repeat');
  ctx.save(); ctx.translate(-(scene.t * 20 % S), -(scene.t * 10 % S));
  ctx.fillStyle = scenePat[base]; ctx.fillRect(0, 0, W + S, H + S); ctx.restore();
  if (mode === 'title') {   // cars zooming past behind the logo
    for (let i = 0; i < 5; i++) {
      const k = [...MY_CARS, 'taxi', 'police'][i], x = ((scene.t * (180 + i * 40) + i * 300) % (W + 300)) - 150, y = 70 + i * 100;
      ctx.save(); ctx.translate(x, y); ctx.scale(1.6, 1.6); drawCar(ctx, { look: k, me: false, alt: 0 }, {}); ctx.restore();
    }
    ctx.fillStyle = 'rgba(29,26,51,.25)'; ctx.fillRect(0, 0, W, H);
  }
  if (mode === 'garage') {
    const g = $('gCar').getContext('2d');
    g.clearRect(0, 0, 520, 220);
    g.save(); g.translate(260, 112);
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(6, 10, 190, 72, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffd21a'; g.beginPath(); g.ellipse(0, 0, 190, 72, 0, 0, TAU); g.fill(); g.strokeStyle = '#1d1a33'; g.lineWidth = 4; g.stroke();
    let s = 3.4;
    if (scene.pop && scene.pop.t < .5) { scene.pop.t += dt; s *= 1 + Math.sin(scene.pop.t / .5 * Math.PI) * .12; }
    g.rotate(Math.sin(scene.t * .8) * .08); g.scale(s, s);
    drawCar(g, { look: G.car, me: true, alt: 0, flying: lv('jets') > 0 && (scene.t % 4) < 1.5 }, G.up);
    g.restore();
  }
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (mode === 'race') { stepRace(dt); drawRace(); }
  else {
    if (mode === 'pit') stepPit(dt);
    if (R && (mode === 'result' || mode === 'pit')) { stepRace(dt); drawRace(); ctx.fillStyle = 'rgba(29,26,51,.15)'; ctx.fillRect(0, 0, W, H); }
    else drawScene(dt);
  }
}
const timerLoop = AUTO || SHOT;
function loop() {
  const now = performance.now(); frame(now);
  if (timerLoop) setTimeout(loop, 16); else requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- test / screenshot setups
if (SHOT === 'garage' || SHOT === 'race' || SHOT === 'fly') {
  G = fresh(); G.races = 3; G.bricks = 135; G.tables = 4;
  for (const t of [2, 10, 5]) for (let n = 2; n <= 12; n++) { const f = fact(fkey(t, n)); f.b = t === 5 && n > 8 ? 1 : 3; f.r = 1; }
  fact(fkey(3, 3)).b = 1; fact(fkey(3, 3)).r = 1; fact(fkey(3, 4)).b = 0;
  G.rows = [2, 10];
  G.up = SHOT === 'garage' ? { engine: 2, tyres: 1, nitro: 1, spoiler: 1 } : { engine: 3, tyres: 3, spoiler: 2, bumper: 2, nitro: 3, rocket: 1, wings: 1, jets: 1 };
  if (SHOT === 'fly') { G.car = 'mclaren'; keys.fly = true; }
  if (SHOT === 'race') G.car = 'ferrari';
}
if (SHOT && Q.has('track')) G.races = +Q.get('track');   // pick the track for screenshots
buildTitle();
if (SHOT === 'garage') openGarage();
else if (SHOT === 'race' || SHOT === 'fly' || AUTO) startRace();
else if (SHOT === 'pit') { buildTrack(TRACKS[0]); startPit(); }
else show('titleUI');
if (SHOT === 'race' || SHOT === 'fly') setTimeout(() => { if (SHOT === 'race') askRace(); }, 7000);
loop();
