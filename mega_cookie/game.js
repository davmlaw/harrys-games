'use strict';
// Mega Cookie: click the big cookie a few times (the fun bit), then a sum pops up and three cookies show answers.
// There's no time limit: take your time. Click the right cookie to win cookies (a small bonus for a quick right answer),
// click a wrong one and you lose some, see the right answer, and get another sum: you go back to clicking once you get one right.
// How many of your last 10 answers were right (ACC) multiplies all the cookies you get, so guessing never pays.
// Spend cookies in the shop on things that add more cookies to every right answer.
// Everything is PLUS, never times (Harry's rule).

// pa = + cookies for every right answer. Nothing bakes on its own: cookies only come from maths (Harry's rule).
const ITEMS = [
  {id:'pencil',  ic:'✏️', nm:'Sharp Pencil',     pa:4,      cost:25},
  {id:'fingers', ic:'👆', nm:'Sticky Fingers',   pa:3,      cost:15},
  {id:'chips',   ic:'🍫', nm:'Extra Choc Chips', pa:12,      cost:100},
  {id:'ruler',   ic:'📏', nm:'Magic Ruler',      pa:40,     cost:400},
  {id:'sprink',  ic:'🌈', nm:'Sprinkles',        pa:50,     cost:600},
  {id:'abacus',  ic:'🧮', nm:'Abacus',           pa:200,    cost:3000},
  {id:'oven',    ic:'🔥', nm:'Big Oven',         pa:250,    cost:4000},
  {id:'book',    ic:'📘', nm:'Maths Book',       pa:1200,   cost:20000},
  {id:'milk',    ic:'🥛', nm:'Milk Fountain',    pa:1300,    cost:25000},
  {id:'jar',     ic:'🫙', nm:'Giant Cookie Jar', pa:3500,   cost:70000},
  {id:'star',    ic:'⭐', nm:"Teacher's Gold Star",pa:7000, cost:150000},
  {id:'icing',   ic:'🧁', nm:'Rainbow Icing',    pa:6000,   cost:150000},
  {id:'truck',   ic:'🚚', nm:'Cookie Truck',     pa:40000,  cost:1e6},
  {id:'brain',   ic:'🧠', nm:'Big Brain',        pa:45000,  cost:1.2e6},
  {id:'factory', ic:'🏭', nm:'Cookie Factory',   pa:200000, cost:6e6},
  {id:'owl',     ic:'🦉', nm:'Professor Owl',    pa:250000, cost:8e6},
  {id:'rocket',  ic:'🚀', nm:'Cookie Rocket',    pa:1.2e6, cost:4e7},
  {id:'robot',   ic:'🤖', nm:'Maths Robot',      pa:1.7e6,  cost:6e7},
  {id:'moon',    ic:'🌙', nm:'Moon Bakery',      pa:7e6,  cost:2.5e8},
  {id:'diamond', ic:'💎', nm:'Diamond Cookie',   pa:2.5e7,    cost:1e9},
  {id:'crown',   ic:'👑', nm:'Genius Crown',     pa:3.5e7,    cost:1.5e9},
  {id:'volcano', ic:'🌋', nm:'Cookie Volcano',   pa:6e7,    cost:2.5e9},
  {id:'planet',  ic:'🪐', nm:'Cookie Planet',    pa:1.2e8,    cost:5e9},
  {id:'galaxy',  ic:'🌌', nm:'Cookie Galaxy',    pa:6.5e8,    cost:3e10},
  {id:'wizard',  ic:'🧙', nm:'Number Wizard',    pa:8.5e8,  cost:4e10},
  {id:'univ',    ic:'✨', nm:'Cookie Universe',  pa:3e9,  cost:1.5e11},
  {id:'dragon',  ic:'🐉', nm:'Cookie Dragon',    pa:1e10,    cost:5e11},
  {id:'golden',  ic:'🏆', nm:'THE GOLDEN COOKIE',pa:1e11,    cost:1e12, final:true},
];
const PRICE_UP = 1.15;   // each one you buy costs 15% more than the last
const BASE_ANSWER = 5;   // cookies for a right answer before any upgrades

const SAVE_KEY = 'megaCookie2';
// last = your last 10 first-go answers (1 right, 0 wrong). The maths progress: stage = the level you're on, st = each level's
// results, f = each times/dividing fact's results, days = answers per day, miss = recent mistakes, due = missed sums coming back,
// qn = sums asked. Starting again from 0 cookies keeps the maths progress (the grown-ups' report has its own reset).
const freshMaths = () => ({stage:0, st:{}, f:{}, days:{}, miss:[], due:[], qn:0});
const fresh = () => ({cookies:0, n:{}, right:0, asked:0, last:[], muted:false, won:false, ...freshMaths()});
let G = fresh();
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.cookies === 'number') G = Object.assign(G, s); } catch (e) {}
if (!G.asked) G.asked = G.right;   // saves from before v8
delete G.level;                    // saves from before v9 (the old levels 1–6 don't match the new ones)
function save(){ try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) {} }

const $ = id => document.getElementById(id);
const owned = it => G.n[it.id] || 0;
const price = it => Math.ceil(it.cost * Math.pow(PRICE_UP, owned(it)));
const CLICKS_PER_Q = 12; // clicks on the big cookie before each maths question
const perAns = () => ITEMS.reduce((t, it) => t + owned(it) * (it.pa || 0), BASE_ANSWER);   // what the shop adds up to
// ACC: how many of your last 10 answers were right. Until there are 10, the missing ones count as 80%.
// The multiplier goes 100% = ×2, 90% = ×1.5, 80% = ×1, 70% = ×0.75, 50% = ×0.35, guessing (33%) = ×0.15
const ACC_N = 10, QUICK = 5, QUICK_BONUS = .25;   // a right answer within QUICK seconds gets +25%
const acc = () => (G.last.reduce((t, v) => t + v, 0) + .8 * (ACC_N - G.last.length)) / ACC_N;
const accMult = () => Math.round((.1 + 1.9 * Math.pow(acc(), 3)) * 20) / 20;
const earnAns = () => Math.max(1, Math.round(perAns() * accMult()));   // cookies for a right answer
const perClick = () => Math.max(1, Math.round(earnAns() / 10));

// ---------- numbers ----------
const WORDS = [[1e21,'sextillion'],[1e18,'quintillion'],[1e15,'quadrillion'],[1e12,'trillion']];
function fmt(n){
  n = Math.floor(n);
  for (const [v, w] of WORDS) if (n >= v) {
    const a = n / v; return (a >= 100 ? Math.floor(a) : Math.floor(a * 10) / 10).toLocaleString('en') + ' ' + w;
  }
  return n.toLocaleString('en');
}
function fmtShort(n){ // for the shop cost labels
  if (n >= 1e12) return fmt(n);
  if (n >= 1e9) return +(n / 1e9).toFixed(1) + ' billion';
  if (n >= 1e6) return +(n / 1e6).toFixed(1) + ' million';
  return n.toLocaleString('en');
}

// ---------- sound (made with Web Audio, no files) ----------
let AC = null;
function ac(){ if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, t0, dur, type='square', vol=.08, f2){
  const a = ac(); if (!a || G.muted) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0;
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + .02);
}
let noiseBuf = null;
function crunch(){
  const a = ac(); if (!a || G.muted) return;
  if (!noiseBuf) { noiseBuf = a.createBuffer(1, a.sampleRate * .12, a.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2); }
  const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = .8 + Math.random() * .5;
  f.type = 'bandpass'; f.frequency.value = 1400 + Math.random() * 1400; f.Q.value = 1.2;
  g.gain.value = .5; s.connect(f).connect(g).connect(a.destination); s.start();
  tone(520 + Math.random() * 120, 0, .07, 'triangle', .05, 300); // little "pop"
}
const sBuy  = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * .07, .16, 'square', .06));
const sNope = () => tone(160, 0, .22, 'sawtooth', .07, 90);
const sWin  = () => [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, i * .14, .3, 'square', .07));

const sRight = () => { crunch(); tone(880, 0, .1, 'square', .05); tone(1320, .07, .14, 'square', .05); };
const sFast  = () => [1047, 1319, 1568].forEach((f, i) => tone(f, .1 + i * .05, .1, 'triangle', .06));
const sLevel = () => [523, 784, 1047, 1568].forEach((f, i) => tone(f, i * .09, .2, 'triangle', .08));

// ---------- maths levels ----------
// The sums come in levels, easiest first. You stay on a level until you've got it nailed (9 of your last 10 right first time,
// and for times tables / dividing: most of the facts seen and none you keep getting wrong). Then the next level unlocks.
// Older levels come back now and then as review (more often when the new level is going badly), and a sum you got wrong
// comes back a few questions later. Adding and taking away never go past two digits.
const STAGES = [
  {nm:'Adding up to 10',            kind:'add',   max:10},
  {nm:'Taking away from 10',        kind:'sub',   max:10},
  {nm:'Adding up to 20',            kind:'add',   max:20},
  {nm:'Taking away from 20',        kind:'sub',   max:20},
  {nm:'× 2 and × 10',               kind:'times', t:[2, 10]},
  {nm:'× 5',                        kind:'times', t:[5]},
  {nm:'÷ 2, ÷ 5 and ÷ 10',          kind:'div',   t:[2, 5, 10]},
  {nm:'Two-digit + and − (no carrying)',   kind:'add2'},
  {nm:'× 3 and × 4',                kind:'times', t:[3, 4]},
  {nm:'÷ 3 and ÷ 4',                kind:'div',   t:[3, 4]},
  {nm:'Two-digit + and − (with carrying)', kind:'add2c'},
  {nm:'× 6 and × 8',                kind:'times', t:[6, 8]},
  {nm:'÷ 6 and ÷ 8',                kind:'div',   t:[6, 8]},
  {nm:'× 7 and × 9',                kind:'times', t:[7, 9]},
  {nm:'÷ 7 and ÷ 9',                kind:'div',   t:[7, 9]},
  {nm:'× 11 and × 12',              kind:'times', t:[11, 12]},
  {nm:'÷ 11 and ÷ 12',              kind:'div',   t:[11, 12]},
  {nm:'Bigger times (like 14 × 6)', kind:'big'},
  {nm:'Bigger dividing (like 84 ÷ 6)', kind:'bigdiv'},
  {nm:'Champion mix: everything!',  kind:'mix'},
];
const LAST_STAGE = STAGES.length - 1;
const TABLES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], NS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const PASS_N = 10, PASS_RIGHT = 9;   // level up at 9 of the last 10 right first time
const REPEAT_AFTER = 3;              // a missed sum comes back this many questions later
const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pick = a => a[Math.floor(Math.random() * a.length)];
const sum = a => a.reduce((t, v) => t + v, 0);
function weighted(list, w){ const ws = list.map(w), tot = sum(ws); let r = Math.random() * tot; for (let i = 0; i < list.length; i++) if ((r -= ws[i]) < 0) return list[i]; return list[list.length - 1]; }

// times and dividing facts: x7_8 is 7 × 8 (the 7 times table), d7_8 is 56 ÷ 7 = 8
const factKey = (op, t, n) => (op === 'times' ? 'x' : 'd') + t + '_' + n;
const stageFacts = s => { const st = STAGES[s]; return st.t ? st.t.flatMap(t => NS.map(n => factKey(st.kind, t, n))) : []; };
const factStat = k => G.f[k] || {n:0, r:0, h:[]};
// how a fact is going: none (never asked), good (the last 3 all right), bad (mostly wrong), some (in between)
function factLevel(k){
  const f = G.f[k]; if (!f || !f.n) return 'none';
  const h = f.h.slice(-5), r = sum(h);
  if (f.n >= 2 && h.slice(-3).every(v => v)) return 'good';
  if (r / h.length < .34) return 'bad';
  return 'some';
}
const stageStat = s => G.st[s] || (G.st[s] = {n:0, r:0, ms:0, last:[]});
function factText(k){
  const op = k[0], [t, n] = k.slice(1).split('_').map(Number);
  return op === 'x' ? `${t} × ${n} = ${t * n}` : `${t * n} ÷ ${t} = ${n}`;
}

function gen(s){
  const st = STAGES[s];
  let a, b, q, ans, key = null, near = [1, -1, 2, -2, 10, -10];
  switch (st.kind) {
    case 'add': {
      if (st.max === 10) { ans = rnd(2, 10); a = rnd(1, ans - 1); }
      else { ans = rnd(11, 20); a = rnd(Math.max(1, ans - 10), Math.min(10, ans - 1)); if (Math.random() < .5) a = ans - a; }
      b = ans - a; q = `${a} + ${b}`; near = [1, -1, 2, -2, 3]; break;
    }
    case 'sub': {
      a = st.max === 10 ? rnd(3, 10) : rnd(11, 20); b = rnd(1, Math.min(a - 1, 10)); ans = a - b;
      q = `${a} − ${b}`; near = [1, -1, 2, -2, 3]; break;
    }
    case 'add2': case 'add2c': {
      const carry = st.kind === 'add2c', small = Math.random() < .3;   // sometimes a one-digit number
      if (Math.random() < .5) {   // adding, answer at most 99
        for (;;) {
          a = rnd(10, 89); b = small ? rnd(2, 9) : rnd(10, 89);
          if (a + b > 99) continue;
          if (((a % 10) + (b % 10) >= 10) === carry) break;
        }
        ans = a + b; q = `${a} + ${b}`;
      } else {                    // taking away
        for (;;) {
          a = rnd(20, 99); b = small ? rnd(2, 9) : rnd(10, a - 1);
          if (b >= a) continue;
          if (((b % 10) > (a % 10)) === carry) break;
        }
        ans = a - b; q = `${a} − ${b}`;
      }
      break;
    }
    case 'times': case 'div': {
      const fs = stageFacts(s);
      // pick the facts that need practice most: wrong ones, never-asked ones, wobbly ones; the solid ones less often
      key = weighted(fs, k => ({none:3, bad:5, some:3, good:1})[factLevel(k)]);
      return factQuestion(key, s);
    }
    case 'big': { a = rnd(11, 25); if (a % 10 === 0) a++; b = rnd(3, 9); ans = a * b; q = Math.random() < .5 ? `${a} × ${b}` : `${b} × ${a}`; near.push(b, -b, 10, -10); break; }
    case 'bigdiv': { b = rnd(3, 9); ans = rnd(11, 25); q = `${b * ans} ÷ ${b}`; break; }
    case 'mix': return gen(reviewStage(LAST_STAGE));
  }
  return {q, ans, key, s, opts:options(ans, near)};
}
function factQuestion(key, s){
  const op = key[0], [t, n] = key.slice(1).split('_').map(Number);
  let q, ans, near;
  if (op === 'x') { ans = t * n; q = Math.random() < .5 ? `${t} × ${n}` : `${n} × ${t}`; near = [t, -t, n, -n, 1, -1]; }
  else { ans = n; q = `${t * n} ÷ ${t}`; near = [1, -1, 2, -2]; }
  return {q, ans, key, s, opts:options(ans, near)};
}
// wrong answers that look tempting: off by one or two, off by ten, or a neighbour in the times table
function options(ans, near){
  const opts = new Set([ans]);
  let tries = 0;
  while (opts.size < 3 && tries++ < 50) { const w = ans + pick(near); if (w >= 0 && w !== ans) opts.add(w); }
  while (opts.size < 3) opts.add(ans + opts.size + 2);
  return [...opts].sort(() => Math.random() - .5);
}
// an easier level to review: ones that went badly come up more
function reviewStage(below){
  const ss = []; for (let i = 0; i < below; i++) ss.push(i);
  return weighted(ss, i => { const l = stageStat(i).last.slice(-PASS_N); return 1 + (l.length ? 6 * (1 - sum(l) / l.length) : 0); });
}
function struggling(){ const l = stageStat(G.stage).last.slice(-6); return l.length >= 5 && sum(l) <= l.length / 2; }
function pickQuestion(){
  const d = G.due.findIndex(x => x.at <= G.qn);   // a missed sum coming back
  if (d >= 0) { const {key, q, ans, s} = G.due.splice(d, 1)[0];
    return key ? factQuestion(key, s) : {q, ans, key, s, opts:options(ans, [1, -1, 2, -2, 10, -10])}; }
  const s = G.stage;
  if (s > 0 && STAGES[s].kind !== 'mix' && Math.random() < (struggling() ? .6 : .2)) return gen(reviewStage(s));
  return gen(s);
}
// has this level been learnt?
function stagePassed(s){
  const l = stageStat(s).last.slice(-PASS_N);
  if (l.length < PASS_N || sum(l) < PASS_RIGHT) return false;
  const fs = stageFacts(s); if (!fs.length) return true;
  const lv = fs.map(factLevel);
  return lv.filter(v => v !== 'none').length >= fs.length * .8 && !lv.includes('bad');
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// only the first go at a sum counts towards levels and the report
function recordFirst(Q, right, secs){
  G.qn++;
  const st = stageStat(Q.s); st.n++; st.r += right; st.ms += Math.round(Math.min(secs, 60) * 1000); st.last.push(right); if (st.last.length > 20) st.last.shift();
  if (Q.key) { const f = G.f[Q.key] = factStat(Q.key); f.n++; f.r += right; f.h.push(right); if (f.h.length > 8) f.h.shift(); }
  const d = G.days[today()] || (G.days[today()] = {n:0, r:0, ms:0}); d.n++; d.r += right; d.ms += Math.round(Math.min(secs, 60) * 1000);
}

// ---------- screen ----------
const countEl = $('count'), itemsEl = $('items');
function renderShop(){
  itemsEl.innerHTML = '';
  // the Golden Cookie goal sits at the top so you always know what you're aiming for
  for (const it of [ITEMS[ITEMS.length - 1], ...ITEMS.filter(it => !it.final).sort((a, b) => a.cost - b.cost)]) {
    const li = document.createElement('li');
    li.className = 'item' + (it.final ? ' final' : '');
    const what = `+${fmtShort(it.pa)}<small>per answer</small>`;
    li.innerHTML = `<div class="ic">${it.ic}</div><div><div class="nm">${it.nm}</div><div class="cost">🍪 <span></span></div></div><div class="fac">${what}</div><div class="bar"></div><div class="own"></div>`;
    li.addEventListener('click', () => buy(it, li));
    itemsEl.appendChild(li);
    it.el = li; it.bar = li.querySelector('.bar'); it.costEl = li.querySelector('.cost span'); it.ownEl = li.querySelector('.own');
  }
  update();
}
function update(){
  countEl.textContent = fmt(G.cookies);
  $('perAns').textContent = fmt(earnAns());
  const m = accMult(), n = G.last.length, good = G.last.reduce((t, v) => t + v, 0);
  $('accMult').textContent = `×${m} for getting them right`;
  $('acc').innerHTML = n ? `🎯 Last ${n}: <b>${Math.round(good / n * 100)}%</b> right <small>×${m} cookies</small>` : '🎯 Get sums right for more cookies!';
  $('acc').className = 'acc ' + (!n ? '' : good / n >= .9 ? 'great' : good / n >= .7 ? 'ok' : 'bad');
  $('perClick').textContent = '+' + fmt(perClick());
  for (const it of ITEMS) {
    const c = price(it), can = G.cookies >= c;
    it.costEl.textContent = fmtShort(c);
    it.ownEl.textContent = owned(it) || '';
    it.el.classList.toggle('can', can);
    it.el.classList.toggle('no', !can);
    it.bar.style.width = Math.min(100, G.cookies / c * 100) + '%';
  }
  $('goal').textContent = G.won ? '🏆 You got the Golden Cookie! Keep going forever!' :
    'Click the cookie, answer sums, buy things, then get THE GOLDEN COOKIE!';
  $('level').textContent = `Level ${G.stage + 1}: ${STAGES[G.stage].nm}`;
  const l = stageStat(G.stage).last.slice(-PASS_N);
  $('lvlUp').textContent = G.stage === LAST_STAGE ? '🏅 Top level!' : `⭐ ${Math.min(PASS_RIGHT, sum(l))}/${PASS_RIGHT} to level up`;
  $('streak').textContent = streak >= 3 ? `🔥 ${streak} in a row` : '';
  document.body.classList.toggle('golden', !!G.won);
}

// ---------- answering ----------
const answersEl = $('answers'), fx = $('fx');
let Q = null, qT = 0, streak = 0, locked = false;   // qT = seconds since the sum came up (no time limit)
function nextQuestion(){ showQuestion(pickQuestion()); }
// Q.tries = how many wrong goes at this sum so far: after a wrong one the same sum comes again until it's right
function showQuestion(q){
  Q = q; Q.tries = Q.tries || 0;
  if (Q.tries) Q.opts.sort(() => Math.random() - .5);
  qT = 0; locked = false;
  if (!Q.tries) $('hint').textContent = HINT;
  const qEl = $('question'); qEl.textContent = Q.q + ' = ?'; qEl.classList.remove('new'); void qEl.offsetWidth; qEl.classList.add('new');
  answersEl.classList.remove('locked');
  answersEl.innerHTML = '';
  Q.opts.forEach((v, i) => {
    const b = document.createElement('button');
    b.className = 'ans'; b.setAttribute('aria-label', 'Answer ' + v);
    b.innerHTML = `<svg viewBox="0 0 200 200" aria-hidden="true"><use href="#cookieArt"/></svg><b>${v}</b>`;
    b.addEventListener('pointerdown', e => { e.preventDefault(); answer(v, b, e.clientX, e.clientY); });
    b.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = b.getBoundingClientRect(); answer(v, b, r.left + r.width / 2, r.top + r.height / 3); } });
    answersEl.appendChild(b);
  });
}
function floatText(text, x, y, cls){
  const p = document.createElement('div');
  p.className = 'plus' + (cls ? ' ' + cls : ''); p.textContent = text;
  p.style.left = x + (Math.random() * 30 - 15) + 'px'; p.style.top = y + 'px';
  fx.appendChild(p); setTimeout(() => p.remove(), 900);
}
function lockThen(ms, then = startClicking){ locked = true; answersEl.classList.add('locked'); setTimeout(then, ms); }
function record(right){
  G.asked++; G.last.push(right ? 1 : 0); if (G.last.length > ACC_N) G.last.shift();
  recordFirst(Q, right ? 1 : 0, qT);
}
const HINT = 'Take your time and click the cookie with the right answer!';

// ---------- the fun bit: click the big cookie ----------
const cookieBtn = $('cookie');
let clicksLeft = CLICKS_PER_Q;
function showClicks(){
  $('toMaths').textContent = clicksLeft === 1 ? 'Maths challenge in 1 click!' : `Maths challenge in ${clicksLeft} clicks!`;
  $('toMathsBar').style.width = (1 - clicksLeft / CLICKS_PER_Q) * 100 + '%';
}
function startClicking(){
  clicksLeft = CLICKS_PER_Q; locked = true; Q = null;
  document.body.classList.remove('quizMode'); showClicks();
}
function clickCookie(x, y){
  if (document.body.classList.contains('quizMode')) return;
  const p = perClick();
  G.cookies += p; crunch();
  cookieBtn.classList.add('squish'); setTimeout(() => cookieBtn.classList.remove('squish'), 60);
  countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  floatText('+' + fmt(p), x, y);
  for (let i = 0; i < 5; i++) crumb(x, y);
  clicksLeft--; showClicks(); update();
  if (clicksLeft <= 0) {
    tone(660, 0, .1, 'square', .06); tone(990, .1, .18, 'square', .06);
    setTimeout(() => { document.body.classList.add('quizMode'); $('hint').textContent = HINT; nextQuestion(); }, 150);
  }
}
cookieBtn.addEventListener('pointerdown', e => { e.preventDefault(); clickCookie(e.clientX, e.clientY); });
cookieBtn.addEventListener('keydown', e => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); const r = cookieBtn.getBoundingClientRect(); clickCookie(r.left + r.width / 2, r.top + r.height / 3); }
});
function answer(v, btn, x, y){
  if (locked) return;
  const first = !Q.tries;
  if (v === Q.ans) {
    // first go: the full cookies (and a bonus if quick). Right after seeing the answer: a few cookies for getting it in the end.
    const base = first ? earnAns() : Math.max(1, Math.round(earnAns() / 4)), fast = first && qT < QUICK ? Math.round(base * QUICK_BONUS) : 0;
    G.cookies += base + fast; G.right++;
    if (first) { record(true); streak++; }
    sRight(); btn.classList.add('right');
    floatText('+' + fmt(base), x, y);
    if (!first) setTimeout(() => floatText('Got it! 👍', x, y - 40, 'fast'), 120);
    if (fast > 0) { setTimeout(() => floatText('+' + fmt(fast) + ' ⚡', x, y - 40, 'fast'), 120); sFast(); }
    for (let i = 0; i < 8; i++) crumb(x, y);
    if (first && G.stage < LAST_STAGE && stagePassed(G.stage)) {
      G.stage++; sLevel(); confetti();
      setTimeout(() => floatText('LEVEL ' + (G.stage + 1) + '!', innerWidth / 2, innerHeight / 2, 'fast'), 250);
      setTimeout(() => floatText(STAGES[G.stage].nm, innerWidth / 2, innerHeight / 2 + 50, 'fast'), 450);
    }
    if (G.right > 2) $('hint').classList.add('gone');
    lockThen(first ? 250 : 600);
  } else {
    if (first) {
      record(false);
      G.due.push({key:Q.key, q:Q.q, ans:Q.ans, s:Q.s, at:G.qn + REPEAT_AFTER});   // comes back a bit later to check it stuck
      G.miss.push({q:Q.q, ans:Q.ans, got:v, d:today()}); if (G.miss.length > 30) G.miss.shift();
    }
    Q.tries++;
    const lose = Math.min(G.cookies, perAns());
    G.cookies -= lose; streak = 0;
    sNope(); btn.classList.add('wrong');
    floatText(lose > 0 ? '−' + fmt(lose) : 'Oops!', x, y, 'bad');
    // show the right answer for a good while, then the same sum again until he gets it
    for (const b of answersEl.children) if (+b.querySelector('b').textContent === Q.ans) b.classList.add('right', 'show');
    const qEl = $('question'); qEl.textContent = Q.q + ' = ' + Q.ans; qEl.classList.add('reveal');
    $('hint').classList.remove('gone'); $('hint').textContent = `It's ${Q.ans}! Remember it… now you try!`;
    lockThen(2500, () => { qEl.classList.remove('reveal'); $('hint').textContent = 'Same one again: which cookie is ' + Q.q + '?'; showQuestion(Q); });
  }
  countEl.classList.remove('bump'); void countEl.offsetWidth; countEl.classList.add('bump');
  update(); save();
}
document.addEventListener('keydown', e => { // keys 1, 2, 3 pick a cookie
  const i = ['1', '2', '3'].indexOf(e.key); if (i < 0 || e.repeat || !Q) return;
  const b = answersEl.children[i]; if (!b) return;
  const r = b.getBoundingClientRect(); answer(Q.opts[i], b, r.left + r.width / 2, r.top + r.height / 3);
});

function fling(el, x, y, vx, vy, life, spin){
  fx.appendChild(el);
  let t = 0, r = Math.random() * 360; const t0 = performance.now();
  (function step(now){
    t = (now - t0) / 1000;
    el.style.transform = `translate(${x + vx * t}px,${y + vy * t + 900 * t * t}px) rotate(${r + spin * t}deg)`;
    el.style.opacity = Math.max(0, 1 - t / life);
    if (t < life) requestAnimationFrame(step); else el.remove();
  })(t0);
}
function crumb(x, y){
  const c = document.createElement('div');
  c.className = 'crumb' + (Math.random() < .35 ? ' c' : '');
  c.style.left = c.style.top = '0';
  const a = Math.random() * Math.PI * 2, s = 150 + Math.random() * 250;
  fling(c, x, y, Math.cos(a) * s, Math.sin(a) * s - 250, .7, 600);
}
function confetti(){
  const cols = ['#ff4f81', '#3ccf9a', '#4aa8ff', '#ffd23f', '#fff8ec', '#b56bff'];
  for (let i = 0; i < 120; i++) {
    const c = document.createElement('div'); c.className = 'conf';
    c.style.left = c.style.top = '0'; c.style.background = cols[i % cols.length];
    fling(c, Math.random() * innerWidth, -30 - Math.random() * 200, Math.random() * 200 - 100, Math.random() * 200, 3, 400);
  }
}


// ---------- buying ----------
function buy(it, li){
  const c = price(it);
  if (G.cookies < c) {
    sNope(); li.classList.remove('shake'); void li.offsetWidth; li.classList.add('shake'); return;
  }
  G.cookies -= c; G.n[it.id] = owned(it) + 1; save();
  const m = document.querySelector('.mult'); m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
  li.classList.remove('bought'); void li.offsetWidth; li.classList.add('bought');
  update();
  if (it.final && !G.won) {
    G.won = true; save(); update();
    sWin(); confetti(); setTimeout(confetti, 700);
    $('winPer').textContent = fmt(perAns()); $('win').hidden = false;
  } else sBuy();
}
$('winOk').addEventListener('click', () => { $('win').hidden = true; });

// ---------- report: times and dividing grids, and a page for grown-ups ----------
// Colours are picked for protan (red-green) colour blindness: "got it" is a teal (blue to him), "sometimes" a bright amber
// (yellow to him), "keeps getting it wrong" a dark crimson (dark to him), and "not asked yet" a pale grey. They differ in
// lightness and along the blue–yellow axis, not just red vs green, and every cell also has a symbol.
const LV = {good:['✓', 'Got it every time lately'], some:['~', 'Sometimes right'], bad:['✗', 'Keeps getting it wrong'], none:['', 'Not asked yet']};
let repTab = 'x';
function legend(){ return `<div class="legend">${Object.entries(LV).map(([k, [sym, t]]) => `<span><i class="c-${k}">${sym}</i>${t}</span>`).join('')}</div>`; }
function gridHTML(op){
  let h = `<div class="grid"><div class="gh corner">${op === 'x' ? '×' : '÷'}</div>`;
  for (const n of NS) h += `<div class="gh">${op === 'x' ? n : '=' + n}</div>`;
  for (const t of TABLES) {
    h += `<div class="gh row">${op === 'x' ? t + '×' : '÷' + t}</div>`;
    for (const n of NS) {
      const k = (op === 'x' ? 'x' : 'd') + t + '_' + n, lv = factLevel(k);
      h += `<button class="cell c-${lv}" data-k="${k}">${LV[lv][0]}</button>`;
    }
  }
  return h + '</div>';
}
function cellInfo(k){
  const f = factStat(k), lv = factLevel(k);
  if (!f.n) return `<b>${factText(k)}</b>: not asked yet.`;
  return `<b>${factText(k)}</b>: right first time ${f.r} of ${f.n} · lately ${f.h.slice(-5).map(v => v ? '✓' : '✗').join(' ')} · <i>${LV[lv][1]}</i>`;
}
const pct = (r, n) => n ? Math.round(r / n * 100) + '%' : '–';
const secs = (ms, n) => n ? (ms / n / 1000).toFixed(1) + 's' : '–';
function parentHTML(){
  const all = Object.values(G.st), n = sum(all.map(s => s.n)), r = sum(all.map(s => s.r)), ms = sum(all.map(s => s.ms));
  let h = `<p class="sum">Now on <b>Level ${G.stage + 1} of ${STAGES.length}: ${STAGES[G.stage].nm}</b>.<br>
    ${n} sums answered, <b>${pct(r, n)}</b> right first time, ${Math.round(ms / 60000)} min thinking time (${secs(ms, n)} a sum).<br>
    <small>Only the first go at each sum counts. A wrong answer shows the right one, then asks the same sum again until he gets it,
    and brings it back ${REPEAT_AFTER} sums later. A level is passed at ${PASS_RIGHT} of the last ${PASS_N} right first time
    (times / dividing levels also need 80% of their facts asked and none red).</small></p>`;
  // last 7 days
  const days = Object.keys(G.days).sort().slice(-7).reverse();
  if (days.length) {
    h += `<h3>Last few days</h3><table><tr><th>Day</th><th>Sums</th><th>Right first time</th><th>Time a sum</th></tr>`;
    for (const d of days) { const x = G.days[d]; h += `<tr><td>${new Date(d + 'T12:00').toLocaleDateString('en-GB', {weekday:'short', day:'numeric', month:'short'})}</td><td>${x.n}</td><td>${pct(x.r, x.n)}</td><td>${secs(x.ms, x.n)}</td></tr>`; }
    h += '</table>';
  }
  // the levels
  h += `<h3>Levels</h3><table class="levels"><tr><th>#</th><th>Level</th><th></th><th>Sums</th><th>Right first time</th><th>Last ${PASS_N}</th><th>Time a sum</th></tr>`;
  STAGES.forEach((stg, i) => {
    const s = G.st[i] || {n:0, r:0, ms:0, last:[]}, l = s.last.slice(-PASS_N);
    const state = i < G.stage ? '<span class="tag pass">passed</span>' : i === G.stage ? '<span class="tag now">now</span>' : '<span class="tag lock">not yet</span>';
    h += `<tr class="${i === G.stage ? 'cur' : ''}"><td>${i + 1}</td><td>${stg.nm}</td><td>${state}</td><td>${s.n}</td><td>${pct(s.r, s.n)}</td><td>${l.length ? sum(l) + '/' + l.length : '–'}</td><td>${secs(s.ms, s.n)}</td></tr>`;
  });
  h += '</table>';
  // what needs practice
  const weak = Object.keys(G.f).filter(k => ['bad', 'some'].includes(factLevel(k)))
    .sort((a, b) => (factLevel(a) === 'bad' ? 0 : 1) - (factLevel(b) === 'bad' ? 0 : 1) || factStat(a).r / factStat(a).n - factStat(b).r / factStat(b).n);
  h += `<h3>Facts to practise</h3>` + (weak.length ? `<div class="chips">${weak.slice(0, 24).map(k => `<span class="chip c-${factLevel(k)}">${LV[factLevel(k)][0]} ${factText(k)} <small>${factStat(k).r}/${factStat(k).n}</small></span>`).join('')}</div>` : '<p>None yet. 🎉</p>');
  if (G.miss.length) h += `<h3>Recent mistakes</h3><div class="chips">${G.miss.slice(-12).reverse().map(m => `<span class="chip">${m.q} = <b>${m.ans}</b> <small>(picked ${m.got})</small></span>`).join('')}</div>`;
  // controls
  h += `<h3>Settings</h3><p class="ctl"><label>Put him on level <select id="setLvl">${STAGES.map((s, i) => `<option value="${i}" ${i === G.stage ? 'selected' : ''}>${i + 1}: ${s.nm}</option>`).join('')}</select></label>
    <button id="clearMaths" class="small">Clear maths progress</button></p>`;
  return h;
}
function renderReport(){
  for (const b of document.querySelectorAll('#report .tabs button')) b.classList.toggle('on', b.dataset.t === repTab);
  const body = $('repBody');
  if (repTab === 'p') { body.innerHTML = parentHTML(); }
  else body.innerHTML = `<p class="sum">${repTab === 'x' ? 'The times tables: row = table, column = what it\'s times by.' : 'Dividing: row = what you divide by, column = the answer.'} Tap a square to see how it's going.</p>`
    + legend() + gridHTML(repTab) + `<p id="cellInfo" class="info">&nbsp;</p>`;
}
$('repBtn').addEventListener('click', () => { renderReport(); $('report').hidden = false; });
$('repClose').addEventListener('click', () => { $('report').hidden = true; update(); });
$('report').addEventListener('click', e => {
  const t = e.target.closest('.tabs button'); if (t) { repTab = t.dataset.t; renderReport(); return; }
  const c = e.target.closest('.cell'); if (c) { for (const x of document.querySelectorAll('.cell.sel')) x.classList.remove('sel'); c.classList.add('sel'); $('cellInfo').innerHTML = cellInfo(c.dataset.k); return; }
  if (e.target.id === 'clearMaths' && confirm('Clear all the maths levels and report? (Cookies and the shop stay.)')) { Object.assign(G, freshMaths()); save(); renderReport(); }
  if (e.target === $('report')) { $('report').hidden = true; update(); }
});
$('report').addEventListener('change', e => { if (e.target.id === 'setLvl') { G.stage = +e.target.value; save(); renderReport(); } });

// made-up progress for screenshots (?shot)
function fakeMaths(){
  Object.assign(G, freshMaths(), {stage:9});
  const skill = {2:.97, 10:.99, 5:.93, 3:.75, 4:.6};
  for (let i = 0; i < 400; i++) {
    const s = rnd(0, 9), q = gen(s), p = q.key ? (skill[+q.key.slice(1).split('_')[0]] || .5) * (q.key[0] === 'd' ? .9 : 1) : .9;
    recordFirst(q, Math.random() < p ? 1 : 0, 2 + Math.random() * 8);
  }
  G.miss = [{q:'7 × 4', ans:28, got:24, d:today()}, {q:'36 ÷ 4', ans:9, got:8, d:today()}, {q:'54 − 27', ans:27, got:37, d:today()}];
}

// ---------- buttons ----------
const muteBtn = $('mute');
function showMute(){ muteBtn.textContent = G.muted ? '🔇' : '🔊'; }
muteBtn.addEventListener('click', () => { G.muted = !G.muted; showMute(); save(); });
$('reset').addEventListener('click', () => {
  if (!confirm('Start again from 0 cookies? (Your maths levels stay.)')) return;
  const {stage, st, f, days, miss, due, qn} = G;
  G = Object.assign(fresh(), {muted:G.muted, stage, st, f, days, miss, due, qn}); streak = 0; save();
  $('hint').classList.remove('gone'); $('hint').textContent = 'Click the big cookie!'; update(); startClicking();
});

// ---------- every frame: the quick bonus bar (no time limit) ----------
let last = performance.now(), uiT = 0, saveT = 0;
function loop(now){
  const dt = Math.min(1, (now - last) / 1000); last = now;
  if (!locked && Q) qT += dt;
  const k = Math.max(0, 1 - qT / QUICK);
  $('timeBar').style.transform = `scaleX(${k})`; $('timer').classList.toggle('over', k <= 0);
  uiT += dt; saveT += dt;
  if (uiT > .1) { uiT = 0; update(); }
  if (saveT > 2) { saveT = 0; save(); }
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
addEventListener('pagehide', save);

// ?shot=N gives N cookies and a few items (for screenshots)
const shot = new URLSearchParams(location.search).get('shot');
if (shot) { G = Object.assign(fresh(), {cookies:+shot || 0, n:{pencil:3, fingers:8, chips:4, ruler:1}, right:20, asked:24, last:[1,1,0,1,1,1,1,0,1,1], muted:true}); streak = 5;
  fakeMaths(); $('hint').classList.add('gone'); }

showMute();
renderShop();
if (G.right > 2) $('hint').classList.add('gone');
if (new URLSearchParams(location.search).has('report')) { repTab = new URLSearchParams(location.search).get('report') || 'x'; renderReport(); $('report').hidden = false; }
if (new URLSearchParams(location.search).has('quiz')) { document.body.classList.add('quizMode'); nextQuestion(); } else startClicking();
requestAnimationFrame(loop);
