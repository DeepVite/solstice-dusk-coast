/* ============================================================
   SOLSTICE — procedural coastal voxel world, meshing, raycast
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;
  const { SX, SY, SZ, CHUNK } = SG.WORLD;
  const SEA = SG.SEA_LEVEL;
  const SEED = SG.SEED;
  const B = SG.B;

  const FACES = [
    { n: [1, 0, 0], face: 'side', shade: 0.94, t1: 2, t2: 1,
      corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { n: [-1, 0, 0], face: 'side', shade: 0.86, t1: 2, t2: 1,
      corners: [[0, 0, 1], [0, 1, 1], [0, 1, 0], [0, 0, 0]] },
    { n: [0, 1, 0], face: 'top', shade: 1.05, t1: 0, t2: 2,
      corners: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
    { n: [0, -1, 0], face: 'bottom', shade: 0.64, t1: 0, t2: 2,
      corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
    { n: [0, 0, 1], face: 'side', shade: 0.91, t1: 0, t2: 1,
      corners: [[1, 0, 1], [1, 1, 1], [0, 1, 1], [0, 0, 1]] },
    { n: [0, 0, -1], face: 'side', shade: 0.84, t1: 0, t2: 1,
      corners: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }
  ];
  const AO_LEVEL = [0.42, 0.62, 0.82, 1.0];

  const TREE_STYLES = {
    broad: {
      leaf: ['#3d5a43', '#49684b', '#34503e', '#536e47', '#61794c'],
      wood: ['#5a4131', '#684c37', '#4c362a']
    },
    pine: {
      leaf: ['#29483f', '#335647', '#213d38', '#3a5e49', '#45674d'],
      wood: ['#4c392d', '#5b4433', '#413025']
    },
    coral: {
      leaf: ['#986065', '#ad7072', '#8b575c', '#c1837a', '#a86d6b'],
      wood: ['#584036', '#654a3b', '#49352d']
    },
    shore: {
      leaf: ['#4c6543', '#5d724a', '#415b40', '#6a7d4c'],
      wood: ['#7b5e45', '#8b6b4d', '#684e3a']
    }
  };
  SG.TREE_STYLES = TREE_STYLES;

  class World {
    constructor(scene) {
      this.scene = scene;
      this.group = new THREE.Group();
      this.group.name = 'voxel-world';
      scene.add(this.group);
      this.blocks = new Uint8Array(SX * SY * SZ);
      this.treeIds = new Int16Array(SX * SY * SZ);
      this.heightMap = new Int16Array(SX * SZ);
      this.surfaceMap = new Int16Array(SX * SZ);
      this.slopeMap = new Uint8Array(SX * SZ);
      this.trees = [];
      this.chunks = new Map();
      this.dirty = new Set();
      this.treeRevision = 0;
      this.decorLogs = new Set();
      this.decorLeaves = new Set();
      this.spawn = { x: 108, z: 92, y: 22, yaw: 1.15, pitch: -0.04 };
      this.spawnPoint = null;
      this._tmpColor = [0, 0, 0];
      this._materials = null;
    }

    idx(x, y, z) { return (y * SZ + z) * SX + x; }
    inBounds(x, y, z) { return x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ; }
    get(x, y, z) {
      if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return 0;
      return this.blocks[(y * SZ + z) * SX + x];
    }
    getTreeId(x, y, z) {
      if (x < 0 || x >= SX || y < 0 || y >= SY || z < 0 || z >= SZ) return 0;
      return this.treeIds[(y * SZ + z) * SX + x];
    }
    isSolid(x, y, z) { return this.get(x, y, z) !== 0; }
    isTreeAt(x, y, z) {
      const id = this.getTreeId(x, y, z);
      return id > 0 ? this.trees[id - 1] : null;
    }

    coastX(z) {
      return 51
        + 12.5 * Math.sin(z * 0.043 + 0.75)
        + 6.5 * Math.sin(z * 0.016 + 2.15)
        + (SG.noise2(z * 0.055, 4.2, SEED + 201) - 0.5) * 12;
    }

    terrainHeightRaw(x, z) {
      const coast = this.coastX(z);
      const d = x - coast;
      const nLow = SG.fbm2(x * 0.016 + 9.3, z * 0.016 - 3.7, 4, SEED + 11);
      const nHill = SG.fbm2(x * 0.043 - 4.1, z * 0.043 + 8.7, 5, SEED + 12);
      const ridge = SG.ridged2(x * 0.0125 + 3.2, z * 0.0125 + 7.1, 4, SEED + 13);
      let h;
      if (d < 0) {
        const deep = -d;
        h = SEA - 1.0
          - SG.smoothstep(0, 18, deep) * 6.4
          - SG.smoothstep(16, 68, deep) * 4.6;
        h += (nLow - 0.5) * 2.6 * (0.25 + 0.75 * SG.smoothstep(0, 30, deep));
        h += (SG.noise2(x * 0.095, z * 0.095, SEED + 14) - 0.5) * 0.8;
      } else {
        const beachW = 5.2 + 8.5 * SG.noise2(z * 0.047, 12.1, SEED + 15);
        const cliffMask = SG.smoothstep(0.52, 0.78, SG.noise2(z * 0.034, 4.4, SEED + 16));
        const d2 = Math.max(0, d - beachW);
        const bank = SG.smoothstep(0, 11, d2) * (2.2 + cliffMask * 7.3);
        const slope = d2 * 0.135;
        const hills = (nHill - 0.5) * 11.0 * (0.22 + SG.smoothstep(2, 42, d2) * 0.78);
        const mount = Math.pow(ridge, 1.75) * 20.0 * SG.smoothstep(44, 112, d2);
        const warp = (nLow - 0.5) * 2.4;
        h = 13.2 + bank + slope + hills + mount + warp;
      }
      // A handful of wave-cut islets / sea stacks out in the bay.
      const is1 = 9.0 * Math.exp(-(((x - 16) / 8.0) ** 2 + ((z - 63) / 6.0) ** 2));
      const is2 = 7.0 * Math.exp(-(((x - 28) / 5.2) ** 2 + ((z - 134) / 7.4) ** 2));
      const is3 = 5.0 * Math.exp(-(((x - 7) / 3.4) ** 2 + ((z - 98) / 3.0) ** 2));
      const is4 = 4.2 * Math.exp(-(((x - 35) / 3.8) ** 2 + ((z - 35) / 4.2) ** 2));
      h += is1 + is2 + is3 + is4;
      if (d > 0) h = 13.2 + (h - 13.2) * 0.78;
      return Math.min(SY - 12, h);
    }

    generateHeights(onProgress) {
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          this.heightMap[z * SX + x] = Math.max(1, Math.round(this.terrainHeightRaw(x, z)));
        }
      }
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const h = this.heightMap[z * SX + x];
          let slope = 0;
          for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue;
            const xx = SG.clamp(x + dx, 0, SX - 1), zz = SG.clamp(z + dz, 0, SZ - 1);
            slope = Math.max(slope, Math.abs(h - this.heightMap[zz * SX + xx]));
          }
          this.slopeMap[z * SX + x] = slope;
        }
      }
      if (onProgress) onProgress(0.08);
    }

    surfaceBlockAt(x, z, h, slope) {
      const d = x - this.coastX(z);
      const n = SG.fbm2(x * 0.055 + 2.4, z * 0.055 - 7.2, 3, SEED + 31);
      const beachW = 5.2 + 8.5 * SG.noise2(z * 0.047, 12.1, SEED + 15);
      if (h < SEA - 2.5) {
        return n > 0.62 ? B.MOSS : (h > SEA - 6 ? B.SAND : B.STONE);
      }
      if (h <= SEA + 1) return n > 0.79 ? B.CORAL : B.SAND;
      if (d > 0 && d < beachW + 3.5 && h < SEA + 4.2) {
        return n > 0.86 ? B.CORAL : B.SAND;
      }
      if (h > 36 || slope >= 5) return n > 0.72 ? B.BASALT : B.STONE;
      if (slope >= 3 || h > 30) return n > 0.58 ? B.MOSS : B.STONE;
      if (n > 0.74) return B.MOSS;
      return B.TURF;
    }

    generateTerrain(onProgress) {
      this.generateHeights();
      let done = 0;
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const hi = z * SX + x;
          const h = this.heightMap[hi];
          const slope = this.slopeMap[hi];
          const surface = this.surfaceBlockAt(x, z, h, slope);
          const coast = this.coastX(z);
          const d = x - coast;
          const underwater = h < SEA;
          for (let y = 1; y <= h; y++) {
            const depth = h - y;
            let type = B.STONE;
            if (surface === B.SAND) {
              if (depth === 0) type = B.SAND;
              else if (depth < 5) type = B.SAND;
              else type = depth < 7 ? B.DIRT : B.STONE;
            } else if (surface === B.TURF) {
              if (depth === 0) type = B.TURF;
              else if (depth < 4) type = B.DIRT;
              else type = B.STONE;
            } else if (surface === B.MOSS) {
              if (depth === 0) type = B.MOSS;
              else if (depth < 3) type = B.DIRT;
              else type = B.STONE;
            } else if (surface === B.CORAL) {
              if (depth === 0) type = B.CORAL;
              else if (depth < 3) type = B.SAND;
              else type = B.STONE;
            } else {
              type = depth === 0 ? surface : B.STONE;
            }
            // Sedimentary pockets and hard basalt shelves.
            if (depth > 5 && type === B.STONE && SG.hash2(x * 3 + y, z * 5 - y, SEED + 41) > 0.972) {
              type = B.BASALT;
            }
            if (depth > 7 && type === B.STONE && SG.hash2(x + y * 7, z - y * 5, SEED + 42) > 0.993) {
              type = B.AMBER;
            }
            // Crimson coral shelves in the shallows.
            if (underwater && depth === 0 && surface === B.STONE && SG.noise2(x * 0.17, z * 0.17, SEED + 43) > 0.72) {
              type = B.CORAL;
            }
            this.blocks[this.idx(x, y, z)] = type;
          }
          this.blocks[this.idx(x, 0, z)] = B.BASALT;

          done++;
        }
        if (onProgress && (z & 7) === 7) onProgress(0.08 + 0.42 * (done / (SX * SZ)));
      }
      this.carveCaves(onProgress);
      this.buildSurfaceMap();
      if (onProgress) onProgress(0.53);
    }

    carveCaves(onProgress) {
      const rng = new SG.RNG(SEED + 1701);
      const world = this;
      const carveSphere = (cx, cy, cz, r, allowSurface) => {
        const x0 = Math.max(2, Math.floor(cx - r)), x1 = Math.min(SX - 3, Math.ceil(cx + r));
        const y0 = Math.max(2, Math.floor(cy - r)), y1 = Math.min(SY - 4, Math.ceil(cy + r));
        const z0 = Math.max(2, Math.floor(cz - r)), z1 = Math.min(SZ - 3, Math.ceil(cz + r));
        const rr = r * r;
        for (let y = y0; y <= y1; y++) {
          for (let z = z0; z <= z1; z++) {
            const dz = z + 0.5 - cz;
            for (let x = x0; x <= x1; x++) {
              const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
              if (dx * dx + dz * dz + dy * dy > rr) continue;
              const h = world.heightMap[z * SX + x];
              if (!allowSurface && y > h - 3) continue;
              if (y < 2) continue;
              world.blocks[world.idx(x, y, z)] = 0;
            }
          }
        }
      };
      // Wandering worm-tunnels. Narrow enough to leave readable, walkable
      // caves, with occasional chambers where they cross.
      const tunnelCount = 26;
      for (let i = 0; i < tunnelCount; i++) {
        let x = 0, z = 0, h = 0, tries = 0;
        do {
          x = rng.int(8, SX - 9); z = rng.int(8, SZ - 9);
          h = this.heightMap[z * SX + x];
          tries++;
        } while ((h < SEA + 5 || h > 45) && tries < 80);
        if (h < SEA + 5) continue;
        const startY = SG.clamp(h - rng.int(6, 18), 4, h - 7);
        const heading = rng.range(0, Math.PI * 2);
        const length = rng.int(28, 76);
        const radius = rng.range(1.5, 2.55);
        const bend = rng.range(-0.55, 0.55);
        const phase = rng.range(0, 6.28);
        const step = 0.72;
        for (let s = 0; s < length / step; s++) {
          const d = s * step;
          const a = heading + Math.sin(d * 0.045 + phase) * bend;
          const cx = x + Math.cos(a) * d + Math.sin(d * 0.13 + phase) * 1.3;
          const cz = z + Math.sin(a) * d + Math.cos(d * 0.11 + phase) * 1.3;
          let cy = startY + Math.sin(d * 0.07 + phase) * 1.8 + Math.sin(d * 0.19 + phase * 2.1) * 0.75;
          if (cy > h - 5) cy = h - 5;
          if (cy < 3.5) cy = 3.5;
          carveSphere(cx, cy, cz, radius * (0.88 + Math.sin(d * 0.17 + phase) * 0.12), false);
        }
      }
      // A handful of low, damp chambers. They are the most likely places for
      // a careless miner to bring the roof down.
      for (let i = 0; i < 8; i++) {
        let x = 0, z = 0, h = 0, tries = 0;
        do {
          x = rng.int(12, SX - 13); z = rng.int(12, SZ - 13);
          h = this.heightMap[z * SX + x]; tries++;
        } while ((h < SEA + 6 || h > 44) && tries < 80);
        if (h < SEA + 6) continue;
        const y = rng.range(SEA - 1, h - 8);
        const r = rng.range(2.8, 4.1);
        carveSphere(x + 0.5, y, z + 0.5, r, false);
        carveSphere(x + 0.5 + rng.range(-2, 2), y + rng.range(-1, 1.5), z + 0.5 + rng.range(-2, 2), r * 0.72, false);
      }
      // Find two sea-cliff mouths so the caves announce themselves.
      let mouths = 0;
      for (let attempt = 0; attempt < 1200 && mouths < 3; attempt++) {
        const x = rng.int(10, SX - 12), z = rng.int(10, SZ - 12);
        const h = this.heightMap[z * SX + x];
        if (h < SEA + 6) continue;
        const west = this.heightMap[z * SX + Math.max(0, x - 5)];
        if (h - west < 4) continue;
        const cy = Math.max(SEA + 2.5, h - 4);
        for (let t = -5; t <= 8; t += 0.7) {
          const cx = x + t;
          const yy = cy - Math.max(0, t) * 0.17;
          carveSphere(cx, yy + Math.sin(t * 0.25) * 0.3, z + t * 0.08, 2.15 - Math.abs(t) * 0.035, true);
        }
        mouths++;
      }
      this.caveMouths = mouths;
      if (onProgress) onProgress(0.51);
    }

    buildSurfaceMap() {
      for (let z = 0; z < SZ; z++) for (let x = 0; x < SX; x++) {
        let y = SY - 1;
        while (y > 0 && this.blocks[this.idx(x, y, z)] === 0) y--;
        this.surfaceMap[z * SX + x] = y;
      }
    }

    naturalSurface(x, z) {
      if (x < 0 || x >= SX || z < 0 || z >= SZ) return -1;
      return this.surfaceMap[z * SX + x];
    }

    // Highest solid terrain directly under (x,z), optionally ignoring trees.
    topSolid(x, z, ignoreTree) {
      x = Math.floor(x); z = Math.floor(z);
      if (x < 0 || x >= SX || z < 0 || z >= SZ) return -1;
      for (let y = SY - 1; y >= 0; y--) {
        const b = this.get(x, y, z);
        if (b && (!ignoreTree || !SG.isTreePart(b))) return y;
      }
      return -1;
    }

    floorBelow(x, y, z) {
      x = Math.floor(x); y = Math.floor(y); z = Math.floor(z);
      if (x < 0 || x >= SX || z < 0 || z >= SZ) return -1;
      y = Math.min(y, SY - 1);
      for (let yy = y; yy >= 0; yy--) {
        const b = this.get(x, yy, z);
        if (b && !SG.isTreePart(b)) return yy + 1;
      }
      return 0;
    }

    selectSpawn() {
      const dir = new THREE.Vector2(SG.SUN_DIR.x, SG.SUN_DIR.z).normalize();
      let best = null;
      const rng = new SG.RNG(SEED + 900);
      // Prefer a grassy headland 15–40 blocks from the water. Close enough
      // that the sea fills the view, high enough to see the sun road.
      for (let z = 56; z <= 132; z += 2) {
        for (let x = 56; x <= 116; x += 2) {
          const h = this.surfaceMap[z * SX + x];
          if (h < SEA + 4 || h > SEA + 22) continue;
          const slope = this.slopeMap[z * SX + x];
          if (slope > 2) continue;
          const ground = this.get(x, h, z);
          if (ground !== B.TURF && ground !== B.MOSS && ground !== B.STONE) continue;
          const gap = x - this.coastX(z);
          if (gap < 11 || gap > 44) continue;
          let open = 0;
          let blocked = false;
          let shoreDist = 0;
          for (let d = 3; d <= 58; d += 3) {
            const xx = Math.round(x + dir.x * d);
            const zz = Math.round(z + dir.y * d);
            if (xx < 1 || xx >= SX - 1 || zz < 1 || zz >= SZ - 1) break;
            const hh = this.surfaceMap[zz * SX + xx];
            const rel = h - hh;
            if (rel < -4) { blocked = true; break; }
            open += SG.clamp(rel / 7, -1, 1);
            if (!shoreDist && hh < SEA) shoreDist = d;
          }
          if (blocked) continue;
          const size = h * 1.2 + open * 2.2 - slope * 2.0 +
            (gap < 34 ? 2.4 : 0) + (shoreDist && shoreDist < 42 ? 2.0 : 0) + rng.range(-0.3, 0.3);
          if (!best || size > best.size) best = { x, z, y: h + 1, size, open, h, gap, shoreDist };
        }
      }
      if (!best) {
        // A safe fallback near the west coast.
        let bx = 72, bz = 112, bh = this.surfaceMap[112 * SX + 72];
        best = { x: bx, z: bz, y: bh + 1 };
      }
      const sunYaw = Math.atan2(-SG.SUN_DIR.x, -SG.SUN_DIR.z);
      this.spawn = {
        x: best.x + 0.5, z: best.z + 0.5, y: best.y,
        yaw: sunYaw + 0.12, pitch: -0.025
      };
      return this.spawn;
    }

    generateTrees(onProgress) {
      const rng = new SG.RNG(SEED + 412);
      const spawn = this.spawn;
      const sunFlat = new THREE.Vector2(SG.SUN_DIR.x, SG.SUN_DIR.z).normalize();
      const trees = this.trees;
      let attempts = 0;
      const target = 112;
      const placed = [];
      while (trees.length < target && attempts < 4200) {
        attempts++;
        const x = rng.int(3, SX - 4);
        const z = rng.int(3, SZ - 4);
        const h = this.surfaceMap[z * SX + x];
        if (h <= SEA + 1 || h > 45) continue;
        const slope = this.slopeMap[z * SX + x];
        if (slope > 2) continue;
        const ground = this.get(x, h, z);
        if (ground !== B.TURF && ground !== B.MOSS) continue;
        // Keep the cinematic vista clear.
        const dx = x + 0.5 - spawn.x, dz = z + 0.5 - spawn.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 8.5) continue;
        if (dist < 32) {
          const dn = (dx * sunFlat.x + dz * sunFlat.y) / dist;
          if (dn > 0.80) continue;
        }
        const forest = SG.fbm2(x * 0.028 + 4, z * 0.028 - 8, 3, SEED + 71);
        if (forest < 0.33 && rng.chance(0.78)) continue;
        let tooClose = false;
        for (let i = 0; i < placed.length; i++) {
          const dx2 = placed[i][0] - x, dz2 = placed[i][1] - z;
          if (dx2 * dx2 + dz2 * dz2 < 24) { tooClose = true; break; }
        }
        if (tooClose) continue;
        const coastGap = x - this.coastX(z);
        let style;
        if (coastGap < 18 && h < SEA + 8) style = rng.chance(0.45) ? 'shore' : 'broad';
        else if (h > 27) style = 'pine';
        else if (rng.chance(0.12)) style = 'coral';
        else style = rng.chance(0.42) ? 'pine' : 'broad';
        const tree = this.createTree(x, z, h + 1, style, rng);
        if (!tree) continue;
        trees.push(tree);
        placed.push([x, z]);
      }
      // Deliberately plant two sentinel trees just outside the central view.
      // They are part of the world (and therefore can fall), not a backdrop.
      const left = new THREE.Vector2(-sunFlat.y, sunFlat.x);
      const frameSpecs = [
        { side: 1, angle: 0.74, dist: 13.5, style: 'pine' },
        { side: -1, angle: 0.83, dist: 14.5, style: 'broad' }
      ];
      for (const spec of frameSpecs) {
        const base = sunFlat.clone().multiplyScalar(Math.cos(spec.angle)).addScaledVector(left, spec.side * Math.sin(spec.angle));
        let planted = false;
        for (let attempt = 0; attempt < 9 && !planted; attempt++) {
          const d = spec.dist + attempt * 1.35;
          const fx = Math.round(spawn.x + base.x * d);
          const fz = Math.round(spawn.z + base.y * d);
          if (fx < 4 || fx >= SX - 4 || fz < 4 || fz >= SZ - 4) continue;
          const fh = this.surfaceMap[fz * SX + fx];
          if (fh <= SEA + 1 || this.slopeMap[fz * SX + fx] > 2) continue;
          const ground = this.get(fx, fh, fz);
          if (ground !== B.TURF && ground !== B.MOSS) continue;
          if (this.get(fx, fh + 1, fz) || this.get(fx, fh + 2, fz)) continue;
          let tooClose = false;
          for (const q of placed) if (Math.hypot(q[0] - fx, q[1] - fz) < 4.4) { tooClose = true; break; }
          if (tooClose) continue;
          const ft = this.createTree(fx, fz, fh + 1, spec.style, rng);
          if (!ft) continue;
          trees.push(ft);
          placed.push([fx, fz]);
          planted = true;
        }
      }
      this.treeRevision++;
      if (onProgress) onProgress(0.65);
      return trees;
    }

    createTree(x, z, baseY, style, rng) {
      if (!this.inBounds(x, baseY, z) || this.isSolid(x, baseY, z)) return null;
      const id = this.trees.length + 1;
      const tall = style === 'pine' ? rng.int(8, 12) : rng.int(5, 8);
      const trunk = [];
      const leaves = [];
      for (let i = 0; i < tall; i++) {
        const y = baseY + i;
        if (!this.inBounds(x, y, z)) break;
        if (this.get(x, y, z) !== 0) break;
        this.blocks[this.idx(x, y, z)] = B.WOOD;
        this.treeIds[this.idx(x, y, z)] = id;
        trunk.push({ x, y, z });
      }
      if (trunk.length < 4) {
        for (const c of trunk) { this.blocks[this.idx(c.x, c.y, c.z)] = 0; this.treeIds[this.idx(c.x, c.y, c.z)] = 0; }
        return null;
      }
      const top = trunk[trunk.length - 1].y;
      if (style === 'pine') {
        const layers = Math.floor(tall * 0.66);
        const start = baseY + Math.floor(tall * 0.30);
        for (let l = 0; l < layers; l++) {
          const y = start + l;
          if (y > top + 1) break;
          const t = l / Math.max(1, layers - 1);
          const rad = (1 - t) * 3.1 + 0.65;
          const ring = Math.round(rad + 1);
          for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
            const d = Math.sqrt(dx * dx + dz * dz);
            if (d > rad + 0.3) continue;
            if (d < 0.4 && rng.chance(0.5)) continue;
            if (rng.chance(0.14) && d > 1) continue;
            const lx = x + dx, lz = z + dz;
            const yy = y + (d < 1 ? 1 : 0);
            this.addLeaf(lx, yy, lz, id, leaves);
          }
        }
        for (let k = 0; k < 3; k++) this.addLeaf(x, top + 1 + (k === 0 ? 1 : 0), z, id, leaves);
      } else {
        const cy = top - (style === 'shore' ? 1 : 1);
        const rx = style === 'shore' ? 2.9 + rng.next() * 1.2 : 2.6 + rng.next() * 1.5;
        const rz = style === 'shore' ? 2.7 + rng.next() * 1.0 : 2.5 + rng.next() * 1.4;
        const ry = 2.6 + rng.next() * 1.15;
        for (let dy = -Math.ceil(ry); dy <= Math.ceil(ry); dy++) {
          for (let dz = -Math.ceil(rz); dz <= Math.ceil(rz); dz++) {
            for (let dx = -Math.ceil(rx); dx <= Math.ceil(rx); dx++) {
              const nx = dx / rx, ny = dy / ry, nz = dz / rz;
              const rr = nx * nx + ny * ny + nz * nz;
              if (rr > 1.0) continue;
              if (rr > 0.58 && rng.chance(0.33)) continue;
              const lx = x + dx, lz = z + dz;
              const yy = cy + dy + (rr < 0.3 ? 1 : 0);
              this.addLeaf(lx, yy, lz, id, leaves);
            }
          }
        }
        // A low sweeping bough gives the canopy an asymmetric, illustrated silhouette.
        if (style !== 'coral') {
          for (let k = 1; k <= 3; k++) {
            const dx = (rng.chance(0.5) ? 1 : -1) * k;
            this.addLeaf(x + dx, top - k, z + (k & 1), id, leaves);
          }
        }
      }
      const tree = {
        id, x, z, baseY, top, style, tall,
        trunk, leaves,
        phase: 0, fallen: false
      };
      return tree;
    }

    addLeaf(x, y, z, id, list) {
      if (!this.inBounds(x, y, z)) return false;
      const current = this.get(x, y, z);
      if (current !== 0) return false;
      // Keep leaf canopies from dangling far below trunks.
      if (y <= SEA + 1) return false;
      this.blocks[this.idx(x, y, z)] = B.LEAVES;
      this.treeIds[this.idx(x, y, z)] = id;
      list.push({ x, y, z });
      return true;
    }

    generateAmberSeams() {
      const rng = new SG.RNG(SEED + 701);
      // Expose a few glowing veins on cliff faces so the sunset has fireflies.
      for (let i = 0; i < 260; i++) {
        const x = rng.int(2, SX - 3), z = rng.int(2, SZ - 3);
        const y = this.surfaceMap[z * SX + x];
        if (y < SEA) continue;
        const slope = this.slopeMap[z * SX + x];
        if (slope < 2 && y < 26) continue;
        if (rng.chance(0.55)) continue;
        const depth = rng.int(1, 3);
        for (let k = 0; k < depth; k++) {
          const yy = y - k;
          const b = this.get(x, yy, z);
          if (b === B.STONE || b === B.BASALT || b === B.MOSS) this.blocks[this.idx(x, yy, z)] = B.AMBER;
        }
      }
    }

    /* ----------------------------------------------------------- meshing */
    faceVisibleAt(x, y, z) {
      const b = this.get(x, y, z);
      if (b === 0) return true;
      // Tree voxels are rendered by their own chunky low-poly meshes. The
      // terrain faces underneath stay visible for the moment a tree falls.
      if (SG.isTreePart(b)) return true;
      return false;
    }

    ensureMaterials() {
      if (this._materials) return this._materials;
      const stoneMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        metalness: 0.0,
        flatShading: false
      });
      const glowMat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.48,
        metalness: 0.08,
        emissive: new THREE.Color(0xff8b2b),
        emissiveIntensity: 2.15
      });
      this._materials = { stone: stoneMat, glow: glowMat };
      return this._materials;
    }

    createChunkMesh(cx, cz) {
      const x0 = cx * CHUNK, z0 = cz * CHUNK;
      const x1 = Math.min(SX, x0 + CHUNK), z1 = Math.min(SZ, z0 + CHUNK);
      const pos = [], nrm = [], col = [], idx = [];
      const gpos = [], gnrm = [], gcol = [], gidx = [];
      const tmp = [0, 0, 0];
      const ao = [0, 0, 0, 0];
      const solidAt = (x, y, z) => (this.isSolid(x, y, z) ? 1 : 0);
      for (let z = z0; z < z1; z++) {
        for (let x = x0; x < x1; x++) {
          for (let y = 1; y < SY; y++) {
            const type = this.blocks[this.idx(x, y, z)];
            if (type === 0 || SG.isTreePart(type)) continue;
            const glow = !!SG.BI[type].emissive;
            for (let f = 0; f < 6; f++) {
              const F = FACES[f];
              const nx = x + F.n[0], ny = y + F.n[1], nz = z + F.n[2];
              if (!this.faceVisibleAt(nx, ny, nz)) continue;
              const hash = SG.hash32(x, y, z, SEED + 130 + f * 17);
              if (glow) SG.makeGlowColor(type, F.face, hash, tmp);
              else SG.faceColor(type, F.face, x, y, z, hash, tmp);
              const baseR = tmp[0] * F.shade, baseG = tmp[1] * F.shade, baseB = tmp[2] * F.shade;
              for (let v = 0; v < 4; v++) {
                const c = F.corners[v];
                const s1x = F.t1 === 0 ? (c[0] ? 1 : -1) : F.t1 === 1 ? (c[1] ? 1 : -1) : (c[2] ? 1 : -1);
                const s2x = F.t2 === 0 ? (c[0] ? 1 : -1) : F.t2 === 1 ? (c[1] ? 1 : -1) : (c[2] ? 1 : -1);
                const ox = F.n[0], oy = F.n[1], oz = F.n[2];
                const t1x = F.t1 === 0, t1y = F.t1 === 1, t1z = F.t1 === 2;
                const t2x = F.t2 === 0, t2y = F.t2 === 1, t2z = F.t2 === 2;
                const a1 = solidAt(nx + (t1x ? s1x : 0), ny + (t1y ? s1x : 0), nz + (t1z ? s1x : 0));
                const a2 = solidAt(nx + (t2x ? s2x : 0), ny + (t2y ? s2x : 0), nz + (t2z ? s2x : 0));
                const ac = solidAt(nx + (t1x ? s1x : 0) + (t2x ? s2x : 0), ny + (t1y ? s1x : 0) + (t2y ? s2x : 0), nz + (t1z ? s1x : 0) + (t2z ? s2x : 0));
                const av = (a1 && a2) ? 0 : 3 - (a1 + a2 + ac);
                ao[v] = av;
                const aoM = glow ? 1.0 : AO_LEVEL[av];
                if (glow) {
                  gpos.push(x + c[0], y + c[1], z + c[2]);
                  gnrm.push(F.n[0], F.n[1], F.n[2]);
                  gcol.push(baseR * aoM, baseG * aoM, baseB * aoM);
                } else {
                  pos.push(x + c[0], y + c[1], z + c[2]);
                  nrm.push(F.n[0], F.n[1], F.n[2]);
                  col.push(baseR * aoM, baseG * aoM, baseB * aoM);
                }
              }
              const base = glow ? gpos.length / 3 - 4 : pos.length / 3 - 4;
              const targetIdx = glow ? gidx : idx;
              if (ao[0] + ao[2] >= ao[1] + ao[3]) {
                targetIdx.push(base, base + 1, base + 2, base, base + 2, base + 3);
              } else {
                targetIdx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
              }
            }
          }
        }
      }
      return {
        op: this.makeGeometry(pos, nrm, col, idx),
        glow: this.makeGeometry(gpos, gnrm, gcol, gidx)
      };
    }

    makeGeometry(pos, nrm, col, idx) {
      if (idx.length === 0) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      return g;
    }

    buildChunk(cx, cz) {
      const key = cx + ',' + cz;
      this.removeChunk(key);
      const geos = this.createChunkMesh(cx, cz);
      if (!geos.op && !geos.glow) return;
      const mats = this.ensureMaterials();
      const entry = { mesh: null, glowMesh: null };
      if (geos.op) {
        const mesh = new THREE.Mesh(geos.op, mats.stone);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.name = 'chunk-' + key;
        this.group.add(mesh);
        entry.mesh = mesh;
      }
      if (geos.glow) {
        const gm = new THREE.Mesh(geos.glow, mats.glow);
        gm.castShadow = false;
        gm.receiveShadow = true;
        gm.name = 'glow-' + key;
        this.group.add(gm);
        entry.glowMesh = gm;
      }
      this.chunks.set(key, entry);
    }

    removeChunk(key) {
      const old = this.chunks.get(key);
      if (!old) return;
      if (old.mesh) { this.group.remove(old.mesh); if (old.mesh.geometry) old.mesh.geometry.dispose(); }
      if (old.glowMesh) { this.group.remove(old.glowMesh); if (old.glowMesh.geometry) old.glowMesh.geometry.dispose(); }
      this.chunks.delete(key);
    }

    buildAllChunks() {
      const nx = Math.ceil(SX / CHUNK), nz = Math.ceil(SZ / CHUNK);
      const list = [];
      for (let cz = 0; cz < nz; cz++) for (let cx = 0; cx < nx; cx++) list.push([cx, cz]);
      this.chunkQueue = list;
      this._chunkIndex = 0;
      return list.length;
    }

    buildNextChunk() {
      if (!this.chunkQueue || this._chunkIndex >= this.chunkQueue.length) return false;
      const [cx, cz] = this.chunkQueue[this._chunkIndex++];
      this.buildChunk(cx, cz);
      return this._chunkIndex < this.chunkQueue.length;
    }

    rebuildChunkAt(x, z) {
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      this.buildChunk(cx, cz);
      if (x % CHUNK === 0 && x > 0) this.buildChunk(cx - 1, cz);
      if (x % CHUNK === CHUNK - 1 && x < SX - 1) this.buildChunk(cx + 1, cz);
      if (z % CHUNK === 0 && z > 0) this.buildChunk(cx, cz - 1);
      if (z % CHUNK === CHUNK - 1 && z < SZ - 1) this.buildChunk(cx, cz + 1);
    }

    /* --------------------------------------------------------- modification */
    setBlock(x, y, z, type, opts) {
      opts = opts || {};
      if (!this.inBounds(x, y, z)) return false;
      const i = this.idx(x, y, z);
      const old = this.blocks[i];
      if (old === type) return false;
      const wasTree = SG.isTreePart(old);
      const nowTree = SG.isTreePart(type);
      if (old === B.WOOD && this.decorLogs.has(i)) this.decorLogs.delete(i);
      if (old === B.LEAVES && this.decorLeaves.has(i)) this.decorLeaves.delete(i);
      this.blocks[i] = type;
      this.treeIds[i] = 0;
      if (type === B.WOOD) this.decorLogs.add(i);
      if (type === B.LEAVES) this.decorLeaves.add(i);
      if (wasTree || nowTree) {
        if (!opts.silentTrees) this.treeRevision++;
      }
      // Anything that is not a custom-rendered tree voxel changes the
      // terrain mesh (including the removal of a solid block).
      if (!SG.isTreePart(old) || !SG.isTreePart(type)) {
        this.dirty.add(Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK));
      }
      return true;
    }

    removeBlock(x, y, z, opts) {
      if (!this.inBounds(x, y, z)) return 0;
      const old = this.get(x, y, z);
      if (!old) return 0;
      const i = this.idx(x, y, z);
      const treeId = this.treeIds[i];
      this.blocks[i] = 0;
      this.treeIds[i] = 0;
      this.decorLogs.delete(i);
      this.decorLeaves.delete(i);
      if (SG.isTreePart(old)) {
        this.treeRevision++;
      } else {
        this.dirty.add(Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK));
      }
      return old | (treeId > 0 ? 0x10000 : 0);
    }

    removePure(x, y, z) {
      if (!this.inBounds(x, y, z)) return 0;
      const i = this.idx(x, y, z);
      const old = this.blocks[i];
      if (!old) return 0;
      this.blocks[i] = 0;
      this.treeIds[i] = 0;
      this.decorLogs.delete(i);
      this.decorLeaves.delete(i);
      if (!SG.isTreePart(old)) {
        this.dirty.add(Math.floor(x / CHUNK) + ',' + Math.floor(z / CHUNK));
      } else this.treeRevision++;
      return old;
    }

    setTreeCell(x, y, z, type, treeId) {
      const i = this.idx(x, y, z);
      this.blocks[i] = type;
      this.treeIds[i] = treeId;
      if (SG.isTreePart(type)) this.treeRevision++;
    }

    flushDirty() {
      if (!this.dirty.size) return;
      const dirty = new Set(this.dirty);
      this.dirty.clear();
      // Neighbouring chunks share a face at their border. Collect the whole
      // ring first so no chunk is rebuilt twice during a large collapse.
      const rebuild = new Set();
      for (const key of dirty) {
        const [cx, cz] = key.split(',').map(Number);
        for (const [ox, oz] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]]) {
          const nx = cx + ox, nz = cz + oz;
          if (nx < 0 || nz < 0 || nx * CHUNK >= SX || nz * CHUNK >= SZ) continue;
          rebuild.add(nx + ',' + nz);
        }
      }
      for (const key of rebuild) {
        const [cx, cz] = key.split(',').map(Number);
        this.buildChunk(cx, cz);
      }
    }

    /* ------------------------------------------------------------ queries */
    raycast(origin, dir, maxDist) {
      maxDist = maxDist || 8;
      let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
      const stepX = dir.x > 0 ? 1 : -1;
      const stepY = dir.y > 0 ? 1 : -1;
      const stepZ = dir.z > 0 ? 1 : -1;
      const dx = Math.abs(1 / dir.x), dy = Math.abs(1 / dir.y), dz = Math.abs(1 / dir.z);
      let tx = dir.x === 0 ? Infinity : (dir.x > 0 ? (x + 1 - origin.x) : (origin.x - x)) / Math.abs(dir.x);
      let ty = dir.y === 0 ? Infinity : (dir.y > 0 ? (y + 1 - origin.y) : (origin.y - y)) / Math.abs(dir.y);
      let tz = dir.z === 0 ? Infinity : (dir.z > 0 ? (z + 1 - origin.z) : (origin.z - z)) / Math.abs(dir.z);
      let nx = 0, ny = 0, nz = 0;
      if (this.isSolid(x, y, z)) {
        return { hit: true, x, y, z, normal: new THREE.Vector3(-stepX, 0, 0), distance: 0, type: this.get(x, y, z) };
      }
      let dist = 0;
      for (let i = 0; i < 128; i++) {
        if (tx < ty && tx < tz) {
          x += stepX; dist = tx; tx += dx; nx = -stepX; ny = 0; nz = 0;
        } else if (ty < tz) {
          y += stepY; dist = ty; ty += dy; nx = 0; ny = -stepY; nz = 0;
        } else {
          z += stepZ; dist = tz; tz += dz; nx = 0; ny = 0; nz = -stepZ;
        }
        if (dist > maxDist) break;
        if (y < 0 || y >= SY) {
          if (y < 0) break;
          continue;
        }
        const b = this.get(x, y, z);
        if (b !== 0) {
          return {
            hit: true, x, y, z, normal: new THREE.Vector3(nx, ny, nz), distance: dist, type: b
          };
        }
      }
      return { hit: false };
    }

    hitsSolidAABB(minX, minY, minZ, maxX, maxY, maxZ) {
      const x0 = Math.floor(minX), x1 = Math.floor(maxX - 1e-5);
      const y0 = Math.floor(minY), y1 = Math.floor(maxY - 1e-5);
      const z0 = Math.floor(minZ), z1 = Math.floor(maxZ - 1e-5);
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            if (this.isSolid(x, y, z)) return true;
          }
        }
      }
      return false;
    }

    makeHeightTexture() {
      const N = 256;
      const data = new Uint8Array(N * N * 4);
      for (let iz = 0; iz < N; iz++) {
        for (let ix = 0; ix < N; ix++) {
          const wx = (ix + 0.5) / N * SX;
          const wz = (iz + 0.5) / N * SZ;
          const x = SG.clamp(Math.floor(wx), 0, SX - 1);
          const z = SG.clamp(Math.floor(wz), 0, SZ - 1);
          const h = this.surfaceMap[z * SX + x];
          const o = (iz * N + ix) * 4;
          data[o] = SG.clamp(h / SY, 0, 1) * 255;
          data[o + 1] = SG.clamp((SEA - h) / 18, 0, 1) * 255;
          data[o + 2] = SG.hash2(x, z, SEED + 900) * 255;
          data[o + 3] = 255;
        }
      }
      const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.magFilter = THREE.LinearFilter;
      tex.minFilter = THREE.LinearFilter;
      tex.flipY = false;
      tex.needsUpdate = true;
      return tex;
    }

    countBlocks() {
      let n = 0;
      for (let i = 0; i < this.blocks.length; i++) if (this.blocks[i]) n++;
      return n;
    }
  }

  SG.World = World;
})();
