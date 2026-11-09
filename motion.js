/* Scroll opens the icebreaker's lead. This controller owns progress and time
   and hands both to the canvas renderer; it never writes to content. Text,
   figures and controls stay stationary, native and readable in every state. */
(() => {
  'use strict';
  const root = document.documentElement;
  const lead = document.querySelector('[data-lead]');
  const canvas = lead && lead.querySelector('[data-lead-canvas]');
  if (!lead || !canvas || !window.matchMedia) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const floes = [...lead.querySelectorAll('[data-floe]')];
  const spring = { value: 0, velocity: 0 };
  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  const clock = () => window.performance ? window.performance.now() : 0;
  let renderer = null, unavailable = false, layout = null, layoutDirty = true;
  let pending = 0, lastTime = null, wakeUntil = 0, sceneTime = 0, drawn = null;

  // Without a renderer the stylesheet's static floes carry the figures.
  const live = enabled => root.classList.toggle('lead-live', enabled);

  function measure() {
    // Geometry is read once per layout change, never per frame.
    const bounds = canvas.getBoundingClientRect();
    layout = {
      width: bounds.width, height: bounds.height,
      floes: floes.map(floe => {
        const rect = floe.getBoundingClientRect();
        return { x: rect.left - bounds.left, y: rect.top - bounds.top, width: rect.width, height: rect.height };
      }),
    };
    layoutDirty = false;
    drawn = null;
    if (renderer) renderer.configure(layout);
  }

  function draw(progress, time) {
    if (unavailable) return;
    if (!renderer) {
      renderer = window.createIceLead ? window.createIceLead(canvas) : null;
      if (!renderer) { unavailable = true; live(false); return; }
      renderer.configure(layout);
    }
    if (drawn && drawn.progress === progress && drawn.time === time) return;
    const painted = renderer.render({ progress, time }) === true;
    drawn = painted ? { progress, time } : null;
    live(painted);
  }

  function settle(target, dt, immediate) {
    if (immediate) { spring.value = target; spring.velocity = 0; return false; }
    // Retargetable and nearly critically damped: heavy ice, no rubber bounce.
    let remaining = Math.min(dt, .05);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      spring.velocity += ((target - spring.value) * 60 - spring.velocity * 13) * step;
      spring.value += spring.velocity * step;
      remaining -= step;
    }
    const moving = Math.abs(target - spring.value) > .0005 || Math.abs(spring.velocity) > .005;
    if (!moving) { spring.value = target; spring.velocity = 0; }
    return moving;
  }

  function frame(timestamp) {
    pending = 0;
    if (document.hidden || preference.matches || unavailable) return;
    const now = Number.isFinite(timestamp) ? timestamp : clock();
    const dt = lastTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (layoutDirty) measure();
    const bounds = lead.getBoundingClientRect();
    const height = Math.max(1, window.innerHeight);
    const visible = bounds.bottom > 0 && bounds.top < height;
    const target = clamp((height * .9 - bounds.top) / (height * .55));
    const moving = settle(target, dt, !visible);
    // Drift eases to rest shortly after the last input; there is no idle loop.
    const activity = smoothstep(0, 1400, wakeUntil - now);
    if (visible) {
      sceneTime += dt * activity;
      draw(clamp(spring.value), sceneTime);
    }
    if (visible && (moving || now < wakeUntil)) queueFrame();
    else lastTime = null;
  }

  function queueFrame() {
    if (pending || preference.matches || document.hidden || unavailable) return;
    pending = window.requestAnimationFrame(frame);
  }
  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
    lastTime = null;
  }
  // Reduced motion gets the finished scene as one still frame.
  function still() { measure(); draw(1, 0); }
  function wake() {
    if (preference.matches) return;
    wakeUntil = clock() + 4000;
    queueFrame();
  }
  function invalidateLayout() {
    layoutDirty = true;
    if (preference.matches) still(); else wake();
  }
  function sync() {
    cancel();
    if (unavailable) return;
    live(true);
    layoutDirty = true;
    if (preference.matches) { still(); return; }
    wakeUntil = 0;
    frame(clock());
  }

  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', sync);
  lead.addEventListener('pointermove', wake, { passive: true });
  preference.addEventListener('change', sync);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); else wake(); });
  if (document.fonts) document.fonts.ready.then(invalidateLayout);
  sync();
})();
