/* ============================================================
   SOLSTICE — the eternal sunset sky and shared atmosphere GLSL
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  // Shared between the sky dome and the ocean reflection. All colours are
  // in linear space; the final post grade applies ACES.
  SG.SKY_GLSL = `
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float vnoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      float a = hash21(i);
      float b = hash21(i + vec2(1.0, 0.0));
      float c = hash21(i + vec2(0.0, 1.0));
      float d = hash21(i + vec2(1.0, 1.0));
      return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
    }
    float fbm2(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      mat2 rot = mat2(0.80, 0.60, -0.60, 0.80);
      for (int i = 0; i < 4; i++) {
        v += a * vnoise(p);
        p = rot * p * 2.03 + 17.1;
        a *= 0.5;
      }
      return v;
    }
    vec3 sunsetHorizon(vec3 d, vec3 sunDir) {
      vec3 hd = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0));
      vec3 sd = normalize(vec3(sunDir.x, 0.0, sunDir.z));
      float az = clamp(dot(hd, sd) * 0.5 + 0.5, 0.0, 1.0);
      return mix(vec3(0.34, 0.090, 0.155), vec3(1.06, 0.285, 0.045), pow(az, 3.0));
    }
    vec3 skyColorEx(vec3 dir, vec3 sunDir) {
      vec3 d = normalize(dir);
      float y = max(d.y, 0.0);
      vec3 col = sunsetHorizon(d, sunDir);
      col = mix(col, vec3(0.205, 0.065, 0.165), smoothstep(0.0, 0.19, y));
      col = mix(col, vec3(0.075, 0.028, 0.115), smoothstep(0.10, 0.48, y));
      col = mix(col, vec3(0.010, 0.006, 0.028), smoothstep(0.42, 1.0, y));
      float sd = max(dot(d, sunDir), 0.0);
      float low = 1.0 - smoothstep(0.0, 0.34, y);
      col += vec3(0.90, 0.235, 0.035) * pow(sd, 5.0) * (0.18 + 0.55 * low);
      col += vec3(1.10, 0.365, 0.060) * pow(sd, 42.0) * 0.65;
      vec3 hd = normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0));
      vec3 sdh = normalize(vec3(sunDir.x, 0.0, sunDir.z));
      float az = clamp(dot(hd, sdh) * 0.5 + 0.5, 0.0, 1.0);
      col += vec3(0.55, 0.145, 0.055) * pow(1.0 - smoothstep(0.0, 0.28, y), 8.0) * pow(az, 8.0);
      // A breath of Belt of Venus on the side opposite the sun.
      col += vec3(0.095, 0.019, 0.042) * pow(1.0 - az, 3.0) * smoothstep(0.0, 0.11, y) * (1.0 - smoothstep(0.2, 0.44, y));
      if (d.y < 0.0) {
        float belowHorizon = 1.0 - smoothstep(-0.15, 0.0, d.y);
        col = mix(col, vec3(0.115, 0.050, 0.078), belowHorizon);
      }
      return max(col, vec3(0.0));
    }
    vec3 sunDisc(vec3 dir, vec3 sunDir) {
      float ca = dot(normalize(dir), sunDir);
      float a = acos(clamp(ca, -1.0, 1.0));
      float disc = 1.0 - smoothstep(0.0270, 0.0308, a);
      float limb = smoothstep(0.0, 0.0315, a);
      // A saturated orange cut-out, not an additive white-hot dot.
      vec3 rim = vec3(0.92, 0.047, 0.0015);
      vec3 core = vec3(1.58, 0.195, 0.008);
      return mix(core, rim, limb * 0.92) * disc;
    }
    vec3 cloudField(vec3 dir, vec3 sunDir, float time) {
      vec3 d = normalize(dir);
      if (d.y < 0.005) return vec3(0.0);
      float lon = atan(d.z, d.x) / 6.2831853 + 0.5;
      float lat = asin(clamp(d.y, -1.0, 1.0)) / 1.5707963;
      vec2 p = vec2(lon * 7.2, lat * 13.5);
      vec2 wind = vec2(time * 0.0015, time * 0.00035);
      float n1 = fbm2(p * vec2(1.25, 2.6) + wind * 3.0);
      float n2 = fbm2(p * vec2(3.0, 5.8) + wind * 5.0 + vec2(4.7, 1.3));
      float density = smoothstep(0.49, 0.68, n1 * 0.72 + n2 * 0.28);
      float band = smoothstep(0.015, 0.085, d.y) * (1.0 - smoothstep(0.29, 0.50, d.y));
      density *= band;
      float highD = smoothstep(0.51, 0.69, fbm2(p * vec2(0.8, 2.1) + vec2(12.0, 3.0) + wind * 1.2));
      highD *= smoothstep(0.30, 0.44, d.y) * (1.0 - smoothstep(0.62, 0.84, d.y));
      float az = dot(normalize(vec3(d.x, 0.0, d.z) + vec3(1e-5, 0.0, 0.0)), normalize(vec3(sunDir.x, 0.0, sunDir.z))) * 0.5 + 0.5;
      vec3 dark = vec3(0.080, 0.031, 0.066);
      vec3 rose = vec3(0.57, 0.172, 0.135);
      vec3 lit = vec3(1.30, 0.435, 0.100);
      vec3 c = mix(dark, rose, smoothstep(0.1, 0.75, az) * 0.65);
      c = mix(c, lit, pow(az, 2.0) * 0.72 * (1.0 - smoothstep(0.18, 0.42, d.y)));
      float sunKiss = pow(max(dot(normalize(d), sunDir), 0.0), 10.0);
      c += lit * sunKiss * 0.55;
      vec3 col = c * density * 0.78;
      col += vec3(0.42, 0.115, 0.18) * highD * 0.22;
      return col;
    }
    vec3 skyWithClouds(vec3 dir, vec3 sunDir, float time) {
      vec3 col = skyColorEx(dir, sunDir);
      vec3 clouds = cloudField(dir, sunDir, time);
      float cloudCover = clamp(length(clouds) * 3.0, 0.0, 0.72);
      col = col * (1.0 - cloudCover * 0.18) + clouds;
      // Replace the sky behind the disc with a crisp orange body. This keeps
      // the sun saturated even where the halo is at its brightest.
      float sdot = clamp(dot(normalize(dir), sunDir), -1.0, 1.0);
      float a = acos(sdot);
      float mask = 1.0 - smoothstep(0.0270, 0.0308, a);
      float limb = smoothstep(0.0, 0.0315, a);
      vec3 disc = mix(vec3(1.58, 0.195, 0.008), vec3(0.92, 0.047, 0.0015), limb * 0.92);
      col = mix(col, disc, mask * (1.0 - cloudCover * 0.38));
      return col;
    }
  `;

  class Sky {
    constructor(scene) {
      this.scene = scene;
      this.time = 0;
      const geo = new THREE.SphereGeometry(1, 48, 28);
      this.material = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: {
          uSunDir: { value: SG.SUN_DIR.clone() },
          uTime: { value: 0 }
        },
        vertexShader: `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: SG.SKY_GLSL + `
          varying vec3 vDir;
          uniform vec3 uSunDir;
          uniform float uTime;
          void main() {
            vec3 col = skyWithClouds(vDir, uSunDir, uTime);
            gl_FragColor = vec4(col, 1.0);
          }
        `
      });
      this.mesh = new THREE.Mesh(geo, this.material);
      this.mesh.scale.setScalar(1800);
      this.mesh.frustumCulled = false;
      this.mesh.renderOrder = -1000;
      this.mesh.name = 'sunset-sky';
      scene.add(this.mesh);
    }

    update(camera, dt) {
      this.time += dt;
      this.mesh.position.copy(camera.position);
      this.material.uniforms.uTime.value = this.time;
    }
  }

  SG.Sky = Sky;
})();
