// data.js — DATA layer for the Dengue Forecast static viewer.
// Fetches the three JSON files (relative paths, offline-portable), caches them,
// and exposes the getters in the JS MODULE API CONTRACT. No DOM, no Plotly.
// Robust to missing keys: getters return [] / sensible defaults, never throw.

import { DATA_BASE } from './config.js';

// --- module-level cache -----------------------------------------------------
let _meta = null;
let _cases = null;
let _forecasts = null;
let _months = null;       // ['1985-01', ...] computed once from cases axis
let _monthIndex = null;   // Map 'YYYY-MM' -> index, for O(1) ymIndex()
let _loadPromise = null;  // de-dupes concurrent loadData() calls

// Add `n` whole months to a 'YYYY-MM' string -> 'YYYY-MM'.
function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const yy = Math.floor(total / 12);
  const mm = (total % 12) + 1;
  return `${yy}-${String(mm).padStart(2, '0')}`;
}

// Build the consecutive month list from cases.start_month + months_count.
function buildMonths(cases) {
  const months = [];
  if (!cases || !cases.start_month) return months;
  const count = Number.isFinite(cases.months_count)
    ? cases.months_count
    : (Array.isArray(cases.national) ? cases.national.length : 0);
  let ym = cases.start_month;
  for (let i = 0; i < count; i++) {
    months.push(ym);
    ym = addMonths(ym, 1);
  }
  return months;
}

async function fetchJSON(url) {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  return res.json();
}

/**
 * loadData(base='data') — fetch the 3 JSON files once, cache, return
 * {meta, cases, forecasts}. Concurrent/repeat calls reuse the same promise.
 */
export async function loadData(base = DATA_BASE) {
  if (_meta && _cases && _forecasts) {
    return { meta: _meta, cases: _cases, forecasts: _forecasts };
  }
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    const [meta, cases, forecasts] = await Promise.all([
      fetchJSON(`${base}/meta.json`),
      fetchJSON(`${base}/cases.json`),
      fetchJSON(`${base}/forecasts.json`),
    ]);
    _meta = meta || {};
    _cases = cases || {};
    _forecasts = forecasts || {};
    _months = buildMonths(_cases);
    _monthIndex = new Map(_months.map((ym, i) => [ym, i]));
    return { meta: _meta, cases: _cases, forecasts: _forecasts };
  })();

  try {
    return await _loadPromise;
  } catch (err) {
    _loadPromise = null; // allow a retry after a failed load
    throw err;
  }
}

// --- raw accessors ----------------------------------------------------------
export function getMeta() { return _meta || {}; }
export function getCases() { return _cases || {}; }
export function getForecasts() { return _forecasts || {}; }

/** getMonths() — the cases month axis ['1985-01', ...]. */
export function getMonths() { return _months || []; }

/** getOrigins() — the forecast origins ['2015-01', ...]. */
export function getOrigins() {
  return (_forecasts && Array.isArray(_forecasts.origins)) ? _forecasts.origins : [];
}

/**
 * getForwardOrigin() — the YYYY-MM of the LIVE forward forecast origin, or null.
 * Read from meta.forward.origin (the genuine out-of-sample origin whose rows
 * carry forward:true / y:null). Used to switch the view into "forward mode".
 */
export function getForwardOrigin() {
  const fwd = _meta && _meta.forward;
  return (fwd && typeof fwd.origin === 'string') ? fwd.origin : null;
}

/**
 * getStateMeta(orderKey) — meta.states re-sorted ascending by the given rank
 * key ('rank_tasa' | 'rank_casos'). National is handled separately by callers.
 * Returns a NEW array (does not mutate the cached meta). Unknown key -> default.
 */
export function getStateMeta(orderKey) {
  const states = (_meta && Array.isArray(_meta.states)) ? _meta.states : [];
  const key = (orderKey === 'rank_casos') ? 'rank_casos' : 'rank_tasa';
  return states.slice().sort((a, b) => {
    const av = Number.isFinite(a && a[key]) ? a[key] : Infinity;
    const bv = Number.isFinite(b && b[key]) ? b[key] : Infinity;
    return av - bv;
  });
}

// Normalize a selection ('national' | 'National' | 0 | cve number/string) to a
// canonical form: 'national' or a positive integer cve.
function normSel(sel) {
  if (sel === 'national' || sel === 'National' || sel === 0 || sel === '0') {
    return 'national';
  }
  const n = Number(sel);
  return Number.isFinite(n) && n > 0 ? n : 'national';
}

/**
 * getObserved(sel) — observed monthly cases for a selection.
 * sel = 'national' | Number(cve). Returns {months:[YYYY-MM], casos:[int]}.
 * Missing selection -> {months:[...], casos:[]} (months still provided).
 */
export function getObserved(sel) {
  const months = getMonths();
  const s = normSel(sel);
  let casos = [];
  if (_cases) {
    if (s === 'national') {
      casos = Array.isArray(_cases.national) ? _cases.national : [];
    } else if (_cases.states && Array.isArray(_cases.states[String(s)])) {
      casos = _cases.states[String(s)];
    }
  }
  return { months, casos };
}

/**
 * getForecast(sel, originYM) — forecast rows for a selection at an origin.
 * Returns [{h,td,q05,q50,q95,y,envelope?}, ...] sorted by h, or [] if missing.
 */
export function getForecast(sel, originYM) {
  if (!_forecasts || !originYM) return [];
  const s = normSel(sel);
  let rows = null;
  if (s === 'national') {
    rows = _forecasts.national && _forecasts.national[originYM];
  } else {
    const byState = _forecasts.by_state && _forecasts.by_state[String(s)];
    rows = byState && byState[originYM];
  }
  if (!Array.isArray(rows)) return [];
  return rows.slice().sort((a, b) => (a.h || 0) - (b.h || 0));
}

/**
 * ymIndex(ym) — index of a 'YYYY-MM' string in the cases month axis.
 * Returns -1 if not present (e.g. a target month beyond the freeze).
 */
export function ymIndex(ym) {
  if (!_monthIndex) return -1;
  return _monthIndex.has(ym) ? _monthIndex.get(ym) : -1;
}
