'use strict';
// ───────────── 角色：玩家、船、動物、螃蟹、粒子 ─────────────

const G = {
  t: 0, hour: 8.5, warpTo: null,
  mode: 'walk',
  player: null, boat: null, animals: [], crabs: [], creatures: [], particles: [], footprints: [], critters: [], stars: [],
  cam: { x: 0, y: 0 }, view: { w: 320, h: 180, scale: 3 },
  keys: {}, keyPressed: {},
  inv: store.get('inv', { fish: 0, apple: 0, coins: 0 }),
  journal: store.get('journal', {}),
  fishing: null,
  ev: { rain: 0, fog: 0, aurora: 0, meteor: 0, bio: 0, rainbow: 0 },
  env: { dark: 0, dusk: 0, bio: false },
  nextEvent: 14,
  lights: [],
  started: false,
};

// ───── 粒子 ─────
function spawn(p) {
  const o = Object.assign({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 1, col: '#ffffff', kind: 'px', glow: false, size: 1 }, p);
  o.max = o.life;
  if (G.particles.length < 900) G.particles.push(o);
  return o;
}
function burst(x, y, n, opts) {
  for (let i = 0; i < n; i++) {
    const a = rand(TAU), s = rand(opts.speed || 20);
    spawn(Object.assign({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: rand(opts.up || 20, (opts.up || 20) * 2), g: opts.g ?? 80, life: rand(0.5, opts.life || 1) }, opts, { x, y }));
  }
}
function hearts(x, y, n = 3) {
  for (let i = 0; i < n; i++) spawn({ kind: 'spr', spr: SPR.heart, x: x + rand(-5, 5), y, z: 6 + i * 3, vz: 14, vx: rand(-4, 4), life: 1.2 + i * 0.15 });
}
function splashAt(x, y, n = 10, big = false) {
  burst(x, y, n, { col: pick(['#ffffff', '#c8ecff', '#9ad8f4']), speed: big ? 30 : 16, up: big ? 30 : 18, g: 120, life: 0.8, glow: G.env.bio });
  spawn({ kind: 'ring', x, y, life: 0.9, r0: 1, r1: big ? 10 : 6, col: '#e8f8ff', glow: G.env.bio });
}
function updateParticles(dt) {
  const ps = G.particles;
  for (let i = ps.length - 1; i >= 0; i--) {
    const p = ps[i];
    p.life -= dt;
    if (p.life <= 0) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.g) { p.vz -= p.g * dt; if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.3; p.vy *= 0.3; if (p.land) { p.land(p); p.land = null; } } }
    if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
  }
}
function drawParticles(ctx, glowPass) {
  for (const p of G.particles) {
    if (!!p.glow !== glowPass) continue;
    const x = Math.round(p.x), y = Math.round(p.y - p.z);
    if (p.kind === 'px') {
      ctx.globalAlpha = p.fade === false ? 1 : clamp(p.life / p.max * 1.6, 0, 1);
      ctx.fillStyle = p.col; ctx.fillRect(x, y, p.size, p.size);
    } else if (p.kind === 'spr') {
      ctx.globalAlpha = clamp(p.life / p.max * 2, 0, 1);
      drawSpr(ctx, p.spr, x, y, p.flip);
    } else if (p.kind === 'ring') {
      const u = 1 - p.life / p.max, r = lerp(p.r0, p.r1, u);
      ctx.globalAlpha = (1 - u) * 0.9; ctx.fillStyle = p.col;
      const n = Math.max(8, Math.round(r * 4));
      for (let k = 0; k < n; k++) { const a = (k / n) * TAU; ctx.fillRect(Math.round(p.x + Math.cos(a) * r), Math.round(p.y + Math.sin(a) * r * 0.55), 1, 1); }
    } else if (p.kind === 'text') {
      ctx.globalAlpha = clamp(p.life / p.max * 2, 0, 1);
      drawSpr(ctx, p.spr, x, y);
    }
  }
  ctx.globalAlpha = 1;
}

// ───── 碰撞 ─────
function canStand(x, y, fromLevel) {
  const pts = [[x, y], [x - 2.5, y], [x + 2.5, y], [x, y - 1.5]];
  for (const [px, py] of pts) {
    const lv = levelOf(tileAt(px, py));
    if (lv < 0 || Math.abs(lv - fromLevel) > 1) return false;
  }
  return !propBlocked(x, y, 2.2);
}
function boatFree(x, y, ang) {
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const [f, side] of [[0, 0], [11, 0], [-11, 0], [5, 5], [5, -5], [-6, 5], [-6, -5]]) {
    const px = x + c * f - s * side, py = y + s * f + c * side;
    if (px < 4 || py < 4 || px > WORLD_W - 4 || py > WORLD_H - 4) return false;
    if (!isSea(tileAt(px, py))) return false;
  }
  for (const p of World.props) if (p.sea && Math.hypot(p.x - x, (p.y - 3 - y)) < 11) return false;
  return true;
}

// ───── 玩家 ─────
class Player {
  constructor(x, y) { this.x = x; this.y = y; this.dir = 'down'; this.flip = false; this.moving = false; this.animT = 0; this.stepT = 0; this.auto = null; this.stillT = 0; }
  get level() { return Math.max(0, levelOf(tileAt(this.x, this.y))); }
  update(dt, inp) {
    let ix = inp.x, iy = inp.y;
    if ((ix || iy) && this.auto) this.auto = null;
    if (!ix && !iy && this.auto) {
      const dx = this.auto.x - this.x, dy = this.auto.y - this.y, d = Math.hypot(dx, dy);
      if (d < (this.auto.obj ? 10 : 2)) {
        const a = this.auto; this.auto = null;
        if (a.obj) tryInteract();
      } else { ix = dx / d; iy = dy / d; }
    }
    const len = Math.hypot(ix, iy);
    this.moving = len > 0.1;
    if (this.moving) {
      ix /= len; iy /= len;
      if (G.fishing) cancelFishing('收竿了');
      const sp = 50 * (tileAt(this.x, this.y) === T.STREAM ? 0.7 : 1);
      const lv = this.level;
      const nx = this.x + ix * sp * dt, ny = this.y + iy * sp * dt;
      let moved = false;
      if (canStand(nx, this.y, lv)) { this.x = nx; moved = true; }
      if (canStand(this.x, ny, lv)) { this.y = ny; moved = true; }
      if (!moved && this.auto) this.auto = null;
      if (Math.abs(ix) > Math.abs(iy)) { this.dir = 'side'; this.flip = ix < 0; } else this.dir = iy < 0 ? 'up' : 'down';
      this.animT += dt * 8;
      this.stepT += dt;
      this.stillT = 0;
      if (this.stepT > 0.3) {
        this.stepT = 0;
        const tt = tileAt(this.x, this.y);
        const wet = tt === T.STREAM || tt === T.RIVER;
        Sound.play('step', wet);
        if (wet) spawn({ kind: 'ring', x: this.x, y: this.y, life: 0.7, r0: 1, r1: 5, col: '#e8f8ff' });
        if (tt === T.SAND) G.footprints.push({ x: Math.round(this.x + (Math.random() < 0.5 ? -1 : 1)), y: Math.round(this.y), life: 14 });
        if (Math.random() < 0.08 && !G.env.dark && (tt === T.GRASS || tt === T.PLATEAU)) Sound.play('bird');
      }
      // 經過花叢會驚起蝴蝶或螢火蟲
      for (const f of World.flowers) {
        if (Math.abs(f.x - this.x) < 3 && Math.abs(f.y - this.y) < 3 && Math.random() < 0.03) {
          G.critters.push(makeCritter(f.x, f.y - 2, G.env.dark > 0.5 ? 'firefly' : 'butterfly'));
        }
      }
    } else {
      this.animT = 0; this.stillT += dt;
    }
  }
  draw(ctx) {
    const set = SPR.player[this.dir];
    const f = this.moving ? 1 + (Math.floor(this.animT) % 2) : 0;
    const bob = this.moving && f === 1 ? 1 : 0;
    const wet = tileAt(this.x, this.y) === T.STREAM || tileAt(this.x, this.y) === T.RIVER;
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(Math.round(this.x) - 3, Math.round(this.y), 7, 1);
    if (wet) {
      // 泡在水裡只露出上半身
      const s = set[f];
      ctx.drawImage(this.flip ? s.f : s.c, 0, 0, s.w, s.h - 3, Math.round(this.x - s.w / 2), Math.round(this.y - s.h + 3 - bob), s.w, s.h - 3);
      ctx.fillStyle = '#c8ecff'; ctx.fillRect(Math.round(this.x) - 4, Math.round(this.y), 9, 1);
    } else drawSpr(ctx, set[f], this.x, this.y + 1 - bob, this.flip);
  }
}

// ───── 船 ─────
class Boat {
  constructor(x, y, angle) { this.x = x; this.y = y; this.angle = angle; this.speed = 0; this.rudder = 0; this.wakeT = 0; this.auto = null; this.passengers = []; }
  update(dt, inp, driven) {
    let steer = 0, thr = 0;
    if (driven) {
      steer = inp.x; thr = -inp.y;
      if ((steer || thr) && this.auto) this.auto = null;
      if (this.auto && !steer && !thr) {
        const dx = this.auto.x - this.x, dy = this.auto.y - this.y, d = Math.hypot(dx, dy);
        if (d < 14) this.auto = null;
        else { const ad = angleDiff(this.angle, Math.atan2(dy, dx)); steer = clamp(ad * 2, -1, 1); thr = Math.abs(ad) < 1.6 ? (d < 50 ? 0.4 : 1) : 0.2; }
      }
    }
    if (steer) this.rudder = clamp(this.rudder + steer * dt * 2.2, -1, 1);
    else this.rudder += (0 - this.rudder) * Math.min(1, dt * 2.5);
    if (thr > 0) this.speed = Math.min(48 * thr + 0.001 > this.speed ? this.speed + 24 * dt : this.speed - 10 * dt, 48);
    else if (thr < 0) this.speed = Math.max(this.speed - 34 * dt, -12);
    else this.speed *= 1 - 0.45 * dt;
    if (Math.abs(this.speed) < 0.3 && !thr) this.speed = 0;

    const turn = this.rudder * 1.6 * clamp(Math.abs(this.speed) / 22, 0.12, 1) * (this.speed < 0 ? -1 : 1);
    const na = this.angle + turn * dt;
    const nx = this.x + Math.cos(na) * this.speed * dt, ny = this.y + Math.sin(na) * this.speed * dt;
    if (boatFree(nx, ny, na)) { this.x = nx; this.y = ny; this.angle = na; }
    else if (boatFree(this.x, this.y, na)) { this.angle = na; this.bumped(); }
    else this.bumped();

    // 船尾浪花
    const sp = Math.abs(this.speed);
    this.wakeT += dt;
    if (sp > 5 && this.wakeT > 0.05) {
      this.wakeT = 0;
      const c = Math.cos(this.angle), s = Math.sin(this.angle);
      for (const side of [-4, 4]) spawn({ x: this.x - c * 12 - s * side, y: this.y - s * 12 + c * side, vx: -c * 4 - s * side * 1.5, vy: -s * 4 + c * side * 1.5, life: rand(0.8, 1.6), col: G.env.bio ? '#7ff8ff' : '#e8f8ff', glow: G.env.bio, drag: 1 });
      if (sp > 30 && Math.random() < 0.5) spawn({ x: this.x + c * 13, y: this.y + s * 13, vx: -s * rand(-12, 12), vy: c * rand(-12, 12), vz: rand(8, 16), g: 60, life: 0.5, col: '#ffffff', glow: G.env.bio });
    }
    Sound.setAmbient('wind', driven ? clamp(sp / 48, 0, 1) * 0.12 : 0);
  }
  bumped() {
    if (Math.abs(this.speed) > 8) {
      Sound.play('bump'); splashAt(this.x + Math.cos(this.angle) * 12, this.y + Math.sin(this.angle) * 12, 8);
      shake(2);
    }
    this.speed = -this.speed * 0.25;
    this.auto = null;
  }
  seatPos(k) {
    const c = Math.cos(this.angle), s = Math.sin(this.angle);
    const along = [-8, 3, 9, -1][k] ?? 0;
    const side = [0, 2, -2, -3][k] ?? 0;
    return { x: this.x + c * along - s * side, y: this.y + s * along + c * side };
  }
  draw(ctx) {
    const bob = Math.sin(G.t * 2.2) > 0.3 ? 1 : 0;
    const spr = SPR.boatRot[rotIndex(this.angle, 32)];
    // 水面倒影/陰影
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#0a2440';
    ctx.drawImage(spr.c, Math.round(this.x - spr.w / 2) + 1, Math.round(this.y - spr.h / 2) + 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(spr.c, Math.round(this.x - spr.w / 2), Math.round(this.y - spr.h / 2) - bob);
    // 乘客
    const riders = [];
    if (G.mode === 'boat') riders.push({ spr: SPR.playerSeat, k: 0, flip: Math.cos(this.angle) < 0 });
    this.passengers.forEach((a, i) => riders.push({ spr: a.lieSpr, k: i + 1, flip: Math.cos(this.angle) < 0, a }));
    riders.sort((r1, r2) => this.seatPos(r1.k).y - this.seatPos(r2.k).y);
    for (const r of riders) { const p = this.seatPos(r.k); drawSpr(ctx, r.spr, p.x, p.y + 3 - bob, r.flip); }
  }
}

// ───── 動物 ─────
const ANIMALS = {
  cat: { name: '貓咪', speed: 20, run: 46, sound: 'meow', sleepy: 0.5 },
  fox: { name: '狐狸', speed: 24, run: 60, sound: 'yip', sleepy: 0.25 },
  sam: { name: '薩摩耶', speed: 32, run: 62, sound: 'woof', sleepy: 0.15 },
};
class Animal {
  constructor(kind, x, y) {
    Object.assign(this, ANIMALS[kind]);
    this.kind = kind; this.x = x; this.y = y; this.home = { x, y };
    this.state = 'idle'; this.timer = rand(1, 3); this.tx = x; this.ty = y; this.facing = 1;
    this.follow = 0; this.trust = kind === 'fox' ? 0 : 1; this.animT = 0; this.zzzT = 0; this.onBoat = false; this.barkT = rand(5, 12);
    this.sprs = kind === 'cat' ? SPR.cat : kind === 'fox' ? SPR.fox : SPR.sam;
    this.lieSpr = kind === 'cat' ? SPR.catLie : kind === 'fox' ? SPR.foxLie : SPR.samLie;
  }
  get level() { return Math.max(0, levelOf(tileAt(this.x, this.y))); }
  moveToward(tx, ty, spd, dt) {
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy);
    if (d < 1.5) return true;
    const vx = (dx / d) * spd * dt, vy = (dy / d) * spd * dt;
    const lv = this.level;
    let ok = false;
    if (canStand(this.x + vx, this.y, lv)) { this.x += vx; ok = true; }
    if (canStand(this.x, this.y + vy, lv)) { this.y += vy; ok = true; }
    if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
    this.animT += dt * (spd > 40 ? 12 : 7);
    this.moving = true;
    if (!ok) { this.state = 'idle'; this.timer = rand(0.3, 1); }
    return d < 3;
  }
  pickWanderTarget(radius) {
    for (let i = 0; i < 12; i++) {
      const x = this.home.x + rand(-radius, radius), y = this.home.y + rand(-radius * 0.7, radius * 0.7);
      if (canStand(x, y, this.level)) { this.tx = x; this.ty = y; return true; }
    }
    return false;
  }
  update(dt) {
    this.moving = false;
    if (this.onBoat) return;
    const p = G.player;
    const dp = dist(this.x, this.y, p.x, p.y);
    const night = G.env.dark > 0.6;
    this.barkT -= dt;

    // 睡覺時偶爾冒出 Zzz
    if (this.state === 'sleep') {
      this.zzzT -= dt;
      if (this.zzzT <= 0) { this.zzzT = 1.6; spawn({ kind: 'spr', spr: SPR.zzz, x: this.x + this.facing * 5, y: this.y - 8, vz: 6, vx: 3, life: 1.5 }); }
    }

    // 狐狸：會害羞，站著不動牠就會慢慢靠近
    if (this.kind === 'fox' && this.trust < 1 && G.mode === 'walk') {
      if (dp < 50 && !p.moving) this.trust = Math.min(1, this.trust + dt * 0.22);
      if (dp < 28 && p.moving && this.state !== 'flee') {
        this.state = 'flee'; this.timer = 1.4;
        const a = Math.atan2(this.y - p.y, this.x - p.x);
        this.tx = this.x + Math.cos(a) * 50; this.ty = this.y + Math.sin(a) * 40;
        spawn({ kind: 'spr', spr: SPR.bang, x: this.x, y: this.y - 12, vz: 4, life: 0.8 });
        if (Math.random() < 0.5) Sound.play('yip');
      }
      if (this.trust >= 1) { toast('🦊 狐狸好像不怕你了！'); this.follow = 20; this.state = 'idle'; }
    }

    if (this.state === 'flee') {
      this.timer -= dt;
      this.moveToward(this.tx, this.ty, this.run, dt);
      if (this.timer <= 0) { this.state = 'idle'; this.timer = 2; }
      return;
    }

    if (this.follow > 0 && G.mode === 'walk') {
      this.follow -= dt;
      if (this.state === 'sleep') this.state = 'idle';
      const off = { cat: [-10, 6], fox: [12, 8], sam: [0, 12] }[this.kind];
      const tx = p.x + off[0], ty = p.y + off[1];
      const d = dist(this.x, this.y, tx, ty);
      if (d > 8) this.moveToward(tx, ty, d > 40 ? this.run : this.speed * 1.4, dt);
      else this.facing = p.x > this.x ? 1 : -1;
      if (d > 160) this.follow = 0;
      if (this.kind === 'sam' && this.barkT < 0) { this.barkT = rand(8, 16); if (dp < 80) Sound.play('woof'); }
      return;
    }

    // 下雨天貓咪躲回屋簷下；夜晚營火亮著就聚過去睡
    const fire = World.fire;
    let rest = null;
    if (G.ev.rain > 0 && this.kind === 'cat') rest = { x: World.house.x + 14, y: World.house.y + 6 };
    else if (night && fire.lit) rest = { x: fire.x + { cat: -14, fox: 16, sam: 2 }[this.kind], y: fire.y + { cat: 4, fox: 2, sam: 13 }[this.kind] };
    else if (night && this.kind !== 'fox') rest = { x: World.house.x + { cat: -10, sam: 14 }[this.kind], y: World.house.y + 10 };

    if (rest) {
      if (dist(this.x, this.y, rest.x, rest.y) > 4 && this.state !== 'sleep') { this.moveToward(rest.x, rest.y, this.speed * 1.3, dt); return; }
      if (this.state !== 'sleep') { this.state = 'sleep'; this.zzzT = 0.5; this.facing = fire.x > this.x ? 1 : -1; }
      return;
    }

    switch (this.state) {
      case 'idle':
        this.timer -= dt;
        if (this.timer <= 0) {
          const r = Math.random();
          if (r < this.sleepy * 0.35) { this.state = 'sleep'; this.timer = rand(8, 16); this.zzzT = 1; }
          else if (this.kind === 'sam' && r > 0.8) { this.state = 'zoom'; this.timer = rand(2.5, 4); this.pickWanderTarget(70); }
          else if (this.pickWanderTarget(this.kind === 'fox' ? 70 : 55)) this.state = 'walk';
          else this.timer = 1;
        }
        break;
      case 'walk':
        if (this.moveToward(this.tx, this.ty, this.speed, dt)) { this.state = 'idle'; this.timer = rand(1.5, 4.5); }
        break;
      case 'zoom':
        this.timer -= dt;
        if (this.moveToward(this.tx, this.ty, this.run, dt)) this.pickWanderTarget(70);
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 2; if (dp < 90) Sound.play('woof'); }
        break;
      case 'sleep':
        this.timer -= dt;
        if (this.timer <= 0) { this.state = 'idle'; this.timer = 1; }
        break;
    }
  }
  pet() {
    const p = G.player;
    this.facing = p.x > this.x ? 1 : -1;
    const treat = G.inv.fish > 0 ? 'fish' : (this.kind === 'sam' && G.inv.apple > 0 ? 'apple' : null);
    if (this.kind === 'fox' && this.trust < 1 && !treat) {
      this.trust = Math.max(0, this.trust - 0.2);
      this.state = 'flee'; this.timer = 1.2;
      this.tx = this.x + (this.x - p.x) * 3; this.ty = this.y + (this.y - p.y) * 3;
      Sound.play('yip');
      toast('🦊 狐狸害羞地跑開了…站著別動，讓牠慢慢靠近吧。');
      return;
    }
    markJournal('pet_' + this.kind);
    if (treat) {
      G.inv[treat]--; saveInv();
      this.trust = 1; this.follow = 70;
      hearts(this.x, this.y - 6, 6);
      Sound.play(this.sound); Sound.play('pickup');
      toast(`${treat === 'fish' ? '🐟' : '🍎'} ${this.name}吃得好開心，決定跟著你一陣子！`);
    } else {
      this.follow = Math.max(this.follow, 30);
      hearts(this.x, this.y - 6, 3);
      if (this.state === 'sleep') {
        if (this.kind === 'cat') Sound.play('purr'); else Sound.play('sniff');
        toast(`${this.name}睡得好熟，被摸了還在${this.kind === 'cat' ? '呼嚕呼嚕' : '打呼'}…`);
        this.follow = 0;
        return;
      }
      Sound.play(this.sound);
      if (this.kind === 'cat') Sound.play('purr');
      const lines = {
        cat: ['喵～ 貓咪蹭了蹭你的腳', '貓咪翻肚子給你摸！', '貓咪用尾巴勾住你的手'],
        fox: ['狐狸瞇起眼睛，尾巴搖了搖', '狐狸輕輕咬了你的袖子', '狐狸把頭靠在你手心'],
        sam: ['汪！薩摩耶露出招牌微笑', '薩摩耶撲上來舔你的臉！', '薩摩耶轉圈圈給你看', '蓬蓬的毛好好摸～'],
      }[this.kind];
      toast(pick(lines));
      if (this.kind === 'sam') { this.state = 'idle'; spawn({ kind: 'spr', spr: SPR.note, x: this.x, y: this.y - 14, vz: 8, life: 1.2 }); }
    }
    this.state = 'idle'; this.timer = 1.5;
  }
  draw(ctx) {
    if (this.onBoat) return;
    const spr = this.state === 'sleep' ? this.lieSpr : this.sprs[this.moving ? Math.floor(this.animT) % 2 : 0];
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillRect(Math.round(this.x - spr.w / 2) + 2, Math.round(this.y), spr.w - 4, 1);
    const bounce = this.moving && Math.floor(this.animT) % 2 ? 1 : 0;
    drawSpr(ctx, spr, this.x, this.y + 1 - bounce, this.facing < 0);
  }
}

// ───── 螃蟹 ─────
class Crab {
  constructor(x, y) { this.x = x; this.y = y; this.tx = x; this.timer = rand(1, 4); this.animT = 0; this.name = '螃蟹'; this.hide = 0; }
  update(dt) {
    const p = G.player;
    if (this.hide > 0) { this.hide -= dt; return; }
    this.timer -= dt;
    const dp = dist(this.x, this.y, p.x, p.y);
    if (dp < 18 && p.moving && G.mode === 'walk') { this.tx = this.x + (this.x > p.x ? 26 : -26); this.timer = 2; }
    if (this.timer <= 0) { this.tx = this.x + rand(-24, 24); this.timer = rand(2, 6); }
    const dx = this.tx - this.x;
    if (Math.abs(dx) > 1) {
      const nx = this.x + Math.sign(dx) * 18 * dt;
      if (tileAt(nx, this.y) === T.SAND) { this.x = nx; this.animT += dt * 10; } else this.tx = this.x;
    }
  }
  draw(ctx) {
    if (this.hide > 0) { ctx.fillStyle = '#c8a870'; ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 3, 1); return; }
    drawSpr(ctx, SPR.crab[Math.floor(this.animT) % 2], this.x, this.y + 1);
  }
}

// ───── 環境小生物：白天蝴蝶、晚上螢火蟲 ─────
function makeCritter(x, y, type) {
  return { type, x, y, ox: x, oy: y, ph: rand(TAU), life: rand(8, 16), col: type === 'butterfly' ? pick(['#ffffff', '#ffe066', '#ff9ad0', '#9ad8ff']) : '#e8ff70' };
}
function updateCritters(dt) {
  const cs = G.critters;
  const want = G.env.dark > 0.5 ? 'firefly' : 'butterfly';
  const target = want === 'firefly' ? 26 : 9;
  if (G.mode === 'walk' || G.env.dark > 0.5) {
    let count = 0;
    for (const c of cs) if (c.type === want) count++;
    if (count < target && Math.random() < 0.3) {
      const x = G.cam.x + rand(G.view.w), y = G.cam.y + rand(G.view.h);
      const t = tileAt(x, y);
      if (t === T.GRASS || t === T.PLATEAU || (want === 'firefly' && t === T.SAND)) cs.push(makeCritter(x, y, want));
    }
  }
  for (let i = cs.length - 1; i >= 0; i--) {
    const c = cs[i];
    c.life -= dt; c.ph += dt;
    if (c.type === 'butterfly') { c.x = c.ox + Math.sin(c.ph * 0.9) * 10 + c.ph * 3; c.y = c.oy + Math.sin(c.ph * 1.7) * 5 - 6; }
    else { c.x = c.ox + Math.sin(c.ph * 0.5) * 12; c.y = c.oy + Math.sin(c.ph * 0.73 + 1) * 8 - 4; }
    if (c.life <= 0 || c.type !== want) cs.splice(i, 1);
  }
}
function drawCritters(ctx, glow) {
  for (const c of G.critters) {
    if ((c.type === 'firefly') !== glow) continue;
    if (c.type === 'butterfly') {
      const open = Math.sin(c.ph * 14) > 0;
      ctx.fillStyle = c.col;
      if (open) { ctx.fillRect(Math.round(c.x) - 1, Math.round(c.y), 1, 1); ctx.fillRect(Math.round(c.x) + 1, Math.round(c.y), 1, 1); }
      else ctx.fillRect(Math.round(c.x), Math.round(c.y) - 1, 1, 1);
      ctx.fillStyle = '#2a1d1a'; ctx.fillRect(Math.round(c.x), Math.round(c.y), 1, 1);
    } else {
      const on = Math.sin(c.ph * 3) > -0.2;
      if (!on) continue;
      ctx.fillStyle = c.col; ctx.fillRect(Math.round(c.x), Math.round(c.y), 1, 1);
    }
  }
}
