// controls.js -- builds/wires every interactive control to STATE setters and keeps
// "active"/"checked" UI in sync. All visible strings flow through i18n (t()).

import { t } from './i18n.js';
import { getMeta, getOrigins, getStateMeta } from './data.js';
import {
  STATE,
  setSelected, setOrigin, setView, toggleHorizon,
  setBand, setObsAfter, setOrder, setLang,
} from './state.js';

const HORIZONS = [1, 3, 6, 12];

// ---------------------------------------------------------------------------
// population of the state <select> (Nacional first, then states by order)
// ---------------------------------------------------------------------------

export function populateStateSelect() {
  const sel = document.getElementById('stateSelect');
  if (!sel) return;
  const meta = getMeta() || {};
  const nat = meta.national || {};
  const lang = STATE.lang;
  const prev = STATE.selected;

  sel.innerHTML = '';

  const optNat = document.createElement('option');
  optNat.value = 'national';
  optNat.textContent = lang === 'en' ? (nat.nombre_en || 'National') : (nat.nombre || 'Nacional');
  sel.appendChild(optNat);

  const states = getStateMeta(STATE.order) || [];
  for (const s of states) {
    const o = document.createElement('option');
    o.value = String(s.cve);
    o.textContent = lang === 'en' ? (s.nombre_en || s.nombre) : (s.nombre || s.nombre_en);
    sel.appendChild(o);
  }

  // restore current selection
  sel.value = (prev === 'national' || Number(prev) === 0) ? 'national' : String(prev);
  if (sel.value === '' ) sel.value = 'national';
}

// ---------------------------------------------------------------------------
// origin slider
// ---------------------------------------------------------------------------

function wireSlider() {
  const slider = document.getElementById('originSlider');
  if (!slider) return;
  const origins = getOrigins() || [];
  const max = Math.max(0, origins.length - 1);
  slider.min = '0';
  slider.max = String(max);
  slider.step = '1';
  slider.value = String(STATE.originIdx);
  slider.addEventListener('input', (e) => {
    setOrigin(Number(e.target.value));
  });
}

// ---------------------------------------------------------------------------
// view toggle (single | grid)
// ---------------------------------------------------------------------------

function wireViewToggle() {
  const wrap = document.getElementById('viewToggle');
  if (!wrap) return;
  const btns = wrap.querySelectorAll('[data-view]');
  btns.forEach((b) => {
    b.addEventListener('click', () => {
      setView(b.getAttribute('data-view'));
      refreshViewToggle();
    });
  });
  refreshViewToggle();
}

function refreshViewToggle() {
  const wrap = document.getElementById('viewToggle');
  if (!wrap) return;
  wrap.querySelectorAll('[data-view]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-view') === STATE.view);
    b.setAttribute('aria-pressed', String(b.getAttribute('data-view') === STATE.view));
  });
}

// ---------------------------------------------------------------------------
// horizon chips (multi-toggle, default all on)
// ---------------------------------------------------------------------------

function wireHorizonChips() {
  const wrap = document.getElementById('horizonChips');
  if (!wrap) return;
  wrap.querySelectorAll('[data-h]').forEach((b) => {
    b.addEventListener('click', () => {
      toggleHorizon(Number(b.getAttribute('data-h')));
      refreshHorizonChips();
    });
  });
  refreshHorizonChips();
}

function refreshHorizonChips() {
  const wrap = document.getElementById('horizonChips');
  if (!wrap) return;
  wrap.querySelectorAll('[data-h]').forEach((b) => {
    const on = STATE.horizons.has(Number(b.getAttribute('data-h')));
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

// ---------------------------------------------------------------------------
// order toggle (rank_tasa | rank_casos)
// ---------------------------------------------------------------------------

function wireOrderToggle() {
  const wrap = document.getElementById('orderToggle');
  if (!wrap) return;
  wrap.querySelectorAll('[data-order]').forEach((b) => {
    b.addEventListener('click', () => {
      setOrder(b.getAttribute('data-order'));
      populateStateSelect();   // re-order the dropdown to match
      refreshOrderToggle();
    });
  });
  refreshOrderToggle();
}

function refreshOrderToggle() {
  const wrap = document.getElementById('orderToggle');
  if (!wrap) return;
  wrap.querySelectorAll('[data-order]').forEach((b) => {
    b.classList.toggle('active', b.getAttribute('data-order') === STATE.order);
    b.setAttribute('aria-pressed', String(b.getAttribute('data-order') === STATE.order));
  });
}

// ---------------------------------------------------------------------------
// toggles (band, obs-after)
// ---------------------------------------------------------------------------

function wireToggles() {
  const band = document.getElementById('toggleBand');
  if (band) {
    band.checked = STATE.showBand;
    band.addEventListener('change', (e) => setBand(e.target.checked));
  }
  const obs = document.getElementById('toggleObsAfter');
  if (obs) {
    obs.checked = STATE.showObsAfter;
    obs.addEventListener('change', (e) => setObsAfter(e.target.checked));
  }
}

// ---------------------------------------------------------------------------
// state select wiring
// ---------------------------------------------------------------------------

function wireStateSelect() {
  const sel = document.getElementById('stateSelect');
  if (!sel) return;
  sel.addEventListener('change', (e) => setSelected(e.target.value));
}

// ---------------------------------------------------------------------------
// lang toggle
// ---------------------------------------------------------------------------

function wireLangToggle() {
  const wrap = document.getElementById('langToggle');
  if (!wrap) return;
  // Support either buttons with data-lang, or a single toggle button.
  const langBtns = wrap.querySelectorAll('[data-lang]');
  if (langBtns.length) {
    langBtns.forEach((b) => {
      b.addEventListener('click', () => {
        setLang(b.getAttribute('data-lang'));
        applyStaticStrings();
        populateStateSelect();
        refreshAll();
      });
    });
  } else {
    wrap.addEventListener('click', () => {
      setLang(STATE.lang === 'es' ? 'en' : 'es');
      applyStaticStrings();
      populateStateSelect();
      refreshAll();
    });
  }
  refreshLangToggle();
}

function refreshLangToggle() {
  const wrap = document.getElementById('langToggle');
  if (!wrap) return;
  const langBtns = wrap.querySelectorAll('[data-lang]');
  if (langBtns.length) {
    langBtns.forEach((b) => {
      const on = b.getAttribute('data-lang') === STATE.lang;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  } else {
    // single button: i18n 'langToggle' is the label of the OTHER language
    // ("EN" while in ES, "ES" while in EN).
    wrap.textContent = t(STATE.lang, 'langToggle');
    wrap.setAttribute('aria-label', t(STATE.lang, 'langName'));
  }
}

// ---------------------------------------------------------------------------
// static (non-data) UI strings: title/subtitle/lead/labels via [data-i18n]
// ---------------------------------------------------------------------------

// Set textContent of #id (if present) to t(lang,key).
function setById(id, key) {
  const el = document.getElementById(id);
  if (el) el.textContent = t(STATE.lang, key);
}

// Set the text of the LABEL part of a button group without disturbing the
// buttons themselves: target a sibling .control-label inside the same .control.
function setControlLabel(groupId, key) {
  const group = document.getElementById(groupId);
  if (!group) return;
  const ctrl = group.closest('.control') || group.parentElement;
  if (!ctrl) return;
  const lbl = ctrl.querySelector('.control-label');
  if (lbl) lbl.textContent = t(STATE.lang, key);
}

// Set the <span> label that sits next to a checkbox input inside its <label>.
function setCheckboxLabel(inputId, key) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const label = input.closest('label') || input.parentElement;
  if (!label) return;
  const span = label.querySelector('span');
  if (span) span.textContent = t(STATE.lang, key);
}

// Translate a data-* button by setting its text node only.
function setBtnText(scopeId, attr, value, key) {
  const scope = document.getElementById(scopeId);
  if (!scope) return;
  const btn = scope.querySelector('[' + attr + '="' + value + '"]');
  if (btn) btn.textContent = t(STATE.lang, key);
}

export function applyStaticStrings() {
  const lang = STATE.lang;

  // Bonus path: honour any [data-i18n] / [data-i18n-attr] markup if present.
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const key = el.getAttribute('data-i18n');
    const val = t(lang, key);
    if (val != null) el.textContent = val;
  });
  document.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = el.getAttribute('data-i18n-attr') || '';
    spec.split(';').forEach((pair) => {
      const [attr, key] = pair.split(':');
      if (attr && key) {
        const val = t(lang, key.trim());
        if (val != null) el.setAttribute(attr.trim(), val);
      }
    });
  });

  // Explicit ID/structure path for the shipped index.html (no data-i18n there).
  setById('title', 'title');
  setById('subtitle', 'subtitle');
  setById('lead', 'lead');

  // control labels
  setById('stateSelectLabel', 'stateLabel');
  setById('originSliderLabel', 'originLabel');
  setControlLabel('orderToggle', 'orderLabel');
  setControlLabel('viewToggle', 'viewLabel');
  setControlLabel('horizonChips', 'horizonLabel');

  // toggle button labels (rank / view / horizons)
  setBtnText('orderToggle', 'data-order', 'rank_tasa', 'order_rank_tasa');
  setBtnText('orderToggle', 'data-order', 'rank_casos', 'order_rank_casos');
  setBtnText('viewToggle', 'data-view', 'single', 'view_single');
  setBtnText('viewToggle', 'data-view', 'grid', 'view_grid');

  // checkbox toggle text lives in a <span> inside the wrapping <label>
  setCheckboxLabel('toggleBand', 'toggleBand');
  setCheckboxLabel('toggleObsAfter', 'toggleObsAfter');

  // lang toggle button text + aria
  const langBtn = document.getElementById('langToggle');
  if (langBtn && !langBtn.querySelector('[data-lang]')) {
    langBtn.textContent = t(lang, 'langToggle');
    langBtn.setAttribute('aria-label', t(lang, 'langName'));
  }

  document.documentElement.lang = lang;
}

// ---------------------------------------------------------------------------
// refresh all "active"/checked reflections (after lang change or external set)
// ---------------------------------------------------------------------------

export function refreshAll() {
  refreshViewToggle();
  refreshHorizonChips();
  refreshOrderToggle();
  refreshLangToggle();
  const band = document.getElementById('toggleBand');
  if (band) band.checked = STATE.showBand;
  const obs = document.getElementById('toggleObsAfter');
  if (obs) obs.checked = STATE.showObsAfter;
  const slider = document.getElementById('originSlider');
  if (slider) slider.value = String(STATE.originIdx);
  const sel = document.getElementById('stateSelect');
  if (sel) sel.value = (STATE.selected === 'national') ? 'national' : String(STATE.selected);
}

// ---------------------------------------------------------------------------
// buildControls(): one-shot wiring at bootstrap
// ---------------------------------------------------------------------------

export function buildControls() {
  populateStateSelect();
  wireStateSelect();
  wireSlider();
  wireViewToggle();
  wireHorizonChips();
  wireOrderToggle();
  wireToggles();
  wireLangToggle();
  applyStaticStrings();
}
