'use strict';
// ───────────── 音效：全部用 WebAudio 即時合成，不需要任何音檔 ─────────────

const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus, ambBus, echo;
  let noiseBuf = null;
  let sfxOn = store.get('sfx', true);
  let musicOn = store.get('music', true);
  const amb = {};
  let musicTimer = null, nextNoteTime = 0, step = 0, lastMel = 72;
  let musicMood = 'day';

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.9; master.connect(ctx.destination);
    sfxBus = gainNode(sfxOn ? 0.75 : 0, master);
    ambBus = gainNode(sfxOn ? 0.55 : 0, master);
    musicBus = gainNode(musicOn ? 0.22 : 0, master);

    // 簡易回音，讓鯨魚歌聲與鐘聲更有空間感
    echo = ctx.createDelay(1.0); echo.delayTime.value = 0.32;
    const fb = gainNode(0.38, echo); fb.connect(echo);
    const wet = gainNode(0.5, sfxBus); echo.connect(wet);

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    setupAmbient();
    startMusic();
  }

  function gainNode(v, dest) { const g = ctx.createGain(); g.gain.value = v; if (dest) g.connect(dest); return g; }
  function now() { return ctx.currentTime; }

  function noiseSource(loop = false) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = loop;
    if (loop) s.loopStart = 0, s.loopEnd = 2;
    return s;
  }

  // 一個音：可設定頻率滑音、波形、包絡
  function tone({ type = 'sine', f0 = 440, f1 = null, dur = 0.2, vol = 0.3, attack = 0.005, delay = 0, dest = null, vibrato = 0, vibRate = 6, filter = null, curve = 'exp' }) {
    if (!ctx) return;
    const t = now() + delay;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== null) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    if (vibrato) {
      const lfo = ctx.createOscillator(); lfo.frequency.value = vibRate;
      const lg = gainNode(vibrato); lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter(); f.type = filter.type; f.frequency.value = filter.f; f.Q.value = filter.Q || 1;
      o.connect(f); node = f;
    }
    node.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }

  function noise({ dur = 0.3, vol = 0.3, type = 'bandpass', f0 = 1000, f1 = null, Q = 1, delay = 0, attack = 0.005, dest = null }) {
    if (!ctx) return;
    const t = now() + delay;
    const s = noiseSource();
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = Q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== null) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    if (dur > 1.8) s.loop = true;
    s.start(t, Math.random() * Math.max(0, 1.9 - dur)); s.stop(t + dur + 0.05);
  }

  // ───── 環境音 ─────
  function loopNoise(filterType, freq, Q) {
    const s = noiseSource(true);
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = Q;
    const g = gainNode(0, ambBus);
    s.connect(f); f.connect(g); s.start();
    return { g, f };
  }
  function setupAmbient() {
    amb.ocean = loopNoise('lowpass', 520, 0.6);
    amb.ocean.g.gain.value = 0.16;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.11;
    const lg = gainNode(0.09); lfo.connect(lg); lg.connect(amb.ocean.g.gain); lfo.start();
    amb.waterfall = loopNoise('bandpass', 1300, 0.5);
    amb.rain = loopNoise('highpass', 2400, 0.5);
    amb.wind = loopNoise('bandpass', 420, 1.2);
  }
  function setAmbient(name, v) {
    if (!ctx || !amb[name]) return;
    amb[name].g.gain.setTargetAtTime(v, now(), 0.3);
  }

  // ───── 音樂：依照日夜切換的生成式晶片旋律 ─────
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const PROG = {
    day: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
    night: [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]],
  };
  const PENTA = [0, 2, 4, 7, 9];
  function startMusic() {
    nextNoteTime = now() + 0.2;
    if (musicTimer) clearInterval(musicTimer);
    musicTimer = setInterval(scheduleMusic, 90);
  }
  function scheduleMusic() {
    if (!ctx || !musicOn) return;
    const night = musicMood === 'night';
    const spb = night ? 0.42 : 0.3; // 每個八分音符的秒數
    while (nextNoteTime < now() + 0.4) {
      const bar = Math.floor(step / 8) % 4;
      const beat = step % 8;
      const chord = PROG[night ? 'night' : 'day'][bar];
      const t = nextNoteTime - now();
      if (beat === 0 || beat === 4) {
        tone({ type: 'triangle', f0: mtof(chord[0] - 12), dur: spb * 3.5, vol: 0.18, attack: 0.02, delay: t, dest: musicBus });
      }
      if (beat % 2 === 1) {
        tone({ type: 'sine', f0: mtof(chord[(beat >> 1) % 3] + 12), dur: spb * 0.9, vol: 0.05, delay: t, dest: musicBus });
      }
      if (Math.random() < (night ? 0.38 : 0.55)) {
        let cand = [];
        for (let o = 60; o <= 84; o += 12) for (const p of PENTA) cand.push(o + p);
        cand = cand.filter((m) => Math.abs(m - lastMel) <= 5 && m !== lastMel);
        if (beat === 0) cand = chord.map((c) => c + 12);
        const m = pick(cand.length ? cand : [72]);
        lastMel = m;
        tone({ type: night ? 'triangle' : 'square', f0: mtof(m), dur: spb * (Math.random() < 0.3 ? 1.8 : 0.9), vol: night ? 0.11 : 0.045, attack: 0.01, delay: t, dest: musicBus, filter: { type: 'lowpass', f: 2600 } });
      }
      nextNoteTime += spb;
      step++;
    }
  }

  // ───── 音效庫 ─────
  const fx = {
    meow() {
      tone({ type: 'sawtooth', f0: 520, f1: 880, dur: 0.18, vol: 0.12, filter: { type: 'bandpass', f: 1400, Q: 3 }, curve: 'lin' });
      tone({ type: 'sawtooth', f0: 880, f1: 480, dur: 0.38, vol: 0.12, delay: 0.16, vibrato: 18, filter: { type: 'bandpass', f: 1200, Q: 3 } });
    },
    purr() {
      if (!ctx) return;
      const t = now();
      const s = noiseSource();
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 260;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo = ctx.createOscillator(); lfo.frequency.value = 24;
      const lg = gainNode(0.22); lfo.connect(lg); lg.connect(g.gain);
      const env = gainNode(0); env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(1, t + 0.2); env.gain.linearRampToValueAtTime(0, t + 1.4);
      s.connect(f); f.connect(g); g.connect(env); env.connect(sfxBus);
      s.start(t); lfo.start(t); s.stop(t + 1.5); lfo.stop(t + 1.5);
    },
    woof() {
      for (let i = 0; i < 2; i++) {
        tone({ type: 'square', f0: 330, f1: 150, dur: 0.13, vol: 0.14, delay: i * 0.2, filter: { type: 'lowpass', f: 900 } });
        noise({ dur: 0.1, vol: 0.12, type: 'lowpass', f0: 900, delay: i * 0.2 });
      }
    },
    yip() {
      tone({ type: 'triangle', f0: 900, f1: 1600, dur: 0.09, vol: 0.18, curve: 'lin' });
      tone({ type: 'triangle', f0: 1500, f1: 700, dur: 0.16, vol: 0.16, delay: 0.09 });
      tone({ type: 'triangle', f0: 1100, f1: 1700, dur: 0.12, vol: 0.12, delay: 0.32 });
    },
    splash(v = 0.25) {
      noise({ dur: 0.35, vol: v, type: 'bandpass', f0: 1800, f1: 400, Q: 0.8 });
    },
    step(water) {
      if (water) noise({ dur: 0.12, vol: 0.06, type: 'bandpass', f0: 1500, f1: 600, Q: 1 });
      else noise({ dur: 0.05, vol: 0.035, type: 'highpass', f0: 3000, Q: 0.5 });
    },
    bump() {
      tone({ type: 'sine', f0: 110, f1: 40, dur: 0.3, vol: 0.4 });
      noise({ dur: 0.15, vol: 0.12, type: 'lowpass', f0: 500 });
    },
    horn() {
      tone({ type: 'sawtooth', f0: 110, dur: 1.1, vol: 0.13, attack: 0.08, filter: { type: 'lowpass', f: 700 } });
      tone({ type: 'sawtooth', f0: 165, dur: 1.1, vol: 0.1, attack: 0.08, filter: { type: 'lowpass', f: 700 } });
    },
    bell() {
      [880, 1320, 2217].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 2.2 - i * 0.5, vol: 0.16 / (i + 1), dest: echo }));
      [880, 1320].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 1.6, vol: 0.12 / (i + 1) }));
    },
    pickup() {
      [660, 880, 1320].forEach((f, i) => tone({ type: 'square', f0: f, dur: 0.12, vol: 0.08, delay: i * 0.07, filter: { type: 'lowpass', f: 3000 } }));
    },
    coin() {
      tone({ type: 'square', f0: 988, dur: 0.08, vol: 0.08 });
      tone({ type: 'square', f0: 1319, dur: 0.35, vol: 0.08, delay: 0.08 });
    },
    sparkle() {
      [1047, 1319, 1568, 2093, 2637].forEach((f, i) => tone({ type: 'sine', f0: f, dur: 0.5, vol: 0.07, delay: i * 0.06, dest: echo }));
    },
    whale() {
      tone({ type: 'sine', f0: 180, f1: 120, dur: 1.4, vol: 0.22, attack: 0.3, vibrato: 4, vibRate: 3, dest: echo, curve: 'lin' });
      tone({ type: 'sine', f0: 120, f1: 220, dur: 1.6, vol: 0.18, attack: 0.3, delay: 1.3, vibrato: 5, vibRate: 2.5, dest: echo, curve: 'lin' });
    },
    spout() { noise({ dur: 0.9, vol: 0.18, type: 'bandpass', f0: 700, f1: 2400, Q: 0.6, attack: 0.1 }); },
    dolphin() {
      for (let i = 0; i < 4; i++) tone({ type: 'sine', f0: rand(1800, 2600), f1: rand(2800, 4000), dur: 0.08, vol: 0.06, delay: i * 0.1 + rand(0.03) });
    },
    gull() {
      for (let i = 0; i < 2; i++) tone({ type: 'sawtooth', f0: 1100, f1: 700, dur: 0.22, vol: 0.06, delay: i * 0.28, filter: { type: 'bandpass', f: 1600, Q: 4 } });
    },
    bird() {
      const base = rand(2400, 3600);
      for (let i = 0; i < randInt(2, 4); i++) tone({ type: 'sine', f0: base, f1: base * rand(1.1, 1.4), dur: 0.07, vol: 0.035, delay: i * 0.11 });
    },
    cricket() {
      for (let i = 0; i < 3; i++) tone({ type: 'sine', f0: 4400, dur: 0.035, vol: 0.022, delay: i * 0.06 });
    },
    crackle() { noise({ dur: 0.03, vol: rand(0.04, 0.1), type: 'highpass', f0: 1800 }); },
    ignite() { noise({ dur: 0.6, vol: 0.2, type: 'bandpass', f0: 400, f1: 2000, Q: 0.7, attack: 0.05 }); },
    thunder() { noise({ dur: 2.5, vol: 0.4, type: 'lowpass', f0: 300, f1: 60, attack: 0.05 }); },
    cast() { noise({ dur: 0.25, vol: 0.1, type: 'bandpass', f0: 600, f1: 3000, Q: 2 }); },
    plop() { tone({ type: 'sine', f0: 700, f1: 200, dur: 0.12, vol: 0.2 }); },
    bite() { tone({ type: 'square', f0: 1200, dur: 0.06, vol: 0.08 }); tone({ type: 'square', f0: 1600, dur: 0.08, vol: 0.08, delay: 0.08 }); },
    fail() { tone({ type: 'triangle', f0: 400, f1: 200, dur: 0.35, vol: 0.12 }); },
    leaves() { noise({ dur: 0.5, vol: 0.12, type: 'highpass', f0: 2500, Q: 0.4, attack: 0.05 }); },
    crab() { tone({ type: 'square', f0: 2000, dur: 0.02, vol: 0.06 }); tone({ type: 'square', f0: 2000, dur: 0.02, vol: 0.06, delay: 0.08 }); },
    sniff() { for (let i = 0; i < 3; i++) noise({ dur: 0.08, vol: 0.06, type: 'bandpass', f0: 2500, Q: 2, delay: i * 0.12 }); },
    foghorn() { tone({ type: 'sawtooth', f0: 82, dur: 2.2, vol: 0.12, attack: 0.3, filter: { type: 'lowpass', f: 400 }, dest: echo }); },
    otter() { tone({ type: 'square', f0: 1700, f1: 2300, dur: 0.06, vol: 0.05 }); tone({ type: 'square', f0: 1700, f1: 2300, dur: 0.06, vol: 0.05, delay: 0.1 }); },
    whistle() {
      tone({ type: 'sine', f0: 1400, f1: 2100, dur: 0.18, vol: 0.12, curve: 'lin' });
      tone({ type: 'sine', f0: 1500, f1: 2400, dur: 0.3, vol: 0.12, delay: 0.22, vibrato: 30 });
    },
    coconut() { tone({ type: 'sine', f0: 320, f1: 140, dur: 0.15, vol: 0.3 }); tone({ type: 'square', f0: 200, dur: 0.04, vol: 0.06 }); },
    click() { tone({ type: 'square', f0: 1400, dur: 0.03, vol: 0.05 }); },
  };

  function play(name, ...args) {
    if (!ctx || !sfxOn || !fx[name]) return;
    try { fx[name](...args); } catch (e) { /* 忽略 */ }
  }

  return {
    init,
    play,
    setAmbient,
    setMood(m) { musicMood = m; },
    get sfxOn() { return sfxOn; },
    get musicOn() { return musicOn; },
    toggleSfx() {
      sfxOn = !sfxOn; store.set('sfx', sfxOn);
      if (ctx) { sfxBus.gain.setTargetAtTime(sfxOn ? 0.75 : 0, now(), 0.05); ambBus.gain.setTargetAtTime(sfxOn ? 0.55 : 0, now(), 0.05); }
      return sfxOn;
    },
    toggleMusic() {
      musicOn = !musicOn; store.set('music', musicOn);
      if (ctx) { musicBus.gain.setTargetAtTime(musicOn ? 0.22 : 0, now(), 0.05); if (musicOn) nextNoteTime = now() + 0.1; }
      return musicOn;
    },
  };
})();
