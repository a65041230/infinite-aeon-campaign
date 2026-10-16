'use strict';
// ───────────── 世界地形：島嶼、高台、瀑布、溪流、碼頭 ─────────────

const WORLD_W = 1024, WORLD_H = 768;
const T = { DEEP: 0, SHALLOW: 1, SAND: 2, GRASS: 3, PLATEAU: 4, CLIFF: 5, WATERFALL: 6, POND: 7, STREAM: 8, RIVER: 9, STAIRS: 10, DOCK: 11 };
const CLIFF_H = 18;

const World = {
  type: new Uint8Array(WORLD_W * WORLD_H),
  base: new Uint32Array(WORLD_W * WORLD_H),
  shore: new Uint8Array(WORLD_W * WORLD_H), // 水面到岸邊的距離
  hash: new Uint8Array(WORLD_W * WORLD_H),
  elev: new Float32Array(WORLD_W * WORLD_H),
  props: [],
  flowers: [],
  feature: {},
};

function tileAt(x, y) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return T.DEEP;
  return World.type[y * WORLD_W + x];
}
const isSea = (t) => t === T.DEEP || t === T.SHALLOW;
const isWaterTile = (t) => t <= T.SHALLOW || t === T.WATERFALL || t === T.POND || t === T.STREAM || t === T.RIVER;
function levelOf(t) {
  if (t === T.PLATEAU || t === T.RIVER) return 2;
  if (t === T.STAIRS) return 1;
  if (t === T.SAND || t === T.GRASS || t === T.STREAM || t === T.DOCK) return 0;
  return -1; // 不能走
}

function generateWorld() {
  const noise = makeNoise(42);
  const W = WORLD_W, H = WORLD_H;
  const { type, base, shore, hash, elev } = World;
  const rnd = mulberry32(1234);
  for (let i = 0; i < hash.length; i++) hash[i] = (rnd() * 256) | 0;

  const islets = [
    { x: 840, y: 168, r: 36 }, // 燈塔小島
    { x: 168, y: 612, r: 30 }, // 椰子樹小島
    { x: 880, y: 625, r: 17 },
    { x: 150, y: 165, r: 20 },
    { x: 690, y: 690, r: 11 },
  ];
  const plateau = { x: 500, y: 345, rx: 100, ry: 52 };

  // 1) 高度場
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - 512, dy = (y - 400) * 1.25;
    const ang = Math.atan2(dy, dx);
    const r = 170 + (fbm(noise, Math.cos(ang) * 1.6 + 10, Math.sin(ang) * 1.6 + 10, 3) - 0.5) * 90 + (fbm(noise, x / 30, y / 30, 2) - 0.5) * 18;
    let e = 1 - Math.hypot(dx, dy) / r;
    for (const s of islets) {
      const d = Math.hypot(x - s.x, y - s.y);
      if (d > s.r * 2.2) continue;
      const rr = s.r * (1 + (fbm(noise, x / 14 + s.x, y / 14, 2) - 0.5) * 0.5);
      e = Math.max(e, (1 - d / rr) * 0.6);
    }
    elev[y * W + x] = e;
    let t;
    if (e < -0.11) t = T.DEEP;
    else if (e < 0) t = T.SHALLOW;
    else if (e < 0.075 + (fbm(noise, x / 9, y / 9, 1) - 0.5) * 0.05) t = T.SAND;
    else t = T.GRASS;
    type[y * W + x] = t;
  }

  // 2) 高台
  const inPlat = (x, y) => {
    const nx = (x - plateau.x) / plateau.rx, ny = (y - plateau.y) / plateau.ry;
    return nx * nx + ny * ny < 1 + (fbm(noise, x / 18 + 50, y / 18, 2) - 0.5) * 0.45;
  };
  const bottom = new Int32Array(W).fill(-1);
  for (let y = plateau.y - plateau.ry - 20; y < plateau.y + plateau.ry + 20; y++) for (let x = plateau.x - plateau.rx - 20; x < plateau.x + plateau.rx + 20; x++) {
    const i = y * W + x;
    if (type[i] === T.GRASS && inPlat(x, y)) { type[i] = T.PLATEAU; bottom[x] = Math.max(bottom[x], y); }
  }
  // 3) 懸崖（高台南側往下 CLIFF_H 格）
  for (let x = 0; x < W; x++) {
    if (bottom[x] < 0) continue;
    for (let y = bottom[x] + 1; y <= bottom[x] + CLIFF_H; y++) {
      const i = y * W + x;
      if (type[i] === T.GRASS || type[i] === T.SAND) type[i] = T.CLIFF;
    }
  }

  // 4) 高台上的小河 → 瀑布 → 水潭 → 溪流入海
  const wfX = 500;
  const wfTop = bottom[wfX];
  const riverPts = [[436, 318], [452, 326], [470, 334], [486, 346], [496, 362], [500, 380], [wfX, wfTop + 1]];
  const pond = { x: wfX, y: wfTop + CLIFF_H + 9, r: 13 };
  // 溪流終點：沿著 x 往南找到海
  let mouthY = pond.y;
  while (mouthY < H - 1 && !isSea(type[mouthY * W + 530])) mouthY++;
  const streamPts = [[pond.x, pond.y], [508, pond.y + 22], [524, pond.y + 52], [520, pond.y + 88], [530, mouthY + 4]];
  for (let y = 250; y < Math.min(H, mouthY + 8); y++) for (let x = 400; x < 620; x++) {
    const i = y * W + x, t = type[i];
    if (t === T.PLATEAU && distToPolyline(x, y, riverPts) < 3.2) type[i] = T.RIVER;
    if (t === T.CLIFF && Math.abs(x - wfX) <= 4) type[i] = T.WATERFALL;
    if ((t === T.GRASS || t === T.SAND) && Math.hypot(x - pond.x, (y - pond.y) * 1.2) < pond.r) type[i] = T.POND;
    else if ((t === T.GRASS || t === T.SAND) && y > pond.y && distToPolyline(x, y, streamPts) < 2.6) type[i] = T.STREAM;
  }
  // 水潭上緣接住瀑布
  for (let x = wfX - 4; x <= wfX + 4; x++) for (let y = bottom[x] + 1; y < pond.y; y++) {
    const i = y * W + x; if (type[i] === T.GRASS || type[i] === T.SAND) type[i] = T.POND;
  }

  // 5) 石階（東側）
  const stairX = 574;
  for (let x = stairX - 4; x <= stairX + 4; x++) for (let y = bottom[x] - 1; y <= bottom[x] + CLIFF_H + 1; y++) {
    const i = y * W + x; if (type[i] === T.CLIFF) type[i] = T.STAIRS;
  }

  // 6) 碼頭（南側海灘）
  const dockX = 452;
  let shoreY = 420;
  while (shoreY < H - 1 && !isSea(type[shoreY * W + dockX])) shoreY++;
  const dock = { x: dockX, y0: shoreY - 6, y1: shoreY + 34 };
  for (let y = dock.y0; y <= dock.y1; y++) {
    const wide = y > dock.y1 - 8;
    for (let x = dockX - (wide ? 7 : 3); x <= dockX + (wide ? 7 : 3); x++) type[y * W + x] = T.DOCK;
  }

  World.feature = { wfX, wfTop, pond, stairX, dock, plateau, riverPts, streamPts, islets, bottom };

  // 7) 岸邊距離（多源 BFS，最多 12 格）
  shore.fill(255);
  let q = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (!isSea(type[i])) continue;
    if ((x > 0 && !isSea(type[i - 1])) || (x < W - 1 && !isSea(type[i + 1])) || (y > 0 && !isSea(type[i - W])) || (y < H - 1 && !isSea(type[i + W]))) { shore[i] = 1; q.push(i); }
  }
  for (let d = 2; d <= 12 && q.length; d++) {
    const nq = [];
    for (const i of q) {
      const x = i % W;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j < 0 || j >= W * H || shore[j] !== 255 || !isSea(type[j])) continue;
        shore[j] = d; nq.push(j);
      }
    }
    q = nq;
  }

  bakeColors(noise);
  placeProps(rnd);
}

function bakeColors(noise) {
  const W = WORLD_W, H = WORLD_H;
  const { type, base, hash, elev, shore } = World;
  const C = {
    deep: packHex('#1d5591'), deep2: packHex('#1a4c84'), abyss: packHex('#163f72'),
    shallow: packHex('#2f8fc4'), lagoon: packHex('#4cc3cf'),
    sand: packHex('#f0d69a'), sand2: packHex('#e4c686'), wetSand: packHex('#d4b072'), shell: packHex('#ffb0b8'), pebble: packHex('#b8a888'),
    grass: packHex('#6cbd4a'), grass2: packHex('#62b142'), tuft: packHex('#4a9a35'), tuftL: packHex('#88d060'),
    plat: packHex('#7ccb57'), plat2: packHex('#70bf4d'), rim: packHex('#a2e070'),
    rock: packHex('#8c7c6c'), rock2: packHex('#7a6b5c'), rock3: packHex('#5f5248'), rockL: packHex('#a8988a'),
    pond: packHex('#3a9ed2'), stream: packHex('#5cc0e2'), streamBank: packHex('#4ab0d6'),
    stair: packHex('#b4a494'), stairD: packHex('#857565'),
    plank: packHex('#a8743e'), plankD: packHex('#7e5228'), plankL: packHex('#c08a50'),
  };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, t = type[i], h = hash[i], e = elev[i];
    let c;
    switch (t) {
      case T.DEEP: {
        const n = fbm(noise, x / 40, y / 40, 2);
        c = e < -0.6 ? C.abyss : (n + h / 900 > 0.62 ? C.deep2 : C.deep);
        break;
      }
      case T.SHALLOW: c = mixPacked(C.shallow, C.lagoon, clamp((e + 0.11) / 0.11, 0, 1) * 0.9); break;
      case T.SAND: {
        const nearWater = e < 0.02;
        c = nearWater ? C.wetSand : (h < 30 ? C.sand2 : C.sand);
        if (h === 7) c = C.shell; else if (h > 251) c = C.pebble;
        break;
      }
      case T.GRASS: {
        c = (fbm(noise, x / 12, y / 12, 2) > 0.55) ? C.grass2 : C.grass;
        if (h < 6) c = C.tuft; else if (h > 252) c = C.tuftL;
        break;
      }
      case T.PLATEAU: {
        c = (fbm(noise, x / 12 + 9, y / 12, 2) > 0.55) ? C.plat2 : C.plat;
        if (h < 6) c = C.tuft;
        const below = y + 1 < H ? type[i + W] : t;
        if (below === T.CLIFF || below === T.WATERFALL || below === T.STAIRS) c = C.rim;
        break;
      }
      case T.CLIFF: {
        const top = World.feature.bottom[x];
        const d = y - top; // 1..CLIFF_H
        c = d < 2 ? C.rockL : (d > CLIFF_H - 3 ? C.rock3 : ((d + ((x / 5) | 0)) % 5 === 0 ? C.rock2 : C.rock));
        if (h < 10 && d > 2) c = C.rock2;
        break;
      }
      case T.STAIRS: {
        const top = World.feature.bottom[x];
        const d = y - top;
        c = d % 3 === 0 ? C.stairD : C.stair;
        if (Math.abs(x - World.feature.stairX) === 4) c = C.rock3;
        break;
      }
      case T.POND: c = C.pond; break;
      case T.STREAM: case T.RIVER: c = C.stream; break;
      case T.WATERFALL: c = C.stream; break;
      case T.DOCK: {
        const dk = World.feature.dock;
        c = (y - dk.y0) % 3 === 0 ? C.plankD : (h < 40 ? C.plankL : C.plank);
        if (Math.abs(x - dk.x) === 3 && y < dk.y1 - 8) c = C.plankD;
        break;
      }
      default: c = C.deep;
    }
    base[i] = c;
  }
  // 溪流兩岸的深色邊
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x, t = type[i];
    if ((t === T.STREAM || t === T.RIVER || t === T.POND) && (type[i - 1] !== t && !isWaterTile(type[i - 1]) || type[i + 1] !== t && !isWaterTile(type[i + 1]) || !isWaterTile(type[i - W]))) base[i] = C.streamBank;
  }
}

// ───── 道具擺放 ─────
function walkableAt(x, y) { return levelOf(tileAt(x, y)) >= 0; }
function propBlocked(x, y, r) {
  for (const p of World.props) if (p.r && (x - p.x) ** 2 + ((y - p.y) * 1.4) ** 2 < (p.r + r) ** 2) return true;
  return false;
}

function placeProps(rnd) {
  const F = World.feature;
  const props = World.props;
  props.length = 0;
  const add = (o) => { props.push(o); return o; };
  const near = (x, y, d) => {
    if (Math.hypot(x - F.pond.x, y - F.pond.y) < F.pond.r + d) return true;
    if (distToPolyline(x, y, F.streamPts) < 6 + d * 0.3) return true;
    if (Math.abs(x - F.stairX) < 10 + d * 0.3 && y > F.bottom[F.stairX] - 12 && y < F.bottom[F.stairX] + CLIFF_H + 12) return true;
    if (Math.abs(x - F.dock.x) < 12 + d * 0.3 && Math.abs(y - F.dock.y0) < 16) return true;
    return false;
  };

  const house = add({ kind: 'house', x: 418, y: 470, r: 15, name: '小木屋' });
  const fire = add({ kind: 'campfire', x: 568, y: 484, r: 5, lit: true, name: '營火' });
  add({ kind: 'sign', x: F.dock.x + 12, y: F.dock.y0 - 2, r: 4, name: '告示牌' });
  add({ kind: 'lighthouse', x: 840, y: 168, r: 8, name: '燈塔' });
  World.house = house; World.fire = fire;

  const spaced = (x, y, r) => !propBlocked(x, y, r) && Math.hypot(x - house.x, y - house.y) > 28 && Math.hypot(x - fire.x, y - fire.y) > 34;

  // 樹木
  let tries = 0, trees = 0;
  while (trees < 54 && tries++ < 6000) {
    const x = 300 + rnd() * 430, y = 230 + rnd() * 330;
    const t = tileAt(x, y);
    if (t !== T.GRASS && t !== T.PLATEAU) continue;
    if (tileAt(x, y + 6) === T.CLIFF || tileAt(x, y + 3) === T.CLIFF || tileAt(x, y + 10) === T.WATERFALL) continue;
    if (World.elev[(y | 0) * WORLD_W + (x | 0)] < 0.16) continue;
    if (near(x, y, 10) || !spaced(x, y, 9)) continue;
    if (t === T.PLATEAU && distToPolyline(x, y, F.riverPts) < 8) continue;
    const fruit = t === T.GRASS && rnd() < 0.18;
    add({ kind: 'tree', x: Math.round(x), y: Math.round(y), r: 4, spr: t === T.PLATEAU ? pick(SPR.pines) : fruit ? SPR.fruitTree : SPR.trees[(rnd() * 4) | 0], fruit, shake: 0, name: fruit ? '蘋果樹' : '大樹' });
    trees++;
  }
  // 椰子樹
  const palmSpots = [[168, 606], [176, 620], [158, 618], [874, 620], [845, 186], [150, 160]];
  for (const [x, y] of palmSpots) if (walkableAt(x, y)) add({ kind: 'tree', x, y, r: 3, spr: pick(SPR.palms), palm: true, shake: 0, name: '椰子樹' });
  tries = 0; let palms = 0;
  while (palms < 14 && tries++ < 4000) {
    const x = 320 + rnd() * 400, y = 240 + rnd() * 330;
    if (tileAt(x, y) !== T.SAND || near(x, y, 8) || !spaced(x, y, 10)) continue;
    if (World.elev[(y | 0) * WORLD_W + (x | 0)] < 0.03) continue;
    add({ kind: 'tree', x: Math.round(x), y: Math.round(y), r: 3, spr: pick(SPR.palms), palm: true, shake: 0, name: '椰子樹' });
    palms++;
  }
  // 石頭
  tries = 0; let rocks = 0;
  while (rocks < 18 && tries++ < 3000) {
    const x = 300 + rnd() * 430, y = 230 + rnd() * 330;
    const t = tileAt(x, y);
    if ((t !== T.GRASS && t !== T.SAND && t !== T.PLATEAU) || near(x, y, 6) || !spaced(x, y, 6)) continue;
    const spr = pick(SPR.rocks);
    add({ kind: 'rock', x: Math.round(x), y: Math.round(y), r: spr.w > 12 ? 5 : 3, spr, name: '石頭' });
    rocks++;
  }
  // 海中礁石
  for (const [x, y] of [[300, 300], [740, 470], [610, 640], [380, 150], [960, 400]]) if (isSea(tileAt(x, y))) add({ kind: 'rock', x, y, r: 6, spr: SPR.rocks[1], sea: true, name: '礁石' });

  // 花叢
  const FLOWER_COLS = ['#ff7aa8', '#ffe066', '#ffffff', '#b48cff', '#ff9a4a', '#7ad0ff'];
  World.flowers.length = 0;
  World.patches = [];
  tries = 0;
  while (World.patches.length < 18 && tries++ < 3000) {
    const cx = 310 + rnd() * 410, cy = 240 + rnd() * 320;
    const t = tileAt(cx, cy);
    if ((t !== T.GRASS && t !== T.PLATEAU) || near(cx, cy, 4)) continue;
    const col = FLOWER_COLS[(rnd() * FLOWER_COLS.length) | 0];
    const patch = { x: cx, y: cy, col, name: '花叢' };
    World.patches.push(patch);
    for (let k = 0; k < 14; k++) {
      const x = cx + (rnd() - 0.5) * 22, y = cy + (rnd() - 0.5) * 14;
      if (tileAt(x, y) !== t || propBlocked(x, y, 1)) continue;
      World.flowers.push({ x: Math.round(x), y: Math.round(y), col: rnd() < 0.8 ? col : pick(FLOWER_COLS), ph: rnd() * TAU, patch });
    }
  }
}

// ───── 每幀地形繪製（逐像素，含水波、浪花、瀑布、星光倒影）─────
const PAL = {
  foam: packHex('#eefaff'), foam2: packHex('#a8def0'), glint: packHex('#d8f4ff'), wave: packHex('#3d78b4'),
  wfA: packHex('#e8f8ff'), wfB: packHex('#a6dcf4'), wfC: packHex('#6cc0ea'),
  flowL: packHex('#9ce0f6'), mist: packHex('#f4fcff'),
};

function renderTerrain(buf32, vw, vh, camX, camY, t, env, emissive) {
  const W = WORLD_W, H = WORLD_H;
  const { type, base, shore, hash } = World;
  const band = (t * 2.2) % 1;
  const nightStars = env.dark > 0.45;
  const bio = env.bio;
  const wfT = (t * 70) | 0;
  const flowT = (t * 18) | 0;
  const pond = World.feature.pond;
  for (let vy = 0; vy < vh; vy++) {
    const wy = camY + vy;
    const row = vy * vw;
    for (let vx = 0; vx < vw; vx++) {
      const wx = camX + vx;
      let c;
      if (wx < 0 || wy < 0 || wx >= W || wy >= H) {
        const hh = ((wx * 374761393 + wy * 668265263) >>> 24);
        c = hh < 3 && Math.sin(t * 1.7 + hh * 40 + wx) > 0.8 ? PAL.glint : 0xff723f16;
        buf32[row + vx] = c;
        continue;
      }
      const i = wy * W + wx;
      const ty = type[i];
      c = base[i];
      const h = hash[i];
      if (ty <= T.SHALLOW) {
        const sd = shore[i];
        if (sd <= 7) {
          // 往岸邊推進的浪花帶
          const ph = (sd / 7 + band) % 1;
          if (sd === 1 && (h & 3) !== 0 && Math.sin(t * 3 + h) > -0.4) {
            c = PAL.foam;
            if (bio && h & 1) emissive.push(vx, vy, 1);
          } else if (ph < 0.12 && h > 70) {
            c = sd < 4 ? PAL.foam : PAL.foam2;
            if (bio && h > 140) emissive.push(vx, vy, 1);
          }
        } else if (h < 34) {
          const s = Math.sin(wx * 0.11 + wy * 0.33 + t * 1.3) * Math.sin(wx * 0.04 - t * 0.6 + wy * 0.07);
          if (s > 0.78) c = ty === T.DEEP ? PAL.wave : PAL.foam2;
        }
        if (h === 3) {
          const s = Math.sin(t * 2.1 + i * 0.37);
          if (s > 0.9) c = PAL.glint;
        }
        if (nightStars && (h === 11 || h === 97)) {
          if (Math.sin(t * 2.5 + i) > 0.1) emissive.push(vx, vy, h === 11 ? 0 : 2);
        }
      } else if (ty === T.WATERFALL) {
        const k = (wy - wfT + ((wx * 7) % 13) * 3) % 9;
        c = k < 2 ? PAL.wfA : k < 5 ? PAL.wfB : PAL.wfC;
        if ((wx - World.feature.wfX) * (wx - World.feature.wfX) >= 16) c = k < 3 ? PAL.wfB : PAL.wfC;
      } else if (ty === T.POND) {
        const dd = Math.hypot(wx - pond.x, (wy - pond.y + 8) * 1.5);
        if (dd < 9 && ((h + ((t * 30) | 0)) & 7) < 3) c = PAL.mist;
        else if (h < 10 && Math.sin(t * 2 + h) > 0.5) c = PAL.flowL;
      } else if (ty === T.STREAM || ty === T.RIVER) {
        if (((wy - flowT + (wx & 3)) & 15) === 0 && h & 1) c = PAL.flowL;
      }
      buf32[row + vx] = c;
    }
  }
}
