'use strict';
// ───────────── 海洋生物 + 隨機事件 + 圖鑑 + 釣魚 ─────────────

// 圖鑑條目
const JOURNAL = [
  { group: '島上的朋友', items: [['pet_cat', '🐱', '貓咪', '摸摸牠，或餵一條魚'], ['pet_fox', '🦊', '狐狸', '站著不動，等牠靠近'], ['pet_sam', '🐶', '薩摩耶', '最愛跟著你跑']] },
  { group: '海洋生物', items: [['dolphins', '🐬', '海豚'], ['whale', '🐋', '鯨魚'], ['turtle', '🐢', '海龜'], ['jelly', '🪼', '水母'], ['fish', '🐟', '魚群'], ['gulls', '🕊️', '海鷗', '白天才會出現'], ['manta', '🌀', '魟魚'], ['otter', '🦦', '海獺']] },
  { group: '天氣與奇景', items: [['rain', '🌧️', '雷陣雨'], ['rainbow', '🌈', '彩虹', '白天，雨後最常見'], ['fog', '🌫️', '海霧'], ['meteor', '🌠', '流星雨', '夜晚限定'], ['aurora', '🌌', '極光', '夜晚限定'], ['bio', '✨', '螢光海', '夜晚限定']] },
  { group: '漂流物', items: [['bottle', '🍾', '漂流瓶', '開船碰到就能撿起'], ['chest', '🎁', '漂流寶箱'], ['wish', '⭐', '對流星許願', '點擊夜空中的流星']] },
  { group: '釣魚', items: [['c_fish', '🐟', '小魚'], ['c_trop', '🐠', '熱帶魚'], ['c_puffer', '🐡', '河豚'], ['c_squid', '🦑', '小卷'], ['c_octo', '🐙', '章魚'], ['c_boot', '🥾', '舊靴子'], ['c_star', '⭐', '海星'], ['c_shell', '🐚', '貝殼'], ['c_lantern', '🏮', '燈籠魚', '夜晚限定'], ['c_starshard', '🌟', '星星碎片', '夜晚限定，非常稀有']] },
];
const JOURNAL_NAMES = {};
for (const g of JOURNAL) for (const [id, icon, name] of g.items) JOURNAL_NAMES[id] = icon + ' ' + name;

function markJournal(id) {
  if (G.journal[id]) return;
  G.journal[id] = Date.now();
  store.set('journal', G.journal);
  const total = JOURNAL.reduce((s, g) => s + g.items.length, 0);
  toast(`📖 圖鑑新增：${JOURNAL_NAMES[id] || id}（${Object.keys(G.journal).filter((k) => JOURNAL_NAMES[k]).length}/${total}）`);
  UI.refreshJournal();
}
function saveInv() { store.set('inv', G.inv); UI.refreshStats(); }

const inView = (x, y, m = 0) => x > G.cam.x - m && y > G.cam.y - m && x < G.cam.x + G.view.w + m && y < G.cam.y + G.view.h + m;

// 在玩家附近找一塊夠開闊的海面
function findSeaSpot(minR, maxR, clear = 10) {
  const cx = G.cam.x + G.view.w / 2, cy = G.cam.y + G.view.h / 2;
  for (let i = 0; i < 80; i++) {
    const a = rand(TAU), r = rand(minR, maxR);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.75;
    let ok = true;
    for (let k = 0; k < 8 && ok; k++) { const b = (k / 8) * TAU; if (!isSea(tileAt(x + Math.cos(b) * clear, y + Math.sin(b) * clear))) ok = false; }
    if (ok && isSea(tileAt(x, y))) return { x, y };
  }
  return null;
}
const seaOK = (x, y) => isSea(tileAt(x, y));

// ───── 生物 ─────
class Creature {
  constructor(kind, x, y, life) { this.kind = kind; this.x = x; this.y = y; this.life = life; this.t = 0; this.dead = false; this.seen = false; }
  base(dt) {
    this.t += dt; this.life -= dt;
    if (this.life <= 0) this.dead = true;
    if (!this.seen && inView(this.x, this.y, -10)) { this.seen = true; markJournal(this.kind); this.onSeen && this.onSeen(); }
  }
  drawUnder() {} drawOver() {} drawAir() {}
}

// 一邊游一邊避開陸地
function swim(c, dt, speed, wiggle = 0.3) {
  c.angle += Math.sin(c.t * 0.5 + c.seed) * wiggle * dt;
  const nx = c.x + Math.cos(c.angle) * speed * dt, ny = c.y + Math.sin(c.angle) * speed * dt;
  const lookX = c.x + Math.cos(c.angle) * 24, lookY = c.y + Math.sin(c.angle) * 24;
  if (!seaOK(lookX, lookY)) c.angle += 1.8 * dt * (c.seed > 3 ? 1 : -1);
  if (seaOK(nx, ny)) { c.x = nx; c.y = ny; } else c.angle += Math.PI * 0.5;
}

class Dolphins extends Creature {
  constructor(x, y) {
    super('dolphins', x, y, 26);
    this.angle = rand(TAU); this.seed = rand(6);
    this.members = [0, 1, 2].map((i) => ({ dx: -i * 12 + rand(-3, 3), dy: (i % 2 ? 6 : -6) * (i ? 1 : 0), ph: i * 0.55 + rand(0.2), splashed: false }));
  }
  onSeen() { Sound.play('dolphin'); }
  update(dt) {
    this.base(dt); swim(this, dt, 32, 0.4);
    for (const m of this.members) {
      const u = ((this.t * 0.48 + m.ph) % 1);
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      m.x = this.x + c * m.dx - s * m.dy; m.y = this.y + s * m.dx + c * m.dy;
      m.jump = u < 0.4 ? u / 0.4 : -1;
      if (m.jump >= 0 && !m.inAir) { m.inAir = true; if (inView(m.x, m.y)) { splashAt(m.x, m.y, 6); } }
      if (m.jump < 0 && m.inAir) { m.inAir = false; if (inView(m.x, m.y)) { splashAt(m.x + Math.cos(this.angle) * 8, m.y, 10); if (Math.random() < 0.4) Sound.play('dolphin'); else Sound.play('splash', 0.08); } }
    }
  }
  drawUnder(ctx) {
    for (const m of this.members) if (m.jump < 0) { ctx.fillStyle = 'rgba(20,40,80,0.45)'; ctx.fillRect(Math.round(m.x) - 4, Math.round(m.y), 9, 2); ctx.fillStyle = '#5a6a82'; ctx.fillRect(Math.round(m.x), Math.round(m.y) - 1, 1, 1); }
  }
  drawOver(ctx) {
    const right = Math.cos(this.angle) >= 0;
    for (const m of this.members) {
      if (m.jump < 0) continue;
      const z = Math.sin(m.jump * Math.PI) * 13;
      const pitch = lerp(-0.8, 0.8, m.jump);
      const spr = SPR.dolphinRot[rotIndex(pitch, 16)];
      ctx.fillStyle = 'rgba(10,30,60,0.35)'; ctx.fillRect(Math.round(m.x) - 4, Math.round(m.y), 9, 1);
      drawSpr(ctx, spr, m.x, m.y - z + 8, !right);
    }
  }
}

class Whale extends Creature {
  constructor(x, y) { super('whale', x, y, 34); this.angle = rand(TAU); this.seed = rand(6); this.spoutT = 2; }
  onSeen() { Sound.play('whale'); }
  update(dt) {
    this.base(dt); swim(this, dt, this.life < 4 ? 4 : 9, 0.15);
    this.spoutT -= dt;
    if (this.spoutT <= 0 && this.life > 5) {
      this.spoutT = rand(6, 9);
      const hx = this.x + Math.cos(this.angle) * 12, hy = this.y + Math.sin(this.angle) * 12;
      for (let i = 0; i < 40; i++) spawn({ x: hx + rand(-1, 1), y: hy, vx: rand(-8, 8), vy: rand(-3, 3), vz: rand(30, 52), g: 55, life: rand(0.9, 1.6), col: pick(['#ffffff', '#d8f0ff', '#a8d8f0']), glow: G.env.bio });
      if (inView(hx, hy, 30)) { Sound.play('spout'); if (Math.random() < 0.5) Sound.play('whale'); }
    }
    if (this.life < 3.5 && !this.flukeDone) { this.flukeDone = true; splashAt(this.x - Math.cos(this.angle) * 14, this.y, 14, true); }
  }
  drawUnder(ctx) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    ctx.fillStyle = 'rgba(14,30,62,0.55)';
    for (let k = -22; k <= 18; k++) {
      const half = Math.round(7 * Math.sqrt(Math.max(0, 1 - ((k + 2) / 21) ** 2)));
      for (let j = -half; j <= half; j += 1) ctx.fillRect(Math.round(this.x + c * k - s * j), Math.round(this.y + s * k + c * j), 1, 1);
    }
  }
  drawOver(ctx) {
    if (this.life < 3.5) {
      const u = 1 - this.life / 3.5;
      const z = Math.sin(u * Math.PI) * 12;
      const tx = this.x - Math.cos(this.angle) * 18, ty = this.y - Math.sin(this.angle) * 18;
      ctx.save(); ctx.beginPath(); ctx.rect(tx - 20, ty - 40, 40, 40); ctx.clip();
      drawSpr(ctx, SPR.fluke, tx, ty - z + 6);
      ctx.restore();
    }
  }
}

class Turtle extends Creature {
  constructor(x, y) { super('turtle', x, y, 34); this.angle = rand(TAU); this.seed = rand(6); }
  update(dt) { this.base(dt); swim(this, dt, 9, 0.3); }
  drawUnder(ctx) {
    const f = Math.floor(this.t * 2.5) % 2;
    const surf = Math.sin(this.t * 0.4) > 0.3;
    const spr = SPR.turtleRot[f][rotIndex(this.angle, 16)];
    ctx.globalAlpha = surf ? 1 : 0.55;
    drawSpr(ctx, spr, this.x, this.y, false, 0.5, 0.5);
    ctx.globalAlpha = 1;
    if (surf && Math.random() < 0.02) spawn({ kind: 'ring', x: this.x, y: this.y, life: 1, r0: 2, r1: 9, col: '#e8f8ff' });
  }
}

class Jellies extends Creature {
  constructor(x, y) {
    super('jelly', x, y, 40);
    this.j = Array.from({ length: 7 }, () => ({ dx: rand(-26, 26), dy: rand(-16, 16), ph: rand(TAU), pal: randInt(0, 2) }));
  }
  update(dt) { this.base(dt); this.x += Math.sin(this.t * 0.2) * 3 * dt; this.y += 2 * dt; if (!seaOK(this.x, this.y + 10)) this.y -= 4 * dt; }
  drawUnder(ctx) {
    for (const j of this.j) {
      const x = this.x + j.dx + Math.sin(this.t * 0.6 + j.ph) * 3, y = this.y + j.dy + Math.sin(this.t * 1.4 + j.ph) * 2;
      if (!seaOK(x, y)) continue;
      ctx.globalAlpha = 0.85;
      drawSpr(ctx, SPR.jelly[j.pal][Math.floor(this.t * 2 + j.ph) % 2], x, y, false, 0.5, 0.5);
      ctx.globalAlpha = 1;
      if (G.env.dark > 0.2) G.lights.push({ x, y, r: 9, a: 0.7, warm: ['#ff70c8', '#60c8ff', '#b080ff'][j.pal] });
    }
  }
}

class FishSchool extends Creature {
  constructor(x, y) { super('fish', x, y, 30); this.angle = rand(TAU); this.seed = rand(6); this.f = Array.from({ length: 26 }, () => ({ r: rand(3, 14), a: rand(TAU), w: rand(1.5, 3) * (Math.random() < 0.5 ? 1 : -1) })); }
  update(dt) {
    this.base(dt); swim(this, dt, 16, 0.8);
    if (Math.random() < dt * 0.7 && inView(this.x, this.y)) {
      const fx = this.x + rand(-10, 10), fy = this.y + rand(-6, 6);
      spawn({ x: fx, y: fy, vx: rand(-14, 14), vz: rand(25, 35), g: 90, life: 1, col: '#e8f0ff', fade: false, land: (p) => { splashAt(p.x, p.y, 4); p.life = 0; } });
    }
  }
  drawUnder(ctx) {
    for (const f of this.f) {
      const a = f.a + this.t * f.w;
      const x = Math.round(this.x + Math.cos(a) * f.r), y = Math.round(this.y + Math.sin(a) * f.r * 0.6);
      if (!seaOK(x, y)) continue;
      ctx.fillStyle = Math.sin(this.t * 4 + f.a * 3) > 0.6 ? '#e8f4ff' : '#16365c';
      ctx.fillRect(x, y, 2, 1);
    }
  }
}

class Gulls extends Creature {
  constructor() {
    const fromLeft = Math.random() < 0.5;
    super('gulls', G.cam.x + (fromLeft ? -20 : G.view.w + 20), G.cam.y + rand(20, G.view.h - 40), 30);
    this.vx = fromLeft ? 26 : -26; this.vy = rand(-5, 5); this.cawT = 1;
    this.b = [0, 1, 2].map((i) => ({ dx: -i * 10 * Math.sign(this.vx), dy: (i % 2 ? 7 : -5) * (i ? 1 : 0), ph: rand(TAU) }));
  }
  update(dt) {
    this.base(dt); this.x += this.vx * dt; this.y += this.vy * dt;
    this.cawT -= dt; if (this.cawT <= 0) { this.cawT = rand(2, 5); if (inView(this.x, this.y, 20)) Sound.play('gull'); }
    if (!inView(this.x, this.y, 80) && this.t > 3) this.dead = true;
    const sam = G.animals.find((a) => a.kind === 'sam');
    if (sam && dist(sam.x, sam.y, this.x, this.y + 20) < 40 && sam.barkT < 0) { sam.barkT = 6; Sound.play('woof'); }
  }
  drawAir(ctx) {
    for (const b of this.b) {
      const x = this.x + b.dx, y = this.y + b.dy + Math.sin(this.t * 2 + b.ph) * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(Math.round(x) + 6, Math.round(y) + 18, 5, 1);
      drawSpr(ctx, SPR.gull[Math.floor(this.t * 5 + b.ph) % 2], x, y, this.vx < 0);
    }
  }
}

class Manta extends Creature {
  constructor(x, y) { super('manta', x, y, 30); this.angle = rand(TAU); this.seed = rand(6); }
  update(dt) { this.base(dt); swim(this, dt, 13, 0.3); }
  drawUnder(ctx) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const flap = 0.7 + Math.sin(this.t * 3) * 0.3;
    ctx.fillStyle = 'rgba(12,26,56,0.5)';
    for (let k = -7; k <= 7; k++) {
      const half = Math.round((7 - Math.abs(k)) * 1.6 * flap + (k > -2 && k < 3 ? 2 : 0));
      for (let j = -half; j <= half; j++) ctx.fillRect(Math.round(this.x + c * k - s * j), Math.round(this.y + s * k + c * j), 1, 1);
    }
    for (let k = 8; k < 18; k++) ctx.fillRect(Math.round(this.x - c * k), Math.round(this.y - s * k), 1, 1);
  }
}

class Otter extends Creature {
  constructor(x, y) { super('otter', x, y, 45); this.waved = false; }
  update(dt) {
    this.base(dt); this.x += Math.sin(this.t * 0.3) * 2 * dt;
    const b = G.boat;
    if (!this.waved && dist(b.x, b.y, this.x, this.y) < 30) { this.waved = true; Sound.play('otter'); hearts(this.x, this.y - 4, 2); toast('🦦 海獺抱著貝殼對你揮揮手！'); }
  }
  drawOver(ctx) {
    const bob = Math.sin(this.t * 2) > 0 ? 1 : 0;
    drawSpr(ctx, SPR.otter[Math.floor(this.t * 1.5) % 2], this.x, this.y + 3 - bob);
    if (Math.random() < 0.015) spawn({ kind: 'ring', x: this.x, y: this.y + 1, life: 1, r0: 3, r1: 9, col: '#e8f8ff' });
    if (Math.random() < 0.004) Sound.play('crab');
  }
}

class Floater extends Creature {
  constructor(kind, x, y) { super(kind, x, y, 70); this.spr = kind === 'bottle' ? SPR.bottle : SPR.chest; this.seen = true; }
  update(dt) {
    this.t += dt; this.life -= dt; if (this.life <= 0) this.dead = true;
    const b = G.boat;
    const p = G.player;
    if ((G.mode === 'boat' && dist(b.x, b.y, this.x, this.y) < 16) || (G.mode === 'walk' && dist(p.x, p.y, this.x, this.y) < 10)) this.collect();
  }
  collect() {
    this.dead = true;
    splashAt(this.x, this.y, 8);
    markJournal(this.kind);
    if (this.kind === 'bottle') {
      Sound.play('pickup');
      UI.dialog('🍾', '撿到漂流瓶', '瓶子裡有一張捲起來的紙條：<br><br><i>「' + pick(BOTTLE_MESSAGES) + '」</i>');
    } else {
      const n = randInt(5, 20);
      G.inv.coins += n; saveInv();
      Sound.play('coin'); Sound.play('sparkle');
      UI.dialog('🎁', '撈到漂流寶箱！', `打開一看，裡面有 <b>${n}</b> 枚閃亮亮的金幣。<br>還附了一張字條：「${pick(['給下一個幸運兒', '海盜也需要分享', '別告訴鸚鵡', '請好好照顧島上的動物'])}」`);
    }
  }
  drawOver(ctx) {
    const bob = Math.sin(this.t * 2.4) > 0 ? 1 : 0;
    drawSpr(ctx, this.spr, this.x, this.y + 2 - bob);
    if (Math.floor(this.t * 2) % 3 === 0) { ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(this.x) + 3, Math.round(this.y) - 4 - bob, 1, 1); }
    if (Math.random() < 0.02) spawn({ kind: 'ring', x: this.x, y: this.y + 1, life: 1, r0: 3, r1: 8, col: '#e8f8ff' });
    if (G.env.dark > 0.3) G.lights.push({ x: this.x, y: this.y, r: 7, a: 0.5, warm: this.kind === 'chest' ? '#ffd040' : '#80ffc0' });
  }
}

const BOTTLE_MESSAGES = [
  '今天也辛苦了，記得喝水。',
  '我在另一座島上，也看著同一片星空。',
  '如果你看到這張紙條，請替我摸摸那隻薩摩耶。',
  '小時候埋的時光膠囊在燈塔下面…騙你的。',
  '浪會帶走煩惱，也會把好東西帶回來。',
  '狐狸其實很想跟你做朋友，只是有點害羞。',
  '貓咪說：魚要新鮮的喔。',
  '夜晚的海會發光，那是星星掉進海裡了。',
  '慢慢來，比較快。',
  '願你的船帆永遠吃滿風。',
  '我把第一次看到鯨魚的心情，裝在這個瓶子裡。',
  '下雨之後，記得抬頭找彩虹。',
];
const WISHES = ['希望明天也是好天氣', '希望大家都平平安安', '希望可以一直待在這座小島', '希望薩摩耶永遠開心', '希望貓咪不要再偷吃魚', '希望能再看到鯨魚', '希望下次釣到星星碎片'];

// ───── 事件 ─────
const EVENTS = [
  { id: 'dolphins', w: 3, msg: '🐬 一群海豚在附近跳躍！', make: () => { const s = findSeaSpot(60, 150, 16); return s && new Dolphins(s.x, s.y); } },
  { id: 'whale', w: 2, msg: '🐋 遠方傳來低沉的鯨魚歌聲…', make: () => { const s = findSeaSpot(70, 170, 26); return s && new Whale(s.x, s.y); } },
  { id: 'turtle', w: 3, msg: '🐢 一隻海龜慢悠悠地游過', make: () => { const s = findSeaSpot(40, 120, 10); return s && new Turtle(s.x, s.y); } },
  { id: 'jelly', w: 2, night: 2.5, msg: '🪼 水母群在海面下輕輕漂浮', make: () => { const s = findSeaSpot(40, 120, 24); return s && new Jellies(s.x, s.y); } },
  { id: 'fish', w: 3, msg: '🐟 閃閃發亮的魚群游過來了', make: () => { const s = findSeaSpot(30, 110, 14); return s && new FishSchool(s.x, s.y); } },
  { id: 'gulls', w: 2.5, day: true, msg: '🕊️ 海鷗從頭頂飛過', make: () => new Gulls() },
  { id: 'manta', w: 1.5, msg: '🌀 一隻大魟魚在水下滑翔', make: () => { const s = findSeaSpot(40, 130, 18); return s && new Manta(s.x, s.y); } },
  { id: 'otter', w: 2, msg: '🦦 有隻海獺仰躺著漂了過來', make: () => { const s = findSeaSpot(50, 120, 10); return s && new Otter(s.x, s.y); } },
  { id: 'bottle', w: 2.5, msg: '🍾 有個漂流瓶在海上載浮載沉…開船去撿吧！', make: () => { const s = findSeaSpot(50, 130, 8); return s && new Floater('bottle', s.x, s.y); } },
  { id: 'chest', w: 1, msg: '🎁 遠處漂來一個閃閃發光的寶箱！', make: () => { const s = findSeaSpot(70, 160, 8); return s && new Floater('chest', s.x, s.y); } },
  { id: 'rain', w: 1.4, fx: 28, msg: '🌧️ 烏雲飄來，下起了雷陣雨' },
  { id: 'fog', w: 1, fx: 30, msg: '🌫️ 海面起霧了，燈塔響起霧笛' },
  { id: 'meteor', w: 2.2, nightOnly: true, fx: 26, msg: '🌠 流星雨！快點擊流星許願' },
  { id: 'aurora', w: 1.6, nightOnly: true, fx: 40, msg: '🌌 天邊出現了極光' },
  { id: 'bio', w: 1.6, nightOnly: true, fx: 45, msg: '✨ 海水發出藍色螢光，開船試試看！' },
  { id: 'rainbow', w: 0.8, day: true, fx: 26, msg: '🌈 天空掛起一道彩虹' },
];

function triggerEvent(forceId) {
  const night = G.env.dark > 0.5;
  let list = EVENTS.filter((e) => (!e.nightOnly || night) && (!e.day || !night) && !(e.fx && G.ev[e.id] > 0));
  if (forceId) list = EVENTS.filter((e) => e.id === forceId);
  const weighted = list.map((e) => ({ e, w: e.w * (night && e.night ? e.night : 1) * (G.journal[e.id] ? 1 : 1.6) }));
  for (let tries = 0; tries < 6; tries++) {
    const { e } = weightedPick(weighted);
    if (e.fx) {
      G.ev[e.id] = e.fx;
      markJournal(e.id);
      if (e.id === 'rain') { Sound.play('thunder'); flash = 0.6; }
      if (e.id === 'fog') Sound.play('foghorn');
      if (e.id === 'aurora' || e.id === 'rainbow') Sound.play('sparkle');
      UI.banner(e.msg);
      return true;
    }
    const c = e.make();
    if (c) { G.creatures.push(c); UI.banner(e.msg); return true; }
  }
  return false;
}
let flash = 0;

function updateEvents(dt) {
  G.nextEvent -= dt;
  if (G.nextEvent <= 0) { G.nextEvent = rand(18, 34); triggerEvent(); }
  for (const k in G.ev) {
    if (G.ev[k] <= 0) continue;
    G.ev[k] -= dt;
    if (G.ev[k] <= 0) {
      G.ev[k] = 0;
      if (k === 'rain' && G.env.dark < 0.5 && Math.random() < 0.75) { G.ev.rainbow = 24; markJournal('rainbow'); UI.banner('🌈 雨停了，天空掛起一道彩虹'); }
    }
  }
  if (G.ev.rain > 0 && Math.random() < dt * 0.06) { Sound.play('thunder'); flash = 0.5; }
  if (G.ev.fog > 0 && Math.random() < dt * 0.05) Sound.play('foghorn');
  // 流星
  const night = G.env.dark > 0.6;
  if (night && Math.random() < dt * (G.ev.meteor > 0 ? 2.4 : 0.1)) {
    G.stars.push({ x: rand(G.view.w * 0.2, G.view.w * 1.1), y: rand(-10, G.view.h * 0.35), vx: -rand(90, 150), vy: rand(40, 70), life: rand(0.7, 1.2), max: 1 });
  }
  for (let i = G.stars.length - 1; i >= 0; i--) { const s = G.stars[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; if (s.life <= 0) G.stars.splice(i, 1); }
  for (const c of G.creatures) c.update(dt);
  G.creatures = G.creatures.filter((c) => !c.dead);
}

function wishOnStar(vx, vy) {
  for (const s of G.stars) {
    if (Math.hypot(s.x - vx, s.y - vy) < 14) {
      s.life = 0;
      Sound.play('sparkle');
      for (let i = 0; i < 16; i++) spawn({ x: G.cam.x + s.x, y: G.cam.y + s.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 1, col: pick(['#fff6a0', '#ffffff', '#a0e8ff']), glow: true, drag: 2 });
      markJournal('wish');
      UI.dialog('🌠', '對流星許願', `你閉上眼睛，悄悄許了願：<br><br><i>「${pick(WISHES)}」</i>`);
      return true;
    }
  }
  return false;
}

// ───── 釣魚 ─────
const CATCH = [
  { id: 'c_fish', w: 30, fish: true, text: '一條活蹦亂跳的小魚！' },
  { id: 'c_trop', w: 14, fish: true, day: true, text: '色彩繽紛的熱帶魚！' },
  { id: 'c_puffer', w: 8, fish: true, text: '河豚氣鼓鼓地瞪著你。' },
  { id: 'c_squid', w: 8, fish: true, night: true, text: '一隻透明的小卷。' },
  { id: 'c_octo', w: 4, text: '章魚用八隻腳抱住了釣線！放牠回去吧。' },
  { id: 'c_boot', w: 10, text: '…一隻舊靴子。是誰掉的呢？' },
  { id: 'c_star', w: 8, text: '一隻橘色的海星。' },
  { id: 'c_shell', w: 10, text: '一個粉紅色的貝殼，可以聽見海的聲音。' },
  { id: 'c_lantern', w: 10, fish: true, night: true, nightOnly: true, text: '燈籠魚！頭上的小燈一閃一閃。' },
  { id: 'c_starshard', w: 2, nightOnly: true, text: '一塊會發光的星星碎片！據說是流星掉進海裡變成的。' },
];
function startFishing() {
  if (G.fishing) { if (G.fishing.state === 'bite') reelIn(); else cancelFishing('收竿了'); return; }
  let bx, by;
  if (G.mode === 'boat') {
    const b = G.boat;
    if (Math.abs(b.speed) > 6) { toast('船速太快了，先停下來再釣魚'); return; }
    const c = Math.cos(b.angle), s = Math.sin(b.angle);
    bx = b.x - s * 18 - c * 4; by = b.y + c * 18 - s * 4;
    if (!isWaterTile(tileAt(bx, by))) { bx = b.x + s * 18; by = b.y - c * 18; }
  } else {
    const p = G.player;
    const d = { down: [0, 1], up: [0, -1], side: [p.flip ? -1 : 1, 0] }[p.dir];
    bx = p.x + d[0] * 16; by = p.y + d[1] * 16 - (p.dir === 'up' ? 4 : 0);
  }
  const t = tileAt(bx, by);
  if (!(isSea(t) || t === T.POND)) { toast('🎣 要面向海或水潭才能釣魚喔'); return; }
  G.fishing = { state: 'wait', t: rand(2, 6), bx, by, sx: 0, sy: 0 };
  Sound.play('cast');
  setTimeout(() => { Sound.play('plop'); if (G.fishing) splashAt(bx, by, 4); }, 300);
  toast('🎣 拋竿！等浮標動了再按一次');
}
function cancelFishing(msg) { if (!G.fishing) return; G.fishing = null; if (msg) toast(msg); }
function updateFishing(dt) {
  const f = G.fishing;
  if (!f) return;
  f.t -= dt;
  if (G.mode === 'boat' && Math.abs(G.boat.speed) > 8) { cancelFishing('船開走了，收竿'); return; }
  if (f.state === 'wait' && f.t <= 0) {
    f.state = 'bite'; f.t = 1.3; Sound.play('bite');
    const who = G.mode === 'boat' ? G.boat : G.player;
    spawn({ kind: 'spr', spr: SPR.bang, x: who.x, y: who.y - 18, life: 1.2, vz: 2 });
    splashAt(f.bx, f.by, 5);
  } else if (f.state === 'bite' && f.t <= 0) {
    G.fishing = null; Sound.play('fail'); toast('魚跑掉了…下次動作要快一點！');
  }
}
function reelIn() {
  const f = G.fishing; G.fishing = null;
  const night = G.env.dark > 0.5;
  const pool = CATCH.filter((c) => (!c.nightOnly || night) && !(c.day && night)).map((c) => ({ c, w: c.w * (c.night && night ? 2 : 1) }));
  const { c } = weightedPick(pool);
  splashAt(f.bx, f.by, 10);
  Sound.play('pickup');
  markJournal(c.id);
  if (c.fish) { G.inv.fish++; saveInv(); }
  const extra = c.fish ? '<br><small>（🐟 可以拿去餵貓咪、狐狸或薩摩耶）</small>' : '';
  UI.dialog(JOURNAL_NAMES[c.id].split(' ')[0], '釣到了：' + JOURNAL_NAMES[c.id].split(' ')[1], c.text + extra);
  if (c.id === 'c_starshard') Sound.play('sparkle');
  // 貓咪聞到魚味就跑過來
  const cat = G.animals.find((a) => a.kind === 'cat');
  if (c.fish && cat && !cat.onBoat && G.mode === 'walk' && dist(cat.x, cat.y, G.player.x, G.player.y) < 160) { cat.follow = Math.max(cat.follow, 20); cat.state = 'idle'; Sound.play('meow'); }
}
