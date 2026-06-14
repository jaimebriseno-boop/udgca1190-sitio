// chart.js -- VIEW layer: Plotly traces + layout for the Dengue Forecast viewer.
// Consumes the data layer (./data.js) only indirectly: buildTraces() receives already-
// resolved observed + forecast payloads via `opts`, so it never throws on missing data.
// Plotly is a global (window.Plotly) loaded from vendor/plotly-basic.min.js.

import { t } from './i18n.js';

// ---------------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------------

// "YYYY-MM" -> Date at day 15 (mid-month, so monthly bars/points center nicely).
function ymToDate(ym) {
  if (!ym || typeof ym !== 'string') return null;
  const parts = ym.split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return new Date(y, m - 1, 15);
}

// add `n` months to a "YYYY-MM" string -> "YYYY-MM"
function ymAdd(ym, n) {
  const parts = String(ym).split('-');
  let y = Number(parts[0]);
  let m = Number(parts[1]) - 1 + n; // 0-based month
  y += Math.floor(m / 12);
  m = ((m % 12) + 12) % 12;
  return y + '-' + String(m + 1).padStart(2, '0');
}

function fmtInt(v, lang) {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const loc = lang === 'en' ? 'en-US' : 'es-MX';
  try {
    return Math.round(Number(v)).toLocaleString(loc);
  } catch (e) {
    return String(Math.round(Number(v)));
  }
}

function rgba(hex, alpha) {
  const h = String(hex || '#000000').replace('#', '');
  const r = parseInt(h.substring(0, 2), 16) || 0;
  const g = parseInt(h.substring(2, 4), 16) || 0;
  const b = parseInt(h.substring(4, 6), 16) || 0;
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}

function blockLabel(block, lang) {
  return lang === 'en' ? (block.label_en || block.label_es || block.key) : (block.label_es || block.label_en || block.key);
}

const FONT_FAMILY =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// ---------------------------------------------------------------------------
// buildTraces(opts) -> {data, layout, config}
//   opts: {meta, sel, originYM, observed, forecast, horizons:Set, showBand,
//          showObsAfter, emphasis, lang, compact}
// ---------------------------------------------------------------------------

export function buildTraces(opts) {
  opts = opts || {};
  const meta = opts.meta || {};
  const lang = opts.lang || 'es';
  const compact = !!opts.compact;
  const sel = opts.sel;
  const originYM = opts.originYM || null;
  const observed = opts.observed || { months: [], casos: [] };
  const forecast = Array.isArray(opts.forecast) ? opts.forecast : [];
  const horizons = opts.horizons instanceof Set
    ? opts.horizons
    : new Set(Array.isArray(opts.horizons) ? opts.horizons : [1, 3, 6, 12]);
  const showBand = opts.showBand !== false;
  const showObsAfter = opts.showObsAfter !== false;
  const emphasis = opts.emphasis || null; // horizon number to emphasize, or null
  const forward = !!opts.forward;          // current origin is the LIVE forecast

  const palette = (meta.palette && meta.palette.PALETTE) || {};
  const obsColor = (meta.palette && meta.palette.OBS) || '#1A1A1A';
  const redColor = palette.red || '#7A2929';
  const goldColor = palette.gold || '#AB9E54';
  const bandAlpha = (meta.palette && typeof meta.palette.band_alpha === 'number') ? meta.palette.band_alpha : 0.20;
  const blockAlpha = (meta.palette && typeof meta.palette.block_alpha === 'number') ? meta.palette.block_alpha : 0.35;
  const isNational = (sel === 'national' || sel === 0 || sel === '0');

  // Resolve the labels this view needs from the real i18n vocabulary
  // (see js/i18n.js). The observed bars have no dedicated known/future keys, so
  // we annotate `leg_observed` with the cutoff sense in parentheses.
  const obsBase = t(lang, 'leg_observed');
  const knownHint = lang === 'en' ? 'known' : 'conocido';
  const futureHint = lang === 'en' ? 'after cutoff' : 'tras el corte';
  const L = {
    obsKnown: obsBase + ' (' + knownHint + ')',
    obsFuture: obsBase + ' (' + futureHint + ')',
    obsHover: obsBase,
    median: t(lang, 'leg_median'),
    band: isNational ? t(lang, 'leg_band_additive') : t(lang, 'leg_band'),
    cutoff: t(lang, 'leg_cutoff'),
    cutoffAnnot: t(lang, 'cutoffAnnot'),    // "Datos hasta" / "Data up to"
    cases: t(lang, 'axis_cases'),
    time: t(lang, 'axis_time'),
    qMedian: t(lang, 'quantileMedian'),
    observedVal: t(lang, 'observedValue'),
    liveBadge: t(lang, 'liveBadge'),
  };

  const data = [];
  const months = observed.months || [];
  const casos = observed.casos || [];
  const originDate = ymToDate(originYM);
  const originTime = originDate ? originDate.getTime() : null;

  // ----- 1) Background observed bars (added FIRST so they sit behind) -----
  // Split into "known" (<= T) and "revealed/future" (> T) so opacity differs.
  const knownX = [];
  const knownY = [];
  const knownText = [];
  const futX = [];
  const futY = [];
  const futText = [];
  for (let i = 0; i < months.length; i++) {
    const d = ymToDate(months[i]);
    if (!d) continue;
    const v = casos[i];
    const isFuture = originTime != null && d.getTime() > originTime;
    if (isFuture) {
      futX.push(d);
      futY.push(v);
      futText.push(months[i]);
    } else {
      knownX.push(d);
      knownY.push(v);
      knownText.push(months[i]);
    }
  }

  const obsHoverName = L.obsHover;
  if (knownX.length) {
    data.push({
      type: 'bar',
      x: knownX,
      y: knownY,
      name: L.obsKnown,
      marker: { color: obsColor, opacity: 0.55, line: { width: 0 } },
      customdata: knownText,
      hovertemplate: '%{customdata}<br>' + obsHoverName + ': %{y:,}<extra></extra>',
      showlegend: !compact,
    });
  }
  if (showObsAfter && futX.length) {
    data.push({
      type: 'bar',
      x: futX,
      y: futY,
      name: L.obsFuture,
      marker: { color: obsColor, opacity: 0.18, line: { width: 0 } },
      customdata: futText,
      hovertemplate: '%{customdata}<br>' + obsHoverName + ': %{y:,}<extra></extra>',
      showlegend: !compact,
    });
  }

  // ----- 2) Forecast: select horizons present + requested -----
  const sel4 = forecast
    .filter((p) => p && horizons.has(Number(p.h)))
    .sort((a, b) => Number(a.h) - Number(b.h));

  // Anchor point at T using observed value at T (so median line emanates from cutoff).
  let anchorY = null;
  if (originYM != null) {
    const idx = months.indexOf(originYM);
    if (idx >= 0) anchorY = casos[idx];
  }

  // ----- 3) 90% band (q05..q95) over target months -----
  // Use two scatter traces (q05 then q95 with fill:'tonexty') when >= 2 horizon
  // points; fall back to error_y on the median markers when exactly one.
  const bandLabel = L.band;
  if (showBand && sel4.length >= 2) {
    const bx = [];
    const lo = [];
    const hi = [];
    for (const p of sel4) {
      const d = ymToDate(p.td);
      if (!d) continue;
      bx.push(d);
      lo.push(Number(p.q05));
      hi.push(Number(p.q95));
    }
    if (bx.length >= 2) {
      // lower edge (invisible line), then upper edge fills down to it.
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: bx,
        y: lo,
        line: { width: 0, color: 'rgba(0,0,0,0)' },
        hoverinfo: 'skip',
        showlegend: false,
        name: bandLabel + ' (q05)',
      });
      data.push({
        type: 'scatter',
        mode: 'lines',
        x: bx,
        y: hi,
        fill: 'tonexty',
        fillcolor: rgba(redColor, bandAlpha),
        line: { width: 0, color: 'rgba(0,0,0,0)' },
        hoverinfo: 'skip',
        showlegend: !compact,
        name: bandLabel,
      });
    }
  }

  // ----- 4) Median line+markers through horizon points, anchored at T -----
  if (sel4.length) {
    const mx = [];
    const my = [];
    const mtext = [];
    const sizes = [];
    const colors = [];
    // optional anchor at the cutoff
    if (originDate && anchorY != null && Number.isFinite(Number(anchorY))) {
      mx.push(originDate);
      my.push(Number(anchorY));
      mtext.push(L.cutoff + ' (' + originYM + ')');
      sizes.push(5);
      colors.push(redColor);
    }
    for (const p of sel4) {
      const d = ymToDate(p.td);
      if (!d) continue;
      mx.push(d);
      my.push(Number(p.q50));
      const hh = Number(p.h);
      const emp = emphasis != null && Number(emphasis) === hh;
      mtext.push(
        'h' + hh + ' (' + p.td + ')<br>' +
        L.qMedian + ': ' + fmtInt(p.q50, lang) + '<br>' +
        L.band + ': ' + fmtInt(p.q05, lang) + '–' + fmtInt(p.q95, lang) +
        (p.y != null ? '<br>' + L.observedVal + ': ' + fmtInt(p.y, lang) : '')
      );
      sizes.push(emp ? 13 : (emphasis != null ? 7 : 9));
      colors.push(redColor);
    }

    const medianTrace = {
      type: 'scatter',
      mode: 'lines+markers',
      x: mx,
      y: my,
      name: L.median,
      // Forward mode: dash the median so it reads as a projection, not a backtest.
      line: { color: redColor, width: forward ? 2.5 : 2, dash: forward ? 'dash' : 'solid' },
      marker: {
        color: colors,
        size: sizes,
        line: { color: '#ffffff', width: 1 },
        opacity: emphasis != null ? 0.9 : 1.0,
      },
      text: mtext,
      hovertemplate: '%{text}<extra></extra>',
      showlegend: !compact,
      cliponaxis: false,
    };

    // Single-horizon fallback: error_y on the median marker(s).
    if (showBand && sel4.length === 1) {
      const p = sel4[0];
      // The median array may include the anchor at index 0; build per-point arrays.
      const arrPlus = my.map(() => 0);
      const arrMinus = my.map(() => 0);
      const lastIdx = my.length - 1; // the single horizon point is last
      arrPlus[lastIdx] = Math.max(0, Number(p.q95) - Number(p.q50));
      arrMinus[lastIdx] = Math.max(0, Number(p.q50) - Number(p.q05));
      medianTrace.error_y = {
        type: 'data',
        symmetric: false,
        array: arrPlus,
        arrayminus: arrMinus,
        color: rgba(redColor, 0.55),
        thickness: 2,
        width: 6,
        visible: true,
      };
    }

    data.push(medianTrace);
  }

  // ----- 5) layout: blocks, cutoff shape+annotation, axes -----
  const shapes = [];
  const annotations = [];

  // block-shading rects (layer below everything)
  const blocks = Array.isArray(meta.blocks) ? meta.blocks : [];
  for (const b of blocks) {
    const x0 = ymToDate(b.start);
    const x1 = ymToDate(ymAdd(b.end, 1)); // end inclusive -> extend to next month edge
    if (!x0 || !x1) continue;
    shapes.push({
      type: 'rect',
      xref: 'x',
      yref: 'paper',
      x0: x0,
      x1: x1,
      y0: 0,
      y1: 1,
      fillcolor: rgba(b.color || '#cccccc', blockAlpha),
      line: { width: 0 },
      layer: 'below',
    });
    if (!compact) {
      annotations.push({
        x: new Date((x0.getTime() + x1.getTime()) / 2),
        y: 1,
        xref: 'x',
        yref: 'paper',
        yanchor: 'bottom',
        text: blockLabel(b, lang),
        showarrow: false,
        font: { size: 10, color: '#6D7073', family: FONT_FAMILY },
        opacity: 0.85,
      });
    }
  }

  // x-range. In FORWARD mode (any view) we focus tightly around the live origin
  // so the 2024 peak (~16k) falls OFF-RANGE and the y-axis autoscales to the
  // small forward magnitude (tens-to-hundreds) -> the fan becomes visible.
  //   range = [origin - 12 months, last forecast target + 1 month].
  // Otherwise: default single-panel focus ~2018-01 .. a bit past freeze, with the
  // chosen origin kept visible (compact/grid keeps autorange as before).
  let xRange = null;
  let yRange = null; // forward mode pins y so the 2024 peak (off-range) can't inflate it
  if (forward && originYM) {
    // last target month among the forecast rows (fall back to origin + 12).
    let lastTd = null;
    for (const p of forecast) {
      if (p && typeof p.td === 'string' && (lastTd == null || p.td > lastTd)) lastTd = p.td;
    }
    const loYM = ymAdd(originYM, -12);
    const hiYM = ymAdd(lastTd || ymAdd(originYM, 12), 1);
    const loDate = ymToDate(loYM);
    const hiDate = ymToDate(hiYM);
    xRange = [loDate, hiDate];
    // y autorange spans ALL data by default, so the off-range 2024 peak would
    // still dominate. Pin y to the max within [loYM, hiYM]: forecast q95 plus any
    // observed bars inside the window. Padded 12%; tozero keeps the baseline.
    let yMax = 0;
    for (const p of forecast) {
      const hi = Number(p && p.q95);
      if (Number.isFinite(hi) && hi > yMax) yMax = hi;
    }
    for (let i = 0; i < months.length; i++) {
      if (months[i] >= loYM && months[i] <= hiYM) {
        const v = Number(casos[i]);
        if (Number.isFinite(v) && v > yMax) yMax = v;
      }
    }
    if (yMax > 0) yRange = [0, yMax * 1.12];
  } else if (!compact) {
    let lo = ymToDate('2018-01');
    const hi = ymToDate(ymAdd(meta.freeze_date || '2026-05', 8));
    // if user picked an origin before the default window, widen left to show it
    if (originDate && originDate.getTime() < lo.getTime()) {
      lo = ymToDate(ymAdd(originYM, -12));
    }
    xRange = [lo, hi];
  }

  // vertical cutoff line at T + annotation
  if (originDate) {
    shapes.push({
      type: 'line',
      xref: 'x',
      yref: 'paper',
      x0: originDate,
      x1: originDate,
      y0: 0,
      y1: 1,
      line: { color: obsColor, width: 1.5, dash: 'dash' },
      layer: 'above',
    });
    if (!compact) {
      // Anchor the label leftward (reading into the plot) when the origin sits in
      // the right ~25% of the visible range, so the box never clips off-screen.
      let anchorRight = false;
      if (xRange) {
        const t0 = xRange[0].getTime();
        const t1 = xRange[1].getTime();
        if (t1 > t0) anchorRight = (originDate.getTime() - t0) / (t1 - t0) > 0.75;
      }
      // Sit just inside the plot top with a small white box so it stays legible
      // and never collides with the block labels pinned to the very top edge.
      annotations.push({
        x: originDate,
        y: 0.985,
        xref: 'x',
        yref: 'paper',
        yanchor: 'top',
        xanchor: anchorRight ? 'right' : 'left',
        text: ' ' + L.cutoffAnnot + ' ' + originYM + ' ',
        showarrow: false,
        font: { size: 11, color: obsColor, family: FONT_FAMILY },
        bgcolor: 'rgba(255,255,255,0.78)',
        bordercolor: rgba(obsColor, 0.25),
        borderwidth: 1,
        borderpad: 2,
      });
      // Forward mode: a bold gold "LIVE / VIGENTE" pill sitting just right of the
      // cutoff so the projection reads unmistakably as the live forecast.
      if (forward) {
        annotations.push({
          x: originDate,
          y: 0.86,
          xref: 'x',
          yref: 'paper',
          yanchor: 'top',
          xanchor: anchorRight ? 'right' : 'left',
          text: '● ' + L.liveBadge,
          showarrow: false,
          font: { size: 12, color: '#ffffff', family: FONT_FAMILY },
          bgcolor: goldColor,
          bordercolor: goldColor,
          borderwidth: 1,
          borderpad: 4,
        });
      }
    }
  }

  const layout = {
    autosize: true,
    margin: compact
      ? { l: 34, r: 6, t: 22, b: 18 }
      : { l: 56, r: 16, t: 28, b: 36 },
    barmode: 'overlay',
    bargap: 0.1,
    paper_bgcolor: '#ffffff',
    plot_bgcolor: '#ffffff',
    font: { family: FONT_FAMILY, size: compact ? 9 : 12, color: '#22354A' },
    hovermode: compact ? false : 'closest',
    showlegend: false, // legend handled in DOM (#legend) for the main panel
    shapes: shapes,
    annotations: annotations,
    xaxis: {
      type: 'date',
      range: xRange || undefined,
      showgrid: false,
      zeroline: false,
      tickfont: { size: compact ? 8 : 11 },
      automargin: !compact,
    },
    yaxis: {
      title: compact ? undefined : { text: L.cases, font: { size: 12 } },
      range: yRange || undefined,
      autorange: yRange ? false : true,
      rangemode: 'tozero',
      showgrid: true,
      gridcolor: '#EFEFEF',
      zeroline: false,
      tickfont: { size: compact ? 8 : 11 },
      separatethousands: true,
      automargin: !compact,
    },
  };

  const config = {
    displayModeBar: !compact,
    displaylogo: false,
    responsive: true,
    staticPlot: compact,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d', 'toggleSpikelines'],
    toImageButtonOptions: { format: 'png', scale: 2 },
  };

  return { data, layout, config };
}

// ---------------------------------------------------------------------------
// renderMain(divId, opts): Plotly.react onto #chart
// ---------------------------------------------------------------------------

export function renderMain(divId, opts) {
  const div = document.getElementById(divId);
  if (!div || typeof window.Plotly === 'undefined') return;
  let built;
  try {
    built = buildTraces(Object.assign({}, opts, { compact: false }));
  } catch (e) {
    console.error('buildTraces failed', e);
    return;
  }
  try {
    window.Plotly.react(div, built.data, built.layout, built.config);
  } catch (e) {
    console.error('Plotly.react failed', e);
  }
}

// ---------------------------------------------------------------------------
// renderGrid(gridId, panelsOpts): small static multiples.
//   panelsOpts: array of opts objects (one per panel); each must carry a
//   `panelTitle` string. National first, then states (caller controls order).
// ---------------------------------------------------------------------------

export function renderGrid(gridId, panelsOpts) {
  const grid = document.getElementById(gridId);
  if (!grid) return;
  // clear existing panels (Plotly.purge each child first to free listeners)
  while (grid.firstChild) {
    const child = grid.firstChild;
    if (child && window.Plotly && child._fullLayout) {
      try { window.Plotly.purge(child); } catch (e) { /* noop */ }
    }
    grid.removeChild(child);
  }
  if (!Array.isArray(panelsOpts) || typeof window.Plotly === 'undefined') return;

  panelsOpts.forEach((opts, i) => {
    const cell = document.createElement('div');
    cell.className = 'grid-cell' + (i === 0 ? ' grid-cell--wide' : '');

    const title = document.createElement('div');
    title.className = 'grid-cell__title';
    title.textContent = opts && opts.panelTitle ? opts.panelTitle : '';
    cell.appendChild(title);

    const plotDiv = document.createElement('div');
    plotDiv.className = 'grid-cell__plot';
    cell.appendChild(plotDiv);
    grid.appendChild(cell);

    let built;
    try {
      built = buildTraces(Object.assign({}, opts, { compact: true }));
    } catch (e) {
      console.error('grid buildTraces failed', e);
      return;
    }
    try {
      window.Plotly.newPlot(plotDiv, built.data, built.layout, {
        staticPlot: true,
        displayModeBar: false,
        responsive: true,
      });
    } catch (e) {
      console.error('grid newPlot failed', e);
    }
  });
}
