/* The real section content moves with two fractured page surfaces.
   Native scroll is the timeline; no clones, scroll interception or idle loop. */
(() => {
  'use strict';
  const sections = [...document.querySelectorAll('[data-split]')].map(element => ({
    element,
    parts: [...element.querySelectorAll('[data-drift]')],
    surfaces: [...element.querySelectorAll('.split-surface')],
    progress: -1,
  }));
  if (!sections.length) return;

  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.documentElement;
  let pending = 0;

  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
  }

  function reset() {
    for (const section of sections) {
      section.progress = -1;
      for (const part of [...section.parts, ...section.surfaces]) part.style.removeProperty('transform');
    }
  }

  function update() {
    pending = 0;
    if (document.hidden || preference.matches) return;
    const height = window.innerHeight;
    const width = root.clientWidth;
    const mobile = width <= 900;
    const distance = Math.min(width * (mobile ? .17 : .24), 320);
    const rotation = mobile ? .4 : 1.1;
    const active = document.activeElement;
    const selection = window.getSelection();

    // Read stable parent geometry together before any transform writes. Unlike
    // intersection callbacks, this also catches anchor jumps and restored tabs.
    const states = sections.map(section => {
      const rect = section.element.getBoundingClientRect();
      const interacting = section.element.contains(active) ||
        (selection && !selection.isCollapsed && section.element.contains(selection.anchorNode));
      const progress = interacting ? 0 : Math.max(0, Math.min(1, (height * .6 - rect.bottom) / (height * .6)));
      return { section, progress };
    });

    for (const { section, progress } of states) {
      if (Math.abs(progress - section.progress) < .0001) continue;
      section.progress = progress;
      const travel = progress * distance;
      for (const part of section.parts) {
        const direction = part.dataset.drift === 'left' ? -1 : 1;
        part.style.transform = `translate3d(${direction * travel}px, 0, 0)`;
      }
      section.surfaces.forEach((surface, index) => {
        const direction = index === 0 ? -1 : 1;
        surface.style.transform = `translate3d(${direction * travel}px, 0, 0) rotate(${direction * rotation * progress}deg)`;
      });
    }
  }

  function schedule() {
    if (pending || preference.matches || document.hidden) return;
    pending = window.requestAnimationFrame(update);
  }

  function syncPreference() {
    cancel();
    reset();
    root.classList.toggle('motion-ready', !preference.matches);
    if (!preference.matches) update();
  }

  // Geometry reads occur only after user input or a real layout change. Stable
  // offscreen sections are skipped, and each event batch queues at most a frame.
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', () => { reset(); schedule(); }, { passive: true });
  window.addEventListener('pageshow', syncPreference);
  preference.addEventListener('change', syncPreference);
  document.addEventListener('focusin', () => { cancel(); update(); });
  document.addEventListener('focusout', schedule);
  document.addEventListener('selectionchange', schedule);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) cancel();
    else schedule();
  });
  if (document.fonts) document.fonts.ready.then(schedule);
  syncPreference();
})();
