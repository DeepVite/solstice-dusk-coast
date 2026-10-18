/* ============================================================
   SOLSTICE — structural integrity, debris, falling trees, dust
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;
  const B = SG.B;

  const UNSET = 65535;

  // --------------------------------------------------------------- debris
  class DebrisSystem {
    constructor(scene, world) {
      this.scene = scene;
      this.world = world;
      this.capacity = 800;
      this.items = [];
      this.time = 0;
      this.geo = new THREE.DodecahedronGeometry(0.5, 0);
      // Slightly chip the shared debris nugget.
      const p = this.geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const n = SG.hash32(i * 3, i * 7, i * 11, 19);
        p.setXYZ(i, p.getX(i) * (0.8 + n * 0.38), p.getY(i) * (0.72 + n * 0.36), p.getZ(i) * (0.8 + n * 0.32));
      }
      this.geo.computeVertexNormals();
      const dcolors = new Float32Array(this.geo.attributes.position.count * 3);
      dcolors.fill(1);
      this.geo.setAttribute('color', new THREE.Float32BufferAttribute(dcolors, 3));
      this.mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.94, metalness: 0.0, flatShading: true, vertexColors: true });
      this.mesh = new THREE.InstancedMesh(this.geo, this.mat, this.capacity);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = false;
      this.mesh.receiveShadow = true;
      this.mesh.count = 0;
      this.mesh.name = 'falling-rubble';
      scene.add(this.mesh);
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._s = new THREE.Vector3();
      this._c = new THREE.Color();
      this._axis = new THREE.Vector3();
      this.onImpact = null;
      this.makeDust();
    }

    makeDust() {
      this.dustMax = 420;
      this.dust = [];
      const geo = new THREE.BufferGeometry();
      this.dustPos = new Float32Array(this.dustMax * 3);
      this.dustSize = new Float32Array(this.dustMax);
      this.dustAlpha = new Float32Array(this.dustMax);
      this.dustColor = new Float32Array(this.dustMax * 3);
      geo.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
      geo.setAttribute('aSize', new THREE.BufferAttribute(this.dustSize, 1));
      geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.dustAlpha, 1));
      geo.setAttribute('aColor', new THREE.BufferAttribute(this.dustColor, 3));
      geo.setDrawRange(0, 0);
      this.dustGeo = geo;
      this.dustMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        blending: THREE.NormalBlending,
        uniforms: { uPixelRatio: { value: window.devicePixelRatio || 1 } },
        vertexShader: `
          uniform float uPixelRatio;
          attribute float aSize;
          attribute float aAlpha;
          attribute vec3 aColor;
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = clamp(aSize * uPixelRatio * (520.0 / max(1.0, -mv.z)), 1.0, 110.0);
            gl_Position = projectionMatrix * mv;
            vAlpha = aAlpha;
            vColor = aColor;
          }
        `,
        fragmentShader: `
          varying float vAlpha;
          varying vec3 vColor;
          void main() {
            vec2 p = gl_PointCoord - vec2(0.5);
            float d = length(p) * 2.0;
            float a = (1.0 - smoothstep(0.12, 1.0, d)) * vAlpha;
            if (a < 0.003) discard;
            gl_FragColor = vec4(vColor, a);
          }
        `
      });
      this.dustPoints = new THREE.Points(geo, this.dustMat);
      this.dustPoints.frustumCulled = false;
      this.dustPoints.renderOrder = 35;
      this.dustPoints.name = 'dust';
      this.scene.add(this.dustPoints);
    }

    setPixelRatio(pr) {
      this.dustMat.uniforms.uPixelRatio.value = pr;
    }

    spawn(opts) {
      if (this.items.length >= this.capacity) {
        // Recycle the oldest settled item first.
        let idx = this.items.findIndex((x) => x.settled);
        if (idx < 0) idx = 0;
        this.items.splice(idx, 1);
      }
      const scale = opts.scale || 0.5;
      const item = {
        pos: opts.pos.clone(),
        vel: opts.vel ? opts.vel.clone() : new THREE.Vector3(),
        quat: opts.quat ? opts.quat.clone() : new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6)),
        targetScale: new THREE.Vector3(
          opts.stretch ? scale * 0.52 : scale * (0.9 + Math.random() * 0.3),
          opts.stretch ? scale * 1.45 : scale * (0.7 + Math.random() * 0.45),
          opts.stretch ? scale * 0.52 : scale * (0.9 + Math.random() * 0.3)
        ),
        color: (opts.color || new THREE.Color(0x5d5a5f)).clone(),
        radius: scale * 0.48,
        settled: false,
        life: 0,
        ttl: opts.ttl || (14 + Math.random() * 12),
        glow: !!opts.glow,
        gravity: opts.gravity === undefined ? 1.0 : opts.gravity,
        oldFloor: 0
      };
      this.items.push(item);
      return item;
    }

    blockColor(type, face) {
      const info = SG.BI[type] || SG.BI[B.STONE];
      const pal = face === 'top' ? info.top : info.side;
      return new THREE.Color(pal[Math.floor(Math.random() * pal.length)]);
    }

    spawnBlock(x, y, z, type, opts) {
      opts = opts || {};
      const c = this.blockColor(type, Math.random() > 0.45 ? 'side' : 'top');
      const leaves = type === B.LEAVES;
      const wood = type === B.WOOD;
      const scale = opts.scale || (leaves ? 0.30 : 0.38);
      const stretch = wood;
      const vel = opts.vel || new THREE.Vector3(
        (Math.random() - 0.5) * (leaves ? 1.7 : 1.1),
        0.8 + Math.random() * (leaves ? 1.2 : 2.0),
        (Math.random() - 0.5) * (leaves ? 1.7 : 1.1)
      );
      return this.spawn({
        pos: new THREE.Vector3(x + 0.5 + (Math.random() - 0.5) * 0.35, y + 0.35 + Math.random() * 0.25, z + 0.5 + (Math.random() - 0.5) * 0.35),
        vel, color: c, scale, stretch: leaves, ttl: leaves ? 8 : 20,
        gravity: leaves ? 0.34 : 1.0,
        glow: type === B.AMBER
      });
    }

    spawnRockChunk(x, y, z, vel, scale) {
      return this.spawn({
        pos: new THREE.Vector3(x, y, z), vel,
        color: new THREE.Color(0x68616b).lerp(new THREE.Color(0x2f2d37), Math.random() * 0.5),
        scale: scale || (0.24 + Math.random() * 0.2), ttl: 16,
        gravity: 1.0
      });
    }

    puff(x, y, z, count, opts) {
      opts = opts || {};
      const color = opts.color || new THREE.Color(0x90756a);
      for (let i = 0; i < count; i++) {
        if (this.dust.length >= this.dustMax) this.dust.shift();
        const life = opts.life || (1.4 + Math.random() * 2.0);
        this.dust.push({
          pos: new THREE.Vector3(x + (Math.random() - 0.5) * (opts.spread || 1.8), y + Math.random() * (opts.rise || 0.8), z + (Math.random() - 0.5) * (opts.spread || 1.8)),
          vel: new THREE.Vector3((Math.random() - 0.5) * (opts.drift || 0.5), (opts.up || 0.25) + Math.random() * 0.35, (Math.random() - 0.5) * (opts.drift || 0.5)),
          life, maxLife: life, size: (opts.size || 0.85) * (0.7 + Math.random() * 0.7),
          color: color
        });
      }
    }

    update(dt, camera) {
      this.time += dt;
      dt = Math.min(dt, 0.05);
      const active = [];
      for (const it of this.items) {
        if (!it.settled) {
          it.vel.y -= 22.0 * it.gravity * dt;
          it.pos.x += it.vel.x * dt;
          it.pos.y += it.vel.y * dt;
          it.pos.z += it.vel.z * dt;
          if (it.vel.lengthSq() > 0.001) {
            const speed = it.vel.length();
            this._axis.copy(it.vel).multiplyScalar(1 / speed);
            this._q.setFromAxisAngle(this._axis, speed * dt * (it.gravity > 0.5 ? 1.9 : 1.1));
            it.quat.premultiply(this._q);
          }
          const floor = this.world.floorBelow(it.pos.x, it.pos.y + 0.8, it.pos.z);
          const surface = (floor < 0 ? -6 : floor) + it.radius;
          if (it.pos.y <= surface) {
            it.pos.y = surface;
            if (it.vel.y < -2.0) {
              it.vel.y *= -0.22;
              it.vel.x *= 0.64; it.vel.z *= 0.64;
              if (this.onImpact) this.onImpact(it, camera);
              if (it.radius > 0.18 && Math.random() > 0.55) this.puff(it.pos.x, it.pos.y, it.pos.z, 1, { size: 0.5, life: 0.8, spread: 0.4 });
            } else {
              it.vel.set(0, 0, 0);
              it.settled = true;
              it.life = 0;
            }
          }
          if (it.pos.y < -12 || Math.abs(it.pos.x) > 400 || Math.abs(it.pos.z) > 400) it.ttl = -1;
        } else {
          it.life += dt;
        }
        if (it.ttl < 0) continue;
        if (it.settled && it.life > it.ttl) continue;
        active.push(it);
      }
      this.items = active;
      let n = 0;
      for (const it of this.items) {
        const fade = it.settled ? SG.clamp(1.0 - (it.life - Math.max(0, it.ttl - 2.4)) / 2.4, 0.0, 1.0) : 1.0;
        const s = it.targetScale;
        this._s.set(s.x * fade, s.y * fade, s.z * fade);
        this._m.compose(it.pos, it.quat, this._s);
        this.mesh.setMatrixAt(n, this._m);
        this.mesh.setColorAt(n, it.color);
        n++;
      }
      this.mesh.count = n;
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;

      // Dust / smoke
      let dn = 0;
      const kept = [];
      for (const d of this.dust) {
        d.life -= dt;
        if (d.life <= 0) continue;
        d.pos.addScaledVector(d.vel, dt);
        d.vel.x *= 0.992; d.vel.z *= 0.992;
        d.vel.y += 0.09 * dt;
        d.size += dt * 1.1;
        kept.push(d);
      }
      this.dust = kept;
      for (const d of this.dust) {
        if (dn >= this.dustMax) break;
        this.dustPos[dn * 3] = d.pos.x;
        this.dustPos[dn * 3 + 1] = d.pos.y;
        this.dustPos[dn * 3 + 2] = d.pos.z;
        this.dustSize[dn] = d.size;
        this.dustAlpha[dn] = SG.clamp(d.life / d.maxLife, 0, 1) * 0.24;
        this.dustColor[dn * 3] = d.color.r;
        this.dustColor[dn * 3 + 1] = d.color.g;
        this.dustColor[dn * 3 + 2] = d.color.b;
        dn++;
      }
      this.dustGeo.setDrawRange(0, dn);
      this.dustGeo.attributes.position.needsUpdate = true;
      this.dustGeo.attributes.aSize.needsUpdate = true;
      this.dustGeo.attributes.aAlpha.needsUpdate = true;
      this.dustGeo.attributes.aColor.needsUpdate = true;
    }
  }

  // ----------------------------------------------------------- tree physics
  class TreeSystem {
    constructor(scene, world, treeRenderer, debris) {
      this.scene = scene;
      this.world = world;
      this.treeRenderer = treeRenderer;
      this.debris = debris;
      this.toppling = [];
      this.onEvent = null;
      this._m = new THREE.Matrix4();
      this._q = new THREE.Quaternion();
      this._p = new THREE.Vector3();
      this._s = new THREE.Vector3();
      this._tmp = new THREE.Vector3();
      this._c = new THREE.Color();
      this._up = new THREE.Vector3(0, 1, 0);
    }

    style(name) {
      const def = SG.TREE_STYLES[name] || SG.TREE_STYLES.broad;
      return { leaf: def.leaf.map((h) => new THREE.Color(h)), wood: def.wood.map((h) => new THREE.Color(h)) };
    }

    removeFromTree(tree, cells, type) {
      const list = type === B.WOOD ? tree.trunk : tree.leaves;
      for (const c of cells) {
        const idx = list.findIndex((q) => q.x === c.x && q.y === c.y && q.z === c.z);
        if (idx >= 0) list.splice(idx, 1);
        const i = this.world.idx(c.x, c.y, c.z);
        if (this.world.get(c.x, c.y, c.z) === type && this.world.getTreeId(c.x, c.y, c.z) === tree.id) {
          this.world.removePure(c.x, c.y, c.z);
        }
      }
    }

    handleBlockRemoved(tree, x, y, z, type, fallDir) {
      if (!tree || tree.fallen) return;
      if (type === B.LEAVES) {
        const idx = tree.leaves.findIndex((c) => c.x === x && c.y === y && c.z === z);
        if (idx >= 0) tree.leaves.splice(idx, 1);
        if (this.debris) {
          this.debris.puff(x + 0.5, y + 0.3, z + 0.5, 2, { color: new THREE.Color(0x557055), size: 0.55, life: 1.0, spread: 0.7 });
        }
        return;
      }
      if (type !== B.WOOD) return;
      // Remove the chopped cell from the record.
      const ti = tree.trunk.findIndex((c) => c.x === x && c.y === y && c.z === z);
      if (ti >= 0) tree.trunk.splice(ti, 1);

      const upperTrunk = tree.trunk.filter((c) => c.y > y);
      const lowerTrunk = tree.trunk.filter((c) => c.y < y);
      const movingLeaves = tree.leaves.slice();
      const pivotY = y + 0.5;
      this.startTopple(tree, upperTrunk, movingLeaves, pivotY, fallDir, lowerTrunk.length === 0);
      // The stump keeps only wood below the cut.
      tree.trunk = lowerTrunk;
      tree.leaves = [];
      tree.top = lowerTrunk.length ? lowerTrunk[lowerTrunk.length - 1].y : y;
      if (!lowerTrunk.length) tree.fallen = true;
    }

    startTopple(tree, trunkCells, leafCells, pivotY, fallDir, isWhole) {
      if (!trunkCells.length && !leafCells.length) return;
      const renderer = this.treeRenderer;
      const style = this.style(tree.style);
      const pivot = new THREE.Vector3(tree.x + 0.5, pivotY, tree.z + 0.5);
      let dir = fallDir ? new THREE.Vector3(fallDir.x, 0, fallDir.z) : null;
      if (!dir || dir.lengthSq() < 0.001) {
        const e = 2.0;
        const hL = this.world.floorBelow(tree.x - e, pivotY, tree.z);
        const hR = this.world.floorBelow(tree.x + e, pivotY, tree.z);
        const hD = this.world.floorBelow(tree.x, pivotY, tree.z - e);
        const hU = this.world.floorBelow(tree.x, pivotY, tree.z + e);
        dir = new THREE.Vector3(-(hR - hL), 0, -(hU - hD));
        if (dir.lengthSq() < 0.01) dir.set(Math.sin(tree.id * 3.1), 0, Math.cos(tree.id * 3.1));
      }
      dir.normalize();
      const axis = new THREE.Vector3(dir.z, 0, -dir.x).normalize();
      const group = new THREE.Group();
      group.position.copy(pivot);
      group.name = 'toppling-tree';
      const logMesh = new THREE.InstancedMesh(renderer.logGeo, renderer.logMat, Math.max(1, trunkCells.length));
      const leafMesh = new THREE.InstancedMesh(renderer.leafGeo, renderer.leafMat, Math.max(1, leafCells.length * 2));
      logMesh.castShadow = true; leafMesh.castShadow = true;
      logMesh.receiveShadow = true; leafMesh.receiveShadow = true;
      logMesh.frustumCulled = false; leafMesh.frustumCulled = false;
      const keptLogs = [];
      let ln = 0;
      for (const c of trunkCells) {
        if (this.world.get(c.x, c.y, c.z) !== B.WOOD) continue;
        this.world.removePure(c.x, c.y, c.z);
        const n = SG.hash32(c.x, c.y, c.z, tree.id * 13 + 7);
        this._q.setFromEuler(new THREE.Euler(0, n * Math.PI * 2, 0));
        this._p.set(c.x + 0.5, c.y, c.z + 0.5).sub(group.position);
        this._s.set(1, 1, 1);
        this._m.compose(this._p, this._q, this._s);
        logMesh.setMatrixAt(ln, this._m);
        this._c.copy(style.wood[Math.floor(n * style.wood.length) % style.wood.length]).multiplyScalar(0.86 + n * 0.26);
        logMesh.setColorAt(ln, this._c);
        keptLogs.push({ cell: c, n });
        ln++;
      }
      logMesh.count = ln;
      const keptLeaves = [];
      let le = 0;
      for (const c of leafCells) {
        if (this.world.get(c.x, c.y, c.z) !== B.LEAVES) continue;
        this.world.removePure(c.x, c.y, c.z);
        const n = SG.hash32(c.x, c.y, c.z, tree.id * 13 + 19);
        const n2 = SG.hash32(c.x, c.y, c.z, tree.id * 13 + 29);
        const count = n > 0.68 ? 2 : 1;
        for (let k = 0; k < count && le < leafMesh.count; k++) {
          this._q.setFromEuler(new THREE.Euler(n * 3.1, n2 * 6.28, (n2 - 0.5) * 1.4));
          const scale = 0.63 + n * 0.24 + (k === 1 ? -0.2 : 0);
          this._p.set(c.x + 0.5 + (n - 0.5) * 0.44 + k * 0.2 + 0.0, c.y + 0.48 + (n2 - 0.5) * 0.34, c.z + 0.5 + (n2 - 0.5) * 0.44).sub(group.position);
          this._s.set(scale * 1.08, scale * (0.72 + n2 * 0.16), scale);
          this._m.compose(this._p, this._q, this._s);
          leafMesh.setMatrixAt(le, this._m);
          this._c.copy(style.leaf[Math.floor(n2 * style.leaf.length) % style.leaf.length]).multiplyScalar(0.84 + n * 0.34);
          leafMesh.setColorAt(le, this._c);
          keptLeaves.push({ cell: c, n, n2 });
          le++;
        }
      }
      leafMesh.count = le;
      logMesh.instanceMatrix.needsUpdate = true;
      leafMesh.instanceMatrix.needsUpdate = true;
      if (logMesh.instanceColor) logMesh.instanceColor.needsUpdate = true;
      if (leafMesh.instanceColor) leafMesh.instanceColor.needsUpdate = true;
      group.add(logMesh, leafMesh);
      this.scene.add(group);
      this.toppling.push({
        tree, group, logMesh, leafMesh, pivot, axis,
        angle: 0.012, vel: 0.16 + Math.random() * 0.09,
        style, fallingLeaves: keptLeaves, logs: keptLogs,
        isWhole, leafTimer: 0, impacted: false,
        trunkCount: ln
      });
      this.world.treeRevision++;
      if (this.onEvent) this.onEvent('tree-topple', { tree, isWhole });
    }

    toppleWhole(tree, fallDir) {
      if (tree.fallen) return;
      const cells = tree.trunk.concat(tree.leaves);
      const pivotY = tree.baseY;
      const trunks = tree.trunk.slice();
      const leaves = tree.leaves.slice();
      tree.trunk = [];
      tree.leaves = [];
      tree.fallen = true;
      this.startTopple(tree, trunks, leaves, pivotY, fallDir, true);
    }

    checkSupports(forceDir) {
      for (const tree of this.world.trees) {
        if (tree.fallen) continue;
        let topple = false;
        const baseWood = this.world.get(tree.x, tree.baseY, tree.z);
        const below = this.world.get(tree.x, tree.baseY - 1, tree.z);
        if (baseWood !== B.WOOD || this.world.getTreeId(tree.x, tree.baseY, tree.z) !== tree.id) topple = true;
        if (!below || SG.isTreePart(below)) topple = true;
        if (!topple && tree.trunk.length) {
          // A lower trunk voxel might have been removed by an editor without
          // going through the chop path; detect broken connectivity.
          for (const c of tree.trunk) {
            if (c.y > tree.baseY && this.world.get(c.x, c.y, c.z) !== B.WOOD) { topple = true; break; }
          }
        }
        if (topple) this.toppleWhole(tree, forceDir);
      }
    }

    shedLeaf(t) {
      if (!t.fallingLeaves.length) return;
      const info = t.fallingLeaves[Math.floor(Math.random() * t.fallingLeaves.length)];
      const c = info.cell;
      const v = new THREE.Vector3(c.x + 0.5, c.y + 0.5, c.z + 0.5);
      t.group.updateMatrixWorld(true);
      t.group.localToWorld(v);
      const col = t.style.leaf[Math.floor(Math.random() * t.style.leaf.length)];
      this.debris.spawn({
        pos: v, vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, -0.2 - Math.random() * 0.5, (Math.random() - 0.5) * 1.2),
        color: col, scale: 0.25 + Math.random() * 0.15, stretch: false, gravity: 0.26, ttl: 7
      });
    }

    burstTopple(t) {
      const m = this._m;
      t.group.updateMatrixWorld(true);
      const worldPos = new THREE.Vector3();
      const sampleLogs = t.logs.filter((_, i) => i % Math.max(1, Math.ceil(t.logs.length / 5)) === 0);
      for (const item of sampleLogs) {
        const c = item.cell;
        worldPos.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
        t.group.localToWorld(worldPos);
        this.debris.spawn({
          pos: worldPos.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 3, 0.6 + Math.random() * 2.2, (Math.random() - 0.5) * 3),
          color: t.style.wood[Math.floor(Math.random() * t.style.wood.length)].clone(),
          scale: 0.38, stretch: true, ttl: 18
        });
      }
      const sampleLeaves = t.fallingLeaves.filter((_, i) => i % Math.max(1, Math.ceil(t.fallingLeaves.length / 12)) === 0);
      for (const item of sampleLeaves) {
        const c = item.cell;
        worldPos.set(c.x + 0.5, c.y + 0.5, c.z + 0.5);
        t.group.localToWorld(worldPos);
        this.debris.spawn({
          pos: worldPos.clone(), vel: new THREE.Vector3((Math.random() - 0.5) * 4, -0.1 + Math.random() * 1.6, (Math.random() - 0.5) * 4),
          color: t.style.leaf[Math.floor(Math.random() * t.style.leaf.length)].clone(),
          scale: 0.28 + Math.random() * 0.16, stretch: false, gravity: 0.32, ttl: 9
        });
      }
      this.debris.puff(t.group.position.x, t.group.position.y + 0.5, t.group.position.z, 10, {
        color: new THREE.Color(0x90786a), size: 1.8, spread: 5, rise: 2, life: 2.5, up: 0.5
      });
      this.scene.remove(t.group);
      if (this.onEvent) this.onEvent('tree-impact', { tree: t.tree, isWhole: t.isWhole });
    }

    update(dt) {
      dt = Math.min(dt, 0.05);
      for (let i = this.toppling.length - 1; i >= 0; i--) {
        const t = this.toppling[i];
        t.vel += (1.15 + 1.1 * Math.sin(Math.min(t.angle, 1.3))) * dt;
        t.angle += t.vel * dt;
        if (t.angle > 1.28) {
          this.burstTopple(t);
          this.toppling.splice(i, 1);
          continue;
        }
        t.group.quaternion.setFromAxisAngle(t.axis, t.angle);
        // Shed a few leaves as the crown swings.
        t.leafTimer -= dt;
        if (t.leafTimer <= 0 && t.angle > 0.18) {
          t.leafTimer = 0.10 + Math.random() * 0.12;
          this.shedLeaf(t);
        }
        // Leaf flutter is randomized; keep total pressure low.
      }
    }
  }

  // -------------------------------------------------------- structural check
  class PhysicsSystem {
    constructor(world, scenery, boulders, debris, trees) {
      this.world = world;
      this.scenery = scenery;
      this.boulders = boulders;
      this.debris = debris;
      this.trees = trees;
      this.onEvent = null;
      this.stats = { collapses: 0, blocks: 0 };
    }

    analyzeSupport(origin, radius) {
      const world = this.world;
      radius = radius || SG.CFG.collapseRadius;
      const x0 = SG.clamp(Math.floor(origin.x) - radius, 0, SG.WORLD.SX - 1);
      const x1 = SG.clamp(Math.floor(origin.x) + radius, 0, SG.WORLD.SX - 1);
      const z0 = SG.clamp(Math.floor(origin.z) - radius, 0, SG.WORLD.SZ - 1);
      const z1 = SG.clamp(Math.floor(origin.z) + radius, 0, SG.WORLD.SZ - 1);
      const W = x1 - x0 + 1, D = z1 - z0 + 1, H = SG.WORLD.SY;
      const total = W * D * H;
      const cost = new Uint16Array(total);
      cost.fill(UNSET);
      const buckets = [];
      for (let i = 0; i <= 8; i++) buckets.push([]);
      const li = (x, y, z) => (y * D + (z - z0)) * W + (x - x0);
      const isSupport = (x, y, z) => {
        if (x < x0 || x > x1 || z < z0 || z > z1) return false;
        if (y < 0 || y >= H) return false;
        const b = world.get(x, y, z);
        if (!b) return false;
        const tid = world.getTreeId(x, y, z);
        if (tid > 0) return false;
        return true;
      };
      const push = (x, y, z, c) => {
        if (c > 8) return;
        if (!isSupport(x, y, z)) return;
        const k = li(x, y, z);
        if (c >= cost[k]) return;
        cost[k] = c;
        buckets[c].push(k);
      };
      // Bedrock seeds the rooted network. Every other solid block inherits
      // support vertically at zero cost and horizontally at a span cost.
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        if (isSupport(x, 0, z)) push(x, 0, z, 0);
      }
      for (let c = 0; c <= 8; c++) {
        const bucket = buckets[c];
        for (let qi = 0; qi < bucket.length; qi++) {
          const k = bucket[qi];
          const gx = k % W;
          const gz = Math.floor(k / W) % D;
          const y = Math.floor(k / (W * D));
          const x = x0 + gx, z = z0 + gz;
          // vertical zero-cost support
          if (isSupport(x, y + 1, z)) push(x, y + 1, z, c);
          if (y > 0 && isSupport(x, y - 1, z)) push(x, y - 1, z, c);
          if (c < 8) {
            if (isSupport(x + 1, y, z)) push(x + 1, y, z, c + 1);
            if (isSupport(x - 1, y, z)) push(x - 1, y, z, c + 1);
            if (isSupport(x, y, z + 1)) push(x, y, z + 1, c + 1);
            if (isSupport(x, y, z - 1)) push(x, y, z - 1, c + 1);
          }
        }
      }
      const unstable = [];
      for (let y = 2; y < H; y++) {
        for (let z = z0; z <= z1; z++) {
          for (let x = x0; x <= x1; x++) {
            if (!isSupport(x, y, z)) continue;
            const span = SG.blockSpan(world.get(x, y, z));
            const cc = cost[li(x, y, z)];
            if (cc > span) {
              const dx = x - origin.x, dz = z - origin.z;
              unstable.push({ x, y, z, type: world.get(x, y, z), cost: cc, dist: dx * dx + dz * dz });
            }
          }
        }
      }
      if (!unstable.length) return [];
      unstable.sort((a, b) => a.dist - b.dist);
      return unstable;
    }

    collapseAt(origin, opts) {
      opts = opts || {};
      const list = this.analyzeSupport(origin, opts.radius);
      if (!list.length) return null;
      const world = this.world;
      const debris = this.debris;
      const maxSpawn = SG.CFG.maxCollapse;
      let removed = [];
      let spawned = 0;
      const dirBase = new THREE.Vector3(origin.x, origin.y, origin.z);
      for (let i = 0; i < list.length; i++) {
        const c = list[i];
        const type = world.get(c.x, c.y, c.z);
        if (!type) continue;
        world.removePure(c.x, c.y, c.z);
        removed.push(c);
        if (spawned < maxSpawn) {
          const dx = c.x - origin.x, dz = c.z - origin.z;
          const l = Math.max(0.6, Math.hypot(dx, dz));
          const vel = new THREE.Vector3(
            dx / l * (0.18 + Math.random() * 0.55),
            -0.35 + Math.random() * 1.35,
            dz / l * (0.18 + Math.random() * 0.55)
          );
          if (i < maxSpawn * 0.24 || Math.random() > 0.24) {
            const d = debris.spawnBlock(c.x, c.y, c.z, type, { vel });
            d.radius = 0.3;
          }
          spawned++;
        }
      }
      if (!removed.length) return null;
      world.flushDirty();
      this.stats.collapses++;
      this.stats.blocks += removed.length;
      const center = removed[0];
      debris.puff(center.x + 0.5, center.y + 0.2, center.z + 0.5, Math.min(30, 5 + removed.length * 0.25), {
        color: new THREE.Color(0x8b7568), size: 1.1, spread: 10, rise: 4, life: 2.6, up: 0.4
      });
      if (this.onEvent) this.onEvent('collapse', { origin, count: removed.length, cells: removed });
      return removed;
    }

    notifyEdit(origin, opts) {
      opts = opts || {};
      const removedAll = [];
      for (let wave = 0; wave < 2; wave++) {
        const r = this.collapseAt(origin, opts);
        if (!r) break;
        removedAll.push(...r);
      }
      const notifyCells = removedAll.length ? removedAll : [{ x: Math.floor(origin.x), y: Math.floor(origin.y), z: Math.floor(origin.z) }];
      if (this.boulders) this.boulders.notifyEdits(notifyCells.slice(0, 240));
      if (this.trees) this.trees.checkSupports();
      return removedAll;
    }

    update(dt, camera) {
      this.debris.update(dt, camera);
    }
  }

  SG.DebrisSystem = DebrisSystem;
  SG.TreeSystem = TreeSystem;
  SG.PhysicsSystem = PhysicsSystem;
})();
