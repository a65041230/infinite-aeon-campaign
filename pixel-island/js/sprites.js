'use strict';
// ───────────── 像素精靈圖：字元圖 + 程序生成，載入時一次畫好 ─────────────

function spriteFromPx(px, w, h) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const cx = c.getContext('2d');
  const img = cx.createImageData(w, h);
  new Uint32Array(img.data.buffer).set(px);
  cx.putImageData(img, 0, 0);
  const f = document.createElement('canvas'); f.width = w; f.height = h;
  const fx = f.getContext('2d'); fx.translate(w, 0); fx.scale(-1, 1); fx.drawImage(c, 0, 0);
  return { w, h, px, c, f };
}

function addOutline(px, w, h, col) {
  const src = px.slice();
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (src[y * w + x]) continue;
    if ((x > 0 && src[y * w + x - 1]) || (x < w - 1 && src[y * w + x + 1]) || (y > 0 && src[(y - 1) * w + x]) || (y < h - 1 && src[(y + 1) * w + x])) px[y * w + x] = col;
  }
}

function makeSprite(rows, pal, outline) {
  const pad = outline ? 1 : 0;
  const w = Math.max(...rows.map((r) => r.length)) + pad * 2, h = rows.length + pad * 2;
  const px = new Uint32Array(w * h);
  rows.forEach((r, y) => {
    for (let x = 0; x < r.length; x++) { const p = pal[r[x]]; if (p) px[(y + pad) * w + x + pad] = packHex(p); }
  });
  if (outline) addOutline(px, w, h, packHex(outline));
  return spriteFromPx(px, w, h);
}

// 簡單的像素畫布，用來程序生成精靈
class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Uint32Array(w * h); }
  set(x, y, hex) { x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = typeof hex === 'number' ? hex : packHex(hex); }
  get(x, y) { return this.px[y * this.w + x]; }
  rect(x, y, w, h, hex) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, hex); }
  line(x0, y0, x1, y1, hex) {
    x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) { this.set(x0, y0, hex); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
  }
  sprite(outline) { const p = this.px.slice(); if (outline) addOutline(p, this.w, this.h, packHex(outline)); return spriteFromPx(p, this.w, this.h); }
}

// 最近鄰旋轉，保持像素銳利
function rotateSprite(src, angle, size) {
  const out = new Uint32Array(size * size);
  const cs = Math.cos(angle), sn = Math.sin(angle);
  const c = size / 2, sx = src.w / 2, sy = src.h / 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = x + 0.5 - c, dy = y + 0.5 - c;
    const u = Math.floor(dx * cs + dy * sn + sx), v = Math.floor(-dx * sn + dy * cs + sy);
    if (u >= 0 && v >= 0 && u < src.w && v < src.h) out[y * size + x] = src.px[v * src.w + u];
  }
  return spriteFromPx(out, size, size);
}
function rotations(src, n, size) {
  const arr = [];
  for (let i = 0; i < n; i++) arr.push(rotateSprite(src, (i / n) * TAU, size));
  return arr;
}
const rotIndex = (angle, n) => ((Math.round((angle / TAU) * n) % n) + n) % n;

function drawSpr(ctx, spr, x, y, flip = false, ax = 0.5, ay = 1) {
  ctx.drawImage(flip ? spr.f : spr.c, Math.round(x - spr.w * ax), Math.round(y - spr.h * ay));
}

const OUT = '#2a1d1a';
const SPR = {};

function buildSprites() {
  // ── 貓咪（橘色虎斑）──
  const catPal = { o: '#f0a040', O: '#c86f22', w: '#fff4e0', k: '#2a1d1a', p: '#ff8fa3' };
  const catTop = ['.......o...o', '.......ooooo', 'o......okoko', 'o......oopoo', '.oOoOoOooww.', '.oooooooww..'];
  SPR.cat = [
    makeSprite([...catTop, '..o.o..o.o..', '..w.w..w.w..'], catPal, OUT),
    makeSprite([...catTop, '...oo...oo..', '...ww...ww..'], catPal, OUT),
  ];
  SPR.catLie = makeSprite(['.......o...o', '.......ooooo', 'o......oOoOo', '.o.....oopoo', '.oOoOoOooww.', '.ooooooooooo'], catPal, OUT);

  // ── 狐狸 ──
  const foxPal = { r: '#e8662a', R: '#b8481a', w: '#fff7ec', d: '#3a2620', k: '#1e1412' };
  const foxTop = ['........r.r..', '........rrr..', '.ww.....rkrr.', 'wwr.....rwwwk', 'wrr.rrrrrrw..', '.rrrrrrrrrw..', '..RrrrrrrR...'];
  SPR.fox = [
    makeSprite([...foxTop, '..d.d..d.d...', '..d.d..d.d...'], foxPal, OUT),
    makeSprite([...foxTop, '...dd...dd...', '...dd...dd...'], foxPal, OUT),
  ];
  SPR.foxLie = makeSprite(['........r.r..', '........rrr..', '.ww.....rRrr.', 'wwr.....rwwwk', 'wrrrrrrrrrw..', '.rrrrrrrrrr..'], foxPal, OUT);

  // ── 薩摩耶 ──
  const samPal = { w: '#ffffff', c: '#e4e0d8', C: '#c9c2b6', k: '#1e1a1a', p: '#ff7a8a' };
  const samTop = ['..........w..w.', '.........wwwwww', '.ww......wkwwkw', 'wwcw.....wwkkww', 'wcwwwwwwwwwwpw.', '.wwwwwwwwwwww..', '.wcwcwcwwwwcw..', '..CwwwwwwwwC...'];
  SPR.sam = [
    makeSprite([...samTop, '..ww.ww.ww.ww..', '..cc.cc.cc.cc..'], samPal, '#6a6258'),
    makeSprite([...samTop, '...www...www...', '...ccc...ccc...'], samPal, '#6a6258'),
  ];
  SPR.samLie = makeSprite(['..........w..w.', '.........wwwwww', '.ww......wCwwCw', 'wwcw.....wwkkww', 'wcwwwwwwwwwwww.', '.wwwwwwwwwwwwww', '.CwcwcwwwwwwwC.'], samPal, '#6a6258');

  // ── 主角（戴草帽的水手）──
  const pPal = { y: '#f3cf55', Y: '#c99a2e', s: '#ffd7b0', k: '#2a1d1a', h: '#6b3e26', r: '#e2504c', R: '#b83a38', b: '#3b5bab', w: '#ffffff' };
  const hat = ['..yyyy..', '.yyyyyy.', 'yyYYYYyy'];
  const down = [...hat, '.hssssh.', '.skssks.', '..ssss..', '.rrwwrr.', 'srrrrrrs', 's.rrrr.s', '..bbbb..'];
  const up = [...hat, '.hhhhhh.', '.hhhhhh.', '..hssh..', '.rrrrrr.', 'srrrrrrs', 's.rrrr.s', '..bbbb..'];
  const side = ['..yyyy..', '.yyyyyy.', 'yyYYYYYy', '..hhsss.', '..hhsks.', '...ssss.', '..rrrr..', '..rrrs..', '..rrrr..', '..bbbb..'];
  const legs = [['..b..b..', '..k..k..'], ['..b..b..', '..k.....'], ['..b..b..', '.....k..']];
  const sideLegs = [['..b..b..', '..k..k..'], ['.b...b..', '.k....k.'], ['..b.b...', '..kk....']];
  SPR.player = {
    down: legs.map((l) => makeSprite([...down, ...l], pPal, OUT)),
    up: legs.map((l) => makeSprite([...up, ...l], pPal, OUT)),
    side: sideLegs.map((l) => makeSprite([...side, ...l], pPal, OUT)),
  };
  SPR.playerSeat = makeSprite([...hat, '.hssssh.', '.skssks.', '..ssss..', '.rrwwrr.', 'srrrrrrs'], pPal, OUT);

  // ── 螃蟹 ──
  const crabPal = { c: '#e04a3a', C: '#a8302a', k: '#1a1010', w: '#ffffff' };
  SPR.crab = [
    makeSprite(['c..w.w..c', 'cc.k.k.cc', '.ccccccc.', 'c.CcccC.c', '.c.c.c.c.'], crabPal, OUT),
    makeSprite(['c..w.w..c', 'cc.k.k.cc', '.ccccccc.', 'c.CcccC.c', 'c.c...c.c'], crabPal, OUT),
  ];

  // ── 海洋生物 ──
  const dolPal = { g: '#8095b0', G: '#5a6a82', w: '#e2eaf2', k: '#1a2030' };
  SPR.dolphin = makeSprite(['......G.....', '...gggggg...', 'Ggggggggkggg', 'G..wwwwwwww.'], dolPal, '#26324a');
  SPR.dolphinRot = rotations(SPR.dolphin, 16, 16);

  const flukePal = { n: '#3a4e70', N: '#26344e' };
  SPR.fluke = makeSprite(['nn.......nn', 'nnn.....nnn', '.nnnn.nnnn.', '...nnnnn...', '....nNn....', '....nNn....'], flukePal, '#1a2236');

  const turPal = { g: '#5cbf60', s: '#8a6a32', S: '#5a3f1a', y: '#c8b44a', k: '#1a1a10' };
  SPR.turtle = [
    makeSprite(['..gg....gg...', '...sssssss...', '..sSySySSs...', '.sSyySyySSggk', '..sSySySSs...', '...sssssss...', '..gg....gg...'], turPal, '#20341c'),
    makeSprite(['...gg..gg....', '...sssssss...', '..sSySySSs...', '.sSyySyySSggk', '..sSySySSs...', '...sssssss...', '...gg..gg....'], turPal, '#20341c'),
  ];
  SPR.turtleRot = SPR.turtle.map((s) => rotations(s, 16, 18));

  const jellyPals = [
    { p: '#ff9ad8', P: '#d860b0', w: '#ffe6f6' },
    { p: '#8fd8ff', P: '#4aa0e0', w: '#e6f6ff' },
    { p: '#c9a0ff', P: '#9060e0', w: '#f0e6ff' },
  ];
  SPR.jelly = jellyPals.map((pal) => [
    makeSprite(['..ppppp..', '.pwwpppp.', 'pwppppppp', 'PPPPPPPPP', '.p.p.p.p.', '.p..p..p.', 'p..p..p..'], pal),
    makeSprite(['..ppppp..', '.pwwpppp.', 'pwppppppp', 'PPPPPPPPP', '.p.p.p.p.', '..p..p..p', '.p..p..p.'], pal),
  ]);

  const otterPal = { o: '#8a5a3a', O: '#5e3a22', c: '#e2c49c', k: '#1a1010', s: '#d8d8e8' };
  SPR.otter = [
    makeSprite(['..oo.........', '.occooooooo..', 'okckccsscccoo', '.occcsssccoo.', '..ooooooooo..'], otterPal, '#2a1a10'),
    makeSprite(['..oo.........', '.occooooooo..', 'okckccsscccoo', '.occcsssccooo', '..ooooooooo..'], otterPal, '#2a1a10'),
  ];

  SPR.gull = [
    makeSprite(['w.....w', '.w...w.', '..wkw..'], { w: '#ffffff', k: '#f0a030' }),
    makeSprite(['.......', 'wwwkwww', '.......'], { w: '#ffffff', k: '#f0a030' }),
  ];

  SPR.bottle = makeSprite(['.gggg.', 'cgwwgg', '.gggg.'], { g: '#7ad0a0', c: '#c89a5a', w: '#ffffff' }, '#1d4038');
  SPR.chest = makeSprite(['.BBBBBB.', 'BbbbbbbB', 'ByyyyyyB', 'BbbyybbB', 'BbbbbbbB', '.BBBBBB.'], { b: '#a8682e', B: '#6a3a18', y: '#ffd040' }, '#2a1608');

  // ── 小圖示（對話泡泡）──
  SPR.heart = makeSprite(['rr.rr', 'rrrrr', '.rrr.', '..r..'], { r: '#ff5a7a' }, '#ffffff');
  SPR.note = makeSprite(['..kk', '..kk', '..k.', 'kkk.', 'kk..'], { k: '#5a3ad0' }, '#ffffff');
  SPR.zzz = makeSprite(['zzz', '..z', '.z.', 'zzz'], { z: '#9ab8ff' });
  SPR.bang = makeSprite(['y', 'y', 'y', '.', 'y'], { y: '#ffe040' }, OUT);
  SPR.fishIcon = makeSprite(['..bb.b', '.bbbbb', 'bkbbb.', '.bbbbb', '..bb.b'], { b: '#7ab8e8', k: '#1a1a2a' }, '#ffffff');
  SPR.apple = makeSprite(['.g', 'rr', 'rr'], { r: '#e8383a', g: '#4a9a30' }, OUT);

  buildProps();
  buildBoat();
}

function buildTree(seed, fruit) {
  const rnd = mulberry32(seed);
  const pb = new PixBuf(20, 26);
  // 樹幹
  pb.rect(8, 16, 4, 9, '#7a4a26'); pb.rect(10, 16, 2, 9, '#5a3418'); pb.rect(7, 24, 6, 1, '#5a3418');
  const blobs = [[10, 9, 7.5], [6, 11, 5], [14, 11, 5], [10, 5, 5]];
  for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
    let inside = false;
    for (const [bx, by, br] of blobs) if ((x - bx) ** 2 + (y - by) ** 2 < br * br) inside = true;
    if (!inside) continue;
    const l = (x - 10) * 0.08 + (y - 9) * 0.12 + (rnd() - 0.5) * 0.35;
    pb.set(x, y, l < -0.55 ? '#8fdc5a' : l < -0.1 ? '#62bb46' : l < 0.45 ? '#4a9c3a' : '#33762c');
  }
  if (fruit) for (let i = 0; i < 6; i++) { const fx = 4 + Math.floor(rnd() * 12), fy = 4 + Math.floor(rnd() * 11); if (pb.get(fx, fy)) pb.set(fx, fy, '#e8383a'); }
  return pb.sprite('#1f3a18');
}
function buildPine(seed) {
  const rnd = mulberry32(seed);
  const pb = new PixBuf(16, 26);
  pb.rect(7, 19, 3, 6, '#6a3e20');
  for (let layer = 0; layer < 4; layer++) {
    const top = 1 + layer * 5, hgt = 8;
    for (let j = 0; j < hgt; j++) {
      const half = Math.floor(1 + (j / hgt) * (4 + layer * 0.9));
      for (let i = -half; i <= half; i++) {
        const l = i * 0.15 + (rnd() - 0.5) * 0.4;
        pb.set(8 + i, top + j, l < -0.4 ? '#5aaa58' : l < 0.25 ? '#3a8a48' : '#2a6638');
      }
    }
  }
  return pb.sprite('#16301e');
}
function buildPalm(lean) {
  const pb = new PixBuf(22, 28);
  for (let y = 27; y > 8; y--) {
    const t = (27 - y) / 19;
    const x = 11 + Math.round(lean * t * t * 5);
    pb.set(x, y, (y % 3 === 0) ? '#8a5a2a' : '#b07a3a'); pb.set(x + 1, y, '#8a5a2a');
  }
  const tx = 11 + lean * 5, ty = 8;
  const fronds = [[-9, 3], [-6, -4], [0, -6], [6, -4], [9, 3], [-4, 5], [5, 5]];
  for (const [dx, dy] of fronds) {
    for (let s = 0; s <= 10; s++) {
      const t = s / 10;
      const x = tx + dx * t, y = ty + dy * t + (Math.abs(dx) > 5 ? t * t * 4 : 0);
      pb.set(x, y, t < 0.5 ? '#4aa63a' : '#6cc84a');
      pb.set(x, y + 1, '#2f7a2a');
    }
  }
  pb.set(tx, ty + 1, '#6a4a20'); pb.set(tx + 1, ty + 1, '#6a4a20'); pb.set(tx, ty + 2, '#6a4a20');
  return pb.sprite('#1a3010');
}
function buildRock(seed, big) {
  const rnd = mulberry32(seed);
  const w = big ? 14 : 9, h = big ? 10 : 7;
  const pb = new PixBuf(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h + 0.5) / h;
    if (nx * nx + ny * ny * 1.1 > 1 + (rnd() - 0.5) * 0.2) continue;
    const l = nx * 0.3 + ny * 0.5 + rnd() * 0.25;
    pb.set(x, y, l < -0.35 ? '#c8c2b8' : l < 0 ? '#a29a90' : '#7c746c');
  }
  return pb.sprite('#3a342e');
}

function buildProps() {
  SPR.trees = [];
  for (let i = 0; i < 4; i++) SPR.trees.push(buildTree(11 + i * 7, false));
  SPR.fruitTree = buildTree(99, true);
  SPR.pines = [buildPine(5), buildPine(17), buildPine(29)];
  SPR.palms = [buildPalm(1), buildPalm(-1), buildPalm(0.6)];
  SPR.rocks = [buildRock(3, false), buildRock(8, true), buildRock(21, false)];

  // 小木屋
  const H = new PixBuf(36, 34);
  H.rect(4, 14, 28, 18, '#e8d2a8');
  for (let y = 15; y < 32; y += 3) H.rect(4, y, 28, 1, '#cdb388');
  H.rect(4, 31, 28, 2, '#9a7a52');
  for (let j = 0; j < 14; j++) {
    const x0 = 16 - j - 2, x1 = 19 + j + 2;
    for (let x = x0; x <= x1; x++) H.set(x, j + 1, (j % 3 === 2) ? '#9a3a2a' : ((x + j) % 4 === 0 ? '#c25a3a' : '#b44a32'));
  }
  H.rect(25, 0, 4, 6, '#8a7a6a'); H.rect(25, 0, 4, 1, '#6a5a4a');
  H.rect(15, 21, 7, 11, '#7a4a26'); H.rect(16, 22, 5, 10, '#9a6234'); H.set(20, 27, '#ffd040');
  H.rect(7, 19, 6, 5, '#5a3a20'); H.rect(8, 20, 4, 3, '#6ab0e0'); H.set(10, 20, '#ffffff');
  H.rect(25, 19, 6, 5, '#5a3a20'); H.rect(26, 20, 4, 3, '#6ab0e0'); H.set(28, 20, '#ffffff');
  H.set(23, 18, '#d0b040'); H.set(23, 19, '#d0b040'); // 門鈴
  SPR.house = H.sprite(OUT);
  // 夜晚亮燈的窗戶
  const HN = new PixBuf(36, 34); HN.px.set(H.px);
  HN.rect(8, 20, 4, 3, '#ffd56a'); HN.rect(26, 20, 4, 3, '#ffd56a'); HN.set(10, 20, '#fff3c0'); HN.set(28, 20, '#fff3c0');
  SPR.houseNight = HN.sprite(OUT);

  // 營火
  SPR.fireLogs = makeSprite(['b......b', '.bBbbBb.', 'bBBbbBBb', '.ssssss.'], { b: '#8a5a2a', B: '#5a3418', s: '#7c746c' }, OUT);
  SPR.flames = [0, 1, 2].map((f) => {
    const pb = new PixBuf(8, 10);
    for (let y = 0; y < 10; y++) {
      const half = Math.max(0, Math.round((y / 10) * 3.6 + Math.sin(y * 1.3 + f * 2.1) * 0.8));
      for (let x = -half; x <= half; x++) {
        const edge = Math.abs(x) >= half - 0.5;
        pb.set(4 + x + (f === 1 && y < 4 ? 1 : 0), y, y < 3 ? '#ffe070' : edge ? '#ff6a20' : y < 6 ? '#ffd040' : '#ff9a30');
      }
    }
    return pb.sprite();
  });

  // 告示牌
  SPR.sign = makeSprite(['wwwwwwwww', 'wkkwkwkkw', 'wwwwwwwww', 'wkwkkkwkw', 'wwwwwwwww', '....p....', '....p....', '....p....'], { w: '#c89a5a', k: '#6a4020', p: '#7a4a26' }, OUT);

  // 燈塔
  const L = new PixBuf(16, 44);
  for (let y = 10; y < 40; y++) {
    const half = Math.round(3 + (y - 10) * 0.08);
    const band = Math.floor((y - 10) / 6) % 2 === 0;
    for (let x = -half; x <= half; x++) L.set(8 + x, y, x > half - 2 ? (band ? '#c03030' : '#c8c8c8') : band ? '#e84848' : '#ffffff');
  }
  L.rect(3, 9, 11, 2, '#3a3a4a'); L.rect(5, 3, 7, 6, '#ffe890'); L.rect(5, 3, 1, 6, '#3a3a4a'); L.rect(11, 3, 1, 6, '#3a3a4a'); L.rect(8, 3, 1, 6, '#3a3a4a');
  L.rect(4, 1, 9, 2, '#c03030'); L.set(8, 0, '#3a3a4a');
  L.rect(7, 33, 3, 7, '#5a3a20');
  L.rect(2, 40, 13, 4, '#8a8278'); L.rect(2, 40, 13, 1, '#a8a096');
  SPR.lighthouse = L.sprite(OUT);

  // 碼頭木樁
  SPR.post = makeSprite(['bb', 'BB', 'BB'], { b: '#a8783a', B: '#6a4420' }, OUT);
}

// 船（俯視角，船頭朝右）
function buildBoat() {
  const W = 30, H = 16;
  const pb = new PixBuf(W, H);
  const halfAt = (x) => {
    const t = x / (W - 1);
    if (t < 0.12) return 4 + t * 20;
    if (t < 0.65) return 6.2;
    return 6.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.65) / 0.35) ** 1.6));
  };
  for (let x = 0; x < W; x++) {
    const hw = halfAt(x);
    for (let y = 0; y < H; y++) {
      const dy = Math.abs(y + 0.5 - H / 2);
      if (dy > hw) continue;
      let col = '#8a5428';
      if (dy > hw - 1.3) col = '#5e3418';
      else if (dy > hw - 2.3) col = '#c08a4a';
      else col = (x % 4 === 0) ? '#a06a38' : '#b47a42';
      pb.set(x, y, col);
    }
  }
  pb.rect(4, 5, 5, 6, '#6a3e1e'); pb.rect(5, 6, 3, 4, '#8a5428'); // 船尾座位
  pb.rect(22, 7, 2, 2, '#ffd56a'); // 船頭燈
  // 桅杆與帆
  pb.rect(15, 7, 2, 2, '#3a2a1a');
  for (let i = 0; i < 9; i++) { pb.set(16 - i * 0.2, 7 - i, '#f4f0e6'); pb.set(17 - i * 0.2, 7 - i, '#f4f0e6'); pb.set(18 - i * 0.3, 7 - i, i < 6 ? '#dcd6c8' : '#f4f0e6'); }
  for (let i = 0; i < 10; i++) pb.set(16 - i, 8, '#6a4a2a');
  SPR.boat = pb.sprite('#2a160a');
  SPR.boatRot = rotations(SPR.boat, 32, 34);
}

// 預先算好硬邊像素圓（光源使用）
const _circleCache = {};
function pixelCircle(r) {
  r = Math.max(1, Math.round(r));
  if (_circleCache[r]) return _circleCache[r];
  const s = r * 2 + 1;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const cx = c.getContext('2d');
  const img = cx.createImageData(s, s);
  const d = new Uint32Array(img.data.buffer);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) if ((x - r) ** 2 + (y - r) ** 2 <= r * r + r * 0.5) d[y * s + x] = 0xffffffff;
  cx.putImageData(img, 0, 0);
  _circleCache[r] = c;
  return c;
}
