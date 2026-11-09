/* Native scroll parts the hero ice, then brings the proof figures up through
   open water. One scheduler, reversible poses, and no idle animation loop. */
(() => {
  'use strict';
  const sections = [...document.querySelectorAll('[data-split]')].map((element, index) => ({
    element,
    index,
    hero: element.dataset.split === 'hero',
    movers: [
      ...[...element.querySelectorAll('[data-drift]')].map(part => ({
        element: part, side: part.dataset.drift === 'left' ? 0 : 1, content: true,
      })),
      ...[...element.querySelectorAll('.split-surface')].map((surface, side) => ({
        element: surface, side,
      })),
    ],
    progress: -1,
    open: false,
  }));
  const waterElement = document.querySelector('[data-water-proof]');
  const water = waterElement && {
    element: waterElement,
    canvas: waterElement.querySelector('[data-water-canvas]'),
    figures: [...waterElement.querySelectorAll('[data-float]')].map(element => ({
      element,
      reflection: element.querySelector('.proof-reflection'),
      ripple: element.querySelector('.proof-ripple'),
    })),
    progress: -1,
    renderer: null,
    attempted: false,
  };
  if (!sections.length && !water) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let pending = 0;
  let layoutDirty = true;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  const round = value => Math.round(value * 10000) / 10000;

  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
  }

  function reset() {
    for (const section of sections) {
      section.progress = -1;
      if (section.open) section.element.classList.toggle('split-open', false);
      section.open = false;
      for (const mover of section.movers) {
        mover.element.style.removeProperty('transform');
        mover.element.style.removeProperty('transform-origin');
      }
    }
    if (water) {
      water.progress = -1;
      for (const figure of water.figures) {
        for (const element of [figure.element, figure.reflection, figure.ripple]) {
          if (!element) continue;
          element.style.removeProperty('transform');
          element.style.removeProperty('opacity');
        }
      }
    }
    layoutDirty = true;
  }

  function cacheGeometry() {
    // Measurements happen with transforms removed. A common section-space
    // pivot, expressed in each element's local space, keeps ink on its sheet.
    // These child reads run only after setup or a real layout change.
    const measurements = sections.map(section => ({
      section,
      rect: section.element.getBoundingClientRect(),
      bounds: section.movers.map(mover => mover.element.getBoundingClientRect()),
    }));
    for (const { section, rect, bounds } of measurements) {
      section.height = rect.bottom - rect.top;
      section.movers.forEach((mover, index) => {
        const pivotX = rect.left + rect.width * (mover.side === 0 ? .12 : .88);
        const pivotY = rect.bottom;
        mover.element.style.transformOrigin = `${round(pivotX - bounds[index].left)}px ${round(pivotY - bounds[index].top)}px`;
      });
    }
    if (water && water.renderer) water.renderer.resize();
    layoutDirty = false;
  }

  function update() {
    pending = 0;
    if (document.hidden || preference.matches) return;
    if (layoutDirty) {
      reset();
      cacheGeometry();
    }
    const height = Math.max(1, window.innerHeight);
    const width = root.clientWidth;
    const mobile = width <= 900;
    // Stacked mobile copy has no room for a large horizontal excursion.
    const distance = mobile ? Math.min(width * .035, 14) : Math.min(width * .19, 252);
    const active = document.activeElement;
    const selection = window.getSelection();
    const selectedRange = selection && !selection.isCollapsed && selection.rangeCount
      ? selection.getRangeAt(0) : null;
    const readingBoundary = height * .58;

    // Only stable parent geometry is read on scroll, before any pose writes.
    const states = sections.map(section => {
      const rect = section.element.getBoundingClientRect();
      const interacting = section.element.contains(active) ||
        (selection && !selection.isCollapsed &&
          (selectedRange ? selectedRange.intersectsNode(section.element) :
            section.element.contains(selection.anchorNode) || section.element.contains(selection.focusNode)));
      // The opening hero parts as its lower edge approaches the viewport,
      // completing before the proof reaches the reading area. Capping the
      // boundary by its own height keeps the initial page intact on tall screens.
      const boundary = section.hero ? Math.min(height * .92, section.height) : readingBoundary;
      const range = section.hero ? height * .64 : readingBoundary;
      const progress = interacting ? 0 : clamp((boundary - rect.bottom) / range);
      return { section, progress };
    });
    const waterRect = water && water.element.getBoundingClientRect();
    const waterInteracting = water && (water.element.contains(active) ||
      (selectedRange && selectedRange.intersectsNode(water.element)));
    const waterProgress = water && (waterInteracting ? 1 : clamp((height * .95 - waterRect.top) / (height * .81)));

    for (const { section, progress } of states) {
      if (Math.abs(progress - section.progress) < .0001) continue;
      section.progress = progress;
      const open = progress > .001;
      if (open !== section.open) section.element.classList.toggle('split-open', open);
      section.open = open;

      // A small crack leads the heavier drift; tilt starts only once the
      // sheets have separated. Smooth endpoints avoid the old mechanical snap.
      const crack = smoothstep(0, .28, progress);
      const drift = smoothstep(.12, 1, progress);
      const turn = smoothstep(.28, 1, progress);
      const seam = Math.min(distance * .035, 6);
      const weight = [1, .94, .97, .9][section.index % 4];
      const travel = (seam * crack + (distance - seam) * drift) * weight;
      const poses = [0, 1].map(side => {
        const direction = side === 0 ? -1 : 1;
        const balance = (section.index + side) % 2 === 0 ? 1 : .93;
        const x = round(direction * travel * balance);
        const y = mobile ? 0 : round(turn * Math.min(distance * .035, 8) * balance);
        const angle = mobile ? 0 : round(direction * turn * .95 * weight * balance);
        return `translate3d(${x}px, ${y}px, 0) rotate(${angle}deg)`;
      });
      // Stacked mobile copy belongs to one unbroken right-hand sheet; its
      // fracture sits in the left gutter, outside every full-width text line.
      for (const mover of section.movers) {
        mover.element.style.transform = poses[mobile && mover.content ? 1 : mover.side];
      }
    }
    if (water && waterRect.bottom > 0 && waterRect.top < height) updateWater(waterProgress, mobile);
  }

  function updateWater(progress, mobile) {
    if (Math.abs(progress - water.progress) < .0001) return;
    water.progress = progress;
    if (!water.attempted && water.canvas && window.createProofWater) {
      water.attempted = true;
      water.renderer = window.createProofWater(water.canvas);
    }
    if (water.renderer) water.renderer.render(progress);

    water.figures.forEach((figure, index) => {
      const delay = [0, .1, .045, .16][index % 4];
      const rise = smoothstep(delay, .88 + delay * .6, progress);
      const submerged = 1 - rise;
      // Buoyancy slows near the surface. A single, small damped displacement
      // settles each figure; it never continues moving while someone reads.
      const settle = Math.sin(rise * Math.PI * 2) * Math.sin(rise * Math.PI) * (mobile ? 2 : 4);
      const depth = (mobile ? 58 : 106) + [4, 18, 10, 0][index % 4];
      const x = Math.sin(rise * Math.PI) * (index % 2 ? 3 : -3);
      const y = submerged * depth + settle;
      const angle = submerged * (index % 2 ? 1.2 : -.9);
      const scale = 1 - submerged * .055;
      figure.element.style.transform = `translate3d(${round(x)}px, ${round(y)}px, 0) rotate(${round(angle)}deg) scale(${round(scale)})`;
      // Qualifications remain fully legible even at the deepest position;
      // depth comes from displacement, scale and the emerging reflection.
      figure.element.style.opacity = 1;
      const surface = smoothstep(.48, 1, rise);
      if (figure.reflection) figure.reflection.style.opacity = round(.17 * surface);
      if (figure.ripple) {
        figure.ripple.style.opacity = round(surface * .7);
        figure.ripple.style.transform = `scale(${round(.92 + surface * .16)}, ${round(.9 + surface * .1)})`;
      }
    });
  }

  function schedule() {
    if (pending || preference.matches || document.hidden) return;
    pending = window.requestAnimationFrame(update);
  }

  function invalidateLayout() {
    layoutDirty = true;
    schedule();
  }

  function syncPreference() {
    cancel();
    reset();
    root.classList.toggle('motion-ready', !preference.matches);
    if (preference.matches && water && water.renderer) {
      water.renderer.destroy();
      water.renderer = null;
      water.attempted = false;
    }
    if (!preference.matches) update();
  }

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', syncPreference);
  preference.addEventListener('change', syncPreference);
  document.addEventListener('focusin', () => { cancel(); update(); });
  document.addEventListener('focusout', schedule);
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
    else schedule();
  });
  if (document.fonts) document.fonts.ready.then(invalidateLayout);
  syncPreference();
})();
