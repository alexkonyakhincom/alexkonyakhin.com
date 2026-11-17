/* Scroll opens the icebreaker's lead. The renderer gets one progress value.
   Text and controls stay stationary and readable throughout. */
(() => {
  'use strict';
  const root = document.documentElement;
  const lead = document.querySelector('[data-lead]');
  const canvas = lead && lead.querySelector('[data-lead-canvas]');
  if (!lead || !canvas || !window.matchMedia) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const floes = [...lead.querySelectorAll('[data-floe]')];
  const clamp = value => Math.max(0, Math.min(1, value));
  let renderer = null, unavailable = false, layout = null, layoutDirty = true;
  let pending = 0, drawn = null;

  // Without a renderer the stylesheet's static floe carries the quote.
  const live = enabled => root.classList.toggle('lead-live', enabled);

  function measure() {
    // The fallback hides the canvas. Expose it before measuring its CSS box.
    live(true);
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

  function draw(progress) {
    if (unavailable) return;
    if (!renderer) {
      renderer = window.createIceLead ? window.createIceLead(canvas) : null;
      if (!renderer) { unavailable = true; live(false); return; }
      renderer.configure(layout);
    }
    if (drawn === progress) return;
    const painted = renderer.render({ progress }) === true;
    drawn = painted ? progress : null;
    live(painted);
  }

  function frame() {
    pending = 0;
    if (document.hidden || preference.matches || unavailable) return;
    const bounds = lead.getBoundingClientRect();
    const height = Math.max(1, window.innerHeight);
    if (bounds.bottom <= 0 || bounds.top >= height) return;
    if (layoutDirty) measure();
    draw(clamp((height * .9 - bounds.top) / (height * .55)));
  }

  function queueFrame() {
    if (pending || preference.matches || document.hidden || unavailable) return;
    pending = window.requestAnimationFrame(frame);
  }
  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
  }
  // Reduced motion gets the finished scene as one still frame.
  function still() { measure(); draw(1); }
  function invalidateLayout() {
    if (unavailable) return;
    layoutDirty = true;
    if (preference.matches) still(); else queueFrame();
  }
  function sync() {
    cancel();
    if (unavailable) return;
    layoutDirty = true;
    if (preference.matches) { still(); return; }
    frame();
  }

  window.addEventListener('scroll', queueFrame, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', sync);
  preference.addEventListener('change', sync);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); else queueFrame(); });
  if (document.fonts) document.fonts.ready.then(invalidateLayout);
  sync();
})();
