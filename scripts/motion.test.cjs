const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');

function setup({ reduced = false, count = 2, hero = false, water = false, height = 960, rendererAvailable = true } = {}) {
  let scroll = 0, nextFrame = 0, width = 1280;
  const queue = new Map(), windowEvents = new Map(), documentEvents = new Map();
  const classes = new Set(), trace = [], waterTrace = [];
  const styled = () => ({
    style: new Proxy({ removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; } }, {
      set(target, key, value) { trace.push('write'); target[key] = value; return true; },
    }),
  });
  const selection = {
    isCollapsed: true, anchorNode: null, focusNode: null,
    get rangeCount() { return this.isCollapsed ? 0 : 1; },
    getRangeAt(index) {
      assert.equal(index, 0);
      const nodes = proof ? [sections[0], proof, ...sections.slice(1)].filter(Boolean) : sections;
      const start = nodes.findIndex(section => section.parts.includes(this.anchorNode));
      const end = nodes.findIndex(section => section.parts.includes(this.focusNode));
      return {
        intersectsNode(node) {
          const index = nodes.indexOf(node);
          return index >= Math.min(start, end) && index <= Math.max(start, end);
        },
      };
    },
  };
  let onPreference;
  const preference = { matches: reduced, addEventListener: (_, fn) => { onPreference = fn; } };
  const makePart = (drift, index, surface = false) => {
    const { style } = styled();
    return {
      dataset: { drift }, style,
      getBoundingClientRect: () => {
        trace.push('child-read');
        return {
          left: surface ? 0 : 64 + (drift === 'right' ? (width - 128) / 2 : 0),
          top: index * 700 - scroll + (surface ? 0 : 40),
          width: surface ? width : (width - 128) / 2,
        };
      },
    };
  };
  const sections = Array.from({ length: count }, (_, index) => {
    const parts = [makePart('left', index), makePart('right', index)];
    const surfaces = [makePart('left', index, true), makePart('right', index, true)];
    const sectionClasses = new Set();
    return {
      parts, surfaces, classes: sectionClasses, dataset: { split: hero && index === 0 ? 'hero' : 'case' },
      classList: { toggle(name, value) { value ? sectionClasses.add(name) : sectionClasses.delete(name); } },
      querySelectorAll: selector => selector === '[data-drift]' ? parts : surfaces,
      getBoundingClientRect: () => {
        trace.push('read');
        return { left: 64, width: width - 128, height: 700, top: index * 700 - scroll, bottom: 700 + index * 700 - scroll };
      },
      contains: node => parts.includes(node),
    };
  });
  const proof = water ? {
    parts: Array.from({ length: 4 }, (_, index) => {
      const reflection = styled(), ripple = styled();
      return {
        ...styled(), dataset: { float: '' }, reflection, ripple,
        querySelector: selector => selector === '.proof-reflection' ? reflection : selector === '.proof-ripple' ? ripple : null,
        getBoundingClientRect() {
          trace.push('child-read');
          return { left: 64 + index * 288, top: 880 - scroll, width: 256, height: 180, bottom: 1060 - scroll };
        },
      };
    }),
    canvas: {},
    contains(node) { return this.parts.includes(node); },
    querySelector(selector) { return selector === '[data-water-canvas]' ? this.canvas : null; },
    querySelectorAll(selector) { return selector === '[data-float]' ? this.parts : []; },
    getBoundingClientRect() {
      trace.push('read');
      return { left: 64, width: width - 128, height: 720, top: 720 - scroll, bottom: 1440 - scroll };
    },
  } : null;
  const root = { clientWidth: 1280, classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); } } };
  const document = {
    hidden: false, activeElement: null, documentElement: root,
    querySelectorAll: selector => selector === '[data-split]' ? sections : [],
    querySelector: selector => selector === '[data-water-proof]' ? proof : null,
    addEventListener: (name, fn) => documentEvents.set(name, fn),
  };
  const window = {
    innerHeight: height, get scrollY() { return scroll; }, getSelection: () => selection, matchMedia: () => preference,
    requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => queue.delete(id),
    addEventListener: (name, fn, options) => windowEvents.set(name, { fn, options }),
    createProofWater: rendererAvailable ? () => {
      waterTrace.push(['create']);
      return {
        render: progress => waterTrace.push(['render', progress]),
        resize: () => waterTrace.push(['resize']),
        destroy: () => waterTrace.push(['destroy']),
      };
    } : undefined,
  };
  vm.runInNewContext(source, { window, document });
  trace.length = 0;
  return {
    sections, proof, queue, classes, trace, waterTrace, windowEvents,
    scroll(value) { scroll = value; windowEvents.get('scroll').fn(); },
    flush() { const frames = [...queue.values()]; queue.clear(); for (const frame of frames) frame(); },
    reduced(value) { preference.matches = value; onPreference(); },
    hidden(value) { document.hidden = value; documentEvents.get('visibilitychange')(); },
    focus(part) { document.activeElement = part; documentEvents.get('focusin')(); },
    select(part, end = part) { selection.isCollapsed = !part; selection.anchorNode = part; selection.focusNode = end; documentEvents.get('selectionchange')(); },
    resize(value) { width = value; root.clientWidth = value; windowEvents.get('resize').fn(); },
  };
}
const positions = section => section.parts.map(part => part.style.transform);
const restingPose = 'translate3d(0px, 0px, 0) rotate(0deg)';
const translation = pose => Number(pose.match(/translate3d\(([-\d.]+)/)[1]);
const rotation = pose => Number(pose.match(/rotate\(([-\d.]+)/)[1]);

test('leaves sections intact in the reading area and coalesces scroll events', () => {
  const page = setup();
  assert.ok(page.classes.has('motion-ready'));
  assert.equal(page.queue.size, 0);
  assert.equal(page.windowEvents.get('scroll').options.passive, true);
  assert.ok(positions(page.sections[0]).every(value => value === restingPose));
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
  assert.ok(!page.trace.includes('child-read'), 'child layout is cached between layout changes');
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
  assert.ok(page.sections[0].parts.every(part => part.style.transformOrigin === undefined));
  assert.ok(!page.sections[0].classes.has('split-open'));
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
  assert.ok(positions(page.sections[0]).every(value => value === restingPose));
  page.scroll(500); page.flush();
  assert.ok(positions(page.sections[0]).every(value => value === restingPose));
});

test('text selection freezes its section and releasing it resumes the scroll position', () => {
  const page = setup();
  page.scroll(400); page.flush();
  const before = positions(page.sections[0]);
  page.select(page.sections[0].parts[0]); page.flush();
  assert.ok(positions(page.sections[0]).every(value => value === restingPose));
  page.select(null); page.flush();
  assert.deepEqual(positions(page.sections[0]), before);
});

test('mobile resize reduces displacement at the same scroll position', () => {
  const page = setup();
  page.scroll(400); page.flush();
  const desktop = Math.abs(translation(positions(page.sections[0])[0]));
  page.resize(390); page.flush();
  assert.ok(Math.abs(translation(positions(page.sections[0])[0])) < desktop / 2);
  assert.ok(page.trace.includes('child-read'), 'resize refreshes local pivots');
  page.scroll(5000); page.flush();
  for (const pose of positions(page.sections[0])) {
    assert.ok(Math.abs(translation(pose)) <= 14);
    assert.equal(rotation(pose), 0);
    assert.ok(translation(pose) > 0);
    assert.equal(pose, page.sections[0].surfaces[1].style.transform, 'all stacked copy travels with the right sheet');
  }
  assert.ok(translation(page.sections[0].surfaces[0].style.transform) < 0, 'left sheet still parts in the opposite direction');
  page.resize(1280); page.flush();
  assert.equal(page.sections[0].parts[0].style.transform, page.sections[0].surfaces[0].style.transform, 'desktop restores the original two-sided layout');
  assert.ok(translation(page.sections[0].parts[0].style.transform) < 0);
});

test('keeps sheet and content in the same rigid pose around a common world pivot', () => {
  const page = setup();
  const section = page.sections[0];
  page.scroll(500); page.flush();
  section.parts.forEach((part, side) => {
    const surface = section.surfaces[side];
    assert.equal(part.style.transform, surface.style.transform);
    assert.notEqual(rotation(part.style.transform), 0);
    const localPivot = element => element.style.transformOrigin.split(' ').map(parseFloat);
    const partPivot = localPivot(part);
    const surfacePivot = localPivot(surface);
    // Layout x offsets in the fixture are 64px and 640px; all text is 40px
    // below its sheet. Their local origins must resolve to the same world point.
    assert.ok(Math.abs(partPivot[0] + (side === 0 ? 64 : 640) - surfacePivot[0]) < .001);
    assert.ok(Math.abs(partPivot[1] + 40 - surfacePivot[1]) < .001);
  });
});

test('opens a small crack before the heavier drift and delayed rotation', () => {
  const page = setup();
  // The section bottom starts at 700px; reading boundary is 556.8px.
  const atProgress = progress => {
    page.scroll(700 - 556.8 + progress * 556.8); page.flush();
    return positions(page.sections[0])[0];
  };
  const early = atProgress(.1);
  const middle = atProgress(.5);
  const end = atProgress(1);
  assert.ok(Math.abs(translation(early)) > 0);
  assert.ok(Math.abs(translation(early)) < Math.abs(translation(end)) * .02);
  assert.equal(rotation(early), 0);
  assert.ok(Math.abs(rotation(middle)) > 0);
  assert.ok(Math.abs(translation(middle)) < Math.abs(translation(end)) / 2);
  assert.ok(page.sections[0].classes.has('split-open'));
  atProgress(0);
  assert.ok(!page.sections[0].classes.has('split-open'));
});

test('a selection spanning three sections also protects its fully selected middle', () => {
  const page = setup({ count: 3 });
  page.scroll(2000); page.flush();
  const before = positions(page.sections[1]);
  assert.ok(before.some(pose => pose !== restingPose));
  page.select(page.sections[0].parts[0], page.sections[2].parts[1]); page.flush();
  assert.ok(page.sections.every(section => positions(section).every(pose => pose === restingPose)));
  page.select(page.sections[2].parts[1], page.sections[0].parts[0]); page.flush();
  assert.ok(page.sections.every(section => positions(section).every(pose => pose === restingPose)), 'backward selections protect the same range');
  page.select(null); page.flush();
  assert.deepEqual(positions(page.sections[1]), before);
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

test('hero fractures earlier without changing later reading sections or the initial view', () => {
  const heroPage = setup({ hero: true });
  const plainPage = setup();
  assert.ok(positions(heroPage.sections[0]).every(pose => pose === restingPose));
  heroPage.scroll(100); heroPage.flush();
  plainPage.scroll(100); plainPage.flush();
  assert.ok(positions(heroPage.sections[0]).some(pose => pose !== restingPose));
  assert.ok(positions(plainPage.sections[0]).every(pose => pose === restingPose));
  assert.deepEqual(positions(heroPage.sections[1]), positions(plainPage.sections[1]));
  const tallPage = setup({ hero: true, height: 2000 });
  assert.ok(positions(tallPage.sections[0]).every(pose => pose === restingPose), 'a tall viewport must not start with broken hero copy');
});

const verticalTranslation = pose => Number(pose.match(/translate3d\([^,]+,\s*([-\d.]+)/)[1]);
const waterPoses = page => page.proof.parts.map(part => ({ transform: part.style.transform, opacity: part.style.opacity }));

test('proof figures rise as the water enters, settle, and reverse exactly with scroll', () => {
  const page = setup({ water: true });
  const initial = waterPoses(page);
  page.scroll(260); page.flush();
  const middle = waterPoses(page);
  assert.ok(middle.every((pose, index) => verticalTranslation(pose.transform) < verticalTranslation(initial[index].transform)));
  assert.ok(middle.every(pose => Number(pose.opacity) >= .62), 'real figures stay readable while submerged');
  page.scroll(700); page.flush();
  const settled = waterPoses(page);
  assert.ok(settled.every(pose => Math.abs(verticalTranslation(pose.transform)) < 1), 'all figures reach the surface');
  page.scroll(260); page.flush();
  assert.deepEqual(waterPoses(page), middle);
  assert.equal(page.queue.size, 0, 'water does not leave an idle animation loop');
});

test('water geometry is read before all split and figure writes', () => {
  const page = setup({ water: true });
  page.scroll(260); page.flush();
  const firstWrite = page.trace.indexOf('write');
  assert.equal(firstWrite, 3, 'two stable split bounds and one water bound');
  assert.ok(!page.trace.slice(firstWrite).includes('read'));
  assert.ok(!page.trace.includes('child-read'));
});

test('proof remains functional without a water renderer', () => {
  const page = setup({ water: true, rendererAvailable: false });
  page.scroll(700); page.flush();
  assert.ok(waterPoses(page).every(pose => Math.abs(verticalTranslation(pose.transform)) < 1));
  assert.equal(page.waterTrace.length, 0);
});

test('selecting proof text holds every figure at the surface until selection ends', () => {
  const page = setup({ water: true });
  page.scroll(260); page.flush();
  const before = waterPoses(page);
  page.select(page.proof.parts[0], page.proof.parts[3]); page.flush();
  const selected = waterPoses(page);
  assert.ok(selected.every(pose => Math.abs(verticalTranslation(pose.transform)) < 1));
  page.scroll(350); page.flush();
  assert.deepEqual(waterPoses(page), selected);
  page.scroll(260); page.flush();
  page.select(null); page.flush();
  assert.deepEqual(waterPoses(page), before);
});

test('mobile proof has a shorter ascent and keeps its surface destination', () => {
  const page = setup({ water: true });
  const desktop = waterPoses(page);
  page.resize(390); page.flush();
  const mobile = waterPoses(page);
  assert.ok(mobile.every((pose, index) => verticalTranslation(pose.transform) < verticalTranslation(desktop[index].transform)));
  assert.ok(mobile.every(pose => Math.abs(translation(pose.transform)) <= 3));
  page.scroll(700); page.flush();
  assert.ok(waterPoses(page).every(pose => Math.abs(verticalTranslation(pose.transform)) < 1));
});

test('reduced motion clears all proof poses and cancels scheduled rendering', () => {
  const page = setup({ water: true });
  page.scroll(260); page.flush();
  page.scroll(300);
  page.reduced(true);
  assert.equal(page.queue.size, 0);
  for (const part of page.proof.parts) {
    for (const element of [part, part.reflection, part.ripple]) {
      assert.equal(element.style.transform, undefined);
      assert.equal(element.style.opacity, undefined);
    }
  }
  const renders = page.waterTrace.filter(([event]) => event === 'render').length;
  page.scroll(400); page.flush();
  assert.equal(page.waterTrace.filter(([event]) => event === 'render').length, renders);
  page.reduced(false);
  assert.ok(waterPoses(page).every(pose => typeof pose.transform === 'string'));
  const staticPage = setup({ water: true, reduced: true });
  assert.ok(waterPoses(staticPage).every(pose => pose.transform === undefined));
  assert.ok(!staticPage.waterTrace.some(([event]) => event === 'render'));
});

test('hidden and offscreen water does not render or keep work queued', () => {
  const page = setup({ water: true });
  page.scroll(300); page.hidden(true);
  const before = page.waterTrace.filter(([event]) => event === 'render').length;
  page.scroll(400); page.flush();
  assert.equal(page.waterTrace.filter(([event]) => event === 'render').length, before);
  assert.equal(page.queue.size, 0);
  page.hidden(false); page.flush();
  assert.ok(page.waterTrace.filter(([event]) => event === 'render').length > before);
  page.scroll(5000); page.flush();
  const offscreen = page.waterTrace.filter(([event]) => event === 'render').length;
  page.trace.length = 0;
  page.scroll(8000); page.flush();
  assert.equal(page.waterTrace.filter(([event]) => event === 'render').length, offscreen);
  assert.ok(!page.trace.includes('write'));
  assert.equal(page.queue.size, 0);
});
