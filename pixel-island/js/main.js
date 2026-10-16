'use strict';
// ───────────── 主程式：輸入、互動、繪製、日夜、光影 ─────────────

const canvas = $('game');
const dctx = canvas.getContext('2d');
const buf = document.createElement('canvas');
const bctx = buf.getContext('2d');
const lc = document.createElement('canvas');
const lctx = lc.getContext('2d');
let img = null, buf32 = null;
let shakeAmt = 0;
const shake = (a) => { shakeAmt = Math.max(shakeAmt, a); };
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// ───── 畫面尺寸：低解析度緩衝區放大成像素風 ─────
function resize() {
  const W = innerWidth, H = innerHeight;
  const scale = clamp(Math.round(Math.min(W, H) / 190), 2, 7);
  const vw = Math.ceil(W / scale), vh = Math.ceil(H / scale);
  G.view = { w: vw, h: vh, scale };
  buf.width = vw; buf.height = vh; lc.width = vw; lc.height = vh;
  img = bctx.createImageData(vw, vh);
  buf32 = new Uint32Array(img.data.buffer);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = vw * scale * dpr; canvas.height = vh * scale * dpr;
  canvas.style.width = vw * scale + 'px'; canvas.style.height = vh * scale + 'px';
  G.view.k = scale * dpr;
  document.documentElement.style.setProperty('--px', scale + 'px');
}
addEventListener('resize', resize);

// ───── 鍵盤 ─────
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  KeyE: 'act', Space: 'act', Enter: 'act', KeyF: 'fish', KeyH: 'horn', KeyN: 'night', KeyJ: 'journal', KeyM: 'music', Escape: 'esc',
};
addEventListener('keydown', (e) => {
  const k = KEYMAP[e.code];
  if (!k) return;
  if (!G.started) { if (k === 'act') startGame(); return; }
  e.preventDefault();
  if (UI.dialogOpen) { if (k === 'act' || k === 'esc') UI.closeDialog(); return; }
  if (!$('journal').hidden && (k === 'esc' || k === 'journal')) { UI.toggleJournal(false); return; }
  if (!G.keys[k]) G.keyPressed[k] = true;
  G.keys[k] = true;
});
addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) G.keys[k] = false; });
addEventListener('blur', () => { G.keys = {}; });

function inputVec() {
  const k = G.keys;
  return { x: (k.right ? 1 : 0) - (k.left ? 1 : 0), y: (k.down ? 1 : 0) - (k.up ? 1 : 0) };
}

// ───── 點擊／觸控畫面 ─────
canvas.addEventListener('pointerdown', (e) => {
  Sound.init();
  if (!G.started || UI.dialogOpen) return;
  const r = canvas.getBoundingClientRect();
  const vx = (e.clientX - r.left) / G.view.scale, vy = (e.clientY - r.top) / G.view.scale;
  if (wishOnStar(vx, vy)) return;
  const wx = G.cam.x + vx, wy = G.cam.y + vy;
  if (G.mode === 'boat') {
    if (dist(wx, wy, G.boat.x, G.boat.y) < 14) { tryInteract(); return; }
    G.boat.auto = { x: wx, y: wy };
    spawn({ kind: 'ring', x: wx, y: wy, life: 0.6, r0: 1, r1: 6, col: '#ffffff' });
    return;
  }
  // 點到可互動的東西就走過去
  let target = null, bd = 14;
  const consider = (o, x, y) => { const d = dist(wx, wy, x, y); if (d < bd) { bd = d; target = { x: o.x, y: o.y + 4, obj: o }; } };
  for (const a of G.animals) if (!a.onBoat) consider(a, a.x, a.y - 5);
  for (const c of G.crabs) consider(c, c.x, c.y - 2);
  for (const p of World.props) consider(p, p.x, p.y - (p.spr ? p.spr.h / 2 : 8));
  for (const p of World.patches) consider(p, p.x, p.y);
  consider(G.boat, G.boat.x, G.boat.y);
  G.player.auto = target || { x: wx, y: wy };
  spawn({ kind: 'ring', x: G.player.auto.x, y: G.player.auto.y, life: 0.5, r0: 1, r1: 4, col: '#ffffff' });
});

// ───── 互動 ─────
function findLandingSpot() {
  const b = G.boat;
  for (const r of [12, 16, 20, 24, 28]) for (let k = 0; k < 16; k++) {
    const a = (k / 16) * TAU;
    const x = b.x + Math.cos(a) * r, y = b.y + Math.sin(a) * r;
    if (levelOf(tileAt(x, y)) === 0 && tileAt(x, y) !== T.STREAM && canStand(x, y, 0)) return { x, y };
  }
  return null;
}
function canFishHere() {
  if (G.mode === 'boat') return Math.abs(G.boat.speed) < 6;
  const p = G.player;
  const d = { down: [0, 1], up: [0, -1], side: [p.flip ? -1 : 1, 0] }[p.dir];
  const t = tileAt(p.x + d[0] * 16, p.y + d[1] * 16 - (p.dir === 'up' ? 4 : 0));
  return isSea(t) || t === T.POND;
}
function getInteraction() {
  if (G.mode === 'boat') {
    const spot = findLandingSpot();
    return spot ? { label: '靠岸下船', fn: () => disembark(spot) } : null;
  }
  const p = G.player;
  let best = null, bd = Infinity;
  const cand = (d, max, label, fn) => { if (d < max && d < bd) { bd = d; best = { label, fn }; } };
  for (const a of G.animals) {
    if (a.onBoat) continue;
    const treat = G.inv.fish > 0 ? '魚' : a.kind === 'sam' && G.inv.apple > 0 ? '蘋果' : null;
    cand(dist(p.x, p.y, a.x, a.y), 18, treat ? `餵${a.name}吃${treat}` : a.state === 'sleep' ? `輕輕摸${a.name}` : `摸摸${a.name}`, () => a.pet());
  }
  for (const c of G.crabs) if (c.hide <= 0) cand(dist(p.x, p.y, c.x, c.y), 14, '跟螃蟹打招呼', () => crabHello(c));
  cand(dist(p.x, p.y, G.boat.x, G.boat.y) - 4, 22, '上船', board);
  for (const o of World.props) {
    const d = dist(p.x, p.y, o.x, o.y);
    switch (o.kind) {
      case 'campfire': cand(d, 20, o.lit ? '熄滅營火' : '點燃營火', () => toggleFire(o)); break;
      case 'house': cand(dist(p.x, p.y, o.x + 1, o.y + 2), 18, '按門鈴', ringBell); break;
      case 'sign': cand(d, 16, '看告示牌', readSign); break;
      case 'tree': cand(d, 14, o.palm ? '搖椰子樹' : o.fruit ? '摘蘋果' : '搖搖樹', () => shakeTree(o)); break;
      case 'lighthouse': cand(d, 22, '登上燈塔眺望', () => climbLighthouse(o)); break;
      case 'rock': if (!o.sea) cand(d, 12, '翻翻石頭', () => flipRock(o)); break;
    }
  }
  for (const pt of World.patches) cand(dist(p.x, p.y, pt.x, pt.y), 14, '聞聞花香', () => smellFlowers(pt));
  const pond = World.feature.pond;
  cand(dist(p.x, p.y, pond.x, pond.y) - pond.r + 2, 12, '在瀑布下玩水', playWater);
  return best;
}
function tryInteract() {
  const it = getInteraction();
  if (it) it.fn();
}

function board() {
  cancelFishing();
  G.mode = 'boat';
  G.player.auto = null;
  G.boat.passengers = [];
  for (const a of G.animals) {
    if (a.follow > 0 && dist(a.x, a.y, G.player.x, G.player.y) < 60 && G.boat.passengers.length < 3) {
      a.onBoat = true; a.state = 'idle'; G.boat.passengers.push(a);
    }
  }
  Sound.play('splash', 0.12);
  if (G.boat.passengers.length) { toast(`⛵ ${G.boat.passengers.map((a) => a.name).join('、')}也跳上船了！`); G.boat.passengers.forEach((a) => Sound.play(a.sound)); }
  else toast('⛵ 上船囉！←→ 轉舵，↑ 加速，↓ 減速');
}
function disembark(spot) {
  cancelFishing();
  G.mode = 'walk';
  const b = G.boat;
  G.player.x = spot.x; G.player.y = spot.y; G.player.dir = 'down';
  b.speed = 0; b.auto = null;
  b.passengers.forEach((a, i) => {
    a.onBoat = false;
    let ok = false;
    for (let r = 4; r < 20 && !ok; r += 3) for (let k = 0; k < 8 && !ok; k++) {
      const x = spot.x + Math.cos(k + i) * r, y = spot.y + Math.sin(k + i) * r;
      if (canStand(x, y, 0)) { a.x = x; a.y = y; ok = true; }
    }
    if (!ok) { a.x = spot.x; a.y = spot.y; }
    a.follow = Math.max(a.follow, 25);
  });
  b.passengers = [];
  Sound.play('step', true);
}
function toggleFire(f) {
  f.lit = !f.lit;
  if (f.lit) { Sound.play('ignite'); burst(f.x, f.y - 3, 14, { col: '#ffd040', speed: 14, up: 20, g: -10, life: 1, glow: true }); toast('🔥 營火燒起來了，夜裡動物們會聚過來'); }
  else { Sound.play('splash', 0.15); for (let i = 0; i < 12; i++) spawn({ x: f.x + rand(-2, 2), y: f.y - 2, vz: rand(8, 16), vx: rand(-3, 3), life: rand(1, 2), col: pick(['#9a9a9a', '#c8c8c8']) }); toast('營火熄滅了'); }
}
function ringBell() {
  Sound.play('bell');
  const cat = G.animals.find((a) => a.kind === 'cat');
  if (cat && !cat.onBoat && dist(cat.x, cat.y, World.house.x, World.house.y) < 260) {
    cat.state = 'walk'; cat.tx = World.house.x + 10; cat.ty = World.house.y + 10; cat.follow = 0;
    setTimeout(() => Sound.play('meow'), 700);
    toast('🔔 叮咚～屋裡沒人，但貓咪聽到鈴聲跑回家了');
  } else toast('🔔 叮咚～屋子裡靜悄悄的');
  spawn({ kind: 'spr', spr: SPR.note, x: World.house.x + 6, y: World.house.y - 14, vz: 8, vx: 4, life: 1.4 });
}
function readSign() {
  Sound.play('click');
  UI.dialog('🪧', '歡迎來到像素小島', `
    這裡住著<b>貓咪</b>、<b>狐狸</b>和<b>薩摩耶</b>。<br>
    北邊的高台上有小河流成<b>瀑布</b>，從東邊的石階可以爬上去。<br>
    碼頭停著你的小船，開出海可能會遇見海豚、鯨魚、海龜…<br>
    東北方的小島上有一座<b>燈塔</b>。<br><br>
    <small>— 島主 敬上（目前出海中）</small>`);
}
function shakeTree(o) {
  o.shake = 0.6;
  Sound.play('leaves');
  const top = o.y - o.spr.h + 6;
  for (let i = 0; i < 10; i++) spawn({ x: o.x + rand(-7, 7), y: o.y, z: o.spr.h - rand(4, 12), vx: rand(-6, 6), vz: rand(-2, 4), g: 18, life: rand(1, 2.2), col: o.palm ? '#5ab040' : pick(['#62bb46', '#8fdc5a', '#4a9c3a']) });
  const now = G.t;
  if ((o.cool || 0) > now) { if (!o.palm && !o.fruit && Math.random() < 0.3) Sound.play('bird'); return; }
  o.cool = now + 10;
  if (o.fruit) {
    spawn({ kind: 'spr', spr: SPR.apple, x: o.x + rand(-5, 5), y: o.y + 3, z: 14, vz: 0, g: 120, life: 1.2, land: () => { Sound.play('coconut'); } });
    G.inv.apple++; saveInv();
    toast('🍎 掉下一顆蘋果！（薩摩耶最喜歡）');
  } else if (o.palm) {
    spawn({ x: o.x + 2, y: o.y + 3, z: 18, g: 140, life: 1.2, col: '#7a5228', size: 2, land: () => { Sound.play('coconut'); shake(1); } });
    toast('🥥 咚！椰子掉下來了');
  } else if (Math.random() < 0.45) {
    Sound.play('bird');
    for (let i = 0; i < 2; i++) spawn({ kind: 'spr', spr: SPR.gull[i % 2], x: o.x, y: top, z: 6, vx: rand(20, 40) * (Math.random() < 0.5 ? -1 : 1), vz: 22, life: 2 });
    toast('🐦 幾隻小鳥從樹上飛走了');
  } else if (Math.random() < 0.3) {
    G.inv.coins++; saveInv(); Sound.play('coin'); toast('🪙 樹上掉下一枚金幣？！');
  }
}
function climbLighthouse(o) {
  if ((o.cool || 0) > G.t) { toast('🗼 海風好舒服…剛剛已經看過一圈了'); return; }
  o.cool = G.t + 20;
  Sound.play('bell');
  const sea = EVENTS.filter((e) => e.make && !(e.day && G.env.dark > 0.5));
  const e = pick(sea);
  if (triggerEvent(e.id)) toast('🗼 你在燈塔頂端眺望，發現了海上的動靜！');
  else toast('🗼 海面一片平靜');
}
function flipRock(o) {
  if ((o.cool || 0) > G.t) { toast('石頭底下已經翻過了'); return; }
  o.cool = G.t + 30;
  Sound.play('bump');
  const r = Math.random();
  if (r < 0.3) { G.inv.coins += 2; saveInv(); Sound.play('coin'); toast('🪙 石頭底下藏著兩枚金幣！'); }
  else if (r < 0.6) { burst(o.x, o.y, 6, { col: '#2a2a2a', speed: 20, up: 2, g: 10, life: 1.2 }); toast('🐜 一群小蟲慌張地跑走了'); }
  else toast('石頭底下什麼都沒有，只有涼涼的泥土');
}
function smellFlowers(pt) {
  Sound.play('sniff');
  for (let i = 0; i < 12; i++) spawn({ x: pt.x + rand(-8, 8), y: pt.y + rand(-4, 4), z: 2, vz: rand(6, 14), vx: rand(-8, 8), life: rand(1.2, 2), col: pt.col, drag: 0.5 });
  if (G.env.dark > 0.5) { for (let i = 0; i < 6; i++) G.critters.push(makeCritter(pt.x + rand(-8, 8), pt.y, 'firefly')); toast('✨ 花叢裡飛出了螢火蟲'); }
  else { for (let i = 0; i < 2; i++) G.critters.push(makeCritter(pt.x, pt.y, 'butterfly')); toast(pick(['🌸 好香～', '🌼 有蜜蜂嗡嗡飛過', '🌷 花瓣隨風飄起'])); }
}
function playWater() {
  const pond = World.feature.pond;
  Sound.play('splash', 0.3);
  splashAt(lerp(G.player.x, pond.x, 0.5), lerp(G.player.y, pond.y, 0.5), 16, true);
  toast(pick(['💦 瀑布的水好清涼！', '💦 水花濺了一身', '💦 水潭裡有小魚游過']));
  const sam = G.animals.find((a) => a.kind === 'sam' && !a.onBoat && dist(a.x, a.y, G.player.x, G.player.y) < 40);
  if (sam) setTimeout(() => { Sound.play('woof'); burst(sam.x, sam.y - 5, 18, { col: '#c8ecff', speed: 26, up: 10, g: 60, life: 0.7 }); toast('🐶 薩摩耶也跳下水，然後用力甩乾毛！'); }, 800);
}
function crabHello(c) {
  Sound.play('crab');
  c.hide = 4;
  burst(c.x, c.y, 6, { col: '#e4c686', speed: 10, up: 10, g: 80, life: 0.5 });
  toast('🦀 螃蟹揮揮鉗子，咻地鑽進沙裡');
}
function horn() {
  if (G.mode === 'boat') {
    Sound.play('horn');
    for (const a of G.animals) if (a.kind === 'sam' && !a.onBoat && dist(a.x, a.y, G.boat.x, G.boat.y) < 220) setTimeout(() => Sound.play('woof'), 900);
  } else {
    Sound.play('whistle');
    let n = 0;
    for (const a of G.animals) if (!a.onBoat && a.trust >= 1 && a.state !== 'sleep' && dist(a.x, a.y, G.player.x, G.player.y) < 200) { a.follow = Math.max(a.follow, 20); n++; }
    toast(n ? '🎶 吹了聲口哨，動物們跑過來了' : '🎶 吹了聲口哨');
  }
}

// ───── 日夜 ─────
function darkness(h) {
  if (h >= 6.5 && h < 17.5) return 0;
  if (h >= 17.5 && h < 20) return smooth(17.5, 20, h);
  if (h >= 20 || h < 4.5) return 1;
  return 1 - smooth(4.5, 6.5, h);
}
function toggleDayNight() {
  Sound.play('click');
  G.warpTo = G.env.dark > 0.5 ? 7.5 : 21;
}
function updateTime(dt) {
  if (G.warpTo !== null) {
    const rate = 7;
    const rem = (G.warpTo - G.hour + 24) % 24;
    if (rem < dt * rate) { G.hour = G.warpTo; G.warpTo = null; } else G.hour = (G.hour + dt * rate) % 24;
  } else G.hour = (G.hour + dt * 0.1) % 24;
  const h = G.hour;
  G.env.dark = darkness(h);
  G.env.dusk = Math.max(0, 1 - Math.abs(h - 18.6) / 1.4) + Math.max(0, 1 - Math.abs(h - 5.6) / 1.2);
  G.env.bio = G.ev.bio > 0 && G.env.dark > 0.4;
  Sound.setMood(G.env.dark > 0.5 ? 'night' : 'day');
}

// ───── 主迴圈：更新 ─────
let ambT = 0, mapT = 0;
function update(dt) {
  G.t += dt;
  updateTime(dt);
  const inp = (G.started && !UI.dialogOpen) ? inputVec() : { x: 0, y: 0 };
  const kp = G.keyPressed;
  if (G.started && !UI.dialogOpen) {
    if (kp.act) { if (G.fishing && G.fishing.state === 'bite') reelIn(); else tryInteract(); }
    if (kp.fish) startFishing();
    if (kp.horn) horn();
    if (kp.night) toggleDayNight();
    if (kp.journal) UI.toggleJournal();
    if (kp.music) $('btn-music').click();
  }
  G.keyPressed = {};

  if (G.mode === 'walk') G.player.update(dt, inp);
  G.boat.update(dt, inp, G.mode === 'boat');
  for (const a of G.animals) a.update(dt);
  for (const c of G.crabs) c.update(dt);
  for (const o of World.props) if (o.shake > 0) o.shake -= dt;
  updateEvents(dt);
  updateFishing(dt);
  updateParticles(dt);
  updateCritters(dt);
  for (let i = G.footprints.length - 1; i >= 0; i--) if ((G.footprints[i].life -= dt) <= 0) G.footprints.splice(i, 1);

  // 營火火星、煙囪炊煙
  const fire = World.fire;
  if (fire.lit && Math.random() < dt * 6) spawn({ x: fire.x + rand(-2, 2), y: fire.y - 4, z: 2, vz: rand(10, 20), vx: rand(-3, 3), life: rand(0.6, 1.2), col: pick(['#ffd040', '#ff8a30']), glow: true });
  if (Math.random() < dt * 1.5) { const h = World.house; spawn({ x: h.x + 9 + rand(-1, 1), y: h.y - 2, z: 32, vz: rand(4, 7), vx: rand(2, 5), life: rand(2, 3.5), col: pick(['#d8d8d8', '#c0c0c0', '#e8e8e8']), size: 2 }); }

  // 鏡頭
  const tgt = G.mode === 'boat' ? G.boat : G.player;
  const lead = G.mode === 'boat' ? G.boat.speed * 0.7 : 0;
  const tx = tgt.x + Math.cos(G.boat.angle) * lead - G.view.w / 2, ty = tgt.y + Math.sin(G.boat.angle) * lead - G.view.h / 2;
  const k = Math.min(1, dt * 4);
  G.cam.x = clamp(lerp(G.cam.x, tx, k), -20, WORLD_W - G.view.w + 20);
  G.cam.y = clamp(lerp(G.cam.y, ty, k), -20, WORLD_H - G.view.h + 20);
  shakeAmt = Math.max(0, shakeAmt - dt * 8);
  flash = Math.max(0, flash - dt * 2);

  // 環境音量
  const me = G.mode === 'boat' ? G.boat : G.player;
  const F = World.feature;
  Sound.setAmbient('waterfall', clamp(1 - dist(me.x, me.y, F.wfX, F.pond.y - 10) / 170, 0, 1) * 0.32);
  Sound.setAmbient('rain', G.ev.rain > 0 ? 0.22 : 0);
  ambT -= dt;
  if (ambT <= 0) {
    ambT = rand(0.4, 1.4);
    if (G.env.dark > 0.6 && G.mode === 'walk' && Math.random() < 0.7) Sound.play('cricket');
    if (G.env.dark < 0.3 && G.ev.rain <= 0 && Math.random() < 0.15) Sound.play('bird');
    if (fire.lit && dist(me.x, me.y, fire.x, fire.y) < 80) { for (let i = 0; i < 3; i++) setTimeout(() => Sound.play('crackle'), rand(600)); }
  }

  // 介面
  if (G.started) {
    const it = getInteraction();
    const keyA = isTouch ? 'Ⓐ' : 'E', keyB = isTouch ? 'Ⓑ' : 'F';
    let txt = it ? `<kbd>${keyA}</kbd> ${it.label}` : '';
    if (G.fishing) txt = G.fishing.state === 'bite' ? `<kbd>${keyA}</kbd> <b>快拉竿！</b>` : `<kbd>${keyB}</kbd> 收竿　🎣 等待中…`;
    else if (canFishHere()) txt += `${txt ? '　' : ''}<kbd>${keyB}</kbd> 釣魚`;
    if (G.mode === 'boat' && !it && !G.fishing && Math.abs(G.boat.speed) < 1) txt = txt || '方向鍵掌舵出航';
    UI.setPrompt(txt);
    $('prompt').style.bottom = `calc(${G.mode === 'boat' ? 40 * G.view.scale : 14}px + env(safe-area-inset-bottom, 0px))`;
  }
  const hh = Math.floor(G.hour), mm = Math.floor((G.hour % 1) * 60);
  const icon = G.ev.rain > 0 ? '🌧️' : G.ev.fog > 0 ? '🌫️' : G.env.dark > 0.5 ? '🌙' : G.env.dusk > 0.3 ? '🌅' : '☀️';
  $('clock').textContent = `${icon} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('btn-time').textContent = G.env.dark > 0.5 ? '☀️' : '🌙';
  mapT -= dt;
  if (mapT <= 0) { mapT = 0.25; drawMinimap(); }
}

// ───── 繪製 ─────
const _tint = {};
function tintCircle(r, col) {
  r = Math.max(1, Math.round(r));
  const key = r + col;
  if (_tint[key]) return _tint[key];
  const c = document.createElement('canvas'); c.width = c.height = r * 2 + 1;
  const x = c.getContext('2d'); x.drawImage(pixelCircle(r), 0, 0); x.globalCompositeOperation = 'source-in'; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height);
  _tint[key] = c;
  return c;
}
const EMIT_COL = ['#fff8d0', '#7ff8ff', '#c8d8ff'];

function render() {
  const { w, h } = G.view;
  const cx = Math.round(G.cam.x), cy = Math.round(G.cam.y);
  G.lights = [];
  const emissive = [];
  renderTerrain(buf32, w, h, cx, cy, G.t, G.env, emissive);
  bctx.putImageData(img, 0, 0);
  bctx.save();
  bctx.translate(-cx, -cy);
  const dark = G.env.dark;

  // 地面層
  bctx.fillStyle = 'rgba(150,110,60,0.55)';
  for (const f of G.footprints) if (inView(f.x, f.y)) { bctx.globalAlpha = Math.min(1, f.life / 4) * 0.6; bctx.fillRect(f.x, f.y, 1, 1); }
  bctx.globalAlpha = 1;
  const dk = World.feature.dock;
  for (let y = dk.y0 + 8; y <= dk.y1; y += 8) for (const sx of [-4, 4]) drawSpr(bctx, SPR.post, dk.x + sx + (sx > 0 ? 0 : -1) + (y > dk.y1 - 8 ? sx : 0), y + 2);
  for (const c of G.creatures) c.drawUnder(bctx);
  for (const f of World.flowers) {
    if (!inView(f.x, f.y)) continue;
    const sway = Math.sin(G.t * 2 + f.ph) > 0.6 ? 1 : 0;
    bctx.fillStyle = '#3a8a2a'; bctx.fillRect(f.x, f.y, 1, 1);
    bctx.fillStyle = f.col; bctx.fillRect(f.x + sway, f.y - 1, 1, 1);
  }
  // 瀑布底下的小彩虹（晴天白天）
  if (dark < 0.2 && G.ev.rain <= 0 && G.ev.fog <= 0) {
    const pond = World.feature.pond;
    const cols = ['#ff6a6a', '#ffd04a', '#6ad06a', '#6aa8ff'];
    bctx.globalAlpha = 0.28;
    cols.forEach((col, i) => { bctx.fillStyle = col; for (let a = 0.15; a < Math.PI - 0.15; a += 0.07) bctx.fillRect(Math.round(pond.x + Math.cos(a) * (14 - i)), Math.round(pond.y - 4 - Math.sin(a) * (10 - i)), 1, 1); });
    bctx.globalAlpha = 1;
  }

  // 依 y 排序的物件
  const list = [];
  for (const o of World.props) {
    if (!inView(o.x, o.y, 50)) continue;
    list.push({ y: o.y, d: () => drawProp(o) });
  }
  for (const a of G.animals) if (!a.onBoat && inView(a.x, a.y, 20)) list.push({ y: a.y, d: () => a.draw(bctx) });
  for (const c of G.crabs) if (inView(c.x, c.y, 10)) list.push({ y: c.y, d: () => c.draw(bctx) });
  if (G.mode === 'walk') list.push({ y: G.player.y, d: () => G.player.draw(bctx) });
  list.push({ y: G.boat.y + 4, d: () => G.boat.draw(bctx) });
  for (const c of G.creatures) list.push({ y: c.y, d: () => c.drawOver(bctx) });
  list.sort((a, b) => a.y - b.y);
  for (const it of list) it.d();

  drawFishingLine();
  drawParticles(bctx, false);
  drawCritters(bctx, false);
  for (const c of G.creatures) c.drawAir(bctx);
  bctx.restore();

  // 光源
  const fire = World.fire;
  if (fire.lit) G.lights.push({ x: fire.x, y: fire.y - 3, r: 44 + Math.sin(G.t * 9) * 2 + Math.sin(G.t * 23), a: 1, warm: '#ff9a40' });
  if (dark > 0.25) { const hs = World.house; G.lights.push({ x: hs.x - 8, y: hs.y - 10, r: 12, a: 0.8, warm: '#ffd56a' }, { x: hs.x + 10, y: hs.y - 10, r: 12, a: 0.8, warm: '#ffd56a' }); }
  const b = G.boat;
  G.lights.push({ x: b.x + Math.cos(b.angle) * 7, y: b.y + Math.sin(b.angle) * 7, r: 24, a: 0.85, warm: '#ffd56a' });
  if (G.mode === 'walk') G.lights.push({ x: G.player.x, y: G.player.y - 4, r: 20, a: 0.55, warm: null });
  const lh = World.props.find((o) => o.kind === 'lighthouse');
  G.lights.push({ x: lh.x, y: lh.y - 38, r: 18, a: 1, warm: '#fff0a0' });

  for (const c of G.critters) if (c.type === 'firefly' && Math.sin(c.ph * 3) > -0.2) G.lights.push({ x: c.x, y: c.y, r: 3, a: 0.6, warm: null });
  drawLighting(cx, cy);

  // 自發光（光照層之上）
  bctx.save();
  for (let i = 0; i < emissive.length; i += 3) { bctx.fillStyle = EMIT_COL[emissive[i + 2]]; bctx.fillRect(emissive[i], emissive[i + 1], 1, 1); }
  bctx.translate(-cx, -cy);
  drawParticles(bctx, true);
  drawCritters(bctx, true);
  if (inView(fire.x, fire.y, 10)) {
    drawSpr(bctx, SPR.fireLogs, fire.x, fire.y + 1);
    if (fire.lit) drawSpr(bctx, SPR.flames[Math.floor(G.t * 8) % 3], fire.x, fire.y - 1);
  }
  if (dark > 0.3) { bctx.fillStyle = '#fff4b0'; bctx.fillRect(lh.x - 2, lh.y - 40, 5, 5); bctx.fillStyle = '#ffd56a'; bctx.fillRect(Math.round(b.x + Math.cos(b.angle) * 7), Math.round(b.y + Math.sin(b.angle) * 7) - 1, 2, 2); }
  bctx.restore();

  drawScreenFx(w, h);
  if (G.mode === 'boat') drawWheel(bctx, Math.round(w / 2), h - 18, G.boat.rudder * 2.6, G.boat.speed);

  // 放大到螢幕
  const k = G.view.k;
  dctx.imageSmoothingEnabled = false;
  const sx = shakeAmt ? Math.round(rand(-shakeAmt, shakeAmt)) * k : 0, sy = shakeAmt ? Math.round(rand(-shakeAmt, shakeAmt)) * k : 0;
  dctx.fillStyle = '#163f72'; dctx.fillRect(0, 0, canvas.width, canvas.height);
  dctx.drawImage(buf, sx, sy, w * k, h * k);
}

function drawProp(o) {
  switch (o.kind) {
    case 'tree': {
      const jit = o.shake > 0 ? Math.round(Math.sin(G.t * 50)) : 0;
      bctx.fillStyle = 'rgba(0,0,0,0.2)'; bctx.fillRect(o.x - 6, o.y, 12, 2);
      drawSpr(bctx, o.spr, o.x + jit, o.y + 2);
      break;
    }
    case 'rock': drawSpr(bctx, o.spr, o.x, o.y + 2); if (o.sea && Math.sin(G.t * 2 + o.x) > 0.7) { bctx.fillStyle = '#eefaff'; bctx.fillRect(o.x - 7, o.y + 1, 2, 1); bctx.fillRect(o.x + 5, o.y + 1, 2, 1); } break;
    case 'house': drawSpr(bctx, G.env.dark > 0.25 ? SPR.houseNight : SPR.house, o.x, o.y + 2); break;
    case 'sign': drawSpr(bctx, SPR.sign, o.x, o.y + 1); break;
    case 'lighthouse': drawSpr(bctx, SPR.lighthouse, o.x, o.y + 4); break;
    case 'campfire': break; // 在發光層畫
  }
}

function drawFishingLine() {
  const f = G.fishing;
  if (!f) return;
  let rx, ry;
  if (G.mode === 'boat') { const p = G.boat.seatPos(0); rx = p.x; ry = p.y - 6; }
  else { const p = G.player; rx = p.x + (p.dir === 'side' ? (p.flip ? -5 : 5) : 3); ry = p.y - 9; }
  const dip = f.state === 'bite' && Math.sin(G.t * 30) > 0 ? 1 : 0;
  const bob = Math.sin(G.t * 3) > 0.5 ? 1 : 0;
  bctx.fillStyle = 'rgba(255,255,255,0.7)';
  const n = 20;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const x = lerp(rx, f.bx, u), y = lerp(ry, f.by, u) - Math.sin(u * Math.PI) * 6 + u * u * 4;
    bctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }
  bctx.fillStyle = '#7a4a26'; bctx.fillRect(Math.round(rx) - 1, Math.round(ry) - 1, 2, 1);
  bctx.fillStyle = '#ff4040'; bctx.fillRect(Math.round(f.bx), Math.round(f.by) - 1 + dip + bob, 2, 1);
  bctx.fillStyle = '#ffffff'; bctx.fillRect(Math.round(f.bx), Math.round(f.by) + dip + bob, 2, 1);
}

function drawLighting(cx, cy) {
  const { w, h } = G.view;
  const dark = G.env.dark, dusk = G.env.dusk;
  if (dusk > 0.02) { bctx.fillStyle = `rgba(255,120,70,${0.16 * Math.min(1, dusk)})`; bctx.fillRect(0, 0, w, h); }
  const rainDim = G.ev.rain > 0 ? 0.28 : 0;
  const alpha = Math.min(0.84, dark * 0.74 + rainDim * (1 - dark * 0.5));
  if (alpha < 0.02) return;
  lctx.globalCompositeOperation = 'source-over';
  lctx.globalAlpha = 1;
  lctx.clearRect(0, 0, w, h);
  lctx.fillStyle = dark > 0.1 ? `rgba(8,14,44,${alpha})` : `rgba(40,50,70,${alpha})`;
  lctx.fillRect(0, 0, w, h);
  lctx.globalCompositeOperation = 'destination-out';
  for (const L of G.lights) {
    const x = L.x - cx, y = L.y - cy;
    if (x < -L.r || y < -L.r || x > w + L.r || y > h + L.r) continue;
    for (let s = 0; s < 3; s++) {
      const r = L.r * (1 - s * 0.3);
      lctx.globalAlpha = L.a * 0.42;
      lctx.drawImage(pixelCircle(r), Math.round(x - r), Math.round(y - r));
    }
  }
  // 燈塔旋轉光束
  const lh = World.props.find((o) => o.kind === 'lighthouse');
  const beamA = G.t * 0.7;
  const lx = lh.x - cx, ly = lh.y - 38 - cy;
  const beam = (ctx) => { ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx + Math.cos(beamA - 0.16) * 190, ly + Math.sin(beamA - 0.16) * 140); ctx.lineTo(lx + Math.cos(beamA + 0.16) * 190, ly + Math.sin(beamA + 0.16) * 140); ctx.closePath(); ctx.fill(); };
  if (dark > 0.2) { lctx.globalAlpha = 0.45 * dark; lctx.fillStyle = '#fff'; beam(lctx); }
  lctx.globalAlpha = 1;
  lctx.globalCompositeOperation = 'source-over';
  bctx.drawImage(lc, 0, 0);
  // 暖色光暈
  if (dark > 0.05) {
    bctx.globalCompositeOperation = 'lighter';
    for (const L of G.lights) {
      if (!L.warm) continue;
      const x = L.x - cx, y = L.y - cy;
      if (x < -L.r || y < -L.r || x > w + L.r || y > h + L.r) continue;
      bctx.globalAlpha = 0.13 * L.a * dark;
      const r = L.r * 0.8;
      bctx.drawImage(tintCircle(r, L.warm), Math.round(x - r), Math.round(y - r));
      bctx.globalAlpha = 0.1 * L.a * dark;
      bctx.drawImage(tintCircle(r * 0.5, L.warm), Math.round(x - r * 0.5), Math.round(y - r * 0.5));
    }
    bctx.globalAlpha = 0.06 * dark; bctx.fillStyle = '#fff4c0'; beam(bctx);
    bctx.globalAlpha = 1;
    bctx.globalCompositeOperation = 'source-over';
  }
}

let rainDrops = [], fogBlobs = [];
function drawScreenFx(w, h) {
  const t = G.t;
  const c = bctx;
  // 極光
  if (G.ev.aurora > 0 && G.env.dark > 0.4) {
    const fade = Math.min(1, G.ev.aurora / 4, (40 - G.ev.aurora) / 4) * G.env.dark;
    c.globalCompositeOperation = 'lighter';
    for (let x = 0; x < w; x += 2) {
      const y0 = 8 + Math.sin(x * 0.03 + t * 0.5) * 8 + Math.sin(x * 0.011 - t * 0.3) * 12;
      const hgt = 26 + Math.sin(x * 0.05 + t) * 10;
      for (let s = 0; s < 4; s++) {
        c.globalAlpha = fade * (0.16 - s * 0.03);
        c.fillStyle = s < 2 ? '#40ffa0' : '#a060ff';
        c.fillRect(x, Math.round(y0 + s * hgt * 0.25), 2, Math.round(hgt * 0.3));
      }
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }
  // 彩虹
  if (G.ev.rainbow > 0) {
    const fade = Math.min(1, G.ev.rainbow / 4, (26 - G.ev.rainbow) / 3) * (1 - G.env.dark);
    const cols = ['#ff4a4a', '#ff9a3a', '#ffe04a', '#5ad05a', '#4aa8ff', '#6a5aff', '#b05aff'];
    c.lineWidth = 2;
    cols.forEach((col, i) => { c.globalAlpha = 0.26 * fade; c.strokeStyle = col; c.beginPath(); c.arc(w * 0.62, h * 1.05, h * 0.85 - i * 2, Math.PI * 1.08, Math.PI * 1.92); c.stroke(); });
    c.globalAlpha = 1;
  }
  // 流星
  for (const s of G.stars) {
    const a = s.life / s.max;
    for (let i = 0; i < 16; i++) {
      c.globalAlpha = a * (1 - i / 16);
      c.fillStyle = i < 2 ? '#ffffff' : '#c8e8ff';
      c.fillRect(Math.round(s.x - s.vx * i * 0.006), Math.round(s.y - s.vy * i * 0.006), i < 1 ? 2 : 1, 1);
    }
  }
  c.globalAlpha = 1;
  // 雨
  if (G.ev.rain > 0) {
    const want = Math.floor((w * h) / 260);
    while (rainDrops.length < want) rainDrops.push({ x: rand(w + 40), y: rand(-h, h), s: rand(160, 220) });
    c.fillStyle = 'rgba(200,225,255,0.55)';
    for (const d of rainDrops) {
      d.y += d.s / 60; d.x -= d.s / 240;
      if (d.y > h) { d.y = rand(-20, 0); d.x = rand(w + 40); }
      c.fillRect(Math.round(d.x), Math.round(d.y), 1, 3);
    }
    for (let i = 0; i < 3; i++) {
      const x = G.cam.x + rand(w), y = G.cam.y + rand(h);
      if (isWaterTile(tileAt(x, y))) spawn({ kind: 'ring', x, y, life: 0.5, r0: 0.5, r1: 3, col: '#d8f0ff' });
    }
  } else rainDrops.length = 0;
  // 霧
  if (G.ev.fog > 0) {
    const fade = Math.min(1, G.ev.fog / 4, (30 - G.ev.fog) / 4);
    if (!fogBlobs.length) fogBlobs = Array.from({ length: 10 }, () => ({ x: rand(w), y: rand(h), r: rand(30, 60), v: rand(4, 9) }));
    c.globalAlpha = 0.18 * fade; c.fillStyle = '#e8eef4'; c.fillRect(0, 0, w, h);
    for (const b of fogBlobs) {
      b.x += b.v / 60; if (b.x - b.r > w) b.x = -b.r;
      c.globalAlpha = 0.12 * fade;
      c.drawImage(tintCircle(b.r, '#f0f4f8'), Math.round(b.x - b.r), Math.round(b.y - b.r));
    }
    c.globalAlpha = 1;
  } else fogBlobs.length = 0;
  if (flash > 0) { c.globalAlpha = flash * 0.5; c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h); c.globalAlpha = 1; }
}

// 舵輪 HUD
function drawWheel(c, cx, cy, rot, speed) {
  const R = 10;
  const px = (x, y, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1); };
  c.globalAlpha = 0.35; c.drawImage(tintCircle(R + 6, '#0a1830'), cx - R - 6, cy - R - 6); c.globalAlpha = 1;
  for (let k = 0; k < 8; k++) {
    const a = rot + (k / 8) * TAU;
    for (let r = 2; r <= R + 3; r++) px(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r > R ? '#e0b070' : '#b07a42');
    px(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4), '#e0b070');
  }
  for (let i = 0; i < 64; i++) { const a = (i / 64) * TAU; px(cx + Math.cos(a) * R, cy + Math.sin(a) * R, '#6a3e1e'); px(cx + Math.cos(a) * (R - 1), cy + Math.sin(a) * (R - 1), '#9a6232'); }
  c.fillStyle = '#ffd56a'; c.fillRect(cx - 1, cy - 1, 3, 3);
  c.fillStyle = '#c03030'; c.fillRect(Math.round(cx + Math.cos(rot - Math.PI / 2) * (R + 4)), Math.round(cy + Math.sin(rot - Math.PI / 2) * (R + 4)), 1, 1);
  // 速度條
  const bx = cx + R + 9, bh = 22;
  c.fillStyle = 'rgba(10,24,48,0.6)'; c.fillRect(bx - 1, cy - bh / 2 - 1, 5, bh + 2);
  const v = clamp(speed / 48, -0.25, 1);
  if (v >= 0) { const hh = Math.round(v * bh); c.fillStyle = '#6ad06a'; c.fillRect(bx, cy + bh / 2 - hh, 3, hh); }
  else { const hh = Math.round(-v * 4 * 6); c.fillStyle = '#ff6a5a'; c.fillRect(bx, cy + bh / 2 - hh, 3, hh); }
  for (let i = 0; i <= 4; i++) { c.fillStyle = '#ffffff'; c.globalAlpha = 0.5; c.fillRect(bx + 3, Math.round(cy + bh / 2 - (i / 4) * bh), 1, 1); }
  c.globalAlpha = 1;
}

// ───── 小地圖 ─────
let mapBase = null;
function buildMinimap() {
  const mc = $('minimap');
  const S = 8, mw = WORLD_W / S, mh = WORLD_H / S;
  mc.width = mw; mc.height = mh;
  const m = document.createElement('canvas'); m.width = mw; m.height = mh;
  const mx = m.getContext('2d');
  const id = mx.createImageData(mw, mh);
  const d = new Uint32Array(id.data.buffer);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) d[y * mw + x] = World.base[(y * S + 4) * WORLD_W + x * S + 4];
  mx.putImageData(id, 0, 0);
  mapBase = m;
}
function drawMinimap() {
  const mc = $('minimap');
  if (mc.hidden || !mapBase) return;
  const c = mc.getContext('2d');
  c.imageSmoothingEnabled = false;
  c.drawImage(mapBase, 0, 0);
  if (G.env.dark > 0.1) { c.fillStyle = `rgba(8,14,44,${G.env.dark * 0.5})`; c.fillRect(0, 0, mc.width, mc.height); }
  const S = 8;
  c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 1;
  c.strokeRect(Math.round(G.cam.x / S) + 0.5, Math.round(G.cam.y / S) + 0.5, Math.round(G.view.w / S), Math.round(G.view.h / S));
  for (const cr of G.creatures) { c.fillStyle = cr instanceof Floater ? '#ffe040' : '#ff9ad0'; c.fillRect(Math.round(cr.x / S), Math.round(cr.y / S), 2, 2); }
  c.fillStyle = '#ffffff'; c.fillRect(Math.round(G.boat.x / S) - 1, Math.round(G.boat.y / S) - 1, 3, 3);
  c.fillStyle = '#c84a2a'; c.fillRect(Math.round(G.boat.x / S), Math.round(G.boat.y / S), 1, 1);
  if (G.mode === 'walk') { c.fillStyle = '#ff3040'; c.fillRect(Math.round(G.player.x / S) - 1, Math.round(G.player.y / S) - 1, 2, 2); }
}

// ───── 初始化 ─────
function findStandNear(x, y) {
  for (let r = 0; r < 60; r += 2) for (let k = 0; k < 12; k++) {
    const px = x + Math.cos(k) * r, py = y + Math.sin(k) * r;
    if (levelOf(tileAt(px, py)) === 0 && canStand(px, py, 0)) return { x: px, y: py };
  }
  return { x, y };
}
function setupEntities(saved) {
  const F = World.feature;
  const ps = findStandNear(F.dock.x - 2, F.dock.y0 - 8);
  G.player = new Player(ps.x, ps.y);
  let bx = F.dock.x + 17, by = F.dock.y1 - 6;
  for (let i = 0; i < 40 && !boatFree(bx, by, 0); i++) { bx += 2; by += 1; }
  G.boat = new Boat(bx, by, 0);
  const hs = World.house, fire = World.fire;
  const spots = { cat: findStandNear(hs.x + 22, hs.y + 14), sam: findStandNear(F.dock.x + 22, F.dock.y0 - 22), fox: findStandNear(fire.x + 40, fire.y - 24) };
  G.animals = ['cat', 'sam', 'fox'].map((k) => new Animal(k, spots[k].x, spots[k].y));
  // 沙灘上的螃蟹
  const rnd = mulberry32(77);
  G.crabs = [];
  for (let i = 0; i < 2000 && G.crabs.length < 5; i++) {
    const x = 300 + rnd() * 430, y = 230 + rnd() * 340;
    const e = World.elev[(y | 0) * WORLD_W + (x | 0)];
    if (tileAt(x, y) === T.SAND && e > 0.01 && e < 0.05 && !G.crabs.some((c) => dist(c.x, c.y, x, y) < 60)) G.crabs.push(new Crab(x, y));
  }
  if (saved && saved.hour !== undefined) {
    G.hour = saved.hour; G.mode = saved.mode || 'walk';
    if (saved.px) { G.player.x = saved.px; G.player.y = saved.py; }
    if (saved.bx) { G.boat.x = saved.bx; G.boat.y = saved.by; G.boat.angle = saved.ba; }
  }
  G.cam.x = (G.mode === 'boat' ? G.boat.x : G.player.x) - G.view.w / 2;
  G.cam.y = (G.mode === 'boat' ? G.boat.y : G.player.y) - G.view.h / 2;
}

function startGame() {
  if (G.started) return;
  Sound.init();
  G.started = true;
  $('start').hidden = true;
  setTimeout(() => toast(`走到碼頭的小船旁邊按 ${isTouch ? 'Ⓐ' : 'E'} 上船`), 1200);
  setTimeout(() => toast('摸摸動物、搖搖樹、點營火…到處都可以互動'), 4200);
}

let last = 0;
function frame(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(frame);
}

function boot(saved) {
  resize();
  buildSprites();
  generateWorld();
  setupEntities(saved || {});
  buildMinimap();
  UI.init();
  $('start-btn').onclick = startGame;
  $('loading').hidden = true;
  $('start-btn').hidden = false;
  if (saved && saved.started) startGame();
  window.claude?.hot?.snapshot?.(() => ({ started: G.started, hour: G.hour, mode: G.mode, px: G.player.x, py: G.player.y, bx: G.boat.x, by: G.boat.y, ba: G.boat.angle }));
  requestAnimationFrame(frame);
}
setTimeout(() => {
  const hot = window.claude?.hot;
  if (hot?.ready) hot.ready(boot); else boot(hot?.data ?? {});
}, 30);
