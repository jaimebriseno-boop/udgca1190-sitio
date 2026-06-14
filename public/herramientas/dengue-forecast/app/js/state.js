// state.js -- single STATE object + setters. Each setter mutates STATE then calls
// render(), which reads the data layer and drives chart.renderMain / chart.renderGrid
// plus the surrounding DOM (#originLabel, #caveat, #legend, #freezeNote).

import { DEFAULTS } from './config.js';
import { t } from './i18n.js';
import {
  getMeta, getOrigins, getStateMeta, getObserved, getForecast, getForwardOrigin,
} from './data.js';
import { renderMain, renderGrid } from './chart.js';

// ---------------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------------

export const STATE = {
  view: DEFAULTS.view,                 // 'single' | 'grid'
  selected: DEFAULTS.selected,         // 'national' | Number(cve)
  originIdx: 0,                        // index into getOrigins(); fixed up in init()
  horizons: new Set(DEFAULTS.horizons), // Set<number>
  emphasis: null,                      // emphasized horizon number or null
  showBand: true,
  showObsAfter: true,
  order: DEFAULTS.order,               // 'rank_tasa' | 'rank_casos'
  lang: DEFAULTS.lang,                 // 'es' | 'en'
};

// callers (controls.js / app.js) can register a hook that runs after every render
// (used for iframe height postMessage + active-class refresh).
let afterRenderHook = null;
export function onAfterRender(fn) { afterRenderHook = fn; }

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function currentOriginYM() {
  const origins = getOrigins() || [];
  if (!origins.length) return null;
  let idx = STATE.originIdx;
  if (idx < 0) idx = 0;
  if (idx > origins.length - 1) idx = origins.length - 1;
  return origins[idx];
}

function selName(sel, lang) {
  const meta = getMeta() || {};
  if (sel === 'national' || sel === 0 || sel === '0') {
    const nat = meta.national || {};
    return lang === 'en' ? (nat.nombre_en || nat.nombre || 'National')
                         : (nat.nombre || nat.nombre_en || 'Nacional');
  }
  const states = (meta.states || []);
  const st = states.find((s) => Number(s.cve) === Number(sel));
  if (!st) return String(sel);
  return lang === 'en' ? (st.nombre_en || st.nombre) : (st.nombre || st.nombre_en);
}

function isNationalSel() {
  return STATE.selected === 'national' || STATE.selected === 0 || STATE.selected === '0';
}

// "forward mode": the current origin is meta.forward.origin -> the genuine
// out-of-sample live forecast (rows have forward:true / y:null).
function isForwardOrigin(originYM) {
  const fwd = getForwardOrigin();
  return !!fwd && originYM === fwd;
}

// ---------------------------------------------------------------------------
// DOM side-effects (guarded; never throw if an element is absent)
// ---------------------------------------------------------------------------

function updateOriginLabel(originYM, isForward) {
  // #originLabel is an <output> that shows the bare cutoff YYYY-MM (the
  // "Datos hasta"/"Data up to" wording lives in the adjacent control label).
  // In forward mode we append "· pronóstico vigente / live forecast".
  const el = document.getElementById('originLabel');
  if (!el) return;
  el.textContent = '';
  el.appendChild(document.createTextNode(originYM || '—'));
  if (isForward) {
    const tag = document.createElement('span');
    tag.className = 'origin-live-tag';
    tag.textContent = ' · ' + t(STATE.lang, 'liveTag');
    el.appendChild(tag);
    el.classList.add('is-live');
  } else {
    el.classList.remove('is-live');
  }
}

// Live forward-forecast banner: shown ONLY on the forward origin, using
// meta.forward.note_es / note_en. Visually distinct (.live) from the .warn
// national-band caveat, and independent of the selected region.
function updateLiveCaveat(isForward) {
  const el = document.getElementById('liveCaveat');
  if (!el) return;
  if (isForward) {
    const fwd = (getMeta() || {}).forward || {};
    const note = STATE.lang === 'en'
      ? (fwd.note_en || fwd.note_es || '')
      : (fwd.note_es || fwd.note_en || '');
    setCalloutText(el, '.callout-title', t(STATE.lang, 'liveTitle') + ':');
    setCalloutText(el, '.live-text', note);
    el.hidden = false;
    el.style.display = '';
  } else {
    el.hidden = true;
    el.style.display = 'none';
  }
}

// Write into a child element if it exists (real index.html nests text spans
// under .callout titles); otherwise fall back to the container's textContent.
function setCalloutText(container, childSelector, text) {
  if (!container) return;
  const child = childSelector ? container.querySelector(childSelector) : null;
  if (child) child.textContent = text;
  else container.textContent = text;
}

function updateCaveat() {
  const el = document.getElementById('caveat');
  if (!el) return;
  const meta = getMeta() || {};
  const nat = meta.national || {};
  if (isNationalSel()) {
    const note = STATE.lang === 'en'
      ? (nat.band_note_en || nat.band_note_es || '')
      : (nat.band_note_es || nat.band_note_en || '');
    // translate the static title span too, if present
    setCalloutText(el, '.callout-title', t(STATE.lang, 'caveatTitle') + ':');
    setCalloutText(el, '.caveat-text', note);
    el.hidden = false;
    el.style.display = '';
  } else {
    el.hidden = true;
    el.style.display = 'none';
  }
}

function updateFreezeNote() {
  const el = document.getElementById('freezeNote');
  if (!el) return;
  const meta = getMeta() || {};
  const note = STATE.lang === 'en'
    ? (meta.freeze_note_en || meta.freeze_note_es || '')
    : (meta.freeze_note_es || meta.freeze_note_en || '');
  setCalloutText(el, '.callout-title', t(STATE.lang, 'freezeTitle') + ':');
  setCalloutText(el, '.freeze-text', note);
}

// Rebuild the legend from i18n + the current selection. Uses the swatch classes
// the stylesheet expects (legend-swatch--obs/median/band/cutoff) so theme.css
// styles them; the band label becomes "additive" when national is selected.
function updateLegend() {
  const el = document.getElementById('legend');
  if (!el) return;
  const lang = STATE.lang;
  const bandLabel = isNationalSel() ? t(lang, 'leg_band_additive') : t(lang, 'leg_band');

  const items = [
    { cls: 'obs', label: t(lang, 'leg_observed') },
    { cls: 'median', label: t(lang, 'leg_median') },
    { cls: 'band', label: bandLabel },
    { cls: 'cutoff', label: t(lang, 'leg_cutoff') },
  ];

  el.innerHTML = '';
  for (const it of items) {
    const wrap = document.createElement('span');
    wrap.className = 'legend-item';
    const sw = document.createElement('span');
    sw.className = 'legend-swatch legend-swatch--' + it.cls;
    wrap.appendChild(sw);
    wrap.appendChild(document.createTextNode(it.label));
    el.appendChild(wrap);
  }
}

// ---------------------------------------------------------------------------
// render(): the single entry that re-draws everything from STATE
// ---------------------------------------------------------------------------

export function render() {
  const meta = getMeta() || {};
  const originYM = currentOriginYM();
  const forward = isForwardOrigin(originYM);

  updateOriginLabel(originYM, forward);
  updateLiveCaveat(forward);
  updateCaveat();
  updateFreezeNote();
  updateLegend();

  const chartDiv = document.getElementById('chart');
  const gridDiv = document.getElementById('grid');

  // Drive visibility through the #app view class (theme.css: .view-single #grid
  // {display:none}, .view-grid #chart {display:none}). Keep an inline fallback so
  // the tool still works if embedded in a host page without those CSS rules.
  const app = document.getElementById('app');
  if (app) {
    app.classList.toggle('view-grid', STATE.view === 'grid');
    app.classList.toggle('view-single', STATE.view !== 'grid');
  }

  if (STATE.view === 'grid') {
    if (chartDiv) chartDiv.style.display = 'none';
    if (gridDiv) gridDiv.style.display = '';

    // National first, then states in current order.
    const panels = [];
    panels.push({
      meta,
      sel: 'national',
      originYM,
      observed: getObserved('national') || { months: [], casos: [] },
      forecast: getForecast('national', originYM) || [],
      horizons: STATE.horizons,
      showBand: STATE.showBand,
      showObsAfter: STATE.showObsAfter,
      emphasis: STATE.emphasis,
      lang: STATE.lang,
      forward,
      panelTitle: selName('national', STATE.lang),
    });
    const states = getStateMeta(STATE.order) || [];
    for (const s of states) {
      panels.push({
        meta,
        sel: Number(s.cve),
        originYM,
        observed: getObserved(Number(s.cve)) || { months: [], casos: [] },
        forecast: getForecast(Number(s.cve), originYM) || [],
        horizons: STATE.horizons,
        showBand: STATE.showBand,
        showObsAfter: STATE.showObsAfter,
        emphasis: STATE.emphasis,
        lang: STATE.lang,
        forward,
        panelTitle: (STATE.lang === 'en' ? (s.nombre_en || s.nombre) : (s.nombre || s.nombre_en)),
      });
    }
    renderGrid('grid', panels);
  } else {
    if (gridDiv) gridDiv.style.display = 'none';
    if (chartDiv) chartDiv.style.display = '';

    const sel = STATE.selected;
    renderMain('chart', {
      meta,
      sel,
      originYM,
      observed: getObserved(isNationalSel() ? 'national' : Number(sel)) || { months: [], casos: [] },
      forecast: getForecast(isNationalSel() ? 'national' : Number(sel), originYM) || [],
      horizons: STATE.horizons,
      showBand: STATE.showBand,
      showObsAfter: STATE.showObsAfter,
      emphasis: STATE.emphasis,
      lang: STATE.lang,
      forward,
    });
  }

  if (typeof afterRenderHook === 'function') {
    try { afterRenderHook(); } catch (e) { /* noop */ }
  }
}

// ---------------------------------------------------------------------------
// setters
// ---------------------------------------------------------------------------

export function setSelected(sel) {
  STATE.selected = (sel === 'national' || Number(sel) === 0) ? 'national' : Number(sel);
  render();
}

export function setOrigin(idx) {
  const origins = getOrigins() || [];
  let i = Number(idx);
  if (!Number.isFinite(i)) i = origins.length ? origins.length - 1 : 0;
  if (i < 0) i = 0;
  if (origins.length && i > origins.length - 1) i = origins.length - 1;
  STATE.originIdx = i;
  render();
}

export function setView(view) {
  STATE.view = view === 'grid' ? 'grid' : 'single';
  render();
}

export function toggleHorizon(h) {
  const hn = Number(h);
  if (STATE.horizons.has(hn)) {
    // keep at least one horizon active
    if (STATE.horizons.size > 1) STATE.horizons.delete(hn);
  } else {
    STATE.horizons.add(hn);
  }
  // if the emphasized horizon got removed, clear emphasis
  if (STATE.emphasis != null && !STATE.horizons.has(Number(STATE.emphasis))) {
    STATE.emphasis = null;
  }
  render();
}

export function setEmphasis(h) {
  STATE.emphasis = (h == null) ? null : Number(h);
  render();
}

export function setBand(on) {
  STATE.showBand = !!on;
  render();
}

export function setObsAfter(on) {
  STATE.showObsAfter = !!on;
  render();
}

export function setOrder(order) {
  STATE.order = order === 'rank_casos' ? 'rank_casos' : 'rank_tasa';
  render();
}

export function setLang(lang) {
  STATE.lang = lang === 'en' ? 'en' : 'es';
  render();
}
