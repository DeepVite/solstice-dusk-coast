/* ============================================================
   SOLSTICE — core utilities, deterministic noise, palettes
   Classic scripts; everything hangs off window.SG.
   ============================================================ */
(function () {
  'use strict';

  const SG = (window.SG = window.SG || {});

  // Modern linear workflow: the scene renders into an HDR target and our
  // final grade applies ACES + sRGB by hand.
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

  SG.SEED = 20261018;
  SG.SEA_LEVEL = 12;
  SG.WORLD = { SX: 176, SY: 56, SZ: 176, CHUNK: 16 };
  SG.CFG = {
    reach: 6.4,
    gravity: 23.0,
    eyeHeight: 1.64,
    playerHeight: 1.78,
    playerRadius: 0.32,
    walkSpeed: 5.1,
    sprintSpeed: 8.6,
    flySpeed: 12.5,
    jumpSpeed: 7.6,
    swimSpeed: 3.8,
    editCooldown: 0.17,
    collapseRadius: 8,
    maxCollapse: 420,
    maxDebris: 700
  };

  // The sun sits low over the western sea.
  SG.SUN_DIR = new THREE.Vector3(-0.905, 0.095, -0.42).normalize();
  SG.SUN_AZIMUTH = Math.atan2(-SG.SUN_DIR.x, -SG.SUN_DIR.z);

  SG.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  SG.lerp = (a, b, t) => a + (b - a) * t;
  SG.smoothstep = (a, b, x) => {
    const t = SG.clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  SG.mix = SG.lerp;
  SG.damp = (a, b, lambda, dt) => SG.lerp(a, b, 1 - Math.exp(-lambda * dt));
  SG.wrapAngle = (a) => {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  };
  SG.dampAngle = (a, b, lambda, dt) => a + SG.wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));

  SG.hash32 = function (x, y, z, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1442695041) + Math.imul((seed | 0) + 11, 1103515245);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  SG.hash2 = (x, y, seed) => SG.hash32(x, 0, y, seed || 1);
  SG.rand01 = (x, y, z) => SG.hash32(Math.floor(x), Math.floor(y || 0), Math.floor(z || 0), SG.SEED);

  function fade(t) { return t * t * (3 - 2 * t); }
  SG.noise2 = function (x, y, seed) {
    seed = seed || 1;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const u = fade(xf), v = fade(yf);
    const a = SG.hash2(xi, yi, seed);
    const b = SG.hash2(xi + 1, yi, seed);
    const c = SG.hash2(xi, yi + 1, seed);
    const d = SG.hash2(xi + 1, yi + 1, seed);
    return SG.lerp(SG.lerp(a, b, u), SG.lerp(c, d, u), v);
  };
  SG.noise3 = function (x, y, z, seed) {
    seed = seed || 1;
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = fade(xf), v = fade(yf), w = fade(zf);
    const n000 = SG.hash32(xi, yi, zi, seed);
    const n100 = SG.hash32(xi + 1, yi, zi, seed);
    const n010 = SG.hash32(xi, yi + 1, zi, seed);
    const n110 = SG.hash32(xi + 1, yi + 1, zi, seed);
    const n001 = SG.hash32(xi, yi, zi + 1, seed);
    const n101 = SG.hash32(xi + 1, yi, zi + 1, seed);
    const n011 = SG.hash32(xi, yi + 1, zi + 1, seed);
    const n111 = SG.hash32(xi + 1, yi + 1, zi + 1, seed);
    const x00 = SG.lerp(n000, n100, u), x10 = SG.lerp(n010, n110, u);
    const x01 = SG.lerp(n001, n101, u), x11 = SG.lerp(n011, n111, u);
    return SG.lerp(SG.lerp(x00, x10, v), SG.lerp(x01, x11, v), w);
  };
  SG.fbm2 = function (x, y, octaves, seed, lacunarity, gain) {
    octaves = octaves || 4; seed = seed || 1;
    lacunarity = lacunarity || 2.03; gain = gain || 0.5;
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += SG.noise2(x, y, seed + i * 31) * amp;
      norm += amp; amp *= gain;
      x *= lacunarity; y *= lacunarity;
    }
    return sum / norm;
  };
  SG.fbm3 = function (x, y, z, octaves, seed, lacunarity, gain) {
    octaves = octaves || 3; seed = seed || 1;
    lacunarity = lacunarity || 2.07; gain = gain || 0.5;
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += SG.noise3(x, y, z, seed + i * 43) * amp;
      norm += amp; amp *= gain;
      x *= lacunarity; y *= lacunarity; z *= lacunarity;
    }
    return sum / norm;
  };
  SG.ridged2 = function (x, y, octaves, seed, lacunarity, gain) {
    octaves = octaves || 4; seed = seed || 1;
    lacunarity = lacunarity || 2.05; gain = gain || 0.5;
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = SG.noise2(x, y, seed + i * 31) * 2 - 1;
      sum += (1 - Math.abs(n)) * amp;
      norm += amp; amp *= gain;
      x *= lacunarity; y *= lacunarity;
    }
    return sum / norm;
  };

  class RNG {
    constructor(seed) { this.s = (seed >>> 0) || 0x9e3779b9; }
    next() {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    chance(p) { return this.next() < p; }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    sign() { return this.next() < 0.5 ? -1 : 1; }
  }
  SG.RNG = RNG;

  SG.color = (() => {
    const cache = new Map();
    return (hex) => {
      let c = cache.get(hex);
      if (!c) { c = new THREE.Color(hex); cache.set(hex, c); }
      return c;
    };
  })();
  SG.rgb = (hex) => {
    const c = SG.color(hex);
    return [c.r, c.g, c.b];
  };

  // ---------------------------------------------------------------- blocks
  SG.B = {
    AIR: 0, TURF: 1, DIRT: 2, SAND: 3, STONE: 4, BASALT: 5,
    WOOD: 6, LEAVES: 7, AMBER: 8, MOSS: 9, CORAL: 10
  };
  SG.BI = {};
  function blockInfo(id, o) {
    o = Object.assign({
      top: ['#747d44'], side: ['#4b3b2c'], bottom: ['#3b2d22'],
      span: 3, sound: 'ground', tintBottom: false, emissive: false
    }, o);
    o.id = id;
    o.topRGB = o.top.map(SG.rgb);
    o.sideRGB = o.side.map(SG.rgb);
    o.bottomRGB = o.bottom.map(SG.rgb);
    if (o.strata) o.strataRGB = o.strata.map(SG.rgb);
    SG.BI[id] = o;
  }
  blockInfo(SG.B.TURF, {
    name: '暮草甸', en: 'Dusk Turf', span: 2, sound: 'grass',
    top: ['#778343', '#6d7b40', '#828b48', '#697640'],
    side: ['#5c4935', '#66513b', '#52402f'],
    bottom: ['#3f3126'],
    tip: '海风覆盖的柔软草甸。悬挑过远时会剥落。'
  });
  blockInfo(SG.B.DIRT, {
    name: '沃土', en: 'Loam', span: 2, sound: 'grass',
    top: ['#58412f'], side: ['#5a4532', '#634b36'], bottom: ['#403127']
  });
  blockInfo(SG.B.SAND, {
    name: '落霞沙', en: 'Sunset Sand', span: 1, sound: 'sand',
    top: ['#d2ad86', '#ddb891', '#c7a07b', '#e1bd97'],
    side: ['#b68e6d', '#c19a76', '#ad8567'], bottom: ['#a57f65'],
    tip: '被晚潮熨暖的细沙。几乎不能承受悬挑。'
  });
  blockInfo(SG.B.STONE, {
    name: '海崖岩', en: 'Seacliff Stone', span: 5, sound: 'stone',
    top: ['#555865', '#5d606d', '#4b4e5b'],
    side: ['#474a57', '#505361', '#3f424e'],
    bottom: ['#3a3d48'],
    strata: ['#6b5d55', '#595963', '#726356', '#444956'],
    tip: '带着暮色纹理的海崖岩。可以搭出很长的悬挑。'
  });
  blockInfo(SG.B.BASALT, {
    name: '玄武岩', en: 'Basalt', span: 6, sound: 'stone',
    top: ['#363440', '#403d49', '#302e39'],
    side: ['#302d38', '#393641', '#292630'], bottom: ['#24212b'],
    strata: ['#44394a', '#2e2b37', '#4d414f'],
    tip: '古老而坚硬的玄武岩，是这里最可靠的结构材料。'
  });
  blockInfo(SG.B.WOOD, {
    name: '漂流木', en: 'Driftwood', span: 4, sound: 'wood',
    top: ['#8a6145'], side: ['#674532', '#704b36', '#5b3c2b'], bottom: ['#523528'],
    tip: '被盐和落日漂白的木头。竖直堆叠很坚固。'
  });
  blockInfo(SG.B.LEAVES, {
    name: '珊瑚冠', en: 'Canopy', span: 2, sound: 'leaves',
    top: ['#4b6244'], side: ['#3f5842', '#466047', '#38503d'], bottom: ['#34473a'],
    tip: '低模的树冠团块，轻得能在风里发颤。'
  });
  blockInfo(SG.B.AMBER, {
    name: '日凝琥珀', en: 'Sun Amber', span: 5, sound: 'crystal',
    top: ['#ffc168', '#ff9a3a', '#ffd084'], side: ['#e77c2f', '#ffad4c'], bottom: ['#b85622'],
    emissive: true,
    tip: '凝固的夕光。它在暗处仍然发亮。'
  });
  blockInfo(SG.B.MOSS, {
    name: '苔痕石', en: 'Moss Stone', span: 3, sound: 'stone',
    top: ['#5c704a', '#65794f', '#526645'], side: ['#4b4d50', '#55575a'], bottom: ['#3c3e43'],
    tip: '被雾水养绿的岩块，适合铺成小径。'
  });
  blockInfo(SG.B.CORAL, {
    name: '暮珊瑚', en: 'Dusk Coral', span: 2, sound: 'stone',
    top: ['#d58b7f', '#c97874', '#e0a08d'], side: ['#ba6e6d', '#c77c75'], bottom: ['#9f5e61'],
    tip: '从旧海床抬升上来的珊瑚岩，颜色像晚霞。'
  });

  SG.isSolid = (id) => id !== 0;
  SG.isTreePart = (id) => id === SG.B.WOOD || id === SG.B.LEAVES;
  SG.isOpaque = (id) => id !== 0;
  SG.blockName = (id) => (SG.BI[id] ? SG.BI[id].name : '空气');
  SG.blockSpan = (id) => (SG.BI[id] ? SG.BI[id].span : 2);

  // Hotbar loadout. Creative inventory, infinite supply.
  SG.ITEMS = [
    { type: SG.B.TURF, key: 'turf' },
    { type: SG.B.SAND, key: 'sand' },
    { type: SG.B.STONE, key: 'stone' },
    { type: SG.B.BASALT, key: 'basalt' },
    { type: SG.B.WOOD, key: 'wood' },
    { type: SG.B.LEAVES, key: 'leaves' },
    { type: SG.B.AMBER, key: 'amber' },
    { type: SG.B.MOSS, key: 'moss' },
    { type: SG.B.CORAL, key: 'coral' }
  ];

  // Sampled per face while meshing. Returns a mutable [r,g,b].
  SG.faceColor = function (type, face, x, y, z, hash, out) {
    const info = SG.BI[type];
    if (!info) { out[0] = 0; out[1] = 0; out[2] = 0; return out; }
    let pal = info.sideRGB;
    if (face === 'top') pal = info.topRGB;
    else if (face === 'bottom') pal = info.bottomRGB;
    const idx = Math.floor(hash * pal.length) % pal.length;
    let r = pal[idx][0], g = pal[idx][1], b = pal[idx][2];
    let v = 0.92 + (hash * 0.16);
    if (info.strata && face !== 'top' && face !== 'bottom') {
      const band = 0.5 + 0.5 * Math.sin(y * 1.35 + Math.sin(x * 0.22 + z * 0.19) * 2.6 + hash * 1.4);
      const s = info.strataRGB[Math.floor(band * info.strataRGB.length) % info.strataRGB.length];
      const m = 0.34 + 0.28 * band;
      r = SG.lerp(r, s[0], m); g = SG.lerp(g, s[1], m); b = SG.lerp(b, s[2], m);
    }
    if (type === SG.B.TURF && face === 'top') {
      v *= 0.95 + 0.12 * SG.noise2(x * 0.18, z * 0.18, 7);
    }
    if (y < SG.SEA_LEVEL - 1) {
      const w = SG.clamp((SG.SEA_LEVEL - y) / 8, 0, 0.72);
      r = SG.lerp(r, 0.035, w); g = SG.lerp(g, 0.09, w); b = SG.lerp(b, 0.09, w);
      v *= 0.82;
    }
    out[0] = r * v; out[1] = g * v; out[2] = b * v;
    return out;
  };

  SG.makeGlowColor = function (type, face, hash, out) {
    const pal = type === SG.B.AMBER ? SG.BI[SG.B.AMBER].topRGB : SG.BI[type].topRGB;
    const c = pal[Math.floor(hash * pal.length) % pal.length];
    out[0] = Math.min(1, c[0] * (1.1 + hash * 0.3));
    out[1] = Math.min(1, c[1] * (1.05 + hash * 0.3));
    out[2] = Math.min(1, c[2] * (1.0 + hash * 0.25));
    return out;
  };

  // Shared art direction constants.
  SG.PALETTE = {
    fog: 0xc47b68,
    horizon: 0xc37a76,
    sunWarm: 0xffb05f,
    sunCore: 0xff7a24,
    ivory: 0xf7e7d3,
    ink: 0x140f18,
    plum: 0x2a182d,
    gold: 0xffb35c
  };

  SG.disposables = [];
  SG.track = (obj) => { SG.disposables.push(obj); return obj; };
  SG.dispose = (obj) => {
    if (!obj) return;
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
      else obj.material.dispose();
    }
  };
})();
