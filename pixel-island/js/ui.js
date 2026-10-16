'use strict';
// ───────────── 介面：提示、橫幅、對話框、圖鑑、觸控按鈕 ─────────────

const $ = (id) => document.getElementById(id);

const UI = {
  init() {
    $('btn-time').onclick = () => { toggleDayNight(); $('btn-time').blur(); };
    $('btn-event').onclick = () => { Sound.play('click'); if (!triggerEvent()) toast('海面很平靜，再試一次吧'); G.nextEvent = rand(20, 34); $('btn-event').blur(); };
    $('btn-journal').onclick = () => UI.toggleJournal();
    $('btn-music').onclick = () => { const on = Sound.toggleMusic(); UI.syncButtons(); toast(on ? '🎵 音樂開啟' : '🎵 音樂關閉'); };
    $('btn-sound').onclick = () => { const on = Sound.toggleSfx(); UI.syncButtons(); toast(on ? '🔊 音效開啟' : '🔇 音效關閉'); };
    $('btn-help').onclick = () => UI.help();
    $('btn-map').onclick = () => { $('minimap').hidden = !$('minimap').hidden; };
    $('dialog-ok').onclick = () => UI.closeDialog();
    $('journal-close').onclick = () => UI.toggleJournal(false);
    $('dialog').addEventListener('click', (e) => { if (e.target.id === 'dialog') UI.closeDialog(); });
    UI.syncButtons();
    UI.refreshStats();
    UI.refreshJournal();
    UI.setupTouch();
  },
  syncButtons() {
    $('btn-music').classList.toggle('off', !Sound.musicOn);
    $('btn-sound').classList.toggle('off', !Sound.sfxOn);
    $('btn-sound').textContent = Sound.sfxOn ? '🔊' : '🔇';
  },
  refreshStats() {
    $('stats').textContent = `🪙 ${G.inv.coins}　🐟 ${G.inv.fish}　🍎 ${G.inv.apple}`;
  },
  banner(msg) {
    const el = $('banner');
    el.textContent = msg;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },
  dialogOpen: false,
  dialog(icon, title, html) {
    $('dialog-icon').textContent = icon;
    $('dialog-title').textContent = title;
    $('dialog-text').innerHTML = html;
    $('dialog').hidden = false;
    UI.dialogOpen = true;
    setTimeout(() => $('dialog-ok').focus(), 30);
  },
  closeDialog() { $('dialog').hidden = true; UI.dialogOpen = false; Sound.play('click'); },
  toggleJournal(force) {
    const el = $('journal');
    const show = force === undefined ? el.hidden : force;
    el.hidden = !show;
    if (show) UI.refreshJournal();
    Sound.play('click');
  },
  refreshJournal() {
    const body = $('journal-body');
    if (!body) return;
    let found = 0, total = 0, html = '';
    for (const g of JOURNAL) {
      html += `<h3>${g.group}</h3><ul>`;
      for (const [id, icon, name, hint] of g.items) {
        total++;
        const ok = !!G.journal[id];
        if (ok) found++;
        html += `<li class="${ok ? 'ok' : ''}"><span class="ic">${ok ? icon : '❔'}</span><span><b>${ok ? name : '？？？'}</b>${hint ? `<small>${hint}</small>` : ''}</span></li>`;
      }
      html += '</ul>';
    }
    body.innerHTML = html;
    $('journal-count').textContent = `${found} / ${total}`;
  },
  help() {
    UI.dialog('🏝️', '玩法說明', `
      <div class="help">
      <p><kbd>WASD</kbd> / <kbd>方向鍵</kbd>　走路・掌舵（左右轉舵、上加速、下減速）</p>
      <p><kbd>E</kbd> / <kbd>空白鍵</kbd>　互動：摸動物、上下船、點營火、搖樹、按門鈴…</p>
      <p><kbd>F</kbd>　釣魚（面向水面；浮標動了再按一次）</p>
      <p><kbd>H</kbd>　鳴笛　<kbd>N</kbd>　白天／夜晚　<kbd>J</kbd>　圖鑑　<kbd>M</kbd>　音樂</p>
      <p>也可以直接點擊畫面：走過去、開船過去，或點擊夜空的流星許願。</p>
      <p class="tip">小祕訣：狐狸很害羞，站著不動牠才會靠近。釣到魚可以餵動物，牠們會跟著你，甚至一起上船！</p>
      </div>`);
  },
  setPrompt(text) {
    const el = $('prompt');
    if (UI._prompt === text) return;
    UI._prompt = text;
    el.innerHTML = text || '';
    el.hidden = !text;
  },
  setupTouch() {
    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    $('touch').hidden = !isTouch;
    if (isTouch) $('minimap').hidden = true;
    document.querySelectorAll('#touch [data-key]').forEach((btn) => {
      const k = btn.dataset.key;
      const down = (e) => { e.preventDefault(); Sound.init(); G.keys[k] = true; G.keyPressed[k] = true; btn.classList.add('on'); };
      const up = (e) => { e.preventDefault(); G.keys[k] = false; btn.classList.remove('on'); };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('pointerleave', up);
    });
  },
};

let toastTimer = 0;
function toast(msg) {
  const box = $('toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3200);
}
