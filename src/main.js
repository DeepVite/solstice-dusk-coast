/* ============================================================
   SOLSTICE — the last light, put together
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class Game {
    constructor() {
      this.canvas = document.getElementById('game');
      this.ui = new SG.UI();
      this.audio = new SG.AudioEngine();
      this.scene = null;
      this.camera = null;
      this.renderer = null;
      this.post = null;
      this.world = null;
      this.player = null;
      this.started = false;
      this.loading = true;
      this.last = performance.now();
      this.elapsed = 0;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
      this.fps = 60;
      this._pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
      this._adaptTimer = 0;
      this._adaptSteps = 0;
      this._lastCollapseToast = 0;
      this._died = false;
      this._boundResize = () => this.onResize();
      window.addEventListener('resize', this._boundResize);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.started && this.player && !this.player.paused) this.player.pause();
      });
      this.canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.ui.fatal('图形上下文丢失了。请刷新页面，落日会重新升起。');
      });
      this.boot().catch((err) => {
        console.error(err);
        this.ui.fatal('生成海岸时出了一点问题：' + (err && err.message ? err.message : err));
      });
    }

    async boot() {
      requestAnimationFrame(() => {
        const fade = document.getElementById('fade');
        if (fade) fade.classList.add('ready');
      });
      this.ui.setLoadingProgress(0.015, '等待潮汐…');
      await nextFrame();
      this.initRenderer();
      this.ui.setLoadingProgress(0.05, '铺开一层晚霞…');
      await nextFrame();
      this.initStage();
      this.world = new SG.World(this.scene);

      this.ui.setLoadingProgress(0.10, '雕刻海崖与海湾…');
      await nextFrame();
      this.world.generateTerrain((p) => this.ui.setLoadingProgress(0.10 + p * 0.38, '雕刻海崖与海湾…'));
      this.world.generateAmberSeams();
      this.world.selectSpawn();
      this.ui.setLoadingProgress(0.52, '种下第一片松林…');
      await nextFrame();
      this.world.generateTrees();
      this.ui.setLoadingProgress(0.60, '让松林记得自己的重量…');
      await nextFrame();

      this.ui.setLoadingProgress(0.64, '把岩层一块一块放到海边…');
      this.world.buildAllChunks();
      const total = this.world.chunkQueue.length;
      while (this.world._chunkIndex < total) {
        const t0 = performance.now();
        let more = true;
        while (more && performance.now() - t0 < 12) more = this.world.buildNextChunk();
        this.ui.setLoadingProgress(0.64 + 0.18 * (this.world._chunkIndex / total), '把岩层一块一块放到海边…');
        await nextFrame();
      }
      this.ui.setLoadingProgress(0.84, '唤来海风与低垂的太阳…');
      await nextFrame();

      this.setupLighting();
      this.sky = new SG.Sky(this.scene);
      this.heightTexture = this.world.makeHeightTexture();
      this.water = SG.createWater(this.scene, this.heightTexture);
      this.ui.setLoadingProgress(0.88, '拾起被潮水磨圆的石头…');
      await nextFrame();

      this.boulders = new SG.BoulderSystem(this.scene, this.world, SG.SEED + 313);
      this.scenery = new SG.Scenery(this.scene, this.world, this.boulders);
      this.ui.setLoadingProgress(0.92, '让草丛、海鸟和薄雾就位…');
      await nextFrame();

      this.debris = new SG.DebrisSystem(this.scene, this.world);
      this.debris.setPixelRatio(this._pixelRatio);
      this.treeSystem = new SG.TreeSystem(this.scene, this.world, this.scenery.treeRenderer, this.debris);
      this.physics = new SG.PhysicsSystem(this.world, this.scenery, this.boulders, this.debris, this.treeSystem);
      this.boulders.debris = this.debris;
      this.wirePhysicsEvents();

      this.post = new SG.PostFX(this.renderer, this.scene, this.camera, {
        pixelRatio: this._pixelRatio, quality: 'high'
      });
      this.onResize();
      this.ui.setLoadingProgress(0.96, '等最后一束光落进海面…');
      await nextFrame();

      this.player = new SG.Player({
        world: this.world, camera: this.camera, canvas: this.canvas, scene: this.scene,
        ui: this.ui, audio: this.audio, boulders: this.boulders, debris: this.debris,
        physics: this.physics, trees: this.treeSystem,
        callbacks: {
          onShake: (v) => this.player && this.player.addShake(v),
          onEdit: (e) => this.onEdit(e)
        }
      });
      this.wireUI();
      this.ui.setMuted(this.audio.muted);
      this.last = performance.now();
      this.elapsed = 0;
      this.clockRunning = false;

      // One warm-up render before the title card.
      this.player.frameIntro(0);
      this.scenery.update(0.016, 0, this.camera);
      this.updateSunLight(this.camera.position);
      this.post.render(0.016, 0);
      this.ui.setLoadingProgress(1, '太阳停在了海上。');
      await nextFrame();
      await wait(420);
      this.loading = false;
      this.ui.finishLoading();
      this.last = performance.now();
      this.animate();
    }

    initRenderer() {
      const renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false
      });
      if (!renderer.getContext()) throw new Error('WebGL 不可用');
      renderer.setPixelRatio(this._pixelRatio);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.outputEncoding = THREE.LinearEncoding;
      renderer.physicallyCorrectLights = false;
      renderer.autoClear = true;
      renderer.name = 'solstice-renderer';
      this.renderer = renderer;
      this.canvas.tabIndex = 0;
    }

    initStage() {
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0x0c0911);
      this.scene.fog = new THREE.FogExp2(SG.PALETTE.fog, 0.0018);
      this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.08, 2600);
      this.camera.rotation.order = 'YXZ';
      this.camera.position.set(0, 30, 0);
      this.scene.add(this.camera);
      const dir = new THREE.Vector3(SG.SUN_DIR.x, 0.30, SG.SUN_DIR.z).normalize();
      this.lightDir = dir;
    }

    setupLighting() {
      const hemi = new THREE.HemisphereLight(0x9b86c6, 0x3a2722, 0.92);
      hemi.name = 'sky-fill';
      this.scene.add(hemi);

      const sun = new THREE.DirectionalLight(0xffb26c, 3.35);
      sun.name = 'low-sun';
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -72;
      sun.shadow.camera.right = 72;
      sun.shadow.camera.top = 72;
      sun.shadow.camera.bottom = -72;
      sun.shadow.camera.near = 1;
      sun.shadow.camera.far = 340;
      sun.shadow.bias = -0.00035;
      sun.shadow.normalBias = 0.055;
      this.scene.add(sun);
      this.scene.add(sun.target);
      this.sunLight = sun;

      const fill = new THREE.DirectionalLight(0xc18fc4, 0.34);
      fill.name = 'anti-sun-fill';
      fill.position.set(-SG.SUN_DIR.x * 80, 30, -SG.SUN_DIR.z * 80);
      fill.target.position.set(0, 15, 0);
      this.scene.add(fill);
      this.scene.add(fill.target);

      const ambient = new THREE.AmbientLight(0x4a334f, 0.17);
      this.scene.add(ambient);

      // Some warm bounce from the lit horizon.
      const bounce = new THREE.DirectionalLight(0xff9f65, 0.18);
      bounce.position.set(SG.SUN_DIR.x * 40, -5, SG.SUN_DIR.z * 40);
      bounce.target.position.set(0, 20, 0);
      this.scene.add(bounce, bounce.target);

      this.updateSunLight(this.world.spawn);
    }

    updateSunLight(origin) {
      if (!this.sunLight) return;
      const x = origin.x, z = origin.z;
      const y = origin.y || 20;
      const tx = Math.round(x / 2) * 2, tz = Math.round(z / 2) * 2;
      this.sunLight.target.position.set(tx, y, tz);
      this.sunLight.position.set(tx + this.lightDir.x * 170, y + this.lightDir.y * 170, tz + this.lightDir.z * 170);
      this.sunLight.target.updateMatrixWorld();
      this.sunLight.updateMatrixWorld();
    }

    onResize() {
      if (!this.renderer) return;
      const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      if (this.post) {
        this.post.setPixelRatio(this._pixelRatio);
        this.post.resize(w, h);
      } else {
        this.renderer.setPixelRatio(this._pixelRatio);
        this.renderer.setSize(w, h);
      }
      if (this.debris) this.debris.setPixelRatio(this._pixelRatio);
    }

    wireUI() {
      this.ui.setHandlers({
        onStart: () => this.startGame(),
        onResume: () => { if (this.player) this.player.resume(); },
        onRespawn: () => { if (this.player) this.player.respawn(); },
        onMute: () => this.toggleMute()
      });
      this.ui.setMuted(this.audio.muted);
    }

    wirePhysicsEvents() {
      const near = (x, z, r) => {
        if (!this.player) return false;
        return Math.hypot(this.player.position.x - x, this.player.position.z - z) < r;
      };
      this.physics.onEvent = (type, data) => {
        if (type === 'collapse') {
          const c = data.cells && data.cells[0] || { x: 0, z: 0 };
          if (near(c.x, c.z, 28)) {
            this.player.addShake(Math.min(0.85, 0.16 + data.count * 0.004));
            this.audio.rumble(Math.min(1.6, data.count / 45));
            if (performance.now() - this._lastCollapseToast > 1700) {
              this._lastCollapseToast = performance.now();
              this.ui.warn('岩层失稳 · ' + data.count + ' 块岩石正在坍塌');
            }
          }
        }
      };
      this.treeSystem.onEvent = (type, data) => {
        if (!data) return;
        if (type === 'tree-topple') {
          this.audio.woodCrack();
          if (near(data.tree.x, data.tree.z, 30)) this.ui.toast('松树的根松开了。它正在向坡下倒去。', 2400);
        } else if (type === 'tree-impact') {
          if (near(data.tree.x, data.tree.z, 32)) {
            this.player.addShake(0.34);
            this.audio.rumble(0.75);
          }
        }
      };
      this.debris.onImpact = (item) => {
        if (!this.player) return;
        if (this.player.position.distanceTo(item.pos) < 5 && item.radius > 0.26) {
          this.player.addShake(0.018);
        }
      };
      this.boulders.onEvent = (type, data) => {
        if (!data || !data.mesh) return;
        if (type === 'rock-break') {
          this.audio.breakStone();
        } else if (type === 'rock-land') {
          if (this.player && this.player.position.distanceTo(data.mesh.position) < 20) {
            this.player.addShake(0.12);
            this.audio.rumble(0.35);
          }
        }
      };
    }

    startGame() {
      if (!this.player || this.loading || this.started) return;
      this.started = true;
      this.audio.ambience();
      this.player.requestPlay();
      this.ui.hideMenu();
      clearTimeout(this._introTip);
      this._introTip = setTimeout(() => {
        if (this.player && this.player.started) this.ui.toast('悬挑会折断，洞穴会塌落。这里的每一块岩石都有重量。', 5600);
      }, 9000);
      if (!this.clockRunning) {
        this.clockRunning = true;
        this.last = performance.now();
      }
    }

    toggleMute() {
      const muted = this.audio.toggleMute();
      this.ui.setMuted(muted);
      if (muted) this.ui.toast('世界安静了下来。', 1400);
      else this.ui.toast('海风回来了。', 1400);
    }

    onEdit(info) {
      // Hook for future state persistence / metrics.
    }

    animate(now) {
      requestAnimationFrame((t) => this.animate(t));
      if (this._died) return;
      const t = typeof now === 'number' ? now : performance.now();
      let dt = (t - this.last) / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0.016;
      this.last = t;
      dt = Math.min(dt, 0.05);
      this.elapsed += dt;
      const time = this.elapsed;

      try {
        const active = this.player && this.player.started && !this.player.paused && this.player.enabled;
        if (this.player) {
          if (!this.player.started) {
            this.player.frameIntro(time);
          } else if (active) {
            this.player.update(dt);
            this.physics.update(dt, this.camera);
            this.treeSystem.update(dt);
            this.boulders.update(dt, time, this.camera);
            this.audio.setUnderwater(this.player.submerged);
          }
        }

        if (this.sky) this.sky.update(this.camera, dt);
        if (this.water) this.water.update(this.camera, dt);
        if (this.scenery) this.scenery.update(dt, time, this.camera);
        this.updateSunLight(this.player ? this.player.position : this.camera.position);

        this.fpsAccum += dt;
        this.fpsFrames++;
        if (this.fpsAccum > 0.5) {
          this.fps = this.fpsFrames / this.fpsAccum;
          this.ui.setFPS(this.fps);
          this.fpsAccum = 0;
          this.fpsFrames = 0;
          if (this.started) this.adaptQuality(dt);
        }

        if (this.post) this.post.render(dt, time);
        else this.renderer.render(this.scene, this.camera);
      } catch (err) {
        this._died = true;
        console.error(err);
        this.ui.fatal('渲染途中出现了一个错误：' + (err && err.message ? err.message : err));
      }
    }

    adaptQuality() {
      if (this._adaptSteps >= 2) return;
      const now = performance.now();
      if (this.fps < 42) {
        if (!this._adaptTimer) this._adaptTimer = now;
        if (now - this._adaptTimer > 3500) {
          this._adaptTimer = 0;
          this._adaptSteps++;
          this._pixelRatio = Math.max(1.0, this._pixelRatio - 0.2);
          this.post.setPixelRatio(this._pixelRatio);
          this.post.resize(window.innerWidth, window.innerHeight);
          if (this.debris) this.debris.setPixelRatio(this._pixelRatio);
          this.ui.toast('为了让海风更轻，渲染精度已微微降低。', 2600);
        }
      } else {
        this._adaptTimer = 0;
      }
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.SOLSTICE_GAME = new Game();
  });
})();
