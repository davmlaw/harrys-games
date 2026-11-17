'use strict';
// Times Table Soccer — 6-a-side soccer seen from above. You are ONE player (goalie, defence, midfield or striker).
// Whenever you bump into the other team (tackle, dribble), shoot, or have to save, time goes slow and a times table pops up.
// Everything is drawn procedurally; sound is Web Audio.

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');
const W = 960, H = 540, DPR = Math.min(2, window.devicePixelRatio || 1);
cv.width = W * DPR; cv.height = H * DPR;
// old phones and tablets don't know roundRect: teach them (without this the game froze at kick off)
if (!ctx.roundRect) Object.getPrototypeOf(ctx).roundRect = function (x, y, w, h, r) {
  r = Math.min(+r || 0, w / 2, h / 2);
  this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
};
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto');
const AUTO_RIGHT = Q.has('right') ? +Q.get('right') / 100 : .8;
const TOUCH = Q.has('mobile') || (!Q.has('desktop') && (
  matchMedia('(pointer: coarse)').matches ||
  (matchMedia('(any-pointer: coarse)').matches && matchMedia('(hover: none)').matches) ||
  /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))));
if (TOUCH) document.body.classList.add('touch');

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---------- things to tune ----------
const CFG = {
  PR: 12,            // player size (radius)
  BR: 6,             // ball size (radius)
  SPEED: 150,        // running speed
  MATCH: 180,        // seconds in a match
  QTIME: 5,          // seconds to answer a question
  SLOW: .08,         // how slow time goes during a question (1 = normal)
  SHOT: 600,         // your shot speed after a right answer
  SUPER: 780,        // ...after a really quick right answer
  WEAK: 300,         // ...after a wrong answer
  AISHOT: 490,       // computer players' shot speed
  DRAG: .7,          // how quickly the ball slows down on the grass
  GOALW: 62,         // half the width of the goal
  PRESS: 3,          // how many of the other team chase YOU when you have the ball
};
const P = { x0: 56, y0: 60, x1: W - 56, y1: H - 22 };   // the white lines
const PW = P.x1 - P.x0, PH = P.y1 - P.y0, CX = W / 2, CY = (P.y0 + P.y1) / 2;
// formation for the team shooting right: role, how far up the pitch (0-1), how far down (0-1)
const FORM = [['gk', .03, .5], ['def', .2, .28], ['def', .2, .72], ['mid', .44, .3], ['mid', .44, .7], ['str', .68, .5]];
const DIFF = {   // the other team
  easy:   { spd: .76, shootR: 150, err: 46, kspd: .85, tk: .3 },
  medium: { spd: .86, shootR: 165, err: 30, kspd: 1, tk: .4 },
  hard:   { spd: .95, shootR: 180, err: 18, kspd: 1.15, tk: .5 },
};
const MATES = { spd: .9, shootR: 150, err: 34, kspd: 1.05, tk: .45 };   // your own team's computer players
const TEAMS = [
  { name: 'BLUES', shirt: '#2f7bff', gk: '#ffd43b' },
  { name: 'REDS', shirt: '#ff5a36', gk: '#c084fc' },
];
const SKINS = ['#ffd9b3', '#f1c27d', '#c68642', '#8d5524', '#ffe0bd'];
const HAIRS = ['#5a3a1e', '#2b2b2b', '#d9a441', '#8a4b2a', '#c0392b'];
const POS = [['gk', '🧤 Goalie'], ['def', '🛡️ Defence'], ['mid', '🏃 Midfield'], ['str', '⚽ Striker']];

// ---------- saved stuff: settings and the maths brain ----------
const ORDER = [2, 10, 5, 3, 4, 11, 9, 6, 8, 12, 7];   // the order the times tables unlock in
const IV = [1, 2, 4, 7, 12, 20];                      // questions until a fact comes back, by box (spaced repetition)
const SAVE_KEY = 'timesTableSoccer1';
const M = (() => {
  let m = null;
  try { m = JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { }
  if (!m) {
    m = { facts: {}, qn: 0, tables: 1, last: '', pos: 'str', diff: 'medium', muted: false, games: 0, wins: 0 };
    // first time here? Start from the tables you already learned in Brick Racers
    try { const br = JSON.parse(localStorage.getItem('brickRacers1')); if (br && br.facts && br.tables) { m.facts = br.facts; m.qn = br.qn || 0; m.tables = br.tables; } } catch (e) { }
  }
  return m;
})();
const save = () => { if (AUTO) return; try { localStorage.setItem(SAVE_KEY, JSON.stringify(M)); } catch (e) { } };
if (POS.some(p => p[0] === Q.get('pos'))) M.pos = Q.get('pos');
if (DIFF[Q.get('diff')]) M.diff = Q.get('diff');
if (Q.has('tables')) M.tables = clamp(+Q.get('tables') || 1, 1, ORDER.length);

const fkey = (a, b) => a < b ? a + ',' + b : b + ',' + a;
const fact = k => M.facts[k] || (M.facts[k] = { b: -1, d: 0 });   // b: box (-1 = never asked), d: due at question number
const unlocked = () => ORDER.slice(0, M.tables);
const factsOf = t => { const r = []; for (let n = 2; n <= 12; n++) r.push(fkey(t, n)); return r; };
function pool() { const s = new Set(); for (const t of unlocked()) factsOf(t).forEach(k => s.add(k)); return [...s]; }
function nextFact() {
  const keys = pool().filter(k => k !== M.last);
  const seen = keys.filter(k => fact(k).b >= 0), unseen = keys.filter(k => fact(k).b < 0);
  const due = seen.filter(k => fact(k).d <= M.qn);
  const shaky = seen.filter(k => fact(k).b < 2).length;
  const newest = ORDER[M.tables - 1];
  const freshNew = unseen.filter(k => k.split(',').includes(String(newest)));
  let k;
  if (unseen.length && shaky < 3 && (!due.length || Math.random() < .35)) k = pick(freshNew.length ? freshNew : unseen);
  else if (due.length) { due.sort((a, b) => fact(a).d - fact(b).d); k = pick(due.slice(0, 3)); }
  else if (unseen.length) k = pick(unseen);
  else { seen.sort((a, b) => fact(a).d - fact(b).d); k = pick(seen.slice(0, 3)); }
  M.last = k;
  let [a, b] = k.split(',').map(Number);
  if (Math.random() < .5) [a, b] = [b, a];
  if (!unlocked().includes(a) && unlocked().includes(b)) [a, b] = [b, a];   // reads like "3 × 7" while learning the 3s
  return { k, a, b, ans: a * b, opts: makeOpts(a, b) };
}
function makeOpts(a, b) {   // the wrong answers are near misses
  const ans = a * b, set = new Set([ans]);
  const near = shuffle([a * (b + 1), a * (b - 1), (a + 1) * b, (a - 1) * b]);
  const far = shuffle([ans + 1, ans - 1, ans + 2, ans + 10, ans - 10]);
  for (const c of [...near, ...far]) if (c > 1 && c !== a && c !== b && set.size < 3) set.add(c);
  return shuffle([...set]);
}
function answerFact(k, right) {
  const f = fact(k);
  M.qn++;
  if (right) { f.b = f.b < 0 ? 1 : Math.min(5, f.b + 1); f.d = M.qn + IV[f.b]; }
  else { f.b = f.b < 0 ? 0 : Math.max(0, f.b - 2); f.d = M.qn + 2; }
  // unlock the next table once the newest one is going well
  const nf = factsOf(ORDER[M.tables - 1]);
  if (M.tables < ORDER.length && nf.every(x => fact(x).b >= 1) && nf.filter(x => fact(x).b >= 2).length >= nf.length * .75) {
    M.tables++;
    toast(`🔓 New: the ${ORDER[M.tables - 1]} times table!`);
  }
  save();
}
let toastT = 0;
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }

// ---------- sound ----------
let AC = null;
function ac() { if (!AC && !AUTO) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } AC?.resume?.(); }
function beep(f0, f1, dur, type = 'sine', vol = .15) {
  if (!AC || M.muted) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur);
}
function cheer(dur = 1.6, vol = .12) {   // crowd noise
  if (!AC || M.muted) return;
  const n = AC.sampleRate * dur, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * i / n);
  const s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = buf; f.type = 'bandpass'; f.frequency.value = 1100; f.Q.value = .6; g.gain.value = vol;
  s.connect(f).connect(g).connect(AC.destination); s.start();
}
const SFX = {
  kick: () => beep(240, 90, .12, 'triangle', .16),
  boom: () => { beep(160, 50, .25, 'square', .14); beep(700, 200, .2, 'sawtooth', .06); },
  touch: () => beep(520, 640, .05, 'sine', .06),
  slow: () => beep(500, 160, .3, 'sine', .1),
  right: () => { beep(520, 780, .1, 'sine', .18); setTimeout(() => beep(780, 1040, .14, 'sine', .18), 90); },
  wrong: () => beep(220, 90, .35, 'sawtooth', .12),
  thud: () => beep(140, 60, .15, 'square', .1),
  save: () => beep(300, 420, .12, 'triangle', .14),
  whistle: (n = 1) => { for (let k = 0; k < n; k++) for (let i = 0; i < 5; i++) setTimeout(() => beep(2300 + (i % 2) * 250, 2300 + (i % 2) * 250, .09, 'square', .07), k * 520 + i * 70); },
  goal: () => { cheer(); [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => beep(f, f, .2, 'triangle', .14), i * 120)); },
  boo: () => { cheer(1.2, .05); beep(200, 110, .6, 'sawtooth', .08); },
};

// ---------- game state ----------
// G.players: all 12. G.ball.owner = the player dribbling it (or null when it is rolling free).
// G.duel = the maths question on screen right now (or null). G.ts = how fast time is going (slow during a duel).
let G = null, mode = 'title';
function newMatch(humanRole) {
  const D = humanRole ? DIFF[M.diff] : DIFF.medium;
  G = { players: [], ball: { x: CX, y: CY, vx: 0, vy: 0, owner: null, hot: false, sup: false, noGrab: null, noGrabT: 0, to: null, last: null, shotT: 9, spin: 0 },
    score: [0, 0], t: CFG.MATCH, time: 0, ready: 0, goalT: 0, endT: -1, golden: false, duel: null, ts: 1, call: 0, fx: [], parts: [], shake: 0,
    human: null, demo: !humanRole, stats: { asked: 0, right: 0, goals: 0 }, trail: [] };
  let taken = false;
  for (let team = 0; team < 2; team++) for (const [role, fx, fy] of FORM) {
    const me = team === 0 && role === humanRole && !taken;
    if (me) taken = true;
    const p = { team, role, fx, fy, x: 0, y: 0, vx: 0, vy: 0, mx: 0, my: 0, face: team ? Math.PI : 0, step: rand(0, 9), human: me,
      stun: 0, safe: 0, cool: 0, boost: 0, diveT: 0, kickT: 0,
      D: team === 0 ? (humanRole ? MATES : DIFF.medium) : D, spd: 1, skin: pick(SKINS), hair: pick(HAIRS),
      ai: { t: rand(0, .3), hold: 0, side: pick([-1, 1]), seed: rand(0, 9) } };
    p.spd = me ? 1 : p.D.spd;
    G.players.push(p); if (me) G.human = p;
  }
  kickoff(Math.random() < .5 ? 0 : 1);
}
const homeX = (p, fx) => p.team === 0 ? P.x0 + fx * PW : P.x1 - fx * PW;
const homeY = (p, fy) => p.team === 0 ? P.y0 + fy * PH : P.y1 - fy * PH;
function kickoff(team) {
  const b = G.ball;
  for (const p of G.players) {
    p.x = homeX(p, Math.min(p.fx, p.team === team ? .46 : .34)); p.y = homeY(p, p.fy); p.vx = p.vy = 0; p.stun = p.safe = p.cool = p.boost = p.diveT = 0;
    p.face = p.team ? Math.PI : 0;
    if (p.role === 'str' && p.team === team) { p.x = CX - (p.team ? -1 : 1) * 16; p.y = CY; take(p); p.safe = 1.5; }
  }
  b.x = CX; b.y = CY; b.vx = b.vy = 0;
  G.ready = 1.4; G.call = 0; G.trail.length = 0;
}
const say = (x, y, txt, col = '#fff', big = false) => G.fx.push({ x, y, txt, col, t: 0, big });
function puff(x, y, col, n = 8, sp = 90) {
  for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(.3, 1) * sp; G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rand(.3, .6), col, r: rand(2, 4.5) }); }
}
function confetti() {
  for (let i = 0; i < 90; i++) G.parts.push({ x: rand(0, W), y: rand(-60, 0), vx: rand(-30, 30), vy: rand(120, 260), t: 0, life: rand(1.4, 2.4), col: pick(['#ffd43b', '#ff5a36', '#2f7bff', '#fff', '#58b947', '#ff7ad9']), r: rand(3, 5) });
}

// ---------- kicking and getting the ball ----------
function take(p) {
  const b = G.ball;
  b.owner = p; b.hot = false; b.sup = false; b.to = null; b.last = p; b.noGrab = null; p.ai.t = rand(.25, .45);
}
function kick(p, tx, ty, sp, hot = false) {
  const b = G.ball, a = Math.atan2(ty - p.y, tx - p.x);
  b.owner = null; b.x = p.x + Math.cos(a) * (CFG.PR + CFG.BR); b.y = p.y + Math.sin(a) * (CFG.PR + CFG.BR);
  b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp; b.hot = hot; b.sup = false; b.noGrab = p; b.noGrabT = .35; b.last = p; b.to = null;
  if (hot) b.shotT = 0;
  p.face = a; p.kickT = .25;
  hot ? SFX.boom() : SFX.kick();
}
function passTo(p, m) {
  const d = dist(p, m), sp = clamp(d * .9 + 220, 280, 560), t = d / sp;
  kick(p, m.x + m.vx * t * .8, m.y + m.vy * t * .8, sp);
  G.ball.to = m;
}
const mates = p => G.players.filter(o => o.team === p.team && o !== p);
const opps = p => G.players.filter(o => o.team !== p.team);
const keeperOf = team => G.players.find(o => o.team === team && o.role === 'gk');
function nearestOpp(p) { let m = 1e9; for (const o of G.players) if (o.team !== p.team && o.stun <= 0) m = Math.min(m, dist(o, p)); return m; }
function laneBlocked(p, tx, ty, w = 20) {   // is one of the other team standing in the way?
  const dx = tx - p.x, dy = ty - p.y, L2 = dx * dx + dy * dy || 1;
  for (const o of G.players) {
    if (o.team === p.team || o.stun > 0) continue;
    const t = clamp(((o.x - p.x) * dx + (o.y - p.y) * dy) / L2, 0, 1);
    if (t > .08 && Math.hypot(o.x - (p.x + dx * t), o.y - (p.y + dy * t)) < w) return true;
  }
  return false;
}
function bestOpen(p) {   // computer players: who is the best teammate to pass to?
  const dir = p.team ? -1 : 1; let best = null, bs = -9;
  for (const m of mates(p)) {
    const d = dist(p, m);
    if (m.role === 'gk' || m.stun > 0 || d < 60 || d > 430) continue;
    const sc = dir * (m.x - p.x) / 250 + Math.min(nearestOpp(m), 120) / 120 - (laneBlocked(p, m.x, m.y) ? 1.2 : 0) + (m.human ? .4 : 0);
    if (sc > bs) { bs = sc; best = m; }
  }
  return best && { m: best, sc: bs };
}
function aiShoot(p) {
  const gx = p.team ? P.x0 : P.x1, k = keeperOf(1 - p.team);
  const side = k.y > CY ? -1 : 1;
  const ty = CY + side * rand(.3, .85) * CFG.GOALW + rand(-1, 1) * p.D.err;
  kick(p, gx, ty, CFG.AISHOT, true);
  if (k.human && !G.duel) startDuel('save', k, p);
}
function humanShot(p, right, quick) {
  const gx = p.team ? P.x0 : P.x1, k = keeperOf(1 - p.team);
  if (right) {
    const side = k.y > CY ? -1 : 1;
    kick(p, gx, CY + side * (CFG.GOALW - 12), quick ? CFG.SUPER : CFG.SHOT, true);
    G.ball.sup = quick; G.shake = quick ? .35 : .2;
    say(p.x, p.y - 26, quick ? 'SUPER SHOT!' : 'Great shot!', '#ffd43b', quick);
  } else {
    kick(p, gx, Math.random() < .5 ? k.y : CY + pick([-1, 1]) * (CFG.GOALW + rand(20, 60)), CFG.WEAK);
    say(p.x, p.y - 26, 'Weak shot…', '#ffb3a6');
  }
}

// ---------- the maths duel: tackle, dribble, shoot, save ----------
const DUEL_TITLE = { dribble: 'DRIBBLE PAST!', tackle: 'TACKLE!', shoot: 'SHOOT!', save: 'SAVE IT!' };
function startDuel(type, me, other) {
  const q = nextFact();
  G.duel = { type, me, other, q, t: CFG.QTIME, slow: type === 'save' ? .05 : CFG.SLOW, done: false, after: 0, auto: rand(2.4, 4.4) };
  $('qTitle').textContent = DUEL_TITLE[type];
  $('qText').textContent = `${q.a} × ${q.b}`;
  [...$('qOpts').children].forEach((b, i) => { b.textContent = q.opts[i]; b.className = ''; });
  $('qBar').firstElementChild.style.width = '100%';
  $('quiz').classList.toggle('top', me.y > CY + 10);   // keep the question out of the way of the action
  $('quiz').classList.add('on');
  SFX.slow();
}
function endDuel() { G.duel = null; $('quiz').classList.remove('on'); }
function answer(i) {   // i = which button (-1 = too slow)
  const d = G.duel; if (!d || d.done) return;
  const right = i >= 0 && d.q.opts[i] === d.q.ans, quick = d.t > CFG.QTIME - 2.2;
  d.done = true; d.after = right ? .2 : 1;
  answerFact(d.q.k, right);
  G.stats.asked++; if (right) G.stats.right++;
  const btns = [...$('qOpts').children];
  btns.forEach((b, j) => { if (d.q.opts[j] === d.q.ans) b.className = 'right'; else if (j === i) b.className = 'wrong'; });
  $('qText').textContent = `${d.q.a} × ${d.q.b} = ${d.q.ans}`;
  right ? SFX.right() : SFX.wrong();
  const me = d.me, o = d.other, b = G.ball;
  if (!right) say(me.x, me.y - 26, i < 0 ? 'Too slow!' : 'Oops!', '#ffb3a6');
  if (d.type === 'dribble' && b.owner === me) {
    if (right) { knock(o, me, 2); me.safe = 1.5; me.boost = 1.3; say(me.x, me.y - 26, pick(['Skill!', 'Nutmeg!', 'Too quick!', 'See ya!']), '#ffd43b'); }
    else { take(o); o.safe = 1; knock(me, o, 1.1); }
  } else if (d.type === 'tackle' && b.owner === o) {
    if (right) { take(me); me.safe = 1.2; me.boost = .8; knock(o, me, 1.4); say(me.x, me.y - 26, 'Great tackle!', '#ffd43b'); }
    else { knock(me, o, 1.1); o.safe = 1.6; o.boost = .8; }
  } else if (d.type === 'shoot' && b.owner === me) {
    humanShot(me, right, quick);
  } else if (d.type === 'save') {
    if (right) { me.diveT = .7; say(me.x, me.y - 26, 'DIVE!', '#ffd43b'); }
    else me.stun = .7;
  }
}
function knock(p, by, t) {   // p falls over, pushed away from "by"
  const d = dist(p, by) || 1;
  p.stun = t; p.vx = (p.x - by.x) / d * 120; p.vy = (p.y - by.y) / d * 120;
  puff(p.x, p.y, '#cfe8b0', 6, 70); SFX.thud();
}
function updateDuel(rdt) {
  const d = G.duel;
  if (d.done) { d.after -= rdt; if (d.after <= 0) endDuel(); return; }
  if (d.type === 'save' && !G.ball.hot) { endDuel(); return; }   // the shot is over already
  if (Q.has('hold')) { if (d.t > 3.2) d.t -= rdt; return; }   // testing: freeze on the first question (for screenshots)
  d.t -= rdt;
  $('qBar').firstElementChild.style.width = clamp(d.t / CFG.QTIME * 100, 0, 100) + '%';
  $('qBar').firstElementChild.style.background = d.t < 1.5 ? '#ff5a36' : d.t < 3 ? '#ffd43b' : '#58b947';
  if (AUTO && d.t < d.auto) { const r = d.q.opts.indexOf(d.q.ans); answer(Math.random() < AUTO_RIGHT ? r : (r + 1) % 3); }
  else if (d.t <= 0) answer(-1);
}
function contacts() {   // someone from the other team touches the player with the ball
  const b = G.ball, c = b.owner;
  if (!c || c.safe > 0 || G.duel) return;
  for (const t of G.players) {
    if (t.team === c.team || t.stun > 0 || t.cool > 0 || dist(t, c) > CFG.PR * 2 + 3) continue;
    if (c.human) startDuel('dribble', c, t);
    else if (t.human) startDuel('tackle', t, c);
    else if (Math.random() < t.D.tk) { take(t); t.safe = .8; knock(c, t, .8); }      // computer v computer: roll a dice
    else { knock(t, c, .9); c.safe = .7; }
    return;
  }
}

// ---------- computer players ----------
function goTo(p, x, y, slowR = 26) {
  const dx = x - p.x, dy = y - p.y, d = Math.hypot(dx, dy);
  if (d < 2) { p.mx = p.my = 0; return; }
  const k = Math.min(1, d / slowR); p.mx = dx / d * k; p.my = dy / d * k;
}
function teamThink(team, dt) {
  const b = G.ball, own = b.owner, ps = G.players.filter(p => p.team === team);
  const out = ps.filter(p => p.role !== 'gk' && !(p.human && !AUTO) && p.stun <= 0 && p !== own);
  const chasers = new Set();
  if (!own) {
    if (!b.hot) {
      const tx = b.x + b.vx * .25, ty = b.y + b.vy * .25;
      out.sort((p, q) => Math.hypot(p.x - tx, p.y - ty) - Math.hypot(q.x - tx, q.y - ty));
      if (out[0]) chasers.add(out[0]);
      if (b.to && b.to.team === team) chasers.add(b.to);
    }
  } else if (own.team !== team && !(own.role === 'gk' && own.safe > 0)) {
    // about three of them chase YOU; computer players only get two chasers
    const n = own.human ? CFG.PRESS : 2;
    out.sort((p, q) => dist(p, own) - dist(q, own));
    out.slice(0, n).forEach(p => chasers.add(p));
  }
  const dir = team ? -1 : 1, attack = own && own.team === team;
  const bfx = team ? (P.x1 - b.x) / PW : (b.x - P.x0) / PW, bfy = team ? (P.y1 - b.y) / PH : (b.y - P.y0) / PH;
  for (const p of ps) {
    if (p.human && !AUTO) continue;
    if (p.role === 'gk') { keeperAI(p, dt); continue; }
    if (p === own) { carrierAI(p, dt); continue; }
    if (chasers.has(p)) {
      if (own) goTo(p, own.x + own.vx * .15, own.y + own.vy * .15, 4);
      else goTo(p, b.x + b.vx * .2, b.y + b.vy * .2, 4);
      continue;
    }
    // everyone else keeps the team's shape, sliding up and down the pitch with the ball
    const lim = p.role === 'def' ? [.1, .6] : p.role === 'mid' ? [.22, .84] : [.4, .92];
    let fx = clamp(p.fx + (bfx - .5) * .6 + (attack ? .1 : -.05), lim[0], lim[1]);
    let fy = p.fy + (bfy - .5) * .35;
    if (attack) { fx += Math.sin(G.time * .9 + p.ai.seed) * .04; fy += Math.cos(G.time * .7 + p.ai.seed * 2) * .08; }
    goTo(p, homeX(p, fx), homeY(p, clamp(fy, .06, .94)), 40);
  }
}
function carrierAI(p, dt) {
  const D = p.D, dir = p.team ? -1 : 1, gx = dir > 0 ? P.x1 : P.x0, h = G.human;
  const dg = Math.hypot(gx - p.x, CY - p.y);
  const inDuel = G.duel && (G.duel.other === p || G.duel.me === p);
  p.ai.t -= dt;
  if (p.ai.t <= 0 && !inDuel) {
    p.ai.t = rand(.2, .35);
    const dOpp = nearestOpp(p), mate = h && h !== p && h.team === p.team;
    if (mate && G.call > 0 && dist(p, h) > 40) { G.call = 0; passTo(p, h); return; }       // you shouted for it
    if (dg < D.shootR && (dOpp < 46 || dg < 120 || Math.random() < .4)) {
      if (p.human) startDuel('shoot', p, null); else aiShoot(p);
      return;
    }
    if (mate && h.role !== 'gk' && h.stun <= 0 && dir * (h.x - p.x) > 20 && dist(p, h) < 400 && !laneBlocked(p, h.x, h.y) && Math.random() < .45) { passTo(p, h); return; }
    if (dOpp < 60 || Math.random() < .06) { const o = bestOpen(p); if (o && o.sc > .3) { passTo(p, o.m); return; } }
  }
  // run at the goal, swerving round the other team
  let dx = gx - dir * 50 - p.x, dy = CY + clamp(p.y - CY, -70, 70) - p.y;
  const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
  for (const o of G.players) {
    if (o.team === p.team || o.stun > 0) continue;
    const od = dist(o, p); if (od > 80) continue;
    const k = (80 - od) / 80, ux = (p.x - o.x) / od, uy = (p.y - o.y) / od;
    dx += ux * k * .9 - uy * k * .8 * p.ai.side; dy += uy * k * .9 + ux * k * .8 * p.ai.side;
  }
  if (p.y < P.y0 + 30) { dy += .7; p.ai.side = -dir; } else if (p.y > P.y1 - 30) { dy -= .7; p.ai.side = dir; }
  const m = Math.hypot(dx, dy) || 1; p.mx = dx / m; p.my = dy / m;
}
function keeperAI(p, dt) {
  const b = G.ball, dir = p.team ? -1 : 1, gx = p.team ? P.x1 - 14 : P.x0 + 14;
  if (b.owner === p) {   // caught it: wait a moment, then pass it out
    p.mx = p.my = 0; p.ai.hold -= dt;
    if (p.ai.hold <= 0) {
      const o = bestOpen(p), h = G.human;
      if (h && h.team === p.team && G.call > 0) { G.call = 0; passTo(p, h); }
      else if (o) passTo(p, o.m); else kick(p, p.x + dir * 300, CY + rand(-150, 150), 520);
    }
    return;
  }
  let tx = gx, ty = CY + clamp((b.y - CY) * .45, -CFG.GOALW + 14, CFG.GOALW - 14);
  const coming = !b.owner && b.vx * dir < -120;
  if (coming && (!b.hot || b.shotT > .1 / p.D.kspd)) {            // work out where the shot will cross the line
    const t = (gx - b.x) / b.vx;
    if (t > 0 && t < 1.5) ty = clamp(b.y + b.vy * t, CY - CFG.GOALW - 6, CY + CFG.GOALW + 6);
  } else if (!b.owner && !b.hot && Math.hypot(b.x - p.x, b.y - p.y) < 80 && Math.abs(b.x - gx) < 90) { tx = b.x; ty = b.y; }   // loose ball close by: grab it
  goTo(p, tx, ty, 8);
}

// ---------- your controls ----------
const keys = {};
const move = { id: null, cx: 0, cy: 0, x: 0, y: 0 };   // the stick
const STICK = 48;
function toGame(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
const canAct = () => mode === 'play' && G.human && !G.duel && G.ready <= 0 && G.goalT <= 0 && G.endT < 0 && G.human.stun <= 0;
function humanShoot() { if (canAct() && G.ball.owner === G.human) startDuel('shoot', G.human, null); }
function humanPass() {
  if (!canAct()) return;
  const p = G.human, b = G.ball;
  if (b.owner === p) {
    // pass the way you are running (or facing)
    const mv = Math.hypot(p.mx, p.my) > .3, ux = mv ? p.mx : Math.cos(p.face), uy = mv ? p.my : Math.sin(p.face), n = Math.hypot(ux, uy) || 1;
    let best = null, bs = -9;
    for (const m of mates(p)) {
      const d = dist(p, m); if (d < 40 || m.stun > 0) continue;
      const sc = ((m.x - p.x) * ux + (m.y - p.y) * uy) / d / n * 1.3 - d / 600 - (laneBlocked(p, m.x, m.y) ? .5 : 0) - (m.role === 'gk' ? .3 : 0);
      if (sc > bs) { bs = sc; best = m; }
    }
    if (best) passTo(p, best);
  } else if (b.owner && b.owner.team === p.team) { G.call = 1.5; say(p.x, p.y - 26, 'Pass!', '#fff'); SFX.touch(); }
}
addEventListener('keydown', e => {
  if (e.repeat) return;
  keys[e.code] = true;
  const n = { Digit1: 0, Digit2: 1, Digit3: 2, Numpad1: 0, Numpad2: 1, Numpad3: 2 }[e.code];
  if (n !== undefined) { ac(); answer(n); }
  if (e.code === 'Space') { e.preventDefault(); ac(); humanShoot(); }
  if (e.code === 'KeyX' || e.code === 'KeyE' || e.code === 'ShiftLeft' || e.code === 'Enter') { if (mode === 'play') e.preventDefault(); ac(); humanPass(); }
  if (e.code.startsWith('Arrow')) e.preventDefault();
});
addEventListener('keyup', e => { keys[e.code] = false; });
const press = (el, fn) => el.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); ac(); fn(); }, { passive: false });
[...$('qOpts').children].forEach((b, i) => press(b, () => answer(i)));
press($('shootBtn'), humanShoot); press($('passBtn'), humanPass);
if (TOUCH) {
  const setStick = (s, e) => {
    const q = toGame(e); let dx = q.x - s.cx, dy = q.y - s.cy; const m = Math.hypot(dx, dy);
    if (m > STICK) { s.cx += dx * (1 - STICK / m); s.cy += dy * (1 - STICK / m); dx *= STICK / m; dy *= STICK / m; }   // the stick follows your thumb
    s.x = dx / STICK; s.y = dy / STICK;
  };
  addEventListener('pointerdown', e => {
    if (mode !== 'play' || e.target.closest('button') || e.target.closest('#quiz')) return;
    ac(); e.preventDefault();
    if (move.id !== null) return;
    const q = toGame(e); move.id = e.pointerId; move.cx = q.x; move.cy = q.y; move.x = move.y = 0;
  }, { passive: false });
  addEventListener('pointermove', e => { if (e.pointerId === move.id) setStick(move, e); });
  const end = e => { if (e.pointerId === move.id) { move.id = null; move.x = move.y = 0; } };
  addEventListener('pointerup', end); addEventListener('pointercancel', end);
  addEventListener('contextmenu', e => e.preventDefault());
}
function control(p) {
  let mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + move.x;
  let my = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + move.y;
  const m = Math.hypot(mx, my); if (m > 1) { mx /= m; my /= m; }
  p.mx = mx; p.my = my;
}

// ---------- one tick of the game ----------
function step(rdt) {
  G.ts = lerp(G.ts, G.duel && !G.duel.done ? G.duel.slow : G.duel ? .35 : 1, 1 - Math.exp(-rdt * 14));
  const dt = rdt * G.ts, b = G.ball;
  for (const f of G.fx) f.t += rdt;
  G.fx = G.fx.filter(f => f.t < (f.big ? 1.8 : 1.1));
  for (const q of G.parts) { q.t += rdt; q.x += q.vx * rdt; q.y += q.vy * rdt; }
  G.parts = G.parts.filter(q => q.t < q.life);
  G.shake = Math.max(0, G.shake - rdt);
  if (G.duel) updateDuel(rdt);
  if (G.endT >= 0) { G.endT -= rdt; if (G.endT < 0) showEnd(); for (const p of G.players) { p.mx = p.my = 0; } movePlayers(dt); return; }
  if (G.ready > 0) { G.ready -= rdt; if (G.ready <= 0) SFX.whistle(); return; }
  G.time += dt;
  if (G.goalT > 0) {
    G.goalT -= rdt;
    for (const p of G.players) { p.mx = p.my = 0; if (p.team === G.lastGoal) p.step += rdt * 60; }
    movePlayers(dt); moveBall(dt, true);
    if (G.goalT <= 0) { if (G.golden || (!G.demo && G.t <= 0)) fullTime(); else kickoff(1 - G.lastGoal); }
    return;
  }
  if (!G.demo && !G.duel && !G.golden) {
    G.t -= dt;
    if (G.t <= 0) { G.t = 0; if (G.score[0] === G.score[1]) { G.golden = true; say(CX, CY - 40, 'GOLDEN GOAL!', '#ffd43b', true); say(CX, CY + 10, 'Next goal wins', '#fff', true); SFX.whistle(2); } else { fullTime(); return; } }
  }
  G.call = Math.max(0, G.call - dt);
  teamThink(0, dt); teamThink(1, dt);
  if (G.human && !AUTO) control(G.human);
  movePlayers(dt);
  moveBall(dt, false);
  contacts();
}
function movePlayers(dt) {
  const b = G.ball;
  for (const p of G.players) {
    p.safe = Math.max(0, p.safe - dt); p.cool = Math.max(0, p.cool - dt); p.boost = Math.max(0, p.boost - dt); p.kickT = Math.max(0, p.kickT - dt);
    if (p.stun > 0) { p.stun -= dt; p.vx *= Math.exp(-dt * 5); p.vy *= Math.exp(-dt * 5); }
    else if (p.diveT > 0) {   // right answer in goal: fly at the ball
      p.diveT -= dt;
      const tx = b.x + b.vx * .04, ty = b.y + b.vy * .04, d = Math.hypot(tx - p.x, ty - p.y) || 1;
      p.vx = (tx - p.x) / d * 540; p.vy = (ty - p.y) / d * 540;
      if (b.owner || !b.hot) p.diveT = 0;
    } else {
      const sp = CFG.SPEED * p.spd * (b.owner === p ? .93 : 1) * (p.boost > 0 ? 1.3 : 1) * (p.role === 'gk' && !p.human ? p.D.kspd / p.D.spd * 1.3 : 1);
      const k = 1 - Math.exp(-dt * 10);
      p.vx = lerp(p.vx, p.mx * sp, k); p.vy = lerp(p.vy, p.my * sp, k);
    }
    p.x = clamp(p.x + p.vx * dt, P.x0 + 2, P.x1 - 2); p.y = clamp(p.y + p.vy * dt, P.y0 + 2, P.y1 - 2);
    const v = Math.hypot(p.vx, p.vy);
    if (v > 12 && p.stun <= 0) {
      let da = Math.atan2(p.vy, p.vx) - p.face; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      p.face += da * (1 - Math.exp(-dt * 14)); p.step += v * dt;
    }
  }
  // players can't stand on top of each other
  const ps = G.players, R = CFG.PR * 2 - 3;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], c = ps[j], dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
    if (d >= R || d < .01) continue;
    const push = (R - d) / 2, ux = dx / d, uy = dy / d;
    a.x -= ux * push; a.y -= uy * push; c.x += ux * push; c.y += uy * push;
  }
}
function moveBall(dt, inNet) {
  const b = G.ball, BR = CFG.BR;
  b.shotT += dt; b.noGrabT -= dt;
  if (b.owner) {
    const p = b.owner, wob = Math.sin(p.step * .12) * 2.5;
    b.x = clamp(p.x + Math.cos(p.face) * (CFG.PR + 3 + wob), P.x0 + BR, P.x1 - BR);
    b.y = clamp(p.y + Math.sin(p.face) * (CFG.PR + 3 + wob), P.y0 + BR, P.y1 - BR);
    b.vx = p.vx; b.vy = p.vy; b.spin += Math.hypot(p.vx, p.vy) * dt * .1;
    return;
  }
  b.x += b.vx * dt; b.y += b.vy * dt;
  const k = Math.exp(-dt * (inNet ? 5 : CFG.DRAG)); b.vx *= k; b.vy *= k;
  const sp = Math.hypot(b.vx, b.vy); b.spin += sp * dt * .1;
  if (sp < 6) b.vx = b.vy = 0;
  if (b.hot && sp < 260) b.hot = false;
  if (b.hot) { G.trail.push({ x: b.x, y: b.y, t: 0 }); }
  for (const t of G.trail) t.t += dt; G.trail = G.trail.filter(t => t.t < .22);
  // walls: the ball bounces back in (no throw-ins!)
  if (b.y < P.y0 + BR) { b.y = P.y0 + BR; b.vy = Math.abs(b.vy) * .7; } else if (b.y > P.y1 - BR) { b.y = P.y1 - BR; b.vy = -Math.abs(b.vy) * .7; }
  const mouth = Math.abs(b.y - CY) < CFG.GOALW - 2;
  for (const side of [0, 1]) {
    const over = side ? b.x - (P.x1 - BR) : (P.x0 + BR) - b.x;
    if (over <= 0) continue;
    if (inNet) { b.y = clamp(b.y, CY - CFG.GOALW + BR, CY + CFG.GOALW - BR); if (over > 24) { b.x = side ? P.x1 + 18 : P.x0 - 18; b.vx = 0; } }
    else if (mouth) { if (over > BR * 2) goal(side ? 0 : 1); }
    else { b.x = side ? P.x1 - BR : P.x0 + BR; b.vx = (side ? -1 : 1) * Math.abs(b.vx) * .6; b.hot = false; }
  }
  if (inNet) return;
  // who gets it? A hot ball (a shot) flies past everyone except goalies
  let got = null, gd = 1e9;
  for (const p of G.players) {
    if (p.stun > 0 || (b.noGrab === p && b.noGrabT > 0) || (b.hot && p.role !== 'gk')) continue;
    const d = Math.hypot(p.x - b.x, p.y - b.y);
    if (d < CFG.PR + BR + (p.diveT > 0 ? 10 : p.role === 'gk' ? 7 : 3) && d < gd) { gd = d; got = p; }
  }
  if (got) {
    const shot = b.hot, from = b.last;
    take(got);
    if (got.role === 'gk') {
      got.safe = 3; got.ai.hold = .8; got.diveT = 0;
      if (shot) { SFX.save(); say(got.x, got.y - 26, got.human ? 'WHAT A SAVE!' : 'Saved!', got.human ? '#ffd43b' : '#fff', got.human); puff(got.x, got.y, '#fff', 8); if (from && from.team !== got.team && got.team === 0 && G.human) cheer(.7, .06); }
    } else SFX.touch();
  }
}
function goal(team) {
  G.score[team]++; G.lastGoal = team; G.goalT = 2.8; G.shake = .4;
  if (G.duel) endDuel();
  const mine = G.human && team === G.human.team, me = G.ball.last && G.ball.last.human && mine;
  if (me) G.stats.goals++;
  say(CX, CY - 30, 'GOAL!', TEAMS[team].shirt, true);
  if (me) say(CX, CY + 24, 'You scored!', '#ffd43b', true);
  if (G.demo || mine) { confetti(); SFX.goal(); } else SFX.boo();
  if (AUTO) console.log(`auto goal: ${G.score[0]}-${G.score[1]} at ${Math.round(CFG.MATCH - G.t)}s by ${G.ball.last ? (G.ball.last.human ? 'YOU' : TEAMS[G.ball.last.team].name + ' ' + G.ball.last.role) : '?'}`);
}
function fullTime() {
  if (G.duel) endDuel();
  G.endT = 1.8; SFX.whistle(3);
  say(CX, CY - 30, 'FULL TIME!', '#fff', true);
}

// ---------- drawing ----------
const INK = '#1d1a33';
const pitch = document.createElement('canvas');
function bakePitch() {
  pitch.width = W * DPR; pitch.height = H * DPR;
  const c = pitch.getContext('2d'); c.scale(DPR, DPR);
  c.fillStyle = '#1f6b2a'; c.fillRect(0, 0, W, H);
  // little crowd round the edge
  for (let i = 0; i < 260; i++) {
    const top = i < 150, x = top ? rand(8, W - 8) : (i % 2 ? rand(4, 18) : rand(W - 18, W - 4)), y = top ? rand(46, 52) + (i % 3) * -5 : rand(70, H - 30);
    if (top && Math.abs(x - CX) < 190) continue;
    c.fillStyle = pick(['#ffd43b', '#ff5a36', '#2f7bff', '#fff', '#ff7ad9', '#22c1c3']); c.beginPath(); c.arc(x, y, 3.2, 0, TAU); c.fill();
  }
  // grass stripes
  const n = 12, sw = PW / n;
  for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#3fa34d' : '#48b157'; c.fillRect(P.x0 + i * sw, P.y0, sw + .5, PH); }
  // white lines
  c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 3; c.lineJoin = 'round';
  c.strokeRect(P.x0, P.y0, PW, PH);
  c.beginPath(); c.moveTo(CX, P.y0); c.lineTo(CX, P.y1); c.stroke();
  c.beginPath(); c.arc(CX, CY, 58, 0, TAU); c.stroke();
  c.fillStyle = '#fff'; c.beginPath(); c.arc(CX, CY, 4, 0, TAU); c.fill();
  for (const s of [0, 1]) {
    const x = s ? P.x1 : P.x0, d = s ? -1 : 1;
    c.strokeRect(Math.min(x, x + d * 130), CY - 130, 130, 260);    // penalty box
    c.strokeRect(Math.min(x, x + d * 46), CY - 82, 46, 164);
    c.beginPath(); c.arc(x + d * 96, CY, 3, 0, TAU); c.fill();
    // the goal and its net
    const gx = Math.min(x, x - d * 26);
    c.fillStyle = 'rgba(255,255,255,.22)'; c.fillRect(gx, CY - CFG.GOALW, 26, CFG.GOALW * 2);
    c.save(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1;
    c.beginPath();
    for (let i = 0; i <= 26; i += 6.5) { c.moveTo(gx + i, CY - CFG.GOALW); c.lineTo(gx + i, CY + CFG.GOALW); }
    for (let j = -CFG.GOALW; j <= CFG.GOALW; j += 7.75) { c.moveTo(gx, CY + j); c.lineTo(gx + 26, CY + j); }
    c.stroke(); c.restore();
    c.save(); c.strokeStyle = INK; c.lineWidth = 7; c.strokeRect(gx, CY - CFG.GOALW, 26, CFG.GOALW * 2);
    c.strokeStyle = '#fff'; c.lineWidth = 4; c.strokeRect(gx, CY - CFG.GOALW, 26, CFG.GOALW * 2); c.restore();
  }
}
function txt(s, x, y, size, col, align = 'center', stroke = INK, lw = 4) {
  ctx.font = `${size}px Bangers, Impact, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  if (lw) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeText(s, x, y); }
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function drawBall() {
  const b = G.ball, r = CFG.BR;
  for (const t of G.trail) { ctx.globalAlpha = (1 - t.t / .22) * .5; ctx.fillStyle = b.sup ? '#ff9f1c' : '#fff'; ctx.beginPath(); ctx.arc(t.x, t.y, r * (1 - t.t / .3), 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(b.x + 2, b.y + 3, r, r * .8, 0, 0, TAU); ctx.fill();
  ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.spin);
  ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(0, 0, 2, 0, TAU); ctx.fill();
  for (let i = 0; i < 5; i++) { const a = i * TAU / 5; ctx.beginPath(); ctx.arc(Math.cos(a) * r * .8, Math.sin(a) * r * .8, 1.3, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawPlayer(p) {
  const R = CFG.PR, T = TEAMS[p.team], moving = Math.min(1, Math.hypot(p.vx, p.vy) / 60);
  ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(p.x + 2, p.y + 4, R, R * .8, 0, 0, TAU); ctx.fill();
  if (p.human) {   // the ring that shows which one is you
    ctx.strokeStyle = '#ffd43b'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, R + 6 + Math.sin(G.time * 6) * 1.2, 0, TAU); ctx.stroke();
  }
  ctx.save(); ctx.translate(p.x, p.y);
  ctx.rotate(p.face + (p.stun > 0 ? Math.sin(G.time * 22) * .5 : 0));
  if (p.diveT > 0) ctx.scale(1.25, 1);
  const sw = Math.sin(p.step * .13) * 6 * moving + (p.kickT > 0 ? 7 : 0);
  ctx.lineWidth = 1.5; ctx.strokeStyle = INK;
  ctx.fillStyle = '#222';   // boots
  ctx.beginPath(); ctx.ellipse(2 + sw, -5, 5, 3, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(2 - sw, 5, 5, 3, 0, 0, TAU); ctx.fill();
  ctx.fillStyle = p.role === 'gk' ? '#fff' : p.skin;   // hands (goalies wear gloves)
  const hr = p.role === 'gk' ? 4 : 3;
  ctx.beginPath(); ctx.arc(-sw * .5 + 1, -R + 1, hr, 0, TAU); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(sw * .5 + 1, R - 1, hr, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.role === 'gk' ? T.gk : T.shirt;    // shirt
  ctx.beginPath(); ctx.ellipse(0, 0, R * .62, R * .95, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(1, 0, R * .52, 0, TAU); ctx.fill(); ctx.stroke();   // head
  ctx.fillStyle = p.hair; ctx.beginPath(); ctx.arc(1, 0, R * .52, Math.PI * .5, Math.PI * 1.5); ctx.fill();
  ctx.restore();
  if (p.stun > 0) for (let i = 0; i < 3; i++) { const a = G.time * 7 + i * TAU / 3; txt('★', p.x + Math.cos(a) * 12, p.y - 16 + Math.sin(a) * 4, 11, '#ffd43b', 'center', INK, 2); }
  if (p.human) {
    const y = p.y - R - 13 + Math.sin(G.time * 5) * 2;
    ctx.fillStyle = '#ffd43b'; ctx.strokeStyle = INK; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x - 7, y - 8); ctx.lineTo(p.x + 7, y - 8); ctx.lineTo(p.x, y + 1); ctx.closePath(); ctx.fill(); ctx.stroke();
  }
}
function drawScore() {
  const y = 26, mm = Math.floor(Math.ceil(G.t) / 60), ss = String(Math.ceil(G.t) % 60).padStart(2, '0');
  ctx.lineWidth = 3; ctx.strokeStyle = INK;
  const box = (x, w, col) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, y - 19, w, 38, 9); ctx.fill(); ctx.stroke(); };
  box(CX - 178, 132, TEAMS[0].shirt); box(CX + 46, 132, TEAMS[1].shirt); box(CX - 50, 100, '#fff');
  txt(TEAMS[0].name, CX - 166, y + 1, 24, '#fff', 'left', INK, 3); txt(G.score[0], CX - 64, y + 1, 28, '#fff', 'right', INK, 3);
  txt(TEAMS[1].name, CX + 166, y + 1, 24, '#fff', 'right', INK, 3); txt(G.score[1], CX + 64, y + 1, 28, '#fff', 'left', INK, 3);
  txt(G.golden ? 'GOLDEN' : `${mm}:${ss}`, CX, y + 1, G.golden ? 21 : 26, G.t < 20 && !G.golden ? '#ff5a36' : INK, 'center', INK, 0);
}
function drawStick(s, hx, hy, label) {
  const on = s.id !== null, cx = on ? s.cx : hx, cy = on ? s.cy : hy;
  ctx.fillStyle = on ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.1)'; ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, STICK, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.fillStyle = on ? 'rgba(255,255,255,.6)' : 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(cx + s.x * STICK, cy + s.y * STICK, 22, 0, TAU); ctx.fill();
  if (!on) txt(label, cx, cy, 15, 'rgba(255,255,255,.9)', 'center', 'rgba(29,26,51,.6)', 3);
}
function draw() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.drawImage(pitch, 0, 0, W, H);
  ctx.save();
  if (G.shake > 0) ctx.translate(rand(-1, 1) * G.shake * 14, rand(-1, 1) * G.shake * 14);
  const h = G.human, b = G.ball;
  if (h && mode === 'play' && b.owner && b.owner.team === h.team && b.owner !== h && G.call > 0) {   // the pass you shouted for
    ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(b.owner.x, b.owner.y); ctx.lineTo(h.x, h.y); ctx.stroke(); ctx.setLineDash([]);
  }
  const ps = G.players.slice().sort((a, c) => a.y - c.y);
  for (const p of ps) drawPlayer(p);
  drawBall();
  for (const q of G.parts) { ctx.globalAlpha = 1 - q.t / q.life; ctx.fillStyle = q.col; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, TAU); ctx.fill(); }
  ctx.globalAlpha = 1;
  // slow motion: the pitch goes dark except round the two players
  const d = G.duel;
  if (d && mode === 'play') {
    const a = clamp((1 - G.ts) * .55, 0, .5), fx = d.other && d.type !== 'save' ? (d.me.x + d.other.x) / 2 : d.me.x, fy = d.other && d.type !== 'save' ? (d.me.y + d.other.y) / 2 : d.me.y;
    const g = ctx.createRadialGradient(fx, fy, 30, fx, fy, 150);
    g.addColorStop(0, 'rgba(15,12,40,0)'); g.addColorStop(1, `rgba(15,12,40,${a})`);
    ctx.fillStyle = g; ctx.fillRect(-20, -20, W + 40, H + 40);
    if (!d.done) {   // the 5 second ring
      ctx.strokeStyle = d.t < 1.5 ? '#ff5a36' : '#ffd43b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(d.me.x, d.me.y, 26, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(d.t / CFG.QTIME, 0, 1)); ctx.stroke(); ctx.lineCap = 'butt';
      txt(Math.ceil(d.t), d.me.x + 34, d.me.y - 24, 22, '#fff');
    }
  }
  for (const f of G.fx) {
    const life = f.big ? 1.8 : 1.1, k = f.t / life;
    ctx.globalAlpha = k > .7 ? (1 - k) / .3 : 1;
    const pop = f.big ? 1 + Math.max(0, .25 - f.t) * 3 : 1;
    txt(f.txt, f.x, f.y - (f.big ? 0 : f.t * 26), (f.big ? 54 : 19) * pop, f.col, 'center', INK, f.big ? 8 : 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
  if (mode !== 'title') drawScore();
  if (mode === 'play') {
    if (G.ready > 0) txt(G.golden ? 'NEXT GOAL WINS!' : 'KICK OFF!', CX, CY - 70, 46, '#ffd43b', 'center', INK, 7);
    if (TOUCH) drawStick(move, 120, H - 110, 'RUN');
    // phone buttons change with what you can do
    const mine = b.owner === h, ours = b.owner && h && b.owner.team === h.team;
    $('shootBtn').classList.toggle('dim', !mine || !!G.duel); $('passBtn').classList.toggle('dim', !ours || !!G.duel);
    const lab = mine || !ours ? 'PASS' : 'PASS TO ME!';
    if ($('passBtn').textContent !== lab) $('passBtn').textContent = lab;
  }
}

// ---------- menus ----------
function setMode(m) { mode = m; for (const c of ['title', 'play', 'over']) document.body.classList.toggle(c, m === c); if (m !== 'play') $('quiz').classList.remove('on'); }
function optButtons(id, list, key) {
  const box = $(id);
  for (const [val, label] of list) {
    const b = document.createElement('button'); b.textContent = label;
    b.onclick = () => { ac(); M[key] = val; save(); [...box.children].forEach(c => c.classList.toggle('on', c === b)); };
    if (M[key] === val) b.classList.add('on');
    box.appendChild(b);
  }
}
optButtons('pBtns', POS, 'pos');
optButtons('dBtns', [['easy', 'Easy'], ['medium', 'Medium'], ['hard', 'Hard']], 'diff');
function showEnd() {
  const s = G.stats, win = G.score[0] > G.score[1];
  M.games++; if (win) M.wins++; save();
  $('endTitle').textContent = win ? 'YOU WIN! 🏆' : 'UNLUCKY!';
  $('endText').innerHTML = `Blues <b>${G.score[0]} – ${G.score[1]}</b> Reds<br>Your goals: <b>${s.goals}</b> ⚽ &nbsp; Maths: <b>${s.right}</b> out of <b>${s.asked}</b> right 🧠<br>Your times tables: <b>${unlocked().join(', ')}</b>`;
  setMode('over');
  if (win) { confetti(); SFX.goal(); }
}
function startPlay() { ac(); goFullscreen(); newMatch(M.pos); move.id = null; move.x = move.y = 0; setMode('play'); }
$('playBtn').onclick = startPlay; $('againBtn').onclick = startPlay;
const toMenu = () => { newMatch(null); setMode('title'); };
$('menuBtn').onclick = toMenu; $('quitBtn').onclick = toMenu;
$('muteBtn').textContent = M.muted ? '🔇' : '🔊';
$('muteBtn').onclick = () => { ac(); M.muted = !M.muted; save(); $('muteBtn').textContent = M.muted ? '🔇' : '🔊'; };
$('anyway').onclick = () => document.body.classList.add('portraitOk');

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
// turn the phone upright = leave full screen
const exitFs = () => { if (isFs()) (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); };
let uprightT = 0;
addEventListener('deviceorientation', e => {
  if (!isFs() || e.beta == null) return;
  const upright = Math.abs(e.beta) > 50 && Math.abs(e.beta) < 130 && Math.abs(e.gamma) < 25;
  if (!upright) uprightT = 0; else if (!uprightT) uprightT = performance.now(); else if (performance.now() - uprightT > 700) { uprightT = 0; exitFs(); }
});
matchMedia('(orientation: portrait)').addEventListener?.('change', e => { if (e.matches) exitFs(); });

// ---------- go ----------
bakePitch();
newMatch(null); setMode('title');
if (AUTO) { newMatch(M.pos); setMode('play'); }
const timerLoop = AUTO || Q.has('shot');
let last = performance.now();
function loop() {
  const now = performance.now(), dt = Math.min(.05, (now - last) / 1000); last = now;
  try { step(dt); } catch (e) { console.error(e); }   // one hiccup must never freeze the whole game
  if (AUTO && mode === 'over') { console.log(`auto full time: ${G.score[0]}-${G.score[1]}, your goals ${G.stats.goals}, maths ${G.stats.right}/${G.stats.asked}, tables ${M.tables}`); newMatch(M.pos); setMode('play'); }
  try { draw(); } catch (e) { console.error(e); }
  if (timerLoop) setTimeout(loop, 16); else requestAnimationFrame(loop);
}
loop();
