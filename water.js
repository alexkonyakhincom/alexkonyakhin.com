/* The icebreaker's lead, seen from above and drawn in Canvas 2D. The page's
   paper is the ice sheet; a channel of dark water opens through it and the
   proof figures rest on four large floes. Every readable figure stays native
   DOM text above this canvas; nothing here owns, moves or hides content.
   The controller owns time and progress. No assets, dependencies or loops. */
(() => {
  'use strict';
  const TAU = Math.PI * 2;
  const PAPER = [247, 248, 244];
  const TINTS = [[224, 235, 236], [236, 242, 240], [253, 254, 252], [214, 229, 232]];
  const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const mix = (a, b, t) => `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

  // A fixed seed: the same viewport always breaks the same way.
  function random(seed) {
    return () => {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Keep the part of a convex polygon where nx*x + ny*y <= d.
  function clip(polygon, nx, ny, d) {
    const kept = [];
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const da = nx * a[0] + ny * a[1] - d, db = nx * b[0] + ny * b[1] - d;
      if (da <= 0) kept.push(a);
      if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
        const t = da / (da - db);
        kept.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
    return kept;
  }
  function centre(polygon) {
    let area = 0, x = 0, y = 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i], b = polygon[(i + 1) % polygon.length];
      const cross = a[0] * b[1] - b[0] * a[1];
      area += cross; x += (a[0] + b[0]) * cross; y += (a[1] + b[1]) * cross;
    }
    if (Math.abs(area) < 1e-6) return { x: polygon[0][0], y: polygon[0][1], area: 0 };
    return { x: x / (3 * area), y: y / (3 * area), area: Math.abs(area) / 2 };
  }
  const box = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

  function build(layout) {
    const W = layout.width, H = layout.height, rand = random(20261109);
    const compact = W < 700;
    const S = clamp(W / 13, 56, 92), row = S * .86;
    // Where the intact sheet ends and the broken channel begins.
    const topEdge = x => 20 + 22 * (.5 + .5 * Math.sin(x / 170 + 1.3)) + 12 * (.5 + .5 * Math.sin(x / 57 + 4.1));
    const bottomEdge = x => H - 22 - 24 * (.5 + .5 * Math.sin(x / 190 + 5.2)) - 12 * (.5 + .5 * Math.sin(x / 49 + .7));
    const front = (x, y) => .72 * clamp(x / W) + .2 * clamp(y / H);

    const seeds = [];
    // Guard rows keep both seams with the neighbouring paper unbroken.
    for (let x = -S; x <= W + S; x += S * .5) {
      seeds.push({ x, y: -8, sheet: true });
      seeds.push({ x: x + S * .25, y: H + 8, sheet: true });
    }
    for (let line = 0, y = row * .35; y < H; line++, y += row) {
      for (let x = -S * (line % 2 ? .5 : 1); x <= W + S; x += S) {
        const px = x + (rand() - .5) * S * .7, py = y + (rand() - .5) * row * .7;
        if (rand() < .26) continue;
        seeds.push({ x: px, y: py, sheet: py < topEdge(px) || py > bottomEdge(px) });
      }
    }

    const reach = (S * 3.5) ** 2, plates = [];
    for (const seed of seeds) {
      let polygon = box(-2 * S, -2 * S, W + 2 * S, H + 2 * S);
      for (const other of seeds) {
        if (other === seed) continue;
        const dx = other.x - seed.x, dy = other.y - seed.y, distance = dx * dx + dy * dy;
        if (distance > reach || distance < 1e-6) continue;
        const length = Math.sqrt(distance), nx = dx / length, ny = dy / length;
        polygon = clip(polygon, nx, ny, nx * (seed.x + other.x) / 2 + ny * (seed.y + other.y) / 2);
        if (polygon.length < 3) break;
      }
      if (polygon.length < 3) continue;
      const c = centre(polygon);
      if (c.area < 4) continue;
      const jitter = rand() * .08, pick = rand(), size = rand(), turn = rand(), heading = rand() * TAU;
      const shade = rand(), tint = TINTS[Math.floor(rand() * TINTS.length)];
      const phase = rand() * TAU, pace = .45 + rand() * .6;
      const plate = { x: c.x, y: c.y, points: polygon.map(p => [p[0] - c.x, p[1] - c.y]), front: front(c.x, c.y) + jitter, tint };
      if (seed.sheet) {
        // Fused pack near the channel takes a little colour; the seam does not.
        const depth = clamp(Math.min(c.y, H - c.y) / 46);
        Object.assign(plate, { kind: 'sheet', shade: shade * .5 * depth, crack: depth });
      } else {
        const packed = c.y < topEdge(c.x) + S * .55 || c.y > bottomEdge(c.x) - S * .55;
        const sinks = pick < (packed ? .14 : .5);
        const scale = sinks ? .8 : packed ? .84 + size * .11 : .52 + size * .34;
        const travel = (1 - scale) * Math.sqrt(c.area) * .32;
        Object.assign(plate, {
          kind: sinks ? 'sink' : 'floe', scale, shade: .25 + shade * .75,
          dx: Math.cos(heading) * travel, dy: Math.sin(heading) * travel * .7,
          turn: (turn - .5) * 1.1 * (1 - scale), phase, pace, bob: .5 + (1 - scale) * 5,
        });
      }
      plates.push(plate);
    }

    // Each figure rests on a convex plate cut from tangents around its text
    // box, so the native text is always inside the ice, at every size.
    const pad = compact ? 15 : 24, gap = compact ? 9 : 15;
    const floes = (layout.floes || []).map(rect => {
      const a = rect.width / 2, h = rect.height / 2, cx = rect.x + a, cy = rect.y + h;
      const count = 9 + Math.floor(rand() * 3), offset = rand() * TAU;
      let polygon = box(cx - a - pad * 3, cy - h - pad * 3, cx + a + pad * 3, cy + h + pad * 3);
      for (let k = 0; k < count; k++) {
        const angle = offset + (k + (rand() - .5) * .5) / count * TAU;
        const ux = Math.cos(angle), uy = Math.sin(angle);
        const reachOut = a * Math.abs(ux) + h * Math.abs(uy) + pad * (.7 + rand() * .6);
        polygon = clip(polygon, ux, uy, ux * cx + uy * cy + reachOut);
      }
      return { rect, x: cx, y: cy, points: polygon };
    });
    // Neighbouring figures never share a plate: a slightly canted cut through
    // the gap between their text boxes leaves water between the two floes.
    const corners = r => [[r.x, r.y], [r.x + r.width, r.y], [r.x + r.width, r.y + r.height], [r.x, r.y + r.height]];
    for (let i = 0; i < floes.length; i++) for (let j = i + 1; j < floes.length; j++) {
      const a = floes[i], b = floes[j];
      const gapX = Math.max(b.rect.x - a.rect.x - a.rect.width, a.rect.x - b.rect.x - b.rect.width);
      const gapY = Math.max(b.rect.y - a.rect.y - a.rect.height, a.rect.y - b.rect.y - b.rect.height);
      if (Math.max(gapX, gapY) <= 0 || Math.max(gapX, gapY) > pad * 5) continue;
      const along = gapX >= gapY, sign = Math.sign(along ? b.x - a.x : b.y - a.y) || 1;
      const mx = along ? (sign > 0 ? a.rect.x + a.rect.width + gapX / 2 : b.rect.x + b.rect.width + gapX / 2) : (a.x + b.x) / 2;
      const my = along ? (a.y + b.y) / 2 : (sign > 0 ? a.rect.y + a.rect.height + gapY / 2 : b.rect.y + b.rect.height + gapY / 2);
      const half = Math.min(gap * .6, Math.max(gapX, gapY) / 2 - 6);
      for (const cant of [(rand() - .5) * .5, 0]) {
        const length = Math.hypot(1, cant);
        const nx = (along ? sign : cant) / length, ny = (along ? cant : sign) / length, d = nx * mx + ny * my;
        const clear = corners(a.rect).every(([x, y]) => nx * x + ny * y <= d - half - 5) &&
          corners(b.rect).every(([x, y]) => nx * x + ny * y >= d + half + 5);
        if (!clear && cant) continue;
        a.points = clip(a.points, nx, ny, d - half);
        b.points = clip(b.points, -nx, -ny, -d - half);
        break;
      }
    }
    for (const floe of floes) {
      const polygon = floe.points, cx = floe.x, cy = floe.y;
      // The surrounding water is an uneven moat that grows out of the plate.
      const moat = [];
      polygon.forEach((point, index) => {
        const next = polygon[(index + 1) % polygon.length];
        for (const [x, y] of [point, [(point[0] + next[0]) / 2, (point[1] + next[1]) / 2]]) {
          const rx = x - cx, ry = y - cy;
          moat.push([rx, ry, 1 + gap * (.45 + rand() * 1.3) / Math.max(1, Math.hypot(rx, ry))]);
        }
      });
      floe.moat = moat; floe.front = front(cx, cy) + .04;
    }

    const brash = [];
    for (let i = Math.min(420, Math.floor(W * H / 2600)); i > 0; i--) {
      const x = rand() * W, y = lerp(topEdge(x) - 6, bottomEdge(x) + 6, rand());
      const radius = 1.4 + rand() ** 2 * 5.5, sides = 4 + Math.floor(rand() * 3), spin = rand() * TAU;
      const points = [];
      for (let k = 0; k < sides; k++) {
        const angle = spin + k / sides * TAU, r = radius * (.6 + rand() * .6);
        points.push([Math.cos(angle) * r, Math.sin(angle) * r * .8]);
      }
      brash.push({ x, y, points, front: front(x, y) + rand() * .1, phase: rand() * TAU, pace: .5 + rand() * .8 });
    }

    const glints = [];
    for (let i = Math.min(280, Math.floor(W * H / 4200)); i > 0; i--) {
      glints.push({
        x: rand() * W, y: rand() * H, length: 5 + rand() * 18, tilt: (rand() - .5) * .3,
        phase: rand() * TAU, pace: .5 + rand() * .9, bend: (rand() - .5) * 3,
      });
    }
    return { W, H, plates, floes, brash, glints, depth: compact ? 4 : 6 };
  }

  window.createIceLead = canvas => {
    if (!canvas || !canvas.getContext) return null;
    let main;
    try { main = canvas.getContext('2d'); } catch (_) { return null; }
    if (!main) return null;
    const layer = () => { const element = document.createElement('canvas'); return { element, context: element.getContext('2d') }; };
    const ice = layer(), wall = layer(), soft = layer(), sea = layer();
    if (!ice.context || !wall.context || !soft.context || !sea.context) return null;
    let model = null, kx = 1, ky = 1, disposed = false;
    const snow = (() => {
      const tile = layer(), size = 220, rand = random(5);
      if (!tile.context) return null;
      tile.element.width = tile.element.height = size;
      for (let i = 0; i < 46; i++) {
        const x = rand() * size, y = rand() * size, radius = 14 + rand() * 46, cold = rand() < .7;
        // Blots repeat across the tile's edges so the pattern never shows a seam.
        for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) {
          const blot = tile.context.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, radius);
          blot.addColorStop(0, cold ? 'rgba(150,186,196,.05)' : 'rgba(255,255,255,.16)');
          blot.addColorStop(1, cold ? 'rgba(150,186,196,0)' : 'rgba(255,255,255,0)');
          tile.context.fillStyle = blot;
          tile.context.fillRect(x + ox - radius, y + oy - radius, radius * 2, radius * 2);
        }
      }
      return ice.context.createPattern(tile.element, 'repeat');
    })();

    function configure(layout) {
      if (!layout || disposed) return false;
      const width = Math.max(1, finite(layout.width)), height = Math.max(1, finite(layout.height));
      model = build({ width, height, floes: layout.floes });
      // Crisp plate edges matter; the pixel budget keeps wide screens smooth.
      const ratio = Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(3.2e6 / (width * height)));
      const w = Math.max(1, Math.round(width * ratio)), h = Math.max(1, Math.round(height * ratio));
      for (const target of [canvas, ice.element, wall.element, sea.element]) { target.width = w; target.height = h; }
      soft.element.width = Math.max(1, Math.ceil(w / 4));
      soft.element.height = Math.max(1, Math.ceil(h / 4));
      kx = w / width; ky = h / height;
      paintSea();
      return true;
    }

    function paintSea() {
      const { W, H } = model, c = sea.context;
      c.setTransform(kx, 0, 0, ky, 0, 0);
      const body = c.createLinearGradient(0, 0, W * .25, H);
      body.addColorStop(0, '#0b2a2d'); body.addColorStop(.5, '#113b3c'); body.addColorStop(1, '#0b2b2f');
      c.fillStyle = body; c.fillRect(0, 0, W, H);
      const rand = random(77);
      for (let i = 0; i < 7; i++) {
        const x = rand() * W, y = rand() * H, radius = (.18 + rand() * .3) * Math.max(W * .5, H);
        const patch = c.createRadialGradient(x, y, 0, x, y, radius);
        const light = i % 3 !== 2;
        patch.addColorStop(0, light ? 'rgba(42,118,112,.34)' : 'rgba(3,18,22,.4)');
        patch.addColorStop(1, light ? 'rgba(42,118,112,0)' : 'rgba(3,18,22,0)');
        c.fillStyle = patch; c.fillRect(0, 0, W, H);
      }
    }

    function trace(c, points, x, y, scale, cos, sin) {
      for (let i = 0; i < points.length; i++) {
        const px = x + (points[i][0] * cos - points[i][1] * sin) * scale;
        const py = y + (points[i][0] * sin + points[i][1] * cos) * scale;
        if (i) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.closePath();
    }
    // Edges facing away from the light carry a thin cold line.
    function shadeEdges(c, points, x, y, scale, cos, sin) {
      c.beginPath();
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        const ax = x + (a[0] * cos - a[1] * sin) * scale, ay = y + (a[0] * sin + a[1] * cos) * scale;
        const bx = x + (b[0] * cos - b[1] * sin) * scale, by = y + (b[0] * sin + b[1] * cos) * scale;
        const ex = bx - ax, ey = by - ay, length = Math.hypot(ex, ey) || 1;
        if ((ey * -.5 + -ex * -.86) / length < -.3) { c.moveTo(ax, ay); c.lineTo(bx, by); }
      }
    }

    function paintIce(progress, time) {
      const { W, H, plates, floes } = model, c = ice.context;
      const local = value => clamp((progress * 1.46 - value) / .46);
      c.setTransform(kx, 0, 0, ky, 0, 0);
      c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
      c.clearRect(0, 0, W, H);
      c.lineJoin = 'round';
      const paper = mix(PAPER, PAPER, 0);
      if (progress <= 0) { c.fillStyle = paper; c.fillRect(0, 0, W, H); return []; }

      const sunk = [];
      // Unbroken plates share one sealed path, so no seam shows before the break.
      c.beginPath();
      for (const plate of plates) if (ease(local(plate.front)) <= 0) trace(c, plate.points, plate.x, plate.y, 1, 1, 0);
      c.fillStyle = c.strokeStyle = paper; c.lineWidth = 1.5; c.fill(); c.stroke();

      for (const plate of plates) {
        const reach = local(plate.front), open = ease(reach);
        if (open <= 0) continue;
        if (plate.kind === 'sheet') {
          const colour = mix(PAPER, plate.tint, plate.shade * open);
          c.beginPath(); trace(c, plate.points, plate.x, plate.y, 1, 1, 0);
          c.fillStyle = c.strokeStyle = colour; c.lineWidth = 1.2; c.fill(); c.stroke();
          if (plate.crack > .05) {
            c.strokeStyle = `rgba(126,164,172,${(.2 * plate.crack * open).toFixed(3)})`;
            c.lineWidth = .8; c.stroke();
          }
          continue;
        }
        const sway = time * plate.pace + plate.phase;
        const x = plate.x + plate.dx * open + Math.sin(sway) * plate.bob * open * .6;
        const y = plate.y + plate.dy * open + Math.cos(sway * .83) * plate.bob * open * .4;
        const angle = plate.turn * open + Math.sin(sway * .7) * .012 * plate.bob * open;
        const cos = Math.cos(angle), sin = Math.sin(angle), scale = lerp(1, plate.scale, open);
        let alpha = 1;
        if (plate.kind === 'sink') {
          const under = ease((reach - .3) / .5);
          alpha = 1 - under;
          if (under > 0) sunk.push([plate, x, y, scale, cos, sin, under]);
          if (alpha <= .004) continue;
        }
        const colour = mix(PAPER, plate.tint, plate.shade * open);
        c.globalAlpha = alpha;
        c.beginPath(); trace(c, plate.points, x, y, scale, cos, sin);
        c.fillStyle = colour; c.fill();
        if (open < 1) { c.strokeStyle = colour; c.lineWidth = 1.4 * (1 - open); c.stroke(); }
        c.globalAlpha = alpha * open * .32;
        shadeEdges(c, plate.points, x, y, scale, cos, sin);
        c.strokeStyle = '#7ea4ac'; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
      }

      c.globalCompositeOperation = 'destination-out';
      c.fillStyle = '#000';
      c.beginPath();
      for (const floe of floes) {
        const open = ease(local(floe.front));
        if (open <= 0) continue;
        floe.moat.forEach(([rx, ry, grow], index) => {
          const f = lerp(.97, grow, open), px = floe.x + rx * f, py = floe.y + ry * f;
          if (index) c.lineTo(px, py); else c.moveTo(px, py);
        });
        c.closePath();
      }
      c.fill();
      c.globalCompositeOperation = 'source-over';
      for (const floe of floes) {
        const open = ease(local(floe.front));
        c.beginPath(); trace(c, floe.points, 0, 0, 1, 1, 0);
        c.fillStyle = mix(PAPER, [252, 253, 251], open); c.fill();
        if (open <= 0) continue;
        c.globalAlpha = open * .4;
        shadeEdges(c, floe.points, 0, 0, 1, 1, 0);
        c.strokeStyle = '#7ea4ac'; c.lineWidth = 1; c.stroke();
        c.globalAlpha = 1;
      }
      // Wind-packed snow: a faint mottle over every ice surface at once.
      if (snow) {
        c.globalCompositeOperation = 'source-atop';
        c.globalAlpha = ease(progress * 2);
        c.fillStyle = snow; c.fillRect(0, 0, W, H);
        c.globalAlpha = 1;
      }
      // Both seams return to plain paper, so the sheet is the page itself.
      c.globalCompositeOperation = 'source-atop';
      for (const [from, to] of [[0, 40], [H, H - 40]]) {
        const fade = c.createLinearGradient(0, from, 0, to);
        fade.addColorStop(0, 'rgba(247,248,244,1)'); fade.addColorStop(.2, 'rgba(247,248,244,1)');
        fade.addColorStop(1, 'rgba(247,248,244,0)');
        c.fillStyle = fade; c.fillRect(0, Math.min(from, to), W, 40);
      }
      c.globalCompositeOperation = 'source-over';
      return sunk;
    }

    // A blurred, tinted silhouette of the ice at quarter resolution: cheap
    // enough to repeat for the submerged glow and the cast shadow.
    function softPass(colour, blur, dx, dy, alpha) {
      const c = soft.context, w = soft.element.width, h = soft.element.height;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.clearRect(0, 0, w, h);
      c.shadowColor = colour; c.shadowBlur = blur * kx / 4;
      c.shadowOffsetX = dx * kx / 4; c.shadowOffsetY = dy * ky / 4;
      c.drawImage(ice.element, 0, 0, w, h);
      c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetX = c.shadowOffsetY = 0;
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = colour; c.fillRect(0, 0, w, h);
      main.globalAlpha = alpha;
      main.drawImage(soft.element, 0, 0, canvas.width, canvas.height);
      main.globalAlpha = 1;
    }

    function render(frame = {}) {
      if (!model || disposed) return false;
      const progress = clamp(finite(frame.progress)), time = Math.max(0, finite(frame.time));
      const { W, H, glints, brash, depth } = model;
      const local = value => clamp((progress * 1.46 - value) / .46);
      const sunk = paintIce(progress, time);

      main.setTransform(1, 0, 0, 1, 0, 0);
      main.globalAlpha = 1; main.globalCompositeOperation = 'source-over';
      if (progress <= 0) { main.drawImage(ice.element, 0, 0); return true; }
      main.drawImage(sea.element, 0, 0);

      main.setTransform(kx, 0, 0, ky, 0, 0);
      // Plates pushed under the surface stay faintly visible below it.
      for (const [plate, x, y, scale, cos, sin, under] of sunk) {
        main.globalAlpha = .17 * under;
        main.beginPath(); trace(main, plate.points, x, y + depth, scale * .96, cos, sin);
        main.fillStyle = '#7fc4b8'; main.fill();
      }
      main.lineCap = 'round'; main.lineWidth = 1;
      main.strokeStyle = '#b4e2da';
      for (const glint of glints) {
        const pulse = Math.max(0, Math.sin(time * glint.pace + glint.phase));
        main.globalAlpha = .07 + .4 * pulse ** 4;
        const half = glint.length * (.6 + .4 * pulse) / 2, rise = glint.tilt * half;
        main.beginPath();
        main.moveTo(glint.x - half, glint.y - rise);
        main.quadraticCurveTo(glint.x, glint.y + glint.bend, glint.x + half, glint.y + rise);
        main.stroke();
      }
      main.globalAlpha = 1;
      main.setTransform(1, 0, 0, 1, 0, 0);

      softPass('rgb(92,178,166)', 11, 0, depth, .34);
      softPass('rgb(2,14,17)', 8, 4, depth + 5, .5);

      // The submerged sidewall: the ice silhouette, offset and tinted.
      const w = wall.context;
      w.setTransform(1, 0, 0, 1, 0, 0);
      w.globalCompositeOperation = 'source-over';
      w.clearRect(0, 0, canvas.width, canvas.height);
      w.drawImage(ice.element, 0, depth * ky);
      w.drawImage(ice.element, 0, depth * ky / 2);
      w.globalCompositeOperation = 'source-in';
      const tone = w.createLinearGradient(0, 0, 0, canvas.height);
      tone.addColorStop(0, '#8fbcc0'); tone.addColorStop(1, '#79aab1');
      w.fillStyle = tone; w.fillRect(0, 0, canvas.width, canvas.height);
      main.drawImage(wall.element, 0, 0);
      // Brash: crumbs of ice in the open water, hidden wherever a plate lies.
      main.setTransform(kx, 0, 0, ky, 0, 0);
      main.fillStyle = '#eef4f2';
      main.beginPath();
      for (const bit of brash) {
        const open = ease(local(bit.front));
        if (open <= .02) continue;
        const sway = time * bit.pace + bit.phase;
        trace(main, bit.points, bit.x + Math.sin(sway) * 1.6 * open, bit.y + Math.cos(sway * .8) * 1.1 * open, open, 1, 0);
      }
      main.fill();
      main.setTransform(1, 0, 0, 1, 0, 0);
      main.drawImage(ice.element, 0, 0);
      return true;
    }

    function destroy() { disposed = true; model = null; }
    return { configure, render, destroy, get ready() { return !!model && !disposed; } };
  };
})();
