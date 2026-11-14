'use strict';
// Survive the Night — a choose-your-own-adventure with little cutscenes.
// Build a base, then survive as many nights as you can. Days are for chopping, building, mining and exploring.
// The story is plain async code (see "THE STORY" below). Cutscene helpers (walkTo, tween, wait, say...) return
// promises that resolve when the animation finishes, so the story reads top to bottom.

const cv = document.getElementById('cv'), ctx = cv.getContext('2d');
const W = 960, H = 540, B = 30, COLS = 110, WORLD = COLS * B;
const Z = 1.35, VW = W / Z, VH = H / Z; // camera zoom and the size of the world view
const FONT = "'Pixelify Sans', system-ui, sans-serif";
const ACTIONS_PER_DAY = 2;

// ---------- world layout ----------
// Ground top row for each column. Flat at row 14, with a hill (row 11) around columns 69–89.
function gh(c) { return (c >= 69 && c <= 89) ? 14 - Math.min(3, c - 68, 90 - c) : 14; }
function groundAt(x) { return gh(Math.floor(x / B)) * B; }
// Ores hidden in the stone. Stone starts 3 blocks under the grass.
function oreAt(c, r) {
  if (r < gh(c) + 4) return null;
  const h = hsh(c * 31 + 5, r * 17 + 3);
  return h > 0.975 ? 'crystal' : h > 0.86 ? 'iron' : null;
}

// Places you can build. c = main room's left wall column (extra rooms go to the left),
// tree = the tree in front of the base (baddies come from the right).
const SPOTS = [
  { c: 14, tree: 22, text: 'A flat, grassy field.' },
  { c: 40, tree: 46, text: 'A cosy spot right next to a big tree.' },
  { c: 80, tree: 87, text: 'The top of a hill. You can see for miles!' },
];
const TREE_COLS = [2, 22, 28, 46, 55, 62, 87, 95, 102];
const MAX_ROOMS = 2, ROOM_COST = 4, REBUILD_WOOD = 10, REBUILD_STONE = 5;
const AXES = ['stone axe', 'iron axe', 'crystal axe'];
const SWORDS = ['wooden sword', 'stone sword', 'iron sword', 'crystal sword'];
// Baddies get tougher: their armour goes up a level every 2 nights. Your sword must be at least as strong.
const ARMOURS = [null, 'stone armour', 'iron armour', 'crystal armour'];
const ARMOUR_COL = [null, ['#8e8e96', '#b4b4bc'], ['#c4c9d0', '#f2f4f8'], ['#2ec4d0', '#9ff8fa']];
const armourFor = night => Math.min(3, Math.floor((night - 1) / 2));
const FRIEND_NAMES = ['Sam', 'Ava', 'Leo', 'Mia', 'Max', 'Zoe', 'Finn', 'Ruby'];
const FRIEND_LOOKS = [
  { shirt: '#3d9b4a', shirtD: '#2b7336', hair: '#e2b33c', band: '#ffffff' },
  { shirt: '#e08a2c', shirtD: '#b06a1c', hair: '#1f1a17', band: '#7a4dff' },
  { shirt: '#2f8fd6', shirtD: '#216aa0', hair: '#a8452a', band: '#ffd84a' },
  { shirt: '#d65aa8', shirtD: '#a8407f', hair: '#4a2c16', band: '#3fd0c9' },
];

const DEATHS = {
  clink:     { emoji: '🪓', title: 'Clink!', text: "Axes can't hurt baddies! You need a sword." },
  snap:      { emoji: '🛡️', title: 'Snap!', text: "Your sword wasn't strong enough for his armour. Baddies get tougher every night, so keep upgrading your sword!" },
  kaboom:    { emoji: '💥', title: 'Kaboom!', text: 'You stayed in the middle of the room... but the bombs blew up the base.' },
  frontdoor: { emoji: '🚪', title: 'Wrong Door', text: 'You ran out the front door, right into the baddie.' },
  nobase:    { emoji: '🏚️', title: 'Nowhere to Hide', text: 'With no base and nowhere to hide, the baddie got you. Rebuild your base as soon as you can!' },
};

// ---------- helpers ----------
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeIn = t => t * t, easeOut = t => 1 - (1 - t) * (1 - t);
const pick = arr => arr[(Math.random() * arr.length) | 0];
function hsh(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function mix(c1, c2, t) {
  const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
  const a = p(c1), b = p(c2);
  return 'rgb(' + a.map((v, i) => Math.round(lerp(v, b[i], t))).join(',') + ')';
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem('survive.' + k); localStorage.setItem('survive.' + k, v); } catch (e) { return null; } }

// ---------- sound ----------
let AC = null, muted = false;
function ac() { if (!AC) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} return AC; }
function beep(f, d = 0.1, type = 'square', v = 0.06, f2) {
  const a = ac(); if (!a || muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + d);
  g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + d);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + d);
}
function noise(d = 0.4, v = 0.3, freq = 800) {
  const a = ac(); if (!a || muted) return;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * d), a.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  f.type = 'lowpass'; f.frequency.value = freq; g.gain.value = v;
  s.buffer = buf; s.connect(f).connect(g).connect(a.destination); s.start();
}
const seq = (notes, gap, d = 0.12, type = 'square', v = 0.05) => notes.forEach((f, i) => setTimeout(() => beep(f, d, type, v), i * gap));
const SFX = {
  pop: () => beep(500 + Math.random() * 300, 0.05, 'square', 0.04),
  chop: () => { noise(0.12, 0.4, 1200); beep(140, 0.08, 'triangle', 0.1); },
  thud: () => { noise(0.35, 0.5, 300); beep(70, 0.3, 'sine', 0.2, 40); },
  ding: () => seq([660, 880, 1100, 1320], 90),
  swish: () => noise(0.15, 0.25, 3000),
  hit: () => { beep(220, 0.1, 'square', 0.08, 90); noise(0.08, 0.3, 2000); },
  clink: () => { beep(1800, 0.15, 'triangle', 0.1); beep(2400, 0.2, 'sine', 0.06); },
  boom: () => { noise(1.4, 0.9, 500); beep(60, 0.8, 'sine', 0.35, 25); },
  hiss: () => noise(0.5, 0.06, 6000),
  door: () => beep(180, 0.08, 'square', 0.05, 120),
  dig: () => noise(0.1, 0.3, 700),
  step: () => { noise(0.08, 0.35, 200); },
  bad: () => seq([300, 250, 200, 140], 160, 0.2),
  win: () => seq([523, 659, 784, 1047, 784, 1047], 120, 0.15),
  gem: () => seq([1047, 1319, 1568, 2093], 70, 0.1, 'triangle', 0.07),
};

// ---------- state ----------
// S = what's on screen (world, actors, particles). G = the player's progress (resources, tools, nights).
let S, G, hero, baddie;
function mkActor(kind, x, look) {
  return { kind, x, y: groundAt(x), dir: 1, walking: false, walkT: 0, arm: 0, item: null, angle: 0, dead: false,
           visible: true, alpha: 1, flash: 0, free: false, hopY: 0, look: look || null, armour: 0, evil: false };
}
function resetWorld() {
  S = { tod: 0, time: 0, cam: { x: 0, y: 0, shake: 0, focus: null, focusY: null }, trees: [], base: null, bombs: [],
        parts: [], dug: new Set(), escape: [], flash: 0, bubbles: [], chest: null, strangers: [] };
  for (const c of TREE_COLS) S.trees.push({ c, h: 4 + (c % 2), angle: 0, gone: false, shake: 0 });
  G = { night: 0, day: 0, wood: 0, stone: 0, axe: 0, sword: -1, mine: 0, mineLen: 0, friends: [], rejected: [], spot: null, phase: 'day', left: 0, met: 0 };
  hero = mkActor('hero', 1.5 * B); hero.item = 'axe0';
  baddie = mkActor('baddie', 0); baddie.visible = false; baddie.dir = -1; baddie.item = 'knife'; baddie.armour = 0;
  tasks = [];
}
const people = () => [hero, ...G.friends];

// ---------- tasks / cutscene helpers ----------
let tasks = [];
function addTask(fn) { return new Promise(res => tasks.push({ fn, res })); }
function wait(s) { let t = 0; return addTask(dt => (t += dt) >= s); }
function tween(o, k, to, dur, ease) {
  const from = o[k]; let t = 0;
  return addTask(dt => { t += dt; const p = Math.min(1, t / dur); o[k] = from + (to - from) * (ease ? ease(p) : p); return p >= 1; });
}
function walkTo(a, x, speed = 150) {
  a.walking = true; if (x !== a.x) a.dir = x > a.x ? 1 : -1;
  return addTask(dt => {
    const d = x - a.x, s = speed * dt;
    if (Math.abs(d) <= s) { a.x = x; a.walking = false; return true; }
    a.x += Math.sign(d) * s; return false;
  });
}
async function hop(a) { await tween(a, 'hopY', -14, 0.1, easeOut); await tween(a, 'hopY', 0, 0.12, easeIn); }
async function swing(a) { SFX.swish(); await tween(a, 'arm', 2.7, 0.14, easeOut); await tween(a, 'arm', -1.4, 0.09); await wait(0.08); }
async function restArm(a) { await tween(a, 'arm', 0, 0.15); }
function say(a, text, dur = 1.6) { S.bubbles = S.bubbles.filter(b => b.a !== a); S.bubbles.push({ a, text, t: dur }); return wait(dur); }
function shake(n) { S.cam.shake = Math.max(S.cam.shake, n); }
function burst(x, y, n, colors, opt = {}) {
  for (let i = 0; i < n; i++) {
    const ang = opt.up ? -Math.PI / 2 + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2, sp = (opt.speed || 160) * (0.4 + Math.random());
    S.parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, size: opt.size || 4 + Math.random() * 5,
      color: colors[(Math.random() * colors.length) | 0], life: opt.life || 0.6 + Math.random() * 0.6, grav: opt.grav ?? 500, spin: 0 });
  }
}
async function death(a) {
  a.flash = 0.2; a.dead = true; SFX.bad();
  await tween(a, 'angle', -Math.PI / 2, 0.45, easeIn); shake(4); await wait(0.6);
}
async function stab(bad, victim) {
  bad.dir = victim.x > bad.x ? 1 : -1;
  await tween(bad, 'arm', 2.5, 0.2, easeOut); SFX.swish();
  await tween(bad, 'arm', -1.5, 0.08);
  SFX.hit(); victim.flash = 0.25; burst(victim.x, victim.y - 35, 10, ['#fff', '#ffe08a'], { speed: 120, grav: 0, life: 0.3, size: 4 });
  await wait(0.2); restArm(bad);
}
async function footsteps(n) { for (let i = 0; i < n; i++) { SFX.step(); await wait(0.45); } }

// ---------- story UI ----------
const elText = document.getElementById('text'), elChoices = document.getElementById('choices');
let pending = null;
function caption(t) { elText.textContent = t; elChoices.innerHTML = ''; }
function ask(text, opts) {
  elText.textContent = text; elChoices.innerHTML = '';
  return new Promise(res => {
    const done = k => { pending = null; elChoices.innerHTML = ''; beep(880, 0.05, 'square', 0.05); res(k); };
    for (const o of opts) {
      const b = document.createElement('button');
      if (o.next) { b.className = 'next'; b.textContent = o.label; }
      else b.innerHTML = `<kbd>${o.k}</kbd><span>${o.label}</span>`;
      b.onclick = () => done(o.k);
      elChoices.appendChild(b);
    }
    pending = { opts, done };
    elChoices.querySelector('button').focus({ preventScroll: true });
    if (AUTO) wait(0.4).then(() => { if (opts[0].next) return done('next'); const a = AUTO.shift(); done(opts.some(o => o.k === a) ? a : opts[0].k); });
  });
}
const narrate = text => ask(text, [{ k: 'next', label: 'Next ▶', next: true }]);
const YN = [{ k: 'y', label: 'Yes' }, { k: 'n', label: 'No' }];
// Numbered choices: menu([['id', 'label'], ...]) resolves with the chosen id.
async function menu(text, items) {
  const k = await ask(text, items.map((it, i) => ({ k: String(i + 1), label: it[1] })));
  return items[+k - 1][0];
}
addEventListener('keydown', e => {
  if (!pending) return;
  const key = e.key.toLowerCase();
  const o = pending.opts.find(o => o.next ? (key === ' ' || key === 'enter') : o.k === key);
  if (o) { e.preventDefault(); pending.done(o.k); }
});

// ---------- the base ----------
// Main room: cols s..s+4 (walls at s and s+4, door in s+4). Extra room k: cols s-4k..s-4k+3, to the left.
// The mine shaft goes down at col s+3 and its tunnel runs right, 4–5 blocks under the base floor.
function makeBase(s) { return { s, g: gh(s), rooms: 0, gone: false, cells: [], back: 0, door: 'none', furnish: false }; }
const leftWall = () => S.base.s - 4 * S.base.rooms;
function wantedCells(b) {
  const out = new Map(), s = b.s, g = b.g, wall = 'plank';
  if (b.gone) return out;
  const add = (c, r, k) => out.set(c + ',' + r, { c, r, k });
  for (let k = 1; k <= b.rooms; k++) {
    const x0 = s - 4 * k;
    for (let r = g - 1; r >= g - 4; r--) add(x0, r, wall);
    for (let c = x0 - 1; c <= x0 + 3; c++) add(c, g - 5, 'roof');
    for (let c = x0; c <= x0 + 3; c++) add(c, g - 6, 'roof');
  }
  {
    for (let r = g - 1; r >= g - 4; r--) { if (b.rooms === 0 || r <= g - 3) add(s, r, wall); if (r <= g - 3) add(s + 4, r, wall); }
    for (let c = s - 1; c <= s + 5; c++) add(c, g - 5, 'roof');
    for (let c = s; c <= s + 4; c++) add(c, g - 6, 'roof');
    for (let c = s + 1; c <= s + 3; c++) add(c, g - 7, 'roof');
    add(s + 2, g - 8, 'roof');
  }
  return out;
}
// Work out which blocks the base should have now. New or changed blocks start hidden so buildCells can pop them in.
function syncCells(b, instant) {
  const old = new Map(b.cells.map(cl => [cl.c + ',' + cl.r, cl]));
  b.cells = [...wantedCells(b).entries()].map(([key, cl]) => {
    const o = old.get(key);
    return { ...cl, vis: instant || (o && o.k === cl.k && o.vis) };
  });
}
async function buildCells(b, who) {
  for (const cl of b.cells) {
    if (cl.vis) continue;
    cl.vis = true; SFX.pop();
    burst((cl.c + 0.5) * B, (cl.r + 0.5) * B, 3, ['#fff', '#d9b27a'], { speed: 60, grav: 0, life: 0.3, size: 3 });
    if (Math.random() < 0.25) hop(who || hero);
    await wait(0.06);
  }
}
const doorX = () => (S.base.s + 4.5) * B;
const insideX = () => (S.base.s + 2.5) * B;
const outsideX = () => (S.base.s + 5.5) * B;
const frontX = () => (S.base.s + 5) * B;
const shaftX = () => (S.base.s + 3.5) * B;
const FRIEND_SLOTS = [1.3, 3.6, 1.9];
const friendHomeX = i => (S.base.s + FRIEND_SLOTS[i]) * B;
async function goOut(a = hero) {
  if (S.base.gone) return walkTo(a, outsideX(), 170);
  S.base.door = 'open'; SFX.door(); await walkTo(a, outsideX(), 170); S.base.door = 'closed'; SFX.door();
}
async function goIn(a = hero, x = insideX()) {
  if (S.base.gone) return walkTo(a, x, 190);
  S.base.door = 'open'; SFX.door(); await walkTo(a, x, 190); S.base.door = 'closed'; SFX.door();
}

function placeEveryoneInside() {
  hero.x = insideX(); hero.y = groundAt(hero.x); hero.dir = 1; hero.free = false;
  G.friends.forEach((f, i) => { f.x = friendHomeX(i); f.y = groundAt(f.x); f.dir = 1; f.free = false; });
}

async function explode(b) {
  const bx = (b.s + 5.5) * B, by = b.g * B - 15;
  for (const bm of S.bombs) bm.fast = true;
  SFX.hiss(); await wait(1.2);
  S.bombs = []; S.flash = 1; shake(18); SFX.boom();
  burst(bx, by, 40, ['#ffd84a', '#ff8a2a', '#ff4b2a', '#fff'], { speed: 320, grav: 100, life: 0.7, size: 8 });
  for (let i = 0; i < 25; i++) setTimeout(() => S && burst(bx - 60 + Math.random() * 150, by - Math.random() * 90, 1, ['#555', '#777', '#444'], { speed: 30, grav: -40, life: 2, size: 18 }), i * 40);
  for (const cl of b.cells) { // the WHOLE base blows up, every room
    const x = (cl.c + 0.5) * B, y = (cl.r + 0.5) * B, ang = Math.atan2(y - by, x - bx), sp = 250 + Math.random() * 300;
    S.parts.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 200, size: 14, color: cl.k === 'roof' ? '#a23b2c' : '#b98a4c',
      life: 1.4 + Math.random(), grav: 700, spin: (Math.random() - 0.5) * 12 });
  }
  b.gone = true; b.door = 'none'; b.furnish = false; b.back = 0; syncCells(b, true);
}

// ---------- update ----------
const camYFor = x => groundAt(x) - VH * 0.7; // keep the ground about two-thirds down the screen
function snapCam() { S.cam.x = clamp(hero.x - VW / 2, 0, WORLD - VW); S.cam.y = camYFor(hero.x); }
function update(dt) {
  S.time += dt;
  for (const t of tasks.slice()) if (t.fn(dt)) { tasks.splice(tasks.indexOf(t), 1); t.res(); }
  for (const a of [hero, baddie, ...G.friends, ...S.strangers]) {
    if (a.walking) a.walkT += dt;
    if (!a.free) { const gy = groundAt(a.x); a.y += (gy - a.y) * Math.min(1, dt * 14); }
    a.flash = Math.max(0, a.flash - dt);
  }
  for (const p of S.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.grav * dt; p.life -= dt; p.rot = (p.rot || 0) + p.spin * dt; }
  S.parts = S.parts.filter(p => p.life > 0);
  for (const b of S.bubbles) b.t -= dt;
  S.bubbles = S.bubbles.filter(b => b.t > 0);
  for (const t of S.trees) t.shake = Math.max(0, t.shake - dt);
  S.cam.shake = Math.max(0, S.cam.shake - dt * 30);
  S.flash = Math.max(0, S.flash - dt * 2);
  const fx = S.cam.focus ? S.cam.focus() : hero.x;
  const ty = S.cam.focusY ? S.cam.focusY() - VH * 0.55 : camYFor(fx);
  S.cam.x += (clamp(fx - VW / 2, 0, WORLD - VW) - S.cam.x) * Math.min(1, dt * 3);
  S.cam.y += (ty - S.cam.y) * Math.min(1, dt * 3);
}

// ---------- drawing ----------
const BLOCK = {
  grass: ['#8a5a33', '#6f4626'], dirt: ['#8a5a33', '#6f4626'], stone: ['#7d7d85', '#66666e'],
  plank: ['#b98a4c', '#946a33'], roof: ['#a23b2c', '#7d2a1f'], trunk: ['#6b4524', '#523419'],
  leaves: ['#3f9d3a', '#2f7d2c'], dug: ['#3a2414', '#2c1a0d'], back: ['#7a5530', '#664627'],
  cobble: ['#8e8e96', '#62626a'], deep: ['#2a2a30', '#1f1f24'],
};
const ORE_COL = { iron: ['#e0b089', '#c98a5a'], crystal: ['#6ff0f2', '#2ec4d0'] };
function drawBlock(x, y, k, c, r) {
  const [base, dark] = BLOCK[k];
  ctx.fillStyle = base; ctx.fillRect(x, y, B + 0.6, B + 0.6); // slight overlap hides seams when zoomed
  ctx.fillStyle = dark;
  if (k === 'plank' || k === 'back') { ctx.fillRect(x, y + 9, B, 2); ctx.fillRect(x, y + 19, B, 2); ctx.fillRect(x + ((r % 2) ? 8 : 20), y, 2, 9); ctx.fillRect(x + ((r % 2) ? 22 : 6), y + 21, 2, 9); }
  else if (k === 'roof') { ctx.fillRect(x, y + B - 4, B, 4); ctx.fillStyle = '#c4553f'; ctx.fillRect(x, y, B, 3); }
  else if (k === 'trunk') { ctx.fillRect(x + 6, y, 3, B); ctx.fillRect(x + 18, y + 4, 3, B - 8); }
  else if (k === 'cobble') { ctx.fillRect(x, y, B, 2); ctx.fillRect(x, y + 14, B, 2); ctx.fillRect(x + (r % 2 ? 10 : 20), y, 2, 14); ctx.fillRect(x + (r % 2 ? 22 : 6), y + 14, 2, 16); ctx.fillStyle = '#a8a8b0'; ctx.fillRect(x + 3, y + 4, 5, 4); }
  else for (let i = 0; i < 5; i++) {
    const hx = hsh(c * 7 + i, r * 13), hy = hsh(c * 3 + i * 5, r * 11 + 1);
    ctx.fillRect(x + ((hx * 6) | 0) * 5, y + ((hy * 6) | 0) * 5, 5, 5);
  }
  if (k === 'leaves') { ctx.fillStyle = '#58b84f'; ctx.fillRect(x + ((hsh(c, r) * 5) | 0) * 5, y + 5, 5, 5); }
  if (k === 'grass') { ctx.fillStyle = '#5cb848'; ctx.fillRect(x, y, B, 8); ctx.fillStyle = '#4a9a3a'; for (let i = 0; i < 6; i++) if (hsh(c, i) > 0.5) ctx.fillRect(x + i * 5, y + 8, 5, 4); }
  if (k === 'stone') { const ore = oreAt(c, r); if (ore) { const [o1, o2] = ORE_COL[ore]; for (let i = 0; i < 4; i++) { ctx.fillStyle = i % 2 ? o1 : o2; ctx.fillRect(x + 4 + ((hsh(c + i, r) * 4) | 0) * 5, y + 4 + ((hsh(c, r + i) * 4) | 0) * 5, 6, 6); } } }
}

function skyColors(t) {
  const day = ['#5fb8f5', '#bfe8ff'], dusk = ['#4a4f9a', '#ff9a6b'], night = ['#070b24', '#1d2552'];
  return t < 0.5 ? [mix(day[0], dusk[0], t * 2), mix(day[1], dusk[1], t * 2)] : [mix(dusk[0], night[0], t * 2 - 1), mix(dusk[1], night[1], t * 2 - 1)];
}

function drawSky() {
  const [top, bot] = skyColors(S.tod), g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top); g.addColorStop(1, bot); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (S.tod > 0.4) { // stars
    ctx.fillStyle = `rgba(255,255,255,${(S.tod - 0.4) / 0.6})`;
    for (let i = 0; i < 70; i++) { const x = hsh(i, 1) * W, y = hsh(i, 2) * 330; const s = hsh(i, 3) > 0.85 ? 3 : 2; if (Math.sin(S.time * 2 + i) > -0.8) ctx.fillRect(x, y, s, s); }
  }
  const sy = 70 + S.tod * 480, my = 560 - S.tod * 470;
  ctx.fillStyle = '#ffe35a'; ctx.fillRect(760, sy, 50, 50); ctx.fillStyle = '#fff3a0'; ctx.fillRect(770, sy + 10, 30, 30);
  ctx.fillStyle = '#e8ecf5'; ctx.fillRect(160, my, 44, 44); ctx.fillStyle = '#c3c9d8'; ctx.fillRect(170, my + 10, 10, 10); ctx.fillRect(186, my + 24, 8, 8);
  ctx.fillStyle = mix('#7fb5d6', '#151b3e', S.tod);
  const off = S.cam.x * 0.3, base = 420 - Math.max(0, S.cam.y - 120) * 0.5;
  for (let i = -1; i < W / 40 + 2; i++) {
    const n = Math.floor(off / 40) + i, hgt = 60 + hsh(n, 9) * 90 + Math.sin(n * 0.4) * 30;
    ctx.fillRect(i * 40 - (off % 40), base - hgt, 41, hgt + 400);
  }
  ctx.fillStyle = `rgba(255,255,255,${0.85 - S.tod * 0.6})`;
  for (let i = 0; i < 7; i++) {
    const span = W + 300, x = ((hsh(i, 5) * span - S.cam.x * 0.15 + S.time * 6) % span + span) % span - 200, y = 40 + hsh(i, 6) * 120;
    ctx.fillRect(x, y, 120, 24); ctx.fillRect(x + 24, y - 16, 64, 18);
  }
}

function drawTree(t) {
  if (t.gone) return;
  const g = gh(t.c);
  ctx.save();
  ctx.translate(t.c * B + B / 2 + (t.shake > 0 ? Math.sin(S.time * 60) * 3 : 0), g * B);
  ctx.rotate(t.angle);
  for (let i = 1; i <= t.h; i++) drawBlock(-B / 2, -i * B, 'trunk', t.c, i);
  for (let dx = -1; dx <= 1; dx++) for (let dy = 0; dy < 3; dy++) drawBlock(-B / 2 + dx * B, -(t.h + 2 - dy) * B, 'leaves', t.c + dx, dy);
  drawBlock(-B / 2, -(t.h + 3) * B, 'leaves', t.c, 9);
  ctx.restore();
}

function drawBase() {
  const b = S.base; if (!b) return;
  const s = b.s, g = b.g;
  if (b.gone) { // rubble
    const x0 = b.rubbleFrom ?? s - 1;
    ctx.fillStyle = '#2a2420'; ctx.fillRect(x0 * B, g * B - 4, (s + 6 - x0) * B, 6);
    for (let c = x0; c < s + 6; c++) if (hsh(c, 3) > 0.45) { ctx.fillStyle = hsh(c, 4) > 0.5 ? '#946a33' : '#7d2a1f'; ctx.fillRect(c * B + hsh(c, 5) * 14, g * B - 10, 12, 8); }
  }
  if (b.back > 0) {
    ctx.globalAlpha = b.back;
    const cols = [];
    cols.push(s + 1, s + 2, s + 3);
    for (let k = 1; k <= b.rooms; k++) cols.push(s - 4 * k + 1, s - 4 * k + 2, s - 4 * k + 3);
    for (const c of cols) for (let r = g - 4; r < g; r++) drawBlock(c * B, r * B, 'back', c, r);
    if (b.rooms) for (let r = g - 2; r < g; r++) drawBlock(s * B, r * B, 'back', s, r);
    ctx.globalAlpha = 1;
  }
  if (b.furnish) {
    const bedC = !G.mine ? s + 3 : b.rooms ? s - 2 : s + 1;
    {
      const bx = bedC * B, by = g * B;
      ctx.fillStyle = '#6b4524'; ctx.fillRect(bx - 4, by - 12, 32, 12);
      ctx.fillStyle = '#c93a3a'; ctx.fillRect(bx - 4, by - 18, 32, 8);
      ctx.fillStyle = '#eee'; ctx.fillRect(bx + 18, by - 22, 10, 6);
    }
    for (const tx of torchXs(b)) {
      const ty = (g - 3) * B;
      ctx.fillStyle = '#6b4524'; ctx.fillRect(tx - 2, ty, 4, 16);
      ctx.fillStyle = Math.sin(S.time * 18 + tx) > 0 ? '#ffd84a' : '#ff9a2a'; ctx.fillRect(tx - 4, ty - 7, 8, 8);
    }
  }
  for (const cl of b.cells) if (cl.vis) drawBlock(cl.c * B, cl.r * B, cl.k, cl.c, cl.r);
  if (b.door !== 'none' && !b.gone) {
    const dx = (s + 4) * B, dy = (g - 2) * B;
    ctx.fillStyle = '#6e4a22';
    if (b.door === 'closed') {
      ctx.fillRect(dx + 4, dy, B - 8, 2 * B);
      ctx.fillStyle = '#4e3216'; ctx.fillRect(dx + 7, dy + 6, B - 14, 18); ctx.fillRect(dx + 7, dy + 32, B - 14, 20);
      ctx.fillStyle = '#ffd84a'; ctx.fillRect(dx + 7, dy + 28, 4, 4);
    } else ctx.fillRect(dx + B - 6, dy, 6, 2 * B);
  }
}
function torchXs(b) {
  const xs = [];
  if (b.gone) return xs;
  xs.push((b.s + 1.5) * B);
  for (let k = 1; k <= b.rooms; k++) xs.push((b.s - 4 * k + 2.5) * B);
  return xs;
}
function drawLadder() {
  if (!G.mine || !S.base) return;
  const x = (S.base.s + 3) * B, g = S.base.g;
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(x + 4, g * B, 3, 6 * B); ctx.fillRect(x + B - 7, g * B, 3, 6 * B);
  for (let r = 0; r < 12; r++) ctx.fillRect(x + 4, g * B + 6 + r * 15, B - 8, 3);
}

function drawGround() {
  const c0 = Math.floor(S.cam.x / B) - 1, c1 = c0 + Math.ceil(VW / B) + 2, rEnd = (S.cam.y + VH) / B + 1;
  for (let c = c0; c <= c1; c++) {
    const r0 = gh(c);
    for (let r = r0; r < rEnd; r++) {
      const k = S.dug.has(c + ',' + r) ? (r >= r0 + 3 ? 'deep' : 'dug') : r === r0 ? 'grass' : r < r0 + 3 ? 'dirt' : 'stone';
      drawBlock(c * B, r * B, k, c, r);
    }
  }
}

function drawItem(item) {
  const tier = +item.slice(-1);
  if (item.startsWith('axe')) {
    ctx.fillStyle = '#7a4f24'; ctx.fillRect(-1.5, -6, 3, 28);
    ctx.fillStyle = ['#8a8a92', '#c4c9d0', '#2ec4d0'][tier]; ctx.fillRect(1.5, 12, 9, 11);
    ctx.fillStyle = ['#b4b4bc', '#f2f4f8', '#9ff8fa'][tier]; ctx.fillRect(8, 12, 3, 11);
  } else if (item.startsWith('sword')) {
    const [edge, mid] = [['#7a5530', '#c89b5c'], ['#4d4d55', '#a0a0a8'], ['#7d838c', '#e6e9ee'], ['#1f8f9c', '#7ff3f5']][tier];
    ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-1.5, -4, 3, 9);
    ctx.fillStyle = tier === 3 ? '#7a4dff' : '#6b4524'; ctx.fillRect(-6, 5, 12, 4);
    ctx.fillStyle = edge; ctx.fillRect(-3.5, 9, 7, 26);
    ctx.fillStyle = mid; ctx.fillRect(-2, 9, 4, 24); ctx.fillRect(-1, 33, 2, 4);
  } else if (item === 'knife') {
    ctx.fillStyle = '#222'; ctx.fillRect(-1.5, -3, 3, 8);
    ctx.fillStyle = '#c8ccd4'; ctx.fillRect(-2, 5, 4, 14); ctx.fillStyle = '#fff'; ctx.fillRect(-2, 5, 1, 13);
  }
}

const HERO_LOOK = { shirt: '#d6453d', shirtD: '#a83029', hair: '#6b3b1d', band: '#2e7dd7' };
function drawActor(a, glowOnly) {
  if (!a.visible) return;
  const bad = a.kind === 'baddie' && !a.look; // hooded baddie (a rejected survivor keeps their own look)
  const lh = bad ? 22 : 18, bh = bad ? 26 : 22, hd = bad ? 20 : 18, top = -(lh + bh + hd);
  ctx.save();
  ctx.translate(a.x, a.y + a.hopY); ctx.scale(a.dir, 1); ctx.rotate(a.angle);
  if (glowOnly) { // baddie's eyes glow in the dark, even when you can't see him
    ctx.shadowColor = '#ff2020'; ctx.shadowBlur = 12; ctx.fillStyle = '#ff4040';
    if (bad) { ctx.fillRect(2, top + 8, 3, 7); ctx.fillRect(7, top + 8, 3, 7); }
    else { ctx.fillRect(2, top + 9, 2, 6); ctx.fillRect(6, top + 9, 2, 6); }
    ctx.restore(); return;
  }
  ctx.globalAlpha = a.alpha;
  if (a.flash > 0 && 'filter' in ctx) ctx.filter = 'brightness(3)';
  const L = bad ? null : (a.look || HERO_LOOK);
  const ph = a.walking ? Math.sin(a.walkT * 12) : 0;
  const leg = bad ? '#22152f' : '#3a4f8f', legD = bad ? '#170d20' : '#2b3b6b';
  const shirt = bad ? '#3d2457' : L.shirt, shirtD = bad ? '#2a173d' : L.shirtD;
  const shoulderY = -(lh + bh) + 3;
  ctx.fillStyle = legD; ctx.fillRect(-7 + ph * 4, -lh, 7, lh);
  drawArm(-2, shoulderY, -ph * 0.6, shirtD, bad ? '#170d20' : '#d9a26e', null);
  ctx.fillStyle = leg; ctx.fillRect(-1 - ph * 4, -lh, 7, lh);
  ctx.fillStyle = shirt; ctx.fillRect(-9, -(lh + bh), 18, bh);
  if (!bad) { ctx.fillStyle = '#5a3a1a'; ctx.fillRect(-9, -lh - 5, 18, 4); }
  else { ctx.fillStyle = shirtD; ctx.fillRect(-9, -lh - 6, 18, 6); }
  const AC2 = a.armour ? ARMOUR_COL[a.armour] : null;
  if (AC2) { ctx.fillStyle = AC2[0]; ctx.fillRect(-10, -(lh + bh) + 2, 20, 14); ctx.fillStyle = AC2[1]; ctx.fillRect(-10, -(lh + bh) + 2, 20, 3); }
  if (!bad) {
    ctx.fillStyle = '#f2c08a'; ctx.fillRect(-hd / 2, top, hd, hd);
    ctx.fillStyle = L.hair; ctx.fillRect(-hd / 2, top, hd, 5); ctx.fillRect(-hd / 2, top, 5, 12);
    ctx.fillStyle = L.band; ctx.fillRect(-hd / 2, top + 5, hd, 3);
    ctx.fillStyle = '#1a1220';
    if (a.dead) { for (let i = 0; i < 5; i++) { ctx.fillRect(2 + i, top + 9 + i, 1.5, 1.5); ctx.fillRect(6 - i, top + 9 + i, 1.5, 1.5); } }
    else if (a.evil) { ctx.fillStyle = '#ff4040'; ctx.fillRect(2, top + 9, 2, 6); ctx.fillRect(6, top + 9, 2, 6); ctx.fillStyle = '#1a1220'; }
    else ctx.fillRect(4, top + 10, 3, 4);
    ctx.fillRect(3, top + 15, 5, 1.5);
    if (AC2) { ctx.fillStyle = AC2[0]; ctx.fillRect(-hd / 2 - 1, top - 3, hd + 2, 6); }
  } else {
    ctx.fillStyle = '#2a173d'; ctx.fillRect(-hd / 2 - 1, top - 3, hd + 2, hd + 4);
    if (AC2) { ctx.fillStyle = AC2[0]; ctx.fillRect(-hd / 2 - 2, top - 5, hd + 4, 7); }
    ctx.fillStyle = '#0b0610'; ctx.fillRect(-2, top + 4, hd / 2 + 2, hd - 6);
    ctx.fillStyle = '#ff4040'; ctx.fillRect(2, top + 8, 3, 7); ctx.fillRect(7, top + 8, 3, 7);
  }
  drawArm(1, shoulderY, a.arm + (a.walking ? ph * 0.5 : 0), shirt, bad ? '#22152f' : '#f2c08a', a.item);
  ctx.restore();
}
function drawArm(x, y, ang, sleeve, hand, item) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
  ctx.fillStyle = sleeve; ctx.fillRect(-3, -2, 6, 14);
  ctx.fillStyle = hand; ctx.fillRect(-3, 12, 6, 6);
  if (item) { ctx.translate(0, 15); drawItem(item); }
  ctx.restore();
}

function drawBombs() {
  for (const b of S.bombs) {
    const blink = b.fast ? Math.sin(S.time * 40) > 0 : Math.sin(S.time * 6) > 0.6;
    ctx.fillStyle = blink ? '#ff3030' : '#1a1a1a'; ctx.fillRect(b.x - 10, b.y - 20, 20, 20);
    ctx.fillStyle = '#444'; ctx.fillRect(b.x - 6, b.y - 17, 5, 5);
    ctx.fillStyle = '#c8b27a'; ctx.fillRect(b.x - 1, b.y - 28, 2, 8);
    ctx.fillStyle = Math.random() > 0.5 ? '#ffd84a' : '#fff'; ctx.fillRect(b.x - 3 + Math.random() * 3, b.y - 33, 4, 4);
  }
}
function drawChest() {
  const c = S.chest; if (!c) return;
  ctx.fillStyle = '#7a4f24'; ctx.fillRect(c.x - 14, c.y - 20, 28, 20);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(c.x - 14, c.y - (c.open ? 30 : 22), 28, 6);
  ctx.fillStyle = '#ffd84a'; ctx.fillRect(c.x - 3, c.y - 16, 6, 6);
}

function drawBubble(b) {
  const a = b.a; if (!a.visible) return;
  const x = (a.x - S.cam.x) * Z, y = (a.y + a.hopY - S.cam.y) * Z - 96;
  ctx.font = `bold 20px ${FONT}`;
  const w = ctx.measureText(b.text).width + 20;
  const bx = clamp(x - w / 2, 4, W - w - 4);
  ctx.fillStyle = '#1a1220'; ctx.fillRect(bx - 3, y - 31, w + 6, 38); ctx.fillRect(x - 6, y + 4, 12, 9);
  ctx.fillStyle = '#fff'; ctx.fillRect(bx, y - 28, w, 32); ctx.fillRect(x - 3, y + 4, 6, 5);
  ctx.fillStyle = '#1a1220'; ctx.textBaseline = 'middle'; ctx.fillText(b.text, bx + 10, y - 11);
}

function drawHUD() {
  if (!G.spot) return;
  const isNight = G.phase === 'night';
  const parts = [isNight ? `🌙 Night ${G.night}` : `☀️ Day ${G.day}`, `🪵 ${G.wood}`, `🪨 ${G.stone}`,
    `🪓 ${AXES[G.axe]}`, G.sword >= 0 ? `🗡️ ${SWORDS[G.sword]}` : '🗡️ no sword'];
  if (G.friends.length) parts.push(`👥 ${G.friends.map(f => f.name).join(', ')}`);
  ctx.font = `bold 17px ${FONT}`; ctx.textBaseline = 'middle';
  let x = 10;
  for (const p of parts) {
    const w = ctx.measureText(p).width + 16;
    ctx.fillStyle = 'rgba(20,14,30,.72)'; ctx.fillRect(x, 10, w, 28);
    ctx.fillStyle = '#fff6dc'; ctx.fillText(p, x + 8, 25);
    x += w + 6;
  }
  if (!isNight && G.left > 0) {
    const t = `${G.left} thing${G.left > 1 ? 's' : ''} left to do today`, w = ctx.measureText(t).width + 16;
    ctx.fillStyle = 'rgba(20,14,30,.72)'; ctx.fillRect(10, 44, w, 28); ctx.fillStyle = '#ffd84a'; ctx.fillText(t, 18, 59);
  }
}

function toWorld() { ctx.scale(Z, Z); ctx.translate(-Math.round(S.cam.x), -Math.round(S.cam.y)); }
function draw() {
  drawSky();
  ctx.save();
  ctx.translate((Math.random() - 0.5) * S.cam.shake, (Math.random() - 0.5) * S.cam.shake); toWorld();
  for (const t of S.trees) drawTree(t);
  drawGround();
  drawLadder();
  drawBase();
  drawBombs(); drawChest();
  drawActor(baddie);
  for (const f of [...G.friends, ...S.strangers]) drawActor(f);
  drawActor(hero);
  for (const p of S.parts) {
    ctx.globalAlpha = Math.min(1, p.life * 2); ctx.fillStyle = p.color;
    if (p.rot) { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size); ctx.restore(); }
    else ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (S.tod > 0) { // night darkness, then lights on top
    ctx.fillStyle = `rgba(8,10,40,${S.tod * 0.5})`; ctx.fillRect(0, 0, W, H);
    const b = S.base;
    if (b && b.furnish) for (const wx of torchXs(b)) {
      const tx = (wx - S.cam.x) * Z, ty = ((b.g - 3) * B - S.cam.y) * Z, R = 150, g = ctx.createRadialGradient(tx, ty, 5, tx, ty, R);
      g.addColorStop(0, `rgba(255,190,80,${0.45 * S.tod})`); g.addColorStop(1, 'rgba(255,190,80,0)');
      ctx.fillStyle = g; ctx.fillRect(tx - R, ty - R, 2 * R, 2 * R);
    }
    if (baddie.visible && !baddie.flash && S.tod > 0.5) { ctx.save(); toWorld(); drawActor(baddie, true); ctx.restore(); }
  }
  if (S.flash > 0) { ctx.fillStyle = `rgba(255,240,200,${S.flash})`; ctx.fillRect(0, 0, W, H); }
  for (const b of S.bubbles) drawBubble(b);
  drawHUD();
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); draw();
  requestAnimationFrame(loop);
}

// ---------- game over ----------
class GameOver { constructor(cause) { this.cause = cause; } }
function showGameOver(cause) {
  const e = DEATHS[cause], survived = G.night - 1;
  const best = Math.max(+(store('best') || 0), survived); store('best', best);
  document.getElementById('endEmoji').textContent = e.emoji;
  document.getElementById('endTitle').textContent = 'THE END: ' + e.title;
  document.getElementById('endText').textContent = e.text;
  const alive = G.friends.filter(f => !f.dead).map(f => f.name);
  document.getElementById('endStats').innerHTML =
    `<span class="big-stat">You survived ${survived} night${survived === 1 ? '' : 's'}</span>` +
    `<span>Best: ${best} night${best === 1 ? '' : 's'}</span>` +
    (alive.length ? `<span>${alive.join(' and ')} will have to survive without you!</span>` : '');
  document.getElementById('ending').hidden = false;
  caption('');
  document.getElementById('againBtn').focus({ preventScroll: true });
}
async function heroDies(cause, text) {
  await death(hero);
  await narrate(text);
  throw new GameOver(cause);
}

// ================= THE STORY =================
async function play() {
  document.getElementById('title').hidden = true;
  document.getElementById('ending').hidden = true;
  resetWorld(); snapCam();
  try {
    await chooseSpot();
    while (true) {
      await night();
      await morning();
      await day();
    }
  } catch (e) {
    if (!(e instanceof GameOver)) throw e;
    showGameOver(e.cause);
  }
}

async function chooseSpot() {
  await narrate("You wake up in a brand-new world. All you've got is your trusty axe. Find a place to build your base before night comes!");
  for (let i = 0; i < SPOTS.length; i++) {
    const sp = SPOTS[i];
    caption('You walk along...');
    await walkTo(hero, (sp.c + 2.5) * B, 170);
    const lastSpot = i === SPOTS.length - 1;
    if (lastSpot) await narrate(sp.text + ' The sun is starting to set, so there is no time to look any further. You build your base here!');
    if (lastSpot || await ask(sp.text + ' Build your base here?', YN) === 'y') { G.spot = sp; break; }
  }
  S.base = makeBase(G.spot.c); syncCells(S.base);
  caption('Building your base...');
  await buildCells(S.base);
  await tween(S.base, 'back', 1, 0.4);
  S.base.door = 'closed'; SFX.door(); await wait(0.2);
  S.base.furnish = true; SFX.ding();
  await say(hero, 'Done!', 1);
  await narrate("Your base is finished! It has walls, a roof, a bed and a torch. And a front door... but no back door.");
}

// ---------- NIGHT ----------
async function night() {
  G.night++; G.phase = 'night';
  hero.item = 'axe' + G.axe;
  caption('The sun goes down...');
  if (S.tod < 1) await tween(S, 'tod', 1, 3);
  S.cam.focus = () => frontX() + B;
  // the baddie is out there in the dark (you can only see his eyes)
  baddie.visible = true; baddie.alpha = 0; baddie.dead = false; baddie.angle = 0; baddie.arm = 0; baddie.dir = -1;
  baddie.armour = armourFor(G.night);
  baddie.evil = false; baddie.look = null; baddie.name = null;
  if (G.rejected.length && Math.random() < 0.6) { // someone you wouldn't let join comes back for revenge
    const p = G.rejected.shift(); baddie.evil = true; baddie.look = p.look; baddie.name = p.name;
  }
  baddie.x = frontX() + 9 * B; baddie.y = groundAt(baddie.x);
  if (S.base.gone) return noBaseNight();
  await narrate(`Night ${G.night}. It's dark and quiet...`);
  caption('...');
  await Promise.all([footsteps(5), walkTo(baddie, frontX() + 6 * B, 50)]);
  const c = await menu('You hear footsteps outside... What do you do?', [
    ['look', '🔦 Go out and look'],
    ['stay', '🏠 Stay inside'],
  ]);
  if (c === 'look') return goOutAndLook();
  return bombs();
}

async function goOutAndLook() {
  caption('You open the door and creep outside...');
  await goOut();
  S.cam.focus = () => (hero.x + baddie.x) / 2;
  await walkTo(hero, outsideX() + B, 80);
  await wait(0.4);
  await reveal();
  if (G.sword >= 0) hero.item = 'sword' + G.sword;
  const tree = S.trees.find(t => t.c === G.spot.tree);
  const opts = [];
  if (G.sword >= 0) opts.push(['attack', `⚔️ Attack with your ${SWORDS[G.sword]}`]);
  else {
    if (!tree.gone) opts.push(['chop', '🌲 Chop down the tree to make a sword']);
    opts.push(['axe', '🪓 Hit him with your axe']);
  }
  opts.push(['run', '🏃 Run back inside']);
  const c = await menu('What do you do?', opts);
  if (c === 'attack') return fight();
  if (c === 'axe') return axeAttack();
  if (c === 'chop') {
    await chopTree(tree, true);
    hero.item = 'sword' + G.sword;
    await walkTo(baddie, hero.x + 4 * B, 110);
    if (await ask('The baddie is right there! Attack the baddie?', YN) === 'y') return fight();
  }
  caption('You run back inside!');
  await goIn();
  await tween(baddie, 'alpha', 0, 0.6);
  return bombs();
}

async function reveal() {
  await tween(baddie, 'alpha', 1, 0.8);
  if (baddie.evil) {
    await say(baddie, `Remember me? It's ${baddie.name}!`, 1.6);
    await say(baddie, "You wouldn't let me join your team!", 1.8);
  } else await say(baddie, 'Hehehe...', 1.2);
  const who = baddie.evil ? `It's ${baddie.name}, the survivor you wouldn't let join, and they've got a knife!` : "It's a BADDIE with a knife!";
  const arm = baddie.armour ? ` ${baddie.evil ? 'They are' : 'He is'} wearing ${ARMOURS[baddie.armour].toUpperCase()}. You need a ${SWORDS[baddie.armour]} or better!` : '';
  await narrate(who + arm);
}

// Your base got blown up and you haven't rebuilt it: you're out in the open.
async function noBaseNight() {
  S.cam.focus = () => (hero.x + baddie.x) / 2;
  await narrate(`Night ${G.night}. You have no base to hide in...`);
  caption('...');
  await Promise.all([footsteps(5), walkTo(baddie, hero.x + 7 * B, 50)]);
  await reveal();
  if (G.sword >= 0) hero.item = 'sword' + G.sword;
  const tree = S.trees.find(t => t.c === G.spot.tree);
  const opts = [];
  if (G.sword >= 0) opts.push(['attack', `⚔️ Attack with your ${SWORDS[G.sword]}`]);
  else {
    if (!tree.gone) opts.push(['chop', '🌲 Chop down the tree to make a sword']);
    opts.push(['axe', '🪓 Hit him with your axe']);
  }
  if (G.mine) opts.push(['mine', '🪜 Hide down in your mine']);
  let c = await menu('What do you do?', opts);
  if (c === 'attack') return fight();
  if (c === 'axe') return axeAttack();
  if (c === 'chop') {
    await chopTree(tree, true);
    hero.item = 'sword' + G.sword;
    await walkTo(baddie, hero.x + 4 * B, 110);
    if (await ask('The baddie is right there! Attack?', YN) === 'y') return fight();
    if (!G.mine) {
      await say(hero, 'Nowhere to hide!', 1.2);
      await walkTo(baddie, hero.x + 36, 120);
      await stab(baddie, hero);
      return heroDies('nobase', 'There was nowhere to hide!');
    }
  }
  caption('Everyone climbs down into the mine!');
  await Promise.all(people().map(a => climbDown(a)));
  await walkTo(baddie, shaftX() + 2 * B, 80);
  await say(baddie, 'Where did they go?!', 1.6);
  walkTo(baddie, baddie.x + 14 * B, 90).then(() => { baddie.visible = false; });
  await wait(1.5);
}

async function fight() {
  caption('CHARGE!');
  await walkTo(hero, baddie.x - 36, 220);
  if (G.sword < baddie.armour) {
    await swing(hero); SFX.clink(); shake(4);
    burst(baddie.x - 12, baddie.y - 40, 14, ['#c89b5c', '#7a5530', '#fff'], { speed: 200, life: 0.5, size: 5 });
    hero.item = null; restArm(hero);
    await say(hero, 'SNAP!', 0.9);
    await say(baddie, 'Hehe. Nice try.', 1.2);
    await stab(baddie, hero);
    return heroDies('snap', `Your ${SWORDS[G.sword]} snapped on the ${ARMOURS[baddie.armour]}!`);
  }
  const hits = G.sword > baddie.armour ? 2 : 3; // a stronger sword than their armour wins faster
  for (let i = 0; i < hits; i++) {
    await swing(hero); SFX.hit();
    baddie.flash = 0.15; baddie.x += 14; shake(5);
    burst(baddie.x - 10, baddie.y - 40, 8, ['#fff', '#ffd84a'], { speed: 140, grav: 0, life: 0.3, size: 4 });
    if (i === hits - 2) await say(baddie, 'OW!', 0.6); else await wait(0.25);
  }
  restArm(hero);
  burst(baddie.x, baddie.y - 35, 40, baddie.look ? [baddie.look.shirt, baddie.look.hair, '#aaa'] : ['#3d2457', '#6b3fa0', '#2a173d', '#aaa'], { speed: 200, grav: 0, life: 0.9, size: 10 });
  SFX.boom(); baddie.visible = false;
  await wait(0.5);
  hop(hero); await say(hero, 'YEAH!', 1);
  await narrate(baddie.evil ? `You beat ${baddie.name}!` : 'You beat the baddie!');
  caption('You head back inside.');
  await goIn();
}

async function axeAttack() {
  caption('You run at the baddie with your axe!');
  await walkTo(hero, baddie.x - 36, 200);
  await swing(hero); SFX.clink();
  burst(baddie.x - 12, baddie.y - 40, 12, ['#fff', '#ffe066'], { speed: 220, grav: 0, life: 0.25, size: 3 });
  restArm(hero);
  await say(hero, 'CLINK?!', 1);
  await say(baddie, 'Hehe. That tickles.', 1.4);
  await say(hero, 'Uh oh...', 0.9);
  await stab(baddie, hero);
  return heroDies('clink', "Your axe just bounced off! Axes can't hurt baddies.");
}

// The baddie lays two bombs. Everyone picks what to do, and your friends never pick the same as you.
async function bombs() {
  const b = S.base, front = frontX();
  S.cam.focus = () => (S.base.s + 4) * B;
  caption('Footsteps outside...');
  await Promise.all([footsteps(4), walkTo(baddie, front + 40, 80)]); baddie.dir = -1;
  await tween(baddie, 'arm', -0.6, 0.2); S.bombs.push({ x: front + 12, y: b.g * B }); SFX.pop(); SFX.hiss(); await restArm(baddie);
  await walkTo(baddie, front + 66, 60); baddie.dir = -1;
  await tween(baddie, 'arm', -0.6, 0.2); S.bombs.push({ x: front + 40, y: b.g * B }); SFX.pop(); SFX.hiss(); await restArm(baddie);
  await walkTo(baddie, front + 4 * B, 80); baddie.dir = -1;
  await say(baddie, 'Hehehe...', 1.2);

  const opts = [['middle', '🧍 Stay in the middle of the room'], ['dig', '⛏️ Dig a hole out the back']];
  if (G.mine) opts.push(['mine', '🪜 Climb down into the mine']);
  opts.push(['front', '🏃 Run out the front door']);
  const mine = await menu("You can't see him, but you hear him put something down by the door... TWO BOMBS! What do you do?", opts);

  // friends pick something different from you (and from each other, if they can)
  const taken = new Set([mine]), plan = [[hero, mine]];
  for (const f of G.friends) {
    let left = opts.map(o => o[0]).filter(k => !taken.has(k));
    if (!left.length) left = opts.map(o => o[0]).filter(k => k !== mine);
    const k = pick(left); taken.add(k); plan.push([f, k]);
  }
  if (G.friends.length) {
    for (const [f, k] of plan.slice(1)) await say(f, { middle: "I'm staying put!", dig: "I'll dig!", mine: 'Down the mine!', front: 'RUN!' }[k], 1.1);
  }
  await resolveBombs(plan);
}

async function resolveBombs(plan) {
  const b = S.base, front = frontX();
  const who = k => plan.filter(p => p[1] === k).map(p => p[0]);
  caption('Quick!');
  // move everyone to where they chose
  const moves = [];
  for (const a of who('middle')) moves.push(walkTo(a, insideX() + (a === hero ? 0 : 12), 120));
  for (const a of who('mine')) moves.push(climbDown(a));
  for (const a of who('dig')) moves.push(digOut(a));
  await Promise.all(moves);
  // runners go out the front door
  for (const a of who('front')) {
    S.base.door = 'open'; SFX.door();
    await walkTo(a, front + 70, 200);
    await tween(baddie, 'alpha', 1, 0.3);
    await stab(baddie, a);
    await death(a);
  }
  await explode(b);
  for (const a of who('middle')) { a.dead = true; a.angle = -Math.PI / 2; }
  if (hero.dead) {
    const cause = who('front').includes(hero) ? 'frontdoor' : 'kaboom';
    await narrate(cause === 'frontdoor' ? 'The baddie was waiting right outside the door.' : 'KABOOM! The bombs blew up the base with you inside.');
    throw new GameOver(cause);
  }
  await say(hero, 'Phew!', 0.8);
  await tween(baddie, 'alpha', 1, 0.4);
  baddie.dir = 1; await say(baddie, baddie.evil ? "That's for not letting me join!" : 'Hahaha!', 1.4);
  walkTo(baddie, baddie.x + 14 * B, 90).then(() => { baddie.visible = false; });
  await wait(1.5);
}

async function climbDown(a) {
  await walkTo(a, shaftX(), 170);
  a.free = true;
  await tween(a, 'y', (S.base.g + 6) * B, 0.6);
  await walkTo(a, shaftX() + (a === hero ? 1.2 : 2) * B, 100);
}
async function climbUp(a) {
  await walkTo(a, shaftX(), 120);
  await tween(a, 'y', S.base.g * B, 0.6);
  a.free = false;
}

async function digOut(a) {
  const s = leftWall(), g = S.base.g; // dig under the back (left) wall of the leftmost room
  S.base.rubbleFrom = s - 1;
  await walkTo(a, (s + 1.5) * B, 160); a.dir = -1;
  const item = a.item; a.item = 'axe' + (a === hero ? G.axe : 0);
  const digCell = async (c, r) => {
    await swing(a); SFX.dig(); S.dug.add(c + ',' + r); S.escape.push(c + ',' + r);
    burst((c + 0.5) * B, (r + 0.5) * B, 8, ['#8a5a33', '#6f4626', '#5cb848'], { up: true, speed: 140 });
  };
  await digCell(s + 1, g); await digCell(s + 1, g + 1); await digCell(s + 1, g + 2);
  a.free = true; await tween(a, 'y', (g + 3) * B, 0.4, easeIn);
  await digCell(s, g + 1); await digCell(s, g + 2); await walkTo(a, (s + 0.5) * B, 120);
  await digCell(s - 1, g + 1); await digCell(s - 1, g + 2); await walkTo(a, (s - 0.5) * B, 120);
  await digCell(s - 1, g);
  restArm(a); a.item = item;
  await tween(a, 'y', g * B, 0.35, easeOut);
  a.free = false;
  await walkTo(a, (s - 6) * B, 200); a.dir = 1;
}

// ---------- MORNING ----------
async function morning() {
  S.bombs = []; S.cam.focus = null;
  caption('The sun comes up...');
  await tween(S, 'tod', 0, 2.5);
  G.phase = 'day'; G.day = G.night;
  const lost = G.friends.filter(f => f.dead);
  if (lost.length) {
    await narrate(`${lost.map(f => f.name).join(' and ')} didn't make it through the night. 😢`);
    for (const f of lost) await tween(f, 'alpha', 0, 0.6);
    G.friends = G.friends.filter(f => !f.dead);
  }
  await narrate(`You survived night ${G.night}!${G.friends.length ? ` (and so did ${G.friends.map(f => f.name).join(' and ')})` : ''}`);
  if (S.base.gone) await narrate(`Your base got blown up! To rebuild it you need ${REBUILD_WOOD} wood and ${REBUILD_STONE} stone. Until then you'll be out in the open at night...`);
  // come out of hiding
  const back = [];
  for (const a of people()) if (a.free) back.push(climbUp(a));
  await Promise.all(back);
  await Promise.all([goIn(hero), ...G.friends.map((f, i) => walkTo(f, friendHomeX(i), 150))]);
  placeEveryoneInside();
  for (const t of S.trees) { t.gone = false; t.angle = 0; }
}

// ---------- DAY ----------
async function day() {
  G.left = ACTIONS_PER_DAY;
  hero.item = 'axe' + G.axe;
  const next = armourFor(G.night + 1);
  if (next > armourFor(G.night)) {
    await narrate(`You find big footprints outside... The baddies are getting tougher! From tonight they wear ${ARMOURS[next].toUpperCase()}.` +
      (G.sword < next ? ` You'll need a ${SWORDS[next]} or better to beat them.` : ` Good thing you have a ${SWORDS[G.sword]}!`));
  }
  while (G.left > 0) {
    const c = await menu(`Day ${G.day}. What do you want to do?`, [
      ['chop', '🌲 Chop trees'],
      S.base.gone ? ['build', `🔨 Rebuild your base (${REBUILD_WOOD} wood, ${REBUILD_STONE} stone)`] : ['build', '🔨 Build your base bigger'],
      ['mine', G.mine ? '⛏️ Go mining' : '⛏️ Dig a mine'],
      ['explore', '🧭 Explore'],
    ]);
    let used = true;
    if (c === 'chop') await dayChop();
    else if (c === 'build') used = await dayBuild();
    else if (c === 'mine') await dayMine();
    else await dayExplore();
    if (used) G.left--;
    placeEveryoneInside();
  }
  await narrate('The sun is going down. Time to get inside!');
}

async function chopTree(tree, atNight) {
  caption('You run out to the tree...');
  if (!atNight) await goOut();
  hero.item = 'axe' + G.axe;
  await walkTo(hero, tree.c * B - 14, 190); hero.dir = 1;
  if (atNight) walkTo(baddie, tree.c * B + 7 * B, 30); // he creeps closer while you chop
  for (let i = 0; i < 4 - G.axe; i++) {
    await swing(hero); SFX.chop(); tree.shake = 0.2;
    burst(tree.c * B + 6, groundAt(tree.c * B) - 40, 6, ['#6b4524', '#b98a4c', '#d9b27a'], { up: true, speed: 140 });
  }
  restArm(hero);
  caption('TIMBER!');
  await tween(tree, 'angle', Math.PI / 2, 0.8, easeIn);
  SFX.thud(); shake(8);
  const tx = (tree.c + 3) * B, ty = groundAt(tree.c * B);
  burst(tx, ty - 20, 20, ['#3f9d3a', '#2f7d2c', '#58b84f'], { up: true, speed: 200 });
  burst(tx - 40, ty - 10, 10, ['#6b4524', '#523419'], { up: true, speed: 160 });
  tree.gone = true;
  const got = 2 + G.axe;
  if (G.sword < 0) {
    caption('Crafting...');
    hero.item = null;
    for (let i = 0; i < 5; i++) { burst(hero.x, hero.y - 30, 6, ['#ffd84a', '#fff', '#c89b5c'], { speed: 90, grav: 0, life: 0.4, size: 4 }); beep(400 + i * 120, 0.06); await wait(0.15); }
    G.sword = 0; hero.item = 'sword0'; SFX.ding(); hop(hero);
    await tween(hero, 'arm', -2.6, 0.2, easeOut);
    await say(hero, 'A sword!', 1.2);
    restArm(hero);
    G.wood += got - 1;
    await narrate(`TIMBER! You turned the wood into a WOODEN SWORD!${got > 1 ? ` (+${got - 1} wood left over)` : ''}`);
  } else {
    G.wood += got;
    await narrate(`TIMBER! +${got} wood.${G.axe ? ` Your ${AXES[G.axe]} chops fast!` : ''}`);
  }
}

async function dayChop() {
  // chop a tree further away, so the one by your base is still there at night
  const trees = S.trees.filter(t => !t.gone && t.c > S.base.s + 4).sort((a, b) => a.c - b.c);
  const tree = trees.find(t => t.c !== G.spot.tree) || trees[0];
  await chopTree(tree, false);
  hero.item = 'axe' + G.axe;
  await goIn();
}

async function rebuild() {
  const b = S.base;
  if (G.wood < REBUILD_WOOD || G.stone < REBUILD_STONE) {
    const need = [];
    if (G.wood < REBUILD_WOOD) need.push(`${REBUILD_WOOD - G.wood} more wood (chop trees)`);
    if (G.stone < REBUILD_STONE) need.push(`${REBUILD_STONE - G.stone} more stone (go mining)`);
    await narrate(`You need to do more work first! You still need ${need.join(' and ')}.`);
    return false;
  }
  G.wood -= REBUILD_WOOD; G.stone -= REBUILD_STONE;
  caption('Rebuilding your base...');
  for (const k of S.escape) S.dug.delete(k); S.escape = [];
  await walkTo(hero, insideX(), 160);
  b.gone = false; b.rooms = 0; b.rubbleFrom = null; syncCells(b);
  await buildCells(b);
  await tween(b, 'back', 1, 0.3);
  b.door = 'closed'; b.furnish = true; SFX.door(); SFX.ding();
  await say(hero, 'Home again!', 1);
  await narrate('Your base is back!');
  return true;
}

async function dayBuild() {
  const b = S.base;
  if (b.gone) return rebuild();
  if (b.rooms >= MAX_ROOMS) { await narrate("Your base is as big as it can get!"); return false; }
  const c = await menu(`What do you want to build? You have ${G.wood} wood.`, [['room', `🧱 Add a room (${ROOM_COST} wood)`], ['cancel', '↩️ Never mind']]);
  if (c === 'cancel') return false;
  {
    if (G.wood < ROOM_COST) { await narrate(`You need ${ROOM_COST} wood to add a room. Go chop some trees!`); return false; }
    G.wood -= ROOM_COST; b.rooms++;
    caption('Building a new room...');
    syncCells(b);
    await walkTo(hero, (b.s - 4 * b.rooms + 2.5) * B, 160);
    await buildCells(b);
    SFX.ding(); await say(hero, 'More room!', 1);
    await narrate(b.rooms === 1 ? 'You built a new room! More space for you and your team.' : 'Another room! Your base is getting BIG.');
  }
  await walkTo(hero, insideX(), 160);
  return true;
}

async function dayMine() {
  const b = S.base, s = b.s, g = b.g;
  S.cam.focusY = () => hero.y - 40;
  if (!G.mine) {
    caption('You dig a mine shaft and build a ladder...');
    await walkTo(hero, shaftX() - 6, 150); hero.dir = 1;
    for (let r = g; r <= g + 5; r++) {
      await swing(hero); SFX.dig(); S.dug.add((s + 3) + ',' + r);
      burst((s + 3.5) * B, (r + 0.5) * B, 6, r < g + 3 ? ['#8a5a33', '#6f4626'] : ['#7d7d85', '#66666e'], { up: true, speed: 120 });
      if (r > g) { hero.free = true; hero.x = shaftX(); await tween(hero, 'y', (r + 1) * B, 0.15); }
    }
    G.mine = 1;
  } else { caption('You climb down into your mine...'); await climbDown(hero); G.mine++; }
  hero.free = true; hero.y = (g + 6) * B;
  // tunnel forward, collecting whatever is in the way
  const found = { stone: 0, iron: 0, crystal: 0 };
  const start = s + 4 + G.mineLen;
  await walkTo(hero, (start - 0.4) * B, 120); hero.dir = 1;
  const n = G.mine === 1 ? 3 : 4;
  for (let c = start; c < start + n; c++) {
    for (const r of [g + 4, g + 5]) {
      await swing(hero); SFX.dig(); S.dug.add(c + ',' + r);
      const ore = oreAt(c, r);
      burst((c + 0.5) * B, (r + 0.5) * B, 8, ore ? ORE_COL[ore] : ['#7d7d85', '#66666e'], { up: true, speed: 130 });
      if (ore) { found[ore]++; SFX.gem(); } else if (r >= gh(c) + 3) found.stone++;
    }
    await walkTo(hero, (c + 0.6) * B, 120);
  }
  G.mineLen += n;
  if (G.mine >= 2 && G.axe === 0 && !found.iron && !found.crystal) found.iron = 1; // don't make anyone wait forever for iron
  restArm(hero);
  G.stone += found.stone;
  const bits = [`+${found.stone} stone`];
  if (found.iron) bits.push(`${found.iron} IRON`);
  if (found.crystal) bits.push(`${found.crystal} CRYSTAL`);
  await narrate(`Mining done! ${bits.join(', ')}.`);
  const axeTier = found.crystal ? 2 : found.iron ? 1 : 0, swordTier = found.crystal ? 3 : found.iron ? 2 : 1;
  if (axeTier > G.axe || swordTier > G.sword) {
    hero.item = null;
    for (let i = 0; i < 5; i++) { burst(hero.x, hero.y - 30, 6, swordTier === 3 ? ['#6ff0f2', '#fff', '#7a4dff'] : swordTier === 2 ? ['#e0b089', '#fff'] : ['#a0a0a8', '#fff'], { speed: 90, grav: 0, life: 0.4, size: 4 }); beep(500 + i * 120, 0.06); await wait(0.15); }
    const made = [];
    if (axeTier > G.axe) { G.axe = axeTier; made.push(AXES[axeTier].toUpperCase()); }
    if (swordTier > G.sword) { G.sword = swordTier; made.push(SWORDS[swordTier].toUpperCase()); }
    hero.item = 'sword' + G.sword; SFX.ding();
    await tween(hero, 'arm', -2.6, 0.2, easeOut); await say(hero, 'Shiny!', 1); restArm(hero);
    await narrate(`You made a ${made.join(' and a ')}!` + ['', ' It can beat baddies in stone armour.', ' Iron chops trees faster and beats iron armour.', ' Crystal is the best there is!'][swordTier]);
    hero.item = 'axe' + G.axe;
  }
  caption('You climb back up...');
  await climbUp(hero);
  S.cam.focusY = null;
}

async function dayExplore() {
  caption('You head off to explore...');
  await goOut();
  S.cam.focus = null;
  const far = Math.min((S.base.s + 16) * B, WORLD - 6 * B);
  await walkTo(hero, far, 170);
  const roll = Math.random();
  const meet = G.friends.length < 3 && (G.met === 0 ? roll < 0.8 : roll < 0.5);
  if (meet) {
    const used = new Set([...G.friends, ...G.rejected].map(f => f.name));
    const name = pick(FRIEND_NAMES.filter(n => !used.has(n)));
    const look = FRIEND_LOOKS[G.met % FRIEND_LOOKS.length];
    const f = mkActor('friend', far + 9 * B, look); f.name = name; f.dir = -1; f.item = 'axe0';
    S.strangers.push(f); G.met++; // only joins G.friends if you say yes
    await walkTo(f, far + 2 * B, 120);
    await say(f, 'Oh! Hi!', 1);
    await say(f, `I'm ${name}. I'm trying to survive too.`, 2);
    if (await ask(`You meet ${name}, another survivor! Ask ${name} to join your team?`, YN) === 'y') {
      await say(f, "Yes! Let's go!", 1.2);
      await narrate(`${name} joined your team! But be careful: ${name} will never make the same choice as you.`);
      caption('You walk home together...');
      S.strangers = S.strangers.filter(x => x !== f); G.friends.push(f);
      const idx = G.friends.length - 1;
      await Promise.all([goIn(), walkTo(f, friendHomeX(idx), 160)]);
      return;
    }
    G.rejected.push({ name, look });
    await say(f, "Fine. You'll be sorry...", 1.6);
    walkTo(f, far + 14 * B, 120).then(() => { S.strangers = S.strangers.filter(x => x !== f); });
    caption('You head home...');
  } else {
    S.chest = { x: far + 2 * B, y: groundAt(far + 2 * B), open: false };
    await walkTo(hero, far + 1.2 * B, 120);
    await wait(0.3); S.chest.open = true; SFX.gem();
    const loot = pick([{ wood: 3 }, { wood: 2, stone: 2 }, { stone: 4 }, { wood: 4 }]);
    G.wood += loot.wood || 0; G.stone += loot.stone || 0;
    burst(S.chest.x, S.chest.y - 24, 14, ['#ffd84a', '#fff'], { up: true, speed: 160 });
    await narrate(`You found a treasure chest! ${Object.entries(loot).map(([k, v]) => `+${v} ${k}`).join(', ')}.`);
    S.chest = null;
    caption('You head home...');
  }
  await goIn();
}

// ---------- start ----------
// Debug: ?auto=y,stay,... plays itself, answering each question in turn with the given key
// (y/n, or 1/2/3 for menus); Next is clicked automatically. For testing with headless screenshots.
const AUTO = new URLSearchParams(location.search).get('auto')?.split(',') || null;
resetWorld(); snapCam();
if (AUTO) { muted = true; setInterval(() => { update(1 / 60); draw(); }, 16); play(); }
else requestAnimationFrame(loop);
document.getElementById('playBtn').onclick = () => { ac(); play(); };
document.getElementById('againBtn').onclick = () => play();
document.getElementById('mute').onclick = e => { muted = !muted; e.currentTarget.textContent = muted ? '🔇' : '🔊'; };
