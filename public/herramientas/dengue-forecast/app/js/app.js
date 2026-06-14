// app.js -- bootstrap. Loads data, reads URL query, builds controls, does the first
// render, and keeps the chart resized + iframe height in sync.

import { DATA_BASE } from './config.js';
import { loadData, getOrigins } from './data.js';
import { STATE, render, onAfterRender } from './state.js';
import { buildControls, refreshAll, applyStaticStrings, populateStateSelect } from './controls.js';

// ---------------------------------------------------------------------------
// URL query -> initial STATE overrides
//   ?lang=es|en  &state=national|<cve>  &origin=<YYYY-MM>|<index>
//   &view=single|grid  &embed=1
// ---------------------------------------------------------------------------

function applyQuery() {
  let params;
  try {
    params = new URLSearchParams(window.location.search || '');
  } catch (e) {
    params = new URLSearchParams('');
  }

  const lang = params.get('lang');
  if (lang === 'es' || lang === 'en') STATE.lang = lang;

  const state = params.get('state');
  if (state) {
    if (state === 'national' || Number(state) === 0) STATE.selected = 'national';
    else if (Number.isFinite(Number(state))) STATE.selected = Number(state);
  }

  const view = params.get('view');
  if (view === 'single' || view === 'grid') STATE.view = view;

  // origin: accept either an index or a YYYY-MM string. Default = an illustrative
  // origin (full h1/h3/h6/h12 fan projecting into the 2024 peak); the most recent
  // origins only carry h=1 (longer targets exceed the data freeze), so they make a
  // poor first impression. Falls back to most-recent if those origins are absent.
  const origins = getOrigins() || [];
  let idx = origins.length ? origins.length - 1 : 0;
  for (const ym of ['2024-01', '2023-12', '2024-03']) {
    const f = origins.indexOf(ym);
    if (f >= 0) { idx = f; break; }
  }
  const originParam = params.get('origin');
  if (originParam) {
    if (/^\d+$/.test(originParam)) {
      const n = Number(originParam);
      if (n >= 0 && n < origins.length) idx = n;
    } else {
      const found = origins.indexOf(originParam);
      if (found >= 0) idx = found;
    }
  }
  STATE.originIdx = idx;

  // embed=1 -> hide header chrome via body class
  if (params.get('embed') === '1') {
    document.body.classList.add('embed');
  }
}

// ---------------------------------------------------------------------------
// iframe height auto-size + responsive resize
// ---------------------------------------------------------------------------

function postHeight() {
  try {
    const h = document.body.scrollHeight;
    window.parent.postMessage({ type: 'dengue-height', height: h }, '*');
  } catch (e) { /* not embedded / cross-origin restricted */ }
}

// Resize a Plotly div only if it is initialized AND currently displayed.
// (Plotly rejects with "Resize must be passed a displayed plot div element"
//  when the div is display:none -- e.g. #chart while the grid view is active.)
function safeResize(div) {
  if (!div || !window.Plotly) return;
  // _fullLayout => Plotly is mounted; offsetParent !== null => actually visible.
  if (!div._fullLayout || div.offsetParent === null) return;
  if (div.offsetWidth === 0 || div.offsetHeight === 0) return;
  try {
    const p = window.Plotly.Plots.resize(div);
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* noop */ }
}

function wireResize() {
  const chart = document.getElementById('chart');
  if (chart && typeof ResizeObserver !== 'undefined' && window.Plotly) {
    const ro = new ResizeObserver(() => {
      safeResize(chart);
      postHeight();
    });
    ro.observe(chart);
  }
  // also handle window resize for grid panels
  let raf = null;
  window.addEventListener('resize', () => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      safeResize(document.getElementById('chart'));
      const grid = document.getElementById('grid');
      if (grid && window.Plotly) {
        grid.querySelectorAll('.grid-cell__plot').forEach((d) => safeResize(d));
      }
      postHeight();
    });
  });
}

// ---------------------------------------------------------------------------
// bootstrap
// ---------------------------------------------------------------------------

async function boot() {
  // seed defaults (STATE already initialized from DEFAULTS in state.js)
  try {
    await loadData(DATA_BASE || 'data');
  } catch (e) {
    console.error('loadData failed', e);
    const chart = document.getElementById('chart');
    if (chart) {
      chart.textContent = (STATE.lang === 'en')
        ? 'Could not load data files. Serve the folder over HTTP (not file://).'
        : 'No se pudieron cargar los datos. Sirve la carpeta por HTTP (no file://).';
      chart.classList.add('warn');
    }
    return;
  }

  // map default origin to most-recent now that origins are known
  const origins = getOrigins() || [];
  STATE.originIdx = origins.length ? origins.length - 1 : 0;

  applyQuery();

  // render after every state change -> keep active classes + iframe height fresh
  onAfterRender(() => {
    refreshAll();
    postHeight();
  });

  buildControls();
  // ensure select / labels reflect the (possibly query-overridden) lang + selection
  applyStaticStrings();
  populateStateSelect();
  refreshAll();

  render();
  wireResize();

  // a deferred resize after layout settles (fonts/flex), plus height ping
  setTimeout(() => {
    safeResize(document.getElementById('chart'));
    postHeight();
  }, 120);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
