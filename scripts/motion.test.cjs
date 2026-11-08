const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');

function setup({ reduced = false, count = 2 } = {}) {
  let scroll = 0, nextFrame = 0;
  const queue = new Map(), windowEvents = new Map(), documentEvents = new Map();
  const classes = new Set(), trace = [];
  const selection = { isCollapsed: true, anchorNode: null };
  let onPreference;
  const preference = { matches: reduced, addEventListener: (_, fn) => { onPreference = fn; } };
  const makePart = drift => {
    const style = new Proxy({ removeProperty(key) { delete this[key]; } }, {
      set(target, key, value) { trace.push('write'); target[key] = value; return true; },
    });
    return { dataset: { drift }, style };
  };
  const sections = Array.from({ length: count }, (_, index) => {
    const parts = [makePart('left'), makePart('right')];
    const surfaces = [makePart('left'), makePart('right')];
    return {
      parts, surfaces,
      querySelectorAll: selector => selector === '[data-drift]' ? parts : surfaces,
      getBoundingClientRect: () => { trace.push('read'); return { bottom: 700 + index * 700 - scroll }; },
      contains: node => parts.includes(node),
    };
  });
  const root = { clientWidth: 1280, classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); } } };
  const document = {
    hidden: false, activeElement: null, documentElement: root,
    querySelectorAll: () => sections,
    addEventListener: (name, fn) => documentEvents.set(name, fn),
  };
  const window = {
    innerHeight: 960, getSelection: () => selection, matchMedia: () => preference,
    requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => queue.delete(id),
    addEventListener: (name, fn, options) => windowEvents.set(name, { fn, options }),
  };
  vm.runInNewContext(source, { window, document });
  trace.length = 0;
  return {
    sections, queue, classes, trace, windowEvents,
    scroll(value) { scroll = value; windowEvents.get('scroll').fn(); },
    flush() { const frames = [...queue.values()]; queue.clear(); for (const frame of frames) frame(); },
    reduced(value) { preference.matches = value; onPreference(); },
    hidden(value) { document.hidden = value; documentEvents.get('visibilitychange')(); },
    focus(part) { document.activeElement = part; documentEvents.get('focusin')(); },
    select(part) { selection.isCollapsed = !part; selection.anchorNode = part; documentEvents.get('selectionchange')(); },
    resize(width) { root.clientWidth = width; windowEvents.get('resize').fn(); },
  };
}
const positions = section => section.parts.map(part => part.style.transform);

test('leaves sections intact in the reading area and coalesces scroll events', () => {
  const page = setup();
  assert.ok(page.classes.has('motion-ready'));
  assert.equal(page.queue.size, 0);
  assert.equal(page.windowEvents.get('scroll').options.passive, true);
  assert.ok(positions(page.sections[0]).every(value => value === 'translate3d(0px, 0, 0)'));
  for (let i = 0; i < 20; i++) page.scroll(300);
  assert.equal(page.queue.size, 1);
  page.flush();
  assert.equal(page.queue.size, 0);
});

test('moves actual content in opposite directions and reverses exactly', () => {
  const page = setup();
  page.scroll(300); page.flush();
  const before = positions(page.sections[0]);
  assert.match(before[0], /translate3d\(-/);
  assert.doesNotMatch(before[1], /translate3d\(-/);
  page.scroll(500); page.flush();
  assert.notDeepEqual(positions(page.sections[0]), before);
  page.scroll(300); page.flush();
  assert.deepEqual(positions(page.sections[0]), before);
});

test('batches all geometry reads before animation writes', () => {
  const page = setup();
  page.scroll(950); page.flush();
  const firstWrite = page.trace.indexOf('write');
  assert.equal(firstWrite, 2);
  assert.ok(!page.trace.slice(firstWrite).includes('read'));
});

test('fast jumps clamp to endpoints and stable offscreen sections are not rewritten', () => {
  const page = setup();
  page.scroll(5000); page.flush();
  const end = positions(page.sections[0]);
  page.trace.length = 0;
  page.scroll(8000); page.flush();
  assert.deepEqual(positions(page.sections[0]), end);
  assert.ok(!page.trace.includes('write'));
  assert.equal(page.queue.size, 0);
});

test('reduced motion restores the original layout and cancels queued work', () => {
  const page = setup();
  page.scroll(300); page.flush();
  page.scroll(400);
  page.reduced(true);
  assert.equal(page.queue.size, 0);
  assert.ok(!page.classes.has('motion-ready'));
  assert.ok(positions(page.sections[0]).every(value => value === undefined));
  page.scroll(600);
  assert.equal(page.queue.size, 0);
  page.reduced(false);
  assert.ok(page.classes.has('motion-ready'));
  assert.match(positions(page.sections[0])[0], /translate3d\(-/);
});

test('starts with the plain page when reduced motion is already enabled', () => {
  const page = setup({ reduced: true });
  assert.ok(!page.classes.has('motion-ready'));
  page.scroll(400);
  assert.equal(page.queue.size, 0);
  assert.ok(positions(page.sections[0]).every(value => value === undefined));
});

test('focused controls return to their normal position without leaving an extra frame queued', () => {
  const page = setup();
  page.scroll(400); page.flush(); page.scroll(450);
  page.focus(page.sections[0].parts[1]);
  assert.equal(page.queue.size, 0);
  assert.ok(positions(page.sections[0]).every(value => value === 'translate3d(0px, 0, 0)'));
  page.scroll(500); page.flush();
  assert.ok(positions(page.sections[0]).every(value => value === 'translate3d(0px, 0, 0)'));
});

test('text selection freezes its section and releasing it resumes the scroll position', () => {
  const page = setup();
  page.scroll(400); page.flush();
  const before = positions(page.sections[0]);
  page.select(page.sections[0].parts[0]); page.flush();
  assert.ok(positions(page.sections[0]).every(value => value === 'translate3d(0px, 0, 0)'));
  page.select(null); page.flush();
  assert.deepEqual(positions(page.sections[0]), before);
});

test('mobile resize reduces displacement at the same scroll position', () => {
  const page = setup();
  page.scroll(400); page.flush();
  const x = value => Number(value.match(/translate3d\(([-\d.]+)/)[1]);
  const desktop = Math.abs(x(positions(page.sections[0])[0]));
  page.resize(390); page.flush();
  assert.ok(Math.abs(x(positions(page.sections[0])[0])) < desktop / 2);
});

test('hidden pages cancel pending work and resume without an idle loop', () => {
  const page = setup();
  page.scroll(300); page.hidden(true);
  assert.equal(page.queue.size, 0);
  page.scroll(450);
  assert.equal(page.queue.size, 0);
  page.hidden(false); page.flush();
  assert.match(positions(page.sections[0])[0], /translate3d\(-/);
  assert.equal(page.queue.size, 0);
});

test('does nothing on pages without split sections', () => {
  const page = setup({ count: 0 });
  assert.equal(page.windowEvents.size, 0);
  assert.equal(page.queue.size, 0);
});
