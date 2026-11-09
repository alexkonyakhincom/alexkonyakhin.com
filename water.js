/* One orthographic water scene: surface, transmitted lettering, reflections,
   and contact waves share coordinates and normals. The controller owns time.
   Original procedural shader; no assets, dependencies, or idle loop here. */
(() => {
  'use strict';
  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;
  const fragmentSource = `
    precision highp float;
    uniform sampler2D u_letters;
    uniform vec4 u_canvas;
    uniform vec4 u_scene;
    uniform vec4 u_rises;
    uniform vec4 u_rect[4];
    uniform vec4 u_atlas[4];
    uniform vec4 u_pulse[5];
    const float TAU = 6.28318530718;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }
    vec3 noiseField(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      vec2 du = 6.0 * f * (1.0 - f);
      float a = hash(i), b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0)), d = hash(i + 1.0);
      return vec3(mix(mix(a, b, u.x), mix(c, d, u.x), u.y),
        mix(b - a, d - c, u.y) * du.x, mix(c - a, d - b, u.x) * du.y);
    }
    float noise(vec2 p) { return noiseField(p).x; }
    void wave(inout vec3 field, vec2 p, vec2 direction, float wavelength,
              float amplitude, float speed, float phase) {
      float k = TAU / wavelength;
      float a = dot(p, direction) * k + u_scene.w * speed + phase;
      float crest = sin(a);
      // A slightly steeper crest and wider trough avoid a sine-sheet surface.
      field += amplitude * vec3(crest + .18 * (crest * crest - .5),
        cos(a) * (1.0 + .36 * crest) * k * direction);
    }
    vec3 surface(vec2 pixel) {
      // An orthographic camera compresses the water plane consistently in y.
      vec2 p = pixel / vec2(1.0, .61);
      vec2 flow = vec2(u_scene.w * .021, -u_scene.w * .013);
      vec3 warpX = noiseField(p / 235.0 + flow);
      vec3 warpY = noiseField(p / 197.0 + vec2(9.0, 13.0) + flow * .63);
      vec2 warped = p + (vec2(warpX.x, warpY.x) - .5) * 60.0;
      vec3 field = vec3(0.0);
      wave(field, warped, vec2(.96, .28), 296.0, 5.8, .53, .5);
      wave(field, warped, vec2(-.60, .80), 173.0, 3.8, -.74, 2.3);
      wave(field, warped, vec2(.25, .968), 106.0, 1.9, .96, 1.1);
      wave(field, warped, vec2(.82, -.572), 63.0, .78, -1.23, 3.4);
      wave(field, warped, vec2(-.34, .94), 39.0, .28, 1.72, .8);
      wave(field, warped, vec2(.98, .199), 23.0, .105, -2.15, 4.1);
      // Carry the domain warp's Jacobian into the normals, so moving reflected
      // light follows the actual curved wave fronts rather than painted bands.
      field.yz = vec2(field.y * (1.0 + warpX.y * 60.0 / 235.0) + field.z * warpY.y * 60.0 / 197.0,
        field.y * warpX.z * 60.0 / 235.0 + field.z * (1.0 + warpY.z * 60.0 / 197.0));
      for (int i = 0; i < 5; i++) {
        vec4 pulse = u_pulse[i];
        float age = u_scene.w - pulse.z;
        if (pulse.w > .001 && age >= 0.0 && age < 2.7) {
          vec2 delta = (pixel - pulse.xy) / vec2(1.0, .61);
          float radius = max(length(delta), 1.0);
          float angle = atan(delta.y, delta.x);
          float distortion = sin(angle * 3.0 + pulse.z * 1.3) * min(radius * .06, 7.0);
          distortion += (noise(p / 47.0 + pulse.xy * .002) - .5) * 7.0;
          float front = age * 42.0;
          float spread = 8.0 + age * 7.0;
          float distance = radius + distortion - front;
          float broken = .5 + .5 * noise(delta / 26.0 + pulse.xy * .002);
          float envelope = exp(-distance * distance / (spread * spread) - age * 1.5) * broken;
          envelope *= smoothstep(0.0, .15, age) * (1.0 - smoothstep(1.7, 2.7, age));
          float phase = distance * .19;
          float amplitude = pulse.w * 1.65 * u_scene.x;
          float displacement = sin(phase) * envelope * amplitude;
          float derivative = amplitude * envelope *
            (.19 * cos(phase) - 2.0 * distance / (spread * spread) * sin(phase));
          field += vec3(displacement, derivative * delta / radius);
        }
      }
      return field;
    }
    float glyph(vec2 pixel, vec4 rect, vec4 atlas) {
      vec2 uv = (pixel - rect.xy) / max(rect.zw, vec2(1.0));
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
      return texture2D(u_letters, atlas.xy + uv * atlas.zw).a;
    }
    void main() {
      vec2 pixel = vec2(gl_FragCoord.x, u_canvas.y - gl_FragCoord.y) * u_canvas.zw / u_canvas.xy;
      vec3 field = surface(pixel);
      vec3 normal = normalize(vec3(-field.y, -field.z, 1.0));
      vec3 view = normalize(vec3(0.0, -.7924, .61));
      vec3 reflected = reflect(-view, normal);
      float fresnel = .035 + .965 * pow(1.0 - max(dot(normal, view), 0.0), 5.0);

      // Broad, reflected overcast light gives the ripples their shape. The
      // finer waves disturb those same reflections, rather than a second grid.
      float sky = smoothstep(.08, .88, reflected.z);
      float cloud = noise(reflected.xy * 3.1 + vec2(2.0, 9.0));
      cloud = mix(cloud, noise(reflected.xy * 6.7 + 4.0), .22);
      vec3 environment = mix(vec3(.27, .47, .39), vec3(.94, .97, .91), sky);
      environment += (cloud - .5) * .16;
      // The deeper transmitted body stays quiet. Changing surface normals
      // reveal the bright sky and darker horizon as distinct moving shapes.
      vec3 water = vec3(.43, .62, .53);
      vec3 color = mix(water, environment, .57 + fresnel * .38);
      vec3 halfLight = normalize(view + normalize(vec3(-.31, .82, .48)));
      float aligned = max(dot(normal, halfLight), 0.0);
      float brokenCrest = smoothstep(.18, .70, noise(pixel / 48.0 + vec2(u_scene.w * .035, 0.0)));
      float sheen = pow(aligned, 34.0);
      float glint = pow(aligned, 170.0) * brokenCrest;
      color += vec3(.10, .12, .09) * sheen + vec3(.22, .24, .19) * glint;
      // Preserve readable dark semantic captions, including over wave troughs.
      vec3 linearColor = pow(max(color, vec3(.001)), vec3(2.2));
      float luminance = dot(linearColor, vec3(.2126, .7152, .0722));
      // A soft lower bound retains trough variation while protecting captions.
      float lifted = .30 + .035 * log(1.0 + exp((luminance - .30) / .035));
      color = pow(linearColor * lifted / max(luminance, .001), vec3(1.0 / 2.2));

      for (int i = 0; i < 4; i++) {
        vec4 target = u_rect[i];
        if (target.z < 1.0 || target.w < 1.0 || u_scene.z < .5) continue;
        float rise = u_rises[i];
        float line = target.y + target.w * .82;
        // Surface height and the lettering's contact line use the same waves.
        float waterline = line + field.x * .42;
        vec4 body = target;
        body.y += (1.0 - rise) * target.w * 1.22;
        float below = pixel.y - waterline;
        if (pixel.x > target.x - 28.0 && pixel.x < target.x + target.z + 28.0 &&
            pixel.y > target.y - target.w * .25 && pixel.y < line + target.w * 2.0) {
          // Reflection samples the exposed glyph through the current normal.
          if (below > 0.0 && below < target.w * .75) {
            vec2 mirror = vec2(pixel.x + normal.x * 19.0,
              waterline - below + normal.y * 12.0);
            float reflection = glyph(mirror, body, u_atlas[i]);
            reflection *= smoothstep(2.0, 9.0, below) * exp(-below / (target.w * .38)) * .23;
            reflection *= 1.0 - smoothstep(waterline - 2.0, waterline + 2.0, mirror.y);
            color = mix(color, vec3(.18, .35, .28), reflection);
          }

          // Snell-like vertical compression and shared-normal displacement
          // make the transmitted part belong below this particular surface.
          if (below >= -1.0) {
            vec2 transmitted = vec2(pixel.x + normal.x * (11.0 + below * .07),
              waterline + below / .57 + normal.y * 8.0);
            float softness = min(2.0, max(0.0, below) * .025);
            float under = glyph(transmitted, body, u_atlas[i]) * .5;
            under += glyph(transmitted + vec2(softness, 0.0), body, u_atlas[i]) * .25;
            under += glyph(transmitted - vec2(softness, 0.0), body, u_atlas[i]) * .25;
            under *= exp(-max(0.0, below) / (target.w * .9)) * .60;
            under *= smoothstep(-1.0, 2.0, below);
            color = mix(color, vec3(.25, .43, .34), under);
          }

          if (below < 2.0) {
            float air = 1.0 - smoothstep(-1.0, 1.0, below);
            float edge = glyph(pixel - vec2(1.0, 2.0), body, u_atlas[i]) * air;
            color = mix(color, vec3(.13, .26, .21), edge * .65);
            float letter = glyph(pixel, body, u_atlas[i]);
            float highlight = max(0.0, letter - glyph(pixel - vec2(.8, 1.0), body, u_atlas[i]));
            vec3 ink = vec3(.125, .235, .204) + highlight * vec3(.32, .38, .30);
            color = mix(color, ink, letter * air);
          }

          // A narrow meniscus is the physical boundary, not an ellipse behind
          // the whole word. It appears only where a glyph meets the water.
          float meniscus = (1.0 - smoothstep(.25, 1.7, abs(below))) *
            glyph(vec2(pixel.x, waterline), body, u_atlas[i]);
          color = mix(color, vec3(.85, .92, .81), meniscus * .65);
        }
      }
      gl_FragColor = vec4(color, 1.0);
    }
  `;

  window.createProofWater = canvas => {
    if (!canvas) return null;
    canvas.style.opacity = '0';
    let gl;
    try {
      gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: false, powerPreference: 'low-power',
      });
    } catch (_) { return null; }
    if (!gl || gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < 20) return null;

    let program, buffer, vertex, fragment, texture, uniforms;
    let available = false, configured = false, disposed = false;
    let configuration = null, lastFrame = null;
    let previousRises = null, previousFracture = 0, lastRupture = -10, activity = 1;
    const pulses = new Float32Array(20);
    const rects = new Float32Array(16), atlasRects = new Float32Array(16);
    const rises = new Float32Array(4);
    const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

    function release() {
      if (texture) gl.deleteTexture(texture);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      texture = buffer = program = vertex = fragment = null;
      available = configured = false;
    }
    function compile(type, source) {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }
    function initialize() {
      const precision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
      // Pixel-space refraction and text atlas sampling need high precision.
      if (!precision || precision.precision < 16) return false;
      vertex = compile(gl.VERTEX_SHADER, vertexSource);
      fragment = compile(gl.FRAGMENT_SHADER, fragmentSource);
      if (!vertex || !fragment) { release(); return false; }
      program = gl.createProgram();
      if (!program) { release(); return false; }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return false; }
      buffer = gl.createBuffer();
      texture = gl.createTexture();
      if (!buffer || !texture) { release(); return false; }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      uniforms = Object.fromEntries(['canvas', 'scene', 'rises', 'rect', 'atlas', 'pulse', 'letters']
        .map(name => [name, gl.getUniformLocation(program, `u_${name}${['rect', 'atlas', 'pulse'].includes(name) ? '[0]' : ''}`)]));
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(uniforms.letters, 0);
      available = true;
      return true;
    }

    function configure(input) {
      if (!input || disposed) return false;
      configuration = {
        width: Math.max(1, finite(input.width, canvas.clientWidth)),
        height: Math.max(1, finite(input.height, canvas.clientHeight)),
        heroHeight: Math.max(0, finite(input.heroHeight)),
        figures: (input.figures || []).slice(0, 4).map(figure => ({ ...figure })),
      };
      if (!available || gl.isContextLost()) return false;
      try {
        const figures = configuration.figures;
        const padding = 8;
        const widths = figures.map(figure => Math.max(1, finite(figure.width)));
        const heights = figures.map(figure => Math.max(1, finite(figure.height)));
        const atlasWidth = Math.ceil(Math.max(1, ...widths) + padding * 2);
        const atlasHeight = Math.ceil(heights.reduce((sum, height) => sum + height + padding * 2, 0)) || 1;
        const maxTexture = Math.min(4096, gl.getParameter(gl.MAX_TEXTURE_SIZE));
        const scale = Math.min(2, window.devicePixelRatio || 1, maxTexture / atlasWidth, maxTexture / atlasHeight);
        const atlas = document.createElement('canvas');
        atlas.width = Math.max(1, Math.ceil(atlasWidth * scale));
        atlas.height = Math.max(1, Math.ceil(atlasHeight * scale));
        const context = atlas.getContext('2d');
        if (!context) return false;
        context.scale(scale, scale);
        context.fillStyle = '#ffffff';
        context.textBaseline = 'alphabetic';
        rects.fill(0); atlasRects.fill(0);
        let row = 0;
        figures.forEach((figure, index) => {
          const size = Math.max(1, finite(figure.fontSize, heights[index]));
          context.font = figure.font || `500 ${size}px 'Instrument Sans', sans-serif`;
          const tracking = finite(figure.letterSpacing, -size * .04);
          const text = String(figure.text || '');
          const metrics = context.measureText(text);
          const ascent = metrics.fontBoundingBoxAscent || size * .9;
          const descent = metrics.fontBoundingBoxDescent || size * .2;
          const baseline = row + padding + (heights[index] - ascent - descent) / 2 + ascent;
          let cursor = 0, left = 0, right = 0;
          const characters = [...text];
          // Measure the complete tracked run, including ink overhang. Canvas
          // lacks CSS tabular-nums; fit its actual run to the native text box
          // instead of cropping the last glyph at that box's right edge.
          const run = characters.map((letter, character) => {
            const measurement = context.measureText(letter);
            left = Math.min(left, cursor - finite(measurement.actualBoundingBoxLeft));
            right = Math.max(right, cursor + finite(measurement.actualBoundingBoxRight, measurement.width));
            const position = cursor;
            const next = characters[character + 1] || '';
            cursor += context.measureText(letter + next).width - context.measureText(next).width + tracking;
            return { letter, position };
          });
          const fit = Math.min(1, Math.max(1, widths[index] - 1.5) / Math.max(1, right - left));
          context.save();
          context.translate(padding + .5 - left * fit, 0);
          context.scale(fit, 1);
          for (const { letter, position } of run) context.fillText(letter, position, baseline);
          context.restore();
          rects.set([finite(figure.x), finite(figure.y), widths[index], heights[index]], index * 4);
          atlasRects.set([padding * scale / atlas.width, (row + padding) * scale / atlas.height,
            widths[index] * scale / atlas.width, heights[index] * scale / atlas.height], index * 4);
          row += heights[index] + padding * 2;
        });
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
        configured = true;
        pulses.fill(0);
        previousRises = null;
        resize();
        return true;
      } catch (_) {
        configured = false;
        canvas.style.opacity = '0';
        return false;
      }
    }

    function resize() {
      if (!available || !configuration || disposed) return;
      const { width, height } = configuration;
      const scale = Math.min(window.devicePixelRatio || 1, 1.25, 1440 / width, 2000 / height);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }

    function sampleSurface(x, y, time) {
      const fract = value => value - Math.floor(value);
      const hash = (a, b) => {
        const p = [fract(a * .1031), fract(b * .1031), fract(a * .1031)];
        const dot = p[0] * (p[1] + 33.33) + p[1] * (p[2] + 33.33) + p[2] * (p[0] + 33.33);
        return fract((p[0] + p[1] + dot * 2) * (p[2] + dot));
      };
      const noise = (a, b) => {
        const ix = Math.floor(a), iy = Math.floor(b), fx = fract(a), fy = fract(b);
        const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
        const low = hash(ix, iy) * (1 - ux) + hash(ix + 1, iy) * ux;
        const high = hash(ix, iy + 1) * (1 - ux) + hash(ix + 1, iy + 1) * ux;
        return low * (1 - uy) + high * uy;
      };
      const px = x, py = y / .61;
      const flowX = time * .021, flowY = -time * .013;
      const wx = px + (noise(px / 235 + flowX, py / 235 + flowY) - .5) * 60;
      const wy = py + (noise(px / 197 + 9 + flowX * .63, py / 197 + 13 + flowY * .63) - .5) * 60;
      const components = [
        [.96, .28, 296, 5.8, .53, .5], [-.60, .80, 173, 3.8, -.74, 2.3],
        [.25, .968, 106, 1.9, .96, 1.1], [.82, -.572, 63, .78, -1.23, 3.4],
        [-.34, .94, 39, .28, 1.72, .8], [.98, .199, 23, .105, -2.15, 4.1],
      ];
      let height = components.reduce((total, [dx, dy, wavelength, amplitude, speed, phase]) => {
        const crest = Math.sin((wx * dx + wy * dy) * Math.PI * 2 / wavelength + time * speed + phase);
        return total + amplitude * (crest + .18 * (crest * crest - .5));
      }, 0);
      const smooth = (start, end, value) => {
        const t = Math.max(0, Math.min(1, (value - start) / (end - start)));
        return t * t * (3 - 2 * t);
      };
      for (let index = 0; index < 5; index++) {
        const offset = index * 4, age = time - pulses[offset + 2];
        if (pulses[offset + 3] <= .001 || age < 0 || age >= 2.7) continue;
        const dx = x - pulses[offset], dy = (y - pulses[offset + 1]) / .61;
        const radius = Math.max(1, Math.hypot(dx, dy));
        let distortion = Math.sin(Math.atan2(dy, dx) * 3 + pulses[offset + 2] * 1.3) * Math.min(radius * .06, 7);
        distortion += (noise(px / 47 + pulses[offset] * .002, py / 47 + pulses[offset + 1] * .002) - .5) * 7;
        const distance = radius + distortion - age * 42, spread = 8 + age * 7;
        const broken = .5 + .5 * noise(dx / 26 + pulses[offset] * .002, dy / 26 + pulses[offset + 1] * .002);
        const envelope = Math.exp(-distance * distance / (spread * spread) - age * 1.5) * broken * smooth(0, .15, age) * (1 - smooth(1.7, 2.7, age));
        height += Math.sin(distance * .19) * envelope * pulses[offset + 3] * 1.65 * activity;
      }
      return height;
    }

    function render(frame = {}) {
      if (!available || !configured || disposed || gl.isContextLost()) return false;
      const time = Math.max(0, finite(frame.time));
      const energy = Math.max(0, Math.min(1, finite(frame.energy)));
      activity = Math.max(0, Math.min(1, finite(frame.activity, 1)));
      const fracture = Math.max(0, Math.min(1, finite(frame.fracture)));
      const values = frame.rises || [1, 1, 1, 1];
      for (let index = 0; index < 4; index++) {
        rises[index] = Math.max(-.08, Math.min(1.12, finite(values[index], 1)));
        if (previousRises && previousRises[index] < .42 && rises[index] >= .42) {
          const offset = index * 4;
          pulses.set([rects[offset] + rects[offset + 2] * .5,
            rects[offset + 1] + rects[offset + 3] * .82, time, .65 + energy * .45], offset);
        }
      }
      if (fracture > .03 && fracture < .98 && fracture > previousFracture + .0001 && time - lastRupture > .7) {
        pulses.set([configuration.width * .5, configuration.heroHeight * (.15 + fracture * .8), time, 1.3 + energy * .5], 16);
        lastRupture = time;
      }
      if (lastFrame && time < lastFrame.time) pulses.fill(0);
      // The controller forces this terminal frame before pausing time. Clear
      // events too, so an old ring cannot return when the next scroll wakes it.
      if (activity === 0) pulses.fill(0);
      previousRises = Array.from(rises);
      previousFracture = fracture;
      lastFrame = { time, rises: Array.from(rises), energy, activity, fracture, showFigures: frame.showFigures !== false };
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform4f(uniforms.canvas, canvas.width, canvas.height, configuration.width, configuration.height);
      gl.uniform4f(uniforms.scene, activity, fracture, frame.showFigures === false ? 0 : 1, time);
      gl.uniform4fv(uniforms.rises, rises);
      gl.uniform4fv(uniforms.rect, rects);
      gl.uniform4fv(uniforms.atlas, atlasRects);
      gl.uniform4fv(uniforms.pulse, pulses);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.style.opacity = '1';
      return true;
    }

    function lost(event) {
      event.preventDefault();
      available = configured = false;
      canvas.style.opacity = '0';
    }
    function restored() {
      if (disposed) return;
      if (initialize() && configuration && configure(configuration) && lastFrame) render(lastFrame);
    }
    function destroy() {
      disposed = true;
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      release();
      canvas.style.opacity = '0';
    }
    if (!initialize()) return null;
    canvas.addEventListener('webglcontextlost', lost, false);
    canvas.addEventListener('webglcontextrestored', restored, false);
    return { configure, render, resize, sampleSurface, destroy, get ready() { return available && configured && !disposed; } };
  };
})();
