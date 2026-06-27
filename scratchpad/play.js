// Reusable headless harness for david/index.html
// Stubs DOM/canvas/audio, loads the game's <script>, then drives a competent
// player AI that aligns to targets, dodges boss charges, and picks 'pos' gates.
// Verifies: runtime errors == 0, and reports run outcome (win/fail + boss).
//
// Usage: node scratchpad/play.js [runs]
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'david', 'index.html'), 'utf8');
const m = [...HTML.matchAll(/<script>([\s\S]*?)<\/script>/g)];
const JS = m.map(x => x[1]).join('\n;\n');

const noop = () => {};
function makeCtx() {
  return new Proxy({}, { get(_, k) {
    if (k === 'canvas') return canvas;
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(4, (w|0)*(h|0)*4)) });
    if (k === 'putImageData') return noop;
    return noop;
  }, set() { return true; } });
}
const canvas = { width: 480, height: 854, style: {}, getContext: () => makeCtx(), addEventListener: noop,
  getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 854 }) };

function makeEl() {
  const el = { style: {}, dataset: {},
    classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
    addEventListener: noop, removeEventListener: noop, appendChild: noop, removeChild: noop,
    setAttribute: noop, removeAttribute: noop, getAttribute: () => null,
    textContent: '', innerHTML: '', value: '',
    querySelector: () => makeEl(), querySelectorAll: () => [],
    getContext: () => makeCtx(), getBoundingClientRect: () => ({ left: 0, top: 0, width: 480, height: 854 }),
    width: 480, height: 854, children: [], focus: noop, click: noop };
  return el;
}
function audioStub() {
  return {
    createOscillator: () => ({ connect: noop, start: noop, stop: noop, type: '',
      frequency: { value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop } }),
    createGain: () => ({ connect: noop, gain: { value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop } }),
    createBuffer: (ch, len) => ({ getChannelData: () => new Float32Array(len || 1), length: len || 1, duration: 0, numberOfChannels: ch || 1 }),
    createBufferSource: () => ({ connect: noop, start: noop, stop: noop, buffer: null }),
    createBiquadFilter: () => ({ connect: noop, frequency: { value: 0, setValueAtTime: noop }, type: '', Q: { value: 0 } }),
    destination: {}, currentTime: 0, sampleRate: 44100, resume: noop, state: 'running'
  };
}
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
global.document = { getElementById: id => (id === 'game' ? canvas : makeEl()), createElement: () => makeEl(),
  querySelector: () => makeEl(), querySelectorAll: () => [], addEventListener: noop, body: makeEl(), documentElement: { style: {} } };
global.window = { addEventListener: noop, removeEventListener: noop, requestAnimationFrame: () => 0,
  innerWidth: 480, innerHeight: 854, devicePixelRatio: 1, localStorage: global.localStorage,
  AudioContext: function () { return audioStub(); } };
global.window.webkitAudioContext = global.window.AudioContext;
global.AudioContext = global.window.AudioContext;
global.webkitAudioContext = global.window.AudioContext;
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.navigator = { userAgent: 'node' };
global.performance = { now: () => 0 };
global.OffscreenCanvas = function (w, h) { return { width: w, height: h, getContext: () => makeCtx() }; };

require('module')._compile = require('module').prototype._compile;
// eval the game script in this global context
(0, eval)(JS);

const game = global.window.__game || global.__game;
if (!game) { console.log('NO GAME OBJECT'); process.exit(1); }
const STAGES = game.stages || [{ name: 'level' }];

const VWg = 450;

// ---- competent player AI: returns desired x (gameplay coords) ----
// Key fact: wolves hold their x and the world scrolls toward them, so the
// survival strategy is to weave into a clear lane (no need to kill them).
const PADg = 28;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
function aiDesiredX(g) {
  const p = g.player, rs = g.rs;
  const lo = PADg + 18, hi = VWg - PADg - 18;

  // boss fight: align to boss, but dodge during windup/charge
  const b = g.boss;
  if (b && b.alive) {
    if (b.state === 'windup' || b.state === 'charge') {
      return b.tx < VWg / 2 ? hi : lo; // dodge away from charge target
    }
    return clamp(b.x, lo, hi); // line up shots
  }

  // Priority 1: a wolf about to contact us — dodge to the clearest lane.
  const threats = [];
  for (const w of g.wolves) {
    if (!w.alive) continue;
    const dy = w.worldY - p.worldY;
    if (dy > -36 && dy < 120) threats.push({ x: w.x, dy });
  }
  const imminent = threats.some(th => th.dy < 95 && Math.abs(th.x - p.x) < 48);
  if (imminent) {
    let bestX = VWg / 2, best = -1;
    for (let t = 0; t <= 24; t++) {
      const cx = lo + (hi - lo) * t / 24;
      let nearest = 1e9;
      for (const th of threats) { const d = Math.abs(cx - th.x); if (d < nearest) nearest = d; }
      const score = nearest - Math.abs(cx - p.x) * 0.05; // prefer clear & close
      if (score > best) { best = score; bestX = cx; }
    }
    return bestX;
  }

  // Priority 2: steer to the higher-DPS gate side (gates never hurt).
  let gate = null, gd = 1e9;
  for (const gt of g.gates) { if (gt.used) continue; const dy = gt.worldY - p.worldY; if (dy > -5 && dy < gd) { gd = dy; gate = gt; } }
  if (gate && gd < 280) {
    const dpsVal = side => {
      const fxs = Array.isArray(side.fx) ? side.fx : [side.fx];
      let v = 0;
      for (const f of fxs) {
        if (f.t === 'slingDamage') v += f.v * 1.0;
        else if (f.t === 'staffDamage') v += f.v * 0.5;
        else if (f.t === 'slingProjectiles') v += 6;     // more volume
        else if (f.t === 'slingCooldown' && f.op === 'mul') v += (1 - f.v) * 30;
        else if (f.t === 'stones') v += f.v * 0.1;
        else if (f.t === 'shield' || f.t === 'hp') v += 4; // survivability
      }
      if (side.tone === 'neg') v -= 1; // small penalty, risk gates still ok for dmg
      return v;
    };
    return dpsVal(gate.l) >= dpsVal(gate.r) ? VWg * 0.28 : VWg * 0.72;
  }

  // Priority 3: line up the nearest wolf ahead to shoot it for score/elite drops.
  let w = null, wd = 1e9;
  for (const ww of g.wolves) { if (!ww.alive) continue; const dy = ww.worldY - p.worldY; if (dy > 60 && dy < wd) { wd = dy; w = ww; } }
  if (w) return clamp(w.x, lo, hi);

  // Priority 4: grab a stone pile if low on ammo.
  if (rs.stones < rs.stoneMax * 0.5) {
    let s = null, sd = 1e9;
    for (const sp of g.stonePickups) { if (!sp.alive) continue; const dy = sp.worldY - p.worldY; if (dy > 0 && dy < sd && dy < 220) { sd = dy; s = sp; } }
    if (s) return clamp(s.x, lo, hi);
  }
  return VWg / 2;
}

function runOnce(maxFrames, stageIdx) {
  game.start(stageIdx);
  const dt = 1 / 60;
  let reachedBoss = false;
  for (let f = 0; f < maxFrames; f++) {
    if (game.boss) reachedBoss = true;
    // drive input: pointer steering toward AI target
    if (game.input) { game.input.pointer = true; game.input.px = aiDesiredX(game); }
    game.update(dt);
    game.render();
    const s = game.rs.status;
    if (s === 'win' || s === 'fail') {
      return { status: s, frames: f, score: game.rs.score, sheep: game.rs.sheep, hp: game.rs.hp, reachedBoss };
    }
  }
  return { status: game.rs.status, frames: maxFrames, score: game.rs.score, sheep: game.rs.sheep, hp: game.rs.hp, reachedBoss, capped: true };
}

const perStage = parseInt(process.argv[2] || '3', 10);
const nStages = STAGES.length;
let wins = 0, bossReached = 0, errors = 0, runs = 0;
try {
  for (let s = 0; s < nStages; s++) {
    for (let i = 0; i < perStage; i++) {
      const r = runOnce(60000, s); runs++;
      if (r.reachedBoss) bossReached++;
      if (r.status === 'win') wins++;
      const nm = STAGES[s].name;
      console.log(`stage ${s} (${nm}) run ${i + 1}: ${r.status.toUpperCase()} | frames ${r.frames} | score ${r.score} | sheep ${r.sheep} | hp ${r.hp} | boss ${r.reachedBoss ? 'reached' : 'no'}${r.capped ? ' | CAPPED' : ''}`);
    }
  }
} catch (e) {
  errors++;
  console.log('RUNTIME ERROR:', e.message);
  console.log(e.stack);
  process.exit(2);
}
const sv = game.save;
if (sv) {
  console.log(`\nSAVE: wallet ${JSON.stringify(sv.wallet)} | achievements ${sv.achievementsUnlocked.length} ${JSON.stringify(sv.achievementsUnlocked)}`);
  console.log(`      cleared ${JSON.stringify(sv.stagesCleared)} | bestPerStage ${JSON.stringify(sv.bestPerStage)} | totals ${JSON.stringify(sv.totals)}`);
  const raw = global.localStorage.getItem('david3d_save');
  console.log(`      persisted bytes: ${raw ? raw.length : 0}`);
}
console.log(`\nSUMMARY: ${runs} runs | wins ${wins}/${runs} | boss reached ${bossReached}/${runs} | runtime errors ${errors}`);
console.log(errors === 0 ? 'RUNTIME OK ✅' : 'RUNTIME FAIL ❌');
if (bossReached === 0) { console.log('WARN: boss never reached'); process.exit(3); }
