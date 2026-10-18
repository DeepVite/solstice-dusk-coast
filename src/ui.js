/* ============================================================
   SOLSTICE — interface controller and hand-drawn item sigils
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  function $(sel) { return document.querySelector(sel); }
  function canvasIcon(draw) {
    const c = document.createElement('canvas');
    c.width = 96; c.height = 96;
    const ctx = c.getContext('2d');
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    draw(ctx);
    return c;
  }
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((x) => x + x).join('') : h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(hex, a) {
    const c = hexToRgb(hex);
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
  }

  function drawNugget(ctx, palette, shape, opts) {
    opts = opts || {};
    const top = palette[0] || '#777777';
    const mid = palette[1] || top;
    const dark = palette[2] || palette[3] || mid;
    const accent = opts.accent || '#ffd196';
    ctx.save();
    ctx.translate(opts.dx || 0, opts.dy || 0);
    ctx.scale(opts.scale || 1, opts.scale || 1);
    // Contact shadow.
    ctx.beginPath();
    ctx.ellipse(48, 81, 22, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(8,5,12,0.38)';
    ctx.fill();
    if (opts.glow) {
      const g = ctx.createRadialGradient(48, 46, 2, 48, 46, 44);
      g.addColorStop(0, rgba(opts.glow, 0.38));
      g.addColorStop(1, rgba(opts.glow, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 96, 96);
    }
    ctx.beginPath();
    shape.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
    ctx.closePath();
    const bg = ctx.createLinearGradient(20, 15, 70, 84);
    bg.addColorStop(0, top);
    bg.addColorStop(0.48, mid);
    bg.addColorStop(1, dark);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,236,211,0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Top plane.
    ctx.beginPath();
    ctx.moveTo(shape[0][0], shape[0][1]);
    ctx.lineTo(shape[1][0], shape[1][1]);
    ctx.lineTo(shape[1][0] - 8, shape[1][1] + 17);
    ctx.lineTo(shape[0][0] + 7, shape[0][1] + 17);
    ctx.closePath();
    ctx.fillStyle = rgba(top, 0.65);
    ctx.fill();
    // Right plane.
    ctx.beginPath();
    ctx.moveTo(shape[1][0], shape[1][1]);
    ctx.lineTo(shape[2][0], shape[2][1]);
    ctx.lineTo(shape[3][0], shape[3][1]);
    ctx.lineTo(shape[1][0] - 8, shape[1][1] + 17);
    ctx.closePath();
    ctx.fillStyle = rgba(dark, 0.55);
    ctx.fill();
    // Center facet edge.
    ctx.beginPath();
    ctx.moveTo(shape[0][0] + 7, shape[0][1] + 17);
    ctx.lineTo(shape[1][0] - 8, shape[1][1] + 17);
    ctx.lineTo(shape[3][0] - 2, shape[3][1] - 10);
    ctx.lineTo(shape[0][0] + 17, shape[0][1] + 46);
    ctx.closePath();
    ctx.fillStyle = rgba(accent, opts.accentAlpha === undefined ? 0.08 : opts.accentAlpha);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(shape[0][0] + 17, shape[0][1] + 46);
    ctx.lineTo(shape[3][0] - 2, shape[3][1] - 10);
    ctx.lineTo(shape[3][0] + 2, shape[3][1] - 4);
    ctx.strokeStyle = 'rgba(255,238,211,0.18)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (opts.extra) opts.extra(ctx, palette);
    ctx.restore();
  }

  function drawTurf(ctx) {
    const pal = ['#9aa85d', '#687b43', '#4b5b36'];
    drawNugget(ctx, pal, [[28, 19], [67, 23], [82, 52], [67, 78], [32, 81], [15, 53]], {
      extra(c) {
        c.strokeStyle = '#a9ac61'; c.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
          const x = 27 + i * 9;
          c.beginPath(); c.moveTo(x, 24); c.quadraticCurveTo(x - 4 - (i % 2) * 4, 12, x + 2 - (i % 2) * 6, 3 + (i % 3) * 4); c.stroke();
        }
        c.fillStyle = 'rgba(255,225,173,.18)';
        c.fillRect(32, 34, 30, 2);
      }
    });
  }
  function drawSand(ctx) {
    drawNugget(ctx, ['#e4c39e', '#cba57f', '#a47e63'], [[26, 25], [70, 14], [83, 43], [64, 80], [30, 77], [16, 47]], {
      accent: '#ffe3bb', accentAlpha: 0.13,
      extra(c) {
        c.strokeStyle = 'rgba(105,74,57,.35)'; c.lineWidth = 1.2;
        for (let i = 0; i < 4; i++) {
          c.beginPath(); c.moveTo(24 + i * 4, 52 + i * 5);
          c.quadraticCurveTo(45, 47 + i * 4, 67 - i * 2, 53 + i * 5); c.stroke();
        }
        c.fillStyle = 'rgba(255,238,204,.45)';
        [[36, 36], [57, 29], [68, 48], [43, 62]].forEach((p) => c.fillRect(p[0], p[1], 1.4, 1.4));
      }
    });
  }
  function drawStone(ctx) {
    drawNugget(ctx, ['#7a7b88', '#575963', '#3c3f4b'], [[23, 26], [65, 16], [82, 38], [73, 74], [36, 82], [14, 55]], {
      accent: '#a8a7b2', accentAlpha: 0.06,
      extra(c) {
        c.strokeStyle = 'rgba(22,23,29,.5)'; c.lineWidth = 1.4;
        c.beginPath(); c.moveTo(48, 24); c.lineTo(43, 45); c.lineTo(54, 55); c.lineTo(47, 73); c.stroke();
        c.beginPath(); c.moveTo(43, 45); c.lineTo(30, 51); c.stroke();
        c.fillStyle = 'rgba(255,226,191,.20)';
        c.fillRect(31, 30, 19, 1.5);
      }
    });
  }
  function drawBasalt(ctx) {
    ctx.save();
    ctx.translate(0, 2);
    ctx.beginPath();
    ctx.moveTo(37, 72); ctx.lineTo(27, 31); ctx.lineTo(42, 15); ctx.lineTo(62, 23); ctx.lineTo(70, 69); ctx.closePath();
    const g = ctx.createLinearGradient(25, 15, 70, 75);
    g.addColorStop(0, '#5b5563'); g.addColorStop(0.45, '#37343f'); g.addColorStop(1, '#25232d');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,190,.16)'; ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath(); ctx.moveTo(42, 15); ctx.lineTo(50, 26); ctx.lineTo(62, 23); ctx.lineTo(58, 13); ctx.closePath();
    ctx.fillStyle = 'rgba(120,118,132,.55)'; ctx.fill();
    ctx.strokeStyle = 'rgba(15,14,20,.4)';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(37 + i * 10, 73); ctx.lineTo(31 + i * 9, 30); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,190,130,.13)'; ctx.fillRect(35, 38, 23, 2);
    ctx.beginPath(); ctx.ellipse(48, 80, 21, 4, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,5,12,.4)'; ctx.fill();
    ctx.restore();
  }
  function drawWood(ctx) {
    ctx.save();
    ctx.translate(47, 48); ctx.rotate(-0.55); ctx.translate(-47, -48);
    ctx.beginPath();
    ctx.moveTo(23, 35); ctx.lineTo(60, 19); ctx.lineTo(77, 54); ctx.lineTo(70, 69); ctx.lineTo(32, 83); ctx.lineTo(18, 58); ctx.closePath();
    const g = ctx.createLinearGradient(20, 30, 70, 78);
    g.addColorStop(0, '#9d7554'); g.addColorStop(0.5, '#74513b'); g.addColorStop(1, '#543a2c');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(255,222,185,.15)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(61, 42, 13, 20, -0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#c09b76'; ctx.fill();
    ctx.strokeStyle = 'rgba(92,60,43,.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    for (let i = 1; i <= 2; i++) {
      ctx.beginPath(); ctx.ellipse(61, 42, 4 + i * 3, 7 + i * 4, -0.45, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(57,33,24,.38)';
    ctx.beginPath(); ctx.moveTo(27, 45); ctx.lineTo(45, 38); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(24, 58); ctx.lineTo(44, 53); ctx.stroke();
    ctx.restore();
  }
  function drawLeaves(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(48, 80, 23, 5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,5,12,.35)'; ctx.fill();
    const leaves = [
      { x: 32, y: 28, r: -0.75, s: 1.0, c: ['#668159', '#3f5d46'] },
      { x: 63, y: 21, r: 0.85, s: 1.0, c: ['#557549', '#354f3c'] },
      { x: 65, y: 52, r: 0.25, s: 1.08, c: ['#71895a', '#435f45'] },
      { x: 38, y: 60, r: -0.2, s: 1.0, c: ['#537047', '#324b3b'] }
    ];
    for (const lf of leaves) {
      ctx.save(); ctx.translate(lf.x, lf.y); ctx.rotate(lf.r); ctx.scale(lf.s, lf.s);
      ctx.beginPath(); ctx.moveTo(0, -20); ctx.quadraticCurveTo(17, -9, 0, 23); ctx.quadraticCurveTo(-15, -7, 0, -20);
      const g = ctx.createLinearGradient(-10, -20, 10, 20);
      g.addColorStop(0, lf.c[0]); g.addColorStop(1, lf.c[1]);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(231,225,180,.2)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(238,221,169,.28)'; ctx.beginPath(); ctx.moveTo(0, -15); ctx.lineTo(0, 18); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
  function drawAmber(ctx) {
    ctx.save();
    const glow = ctx.createRadialGradient(49, 46, 2, 49, 46, 43);
    glow.addColorStop(0, 'rgba(255,173,74,.5)'); glow.addColorStop(1, 'rgba(255,130,38,0)');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, 96, 96);
    const shards = [
      { pts: [[45, 73], [31, 43], [40, 18], [57, 37], [54, 74]], top: '#ffe2a2', mid: '#ffb454', dark: '#c36417' },
      { pts: [[21, 75], [17, 56], [30, 44], [39, 65], [34, 77]], top: '#ffd28c', mid: '#e88e30', dark: '#a84e16' },
      { pts: [[67, 77], [58, 58], [70, 44], [80, 61], [76, 78]], top: '#ffcd80', mid: '#f29b3e', dark: '#b95a1a' }
    ];
    for (const s of shards) {
      ctx.beginPath(); s.pts.forEach((p, i) => { if (i === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); });
      ctx.closePath();
      const g = ctx.createLinearGradient(20, 20, 70, 80);
      g.addColorStop(0, s.top); g.addColorStop(0.5, s.mid); g.addColorStop(1, s.dark);
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(255,239,199,.55)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(s.pts[1][0], s.pts[1][1]); ctx.lineTo(s.pts[2][0] - 5, s.pts[2][1] + 20); ctx.strokeStyle = 'rgba(255,245,211,.45)'; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,246,207,.9)';
    [[60, 26], [72, 36], [31, 31]].forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 1.2, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }
  function drawMoss(ctx) {
    drawNugget(ctx, ['#6f865c', '#53684d', '#3e4a3a'], [[20, 30], [54, 16], [82, 33], [79, 70], [42, 84], [16, 59]], {
      extra(c) {
        c.fillStyle = 'rgba(157,169,99,.65)';
        c.beginPath(); c.ellipse(42, 27, 21, 8, -0.12, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(104,121,73,.65)';
        c.beginPath(); c.ellipse(60, 47, 13, 8, 0.5, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(182,184,120,.35)';
        c.fillRect(26, 59, 25, 1.4);
      }
    });
  }
  function drawCoral(ctx) {
    ctx.save();
    ctx.beginPath(); ctx.ellipse(48, 81, 22, 4.5, 0, 0, Math.PI * 2); ctx.fillStyle = 'rgba(8,5,12,.35)'; ctx.fill();
    ctx.translate(48, 68);
    const branch = (x1, y1, x2, y2, w, col) => {
      ctx.beginPath(); ctx.moveTo(x1 - w, y1); ctx.quadraticCurveTo((x1 + x2) / 2 - w * 0.2, (y1 + y2) / 2, x2 - w * 0.5, y2);
      ctx.lineTo(x2 + w * 0.5, y2); ctx.quadraticCurveTo((x1 + x2) / 2 + w * 0.7, (y1 + y2) / 2, x1 + w, y1); ctx.closePath();
      ctx.fillStyle = col; ctx.fill();
      ctx.strokeStyle = 'rgba(255,215,199,.25)'; ctx.lineWidth = 1; ctx.stroke();
    };
    branch(0, 0, 0, -43, 8, '#aa6870');
    branch(-1, -20, -22, -48, 5.5, '#c57c7d');
    branch(-1, -20, 20, -42, 5.5, '#b56d74');
    branch(-22, -48, -30, -55, 3.5, '#d99087');
    branch(20, -42, 27, -56, 3.5, '#d99087');
    ctx.fillStyle = '#e1a18e';
    [[0, -44], [-30, -56], [27, -57]].forEach((p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 2.5, 0, Math.PI * 2); ctx.fill(); });
    ctx.restore();
  }

  const ICON_DRAWERS = {
    turf: drawTurf, sand: drawSand, stone: drawStone, basalt: drawBasalt,
    wood: drawWood, leaves: drawLeaves, amber: drawAmber, moss: drawMoss, coral: drawCoral
  };

  class UI {
    constructor() {
      this.el = {
        hud: $('#hud'), menu: $('#menu'), pause: $('#pause'), loading: $('#loading'),
        loadingFill: $('#loading-fill'), loadingPercent: $('#loading-percent'), loadingLabel: $('#loading-label'),
        fade: $('#fade'), fatal: $('#fatal'), fatalCopy: $('#fatal-copy'),
        hotbar: $('#hotbar'), coords: $('#coords-text'), fps: $('#fps-text'),
        toast: $('#toast'), target: $('#target'), targetName: $('#target-name'), targetAction: $('#target-action'),
        crosshair: $('#crosshair'), mode: $('#mode-badge'), modeText: $('#mode-text'),
        selectedName: $('#selected-name'), selectedEn: $('#selected-en'),
        soundButton: $('#sound-button'), pauseSound: $('#pause-sound-button'),
        underwater: $('#underwater-overlay'), collapseFlash: $('#collapse-flash'),
        pauseResume: $('#resume-button'), pauseReturn: $('#return-button'),
        start: $('#start-button'), filmTop: $('#film-top'), filmBottom: $('#film-bottom'),
        itemReadout: $('#item-readout')
      };
      this.handlers = {};
      this.items = [];
      this.selected = 0;
      this._toastTimer = null;
      this._lastVitals = 0;
      this._lastCoords = '';
      this._muted = false;
      this.loadingDone = false;
      this.menuVisible = false;
      this._bind();
    }

    _bind() {
      this.el.start.addEventListener('click', () => this._start());
      this.el.pauseResume.addEventListener('click', () => {
        this.el.pause.classList.add('hidden');
        this.el.pause.setAttribute('aria-hidden', 'true');
        if (this.handlers.onResume) this.handlers.onResume();
      });
      this.el.pauseReturn.addEventListener('click', () => {
        if (this.handlers.onRespawn) this.handlers.onRespawn();
        this.el.pause.classList.add('hidden');
        this.el.pause.setAttribute('aria-hidden', 'true');
        if (this.handlers.onResume) this.handlers.onResume();
      });
      const mute = () => { if (this.handlers.onMute) this.handlers.onMute(); };
      this.el.soundButton.addEventListener('click', (e) => { e.stopPropagation(); mute(); });
      this.el.pauseSound.addEventListener('click', mute);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && this.menuVisible && !this.el.menu.classList.contains('hidden') && this.loadingDone) {
          this._start();
        }
      });
      this.el.pause.addEventListener('mousedown', (e) => e.stopPropagation());
    }

    setHandlers(h) { this.handlers = h; }

    _start() {
      if (!this.loadingDone) return;
      if (this.handlers.onStart) this.handlers.onStart();
    }

    buildHotbar(items) {
      this.items = items;
      this.el.hotbar.innerHTML = '';
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const slot = document.createElement('div');
        slot.className = 'slot';
        slot.dataset.index = i;
        slot.title = item.name + ' · ' + item.en;
        const key = document.createElement('span');
        key.className = 'slot-key'; key.textContent = i + 1;
        const inf = document.createElement('span');
        inf.className = 'slot-inf'; inf.textContent = '∞';
        const drawer = ICON_DRAWERS[item.key] || drawStone;
        const icon = canvasIcon(drawer);
        icon.setAttribute('aria-hidden', 'true');
        slot.appendChild(icon);
        slot.appendChild(key);
        slot.appendChild(inf);
        this.el.hotbar.appendChild(slot);
      }
      this.selectItem(0);
    }

    selectItem(index) {
      this.selected = index;
      const slots = this.el.hotbar.querySelectorAll('.slot');
      slots.forEach((s, i) => s.classList.toggle('active', i === index));
      const item = this.items[index];
      if (item) {
        this.el.selectedName.textContent = item.name;
        this.el.selectedEn.textContent = (item.en || '').toUpperCase();
        const tip = item.tip || '';
        this.el.itemReadout.title = tip;
      }
    }

    setTarget(name, action) {
      if (!name) {
        this.el.target.classList.remove('visible');
        return;
      }
      if (this.el.targetName.textContent !== name) this.el.targetName.textContent = name;
      if (this.el.targetAction.textContent !== action) this.el.targetAction.textContent = action;
      this.el.target.classList.add('visible');
    }

    setCrosshairActive(active) {
      this.el.crosshair.classList.toggle('active', !!active);
    }

    setMode(label, flying) {
      this.el.modeText.textContent = label;
      this.el.mode.classList.toggle('flying', !!flying);
    }

    updateVitals(player) {
      const now = performance.now();
      if (now - this._lastVitals < 120) return;
      this._lastVitals = now;
      const p = player.position;
      const text = 'X ' + String(Math.round(p.x)).padStart(3, '0') + ' · Y ' + String(Math.round(p.y)).padStart(3, '0') + ' · Z ' + String(Math.round(p.z)).padStart(3, '0');
      if (text !== this._lastCoords) {
        this._lastCoords = text;
        this.el.coords.textContent = text;
      }
    }

    setFPS(fps) {
      this.el.fps.textContent = String(Math.max(1, Math.round(fps)));
    }

    setUnderwater(active) {
      this.el.underwater.classList.toggle('active', !!active);
      document.body.classList.toggle('underwater', !!active);
    }

    toast(message, ms) {
      if (!message) return;
      clearTimeout(this._toastTimer);
      this.el.toast.textContent = message;
      this.el.toast.classList.add('show');
      this._toastTimer = setTimeout(() => this.el.toast.classList.remove('show'), ms || 2800);
    }

    warn(message) {
      this.toast(message, 3600);
      this.el.collapseFlash.classList.add('active');
      setTimeout(() => this.el.collapseFlash.classList.remove('active'), 520);
    }

    hideMenu() {
      this.menuVisible = false;
      this.el.menu.classList.add('hidden');
      this.el.menu.setAttribute('aria-hidden', 'true');
      this.el.hud.classList.remove('hidden');
      this.el.hud.setAttribute('aria-hidden', 'false');
      this.el.pause.classList.add('hidden');
      this.el.pause.setAttribute('aria-hidden', 'true');
      document.body.classList.add('playing');
      this.el.fade.classList.add('ready');
    }

    setPaused(paused) {
      if (!this.loadingDone) return;
      if (paused) {
        this.el.pause.classList.remove('hidden');
        this.el.pause.setAttribute('aria-hidden', 'false');
      } else {
        this.el.pause.classList.add('hidden');
        this.el.pause.setAttribute('aria-hidden', 'true');
      }
    }

    setMuted(muted) {
      this._muted = muted;
      this.el.soundButton.classList.toggle('muted', !!muted);
      this.el.pauseSound.textContent = muted ? '声音：关' : '声音：开';
      this.el.soundButton.title = muted ? '恢复声音 (M)' : '静音 (M)';
    }

    toggleHud() {
      this.el.hud.classList.toggle('hud-concealed');
      if (this.el.hud.classList.contains('hud-concealed')) {
        // Briefly show a whisper so the player knows how to get the HUD back.
        this.el.toast.textContent = 'H · 唤回界面';
        this.el.toast.classList.add('show');
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => {
          this.el.toast.classList.remove('show');
          if (this.el.hud.classList.contains('hud-concealed')) this.el.hud.style.opacity = '';
        }, 900);
      }
    }

    toggleHelp() {
      this.toast('WASD 漫步 · Shift 疾跑 / 飞行下降 · 空格跳跃 · 双击空格或 F 飞行 · 左键挖掘 · 右键放置 · 1–9 取物 · H 隐藏界面', 5200);
    }

    setLoadingProgress(percent, label) {
      const p = SG.clamp(percent, 0, 1);
      this.el.loadingFill.style.width = (p * 100).toFixed(1) + '%';
      this.el.loadingPercent.textContent = Math.round(p * 100) + '%';
      if (label) this.el.loadingLabel.textContent = label;
    }

    finishLoading() {
      this.loadingDone = true;
      this.el.loading.classList.add('done');
      this.el.fade.classList.add('ready');
      setTimeout(() => {
        this.menuVisible = true;
        this.el.menu.classList.remove('hidden');
        this.el.menu.setAttribute('aria-hidden', 'false');
        const content = this.el.menu.querySelector('.menu-content');
        if (content) {
          content.style.animation = 'none';
          void content.offsetWidth;
          content.style.animation = '';
        }
        this.el.fade.style.pointerEvents = 'none';
      }, 450);
    }

    fatal(message) {
      this.el.fatal.classList.remove('hidden');
      if (message) this.el.fatalCopy.textContent = message;
      this.el.loading.classList.add('done');
      this.el.menu.classList.add('hidden');
      this.el.pause.classList.add('hidden');
    }
  }

  SG.UI = UI;
})();
