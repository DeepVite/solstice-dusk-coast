/* ============================================================
   SOLSTICE — low-poly trees, boulders, reeds, birds, sea stacks
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;
  const B = SG.B;

  const WIND = { uWindTime: { value: 0 } };
  SG.WIND = WIND;

  function linear(hex) { return new THREE.Color(hex); }

  function mergeGeometryList(list) {
    const pos = [], nrm = [];
    for (let item of list) {
      let g = item;
      if (g.index) g = g.toNonIndexed();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i));
        if (n) nrm.push(n.getX(i), n.getY(i), n.getZ(i));
      }
      if (g !== item) g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    if (nrm.length === pos.length) geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    else geo.computeVertexNormals();
    return geo;
  }

  function addWind(material, amp, key, heightMode) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uWindTime = WIND.uWindTime;
      const block = [
        'float wInstX = 0.0; float wInstZ = 0.0;',
        '#ifdef USE_INSTANCING',
        '  wInstX = instanceMatrix[3].x; wInstZ = instanceMatrix[3].z;',
        '#endif',
        'float wPh = uWindTime * 1.35 + wInstX * 0.31 + wInstZ * 0.24;',
        'float wSway = sin(wPh) + 0.36 * sin(wPh * 2.17 + 1.3);',
        heightMode === 'canopy'
          ? 'float wH = clamp(position.y + 0.65, 0.0, 1.6);'
          : 'float wH = clamp(position.y, 0.0, 1.2);',
        'transformed.x += wSway * ' + amp.toFixed(4) + ' * wH;',
        'transformed.z += wSway * ' + (amp * 0.6).toFixed(4) + ' * wH;'
      ].join('\n');
      shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n' + block
      );
    };
    material.customProgramCacheKey = () => 'solstice-wind-' + key;
    return material;
  }

  function hashCell(x, y, z, salt) {
    return SG.hash32(x, y, z, SG.SEED + (salt || 0));
  }

  function addWhiteVertexColors(geo) {
    const n = geo.attributes.position.count;
    const colors = new Float32Array(n * 3);
    colors.fill(1);
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    return geo;
  }

  // ------------------------------------------------------------------ trees
  class TreeRenderer {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.maxLogs = 7000;
      this.maxLeaves = 36000;
      this.logGeo = new THREE.CylinderGeometry(0.28, 0.37, 1.035, 6, 1, false);
      this.logGeo.translate(0, 0.5, 0);
      addWhiteVertexColors(this.logGeo);
      this.leafGeo = new THREE.IcosahedronGeometry(1.0, 0);
      const lp = this.leafGeo.attributes.position;
      for (let i = 0; i < lp.count; i++) {
        const n = hashCell(i, 2, 7, 92);
        lp.setXYZ(i, lp.getX(i) * (0.8 + n * 0.3), lp.getY(i) * (0.62 + n * 0.25), lp.getZ(i) * (0.82 + n * 0.26));
      }
      this.leafGeo.computeVertexNormals();
      addWhiteVertexColors(this.leafGeo);
      this.logMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.88, metalness: 0.0, flatShading: true, vertexColors: true });
      this.leafMat = addWind(new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.92, metalness: 0.0, flatShading: true, vertexColors: true
      }), 0.055, 'leaves', 'canopy');
      this.logMesh = new THREE.InstancedMesh(this.logGeo, this.logMat, this.maxLogs);
      this.leafMesh = new THREE.InstancedMesh(this.leafGeo, this.leafMat, this.maxLeaves);
      this.logMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.leafMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.logMesh.castShadow = true;
      this.logMesh.receiveShadow = true;
      this.leafMesh.castShadow = true;
      this.leafMesh.receiveShadow = true;
      this.logMesh.frustumCulled = false;
      this.leafMesh.frustumCulled = false;
      this.logMesh.name = 'tree-trunks';
      this.leafMesh.name = 'tree-canopies';
      scene.add(this.logMesh, this.leafMesh);
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._s = new THREE.Vector3();
      this._p = new THREE.Vector3();
      this._e = new THREE.Euler();
      this._c = new THREE.Color();
      this._styleCache = new Map();
      this.rebuild();
    }

    style(name) {
      let s = this._styleCache.get(name);
      if (!s) {
        const def = SG.TREE_STYLES[name] || SG.TREE_STYLES.broad;
        s = {
          leaf: def.leaf.map(linear),
          wood: def.wood.map(linear)
        };
        this._styleCache.set(name, s);
      }
      return s;
    }

    rebuild() {
      const world = this.world;
      let logs = 0, leaves = 0;
      const logMesh = this.logMesh, leafMesh = this.leafMesh;
      const M = this._m, Q = this._q, S = this._s, P = this._p, E = this._e;
      const addLog = (cell, style, treeSalt) => {
        if (logs >= this.maxLogs) return;
        const n = hashCell(cell.x, cell.y, cell.z, treeSalt + 7);
        Q.setFromEuler(E.set(0, n * Math.PI * 2, (n - 0.5) * 0.015));
        P.set(cell.x + 0.5, cell.y, cell.z + 0.5);
        S.set(1, 1, 1);
        M.compose(P, Q, S);
        logMesh.setMatrixAt(logs, M);
        const pal = style.wood;
        const c = pal[Math.floor(n * pal.length) % pal.length];
        this._c.copy(c).multiplyScalar(0.84 + n * 0.3);
        logMesh.setColorAt(logs, this._c);
        logs++;
      };
      const addLeaf = (cell, style, treeSalt) => {
        if (leaves >= this.maxLeaves) return;
        const n = hashCell(cell.x, cell.y, cell.z, treeSalt + 19);
        const n2 = hashCell(cell.x, cell.y, cell.z, treeSalt + 29);
        const count = n > 0.68 ? 2 : 1;
        for (let k = 0; k < count; k++) {
          if (leaves >= this.maxLeaves) break;
          const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(n * 3.1, n2 * 6.28, (n2 - 0.5) * 1.4));
          const scale = 0.63 + n * 0.24 + (k === 1 ? -0.2 : 0);
          P.set(cell.x + 0.5 + (n - 0.5) * 0.44 + k * 0.2, cell.y + 0.48 + (n2 - 0.5) * 0.34, cell.z + 0.5 + (n2 - 0.5) * 0.44);
          S.set(scale * 1.08, scale * (0.72 + n2 * 0.16), scale);
          M.compose(P, q, S);
          leafMesh.setMatrixAt(leaves, M);
          const pal = style.leaf;
          const c = pal[Math.floor(n2 * pal.length) % pal.length];
          this._c.copy(c).multiplyScalar(0.84 + n * 0.34);
          leafMesh.setColorAt(leaves, this._c);
          leaves++;
        }
      };
      for (const tree of world.trees) {
        if (tree.fallen) continue;
        const style = this.style(tree.style);
        for (const cell of tree.trunk) {
          if (world.get(cell.x, cell.y, cell.z) === B.WOOD && world.getTreeId(cell.x, cell.y, cell.z) === tree.id) addLog(cell, style, tree.id * 13);
        }
        for (const cell of tree.leaves) {
          if (world.get(cell.x, cell.y, cell.z) === B.LEAVES && world.getTreeId(cell.x, cell.y, cell.z) === tree.id) addLeaf(cell, style, tree.id * 13);
        }
      }
      // Player-placed driftwood and canopies.
      for (const idx of world.decorLogs) {
        const y = Math.floor(idx / (SG.WORLD.SX * SG.WORLD.SZ));
        const rem = idx - y * SG.WORLD.SX * SG.WORLD.SZ;
        const z = Math.floor(rem / SG.WORLD.SX), x = rem - z * SG.WORLD.SX;
        if (world.get(x, y, z) === B.WOOD) addLog({ x, y, z }, this.style('shore'), 501);
      }
      for (const idx of world.decorLeaves) {
        const y = Math.floor(idx / (SG.WORLD.SX * SG.WORLD.SZ));
        const rem = idx - y * SG.WORLD.SX * SG.WORLD.SZ;
        const z = Math.floor(rem / SG.WORLD.SX), x = rem - z * SG.WORLD.SX;
        if (world.get(x, y, z) === B.LEAVES) addLeaf({ x, y, z }, this.style('broad'), 777);
      }
      logMesh.count = logs;
      leafMesh.count = leaves;
      if (logMesh.instanceColor) logMesh.instanceColor.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      logMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      this.lastLogCount = logs;
      this.lastLeafCount = leaves;
    }

  }

  // ---------------------------------------------------------------- boulders
  const ROCK_MAT = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.97, metalness: 0.0, flatShading: true
  });

  function makeRockGeometry(rng, parts, spread, tall, palette) {
    const geos = [];
    const baseCol = palette || {
      dark: '#35333e', mid: '#5b575f', top: '#8a7165', moss: '#5f6d50'
    };
    for (let i = 0; i < parts; i++) {
      const source = rng.chance(0.52) ? new THREE.DodecahedronGeometry(1, 0) : new THREE.IcosahedronGeometry(1, 0);
      let g = source.index ? source.toNonIndexed() : source.clone();
      source.dispose();
      const rot = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.7, 0.7), rng.range(0, 6.28), rng.range(-0.7, 0.7)));
      const sx = rng.range(0.55, 1.05) * spread;
      const sy = rng.range(0.55, 1.0) * (tall || 1);
      const sz = rng.range(0.55, 1.05) * spread;
      const ox = rng.range(-0.5, 0.5) * spread;
      const oy = rng.range(-0.3, 0.5) * (tall || 1);
      const oz = rng.range(-0.5, 0.5) * spread;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(ox, oy, oz), rot, new THREE.Vector3(sx, sy, sz)
      );
      g.applyMatrix4(m);
      geos.push(g);
    }
    let geo = mergeGeometryList(geos);
    geos.forEach((g) => g.dispose());
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
    geo.translate(-cx, -cy, -cz);
    geo.computeBoundingBox();
    const p = geo.attributes.position, n = geo.attributes.normal;
    const colors = new Float32Array(p.count * 3);
    const dark = linear(baseCol.dark), mid = linear(baseCol.mid), top = linear(baseCol.top), moss = linear(baseCol.moss || baseCol.mid);
    const bb2 = geo.boundingBox;
    const range = Math.max(0.001, bb2.max.y - bb2.min.y);
    const tmp = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const h = (p.getY(i) - bb2.min.y) / range;
      const up = SG.clamp(n.getY(i) * 0.5 + 0.5, 0, 1);
      const r = hashCell(p.getX(i) * 10, p.getY(i) * 10, p.getZ(i) * 10, 555);
      tmp.copy(dark).lerp(mid, SG.clamp(0.25 + up * 0.5 + h * 0.35, 0, 1));
      tmp.lerp(top, SG.clamp((h - 0.45) * 0.75 + up * 0.18, 0, 0.8));
      if (r > 0.82 && up > 0.52) tmp.lerp(moss, 0.32);
      tmp.multiplyScalar(0.82 + r * 0.32);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeBoundingSphere();
    return geo;
  }

  class BoulderSystem {
    constructor(scene, world, seed) {
      this.scene = scene;
      this.world = world;
      this.debris = null;
      this.onEvent = null;
      this.boulders = [];
      this.meshes = [];
      this.rng = new SG.RNG(seed || (SG.SEED + 313));
      this._raycaster = new THREE.Raycaster();
      this.build();
    }

    build() {
      const world = this.world;
      const rng = this.rng;
      const spawn = world.spawn;
      // Two deliberate sentinels in the foreground, then a natural scatter.
      const fwd = new THREE.Vector2(SG.SUN_DIR.x, SG.SUN_DIR.z).normalize();
      const side = new THREE.Vector2(-SG.SUN_DIR.z, SG.SUN_DIR.x).normalize();
      const preferred = [
        { x: spawn.x + fwd.x * Math.cos(0.52) * 8.5 + side.x * Math.sin(0.52) * 8.5,
          z: spawn.z + fwd.y * Math.cos(0.52) * 8.5 + side.y * Math.sin(0.52) * 8.5,
          large: false },
        { x: spawn.x + fwd.x * Math.cos(0.78) * 12.5 - side.x * Math.sin(0.78) * 12.5,
          z: spawn.z + fwd.y * Math.cos(0.78) * 12.5 - side.y * Math.sin(0.78) * 12.5,
          large: true }
      ];
      let attempts = 0;
      while (this.boulders.length < 30 && attempts < 1200) {
        attempts++;
        const pref = preferred.length && attempts <= 4 ? preferred.shift() : null;
        const x = pref ? pref.x : rng.range(5, SG.WORLD.SX - 5);
        const z = pref ? pref.z : rng.range(5, SG.WORLD.SZ - 5);
        const sx = Math.floor(x), sz = Math.floor(z);
        const top = world.surfaceMap[sz * SG.WORLD.SX + sx];
        if (top < SG.SEA_LEVEL + 1 || top > 43) continue;
        if (world.slopeMap[sz * SG.WORLD.SX + sx] > 5) continue;
        if (x < 2 || z < 2) continue;
        if (Math.hypot(x - spawn.x, z - spawn.z) < 4.5) continue;
        let tooClose = false;
        for (const b of this.boulders) {
          if (Math.hypot(b.x - x, b.z - z) < 4.8) { tooClose = true; break; }
        }
        if (tooClose) continue;
        // Avoid placing over a tree trunk.
        let blocked = false;
        for (let y = top + 1; y < Math.min(top + 4, SG.WORLD.SY); y++) {
          if (world.isSolid(sx, y, sz)) { blocked = true; break; }
        }
        if (blocked) continue;
        const large = pref ? pref.large : rng.chance(0.22);
        const scale = pref ? (pref.large ? rng.range(1.8, 2.4) : rng.range(0.9, 1.25)) : (large ? rng.range(1.7, 2.6) : rng.range(0.75, 1.55));
        const parts = large ? rng.int(3, 4) : rng.int(2, 3);
        const geo = makeRockGeometry(rng, parts, scale * rng.range(0.65, 1.1), 0.8, null);
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        const halfH = (bb.max.y - bb.min.y) / 2;
        const halfW = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) / 2;
        const floor = world.floorBelow(x, top + 1, z);
        const y = floor + halfH * 0.78;
        const mesh = new THREE.Mesh(geo, ROCK_MAT);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.set(x, y, z);
        const yaw = rng.range(0, 6.28);
        mesh.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        mesh.name = 'boulder-' + this.boulders.length;
        this.scene.add(mesh);
        this.meshes.push(mesh);
        this.boulders.push({
          id: this.boulders.length, mesh, x, y, z,
          vx: 0, vy: 0, vz: 0, angle: 0, spin: 0,
          halfW, halfH, resting: true, alive: true,
          mass: Math.max(1, (bb.max.x - bb.min.x) * (bb.max.y - bb.min.y) * (bb.max.z - bb.min.z)),
          lastFloor: floor, yaw
        });
      }
      this.buildSeaStacks();
    }

    buildSeaStacks() {
      const rng = new SG.RNG(SG.SEED + 731);
      const spots = [
        [-70, 40, 1.0], [-120, 130, 0.85], [-32, 188, 0.7],
        [40, -70, 0.7], [-160, 30, 0.65], [220, 60, 0.55]
      ];
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.98, flatShading: true });
      for (const [x, z, s] of spots) {
        const geos = [];
        const nparts = rng.int(2, 3);
        for (let i = 0; i < nparts; i++) {
          const source = new THREE.DodecahedronGeometry(1, 0);
          let g = source.index ? source.toNonIndexed() : source.clone();
          source.dispose();
          g.applyMatrix4(new THREE.Matrix4().compose(
            new THREE.Vector3(rng.range(-2, 2), rng.range(-2, 4), rng.range(-2, 2)),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(-0.2, 0.2), rng.range(0, 6.3), rng.range(-0.2, 0.2))),
            new THREE.Vector3(rng.range(4, 7), rng.range(9, 18), rng.range(4, 7))
          ));
          geos.push(g);
        }
        const geo = mergeGeometryList(geos);
        geos.forEach((g) => g.dispose());
        geo.computeVertexNormals();
        geo.computeBoundingBox();
        const bb = geo.boundingBox;
        geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
        geo.computeBoundingBox();
        const p = geo.attributes.position, n = geo.attributes.normal;
        const colors = new Float32Array(p.count * 3);
        const dark = linear('#262534'), mid = linear('#494254'), warm = linear('#806457');
        const tmp = new THREE.Color();
        for (let i = 0; i < p.count; i++) {
          const t = SG.smoothstep(geo.boundingBox.min.y, geo.boundingBox.max.y, p.getY(i));
          const up = n.getY(i) * 0.5 + 0.5;
          tmp.copy(dark).lerp(mid, 0.25 + up * 0.55).lerp(warm, t * 0.22);
          tmp.multiplyScalar(0.82 + hashCell(i, 3, 2, 71) * 0.22);
          colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        const halfH = (geo.boundingBox.max.y - geo.boundingBox.min.y) / 2;
        const topAbove = rng.range(3.5, 12) * s;
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, SG.SEA_LEVEL + topAbove - halfH, z);
        mesh.rotation.y = rng.range(0, 6.28);
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.name = 'sea-stack';
        this.scene.add(mesh);
      }
    }

    update(dt, time, camera) {
      const world = this.world;
      for (const b of this.boulders) {
        if (!b.alive || b.resting) continue;
        b.vy -= 22.0 * dt;
        b.x += b.vx * dt;
        b.z += b.vz * dt;
        b.y += b.vy * dt;
        const floor = world.floorBelow(b.x, b.y + b.halfH + 0.8, b.z);
        const contactY = (floor === -1 ? -8 : floor) + b.halfH * 0.78;
        if (b.y <= contactY) {
          b.y = contactY;
          if (b.vy < -1.2) {
            b.vy = -b.vy * 0.18;
            b.vx *= 0.7; b.vz *= 0.7;
            if (this.onEvent) this.onEvent('rock-land', b);
          } else {
            b.vy = 0;
          }
          // Roll downhill. Sample the height field around the contact.
          const e = 1.1;
          const hL = world.floorBelow(b.x - e, b.y + b.halfH, b.z);
          const hR = world.floorBelow(b.x + e, b.y + b.halfH, b.z);
          const hD = world.floorBelow(b.x, b.y + b.halfH, b.z - e);
          const hU = world.floorBelow(b.x, b.y + b.halfH, b.z + e);
          const gx = (hR - hL) / (e * 2), gz = (hU - hD) / (e * 2);
          const slope = Math.hypot(gx, gz);
          b.vx -= gx * 12.0 * dt;
          b.vz -= gz * 12.0 * dt;
          const drag = Math.exp(-dt * (slope > 0.35 ? 0.5 : 3.5));
          b.vx *= drag; b.vz *= drag;
          const speed = Math.hypot(b.vx, b.vz);
          if (speed < 0.035 && slope < 0.18) {
            b.vx = 0; b.vz = 0; b.resting = true;
          }
          b.spin = speed / Math.max(0.3, b.halfW);
        } else {
          b.vx *= 0.999;
        }
        // Tumble around the axis perpendicular to travel.
        const speed = Math.hypot(b.vx, b.vz);
        if (speed > 0.01) {
          const axis = new THREE.Vector3(-b.vz / speed, 0, b.vx / speed);
          const dq = new THREE.Quaternion().setFromAxisAngle(axis, speed * dt / Math.max(0.45, b.halfW));
          b.mesh.quaternion.premultiply(dq);
        }
        b.mesh.position.set(b.x, b.y, b.z);
        if (b.y < -10) { b.alive = false; this.scene.remove(b.mesh); }
      }
    }

    notifyEdits(cells) {
      if (!cells || !cells.length) return;
      for (const b of this.boulders) {
        if (!b.alive || !b.resting) continue;
        let near = false;
        for (const c of cells) {
          if (Math.abs(c.x - b.x) <= 4.5 && Math.abs(c.z - b.z) <= 4.5) { near = true; break; }
        }
        if (!near) continue;
        const floor = this.world.floorBelow(b.x, b.y + b.halfH + 1.1, b.z);
        if (floor === -1 || floor + b.halfH * 0.78 < b.y - 0.06) {
          b.resting = false;
          b.vy = -0.15;
          b.vx += (Math.random() - 0.5) * 0.2;
          b.vz += (Math.random() - 0.5) * 0.2;
        }
      }
    }

    raycast(raycaster, maxDist) {
      this._raycaster.set(raycaster.ray.origin, raycaster.ray.direction);
      this._raycaster.near = 0;
      this._raycaster.far = maxDist || 8;
      const targets = [];
      for (const b of this.boulders) if (b.alive) targets.push(b.mesh);
      if (!targets.length) return null;
      const hits = this._raycaster.intersectObjects(targets, false);
      if (!hits.length) return null;
      const hit = hits[0];
      let bould = null;
      for (const b of this.boulders) if (b.mesh === hit.object) { bould = b; break; }
      if (!bould) return null;
      return { boulder: bould, point: hit.point, distance: hit.distance };
    }

    shatter(b, point, dir) {
      if (!b.alive) return;
      b.alive = false;
      this.scene.remove(b.mesh);
      if (this.debris) {
        const count = b.halfW > 1.5 ? 14 : 9;
        for (let i = 0; i < count; i++) {
          this.debris.spawnRockChunk(
            point.x + (Math.random() - 0.5) * b.halfW,
            point.y + (Math.random() - 0.5) * 0.5,
            point.z + (Math.random() - 0.5) * b.halfW,
            new THREE.Vector3(
              dir.x * 2.0 + (Math.random() - 0.5) * 3.2,
              2.0 + Math.random() * 3.5,
              dir.z * 2.0 + (Math.random() - 0.5) * 3.2
            ),
            0.24 + Math.random() * 0.32
          );
        }
      }
      if (this.onEvent) this.onEvent('rock-break', b);
    }
  }

  // --------------------------------------------------------------- scenery
  function makeGlowTexture(size, inner, outer, softness) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    g.addColorStop(Math.max(0.01, softness || 0.28), inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.encoding = THREE.sRGBEncoding;
    return tex;
  }

  function makeTuftGeometry(rng) {
    const pos = [], col = [];
    const cLow = linear('#3e4d32'), cHigh = linear('#9a9a5c');
    const blades = 5;
    for (let b = 0; b < blades; b++) {
      const ang = b / blades * Math.PI * 2 + rng.range(-0.2, 0.2);
      const h = 0.36 + rng.next() * 0.36;
      const w = 0.035 + rng.next() * 0.035;
      const dx = Math.cos(ang), dz = Math.sin(ang);
      const tipX = dx * (0.14 + rng.next() * 0.22), tipZ = dz * (0.14 + rng.next() * 0.22);
      pos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, tipX, h, tipZ);
      const lo = cLow.clone().multiplyScalar(0.72 + rng.next() * 0.25);
      const hi = cHigh.clone().multiplyScalar(0.72 + rng.next() * 0.35);
      col.push(lo.r, lo.g, lo.b, lo.r, lo.g, lo.b, hi.r, hi.g, hi.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  function makeFlowerGeometry() {
    const pos = [], col = [];
    const stemTop = 0.42;
    const stemCol = linear('#4f5e3a');
    const leafCol = linear('#69734a');
    const petal = linear('#e0a17a');
    const heart = linear('#ffd58d');
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI / 2;
      const dx = Math.cos(a) * 0.025, dz = Math.sin(a) * 0.025;
      pos.push(-dz, 0, dx, dz, 0, -dx, dx * 0.3, stemTop, dz * 0.3);
      col.push(stemCol.r * 0.7, stemCol.g * 0.7, stemCol.b * 0.7, stemCol.r * 0.7, stemCol.g * 0.7, stemCol.b * 0.7, leafCol.r, leafCol.g, leafCol.b);
    }
    // two little leaves
    for (let i = 0; i < 2; i++) {
      const s = i ? 1 : -1;
      pos.push(0, 0.10, 0, s * 0.24, 0.16, 0.02, s * 0.10, 0.21, 0.02);
      col.push(leafCol.r * .8, leafCol.g * .8, leafCol.b * .8, leafCol.r, leafCol.g, leafCol.b, leafCol.r, leafCol.g, leafCol.b);
    }
    const petals = 6;
    for (let p = 0; p < petals; p++) {
      const a1 = p / petals * Math.PI * 2, a2 = (p + 0.5) / petals * Math.PI * 2;
      const r1 = 0.16, r2 = 0.02;
      pos.push(Math.cos(a1) * r2, stemTop + 0.02, Math.sin(a1) * r2,
               Math.cos(a1) * r1, stemTop + 0.04, Math.sin(a1) * r1,
               Math.cos(a2) * r1 * 0.7, stemTop + 0.10, Math.sin(a2) * r1 * 0.7);
      col.push(heart.r, heart.g, heart.b, petal.r, petal.g, petal.b, petal.r * .8, petal.g * .75, petal.b * .75);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  function makeReedGeometry(rng) {
    const pos = [], col = [];
    const low = linear('#48563c'), high = linear('#b39a58');
    for (let b = 0; b < 3; b++) {
      const a = b * 2.1 + rng.range(-0.2, 0.2);
      const h = 0.8 + rng.next() * 0.8;
      const dx = Math.cos(a), dz = Math.sin(a);
      const w = 0.025;
      pos.push(-dz * w, 0, dx * w, dz * w, 0, -dx * w, dx * 0.16, h, dz * 0.16);
      col.push(low.r, low.g, low.b, low.r, low.g, low.b, high.r, high.g, high.b);
      // cattail head
      const hx = dx * 0.16, hz = dz * 0.16;
      const r = 0.045;
      for (let k = 0; k < 4; k++) {
        const aa = k / 4 * Math.PI * 2;
        pos.push(hx, h - 0.17, hz, hx + Math.cos(aa) * r, h, hz + Math.sin(aa) * r, hx + Math.cos(aa + 1.6) * r, h + 0.16, hz + Math.sin(aa + 1.6) * r);
        col.push(low.r * .6, low.g * .55, low.b * .5, 0.28, 0.18, 0.10, 0.36, 0.23, 0.12);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    return g;
  }

  class Scenery {
    constructor(scene, world, boulders) {
      this.scene = scene;
      this.world = world;
      this.boulders = boulders;
      this.time = 0;
      this.treeRenderer = new TreeRenderer(scene, world);
      this.buildGround();
      this.buildMist();
      this.buildDust();
      this.buildBirds();
      this.buildBoats();
    }

    buildGround() {
      const world = this.world;
      const rng = new SG.RNG(SG.SEED + 871);
      const tufts = [], flowers = [], reeds = [];
      const attempts = 14000;
      for (let i = 0; i < attempts; i++) {
        const x = rng.range(1, SG.WORLD.SX - 1);
        const z = rng.range(1, SG.WORLD.SZ - 1);
        const sx = Math.floor(x), sz = Math.floor(z);
        const top = world.topSolid(sx, sz, true);
        if (top < SG.SEA_LEVEL || top > 45) continue;
        if (world.isSolid(sx, top + 1, sz)) continue;
        const type = world.get(sx, top, sz);
        if (type !== B.TURF && type !== B.MOSS && type !== B.SAND) continue;
        const d = x - world.coastX(z);
        if (type === B.SAND && top <= SG.SEA_LEVEL + 2.2) {
          if (reeds.length < 520 && rng.chance(0.55)) reeds.push({ x, y: top + 1, z, r: rng.next() });
          continue;
        }
        if (type === B.TURF || type === B.MOSS) {
          if (tufts.length < 7500) tufts.push({ x, y: top + 1, z, r: rng.next() });
          if (flowers.length < 560 && rng.chance(0.14)) flowers.push({ x, y: top + 1, z, r: rng.next() });
        } else if (type === B.SAND && reeds.length < 520 && rng.chance(0.2)) {
          reeds.push({ x, y: top + 1, z, r: rng.next() });
        }
      }
      // These are *tints*: the geometry already carries the low-poly green
      // gradient. Multiplying by another dark green would swallow the light.
      this.tufts = this.makeInstancedGround(makeTuftGeometry(rng), tufts, { scale: [0.55, 1.35], colors: ['#f7ecd4', '#dfe8c4', '#ffe4bf', '#e8dcc5'], wind: 0.09, windKey: 'tufts' });
      this.flowers = this.makeInstancedGround(makeFlowerGeometry(), flowers, { scale: [0.62, 1.05], colors: ['#fff6e6', '#ffd9c6', '#ffecd5', '#f7d3cf'], wind: 0.08, windKey: 'flowers' });
      this.reeds = this.makeInstancedGround(makeReedGeometry(rng), reeds, { scale: [0.7, 1.35], colors: ['#ffecc7', '#f1dfb9', '#fff3d8'], wind: 0.12, windKey: 'reeds' });
    }

    makeInstancedGround(geo, list, opts) {
      const mat = addWind(new THREE.MeshStandardMaterial({
        vertexColors: true, side: THREE.DoubleSide, roughness: 0.95,
        alphaTest: 0.0
      }), opts.wind, opts.windKey || 'ground', 'blade');
      const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length));
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      mesh.frustumCulled = false;
      mesh.count = list.length;
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
      const c = new THREE.Color();
      const colPool = opts.colors.map(linear);
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        const yaw = item.r * 6.283;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        const sc = SG.lerp(opts.scale[0], opts.scale[1], hashCell(i, 1, 2, 33));
        p.set(item.x, item.y, item.z);
        s.set(sc, sc * (0.8 + item.r * 0.5), sc);
        m.compose(p, q, s);
        mesh.setMatrixAt(i, m);
        c.copy(colPool[i % colPool.length]).multiplyScalar(0.82 + item.r * 0.4);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.name = opts.name || 'ground-detail';
      this.scene.add(mesh);
      return mesh;
    }

    buildMist() {
      const tex = makeGlowTexture(128, 'rgba(255,236,218,0.9)', 'rgba(255,236,218,0)', 0.06);
      this.mist = [];
      const rng = new SG.RNG(SG.SEED + 991);
      for (let i = 0; i < 11; i++) {
        const z = rng.range(20, SG.WORLD.SZ - 20);
        const coast = this.world.coastX(z);
        const x = coast + rng.range(-24, 18);
        const mat = new THREE.SpriteMaterial({
          map: tex, color: 0xffd3b0, transparent: true, opacity: 0.035 + rng.next() * 0.045,
          depthWrite: false, blending: THREE.NormalBlending, fog: false
        });
        const sp = new THREE.Sprite(mat);
        sp.position.set(x, SG.SEA_LEVEL + rng.range(1.0, 5.0), z);
        sp.scale.set(rng.range(36, 78), rng.range(7, 16), 1);
        sp.renderOrder = 25;
        sp.userData.baseX = x;
        sp.userData.phase = rng.next() * 6.283;
        sp.userData.speed = 0.06 + rng.next() * 0.08;
        this.scene.add(sp);
        this.mist.push(sp);
      }
    }

    buildDust() {
      const count = 240;
      const pos = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      const phases = new Float32Array(count);
      const warm = linear('#ffcf9a'), cool = linear('#c5b2c2');
      const rng = new SG.RNG(SG.SEED + 993);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = rng.range(-30, 30);
        pos[i * 3 + 1] = rng.range(1, 20);
        pos[i * 3 + 2] = rng.range(-30, 30);
        const c = rng.chance(0.55) ? warm : cool;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
        phases[i] = rng.next() * 6.283;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      const tex = makeGlowTexture(32, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)', 0.2);
      const mat = new THREE.PointsMaterial({
        size: 0.13, map: tex, transparent: true, opacity: 0.55,
        vertexColors: true, depthWrite: false, blending: THREE.AdditiveBlending,
        sizeAttenuation: true, fog: false
      });
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      pts.renderOrder = 30;
      pts.name = 'sunset-motes';
      this.scene.add(pts);
      this.dust = { points: pts, geo, phases, count, anchor: new THREE.Vector3() };
    }

    buildBirds() {
      const pos = [], col = [];
      const c = linear('#21161e');
      function tri(a, b, d) {
        pos.push(...a, ...b, ...d);
        col.push(c.r, c.g, c.b, c.r, c.g, c.b, c.r, c.g, c.b);
      }
      tri([0, 0, 0.32], [0, 0, -0.28], [-1.15, 0.52, 0.12]);
      tri([0, 0, -0.28], [0, 0, 0.32], [1.15, 0.52, 0.12]);
      tri([0, 0, 0.34], [0.08, 0.02, -0.4], [-0.08, 0.02, -0.4]);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.8, fog: false });
      this.birdMesh = new THREE.InstancedMesh(geo, mat, 10);
      this.birdMesh.frustumCulled = false;
      this.birdMesh.renderOrder = 5;
      this.birdMesh.name = 'gulls';
      const rng = new SG.RNG(SG.SEED + 1177);
      this.birdData = [];
      for (let i = 0; i < 10; i++) {
        this.birdData.push({
          cx: rng.range(0, 70), cz: rng.range(10, 150),
          r: rng.range(18, 54), phase: rng.next() * 6.283,
          speed: rng.range(0.015, 0.045) * (rng.chance(0.5) ? 1 : -1),
          alt: SG.SEA_LEVEL + rng.range(17, 33),
          scale: rng.range(0.65, 1.25), flap: rng.next() * 6.283
        });
      }
      this.birdMesh.count = 10;
      this.scene.add(this.birdMesh);
      this._mat4 = new THREE.Matrix4();
      this._qq = new THREE.Quaternion();
      this._pp = new THREE.Vector3();
      this._ss = new THREE.Vector3();
      this._up = new THREE.Vector3(0, 1, 0);
    }

    buildBoats() {
      this.boats = [];
      const mat = new THREE.MeshBasicMaterial({ color: 0x1b121d, side: THREE.DoubleSide, transparent: true, opacity: 0.82, fog: false });
      const spots = [
        { x: -55, z: 35, s: 1.35, r: 0.3 },
        { x: 75, z: -90, s: 1.0, r: -0.5 },
        { x: -160, z: 170, s: 0.8, r: 0.9 }
      ];
      for (const spot of spots) {
        const g = new THREE.Group();
        const hull = new THREE.BufferGeometry();
        const verts = [
          // port side
          -0.56, 0.0, -1.45,  -0.56, 0.55, -0.55,  -0.34, 0.46, 1.32,
          -0.56, 0.0, -1.45,  -0.34, 0.46, 1.32,  -0.42, 0.0, 1.18,
          // starboard side
           0.56, 0.0, -1.45,   0.34, 0.46, 1.32,   0.56, 0.55, -0.55,
           0.56, 0.0, -1.45,   0.42, 0.0, 1.18,    0.34, 0.46, 1.32,
          // bottom
          -0.56, 0.0, -1.45,   0.42, 0.0, 1.18,    -0.42, 0.0, 1.18,
          -0.56, 0.0, -1.45,   0.56, 0.0, -1.45,   0.42, 0.0, 1.18,
          // transom / raised bow
          -0.56, 0.55, -0.55,  0.56, 0.55, -0.55,  0.34, 0.46, 1.32,
          -0.56, 0.55, -0.55,  0.34, 0.46, 1.32,  -0.34, 0.46, 1.32
        ];
        hull.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        hull.computeVertexNormals();
        const hullMesh = new THREE.Mesh(hull, mat);
        hullMesh.position.y = SG.SEA_LEVEL + 0.15;
        g.add(hullMesh);
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.2, 4), mat);
        mast.position.set(0, SG.SEA_LEVEL + 2.3, -0.2);
        g.add(mast);
        const sailGeo = new THREE.BufferGeometry();
        sailGeo.setAttribute('position', new THREE.Float32BufferAttribute([
          0, SG.SEA_LEVEL + 4.2, -0.2, 0, SG.SEA_LEVEL + 1.0, -0.2, 0, SG.SEA_LEVEL + 3.0, 2.2
        ], 3));
        sailGeo.computeVertexNormals();
        g.add(new THREE.Mesh(sailGeo, mat));
        g.position.set(spot.x, 0, spot.z);
        g.rotation.y = spot.r;
        g.scale.setScalar(spot.s);
        g.userData.baseY = 0;
        g.userData.phase = Math.random() * 6.283;
        this.scene.add(g);
        this.boats.push(g);
      }
    }

    update(dt, time, camera) {
      this.time += dt;
      WIND.uWindTime.value = this.time;
      if (this.treeRenderer) {
        if (this.world.treeRevision !== this._treeRev) {
          this.treeRenderer.rebuild();
          this._treeRev = this.world.treeRevision;
        }
      }
      // Mist drifts slowly along the shore.
      for (const sp of this.mist) {
        sp.position.x = sp.userData.baseX + Math.sin(time * sp.userData.speed + sp.userData.phase) * 6.0;
        sp.position.y = SG.SEA_LEVEL + 2.5 + Math.sin(time * 0.07 + sp.userData.phase) * 0.8;
      }
      // Pollen catches the last light.
      if (this.dust) {
        const arr = this.dust.geo.attributes.position.array;
        const center = camera.position;
        for (let i = 0; i < this.dust.count; i++) {
          const ph = this.dust.phases[i];
          arr[i * 3] += (0.10 + Math.sin(time * 0.22 + ph) * 0.04) * dt;
          arr[i * 3 + 1] += (0.03 + Math.cos(time * 0.17 + ph) * 0.025) * dt;
          arr[i * 3 + 2] += Math.cos(time * 0.19 + ph) * 0.03 * dt;
          const x = arr[i * 3], y = arr[i * 3 + 1], z = arr[i * 3 + 2];
          if (x > 34) arr[i * 3] = -34; if (x < -34) arr[i * 3] = 34;
          if (z > 34) arr[i * 3 + 2] = -34; if (z < -34) arr[i * 3 + 2] = 34;
          if (y < 0) arr[i * 3 + 1] = 20; if (y > 20) arr[i * 3 + 1] = 1;
        }
        this.dust.geo.attributes.position.needsUpdate = true;
        this.dust.points.position.set(
          Math.floor(center.x / 2) * 2 - 0, 0, Math.floor(center.z / 2) * 2 - 0
        );
        this.dust.points.position.y = center.y - 10;
      }
      // Gulls wheel over the bay, banking now and then.
      if (this.birdMesh) {
        const M = this._mat4, Q = this._qq, P = this._pp, S = this._ss;
        for (let i = 0; i < this.birdData.length; i++) {
          const b = this.birdData[i];
          const a = time * b.speed + b.phase;
          const x = b.cx + Math.cos(a) * b.r;
          const z = b.cz + Math.sin(a) * b.r * 0.62;
          const y = b.alt + Math.sin(time * 0.7 + b.phase) * 1.0;
          const yaw = Math.atan2(-Math.sin(a) * b.r * b.speed, Math.cos(a) * b.r * 0.62 * b.speed);
          Q.setFromAxisAngle(this._up, yaw);
          P.set(x, y, z);
          const flap = 0.52 + 0.55 * Math.abs(Math.sin(time * 2.4 + b.phase * 2));
          S.set(b.scale, b.scale * flap, b.scale);
          M.compose(P, Q, S);
          this.birdMesh.setMatrixAt(i, M);
        }
        this.birdMesh.instanceMatrix.needsUpdate = true;
      }
      if (this.boats) {
        for (const b of this.boats) {
          b.position.y = Math.sin(time * 0.5 + b.userData.phase) * 0.12;
          b.rotation.z = Math.sin(time * 0.42 + b.userData.phase) * 0.025;
        }
      }
    }
  }

  // ------------------------------------------------------------- hand-held
  class HandModel {
    constructor(scene, camera) {
      this.scene = scene;
      this.camera = camera;
      this.group = new THREE.Group();
      this.group.name = 'held-sun-shard';
      this.group.position.set(0.42, -0.31, -0.70);
      this.group.rotation.set(0.2, -0.45, 0.12);
      this.basePos = this.group.position.clone();
      this.baseRot = this.group.rotation.clone();
      this.swingT = 0;
      this.time = 0;
      this.mat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.7, metalness: 0.05, flatShading: true,
        transparent: true, opacity: 1.0, depthTest: false, depthWrite: false,
        fog: false
      });
      this.accentMat = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: 0.4, metalness: 0.1, flatShading: true,
        emissive: new THREE.Color(0xffb04f), emissiveIntensity: 0.55,
        transparent: true, opacity: 1.0, depthTest: false, depthWrite: false,
        fog: false
      });
      this.rockGeo = new THREE.DodecahedronGeometry(0.092, 0);
      const rp = this.rockGeo.attributes.position;
      for (let i = 0; i < rp.count; i++) {
        const n = hashCell(i, 5, 13, 81);
        rp.setXYZ(i, rp.getX(i) * (0.8 + n * 0.35), rp.getY(i) * (0.96 + n * 0.25), rp.getZ(i) * (0.68 + n * 0.2));
      }
      this.rockGeo.computeVertexNormals();
      this.woodGeo = new THREE.CylinderGeometry(0.045, 0.068, 0.24, 6, 1, false);
      this.woodGeo.translate(0, -0.01, 0);
      this.woodGeo.rotateZ(0.55);
      this.leafGeo = new THREE.IcosahedronGeometry(0.115, 0);
      this.leafGeo.scale(0.92, 0.66, 1.0);
      this.crystalGeo = new THREE.OctahedronGeometry(0.115, 0);
      this.crystalGeo.scale(0.7, 1.45, 0.7);
      this.mainMesh = new THREE.Mesh(this.rockGeo, this.mat);
      this.accentMesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.036, 0), this.accentMat);
      this.accentMesh.position.set(-0.055, 0.07, 0.03);
      this.mainMesh.frustumCulled = false;
      this.accentMesh.frustumCulled = false;
      this.mainMesh.renderOrder = 900;
      this.accentMesh.renderOrder = 901;
      this.mainMesh.castShadow = false;
      this.mainMesh.receiveShadow = false;
      this.group.add(this.mainMesh, this.accentMesh);
      this.group.visible = false;
      camera.add(this.group);
      this.itemType = SG.B.TURF;
    }

    setItem(type) {
      this.itemType = type;
      const info = SG.BI[type] || SG.BI[SG.B.TURF];
      const col = new THREE.Color(info.top[0]);
      const accent = new THREE.Color(info.top[info.top.length - 1]);
      this.mat.color.copy(col).lerp(new THREE.Color(0xffffff), 0.1);
      this.mat.emissive.copy(col).multiplyScalar(0.12);
      this.mat.emissiveIntensity = 1.0;
      this.accentMat.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.25);
      this.accentMat.emissive.copy(accent).multiplyScalar(0.5);
      this.mat.roughness = type === SG.B.AMBER ? 0.32 : type === SG.B.SAND ? 0.92 : 0.74;
      this.accentMesh.visible = type === SG.B.AMBER || type === SG.B.CORAL || type === SG.B.MOSS;
      let geo = this.rockGeo;
      if (type === SG.B.WOOD) geo = this.woodGeo;
      else if (type === SG.B.LEAVES) geo = this.leafGeo;
      else if (type === SG.B.AMBER) geo = this.crystalGeo;
      this.mainMesh.geometry = geo;
      this.mainMesh.scale.setScalar(type === SG.B.WOOD ? 1.0 : 0.95);
      this.mainMesh.rotation.set(0.1, 0.6, -0.15);
      if (type === SG.B.AMBER) {
        this.mat.emissive.copy(new THREE.Color(0xff7a1b));
        this.mat.emissiveIntensity = 1.35;
        this.accentMat.emissiveIntensity = 2.2;
      } else {
        this.accentMat.emissiveIntensity = 0.55;
      }
    }

    swing() { this.swingT = 1.0; }

    setVisible(v) { this.group.visible = !!v; }

    update(dt, speed, onGround) {
      this.time += dt;
      this.swingT = Math.max(0, this.swingT - dt * 3.6);
      const p = this.swingT > 0 ? Math.sin(this.swingT * Math.PI) : 0;
      const bob = (onGround && speed > 0.6 ? Math.sin(this.time * 9.2) * 0.008 : Math.sin(this.time * 1.4) * 0.003);
      this.group.position.set(
        this.basePos.x + Math.sin(this.time * 0.9) * 0.004 - p * 0.07,
        this.basePos.y + bob - p * 0.045,
        this.basePos.z - p * 0.04
      );
      this.group.rotation.set(
        this.baseRot.x - p * 0.26,
        this.baseRot.y + Math.sin(this.time * 0.5) * 0.02,
        this.baseRot.z + p * 0.38
      );
    }
  }

  SG.HandModel = HandModel;
  SG.TreeRenderer = TreeRenderer;
  SG.BoulderSystem = BoulderSystem;
  SG.Scenery = Scenery;
  SG.makeGlowTexture = makeGlowTexture;
  SG.makeRockGeometry = makeRockGeometry;
})();
