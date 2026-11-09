const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');

// Synthetic layout verifies DOM ownership and scheduling. Browser checks still
// own clipping, legibility, real pointer targets, and GPU performance.
function setup({ reduced = false, stage: withStage = true, height = 960, width: initialWidth = 1280, rendererAvailable = true, rendererSuccess = true } = {}) {
  let scroll = 0, nextFrame = 0, width = initialWidth, now = 0;
  let renderSuccess = rendererSuccess, renderReady = rendererSuccess;
  const queue = new Map(), windowEvents = new Map(), documentEvents = new Map(), canvasEvents = new Map();
  const trace = [], waterTrace = [], contentChanges = [];
  const styled = (name, content = false) => {
    const record = property => { trace.push('write'); if (content) contentChanges.push(`${name}.${property}`); };
    return { style: new Proxy({
      removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; },
      setProperty(key, value) { this[key] = value; },
    }, {
      set(target, key, value) { record(key); target[key] = value; return true; },
      deleteProperty(target, key) { record(key); delete target[key]; return true; },
    }) };
  };
  const classed = (name, content = false) => {
    const classes = new Set();
    const change = (value, add) => {
      if (content) contentChanges.push(`${name}.class:${value}`);
      add ? classes.add(value) : classes.delete(value);
    };
    return { classes, classList: {
      toggle(value, enabled) { change(value, enabled); },
      add(...values) { values.forEach(value => change(value, true)); },
      remove(...values) { values.forEach(value => change(value, false)); },
    } };
  };
  const attributed = () => ({
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  });
  const rect = (top, elementHeight, left = 0, elementWidth = width) => ({
    left, right: left + elementWidth, width: elementWidth, height: elementHeight,
    top: top - scroll, bottom: top + elementHeight - scroll,
  });
  const content = name => ({ ...styled(name, true), ...classed(name, true), textContent: name });
  const heroText = content('hero text'), cta = content('CTA');
  const laterText = [content('case study'), content('services'), content('contact')];
  const fractureLine = attributed(), fractureBranches = attributed();
  const fracture = {
    ...styled('fracture'), ...attributed(), line: fractureLine, branches: fractureBranches,
    querySelector(selector) { return selector === '[data-fracture-line]' ? fractureLine : selector === '[data-fracture-branches]' ? fractureBranches : null; },
  };
  const surfaces = [0, 1].map(side => ({
    ...styled(`surface ${side}`),
    getBoundingClientRect() { trace.push('child-read'); return rect(960, 240); },
  }));
  const stage = withStage ? {
    ...styled('stage'), ...classed('stage'), dataset: { split: 'hero' }, surfaces, fracture,
    querySelectorAll(selector) { return selector === '.split-surface' ? surfaces : []; },
    querySelector(selector) { return selector === '[data-fracture]' ? fracture : null; },
    getBoundingClientRect() { trace.push('read'); return rect(960, 240); },
    contains(node) { return surfaces.includes(node) || node === fracture; },
    // No cloneNode/append: decorative motion must never need text copies.
  } : null;
  const figures = ['300k+', '3×', '20,000', '3'].map((text, index) => {
    const number = {
      ...content(text),
      getBoundingClientRect() { trace.push('child-read'); return rect(1300, 64, 64 + index * (width - 128) / 4, (width - 128) / 4 - 20); },
    };
    return {
      ...content(`proof ${index}`), number, dataset: { float: '' },
      querySelector(selector) { return selector === '.proof-num' ? number : null; },
      getBoundingClientRect() { trace.push('child-read'); return rect(1300, 180, 64 + index * (width - 128) / 4, (width - 128) / 4); },
    };
  });
  const proof = {
    ...content('proof'), figures,
    contains(node) { return figures.some(figure => node === figure || node === figure.number); },
    querySelectorAll(selector) { return selector === '[data-float]' ? figures : []; },
    getBoundingClientRect() { trace.push('read'); return rect(1200, 600, 64, width - 128); },
  };
  const canvas = {
    addEventListener(name, fn) { canvasEvents.set(name, fn); },
    getBoundingClientRect() { trace.push('child-read'); return rect(0, 1800); },
  };
  const scene = {
    ...classed('scene'), canvas, floes: [styled('floe 0'), styled('floe 1'), styled('floe 2')],
    querySelector(selector) { return selector === '[data-water-canvas]' ? canvas : null; },
    querySelectorAll(selector) { return selector === '[data-floe]' ? this.floes : []; },
    getBoundingClientRect() { trace.push('read'); return rect(0, 1800); },
  };
  const root = { ...classed('root'), clientWidth: width };
  let onPreference;
  const preference = { matches: reduced, addEventListener(_, fn) { onPreference = fn; } };
  const selection = { isCollapsed: true, anchorNode: null, focusNode: null, rangeCount: 0 };
  const document = {
    hidden: false, activeElement: null, documentElement: root,
    querySelectorAll(selector) { return selector === '[data-split]' && stage ? [stage] : []; },
    querySelector(selector) {
      return selector === '[data-split="hero"]' ? stage : selector === '[data-ice-scene]' ? scene : selector === '[data-water-proof]' ? proof : null;
    },
    addEventListener(name, fn) { documentEvents.set(name, fn); },
  };
  const window = {
    innerHeight: height, get innerWidth() { return width; }, get scrollY() { return scroll; },
    getSelection: () => selection, matchMedia: () => preference,
    performance: { now: () => now },
    getComputedStyle() { trace.push('font-read'); return { font: '500 64px Instrument Sans', fontSize: '64px', letterSpacing: '-2px' }; },
    requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { queue.delete(id); },
    addEventListener(name, fn, options) { windowEvents.set(name, { fn, options }); },
    createProofWater: rendererAvailable ? target => {
      waterTrace.push(['create', target]);
      return {
        get ready() { return renderReady; },
        configure(layout) { waterTrace.push(['configure', layout]); },
        render(frame) { waterTrace.push(['render', frame]); return renderSuccess; },
        destroy() { waterTrace.push(['destroy']); },
      };
    } : undefined,
  };
  vm.runInNewContext(source, { window, document });
  trace.length = 0;
  return {
    stage, surfaces, proof, scene, root, queue, trace, waterTrace, contentChanges, heroText, cta, laterText, windowEvents,
    scroll(value) { scroll = value; windowEvents.get('scroll')?.fn(); },
    flush(ms = 1000 / 60) { now += ms; const frames = [...queue.values()]; queue.clear(); for (const frame of frames) frame(now); },
    advance(ms) { const end = now + ms; while (now < end) this.flush(Math.min(1000 / 60, end - now)); },
    settle(limit = 4000) { const end = now + limit; while (queue.size && now < end) this.flush(); assert.equal(queue.size, 0, 'the scene must stop scheduling after its bounded response'); },
    renderer(value) { renderSuccess = value; renderReady = value; },
    contextLost() { renderSuccess = false; renderReady = false; canvasEvents.get('webglcontextlost')?.(); },
    reduced(value) { preference.matches = value; onPreference(); },
    hidden(value) { document.hidden = value; documentEvents.get('visibilitychange')?.(); },
    focus(node) { document.activeElement = node; documentEvents.get('focusin')?.(); },
    select(node) { selection.isCollapsed = !node; selection.anchorNode = selection.focusNode = node; selection.rangeCount = node ? 1 : 0; documentEvents.get('selectionchange')?.(); },
    resize(value) { width = value; root.clientWidth = value; windowEvents.get('resize')?.fn(); },
  };
}
const poses = page => page.surfaces.map(surface => surface.style.transform);
const restingPose = 'translate3d(0px, 0px, 0) rotate(0deg)';
const translation = pose => Number(pose.match(/translate3d\(([-\d.]+)/)[1]);
const renderedFrames = page => page.waterTrace.filter(([event]) => event === 'render').map(([, value]) => value);
const lastFrame = page => renderedFrames(page).at(-1);
const sourceNumbers = page => page.proof.figures.map(figure => figure.number.textContent);
const close = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);

test('page markup assigns split motion only to the decorative divider', () => {
  const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
  const splitElements = [...html.matchAll(/<[^>]+\bdata-split\b[^>]*>/g)].map(match => match[0]);
  assert.equal(splitElements.length, 1, 'hero copy and later content must not become split sections');
  assert.match(splitElements[0], /^<div\b/);
  assert.match(splitElements[0], /class="[^"]*\bice-break\b[^"]*"/);
  assert.match(splitElements[0], /aria-hidden="true"/);
  assert.doesNotMatch(html, /\bdata-drift\b/, 'content must not be registered as a moving layer');
});

test('starts with intact decorative ice and no idle animation loop', () => {
  const page = setup();
  assert.ok(page.root.classes.has('motion-ready'));
  assert.ok(poses(page).every(pose => pose === restingPose));
  assert.equal(page.queue.size, 0);
  assert.equal(page.windowEvents.get('scroll').options.passive, true);
  assert.deepEqual(page.contentChanges, []);
});

test('coalesces scroll events and draws water on each visible animation frame', () => {
  const page = setup();
  for (let i = 0; i < 20; i++) page.scroll(600);
  assert.equal(page.queue.size, 1);
  const before = renderedFrames(page).length;
  for (let i = 0; i < 12; i++) page.flush(1000 / 120);
  assert.equal(renderedFrames(page).length - before, 12, 'water must not run at half the slab frame rate');
});

test('opens only the decorative divider after it enters the scroll stage', () => {
  const page = setup();
  page.scroll(150); page.settle();
  assert.ok(poses(page).every(pose => pose === restingPose));
  page.scroll(600); page.settle();
  assert.ok(translation(poses(page)[0]) < 0);
  assert.ok(translation(poses(page)[1]) > 0);
  assert.deepEqual(page.contentChanges, []);
});

test('propagates the fracture before the decorative slabs release', () => {
  const page = setup();
  assert.ok(page.stage.fracture.line.attributes.d.startsWith('M'));
  page.scroll(300); page.settle();
  assert.notEqual(page.stage.fracture.style.clipPath, 'inset(0 0 100% 0)');
  assert.ok(Number(page.stage.fracture.style.opacity) > 0);
  assert.ok(poses(page).every(pose => translation(pose) === 0));
  page.scroll(600); page.settle();
  assert.ok(poses(page).some(pose => translation(pose) !== 0));
});

test('slabs and water retain momentum after input, then stop completely', () => {
  const page = setup();
  page.scroll(600); page.advance(150);
  const early = poses(page), earlyFrame = lastFrame(page);
  page.advance(350);
  assert.notDeepEqual(poses(page), early);
  assert.ok(lastFrame(page).time > earlyFrame.time);
  page.settle();
  assert.equal(lastFrame(page).activity, 0);
  const count = renderedFrames(page).length;
  page.advance(1000);
  assert.equal(renderedFrames(page).length, count);
});

test('reversing an active scene is continuous and reaches the same destination', () => {
  const page = setup();
  page.scroll(600); page.settle();
  const destination = poses(page);
  page.scroll(800); page.advance(120);
  const before = poses(page);
  page.scroll(600); page.flush(1);
  assert.ok(poses(page).every((pose, index) => Math.abs(translation(pose) - translation(before[index])) < 5));
  page.settle();
  assert.deepEqual(poses(page), destination);
  close(lastFrame(page).fracture, (960 * .8 - (960 - 600)) / (960 * .65));
});

test('caches child geometry and typography until layout changes', () => {
  const page = setup();
  page.scroll(600); page.flush();
  const firstWrite = page.trace.indexOf('write');
  assert.ok(firstWrite > 0);
  assert.ok(!page.trace.slice(firstWrite).includes('read'), 'stable geometry reads precede visual writes');
  page.advance(500);
  assert.ok(!page.trace.includes('child-read'));
  assert.ok(!page.trace.includes('font-read'));
  assert.equal(page.waterTrace.filter(([event]) => event === 'configure').length, 1);
  page.resize(390); page.flush();
  assert.ok(page.trace.includes('child-read'));
  assert.ok(page.trace.includes('font-read'));
  assert.equal(page.waterTrace.filter(([event]) => event === 'configure').length, 2);
});

test('configures one reflection renderer with real figures and the water boundary', () => {
  const page = setup();
  page.scroll(600); page.settle();
  const creates = page.waterTrace.filter(([event]) => event === 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0][1], page.scene.canvas);
  const layout = page.waterTrace.find(([event]) => event === 'configure')[1];
  assert.equal(layout.waterStart, 960);
  assert.equal(layout.heroHeight, 1200);
  assert.deepEqual(Array.from(layout.figures, figure => figure.text), sourceNumbers(page));
  assert.ok(layout.figures.every(figure => figure.y >= layout.heroHeight && figure.font.includes('Instrument Sans')));
  assert.equal(lastFrame(page).rises, undefined, 'native figures must not receive an emergence animation');
  assert.equal(lastFrame(page).showFigures, undefined, 'the canvas must not own source figure visibility');
});

test('passes the visible water interval and clamps it to the scene', () => {
  const page = setup();
  page.scroll(600); page.flush();
  assert.equal(lastFrame(page).visibleTop, 960);
  assert.equal(lastFrame(page).visibleBottom, 1560);
  page.scroll(1400); page.flush();
  assert.equal(lastFrame(page).visibleTop, 1400);
  assert.equal(lastFrame(page).visibleBottom, 1800);
});

test('focus and selection never change source text, CTA, or numeral presentation', () => {
  for (const width of [1280, 390]) {
    const page = setup({ width });
    page.scroll(600); page.advance(400);
    page.focus(page.cta);
    page.select(page.heroText);
    page.scroll(800); page.advance(400);
    page.select(page.proof.figures[0].number);
    page.scroll(1200); page.settle();
    page.select(page.laterText[0]);
    page.scroll(2200); page.flush();
    assert.deepEqual(page.contentChanges, []);
    assert.deepEqual(sourceNumbers(page), ['300k+', '3×', '20,000', '3']);
  }
});

test('source figures remain untouched if rendering is unavailable, fails, or loses its context', () => {
  const absent = setup({ rendererAvailable: false });
  absent.scroll(600); absent.settle();
  assert.ok(!absent.scene.classes.has('scene-rendered'));
  const failed = setup({ rendererSuccess: false });
  failed.scroll(600); failed.advance(100);
  assert.ok(!failed.scene.classes.has('scene-rendered'));
  failed.renderer(true); failed.advance(100);
  assert.ok(failed.scene.classes.has('scene-rendered'));
  failed.contextLost();
  assert.ok(!failed.scene.classes.has('scene-rendered'));
  assert.deepEqual(failed.contentChanges, []);
  assert.deepEqual(absent.contentChanges, []);
  assert.deepEqual(sourceNumbers(failed), sourceNumbers(absent));
});

test('reduced motion immediately cancels and restores the static decorative stage', () => {
  const page = setup();
  page.scroll(600); page.advance(300);
  page.reduced(true);
  assert.equal(page.queue.size, 0);
  assert.ok(!page.root.classes.has('motion-ready'));
  assert.ok(!page.scene.classes.has('scene-rendered'));
  assert.ok(poses(page).every(pose => pose === undefined));
  assert.ok(page.waterTrace.some(([event]) => event === 'destroy'));
  const count = renderedFrames(page).length;
  page.scroll(800); page.advance(1000);
  assert.equal(renderedFrames(page).length, count);
  page.reduced(false); page.settle();
  assert.ok(page.root.classes.has('motion-ready'));
  assert.deepEqual(page.contentChanges, []);
});

test('starts without a renderer or frame loop when reduced motion is already enabled', () => {
  const page = setup({ reduced: true });
  assert.equal(page.waterTrace.length, 0);
  assert.equal(page.queue.size, 0);
  assert.ok(!page.root.classes.has('motion-ready'));
  page.scroll(600); page.advance(1000);
  assert.equal(page.waterTrace.length, 0);
  assert.deepEqual(page.contentChanges, []);
});

test('hidden and offscreen scenes stop rendering and resume safely after long suspension', () => {
  const page = setup();
  page.scroll(600); page.advance(200);
  page.hidden(true);
  assert.equal(page.queue.size, 0);
  const hiddenCount = renderedFrames(page).length;
  page.scroll(800); page.flush(120000);
  assert.equal(renderedFrames(page).length, hiddenCount);
  page.hidden(false); page.advance(100);
  assert.ok(renderedFrames(page).length > hiddenCount);
  assert.ok(poses(page).every(pose => !/NaN|Infinity/.test(pose)));
  page.scroll(5000); page.flush();
  assert.equal(page.queue.size, 0);
  const offscreenCount = renderedFrames(page).length;
  page.advance(1000);
  assert.equal(renderedFrames(page).length, offscreenCount);
  page.scroll(600); page.settle();
  assert.ok(renderedFrames(page).length > offscreenCount);
  assert.ok(poses(page).every(pose => !/NaN|Infinity/.test(pose)));
});

test('does nothing on a page without the decorative stage', () => {
  const page = setup({ stage: false });
  assert.equal(page.windowEvents.size, 0);
  assert.equal(page.queue.size, 0);
  assert.equal(page.waterTrace.length, 0);
  assert.deepEqual(page.contentChanges, []);
});
