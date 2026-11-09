/* One scroll-directed ice/water scene. Scroll sets destinations; a bounded
   physical response carries momentum and water disturbances after input. */
(() => {
  'use strict';
  const root = document.documentElement;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  const sections = [...document.querySelectorAll('[data-split]')].map((element, index) => ({
    element, index, hero: element.dataset.split === 'hero', copies: [],
    movers: [
      ...[...element.querySelectorAll('[data-drift]')].map(element => ({ element, side: element.dataset.drift === 'left' ? 0 : 1, content: true })),
      ...[...element.querySelectorAll('.split-surface')].map((element, side) => ({ element, side })),
    ],
    progress: -1, open: false,
  }));
  const hero = sections.find(section => section.hero);
  const sceneElement = document.querySelector('[data-ice-scene]');
  const proofElement = document.querySelector('[data-water-proof]');
  const spring = () => ({ value: null, velocity: 0 });
  const scene = sceneElement && proofElement && hero && {
    element: sceneElement, proof: proofElement,
    canvas: sceneElement.querySelector('[data-water-canvas]'),
    figures: [...proofElement.querySelectorAll('[data-float]')].map(element => ({ element, number: element.querySelector('.proof-num'), spring: spring() })),
    floes: [...sceneElement.querySelectorAll('[data-floe]')],
    trace: hero.element.querySelector('[data-fracture]'),
    spring: spring(), renderer: null, attempted: false, layout: null,
  };
  if (!sections.length && !scene) return;

  const clamp = value => Math.max(0, Math.min(1, value));
  const smoothstep = (start, end, value) => {
    const t = clamp((value - start) / (end - start));
    return t * t * (3 - 2 * t);
  };
  const round = value => Math.round(value * 10000) / 10000;
  const clock = () => window.performance ? window.performance.now() : 0;
  let pending = 0, layoutDirty = true, lastTime = null, wakeUntil = 0, lastInput = 0;
  let waterTime = 0, lastDraw = -Infinity, lastActivity = 0, sceneVisible = false;

  function cancel() {
    if (pending) window.cancelAnimationFrame(pending);
    pending = 0;
    lastTime = null;
  }

  function restoreSource() {
    for (const section of sections) {
      section.progress = -1;
      section.open = false;
      for (const name of ['split-open', 'split-rendered', 'split-released']) section.element.classList.toggle(name, false);
      for (const { element } of section.movers) {
        element.style.removeProperty('transform');
        element.style.removeProperty('transform-origin');
      }
      for (const copy of section.copies) copy.style.removeProperty('transform');
    }
    if (scene) {
      scene.element.classList.toggle('scene-rendered', false);
      if (scene.trace) { scene.trace.style.clipPath = 'inset(0 0 100% 0)'; scene.trace.style.opacity = '0'; }
      for (const floe of scene.floes) { floe.style.removeProperty('transform'); floe.style.opacity = '0'; }
    }
  }

  function createCopies(section) {
    if (section.copies.length) return;
    const copies = [0, 1].map(side => {
      const copy = section.element.cloneNode(true);
      for (const layer of copy.querySelectorAll('.split-surface, .ice-fracture')) layer.remove();
      for (const node of [copy, ...copy.querySelectorAll('*')]) {
        for (const name of ['id', 'data-split', 'data-drift', 'aria-labelledby', 'aria-describedby']) node.removeAttribute(name);
      }
      copy.classList.remove('split-section', 'split-open', 'split-rendered', 'split-released');
      copy.classList.add('split-copy', side === 0 ? 'split-copy-left' : 'split-copy-right');
      copy.setAttribute('aria-hidden', 'true');
      for (const link of copy.querySelectorAll('a')) link.tabIndex = -1;
      return copy;
    });
    section.copies = copies;
    section.element.append(...copies);
  }

  function cacheGeometry() {
    restoreSource();
    const mobile = root.clientWidth <= 900;
    for (const section of sections) if (mobile || section.hero) createCopies(section);
    const measurements = sections.map(section => ({
      section, rect: section.element.getBoundingClientRect(),
      bounds: section.movers.map(mover => mover.element.getBoundingClientRect()),
    }));
    let sceneLayout;
    if (scene) {
      const rect = scene.canvas.getBoundingClientRect();
      const heroRect = hero.element.getBoundingClientRect();
      sceneLayout = {
        width: rect.width, height: rect.height, heroHeight: heroRect.bottom - rect.top,
        figures: scene.figures.map(figure => {
          const bounds = figure.number.getBoundingClientRect();
          const font = window.getComputedStyle(figure.number);
          return { text: figure.number.textContent, font: font.font || `${font.fontWeight} ${font.fontSize} ${font.fontFamily}`, fontSize: parseFloat(font.fontSize),
            letterSpacing: parseFloat(font.letterSpacing) || 0,
            x: bounds.left - rect.left, y: bounds.top - rect.top, width: bounds.width, height: bounds.height };
        }),
      };
    }
    // All child geometry/typography reads above are confined to layout changes.
    for (const { section, rect, bounds } of measurements) {
      section.height = rect.bottom - rect.top;
      section.documentTop = rect.top + window.scrollY;
      section.movers.forEach((mover, index) => {
        const pivotX = rect.left + rect.width * (mover.side === 0 ? .12 : .88);
        mover.element.style.transformOrigin = `${round(pivotX - bounds[index].left)}px ${round(rect.bottom - bounds[index].top)}px`;
      });
      section.copies.forEach((copy, side) => { copy.style.transformOrigin = `${round(rect.width * (side === 0 ? .12 : .88))}px ${round(section.height)}px`; });
    }
    if (scene) {
      scene.layout = sceneLayout;
      const points = [[0,0],[.045,3],[.09,-6],[.14,-3],[.19,-11],[.25,-15],[.29,-8],[.34,5],[.39,2],[.44,10],[.49,7],[.54,15],[.59,3],[.64,-7],[.70,-4],[.76,-12],[.82,-8],[.87,4],[.93,1],[1,-3]];
      hero.element.style.setProperty('--fracture-seam', points.map(([y,x]) => `calc(50% + ${x}px) ${y * 100}%`).join(','));
      if (scene.trace) {
        const w = sceneLayout.width, h = hero.height;
        const path = points.map(([y,x],i) => `${i ? 'L' : 'M'}${w / 2 + x},${y * h}`).join(' ');
        const branches = [[.19,-11,-1],[.44,10,1],[.64,-7,-1],[.87,4,1]].map(([y,x,direction]) => {
          const start = w / 2 + x, top = y * h;
          return `M${start},${top} l${direction * 12},-8 l${direction * 10},-2 l${direction * 8},-9`;
        }).join(' ');
        scene.trace.setAttribute('viewBox', `0 0 ${w} ${h}`);
        scene.trace.querySelector('[data-fracture-line]').setAttribute('d', path);
        scene.trace.querySelector('[data-fracture-branches]').setAttribute('d', branches);
      }
      if (scene.renderer) scene.renderer.configure(sceneLayout);
      lastDraw = -Infinity;
    }
    layoutDirty = false;
  }

  function settle(state, target, dt, immediate = false) {
    if (state.value === null || immediate) { state.value = target; state.velocity = 0; return false; }
    // mass 1, stiffness 100, damping 10; bounded substeps make fast jumps safe.
    let remaining = Math.min(dt, .05);
    while (remaining > 0) {
      const step = Math.min(remaining, 1 / 120);
      state.velocity += ((target - state.value) * 100 - state.velocity * 10) * step;
      state.value += state.velocity * step;
      remaining -= step;
    }
    const moving = Math.abs(target - state.value) > .0005 || Math.abs(state.velocity) > .005;
    if (!moving) { state.value = target; state.velocity = 0; }
    return moving;
  }

  function applyPose(section, progress, mobile, energy) {
    const open = progress > .001;
    const focal = section.hero && scene;
    const release = focal ? smoothstep(.28, 1, progress) : smoothstep(.12, 1, progress);
    const rendered = open && (mobile || section.hero) && (!focal || release > .0001);
    section.element.classList.toggle('split-open', open);
    section.element.classList.toggle('split-rendered', rendered);
    section.element.classList.toggle('split-released', focal && release > .0001);
    section.open = open;
    const distance = mobile ? Math.min(root.clientWidth * .12, 52) : Math.min(root.clientWidth * .19, 252);
    const crack = smoothstep(0, .28, progress);
    const turn = smoothstep(.28, 1, progress);
    const seam = focal ? 0 : Math.min(distance * .035, 6);
    const weight = [1, .94, .97, .9][section.index % 4];
    const travel = (seam * crack + (distance - seam) * release) * weight;
    const poses = [0, 1].map(side => {
      const direction = side === 0 ? -1 : 1;
      const balance = focal ? (side === 0 ? 1 : .78) : ((section.index + side) % 2 === 0 ? 1 : .93);
      const wave = focal && scene.renderer && scene.renderer.sampleSurface
        ? scene.renderer.sampleSurface(scene.layout.width * (side === 0 ? .25 : .75), scene.layout.heroHeight, waterTime) : 0;
      const x = direction * travel * balance;
      const y = focal ? release * ((side === 0 ? 3 : -2) + wave * energy) : mobile ? 0 : turn * Math.min(distance * .035, 8) * balance;
      const angle = focal ? direction * release * (mobile ? .32 : .8) * balance + (side ? -.025 : .025) * scene.spring.velocity
        : mobile ? 0 : direction * turn * .95 * weight * balance;
      return `translate3d(${round(x)}px, ${round(y)}px, 0) rotate(${round(angle)}deg)`;
    });
    for (const mover of section.movers) {
      mover.element.style.transform = (mobile || section.hero) && mover.content
        ? 'translate3d(0px, 0px, 0) rotate(0deg)' : poses[mover.side];
    }
    section.copies.forEach((copy, side) => { copy.style.transform = mobile || section.hero ? poses[side] : ''; });
    if (focal && scene.trace) {
      scene.trace.style.clipPath = `inset(0 0 ${round((1 - smoothstep(0, .28, progress)) * 100)}% 0)`;
      scene.trace.style.opacity = round(1 - smoothstep(.28, .38, progress));
    }
    section.progress = progress;
  }

  function frame(timestamp) {
    pending = 0;
    if (document.hidden || preference.matches) return;
    const now = Number.isFinite(timestamp) ? timestamp : clock();
    const dt = lastTime === null ? 1 / 60 : Math.min(.05, Math.max(0, (now - lastTime) / 1000));
    lastTime = now;
    if (layoutDirty) cacheGeometry();
    const height = Math.max(1, window.innerHeight), mobile = root.clientWidth <= 900;
    const active = document.activeElement, selection = window.getSelection();
    const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
    const selectionInCopies = range && sections.some(section => section.copies.some(copy => copy.contains(selection.anchorNode) || copy.contains(selection.focusNode)));
    // Stable geometry reads are batched before every visual update.
    const states = sections.map(section => {
      const rect = section.element.getBoundingClientRect();
      const copyFocused = section.copies.some(copy => copy.contains(active));
      const copySelected = selectionInCopies && section.copies.some(copy => range.intersectsNode(copy));
      const interacting = (!copyFocused && section.element.contains(active)) || (range && !copySelected && range.intersectsNode(section.element));
      const boundary = section.hero ? Math.min(height * .92, section.height) : height * .58;
      const span = section.hero ? height * .64 : boundary;
      const mobileProgress = (Math.min(height * .16, section.documentTop - 48) - rect.top) / Math.min(section.height * .75, height * .72);
      return { section, rect, interacting, copySelected,
        target: interacting ? 0 : clamp(mobile && section.hero ? mobileProgress : (boundary - rect.bottom) / span) };
    });
    const sceneRect = scene && scene.element.getBoundingClientRect();
    const proofRect = scene && scene.proof.getBoundingClientRect();
    sceneVisible = !!scene && sceneRect.bottom > 0 && sceneRect.top < height;
    const sourceSelected = scene && (scene.proof.contains(active) || (range && range.intersectsNode(scene.proof)));
    const energy = Math.exp(-Math.max(0, now - lastInput) / 650);
    const activity = smoothstep(0, 900, wakeUntil - now);
    if (sceneVisible) waterTime += dt * activity;
    let moving = false, fracture = 0;
    for (const state of states) {
      const { section, target, interacting, copySelected } = state;
      let progress = copySelected ? Math.max(0, section.progress) : target;
      if (section.hero && scene) {
        if (copySelected) { scene.spring.velocity = 0; }
        else moving = settle(scene.spring, target, dt, interacting || !sceneVisible) || moving;
        progress = clamp(scene.spring.value === null ? target : scene.spring.value);
        fracture = progress;
      }
      if (section.hero && scene || Math.abs(progress - section.progress) >= .0001) applyPose(section, progress, mobile, copySelected ? 0 : energy);
    }
    if (scene) {
      const progress = clamp((height * .95 - proofRect.top) / (height * .81));
      const gate = smoothstep(.28, .64, fracture);
      const rises = scene.figures.map((figure, index) => {
        const delay = [0, .08, .04, .13][index % 4];
        const target = smoothstep(delay, .9 + delay * .6, progress) * gate;
        moving = settle(figure.spring, target, dt, sourceSelected || !sceneVisible) || moving;
        // A small amount of travel past the surface preserves the spring's
        // buoyant settling instead of abruptly clipping its final velocity.
        return Math.max(-.04, Math.min(1.04, figure.spring.value));
      });
      if (sceneVisible && !scene.attempted && window.createProofWater && scene.canvas) {
        scene.attempted = true;
        scene.renderer = window.createProofWater(scene.canvas);
        if (scene.renderer) scene.renderer.configure(scene.layout);
      }
      // Always draw the last calm frame, even between the capped render ticks,
      // so contact waves disappear before the scene goes idle.
      const finishing = activity === 0 && lastActivity > 0;
      if (scene.renderer && sceneVisible && (now - lastDraw >= 32 || sourceSelected || finishing)) {
        const drawn = scene.renderer.render({ time: waterTime, rises, energy, activity, fracture, showFigures: !sourceSelected });
        scene.element.classList.toggle('scene-rendered', drawn === true && !sourceSelected);
        lastDraw = now;
        lastActivity = activity;
      } else if (!scene.renderer || scene.renderer.ready === false) scene.element.classList.toggle('scene-rendered', false);
      const release = smoothstep(.3, .9, fracture);
      scene.floes.forEach((floe, index) => {
        const side = index % 2 ? 1 : -1;
        floe.style.opacity = round(release * (index === 1 ? .78 : 1));
        floe.style.transform = `translate3d(${round(side * release * (12 + index * 9))}px, ${round(release * (12 + index * 6) + Math.sin(waterTime * 1.4 + index) * energy * release * 2)}px, 0) rotate(${round(side * release * (8 + index * 5))}deg)`;
      });
    }
    if (sceneVisible && (moving || now < wakeUntil)) queueFrame();
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
    restoreSource();
    layoutDirty = true;
    root.classList.toggle('motion-ready', !preference.matches);
    if (scene) {
      scene.spring = spring();
      scene.figures.forEach(figure => { figure.spring = spring(); });
      if (preference.matches && scene.renderer) { scene.renderer.destroy(); scene.renderer = null; scene.attempted = false; }
    }
    if (!preference.matches) { wakeUntil = 0; frame(clock()); }
  }
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', invalidateLayout, { passive: true });
  window.addEventListener('pageshow', syncPreference);
  preference.addEventListener('change', syncPreference);
  document.addEventListener('focusin', () => { cancel(); lastDraw = -Infinity; frame(clock()); });
  document.addEventListener('focusout', schedule);
  document.addEventListener('selectionchange', () => { lastDraw = -Infinity; schedule(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); else schedule(); });
  if (scene && scene.canvas.addEventListener) {
    scene.canvas.addEventListener('webglcontextlost', () => { scene.element.classList.toggle('scene-rendered', false); });
    scene.canvas.addEventListener('webglcontextrestored', schedule);
  }
  if (document.fonts) document.fonts.ready.then(invalidateLayout);
  syncPreference();
})();
