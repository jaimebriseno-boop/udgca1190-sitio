import test from 'node:test';
import assert from 'node:assert/strict';
import { renderGrid, renderMain } from '../public/herramientas/dengue-forecast/app/js/chart.js';
import { render, setOrigin } from '../public/herramientas/dengue-forecast/app/js/state.js';

// Minimal DOM at the Plotly boundary; tests exercise the actual application code.
class Element {
  children = [];
  dataset = {};
  style = {};
  className = '';
  classList = { toggle() {} };
  append(...nodes) { nodes.forEach((node) => this.insertBefore(node, null)); }
  insertBefore(node, before) {
    node.remove();
    const index = before ? this.children.indexOf(before) : this.children.length;
    this.children.splice(index, 0, node);
    node.parent = this;
  }
  remove() {
    if (this.parent) {
      this.parent.children.splice(this.parent.children.indexOf(this), 1);
      this.parent = null;
    }
  }
  querySelector(selector) { return this.children.find((e) => e.className === selector.slice(1)) || null; }
}

function install(t) {
  const grid = new Element();
  const chart = new Element();
  const calls = [];
  const purged = [];
  const frames = [];
  const originals = Object.fromEntries(['document', 'window', 'requestAnimationFrame'].map(k => [k, globalThis[k]]));
  globalThis.document = { getElementById: (id) => ({ grid, chart }[id] || null), createElement: () => new Element() };
  globalThis.window = { Plotly: {
    react(div, data, layout, config) { calls.push({ div, data, layout, config }); return Promise.resolve(); },
    purge(div) { purged.push(div); },
  } };
  globalThis.requestAnimationFrame = fn => frames.push(fn);
  t.after(() => {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return { grid, chart, calls, purged, frames };
}

const options = (sel) => ({
  sel, panelTitle: String(sel), meta: {}, originYM: '2022-01', lang: 'es',
  observed: { months: ['2021-12', '2022-01', '2022-02'], casos: [10, 20, 30] },
  forecast: [{ h: 1, td: '2022-02', q05: 5, q50: 25, q95: 50, y: 30 }],
  horizons: new Set([1]), showBand: true, showObsAfter: true,
});

test('33 grid panels retain their Plotly nodes and traces on updates and reordering', async t => {
  const { grid, calls, purged } = install(t);
  const panels = ['national', ...Array.from({ length: 32 }, (_, i) => i + 1)].map(options);
  await renderGrid('grid', panels);
  const cells = new Map(grid.children.map(cell => [cell.dataset.region, cell]));
  const initial = calls.slice();
  await renderGrid('grid', panels);
  assert.equal(grid.children.length, 33);
  for (let i = 0; i < 33; i++) {
    assert.equal(calls[i + 33].div, initial[i].div);
    assert.deepEqual(calls[i + 33].data, initial[i].data);
  }
  await renderGrid('grid', [panels[0], ...panels.slice(1).reverse()]);
  assert.deepEqual(grid.children.map(c => c.dataset.region), ['national', ...panels.slice(1).reverse().map(p => String(p.sel))]);
  for (const cell of grid.children) assert.equal(cell, cells.get(cell.dataset.region));
  assert.equal(purged.length, 0);
});

test('removed regions purge the nested Plotly div, not its wrapper', async t => {
  const { grid, purged } = install(t);
  await renderGrid('grid', [options('national'), options(14)]);
  const removedPlot = grid.children[1].querySelector('.grid-cell__plot');
  await renderGrid('grid', [options('national')]);
  assert.deepEqual(purged, [removedPlot]);
  assert.equal(grid.children.length, 1);
});

test('rapid state updates collapse into one frame and wait for Plotly completion', async t => {
  const { frames, chart } = install(t);
  let finish;
  let count = 0;
  window.Plotly.react = () => { count++; return new Promise(resolve => { finish = resolve; }); };
  for (let i = 0; i < 20; i++) setOrigin(i);
  assert.equal(frames.length, 1);
  const drawing = frames.shift()();
  assert.equal(count, 1);
  render(); render();
  assert.equal(frames.length, 0);
  finish(); await drawing;
  assert.equal(frames.length, 1);
  const next = frames.shift()();
  finish(); await next;
  assert.equal(count, 2);
  assert.equal(chart.style.display, '');
});

test('main chart exposes completion to the render scheduler', async t => {
  install(t);
  assert.ok(renderMain('chart', options('national')) instanceof Promise);
});
