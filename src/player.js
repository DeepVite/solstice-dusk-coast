/* ============================================================
   SOLSTICE — first-person body, interaction and classic feel
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;
  const CFG = SG.CFG;
  const B = SG.B;

  class Player {
    constructor(ctx) {
      this.ctx = ctx;
      this.world = ctx.world;
      this.camera = ctx.camera;
      this.canvas = ctx.canvas;
      this.ui = ctx.ui;
      this.audio = ctx.audio;
      this.boulders = ctx.boulders;
      this.debris = ctx.debris;
      this.physics = ctx.physics;
      this.trees = ctx.trees;
      this.callbacks = ctx.callbacks || {};
      this.spawn = this.world.spawn;
      this.position = new THREE.Vector3(this.spawn.x, this.spawn.y, this.spawn.z);
      this.velocity = new THREE.Vector3();
      this.yaw = this.spawn.yaw;
      this.pitch = this.spawn.pitch;
      this.onGround = false;
      this.flying = false;
      this.sprinting = false;
      this.inWater = false;
      this.enabled = false;
      this.started = false;
      this.paused = true;
      this.keys = Object.create(null);
      this.held = { left: false, right: false };
      this.editCooldown = 0;
      this.selected = 0;
      this.selection = null;
      this.selectionTimer = 0;
      this._raycaster = new THREE.Raycaster();
      this._rayDir = new THREE.Vector3();
      this._shake = 0;
      this._bob = 0;
      this._bobPhase = 0;
      this._fov = 70;
      this._lastSpace = -1;
      this._jumpRequested = false;
      this._wasInWater = false;
      this.submerged = false;
      this._stepTimer = 0;
      this._introTime = 0;
      this._pointerLocked = false;
      this._sensitivity = 0.00215;
      this._basePosition = this.position.clone();
      this._playerAABB = { r: CFG.playerRadius, h: CFG.playerHeight };
      this._initUI();
      this._initHighlight();
      this.hand = SG.HandModel ? new SG.HandModel(this.ctx.scene, this.camera) : null;
      if (this.hand) this.hand.setItem(SG.ITEMS[this.selected].type);
      this._bindEvents();
      this.applyCamera(0);
    }

    _initUI() {
      for (let i = 0; i < SG.ITEMS.length; i++) {
        const item = SG.ITEMS[i];
        const info = SG.BI[item.type];
        item.name = info.name;
        item.en = info.en;
        item.tip = info.tip;
      }
      this.ui.buildHotbar(SG.ITEMS);
      this.ui.selectItem(0);
      this.ui.setMode('步行', false);
      this.ui.updateVitals(this);
    }

    _initHighlight() {
      const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004));
      const mat = new THREE.LineBasicMaterial({ color: 0xffc37c, transparent: true, opacity: 0.9, depthTest: true });
      this.highlight = new THREE.LineSegments(geo, mat);
      this.highlight.visible = false;
      this.highlight.renderOrder = 50;
      this.ctx.scene.add(this.highlight);
    }

    _bindEvents() {
      this._onKeyDown = (e) => this.onKeyDown(e);
      this._onKeyUp = (e) => this.onKeyUp(e);
      this._onMouseMove = (e) => this.onMouseMove(e);
      this._onMouseDown = (e) => this.onMouseDown(e);
      this._onMouseUp = (e) => this.onMouseUp(e);
      this._onWheel = (e) => this.onWheel(e);
      this._onContext = (e) => e.preventDefault();
      this._onLockChange = () => this.onPointerLockChange();
      window.addEventListener('keydown', this._onKeyDown);
      window.addEventListener('keyup', this._onKeyUp);
      document.addEventListener('mousemove', this._onMouseMove);
      document.addEventListener('mousedown', this._onMouseDown);
      document.addEventListener('mouseup', this._onMouseUp);
      window.addEventListener('wheel', this._onWheel, { passive: false });
      document.addEventListener('contextmenu', this._onContext);
      document.addEventListener('pointerlockchange', this._onLockChange);
      window.addEventListener('blur', () => {
        this.keys = Object.create(null);
        this.held.left = false; this.held.right = false;
      });
    }

    requestPlay() {
      this.ui.hideMenu();
      const onLock = () => {
        this._pointerLocked = true;
        this.paused = false;
        this.enabled = true;
        this.started = true;
        this.ui.setPaused(false);
        this.audio && this.audio.ambience();
        if (this.hand) this.hand.setVisible(true);
        this.ui.toast('风从西边来。整座海岸都在向落日倾斜。', 4200);
      };
      if (this.canvas.requestPointerLock) {
        try {
          const p = this.canvas.requestPointerLock();
          if (p && p.then) {
            p.then(onLock).catch(() => this._fallbackStart());
          } else {
            // The pointerlockchange event will call _pointerLocked on success.
            setTimeout(() => {
              if (document.pointerLockElement === this.canvas) onLock();
              else this._fallbackStart();
            }, 120);
          }
        } catch (err) {
          this._fallbackStart();
        }
      } else {
        this._fallbackStart();
      }
    }

    _fallbackStart() {
      // Still playable if the browser refuses pointer lock: use drag-to-look.
      this.paused = false;
      this.enabled = true;
      this.started = true;
      this.ui.setPaused(false);
      this.audio && this.audio.ambience();
      if (this.hand) this.hand.setVisible(true);
      this.ui.toast('无法捕获鼠标：按住右键拖动视角，仍可继续漫游。', 5200);
    }

    resume() {
      if (!this.started) { this.requestPlay(); return; }
      if (this.canvas.requestPointerLock) {
        try {
          const p = this.canvas.requestPointerLock();
          if (p && p.then) p.then(() => {}).catch(() => {});
        } catch (err) { /* drag-look fallback remains available */ }
        this.paused = false;
        this.enabled = true;
        this.ui.setPaused(false);
        if (this.hand) this.hand.setVisible(true);
      }
    }

    pause() {
      this.enabled = false;
      this.paused = true;
      this.keys = Object.create(null);
      this.held.left = this.held.right = false;
      this.ui.setPaused(true);
      if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    }

    onPointerLockChange() {
      const locked = document.pointerLockElement === this.canvas;
      this._pointerLocked = locked;
      if (locked) {
        this.enabled = true;
        this.paused = false;
        if (this.hand && this.started) this.hand.setVisible(true);
        this.ui.setPaused(false);
      } else if (this.started && this.enabled) {
        // The browser dropped the lock (Esc, alt-tab, or focus loss).
        this.enabled = false;
        this.paused = true;
        this.keys = Object.create(null);
        this.held.left = false; this.held.right = false;
        this.ui.setPaused(true);
      }
    }

    onKeyDown(e) {
      if (!this.enabled) {
        // The UI owns the first Enter press (it starts the game); the player
        // only resumes an already-started game.
        if (e.code === 'Enter' && this.started && this.paused) this.resume();
        return;
      }
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
      this.keys[e.code] = true;
      if (e.repeat) return;
      if (e.code === 'KeyF') this.toggleFlight();
      if (e.code === 'KeyH') { this.ui.toggleHud(); return; }
      if (e.code === 'KeyR') { this.respawn(); return; }
      if (e.code === 'KeyM') { this.audio && this.audio.toggleMute(); this.ui.setMuted(this.audio && this.audio.muted); return; }
      if (e.code === 'KeyQ') { this.ui.toggleHelp(); return; }
      if (e.code === 'Escape' && !this._pointerLocked) { this.pause(); return; }
      if (e.code === 'Space') {
        const now = performance.now();
        const dbl = now - this._lastSpace < 300;
        this._lastSpace = now;
        if (dbl) {
          this.toggleFlight();
        } else {
          this._jumpRequested = true;
        }
      }
      if (e.code.startsWith('Digit')) {
        const d = parseInt(e.code.slice(5), 10);
        if (d >= 1 && d <= SG.ITEMS.length) this.selectSlot(d - 1);
      }
      // R reset is documented in the pause panel but can surprise; only while enabled.
    }

    onKeyUp(e) {
      this.keys[e.code] = false;
    }

    onMouseMove(e) {
      if (!this.enabled) return;
      if (this._pointerLocked) {
        this.yaw -= e.movementX * this._sensitivity;
        this.pitch -= e.movementY * this._sensitivity;
      } else if (e.buttons & 2) {
        // Pointer-lock fallback: right-drag to look, so left click still mines.
        this.yaw -= e.movementX * 0.003;
        this.pitch -= e.movementY * 0.003;
      }
      this.pitch = SG.clamp(this.pitch, -1.48, 1.48);
    }

    onMouseDown(e) {
      if (!this.enabled) return;
      if (e.button === 0) {
        this.held.left = true;
        this.attemptBreak();
      } else if (e.button === 2) {
        e.preventDefault();
        this.held.right = true;
        this.attemptPlace();
      }
    }

    onMouseUp(e) {
      if (e.button === 0) this.held.left = false;
      if (e.button === 2) this.held.right = false;
    }

    onWheel(e) {
      if (!this.enabled) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      this.selectSlot((this.selected + delta + SG.ITEMS.length) % SG.ITEMS.length);
    }

    selectSlot(index) {
      this.selected = index;
      this.ui.selectItem(index);
      if (this.hand) this.hand.setItem(SG.ITEMS[index].type);
      this.audio && this.audio.blip(520 + index * 28, 0.018);
    }

    toggleFlight() {
      this.flying = !this.flying;
      this.velocity.y = 0;
      this.ui.setMode(this.flying ? '飞行' : '步行', this.flying);
      this.ui.toast(this.flying ? '创造飞行 · 双击空格退出' : '踏上海岸 · 双击空格起飞', 1900);
      this.audio && this.audio.blip(this.flying ? 680 : 360, 0.06);
    }

    respawn() {
      const s = this.world.spawn;
      this.position.set(s.x, s.y, s.z);
      this.velocity.set(0, 0, 0);
      this.yaw = s.yaw; this.pitch = s.pitch;
      this.flying = false;
      this.ui.setMode('步行', false);
      this.ui.toast('回到落日崖。', 1600);
    }

    intersectsPlayer(bx, by, bz) {
      const r = this._playerAABB.r;
      const minX = this.position.x - r, maxX = this.position.x + r;
      const minY = this.position.y + 0.02, maxY = this.position.y + this._playerAABB.h - 0.02;
      const minZ = this.position.z - r, maxZ = this.position.z + r;
      return maxX > bx && minX < bx + 1 && maxY > by && minY < by + 1 && maxZ > bz && minZ < bz + 1;
    }

    collidesAt(x, y, z) {
      const r = this._playerAABB.r;
      if (this.world.hitsSolidAABB(x - r, y + 0.02, z - r, x + r, y + this._playerAABB.h, z + r)) return true;
      if (this.boulders && this.boulders.boulders) {
        for (const b of this.boulders.boulders) {
          if (!b.alive) continue;
          const rr = b.halfW * 0.72 + r;
          const dx = x - b.x, dz = z - b.z;
          if (dx * dx + dz * dz > rr * rr) continue;
          if (y < b.y + b.halfH * 0.55 && y + this._playerAABB.h > b.y - b.halfH * 0.9) return true;
        }
      }
      return false;
    }

    _move(axis, amount) {
      if (amount === 0) return false;
      const pos = this.position;
      let nx = pos.x, ny = pos.y, nz = pos.z;
      if (axis === 'x') nx += amount;
      if (axis === 'y') ny += amount;
      if (axis === 'z') nz += amount;
      if (!this.collidesAt(nx, ny, nz)) {
        pos[axis] += amount;
        return false;
      }
      // A tiny auto-step makes the coast walkable without losing weight.
      if (axis !== 'y' && this.onGround && !this.flying) {
        const stepY = 0.4;
        if (!this.collidesAt(nx, pos.y + stepY, nz) && !this.collidesAt(pos.x, pos.y + stepY, pos.z)) {
          pos.y += stepY;
          pos[axis] += amount;
          return false;
        }
      }
      return true;
    }

    updateSelection() {
      const dir = this.camera.getWorldDirection(this._rayDir);
      const hit = this.world.raycast(this.camera.position, dir, CFG.reach);
      let chosen = null;
      if (hit.hit) chosen = { kind: 'block', hit };
      if (this.boulders) {
        this._raycaster.set(this.camera.position, dir);
        const bh = this.boulders.raycast(this._raycaster, CFG.reach);
        if (bh && (!chosen || bh.distance < chosen.hit.distance)) {
          chosen = { kind: 'boulder', boulder: bh.boulder, point: bh.point, distance: bh.distance };
        }
      }
      this.selection = chosen;
      if (chosen && chosen.kind === 'block') {
        this.highlight.visible = true;
        this.highlight.position.set(chosen.hit.x + 0.5, chosen.hit.y + 0.5, chosen.hit.z + 0.5);
        this.highlight.material.opacity = 0.62 + Math.sin(performance.now() * 0.006) * 0.16;
        this.ui.setTarget(SG.blockName(chosen.hit.type), '左键破坏 · 右键放置');
        this.ui.setCrosshairActive(true);
      } else if (chosen && chosen.kind === 'boulder') {
        this.highlight.visible = false;
        this.ui.setTarget('海崖巨砾', '左键击碎');
        this.ui.setCrosshairActive(true);
      } else {
        this.highlight.visible = false;
        this.ui.setTarget('', '');
        this.ui.setCrosshairActive(false);
      }
    }

    attemptBreak() {
      if (!this.enabled || this.editCooldown > 0) return;
      this.updateSelection();
      if (!this.selection) return;
      this.editCooldown = CFG.editCooldown;
      if (this.selection.kind === 'boulder') {
        const hit = this.selection;
        if (this.hand) this.hand.swing();
        this.boulders.shatter(hit.boulder, hit.point, this.camera.getWorldDirection(new THREE.Vector3()));
        this.audio && this.audio.breakStone();
        if (this.callbacks.onShake) this.callbacks.onShake(0.28);
        this.debris.puff(hit.point.x, hit.point.y, hit.point.z, 5, { color: new THREE.Color(0x8b7a72), size: 1.0, spread: 1.4 });
        return;
      }
      const hit = this.selection.hit;
      if (this.hand) this.hand.swing();
      const x = hit.x, y = hit.y, z = hit.z;
      const treeId = this.world.getTreeId(x, y, z);
      const tree = treeId > 0 ? this.world.trees[treeId - 1] : null;
      const type = hit.type;
      const old = this.world.removeBlock(x, y, z);
      if (!old) return;
      const treeDir = new THREE.Vector3(tree ? tree.x + 0.5 - this.position.x : 0, 0, tree ? tree.z + 0.5 - this.position.z : 0);
      if (treeId > 0 && tree) {
        if (treeDir.lengthSq() < 0.01) this.camera.getWorldDirection(treeDir);
        this.trees.handleBlockRemoved(tree, x, y, z, type, treeDir);
      }
      // Visible chunks and dust regardless of owner.
      for (let i = 0; i < 3; i++) {
        this.debris.spawnBlock(x, y, z, type, {
          scale: 0.28,
          vel: new THREE.Vector3((Math.random() - 0.5) * 2.0, 1.2 + Math.random() * 1.7, (Math.random() - 0.5) * 2.0)
        });
      }
      if (type === B.AMBER) {
        this.debris.puff(x + 0.5, y + 0.4, z + 0.5, 4, { color: new THREE.Color(0xffa848), size: 1.1, life: 1.2 });
      }
      this.world.flushDirty();
      if (treeId <= 0) this.physics.notifyEdit({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      else this.trees.checkSupports();
      this.audio && this.audio.breakFor(type);
      if (this.callbacks.onEdit) this.callbacks.onEdit({ x, y, z, type, action: 'break' });
    }

    attemptPlace() {
      if (!this.enabled || this.editCooldown > 0) return;
      this.updateSelection();
      if (!this.selection || this.selection.kind !== 'block') return;
      const hit = this.selection.hit;
      const x = hit.x + hit.normal.x;
      const y = hit.y + hit.normal.y;
      const z = hit.z + hit.normal.z;
      if (!this.world.inBounds(x, y, z)) return;
      if (this.world.isSolid(x, y, z)) return;
      if (this.intersectsPlayer(x, y, z)) {
        this.ui.toast('这里太窄了，放不下。', 1200);
        return;
      }
      const item = SG.ITEMS[this.selected];
      const placed = this.world.setBlock(x, y, z, item.type);
      if (!placed) return;
      if (this.hand) this.hand.swing();
      this.editCooldown = CFG.editCooldown * 0.9;
      this.world.flushDirty();
      this.physics.notifyEdit({ x: x + 0.5, y: y + 0.5, z: z + 0.5 });
      this.audio && this.audio.placeFor(item.type);
      if (this.callbacks.onEdit) this.callbacks.onEdit({ x, y, z, type: item.type, action: 'place' });
      // A small placement puff.
      this.debris.puff(x + 0.5, y + 0.1, z + 0.5, 2, { color: new THREE.Color(0x8b7d6a), size: 0.55, life: 0.7, spread: 0.8, up: 0.1 });
    }

    toggleUnderwater(next) {
      if (next === this._wasInWater) return;
      this._wasInWater = next;
      this.ui.setUnderwater(next);
    }

    updateMovement(dt) {
      const keys = this.keys;
      const forward = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
      const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
      const moving = forward !== 0 || strafe !== 0;
      const shift = keys['ShiftLeft'] || keys['ShiftRight'];
      const sprinting = moving && shift && !this.flying && !this.inWater;
      this.sprinting = sprinting;
      // Yaw basis. Forward at yaw 0 is -Z.
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      const dirX = (-sin * forward + cos * strafe);
      const dirZ = (-cos * forward - sin * strafe);
      const len = Math.hypot(dirX, dirZ) || 1;
      const nx = dirX / len, nz = dirZ / len;

      const openTop = this.world.topSolid(this.position.x, this.position.z, true);
      this.inWater = !this.flying && this.position.y + 0.35 < SG.SEA_LEVEL && openTop >= 0 && openTop < SG.SEA_LEVEL;
      this.submerged = this.position.y + CFG.eyeHeight < SG.SEA_LEVEL;
      this.toggleUnderwater(this.submerged);

      const water = this.inWater;
      const maxSpeed = this.flying ? (sprinting ? CFG.flySpeed * 1.65 : CFG.flySpeed) :
        water ? (sprinting ? CFG.swimSpeed * 1.35 : CFG.swimSpeed) :
        (sprinting ? CFG.sprintSpeed : CFG.walkSpeed);
      const accel = this.flying ? 9.0 : water ? 5.0 : (this.onGround ? 16.0 : 4.0);
      if (moving) {
        this.velocity.x = SG.damp(this.velocity.x, nx * maxSpeed, accel, dt);
        this.velocity.z = SG.damp(this.velocity.z, nz * maxSpeed, accel, dt);
      } else {
        const drag = this.flying ? 4.5 : (this.onGround ? 14.0 : 1.4);
        this.velocity.x = SG.damp(this.velocity.x, 0, drag, dt);
        this.velocity.z = SG.damp(this.velocity.z, 0, drag, dt);
      }

      if (this.flying) {
        let vy = 0;
        if (keys['Space']) vy += 1;
        if (shift) vy -= 1;
        this.velocity.y = SG.damp(this.velocity.y, vy * maxSpeed * 0.9, 8.0, dt);
        if (this._jumpRequested) { this.velocity.y += 3.0; this._jumpRequested = false; }
      } else if (water) {
        this.velocity.y -= (CFG.gravity * 0.20) * dt;
        if (keys['Space']) this.velocity.y += 22.0 * dt;
        if (shift) this.velocity.y -= 8.0 * dt;
        // Gentle buoyancy at the surface.
        const surface = SG.SEA_LEVEL - 0.25;
        if (this.position.y < surface) this.velocity.y += 5.5 * dt;
        this.velocity.y *= Math.exp(-dt * 2.6);
        this._jumpRequested = false;
      } else {
        this.velocity.y -= CFG.gravity * dt;
        if (this._jumpRequested) {
          if (this.onGround) this.velocity.y = CFG.jumpSpeed;
          this._jumpRequested = false;
        }
      }

      // Integrate in small chunks to avoid tunnelling.
      const dx = this.velocity.x * dt, dy = this.velocity.y * dt, dz = this.velocity.z * dt;
      const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.18));
      const sx = dx / steps, sy = dy / steps, sz = dz / steps;
      this.onGround = false;
      for (let i = 0; i < steps; i++) {
        if (this._move('x', sx)) this.velocity.x = 0;
        if (this._move('z', sz)) this.velocity.z = 0;
        const blockedY = this._move('y', sy);
        if (blockedY) {
          if (sy < 0) {
            this.onGround = true;
            this.velocity.y = 0;
          } else {
            this.velocity.y = 0;
          }
        }
        if (!blockedY && sy < 0) this.onGround = false;
      }
      // Standing stability: check one hair below.
      if (!this.flying && this.velocity.y <= 0) {
        if (this.collidesAt(this.position.x, this.position.y - 0.03, this.position.z)) this.onGround = true;
      }
      if (this.position.y < -20) this.respawn();
      // Quiet footsteps on sand, turf and stone.
      const hspeed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.onGround && !this.flying && hspeed > 1.2) {
        this._stepTimer -= dt * (this.sprinting ? 1.55 : 1.0);
        if (this._stepTimer <= 0) {
          this._stepTimer = 0.42;
          if (this.audio) this.audio.footstep(this.sprinting);
        }
      } else {
        this._stepTimer = Math.min(this._stepTimer, 0.16);
      }
    }

    applyCamera(dt) {
      const speed = Math.hypot(this.velocity.x, this.velocity.z);
      if (this.onGround && speed > 0.2 && !this.flying) {
        this._bobPhase += dt * (this.sprinting ? 12.0 : 8.0) * (speed / Math.max(1, CFG.walkSpeed));
      } else {
        this._bobPhase += dt * 1.2;
      }
      this._bob = SG.damp(this._bob, (this.onGround && speed > 0.2 && !this.flying) ? (this.sprinting ? 0.055 : 0.032) : 0, 7, dt);
      const bobY = Math.sin(this._bobPhase * 2.0) * this._bob;
      const bobX = Math.cos(this._bobPhase) * this._bob * 0.36;
      this._shake = Math.max(0, this._shake - dt * 2.8);
      const shake = this._shake * this._shake;
      const shakeX = (Math.random() - 0.5) * shake * 0.12;
      const shakeY = (Math.random() - 0.5) * shake * 0.12;
      const eye = CFG.eyeHeight + bobY + shakeY;
      this.camera.position.set(this.position.x + bobX + shakeX, this.position.y + eye, this.position.z);
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw + (Math.random() - 0.5) * shake * 0.02;
      this.camera.rotation.x = this.pitch + (Math.random() - 0.5) * shake * 0.02;
      this.camera.rotation.z = Math.sin(this._bobPhase) * this._bob * 0.06;
      const targetFov = this.sprinting ? 77 : (this.inWater ? 68 : 70);
      this._fov = SG.damp(this._fov, targetFov, 5.0, dt);
      if (Math.abs(this.camera.fov - this._fov) > 0.01) {
        this.camera.fov = this._fov;
        this.camera.updateProjectionMatrix();
      }
    }

    frameIntro(time) {
      this._introTime = time;
      const eye = this.position.y + CFG.eyeHeight;
      this.camera.position.set(
        this.position.x + Math.sin(time * 0.07) * 0.10,
        eye + Math.sin(time * 0.11) * 0.02,
        this.position.z + Math.cos(time * 0.06) * 0.10
      );
      this.camera.rotation.order = 'YXZ';
      this.camera.rotation.y = this.yaw + Math.sin(time * 0.045) * 0.016;
      this.camera.rotation.x = this.pitch + Math.sin(time * 0.037) * 0.004;
      this.camera.rotation.z = Math.sin(time * 0.031) * 0.002;
    }

    addShake(amount) {
      this._shake = Math.min(1.2, this._shake + amount);
    }

    update(dt) {
      if (!this.enabled) return;
      dt = Math.min(dt, 0.05);
      this.editCooldown = Math.max(0, this.editCooldown - dt);
      this.updateMovement(dt);
      this.applyCamera(dt);
      if (this.hand) this.hand.update(dt, Math.hypot(this.velocity.x, this.velocity.z), this.onGround);
      this.selectionTimer -= dt;
      if (this.selectionTimer <= 0) {
        this.updateSelection();
        this.selectionTimer = 0.06;
      }
      if (this.held.left) this.attemptBreak();
      if (this.held.right) this.attemptPlace();
      this.ui.updateVitals(this);
    }
  }

  SG.Player = Player;
})();
