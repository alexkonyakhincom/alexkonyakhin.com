/* Decorative water and reflections. Readable figures remain native DOM text;
   only their reflections share the surface normals. The controller owns time.
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
    uniform vec4 u_rect[4];
    uniform vec4 u_atlas[4];
    uniform vec4 u_pulse;
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
      {
        vec4 pulse = u_pulse;
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
      vec3 environment = mix(vec3(.48, .65, .55), vec3(.88, .93, .86), sky);
      environment += (cloud - .5) * .07;
      // The deeper transmitted body stays quiet. Changing surface normals
      // reveal the bright sky and darker horizon as distinct moving shapes.
      vec3 water = vec3(.64, .75, .67);
      vec3 color = mix(water, environment, .37 + fresnel * .20);
      vec3 halfLight = normalize(view + normalize(vec3(-.31, .82, .48)));
      float aligned = max(dot(normal, halfLight), 0.0);
      float brokenCrest = smoothstep(.18, .70, noise(pixel / 48.0 + vec2(u_scene.w * .035, 0.0)));
      float sheen = pow(aligned, 34.0);
      float glint = pow(aligned, 170.0) * brokenCrest;
      color += vec3(.035, .045, .03) * sheen + vec3(.065, .075, .055) * glint;
      // Preserve readable dark semantic captions, including over wave troughs.
      vec3 linearColor = pow(max(color, vec3(.001)), vec3(2.2));
      float luminance = dot(linearColor, vec3(.2126, .7152, .0722));
      // A soft lower bound retains trough variation while protecting captions.
      float lifted = .30 + .035 * log(1.0 + exp((luminance - .30) / .035));
      color = pow(linearColor * lifted / max(luminance, .001), vec3(1.0 / 2.2));

      for (int i = 0; i < 4; i++) {
        vec4 target = u_rect[i];
        if (target.z < 1.0 || target.w < 1.0) continue;
        // The source glyph never moves or enters the water. A quiet reflection
        // starts below its native text box and follows the shared wave field.
        float line = target.y + target.w * 1.06;
        float waterline = line + field.x * .12;
        float below = pixel.y - waterline;
        if (pixel.x > target.x - 16.0 && pixel.x < target.x + target.z + 16.0 &&
            below > 0.0 && below < target.w * .72) {
          vec2 mirror = vec2(pixel.x + normal.x * 13.0,
            waterline - below / .78 + normal.y * 7.0);
          float reflection = glyph(mirror, target, u_atlas[i]);
          reflection *= smoothstep(2.0, 10.0, below) * exp(-below / (target.w * .32)) * .14;
          reflection *= 1.0 - smoothstep(target.w * .55, target.w * .72, below);
          color = mix(color, vec3(.25, .43, .34), reflection);
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
    if (!gl || gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) < 12) return null;

    let program, buffer, vertex, fragment, texture, uniforms;
    let available = false, configured = false, disposed = false;
    let configuration = null, lastFrame = null;
    let previousFracture = 0, lastRupture = -10, activity = 1;
    const pulse = new Float32Array(4);
    const rects = new Float32Array(16), atlasRects = new Float32Array(16);
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
      uniforms = Object.fromEntries(['canvas', 'scene', 'rect', 'atlas', 'pulse', 'letters']
        .map(name => [name, gl.getUniformLocation(program, `u_${name}${['rect', 'atlas'].includes(name) ? '[0]' : ''}`)]));
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
      configured = false;
      canvas.style.opacity = '0';
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
        pulse.fill(0);
        previousFracture = lastFrame ? lastFrame.fracture : 0;
        lastRupture = -10;
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
      // Only water is rasterized: native text keeps its own device resolution.
      // Bound the decorative surface for a shared frame cadence with the ice.
      const scale = Math.min(window.devicePixelRatio || 1, 1, 1280 / width, 1600 / height);
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
      const age = time - pulse[2];
      if (pulse[3] > .001 && age >= 0 && age < 2.7) {
        const dx = x - pulse[0], dy = (y - pulse[1]) / .61;
        const radius = Math.max(1, Math.hypot(dx, dy));
        let distortion = Math.sin(Math.atan2(dy, dx) * 3 + pulse[2] * 1.3) * Math.min(radius * .06, 7);
        distortion += (noise(px / 47 + pulse[0] * .002, py / 47 + pulse[1] * .002) - .5) * 7;
        const distance = radius + distortion - age * 42, spread = 8 + age * 7;
        const broken = .5 + .5 * noise(dx / 26 + pulse[0] * .002, dy / 26 + pulse[1] * .002);
        const envelope = Math.exp(-distance * distance / (spread * spread) - age * 1.5) * broken * smooth(0, .15, age) * (1 - smooth(1.7, 2.7, age));
        height += Math.sin(distance * .19) * envelope * pulse[3] * 1.65 * activity;
      }
      return height;
    }

    function render(frame = {}) {
      if (!available || !configured || disposed || gl.isContextLost()) return false;
      const time = Math.max(0, finite(frame.time));
      const energy = Math.max(0, Math.min(1, finite(frame.energy)));
      activity = Math.max(0, Math.min(1, finite(frame.activity, 1)));
      const fracture = Math.max(0, Math.min(1, finite(frame.fracture)));
      const visibleTop = Math.min(configuration.height, Math.max(0, finite(frame.visibleTop)));
      const visibleBottom = Math.min(configuration.height, Math.max(visibleTop, finite(frame.visibleBottom, configuration.height)));
      if (lastFrame && time < lastFrame.time) { pulse.fill(0); lastRupture = -10; }
      if (fracture > .03 && fracture < .98 && fracture > previousFracture + .0001 && time - lastRupture > .8) {
        pulse.set([configuration.width * .5, configuration.heroHeight, time, .55 + energy * .25]);
        lastRupture = time;
      }
      // The controller forces this terminal frame before pausing time. Clear
      // events too, so an old ring cannot return when the next scroll wakes it.
      if (activity === 0) pulse.fill(0);
      previousFracture = fracture;
      lastFrame = { time, energy, activity, fracture, visibleTop, visibleBottom };
      if (visibleBottom <= visibleTop) { canvas.style.opacity = '0'; return false; }
      gl.useProgram(program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.uniform4f(uniforms.canvas, canvas.width, canvas.height, configuration.width, configuration.height);
      gl.uniform4f(uniforms.scene, activity, fracture, 0, time);
      gl.uniform4fv(uniforms.rect, rects);
      gl.uniform4fv(uniforms.atlas, atlasRects);
      gl.uniform4fv(uniforms.pulse, pulse);
      // A cheap uniform clear avoids exposed black strips during scroll. The
      // expensive procedural shader runs only in the supplied visible band.
      gl.disable(gl.SCISSOR_TEST);
      gl.clearColor(.67, .78, .70, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const scaleY = canvas.height / configuration.height;
      const top = Math.floor(visibleTop * scaleY);
      const bottom = Math.ceil(visibleBottom * scaleY);
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, canvas.height - bottom, canvas.width, bottom - top);
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
