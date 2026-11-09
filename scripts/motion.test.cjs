const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../motion.js'), 'utf8');

function setup({ reduced = false, count = 2, hero = false, scene: withScene = false, height = 960, rendererAvailable = true, rendererSuccess = true } = {}) {
  let scroll = 0, nextFrame = 0, width = 1280, now = 0;
  let renderSuccess = rendererSuccess, renderReady = rendererSuccess;
  const hasHero = hero || withScene;
  const queue = new Map(), windowEvents = new Map(), documentEvents = new Map();
  const classes = new Set(), trace = [], waterTrace = [];
  const styled = () => ({
    style: new Proxy({
      removeProperty(key) { delete this[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())]; },
      setProperty(key, value) { this[key] = value; },
    }, {
      set(target, key, value) { trace.push('write'); target[key] = value; return true; },
    }),
  });
  const attributed = attributes => ({
    attributes: { ...attributes },
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
  });
  const selection = {
    isCollapsed: true, anchorNode: null, focusNode: null,
    get rangeCount() { return this.isCollapsed ? 0 : 1; },
    getRangeAt(index) {
      assert.equal(index, 0);
      const nodes = proof ? [sections[0], proof, ...sections.slice(1)].filter(Boolean) : sections;
      const ordered = nodes.flatMap(section => [section, ...section.parts,
        ...(section.copies || []).flatMap(copy => [copy, ...copy.children])]);
      const start = ordered.indexOf(this.anchorNode);
      const end = ordered.indexOf(this.focusNode);
      return {
        intersectsNode(node) {
          const first = ordered.indexOf(node);
          const last = ordered.reduce((last, candidate, index) => node.contains?.(candidate) ? index : last, first);
          return first <= Math.max(start, end) && last >= Math.min(start, end);
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
    const sectionClasses = new Set(['split-section']);
    const copies = [];
    const fractureLine = attributed({}), fractureBranches = attributed({});
    const fracture = hasHero && index === 0 ? {
      ...styled(), ...attributed({}), line: fractureLine, branches: fractureBranches,
      querySelector: selector => selector === '[data-fracture-line]' ? fractureLine : fractureBranches,
    } : null;
    return {
      ...styled(), parts, surfaces, copies, fracture, classes: sectionClasses, dataset: { split: hasHero && index === 0 ? 'hero' : 'case' },
      classList: { toggle(name, value) { value ? sectionClasses.add(name) : sectionClasses.delete(name); } },
      querySelectorAll: selector => selector === '[data-drift]' ? parts : surfaces,
      querySelector: selector => selector === '[data-fracture]' ? fracture : null,
      getBoundingClientRect: () => {
        trace.push('read');
        return { left: 64, width: width - 128, height: 700, top: index * 700 - scroll, bottom: 700 + index * 700 - scroll };
      },
      contains: node => parts.includes(node) || copies.some(copy => copy === node || copy.contains(node)),
      append: (...elements) => copies.push(...elements),
      cloneNode() {
        const links = [{ ...attributed({ id: `cta-${index}`, href: '#work', 'data-cta': 'book_call' }), tabIndex: 0 }];
        const clonedSurfaces = [0, 1].map(() => ({ remove() { this.removed = true; } }));
        const children = [...clonedSurfaces, attributed({ id: `title-${index}`, 'data-drift': 'left' }), ...links];
        const cloneClasses = new Set(sectionClasses);
        return {
          ...styled(), ...attributed({ id: `section-${index}`, 'data-split': 'case', 'aria-labelledby': `title-${index}` }),
          children, links, surfaces: clonedSurfaces, classes: cloneClasses,
          classList: {
            add: (...names) => names.forEach(name => cloneClasses.add(name)),
            remove: (...names) => names.forEach(name => cloneClasses.delete(name)),
          },
          querySelectorAll(selector) {
            if (selector === '.split-surface' || selector === '.split-surface, .ice-fracture') return clonedSurfaces.filter(node => !node.removed);
            if (selector === '*') return children.filter(node => !node.removed);
            if (selector === 'a') return links;
            return [];
          },
          contains: node => children.includes(node),
        };
      },
    };
  });
  const proof = withScene ? {
    parts: Array.from({ length: 4 }, (_, index) => {
      const number = {
        ...styled(), textContent: ['300k+', '3×', '20,000', '3'][index],
        getBoundingClientRect() {
          trace.push('child-read');
          return { left: 64 + index * 288, top: 880 - scroll, width: 220, height: 64, bottom: 944 - scroll };
        },
      };
      return {
        ...styled(), dataset: { float: '' }, number,
        querySelector: selector => selector === '.proof-num' ? number : null,
        getBoundingClientRect() {
          trace.push('child-read');
          return { left: 64 + index * 288, top: 880 - scroll, width: 256, height: 180, bottom: 1060 - scroll };
        },
      };
    }),
    contains(node) { return this.parts.includes(node); },
    querySelectorAll(selector) { return selector === '[data-float]' ? this.parts : []; },
    getBoundingClientRect() {
      trace.push('read');
      return { left: 64, width: width - 128, height: 720, top: 720 - scroll, bottom: 1440 - scroll };
    },
  } : null;
  const canvasEvents = new Map();
  const canvas = {
    addEventListener: (name, fn) => canvasEvents.set(name, fn),
    getBoundingClientRect() {
      trace.push('child-read');
      return { left: 0, width, height: 1440, top: -scroll, bottom: 1440 - scroll };
    },
  };
  const sceneClasses = new Set();
  const scene = withScene ? {
    canvas, classes: sceneClasses, floes: [styled(), styled(), styled()],
    classList: { toggle(name, value) { value ? sceneClasses.add(name) : sceneClasses.delete(name); } },
    querySelector: selector => selector === '[data-water-canvas]' ? canvas : null,
    querySelectorAll(selector) { return selector === '[data-floe]' ? this.floes : []; },
    getBoundingClientRect() {
      trace.push('read');
      return { left: 0, width, height: 1440, top: -scroll, bottom: 1440 - scroll };
    },
  } : null;
  const root = { clientWidth: 1280, classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); } } };
  const document = {
    hidden: false, activeElement: null, documentElement: root,
    querySelectorAll: selector => selector === '[data-split]' ? sections : [],
    querySelector: selector => selector === '[data-water-proof]' ? proof : selector === '[data-ice-scene]' ? scene : null,
    addEventListener: (name, fn) => documentEvents.set(name, fn),
  };
  const window = {
    innerHeight: height, get scrollY() { return scroll; }, getSelection: () => selection, matchMedia: () => preference,
    performance: { now: () => now },
    getComputedStyle() { trace.push('font-read'); return { font: '500 64px Instrument Sans', fontSize: '64px', letterSpacing: '-2px' }; },
    requestAnimationFrame(fn) { queue.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => queue.delete(id),
    addEventListener: (name, fn, options) => windowEvents.set(name, { fn, options }),
    createProofWater: rendererAvailable ? target => {
      waterTrace.push(['create', target]);
      return {
        get ready() { return renderReady; },
        configure: layout => waterTrace.push(['configure', layout]),
        render: frame => { waterTrace.push(['render', frame]); return renderSuccess; },
        resize: () => waterTrace.push(['resize']),
        destroy: () => waterTrace.push(['destroy']),
      };
    } : undefined,
  };
  vm.runInNewContext(source, { window, document });
  trace.length = 0;
  return {
    sections, proof, scene, queue, classes, trace, waterTrace, windowEvents,
    scroll(value) { scroll = value; windowEvents.get('scroll').fn(); },
    flush(ms = 1000 / 60) { now += ms; const frames = [...queue.values()]; queue.clear(); for (const frame of frames) frame(now); },
    advance(ms) { const end = now + ms; while (now < end) this.flush(Math.min(1000 / 60, end - now)); },
    settle(limit = 4000) { const end = now + limit; while (queue.size && now < end) this.flush(); assert.equal(queue.size, 0, 'the scene must stop scheduling after its bounded response'); },
    renderer(value) { renderSuccess = value; renderReady = value; },
    contextLost() { renderSuccess = false; renderReady = false; canvasEvents.get('webglcontextlost')(); },
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

test('mobile splits both visual halves with their sheets and keeps the semantic source intact', () => {
  const page = setup();
  page.scroll(400); page.flush();
  const desktop = Math.abs(translation(positions(page.sections[0])[0]));
  page.resize(390); page.flush();
  const section = page.sections[0];
  assert.equal(section.copies.length, 2);
  assert.ok(Math.abs(translation(section.copies[0].style.transform)) < desktop / 2);
  assert.ok(page.trace.includes('child-read'), 'resize refreshes local pivots');
  page.scroll(5000); page.flush();
  assert.ok(positions(section).every(pose => pose === restingPose));
  assert.ok(section.classes.has('split-rendered'));
  section.copies.forEach((copy, side) => {
    const pose = copy.style.transform;
    assert.ok(Math.abs(translation(pose)) <= 52);
    assert.equal(rotation(pose), 0);
    assert.ok(side === 0 ? translation(pose) < 0 : translation(pose) > 0);
    assert.equal(pose, section.surfaces[side].style.transform, 'each visible half travels with its own sheet');
  });
  page.resize(1280); page.flush();
  assert.ok(!section.classes.has('split-rendered'));
  assert.equal(section.parts[0].style.transform, section.surfaces[0].style.transform, 'desktop restores the original two-sided layout');
  assert.ok(translation(section.parts[0].style.transform) < 0);
  page.resize(390); page.flush();
  assert.equal(section.copies.length, 2, 'responsive changes reuse the same visual copies');
});

test('mobile copies preserve touch links without duplicate IDs or keyboard stops', () => {
  const page = setup();
  page.resize(390); page.flush();
  page.scroll(400); page.flush();
  const section = page.sections[0];
  for (const copy of section.copies) {
    assert.equal(copy.attributes['aria-hidden'], 'true');
    for (const node of [copy, ...copy.querySelectorAll('*')]) {
      assert.equal(node.attributes.id, undefined);
      assert.equal(node.attributes['data-split'], undefined);
    }
    for (const link of copy.links) {
      assert.equal(link.tabIndex, -1);
      assert.equal(link.attributes.href, '#work');
      assert.equal(link.attributes['data-cta'], 'book_call');
    }
  }
  page.focus(section.copies[0].links[0]);
  assert.ok(section.classes.has('split-rendered'), 'touch focus leaves the visible linked half in place');
  page.focus(section.parts[0]);
  assert.ok(!section.classes.has('split-rendered'), 'keyboard focus restores the semantic source and its real control');
  assert.ok(section.surfaces.every(surface => surface.style.transform === restingPose));
  page.focus(null);
  assert.ok(section.classes.has('split-rendered'));
  page.reduced(true);
  assert.ok(!section.classes.has('split-rendered'));
  assert.ok(section.copies.every(copy => copy.style.transform === undefined));
});

test('selecting a visible mobile half freezes its pose until selection ends', () => {
  const page = setup();
  page.resize(390); page.flush();
  page.scroll(350); page.flush();
  const section = page.sections[0];
  const before = section.copies.map(copy => copy.style.transform);
  page.select(section.copies[0].links[0]); page.flush();
  page.scroll(500); page.flush();
  assert.deepEqual(section.copies.map(copy => copy.style.transform), before);
  assert.ok(section.classes.has('split-rendered'));
  page.select(null); page.flush();
  assert.notDeepEqual(section.copies.map(copy => copy.style.transform), before);
});

test('selecting original text across mobile sections restores all enclosed sources', () => {
  const page = setup({ count: 3 });
  page.resize(390); page.flush();
  page.scroll(1600); page.flush();
  assert.ok(page.sections[1].classes.has('split-rendered'));
  page.select(page.sections[0].parts[0], page.sections[2].parts[1]); page.flush();
  assert.ok(page.sections.every(section => !section.classes.has('split-rendered')));
  assert.ok(page.sections.every(section => section.surfaces.every(surface => surface.style.transform === restingPose)));
});

test('mobile hero starts intact and opens centrally while its heading is still in view', () => {
  const page = setup({ hero: true });
  page.resize(390); page.flush();
  const section = page.sections[0];
  assert.ok(!section.classes.has('split-rendered'));
  page.scroll(47); page.flush();
  assert.ok(!section.classes.has('split-rendered'));
  page.scroll(100); page.flush();
  assert.ok(section.classes.has('split-rendered'));
  assert.ok(translation(section.copies[0].style.transform) < 0);
  assert.ok(translation(section.copies[1].style.transform) > 0);
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
  assert.ok(heroPage.sections[0].copies.some(copy => copy.style.transform !== restingPose));
  assert.ok(positions(plainPage.sections[0]).every(pose => pose === restingPose));
  assert.deepEqual(positions(heroPage.sections[1]), positions(plainPage.sections[1]));
  const tallPage = setup({ hero: true, height: 2000 });
  assert.ok(positions(tallPage.sections[0]).every(pose => pose === restingPose), 'a tall viewport must not start with broken hero copy');
});

const focalPoses = page => page.sections[0].copies.map(copy => copy.style.transform);
const renderedFrames = page => page.waterTrace.filter(([event]) => event === 'render').map(([, value]) => value);
const lastFrame = page => renderedFrames(page).at(-1);
const sourceNumbers = page => page.proof.parts.map(part => part.number.textContent);
const close = (actual, expected, tolerance = .001) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} should be close to ${expected}`);

test('one shared renderer receives scene geometry and the real proof figures', () => {
  const page = setup({ scene: true });
  const creates = page.waterTrace.filter(([event]) => event === 'create');
  assert.equal(creates.length, 1);
  assert.equal(creates[0][1], page.scene.canvas);
  const layout = page.waterTrace.find(([event]) => event === 'configure')[1];
  assert.ok(layout.width > 0 && layout.height > layout.heroHeight && layout.heroHeight > 0);
  assert.deepEqual(Array.from(layout.figures, figure => figure.text), sourceNumbers(page));
  assert.ok(layout.figures.every(figure => figure.y >= layout.heroHeight && figure.width > 0 && figure.font.includes('Instrument Sans')));
  assert.equal(page.queue.size, 0, 'loading an untouched scene does not start an idle loop');
  page.scroll(500); page.settle();
  assert.equal(page.waterTrace.filter(([event]) => event === 'create').length, 1);
});

test('the focal crack propagates before the two slabs release', () => {
  const page = setup({ scene: true });
  const section = page.sections[0];
  assert.ok(section.fracture.line.attributes.d.startsWith('M'));
  assert.ok(section.fracture.branches.attributes.d.includes(' l'));
  page.scroll(100); page.settle();
  assert.notEqual(section.fracture.style.clipPath, 'inset(0 0 100% 0)');
  assert.ok(Number(section.fracture.style.opacity) > 0);
  assert.ok(!section.classes.has('split-released'));
  assert.ok(!section.classes.has('split-rendered'));
  page.scroll(500); page.settle();
  assert.ok(section.classes.has('split-released'));
  assert.ok(section.classes.has('split-rendered'));
  assert.ok(translation(focalPoses(page)[0]) < 0 && translation(focalPoses(page)[1]) > 0);
  assert.ok(focalPoses(page).some(pose => Math.abs(rotation(pose)) > 0));
  assert.ok(positions(section).every(pose => pose === restingPose), 'the semantic source stays intact');
  page.resize(390); page.settle();
  assert.equal(section.copies.length, 2);
  assert.ok(translation(focalPoses(page)[0]) < 0 && translation(focalPoses(page)[1]) > 0);
  assert.ok(focalPoses(page).every(pose => Math.abs(translation(pose)) <= 52));
  assert.ok(focalPoses(page).every(pose => Math.abs(rotation(pose)) > 0), 'mobile floes retain their restrained rocking motion');
});

test('slabs and water continue responding after scroll stops, then become idle', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(150);
  const early = focalPoses(page), earlyFrame = lastFrame(page);
  page.advance(350);
  assert.notDeepEqual(focalPoses(page), early, 'motion must carry momentum beyond the input event');
  assert.ok(lastFrame(page).time > earlyFrame.time, 'water time advances while scroll is stationary');
  assert.ok(lastFrame(page).fracture > earlyFrame.fracture);
  page.settle();
  const frames = renderedFrames(page).length;
  page.advance(1000);
  assert.equal(renderedFrames(page).length, frames);
});

test('contact activity tapers and draws an exact zero before idle even between render ticks', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(2500);
  assert.ok(lastFrame(page).activity > 0 && lastFrame(page).activity < 1, 'contact disturbances fade during the final part of the response');
  page.flush(490);
  assert.ok(lastFrame(page).activity > 0);
  const before = renderedFrames(page).length;
  // The final frame arrives only 10ms after a positive-activity draw, inside
  // the normal 32ms render cap. It must still clear the remaining disturbances.
  page.flush(10);
  assert.equal(renderedFrames(page).length, before + 1);
  assert.equal(lastFrame(page).activity, 0);
  assert.equal(page.queue.size, 0);
  page.advance(1000);
  assert.equal(renderedFrames(page).length, before + 1);
});

test('reversing an active scene retargets continuously and reaches the same settled destination', () => {
  const page = setup({ scene: true });
  page.scroll(400); page.settle();
  const destination = focalPoses(page), rises = Array.from(lastFrame(page).rises);
  page.scroll(650); page.advance(120);
  const beforeReverse = focalPoses(page);
  page.scroll(400); page.flush(1);
  const afterReverse = focalPoses(page);
  assert.ok(afterReverse.every((pose, i) => Math.abs(translation(pose) - translation(beforeReverse[i])) < 5), 'reversal must not teleport to its target');
  page.settle();
  focalPoses(page).forEach((pose, i) => close(translation(pose), translation(destination[i])));
  Array.from(lastFrame(page).rises).forEach((rise, i) => close(rise, rises[i]));
});

test('scene frames use cached typography and child geometry until a resize', () => {
  const page = setup({ scene: true });
  page.scroll(450); page.flush();
  const firstWrite = page.trace.indexOf('write');
  assert.equal(firstWrite, 4, 'two stable section bounds, the scene, and proof are read first');
  assert.ok(!page.trace.slice(firstWrite).includes('read'));
  page.advance(500);
  assert.ok(!page.trace.includes('child-read'));
  assert.ok(!page.trace.includes('font-read'));
  assert.equal(page.waterTrace.filter(([event]) => event === 'configure').length, 1);
  page.resize(390); page.flush();
  assert.ok(page.trace.includes('child-read'));
  assert.ok(page.trace.includes('font-read'));
  assert.equal(page.waterTrace.filter(([event]) => event === 'configure').length, 2);
});

test('numbers remain available when rendering is absent, unsuccessful, or lost', () => {
  const absent = setup({ scene: true, rendererAvailable: false });
  absent.scroll(500); absent.settle();
  assert.ok(!absent.scene.classes.has('scene-rendered'));
  assert.deepEqual(sourceNumbers(absent), ['300k+', '3×', '20,000', '3']);
  const failed = setup({ scene: true, rendererSuccess: false });
  assert.ok(!failed.scene.classes.has('scene-rendered'));
  failed.renderer(true); failed.scroll(400); failed.advance(100);
  assert.ok(failed.scene.classes.has('scene-rendered'));
  failed.renderer(false); failed.advance(100);
  assert.ok(!failed.scene.classes.has('scene-rendered'));
  failed.renderer(true); failed.advance(100);
  assert.ok(failed.scene.classes.has('scene-rendered'));
  failed.contextLost();
  assert.ok(!failed.scene.classes.has('scene-rendered'), 'context loss restores DOM numbers immediately');
  assert.deepEqual(sourceNumbers(failed), sourceNumbers(absent));
});

test('source focus and selection restore readable content without waiting for a spring', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(400);
  const section = page.sections[0];
  assert.ok(section.classes.has('split-rendered'));
  page.focus(section.parts[0]);
  assert.ok(!section.classes.has('split-rendered'));
  assert.ok(section.surfaces.every(surface => surface.style.transform === restingPose));
  page.focus(null); page.advance(400);
  assert.ok(section.classes.has('split-rendered'));
  page.select(page.proof.parts[0], page.proof.parts[3]); page.flush();
  assert.ok(!page.scene.classes.has('scene-rendered'), 'selecting facts reveals the real text');
  assert.equal(lastFrame(page).showFigures, false);
  page.select(null); page.advance(100);
  assert.ok(page.scene.classes.has('scene-rendered'));
});

test('selecting an animated focal copy freezes its actual pose during further scrolling', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(400);
  const section = page.sections[0];
  page.select(section.copies[0].links[0]); page.flush();
  const selected = focalPoses(page);
  page.scroll(650); page.advance(500);
  assert.deepEqual(focalPoses(page), selected);
  assert.ok(section.classes.has('split-rendered'));
  page.select(null); page.settle();
  assert.notDeepEqual(focalPoses(page), selected);
});

test('reduced motion immediately cancels the scene and restores its static source', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(300);
  page.reduced(true);
  assert.equal(page.queue.size, 0);
  assert.ok(!page.scene.classes.has('scene-rendered'));
  assert.ok(!page.sections[0].classes.has('split-rendered'));
  assert.ok(positions(page.sections[0]).every(pose => pose === undefined));
  assert.ok(page.waterTrace.some(([event]) => event === 'destroy'));
  const count = renderedFrames(page).length;
  page.scroll(600); page.advance(1000);
  assert.equal(renderedFrames(page).length, count);
  page.reduced(false);
  assert.ok(page.scene.classes.has('scene-rendered'));
  const staticPage = setup({ scene: true, reduced: true });
  assert.equal(staticPage.waterTrace.length, 0);
  assert.equal(staticPage.queue.size, 0);
  assert.deepEqual(sourceNumbers(staticPage), sourceNumbers(page));
});

test('hidden or offscreen scenes stop rendering and resume safely after a long suspension', () => {
  const page = setup({ scene: true });
  page.scroll(500); page.advance(200);
  page.hidden(true);
  assert.equal(page.queue.size, 0);
  const count = renderedFrames(page).length;
  page.scroll(650); page.flush(120000);
  assert.equal(renderedFrames(page).length, count);
  page.hidden(false); page.advance(100);
  assert.ok(renderedFrames(page).length > count);
  assert.ok(focalPoses(page).every(pose => !/NaN|Infinity/.test(pose) && Math.abs(translation(pose)) <= 252));
  page.scroll(5000); page.flush();
  assert.equal(page.queue.size, 0);
  const offscreen = renderedFrames(page).length;
  page.advance(1000);
  assert.equal(renderedFrames(page).length, offscreen);
  page.scroll(400); page.settle();
  assert.ok(renderedFrames(page).length > offscreen);
  assert.ok(lastFrame(page).rises.every(rise => Number.isFinite(rise) && rise >= 0 && rise <= 1));
});
