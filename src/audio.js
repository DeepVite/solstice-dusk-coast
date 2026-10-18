/* ============================================================
   SOLSTICE — procedural surf, wind and material sounds
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.muted = false;
      this.started = false;
      this.noise = null;
      this.master = null;
      this.sfx = null;
      this.loops = [];
      this.underwater = false;
      this._gullTimer = null;
      this._buildNoise = null;
    }

    init() {
      if (this.ctx) return true;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      let ctx;
      try { ctx = this.ctx = new AC(); } catch (e) { return false; }
      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.72;
      this.master.connect(ctx.destination);
      this.muffle = ctx.createBiquadFilter();
      this.muffle.type = 'lowpass';
      this.muffle.frequency.value = 18000;
      this.muffle.Q.value = 0.35;
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.62;
      this.sfx.connect(this.muffle);
      this.muffle.connect(this.master);

      const seconds = 4;
      const rate = ctx.sampleRate;
      const white = ctx.createBuffer(1, rate * seconds, rate);
      const w = white.getChannelData(0);
      for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
      const brown = ctx.createBuffer(1, rate * seconds, rate);
      const b = brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < b.length; i++) {
        const r = Math.random() * 2 - 1;
        last = (last + 0.018 * r) / 1.018;
        b[i] = last * 3.5;
      }
      this.white = white;
      this.brown = brown;
      return true;
    }

    ambience() {
      if (!this.init()) return;
      const ctx = this.ctx;
      if (ctx.state === 'suspended') ctx.resume();
      if (this.started) return;
      this.started = true;
      const t = ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setValueAtTime(this.muted ? 0 : 0.0001, t);
      this.master.gain.exponentialRampToValueAtTime(this.muted ? 0.0001 : 0.72, t + 4.0);

      // Surf: a slow-moving wall of filtered brown noise.
      const surf = ctx.createBufferSource();
      surf.buffer = this.brown; surf.loop = true;
      const surfFilter = ctx.createBiquadFilter();
      surfFilter.type = 'lowpass';
      surfFilter.frequency.value = 620;
      surfFilter.Q.value = 0.6;
      const surfGain = ctx.createGain();
      surfGain.gain.value = 0.12;
      const surfLfo = ctx.createOscillator();
      surfLfo.type = 'sine'; surfLfo.frequency.value = 0.075;
      const surfLfoGain = ctx.createGain(); surfLfoGain.gain.value = 0.055;
      surfLfo.connect(surfLfoGain); surfLfoGain.connect(surfGain.gain);
      const surfFilterLfo = ctx.createOscillator(); surfFilterLfo.frequency.value = 0.043;
      const surfFilterGain = ctx.createGain(); surfFilterGain.gain.value = 220;
      surfFilterLfo.connect(surfFilterGain); surfFilterGain.connect(surfFilter.frequency);
      surf.connect(surfFilter); surfFilter.connect(surfGain); surfGain.connect(this.sfx);
      surf.start(); surfLfo.start(); surfFilterLfo.start();
      this.loops.push(surf, surfLfo, surfFilterLfo);

      // Wind: thin, high noise with a slow breath.
      const wind = ctx.createBufferSource();
      wind.buffer = this.white; wind.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass'; windFilter.frequency.value = 780; windFilter.Q.value = 0.55;
      const windGain = ctx.createGain(); windGain.gain.value = 0.013;
      const windLfo = ctx.createOscillator(); windLfo.frequency.value = 0.11;
      const windLfoGain = ctx.createGain(); windLfoGain.gain.value = 0.009;
      windLfo.connect(windLfoGain); windLfoGain.connect(windGain.gain);
      wind.connect(windFilter); windFilter.connect(windGain); windGain.connect(this.sfx);
      wind.start(); windLfo.start();
      this.loops.push(wind, windLfo);

      // A barely-there drone that gives the coast its still, suspended feeling.
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.004;
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass'; droneFilter.frequency.value = 280;
      droneGain.connect(this.sfx); droneFilter.connect(droneGain);
      [55, 82.41, 110].forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = f;
        o.detune.value = (i - 1) * 5;
        const g = ctx.createGain(); g.gain.value = i === 2 ? 0.24 : 0.4;
        o.connect(g); g.connect(droneFilter); o.start();
        this.loops.push(o);
      });

      this.scheduleGull();
    }

    scheduleGull() {
      if (!this.ctx) return;
      clearTimeout(this._gullTimer);
      this._gullTimer = setTimeout(() => {
        if (!this.muted && !document.hidden) this.gull();
        this.scheduleGull();
      }, 22000 + Math.random() * 26000);
    }

    gull() {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime + 0.02;
      for (let c = 0; c < 2; c++) {
        const start = t + c * 0.35;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(0.026, start + 0.09);
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.48);
        osc.frequency.setValueAtTime(1720 - c * 180, start);
        osc.frequency.exponentialRampToValueAtTime(820, start + 0.3);
        osc.frequency.linearRampToValueAtTime(960, start + 0.44);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 28;
        const lfoG = ctx.createGain(); lfoG.gain.value = 55;
        lfo.connect(lfoG); lfoG.connect(osc.frequency);
        osc.connect(g); g.connect(this.sfx);
        osc.start(start); lfo.start(start);
        osc.stop(start + 0.55); lfo.stop(start + 0.55);
      }
    }

    _noiseBurst(duration, filterType, freq, q, gain, when) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = when === undefined ? ctx.currentTime : when;
      const src = ctx.createBufferSource();
      src.buffer = this.white;
      src.playbackRate.value = 0.8 + Math.random() * 0.45;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType; filter.frequency.value = freq; filter.Q.value = q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      src.connect(filter); filter.connect(g); g.connect(this.sfx);
      src.start(t, Math.random() * 2, duration + 0.06);
      src.stop(t + duration + 0.08);
    }

    _thump(freq, endFreq, duration, gain) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, endFreq), t + duration);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + duration);
      osc.connect(g); g.connect(this.sfx);
      osc.start(t); osc.stop(t + duration + 0.02);
    }

    breakFor(type) {
      if (!this.ctx) return;
      const info = SG.BI[type] || {};
      if (info.sound === 'grass' || info.sound === 'leaves') {
        this._noiseBurst(0.18, 'highpass', 1800, 0.5, 0.10);
        this._noiseBurst(0.24, 'lowpass', 900, 0.6, 0.05);
        this._thump(110, 60, 0.12, 0.028);
      } else if (info.sound === 'sand') {
        this._noiseBurst(0.2, 'highpass', 2600, 0.4, 0.07);
        this._noiseBurst(0.26, 'lowpass', 800, 0.5, 0.04);
      } else if (info.sound === 'wood') {
        this._noiseBurst(0.14, 'bandpass', 600, 3.0, 0.10);
        this._thump(170, 80, 0.18, 0.05);
      } else if (info.sound === 'crystal') {
        this._noiseBurst(0.15, 'highpass', 3000, 0.8, 0.05);
        [720, 1080, 1440].forEach((f, i) => this._blip(f, 0.012, 0.32 + i * 0.02));
        this._thump(150, 70, 0.24, 0.035);
      } else {
        this._noiseBurst(0.19, 'bandpass', 800, 1.1, 0.10);
        this._thump(95, 48, 0.22, 0.06);
      }
    }
    breakStone() {
      if (!this.ctx) return;
      this._noiseBurst(0.42, 'bandpass', 420, 0.7, 0.19);
      this._noiseBurst(0.26, 'highpass', 1800, 0.4, 0.05);
      this._thump(72, 32, 0.48, 0.12);
    }
    placeFor(type) {
      if (!this.ctx) return;
      const info = SG.BI[type] || {};
      if (info.sound === 'grass' || info.sound === 'sand') this._noiseBurst(0.12, 'lowpass', 700, 0.4, 0.07);
      else this._thump(140, 80, 0.13, 0.055);
      this._noiseBurst(0.06, 'highpass', 2200, 0.5, 0.025);
    }
    footstep(soft) {
      if (!this.ctx) return;
      this._noiseBurst(0.08, 'lowpass', 500 + Math.random() * 280, 0.7, soft ? 0.018 : 0.032);
      this._thump(90, 55, 0.08, 0.015);
    }
    _blip(freq, gain, duration) {
      const ctx = this.ctx;
      if (!ctx) return;
      const t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + (duration || 0.16));
      o.connect(g); g.connect(this.sfx);
      o.start(t); o.stop(t + (duration || 0.16) + 0.02);
    }
    blip(freq, gain) { this._blip(freq, gain || 0.02, 0.18); }
    rumble(strength) {
      if (!this.ctx) return;
      const s = strength || 1;
      this._noiseBurst(0.8 + s * 0.5, 'lowpass', 90 + s * 25, 1.2, 0.10 * Math.min(1.6, s));
      this._thump(52, 26, 0.9, 0.07 * Math.min(1.5, s));
    }
    woodCrack() {
      if (!this.ctx) return;
      this._noiseBurst(0.12, 'bandpass', 440, 4, 0.12);
      this._noiseBurst(0.09, 'bandpass', 880, 2, 0.06);
      this._thump(120, 58, 0.28, 0.06);
    }
    toggleMute() {
      this.muted = !this.muted;
      if (this.master) {
        const t = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(t);
        this.master.gain.setTargetAtTime(this.muted ? 0.0001 : 0.72, t, 0.08);
      }
      return this.muted;
    }
    setUnderwater(under) {
      if (!this.ctx || under === this.underwater) return;
      this.underwater = under;
      const t = this.ctx.currentTime;
      this.muffle.frequency.setTargetAtTime(under ? 520 : 18000, t, 0.15);
      this.sfx.gain.setTargetAtTime(under ? 0.5 : 0.62, t, 0.2);
    }
  }

  SG.AudioEngine = AudioEngine;
})();
