/* Native scroll opens a hairline fracture before the page sheets drift apart.
   Text and sheet share a rigid pose; no cloned content, inertia or idle loop. */
(() => {
  'use strict';
  const sections = [...document.querySelectorAll('[data-split]')].map((element, index) => ({
    element,
    index,
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
  if (!sections.length) return;

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
      section.movers.forEach((mover, index) => {
        const pivotX = rect.left + rect.width * (mover.side === 0 ? .12 : .88);
        const pivotY = rect.bottom;
        mover.element.style.transformOrigin = `${round(pivotX - bounds[index].left)}px ${round(pivotY - bounds[index].top)}px`;
      });
    }
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
      const progress = interacting ? 0 : clamp((readingBoundary - rect.bottom) / readingBoundary);
      return { section, progress };
    });

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
