/* ============================================================
   SOLSTICE — hand-built HDR post pipeline: bloom, god rays,
   anamorphic flare, ACES, grade, grain, soft AA
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  const VERT = `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const COPY_FRAG = `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
  `;

  const BRIGHT_FRAG = `
    uniform sampler2D tDiffuse;
    uniform float uThreshold;
    uniform float uKnee;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float b = max(c.r, max(c.g, c.b));
      float w = smoothstep(uThreshold, uThreshold + uKnee, b);
      gl_FragColor = vec4(min(c, vec3(9.0)) * w, 1.0);
    }
  `;

  const BLUR_FRAG = `
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;
      c += texture2D(tDiffuse, vUv + uDir * 1.384615).rgb * 0.316216;
      c += texture2D(tDiffuse, vUv - uDir * 1.384615).rgb * 0.316216;
      c += texture2D(tDiffuse, vUv + uDir * 3.230769).rgb * 0.070270;
      c += texture2D(tDiffuse, vUv - uDir * 3.230769).rgb * 0.070270;
      gl_FragColor = vec4(c, 1.0);
    }
  `;

  const RAYS_FRAG = `
    uniform sampler2D tDiffuse;
    uniform vec2 uSunUV;
    uniform float uVisible;
    uniform float uTime;
    varying vec2 vUv;
    float haze(vec2 p) {
      float h = fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
      return h;
    }
    void main() {
      vec2 toSun = uSunUV - vUv;
      float dist = length(toSun);
      vec3 sum = vec3(0.0);
      float norm = 0.0;
      float jitter = (haze(vUv + uTime * 0.02) - 0.5) * 0.012;
      for (int i = 0; i < 32; i++) {
        float t = (float(i) + jitter) / 31.0;
        vec2 uv = vUv + toSun * t * 0.92;
        float w = pow(1.0 - t, 1.6);
        vec3 c = texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb;
        sum += c * w;
        norm += w;
      }
      vec3 rays = sum / max(norm, 0.001);
      rays *= uVisible;
      rays *= smoothstep(0.0, 0.24, dist);
      gl_FragColor = vec4(rays, 1.0);
    }
  `;

  const COMPOSITE_FRAG = `
    uniform sampler2D tScene;
    uniform sampler2D tBloomNear;
    uniform sampler2D tBloomFar;
    uniform sampler2D tRays;
    uniform vec2 uResolution;
    uniform vec2 uSunUV;
    uniform float uSunVisible;
    uniform float uTime;
    uniform float uExposure;
    uniform float uAspect;
    varying vec2 vUv;

    const mat3 ACESInputMat = mat3(
      vec3(0.59719, 0.07600, 0.02840),
      vec3(0.35458, 0.90834, 0.13383),
      vec3(0.04823, 0.01566, 0.83777)
    );
    const mat3 ACESOutputMat = mat3(
      vec3( 1.60475, -0.10208, -0.00327),
      vec3(-0.53108,  1.10813, -0.07276),
      vec3(-0.07367, -0.00605,  1.07602)
    );
    vec3 RRTAndODTFit(vec3 v) {
      vec3 a = v * (v + 0.0245786) - 0.000090537;
      vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
      return a / b;
    }
    vec3 acesFilm(vec3 color) {
      color *= uExposure / 0.6;
      color = ACESInputMat * color;
      color = RRTAndODTFit(color);
      color = ACESOutputMat * color;
      return clamp(color, 0.0, 1.0);
    }
    vec3 linearToSRGB(vec3 c) {
      vec3 lo = c * 12.92;
      vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
      return mix(hi, lo, step(c, vec3(0.0031308)));
    }
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }
    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float radial = length(fromCenter * vec2(uAspect, 1.0));

      // A whisper of lens dispersion at the edges.
      vec2 ca = fromCenter * (0.00035 + radial * 0.0009);
      vec3 scene;
      scene.r = texture2D(tScene, uv + ca).r;
      scene.g = texture2D(tScene, uv).g;
      scene.b = texture2D(tScene, uv - ca).b;

      vec3 near = texture2D(tBloomNear, uv).rgb;
      vec3 far = texture2D(tBloomFar, uv).rgb;
      vec3 rays = texture2D(tRays, uv).rgb;

      vec3 col = scene;
      col += near * vec3(1.00, 0.88, 0.72) * 0.58;
      col += far * vec3(1.00, 0.72, 0.54) * 0.52;
      col += rays * vec3(1.00, 0.54, 0.23) * 0.16;

      // A small, filmic sun response that only blooms when the disc is on screen.
      vec2 sunD = (uv - uSunUV) * vec2(uAspect, 1.0);
      float sunDist = length(sunD);
      float sunGlow = exp(-sunDist * 7.5) * 0.28 + exp(-sunDist * 2.0) * 0.035;
      col += vec3(1.10, 0.37, 0.09) * sunGlow * uSunVisible;
      float streak = exp(-abs(sunD.y) * 280.0) * exp(-abs(sunD.x) * 2.4);
      col += vec3(1.0, 0.32, 0.07) * streak * 0.035 * uSunVisible;
      // Three ghost orbs, kept very faint.
      for (int i = 1; i <= 3; i++) {
        vec2 gp = uSunUV + (vec2(0.5) - uSunUV) * (float(i) * 0.62);
        float gd = length((uv - gp) * vec2(uAspect, 1.0));
        col += vec3(1.0, 0.42, 0.18) * (1.0 - smoothstep(0.0, 0.028, gd)) * (0.010 - float(i) * 0.0018) * uSunVisible;
      }

      // Grade in linear: rosy lifted shadows, warm highlights, a little more
      // saturation around the horizon.
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(luma), col, 1.055);
      col += vec3(0.010, 0.003, 0.016) * (1.0 - smoothstep(0.0, 0.28, luma));
      col *= vec3(1.04, 1.0, 0.965);
      col = max(col, vec3(0.0));

      col = acesFilm(col);

      // Soft vignette: enough to frame the sun, never a black tunnel.
      float vig = 1.0 - smoothstep(0.22, 0.96, radial);
      col *= mix(0.68, 1.0, vig);
      // Faint warm corner wash.
      col += vec3(0.020, 0.007, 0.008) * smoothstep(0.35, 0.9, radial) * (1.0 - vig);

      col = linearToSRGB(col);
      // Film grain and blue-noise-ish dither.
      float grain = hash(uv * uResolution + uTime * 11.7) - 0.5;
      col += grain * 0.013;
      col += (hash(uv * uResolution + 7.0) - 0.5) / 255.0;

      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `;

  const AA_FRAG = `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    void main() {
      vec2 t = 1.0 / uResolution;
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, -t.y)).rgb;
      vec3 s = texture2D(tDiffuse, vUv + vec2(0.0, t.y)).rgb;
      vec3 e = texture2D(tDiffuse, vUv + vec2(t.x, 0.0)).rgb;
      vec3 w = texture2D(tDiffuse, vUv - vec2(t.x, 0.0)).rgb;
      float lc = luma(c), ln = luma(n), ls = luma(s), le = luma(e), lw = luma(w);
      float edge = max(abs(ln - ls), abs(le - lw));
      float f = smoothstep(0.035, 0.19, edge);
      vec3 soft = (c * 4.0 + n + s + e + w) / 8.0;
      gl_FragColor = vec4(mix(c, soft, f * 0.72), 1.0);
    }
  `;

  class PostFX {
    constructor(renderer, scene, camera, opts) {
      opts = opts || {};
      this.renderer = renderer;
      this.scene = scene;
      this.camera = camera;
      this.width = 1;
      this.height = 1;
      this.pixelRatio = opts.pixelRatio || Math.min(window.devicePixelRatio || 1, 1.5);
      this.sunUv = new THREE.Vector2(0.5, 0.5);
      this.sunVisible = 0;
      this.time = 0;
      this.quality = opts.quality || 'high';
      this.dynamicResolution = true;
      this._sunWorld = new THREE.Vector3();
      this._camDir = new THREE.Vector3();
      this._size = new THREE.Vector2();

      this.quadScene = new THREE.Scene();
      this.quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
      this.quad.frustumCulled = false;
      this.quadMat = null;
      this.quadScene.add(this.quad);

      const base = { depthTest: false, depthWrite: false, toneMapped: false };
      this.copyMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: { tDiffuse: { value: null } }, vertexShader: VERT, fragmentShader: COPY_FRAG
      }));
      this.brightMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: { tDiffuse: { value: null }, uThreshold: { value: 1.02 }, uKnee: { value: 0.9 } },
        vertexShader: VERT, fragmentShader: BRIGHT_FRAG
      }));
      this.blurMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2(1 / 512, 0) } },
        vertexShader: VERT, fragmentShader: BLUR_FRAG
      }));
      this.raysMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: {
          tDiffuse: { value: null }, uSunUV: { value: new THREE.Vector2(0.5, 0.5) },
          uVisible: { value: 0 }, uTime: { value: 0 }
        },
        vertexShader: VERT, fragmentShader: RAYS_FRAG
      }));
      this.compositeMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: {
          tScene: { value: null }, tBloomNear: { value: null }, tBloomFar: { value: null },
          tRays: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) },
          uSunUV: { value: new THREE.Vector2(0.5, 0.5) }, uSunVisible: { value: 0 },
          uTime: { value: 0 }, uExposure: { value: 1.08 }, uAspect: { value: 16 / 9 }
        },
        vertexShader: VERT, fragmentShader: COMPOSITE_FRAG
      }));
      this.aaMat = new THREE.ShaderMaterial(Object.assign({}, base, {
        uniforms: { tDiffuse: { value: null }, uResolution: { value: new THREE.Vector2(1, 1) } },
        vertexShader: VERT, fragmentShader: AA_FRAG
      }));

      this.sceneRT = null;
      this.brightRT = null;
      this.blurA = null;
      this.blurB = null;
      this.bloomA = null;
      this.bloomB = null;
      this.raysRT = null;
      this.compositeRT = null;
      this.allocated = false;
      this.gl2 = renderer.capabilities && renderer.capabilities.isWebGL2;
      this.hdrRequested = !!opts.hdr;
      this.hdrAvailable = false;
      this.hdrType = THREE.UnsignedByteType;

      if (this.gl2) {
        try {
          this.hdrAvailable = renderer.extensions.has('EXT_color_buffer_float') ||
            renderer.extensions.has('EXT_color_buffer_half_float');
        } catch (e) {
          this.hdrAvailable = false;
        }
      }

      // Compatibility-first: automatic HalfFloat/HDR targets are known to
      // corrupt on some ANGLE/D3D11 stacks (INC-2026-001). Keep the HDR path
      // for explicitly opted-in diagnostics or validated devices only.
      if (this.hdrRequested && this.hdrAvailable) this.hdrType = THREE.HalfFloatType;
      this.hdrEnabled = this.hdrType === THREE.HalfFloatType;
      this.renderMode = this.hdrEnabled ? 'hdr' : 'ldr';
      this.brightMat.uniforms.uThreshold.value = this._brightThreshold();
    }

    _brightThreshold() {
      const ldr = this.hdrType === THREE.UnsignedByteType;
      if (this.quality === 'low') return ldr ? 0.82 : 1.2;
      return ldr ? 0.68 : 1.02;
    }

    allocate() {
      const r = this.renderer;
      r.getDrawingBufferSize(this._size);
      const w = Math.max(2, Math.floor(this._size.x));
      const h = Math.max(2, Math.floor(this._size.y));
      if (this.allocated && w === this.width && h === this.height) return;
      this.width = w; this.height = h;
      this.disposeTargets();
      const mk = (mw, mh, type, depth) => {
        const t = new THREE.WebGLRenderTarget(Math.max(2, Math.floor(mw)), Math.max(2, Math.floor(mh)), {
          minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat, type: type || this.hdrType,
          depthBuffer: !!depth, stencilBuffer: false
        });
        t.texture.generateMipmaps = false;
        t.texture.encoding = THREE.LinearEncoding;
        return t;
      };
      this.sceneRT = mk(w, h, this.hdrType, true);
      this.brightRT = mk(w / 2, h / 2, this.hdrType, false);
      this.blurA = mk(w / 2, h / 2, this.hdrType, false);
      this.blurB = mk(w / 2, h / 2, this.hdrType, false);
      this.bloomA = mk(w / 4, h / 4, this.hdrType, false);
      this.bloomB = mk(w / 4, h / 4, this.hdrType, false);
      this.raysRT = mk(w / 2, h / 2, this.hdrType, false);
      this.compositeRT = mk(w, h, THREE.UnsignedByteType, false);
      this.compositeMat.uniforms.uResolution.value.set(w, h);
      this.compositeMat.uniforms.uAspect.value = w / h;
      this.aaMat.uniforms.uResolution.value.set(w, h);
      this.allocated = true;
    }

    disposeTargets() {
      for (const k of ['sceneRT', 'brightRT', 'blurA', 'blurB', 'bloomA', 'bloomB', 'raysRT', 'compositeRT']) {
        if (this[k]) { this[k].dispose(); this[k] = null; }
      }
    }

    setPixelRatio(pr) {
      this.pixelRatio = pr;
      this.renderer.setPixelRatio(pr);
      this.allocated = false;
    }

    setQuality(q) {
      this.quality = q;
      this.brightMat.uniforms.uThreshold.value = this._brightThreshold();
    }

    resize(w, h) {
      this.renderer.setPixelRatio(this.pixelRatio);
      this.renderer.setSize(w, h);
      this.allocated = false;
      this.allocate();
    }

    pass(mat, target) {
      this.quad.material = mat;
      this.renderer.setRenderTarget(target);
      this.renderer.clear(true, false, false);
      this.renderer.render(this.quadScene, this.quadCamera);
    }

    updateSun() {
      this.camera.updateMatrixWorld();
      this.camera.matrixWorldInverse.copy(this.camera.matrixWorld).invert();
      this.camera.getWorldDirection(this._camDir);
      this._sunWorld.copy(this.camera.position).addScaledVector(SG.SUN_DIR, 1000);
      this._sunWorld.project(this.camera);
      const u = this._sunWorld.x * 0.5 + 0.5;
      const v = this._sunWorld.y * 0.5 + 0.5;
      const facing = this._camDir.dot(SG.SUN_DIR);
      const onScreen = u > -0.2 && u < 1.2 && v > -0.2 && v < 1.2;
      this.sunVisible = SG.smoothstep(0.0, 0.32, facing) * (onScreen ? 1 : 0);
      this.sunUv.set(u, v);
      this.compositeMat.uniforms.uSunUV.value.copy(this.sunUv);
      this.compositeMat.uniforms.uSunVisible.value = this.sunVisible;
      this.raysMat.uniforms.uSunUV.value.copy(this.sunUv);
      this.raysMat.uniforms.uVisible.value = this.sunVisible;
    }

    render(dt, elapsed) {
      if (!this.allocated) this.allocate();
      this.time += dt;
      this.updateSun();
      const r = this.renderer;
      r.setRenderTarget(this.sceneRT);
      r.clear(true, true, false);
      r.render(this.scene, this.camera);

      // Bright + near bloom
      this.brightMat.uniforms.tDiffuse.value = this.sceneRT.texture;
      this.pass(this.brightMat, this.brightRT);

      // Half-resolution horizontal/vertical bloom.
      this.blurMat.uniforms.tDiffuse.value = this.brightRT.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.brightRT.width, 0);
      this.pass(this.blurMat, this.blurA);
      this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.brightRT.height);
      this.pass(this.blurMat, this.blurB);
      this.blurMat.uniforms.tDiffuse.value = this.blurB.texture;
      this.blurMat.uniforms.uDir.value.set(1.4 / this.brightRT.width, 0);
      this.pass(this.blurMat, this.blurA);
      this.blurMat.uniforms.tDiffuse.value = this.blurA.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1.4 / this.brightRT.height);
      this.pass(this.blurMat, this.blurB);

      // Quarter-resolution mip for wide glow.
      this.copyMat.uniforms.tDiffuse.value = this.blurB.texture;
      this.pass(this.copyMat, this.bloomA);
      this.blurMat.uniforms.tDiffuse.value = this.bloomA.texture;
      this.blurMat.uniforms.uDir.value.set(1 / this.bloomA.width, 0);
      this.pass(this.blurMat, this.bloomB);
      this.blurMat.uniforms.tDiffuse.value = this.bloomB.texture;
      this.blurMat.uniforms.uDir.value.set(0, 1 / this.bloomA.height);
      this.pass(this.blurMat, this.bloomA);

      // Volumetric-ish screen-space light scattering.
      this.raysMat.uniforms.tDiffuse.value = this.brightRT.texture;
      this.raysMat.uniforms.uTime.value = this.time;
      this.pass(this.raysMat, this.raysRT);

      this.compositeMat.uniforms.tScene.value = this.sceneRT.texture;
      this.compositeMat.uniforms.tBloomNear.value = this.blurB.texture;
      this.compositeMat.uniforms.tBloomFar.value = this.bloomA.texture;
      this.compositeMat.uniforms.tRays.value = this.raysRT.texture;
      this.compositeMat.uniforms.uTime.value = this.time;
      this.pass(this.compositeMat, this.compositeRT);

      this.aaMat.uniforms.tDiffuse.value = this.compositeRT.texture;
      this.quad.material = this.aaMat;
      r.setRenderTarget(null);
      r.clear(true, true, false);
      r.render(this.quadScene, this.quadCamera);
      r.setRenderTarget(null);
    }

    dispose() {
      this.disposeTargets();
      this.copyMat.dispose();
      this.brightMat.dispose();
      this.blurMat.dispose();
      this.raysMat.dispose();
      this.compositeMat.dispose();
      this.aaMat.dispose();
      this.quad.geometry.dispose();
    }
  }

  SG.PostFX = PostFX;
})();
