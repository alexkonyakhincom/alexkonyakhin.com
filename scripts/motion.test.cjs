const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const source = read('motion.js');

// Synthetic layout verifies DOM ownership and scheduling. Browser checks still
// own the drawn scene, legibility, real pointer targets and performance.
function setup({ reduced = false, lead: withLead = true, height = 960, width: initialWidth = 1280, rendererAvailable = true, rendererSuccess = true } = {}) {
  let scroll = 0, nextFrame = 0, width = initialWidth, now = 0, renderSuccess = rendererSuccess;
  const queue = new Map(), windowEvents = new Map(), documentEvents = new Map(), leadEvents = new Map();
  const trace = [], sceneTrace = [], contentChanges = [];
  const classed = (name, content = false) => {
    const classes = new Set();
    return { classes, classList: { toggle(value, enabled) {
      if (content) contentChanges.push(`${name}.class:${value}`);
      enabled ? classes.add(value) : classes.delete(value);
    } } };
  };
  const rect = (top, elementHeight, left = 0, elementWidth = width) => ({
    left, right: left + elementWidth, width: elementWidth, height: elementHeight,
    top: top - scroll, bottom: top + elementHeight - scroll,
  });
  // Content records any style or class write; the controller must make none.
  const content = name => ({
    ...classed(name, true), textContent: name,
    style: new Proxy({}, { set(target, key, value) { contentChanges.push(`${name}.${String(key)}`); target[key] = value; return true; } }),
  });
  const figures = ['300k+', '16', '3×', '2.15×'].map((text, index) => ({
    ...content(text),
    getBoundingClientRect() { trace.push('child-read'); return rect(1100, 180, 64 + index * (width - 128) / 4, (width - 128) / 4 - 40); },
  }));
  const canvas = { getBoundingClientRect() { trace.push('child-read'); return rect(960, 520); } };
  const lead = withLead ? {
    ...content('lead'), figures, canvas,
    querySelector(selector) { return selector === '[data-lead-canvas]' ? canvas : null; },
    querySelectorAll(selector) { return selector === '[data-floe]' ? figures : []; },
    addEventListener(name, fn) { leadEvents.set(name, fn); },
    getBoundingClientRect() { trace.push('read'); return rect(960, 520, 64, width - 128); },
  } : null;
  const root = { ...classed('root'), clientWidth: width };
  let onPreference;
  const preference = { matches: reduced, addEventListener(_, fn) { onPreference = fn; } };
  const document = {
    hidden: false, documentElement: root,
    querySelector(selector) { return selector === '[data-lead]' ? lead : null; },
    addEventListener(name, fn) { documentEvents.set(name, fn); },
  };
  const window = {
    innerHeight: height, matchMedia: () => preference, performance: { now: () => now },
    requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame(id) { queue.delete(id); },
    addEventListener(name, fn, options) { windowEvents.set(name, { fn, options }); },
    createIceLead: rendererAvailable ? target => {
      sceneTrace.push(['create', target]);
      return {
        configure(layout) { trace.push('configure'); sceneTrace.push(['configure', layout]); },
        render(frame) { trace.push('render'); sceneTrace.push(['render', frame]); return renderSuccess; },
        destroy() { sceneTrace.push(['destroy']); },
      };
    } : undefined,
  };
  vm.runInNewContext(source, { window, document });
  trace.length = 0;
  return {
    lead, root, queue, trace, sceneTrace, contentChanges, windowEvents,
    scroll(value) { scroll = value; windowEvents.get('scroll')?.fn(); },
    pointer() { leadEvents.get('pointermove')?.(); },
    flush(ms = 1000 / 60) { now += ms; const frames = [...queue.values()]; queue.clear(); for (const frame of frames) frame(now); },
    advance(ms) { const end = now + ms; while (now < end) this.flush(Math.min(1000 / 60, end - now)); },
    settle(limit = 8000) { const end = now + limit; while (queue.size && now < end) this.flush(); assert.equal(queue.size, 0, 'the scene must stop scheduling after its bounded response'); },
    renderer(value) { renderSuccess = value; },
    reduced(value) { preference.matches = value; onPreference(); },
    hidden(value) { document.hidden = value; documentEvents.get('visibilitychange')?.(); },
    resize(value) { width = value; root.clientWidth = value; windowEvents.get('resize')?.fn(); },
  };
}
// Copied out of the vm realm so deep equality compares plain values.
const frames = page => page.sceneTrace.filter(([event]) => event === 'render').map(([, value]) => ({ ...value }));
const last = page => frames(page).at(-1);
const count = (page, name) => page.sceneTrace.filter(([event]) => event === name).length;
const close = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);
// The lead sits at 960px in a 960px viewport: progress = (864 - (960 - scroll)) / 528.
const expected = scroll => Math.max(0, Math.min(1, (960 * .9 - (960 - scroll)) / (960 * .55)));

test('both pages give the scene one decorative canvas and one floe, the quote, as native text', () => {
  for (const name of ['index.html', 'sr/index.html']) {
    const html = read(name);
    const canvases = [...html.matchAll(/<canvas\b[^>]*>/g)].map(match => match[0]);
    assert.equal(canvases.length, 1);
    assert.match(canvases[0], /data-lead-canvas/);
    assert.match(canvases[0], /aria-hidden="true"/);
    assert.equal([...html.matchAll(/<div class="lead" data-lead>/g)].length, 1);
    assert.equal([...html.matchAll(/<figure class="quote quote-lead" data-floe>/g)].length, 1);
    assert.equal([...html.matchAll(/data-floe/g)].length, 1, 'the ice carries the quote and nothing else');
    assert.doesNotMatch(html, /proof-num|proof-band/, 'the stat band must not return');
    assert.doesNotMatch(html, /data-split|data-water|scene-floe/, 'the retired scene must leave no markup behind');
  }
});

test('starts as intact ice with no idle animation loop', () => {
  const page = setup();
  assert.equal(page.queue.size, 0);
  assert.equal(frames(page).length, 0, 'nothing is drawn while the lead is below the fold');
  page.scroll(2); page.flush();
  assert.ok(page.root.classes.has('lead-live'));
  assert.ok(last(page).progress < .01);
  page.settle();
  assert.equal(page.windowEvents.get('scroll').options.passive, true);
  assert.deepEqual(page.contentChanges, []);
});

test('coalesces a burst of scroll events into one frame at the final position', () => {
  const page = setup();
  for (let i = 1; i <= 20; i++) page.scroll(20 * i);
  assert.equal(page.queue.size, 1);
  page.flush();
  assert.equal(frames(page).length, 1);
  close(last(page).progress, expected(400));
  assert.equal(page.queue.size, 0);
});

test('scroll opens the lead and settles on the scroll position', () => {
  const page = setup();
  page.scroll(300); page.flush();
  close(last(page).progress, expected(300));
  page.scroll(900); page.settle();
  assert.equal(last(page).progress, 1);
  assert.deepEqual(page.contentChanges, []);
});

test('stopping the scroll freezes the scene and pointer movement leaves it still', () => {
  const page = setup();
  page.scroll(450); page.flush();
  assert.equal(page.queue.size, 0);
  const total = frames(page).length;
  page.pointer();
  assert.equal(page.queue.size, 0);
  page.scroll(450);
  page.advance(2000);
  assert.equal(frames(page).length, total);
});

test('reversing mid-break is continuous and returns to the same state', () => {
  const page = setup();
  page.scroll(300); page.flush();
  const start = last(page);
  page.scroll(450); page.flush();
  const middle = last(page);
  page.scroll(460); page.flush();
  assert.ok(last(page).progress - middle.progress > 0 && last(page).progress - middle.progress < .02);
  page.scroll(450); page.flush();
  assert.deepEqual(last(page), middle);
  page.scroll(300); page.flush();
  assert.deepEqual(last(page), start);
});

test('progress never leaves the unit interval or goes non-finite', () => {
  const page = setup();
  for (const position of [5000, 0, 900, 200, 3000, 450]) { page.scroll(position); page.advance(90); }
  page.settle();
  assert.ok(frames(page).every(frame => Number.isFinite(frame.progress) && frame.progress >= 0 && frame.progress <= 1));
});

test('measures geometry once per layout and configures before drawing', () => {
  const page = setup();
  page.scroll(400); page.flush();
  page.trace.length = 0;
  page.scroll(450); page.flush();
  assert.ok(!page.trace.includes('child-read'), 'scroll frames read only the lead bounds');
  assert.equal(count(page, 'configure'), 1);
  page.resize(390); page.flush();
  assert.equal(count(page, 'configure'), 2);
  assert.ok(page.trace.lastIndexOf('configure') < page.trace.lastIndexOf('render'));
  const layout = page.sceneTrace.filter(([event]) => event === 'configure').at(-1)[1];
  assert.equal(layout.width, 390);
  assert.equal(layout.floes.length, 4);
  assert.ok(layout.floes.every(floe => floe.y === 140 && floe.height === 180), 'floes are measured relative to the canvas');
});

test('the stylesheet fallback stays in charge when the renderer is missing or fails', () => {
  const absent = setup({ rendererAvailable: false });
  absent.scroll(400); absent.settle();
  assert.ok(!absent.root.classes.has('lead-live'));
  assert.equal(absent.queue.size, 0);
  const failed = setup({ rendererSuccess: false });
  failed.scroll(400); failed.advance(100);
  assert.ok(!failed.root.classes.has('lead-live'));
  failed.renderer(true); failed.scroll(400); failed.flush();
  assert.ok(failed.root.classes.has('lead-live'));
  assert.deepEqual([...absent.contentChanges, ...failed.contentChanges], []);
});

test('reduced motion shows the finished scene as one still frame', () => {
  const page = setup({ reduced: true });
  assert.equal(page.queue.size, 0);
  assert.deepEqual(frames(page), [{ progress: 1 }]);
  assert.ok(page.root.classes.has('lead-live'));
  page.scroll(600); page.pointer(); page.advance(1000);
  assert.equal(frames(page).length, 1);
  page.resize(390);
  assert.equal(page.queue.size, 0);
  assert.deepEqual(last(page), { progress: 1 });
  assert.equal(count(page, 'configure'), 2);
});

test('switching the motion preference cancels or resumes the animation', () => {
  const page = setup();
  page.scroll(400); page.advance(200);
  page.reduced(true);
  assert.equal(page.queue.size, 0);
  assert.deepEqual(last(page), { progress: 1 });
  const total = frames(page).length;
  page.scroll(700); page.advance(1000);
  assert.equal(frames(page).length, total);
  page.reduced(false); page.settle();
  close(last(page).progress, expected(700));
  assert.deepEqual(page.contentChanges, []);
});

test('hidden and offscreen scenes stop drawing and resume safely', () => {
  const page = setup();
  page.scroll(400); page.advance(200);
  page.hidden(true);
  assert.equal(page.queue.size, 0);
  const hiddenCount = frames(page).length;
  page.scroll(600); page.flush(120000);
  assert.equal(frames(page).length, hiddenCount);
  page.hidden(false); page.advance(100);
  assert.ok(frames(page).length > hiddenCount);
  page.scroll(5000); page.flush();
  assert.equal(page.queue.size, 0);
  const offscreenCount = frames(page).length;
  page.advance(1000);
  assert.equal(frames(page).length, offscreenCount);
  page.scroll(900); page.settle();
  assert.equal(last(page).progress, 1);
});

test('does nothing on a page without the lead', () => {
  const page = setup({ lead: false });
  assert.equal(page.windowEvents.size, 0);
  assert.equal(page.queue.size, 0);
  assert.equal(page.sceneTrace.length, 0);
});
