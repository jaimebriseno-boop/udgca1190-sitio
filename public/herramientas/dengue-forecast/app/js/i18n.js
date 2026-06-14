// i18n.js — bilingual (es default + en) string tables for every visible label.
// No DOM, no Plotly. Use t(lang, key) to look up; falls back to Spanish, then
// to the raw key, so the view layer never renders `undefined`.

export const STRINGS = {
  es: {
    // --- Header / framing ---------------------------------------------------
    title: 'Pronóstico de Dengue',
    subtitle: 'Modelo de pronóstico mensual de dengue en México (1985–2026)',
    lead:
      'Las barras de fondo muestran los casos mensuales observados a lo largo de toda la ' +
      'historia. Mueve el deslizador para elegir la fecha de corte (origen del pronóstico): ' +
      'el modelo usa los datos hasta esa fecha y proyecta los horizontes a 1, 3, 6 y 12 meses, ' +
      'con la mediana del pronóstico y una banda del 90% (q05–q95). Puedes ver el resultado ' +
      'a nivel nacional o por estado, ordenados por incidencia.',

    // --- Language / view toggles -------------------------------------------
    langToggle: 'EN',          // label of the button that switches to the OTHER language
    langName: 'Español',
    view_single: 'Panel',
    view_grid: 'Cuadrícula',
    viewLabel: 'Vista',

    // --- Controls -----------------------------------------------------------
    stateLabel: 'Región',
    national: 'Nacional',
    orderLabel: 'Ordenar por',
    order_rank_tasa: 'Incidencia',
    order_rank_casos: 'Casos',
    originLabel: 'Datos hasta',
    originHint: 'Origen del pronóstico (T)',
    horizonLabel: 'Horizonte (meses)',
    h1: '1 mes',
    h3: '3 meses',
    h6: '6 meses',
    h12: '12 meses',

    // --- Toggles ------------------------------------------------------------
    showLabel: 'Mostrar',
    toggleBand: 'Banda 90%',
    toggleObsAfter: 'Observado tras el corte',

    // --- Legend -------------------------------------------------------------
    legendTitle: 'Leyenda',
    leg_observed: 'Observado',
    leg_median: 'Mediana del pronóstico',
    leg_band: 'Banda 90%',
    leg_band_additive: 'Banda 90% (aditiva)',
    leg_cutoff: 'Corte de datos',
    leg_block_A: 'Prepandemia',
    leg_block_B: 'Pandemia',
    leg_block_C: 'Resurgimiento DENV-3',

    // --- Chart annotations --------------------------------------------------
    cutoffAnnot: 'Datos hasta',          // followed by the YYYY-MM
    axis_cases: 'Casos mensuales',
    axis_time: 'Mes',
    panel_national: 'Nacional',

    // --- Callouts -----------------------------------------------------------
    // The national-specific band note text itself comes from
    // meta.national.band_note_es; this is the heading shown above it.
    caveatTitle: 'Aviso sobre la banda nacional',
    freezeTitle: 'Nota de congelamiento de datos',

    // --- Live forward forecast (meta.forward) ------------------------------
    liveTitle: 'Pronóstico vigente',
    liveTag: 'pronóstico vigente',     // appended to the origin label
    liveBadge: 'VIGENTE',              // short tag on the chart near the cutoff

    // --- Misc / footer ------------------------------------------------------
    modelLabel: 'Modelo',
    modelEnsemble: 'mediana ponderada',
    modelConformal: 'conformal cptc_over_aci',
    coverageLabel: 'Cobertura global',
    coveragePeakLabel: 'Cobertura pico 2024',
    footer:
      'Herramienta de visualización estática. Pronósticos congelados; ' +
      'los casos observados pueden actualizarse en versiones futuras.',
    noForecast: 'Sin pronóstico para este origen.',
    targetMonth: 'Mes objetivo',
    quantileMedian: 'Mediana (q50)',
    quantileLow: 'Inferior (q05)',
    quantileHigh: 'Superior (q95)',
    observedValue: 'Observado',
  },

  en: {
    // --- Header / framing ---------------------------------------------------
    title: 'Dengue Forecast',
    subtitle: 'Monthly dengue forecasting model for Mexico (1985–2026)',
    lead:
      'Background bars show the observed monthly cases across the full history. ' +
      'Move the slider to choose the data cutoff (forecast origin): the model uses ' +
      'data up to that date and projects horizons at 1, 3, 6 and 12 months, with the ' +
      'forecast median and a 90% interval (q05–q95). You can view results nationally ' +
      'or by state, ordered by incidence.',

    // --- Language / view toggles -------------------------------------------
    langToggle: 'ES',
    langName: 'English',
    view_single: 'Single',
    view_grid: 'Grid',
    viewLabel: 'View',

    // --- Controls -----------------------------------------------------------
    stateLabel: 'Region',
    national: 'National',
    orderLabel: 'Order by',
    order_rank_tasa: 'Incidence',
    order_rank_casos: 'Cases',
    originLabel: 'Data up to',
    originHint: 'Forecast origin (T)',
    horizonLabel: 'Horizon (months)',
    h1: '1 month',
    h3: '3 months',
    h6: '6 months',
    h12: '12 months',

    // --- Toggles ------------------------------------------------------------
    showLabel: 'Show',
    toggleBand: '90% band',
    toggleObsAfter: 'Observed after cutoff',

    // --- Legend -------------------------------------------------------------
    legendTitle: 'Legend',
    leg_observed: 'Observed',
    leg_median: 'Forecast median',
    leg_band: '90% band',
    leg_band_additive: '90% band (additive)',
    leg_cutoff: 'Data cutoff',
    leg_block_A: 'Pre-pandemic',
    leg_block_B: 'Pandemic',
    leg_block_C: 'DENV-3 resurgence',

    // --- Chart annotations --------------------------------------------------
    cutoffAnnot: 'Data up to',
    axis_cases: 'Monthly cases',
    axis_time: 'Month',
    panel_national: 'National',

    // --- Callouts -----------------------------------------------------------
    caveatTitle: 'About the national band',
    freezeTitle: 'Data freeze note',

    // --- Live forward forecast (meta.forward) ------------------------------
    liveTitle: 'Live forecast',
    liveTag: 'live forecast',          // appended to the origin label
    liveBadge: 'LIVE',                 // short tag on the chart near the cutoff

    // --- Misc / footer ------------------------------------------------------
    modelLabel: 'Model',
    modelEnsemble: 'weighted median',
    modelConformal: 'conformal cptc_over_aci',
    coverageLabel: 'Overall coverage',
    coveragePeakLabel: '2024 peak coverage',
    footer:
      'Static visualization tool. Forecasts are frozen; observed cases may be ' +
      'updated in future versions.',
    noForecast: 'No forecast for this origin.',
    targetMonth: 'Target month',
    quantileMedian: 'Median (q50)',
    quantileLow: 'Lower (q05)',
    quantileHigh: 'Upper (q95)',
    observedValue: 'Observed',
  },
};

// t(lang, key): look up a localized string.
// Fallback chain: requested lang -> 'es' -> the key itself (never throws,
// never returns undefined). Unknown lang is treated as 'es'.
export function t(lang, key) {
  const table = (STRINGS && STRINGS[lang]) || STRINGS.es;
  if (table && Object.prototype.hasOwnProperty.call(table, key)) {
    return table[key];
  }
  if (STRINGS.es && Object.prototype.hasOwnProperty.call(STRINGS.es, key)) {
    return STRINGS.es[key];
  }
  return key;
}
