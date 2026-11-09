/* Original procedural daylight-water shader. The scroll controller owns time:
   this renderer has no scroll listener, animation loop, or external dependency. */
(() => {
  'use strict';

  const vertexSource = `
    attribute vec2 a_position;
    void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
  `;

  const fragmentSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_progress;

    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * .1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
                 mix(hash(i + vec2(0.0, 1.0)), hash(i + 1.0), u.x), u.y);
    }

    float swell(vec2 p, float time) {
      // Incommensurate directions and wavelengths prevent a repeating grid.
      float a = sin(dot(p, vec2(.87, .49)) * 2.8 + time * .7);
      float b = sin(dot(p, vec2(-.39, .92)) * 4.6 - time * .46 + 2.1);
      float c = sin(dot(p, vec2(.21, .98)) * 8.3 + time * .39 + .7);
      float broken = noise(p * 2.4 + vec2(time * .07, -time * .035));
      return a * .105 + b * .054 + c * .019 + broken * .14;
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / u_resolution;
      float aspect = u_resolution.x / u_resolution.y;
      float time = u_progress * 2.8;
      // A shallow view across a plane; distant waves become slightly finer.
      float perspective = mix(1.08, .74, uv.y);
      vec2 p = vec2((uv.x - .5) * aspect, uv.y - .5) * 7.0 / perspective;
      p += vec2(.12, -.10) * time;
      float warp = noise(p * .44 + 7.0);
      p += vec2(warp, noise(p * .39 + 15.0)) * .52;

      float h = swell(p, time);
      float hx = swell(p + vec2(.035, 0.0), time);
      float hy = swell(p + vec2(0.0, .035), time);
      vec2 slope = vec2(hx - h, hy - h) / .035;
      vec3 normal = normalize(vec3(-slope * .56, 1.0));
      vec3 view = normalize(vec3(0.0, .52, 1.0));
      vec3 reflection = reflect(-view, normal);
      float fresnel = .035 + .965 * pow(1.0 - max(dot(view, normal), 0.0), 5.0);

      vec3 deepWater = vec3(.50, .66, .58);
      vec3 shallowWater = vec3(.70, .80, .72);
      float depth = smoothstep(-.5, .7, h + (uv.y - .5) * .28);
      vec3 color = mix(deepWater, shallowWater, depth * .6 + .32);

      // Broad reflections belong to an overcast sky and a light bank of ice.
      float skyBand = smoothstep(-.12, .8, reflection.y);
      vec3 sky = mix(vec3(.54, .69, .62), vec3(.88, .93, .86), skyBand);
      float cloud = noise(reflection.xy * 3.2 + vec2(2.0, 8.0));
      sky += (cloud - .45) * .10;
      color = mix(color, sky, .22 + fresnel * .55);

      // Refracted daylight gathers into irregular, interrupted caustic threads.
      vec2 refracted = p * 2.1 + slope * .8;
      float c1 = sin(refracted.x + sin(refracted.y * 1.13 + time * .12));
      float c2 = sin(refracted.y * 1.37 + sin(refracted.x * .83 - time * .09));
      float caustic = pow(max(0.0, 1.0 - abs(c1 + c2) * 2.5), 10.0);
      float causticMask = smoothstep(.22, .78, noise(p * .8 + 18.0));
      color += vec3(.12, .14, .095) * caustic * causticMask * .5;

      vec3 light = normalize(vec3(-.38, .62, 1.0));
      vec3 halfway = normalize(light + view);
      float specular = pow(max(dot(normal, halfway), 0.0), 100.0);
      float brokenHighlight = smoothstep(.35, .78, noise(p * 5.8 + time * .03));
      color += vec3(.24, .25, .20) * specular * (.3 + brokenHighlight * .7);

      // A soft broad reflection keeps the scene legible without a flat overlay.
      float iceReflection = exp(-pow((uv.y - .93) * 4.0, 2.0));
      color = mix(color, vec3(.76, .84, .76), iceReflection * .24);
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
    if (!gl) return null;

    let program, buffer, vertex, fragment, resolution, progressLocation;
    let available = false;
    let disposed = false;
    let lastProgress = 0;

    function release() {
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      buffer = program = vertex = fragment = null;
      available = false;
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
      const source = precision && precision.precision > 0 ? fragmentSource
        : fragmentSource.replace('precision highp float;', 'precision mediump float;');
      vertex = compile(gl.VERTEX_SHADER, vertexSource);
      fragment = compile(gl.FRAGMENT_SHADER, source);
      if (!vertex || !fragment) { release(); return false; }
      program = gl.createProgram();
      if (!program) { release(); return false; }
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return false; }
      buffer = gl.createBuffer();
      if (!buffer) { release(); return false; }
      gl.useProgram(program);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      resolution = gl.getUniformLocation(program, 'u_resolution');
      progressLocation = gl.getUniformLocation(program, 'u_progress');
      available = true;
      return true;
    }

    function resize() {
      if (!available || disposed) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      // Cap pixel work on wide/retina displays. Canvas CSS owns its layout.
      const scale = Math.min(dpr, 1600 / Math.max(1, canvas.clientWidth));
      const width = Math.max(1, Math.round(canvas.clientWidth * scale));
      const height = Math.max(1, Math.round(canvas.clientHeight * scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    }

    function render(progress) {
      lastProgress = Math.max(0, Math.min(1, Number(progress) || 0));
      if (!available || disposed || gl.isContextLost()) return;
      gl.useProgram(program);
      gl.uniform2f(resolution, canvas.width, canvas.height);
      gl.uniform1f(progressLocation, lastProgress);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      canvas.style.opacity = '1';
    }

    function lost(event) {
      event.preventDefault();
      available = false;
      canvas.style.opacity = '0';
    }

    function restored() {
      if (disposed) return;
      if (initialize()) { resize(); render(lastProgress); }
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
    resize();
    return { render, resize, destroy };
  };
})();
