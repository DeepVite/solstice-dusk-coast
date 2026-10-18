/* ============================================================
   SOLSTICE — the sea: analytic ripple normals, sun path, foam
   ============================================================ */
(function () {
  'use strict';
  const SG = window.SG;

  SG.createWater = function (scene, heightTexture) {
    const uniforms = {
      uTime: { value: 0 },
      uSunDir: { value: SG.SUN_DIR.clone() },
      uSunColor: { value: new THREE.Color(0xff9a48) },
      uCameraPos: { value: new THREE.Vector3() },
      uHeightMap: { value: heightTexture },
      uWorldSize: { value: new THREE.Vector2(SG.WORLD.SX, SG.WORLD.SZ) },
      uWorldHeight: { value: SG.WORLD.SY },
      uSea: { value: SG.SEA_LEVEL },
      uFogColor: { value: new THREE.Color(SG.PALETTE.fog) },
      uFogDensity: { value: 0.00185 }
    };
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms,
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorld;
        varying vec3 vView;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          vView = cameraPosition - world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: SG.SKY_GLSL + `
        uniform float uTime;
        uniform vec3 uSunDir;
        uniform vec3 uSunColor;
        uniform vec3 uCameraPos;
        uniform sampler2D uHeightMap;
        uniform vec2 uWorldSize;
        uniform float uWorldHeight;
        uniform float uSea;
        uniform vec3 uFogColor;
        uniform float uFogDensity;
        varying vec3 vWorld;
        varying vec3 vView;

        float waveSpec(vec2 p, vec2 dir, float freq, float speed, float t, float amp) {
          float ph = dot(p, dir) * freq + t * speed;
          return cos(ph) * amp * freq;
        }

        void main() {
          vec2 p = vWorld.xz;
          float t = uTime;
          vec3 viewDir = normalize(uCameraPos - vWorld);
          float dist = length(uCameraPos.xz - p);

          vec2 slope = vec2(0.0);
          slope += vec2(1.0, 0.35) * waveSpec(p, normalize(vec2(1.0, 0.35)), 0.31, 0.65, t, 0.095);
          slope += vec2(-0.6, 1.0) * waveSpec(p, normalize(vec2(-0.6, 1.0)), 0.57, 0.92, t, 0.050);
          slope += vec2(0.2, -1.0) * waveSpec(p, normalize(vec2(0.2, -1.0)), 1.13, 1.34, t, 0.024);
          slope += vec2(-1.0, -0.3) * waveSpec(p, normalize(vec2(-1.0, -0.3)), 2.31, 1.75, t, 0.011);
          float micro = vnoise(p * 3.2 + vec2(t * 0.24, -t * 0.19)) - 0.5;
          slope += vec2(micro, -micro * 0.8) * 0.055;
          float distFade = mix(1.0, 0.42, smoothstep(40.0, 900.0, dist));
          vec3 normal = normalize(vec3(-slope.x * distFade, 1.0, -slope.y * distFade));
          if (!gl_FrontFacing) normal = normalize(vec3(normal.x, -normal.y, normal.z));

          vec2 uv = p / uWorldSize;
          float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
          vec4 hSample = texture2D(uHeightMap, clamp(uv, vec2(0.002), vec2(0.998)));
          float floorH = mix(-10.0, hSample.r * uWorldHeight, inside);
          float depth = max(uSea - floorH, 0.0);
          float shallow = exp(-depth * 0.34);
          float shoreline = 1.0 - smoothstep(0.0, 3.2, depth);

          vec3 deepCol = vec3(0.0045, 0.017, 0.022);
          vec3 shallowCol = vec3(0.022, 0.105, 0.086);
          vec3 base = mix(deepCol, shallowCol, shallow * 0.78);
          vec3 reflected = skyColorEx(reflect(-viewDir, normal), uSunDir);
          vec3 cloudReflection = cloudField(reflect(-viewDir, normal), uSunDir, uTime);
          float fres = 0.025 + 0.975 * pow(1.0 - clamp(dot(normal, viewDir), 0.0, 1.0), 5.0);
          fres = clamp(fres, 0.03, 0.84);
          vec3 col = mix(base, reflected, fres);
          col += cloudReflection * fres * 0.34;

          vec3 H = normalize(uSunDir + viewDir);
          float ndh = max(dot(normal, H), 0.0);
          float sparkleField = vnoise(p * 5.7 + vec2(t * 0.55, t * 0.31)) * 0.62 + vnoise(p * 1.9 - vec2(t * 0.2, t * 0.28)) * 0.38;
          float sparkle = smoothstep(0.52, 0.78, sparkleField);
          float spec = pow(ndh, 380.0) * (2.4 + 5.0 * sparkle) + pow(ndh, 60.0) * 0.24;
          col += uSunColor * spec;

          float road = pow(max(dot(reflect(-viewDir, normal), uSunDir), 0.0), 20.0);
          col += vec3(0.95, 0.32, 0.075) * road * (0.16 + shallow * 0.27);

          // An explicit glitter path keeps the classic sun-road unmistakable,
          // even when the ripple normals are calm.
          vec2 sunPath = normalize(uSunDir.xz + vec2(1e-5, 0.0));
          vec2 fromCam = p - uCameraPos.xz;
          float along = max(dot(fromCam, sunPath), 0.0);
          float lateral = abs(dot(fromCam, vec2(-sunPath.y, sunPath.x)));
          float pathWidth = 0.95 + along * 0.038;
          float pathMask = exp(-pow(lateral / pathWidth, 2.0)) * smoothstep(0.0, 4.0, along);
          float pathGlint = smoothstep(0.42, 0.8, sparkleField) * 0.9 + 0.18;
          col += vec3(1.0, 0.36, 0.075) * pathMask * pathGlint * (0.13 + shallow * 0.22);

          // A soft, breathing foam line that follows the coast.
          float foamNoise = vnoise(p * 0.55 + vec2(t * 0.16, -t * 0.08));
          float wash = 0.5 + 0.5 * sin(depth * 4.3 - t * 1.55 + foamNoise * 3.4);
          float foam = shoreline * smoothstep(0.42, 0.9, foamNoise * 0.65 + wash * 0.55) * (0.35 + 0.65 * exp(-depth * 1.1));
          foam += smoothstep(0.43, 0.63, slope.x * 0.5 + slope.y * 0.5 + vnoise(p * 1.7 + t * 0.2) * 0.22) * 0.12;
          vec3 foamCol = vec3(0.62, 0.48, 0.42) * (0.58 + 0.42 * min(length(reflected), 1.4));
          col = mix(col, foamCol, foam * 0.55);

          float fog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
          col = mix(col, uFogColor, clamp(fog, 0.0, 0.97));
          float alpha = mix(0.54, 0.93, smoothstep(0.15, 10.0, depth));
          alpha = clamp(alpha + foam * 0.15, 0.38, 0.98);
          alpha = mix(alpha, 1.0, fog * 0.72);

          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    const geo = new THREE.PlaneGeometry(9000, 9000, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(SG.WORLD.SX * 0.5, SG.SEA_LEVEL + 0.035, SG.WORLD.SZ * 0.5);
    mesh.renderOrder = 20;
    mesh.receiveShadow = false;
    mesh.castShadow = false;
    mesh.name = 'sunset-sea';
    scene.add(mesh);

    return {
      mesh,
      uniforms,
      update(camera, dt) {
        uniforms.uTime.value += dt;
        uniforms.uCameraPos.value.copy(camera.position);
        // Keep the ancient sea centred under the player without visible tiles.
        mesh.position.x = camera.position.x;
        mesh.position.z = camera.position.z;
      }
    };
  };
})();
