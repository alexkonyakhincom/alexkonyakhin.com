/* One decorative ice shelf opens between the hero and proof. Content stays
   in the DOM, stationary and readable; only ice and water respond to scroll. */
(() => {
  'use strict';
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const shelf = document.querySelector('[data-split="hero"]');
  const sceneElement = document.querySelector('[data-ice-scene]');
  const proof = document.querySelector('[data-water-proof]');
  if (!shelf || !sceneElement || !proof) return;

  const surfaces = [...shelf.querySelectorAll('.split-surface')];
  const trace = shelf.querySelector('[data-fracture]');
  const scene = {
    element: sceneElement,
    canvas: sceneElement.querySelector('[data-water-canvas]'),
    figures: [...proof.querySelectorAll('[data-float]')].map(element => element.querySelector('.proof-num')),
    floes: [...sceneElement.querySelectorAll('[data-floe]')],
    renderer: null, attempted: false, layout: null,
  };
  const spring = { value: null, velocity: 0 };
  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  const round = value => Math.round(value * 10000) / 10000;
  const clock = () => window.performance ? window.performance.now() : 0;
  let pending = 0, layoutDirty = true, lastTime = null, wakeUntil = 0, lastInput = 0;
  let waterTime = 0, lastProgress = -1;

  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
    lastTime = null;
  }

  function restore() {
    lastProgress = -1;
    shelf.classList.toggle('split-released', false);
    for (const surface of surfaces) {
      surface.style.removeProperty('transform');
      surface.style.removeProperty('transform-origin');
    }
    scene.element.classList.toggle('scene-rendered', false);
    if (trace) { trace.style.clipPath = 'inset(0 0 100% 0)'; trace.style.opacity = '0'; }
    for (const floe of scene.floes) { floe.style.removeProperty('transform'); floe.style.opacity = '0'; }
  }

  function cacheGeometry() {
    const rect = scene.canvas.getBoundingClientRect();
    const shelfRect = shelf.getBoundingClientRect();
    // Typography is measured only after layout/font changes, never per frame.
    const figures = scene.figures.map(number => {
      const bounds = number.getBoundingClientRect();
      const font = window.getComputedStyle(number);
      return {
        text: number.textContent,
        font: font.font || `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`,
        fontSize: parseFloat(font.fontSize), letterSpacing: parseFloat(font.letterSpacing) || 0,
        x: bounds.left - rect.left, y: bounds.top - rect.top, width: bounds.width, height: bounds.height,
      };
    });
    scene.layout = {
      width: rect.width, height: rect.height,
      waterStart: shelfRect.top - rect.top,
      heroHeight: shelfRect.bottom - rect.top,
      figures,
    };
    const points = [[0,0],[.09,-6],[.19,-11],[.29,-8],[.39,2],[.49,7],[.59,3],[.70,-4],[.82,-8],[.93,1],[1,-3]];
    shelf.style.setProperty('--fracture-seam', points.map(([y,x]) => `calc(50% + ${x}px) ${y * 100}%`).join(','));
    surfaces.forEach((surface, side) => {
      surface.style.transformOrigin = `${round(rect.width * (side === 0 ? .12 : .88))}px 0px`;
    });
    if (trace) {
      const w = rect.width, h = shelfRect.height;
      const path = points.map(([y,x],i) => `${i ? 'L' : 'M'}${w / 2 + x},${y * h}`).join(' ');
      const branches = [[.19,-11,-1],[.49,7,1],[.82,-8,-1]].map(([y,x,direction]) =>
        `M${w / 2 + x},${y * h} l${direction * 12},-8 l${direction * 10},-2`).join(' ');
      trace.setAttribute('viewBox', `0 0 ${w} ${h}`);
      trace.querySelector('[data-fracture-line]').setAttribute('d', path);
      trace.querySelector('[data-fracture-branches]').setAttribute('d', branches);
    }
    if (scene.renderer) scene.renderer.configure(scene.layout);
    layoutDirty = false;
    lastProgress = -1;
  }

  function settle(target, dt, immediate) {
    if (spring.value === null || immediate) { spring.value = target; spring.velocity = 0; return false; }
    // Retargetable spring: mass 1, stiffness 100, damping 10.
    let remaining = Math.min(dt, .05);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      spring.velocity += ((target - spring.value) * 100 - spring.velocity * 10) * step;
      spring.value += spring.velocity * step;
      remaining -= step;
    }
    const moving = Math.abs(target - spring.value) > .0005 || Math.abs(spring.velocity) > .005;
    if (!moving) { spring.value = target; spring.velocity = 0; }
    return moving;
  }

  function applyPose(progress, mobile, energy) {
    const release = smoothstep(.28, 1, progress);
    shelf.classList.toggle('split-released', release > .0001);
    const distance = mobile ? Math.min(root.clientWidth * .12, 52) : Math.min(root.clientWidth * .19, 252);
    surfaces.forEach((surface, side) => {
      const direction = side === 0 ? -1 : 1, balance = side === 0 ? 1 : .78;
      const wave = scene.renderer && scene.renderer.sampleSurface
        ? scene.renderer.sampleSurface(scene.layout.width * (side === 0 ? .25 : .75), scene.layout.heroHeight, waterTime) : 0;
      const x = direction * distance * release * balance;
      const y = release * ((side === 0 ? 3 : 2) + wave * energy * .35);
      const angle = direction * release * (mobile ? .32 : .8) * balance;
      surface.style.transform = `translate3d(${round(x)}px, ${round(y)}px, 0) rotate(${round(angle)}deg)`;
    });
    if (trace) {
      trace.style.clipPath = `inset(0 0 ${round((1 - smoothstep(0, .28, progress)) * 100)}% 0)`;
      trace.style.opacity = round(1 - smoothstep(.28, .38, progress));
    }
    scene.floes.forEach((floe, index) => {
      const side = index % 2 ? 1 : -1;
      floe.style.opacity = round(release * (index === 1 ? .65 : .85));
      floe.style.transform = `translate3d(${round(side * release * (12 + index * 9))}px, ${round(release * (12 + index * 6) + Math.sin(waterTime * 1.4 + index) * energy * release)}px, 0) rotate(${round(side * release * (8 + index * 5))}deg)`;
    });
    lastProgress = progress;
  }

  function frame(timestamp) {
    pending = 0;
    if (document.hidden || preference.matches) return;
    const now = Number.isFinite(timestamp) ? timestamp : clock();
    const dt = lastTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (layoutDirty) cacheGeometry();
    // The two stable parent bounds are read together, before visual writes.
    const shelfRect = shelf.getBoundingClientRect();
    const sceneRect = scene.element.getBoundingClientRect();
    const height = Math.max(1, window.innerHeight);
    const visibleTop = Math.max(scene.layout.waterStart, -sceneRect.top);
    const visibleBottom = Math.min(scene.layout.height, height - sceneRect.top);
    const visible = visibleBottom > visibleTop;
    const target = clamp((height * .8 - shelfRect.top) / (height * .65));
    const moving = settle(target, dt, !visible);
    const fracture = clamp(spring.value);
    const energy = Math.exp(-Math.max(0, now - lastInput) / 650);
    const activity = smoothstep(0, 900, wakeUntil - now);
    if (visible) waterTime += dt * activity;

    if (visible && !scene.attempted && window.createProofWater && scene.canvas) {
      scene.attempted = true;
      scene.renderer = window.createProofWater(scene.canvas);
      if (scene.renderer) scene.renderer.configure(scene.layout);
    }
    if (visible || fracture !== lastProgress) applyPose(fracture, root.clientWidth <= 900, energy);
    if (scene.renderer && visible) {
      // Water and ice use the same frame/time. Scissoring keeps the shader's
      // budget on the visible shelf/proof, excluding the opaque hero copy.
      const drawn = scene.renderer.render({ time: waterTime, energy, activity, fracture, visibleTop, visibleBottom });
      scene.element.classList.toggle('scene-rendered', drawn === true);
    } else if (!scene.renderer || scene.renderer.ready === false) {
      scene.element.classList.toggle('scene-rendered', false);
    }
    if (visible && (moving || now < wakeUntil)) queueFrame();
    else lastTime = null;
  }

  function queueFrame() {
    if (pending || preference.matches || document.hidden) return;
    pending = window.requestAnimationFrame(frame);
  }
  function schedule() {
    lastInput = clock();
    wakeUntil = lastInput + 3000;
    queueFrame();
  }
  function invalidateLayout() { layoutDirty = true; schedule(); }
  function syncPreference() {
    cancel();
    restore();
    layoutDirty = true;
    spring.value = null;
    spring.velocity = 0;
    root.classList.toggle('motion-ready', !preference.matches);
    if (preference.matches && scene.renderer) {
      scene.renderer.destroy(); scene.renderer = null; scene.attempted = false;
    }
    if (!preference.matches) { wakeUntil = 0; frame(clock()); }
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', syncPreference);
  preference.addEventListener('change', syncPreference);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); else schedule(); });
  if (scene.canvas) {
    scene.canvas.addEventListener('webglcontextlost', () => { scene.element.classList.toggle('scene-rendered', false); });
    scene.canvas.addEventListener('webglcontextrestored', schedule);
  }
  if (document.fonts) document.fonts.ready.then(invalidateLayout);
  syncPreference();
})();
