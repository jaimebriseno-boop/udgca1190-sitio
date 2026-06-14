// config.js — constants for the Dengue Forecast static viewer.
// No DOM, no Plotly, no side effects. Pure exported constants.

// Default UI state used on first load and as fallback when the URL query
// (?lang=&state=&origin=&view=&embed=1) omits a value.
export const DEFAULTS = {
  lang: 'es',          // 'es' (default) | 'en'
  order: 'rank_tasa',  // 'rank_tasa' (incidence) | 'rank_casos' (cases)
  view: 'single',      // 'single' | 'grid'
  selected: 'national',// 'national' | <Number cve> (1..32)
  horizons: [1, 3, 6, 12],
};

// Where the three JSON files live, RELATIVE to index.html (offline-portable).
// data.js fetches `${DATA_BASE}/meta.json`, etc.
export const DATA_BASE = 'data';

// Forecast horizons this tool understands (months ahead of the origin T).
export const HORIZONS = [1, 3, 6, 12];

// Default x-range focus for the single panel (full history is still reachable
// by zoom/pan); chart.js may use this as the initial visible window.
export const FOCUS_RANGE = ['2018-01', '2026-12'];

// Bar opacity encoding for observed cases relative to the cutoff T.
export const OBS_OPACITY = {
  known: 0.55,    // months <= T ("known" history)
  future: 0.18,   // months  > T ("revealed/future", hidden when showObsAfter=false)
};
