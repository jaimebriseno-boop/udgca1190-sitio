/* ─────────────────────────────────────────────────────────────
   Propedéutica médica basada en evidencia · UDG-CA-1190
   App estática autocontenida. Parámetros de URL:
     ?lang=es|en     idioma (por defecto es)
     ?embed=1        modo embebido: reporta su altura al contenedor
     ?signo=<i>      abre directamente la ficha de un hallazgo
     ?q=<texto>      precarga una búsqueda
   ───────────────────────────────────────────────────────────── */
(function () {
  'use strict';

  var P = new URLSearchParams(location.search);
  var LANG = P.get('lang') === 'en' ? 'en' : 'es';
  var EMBED = P.get('embed') === '1';
  document.documentElement.lang = LANG;

  /* ══════════ Diccionario ══════════ */
  var T = {
    es: {
      'tab.buscar': 'Buscador de signos', 'tab.calc': 'Calculadora de probabilidad', 'tab.guia': 'Cómo se lee',
      'buscar.ph': 'Buscar signo, epónimo, condición o maniobra… (Homans, Murphy, egofonía, neumonía)',
      'col.signo': 'Signo · condición diana', 'col.veredicto': 'Veredicto', 'col.fuente': 'Origen',
      'v.confirma': 'Confirma', 'v.descarta': 'Descarta', 'v.ajusta': 'Ajusta',
      'v.debil': 'Cambio mínimo', 'v.nulo': 'No discrimina', 'v.na': 'Sin LR publicado',
      'v.confirma.l': 'Confirma · LR+ ≥ 5', 'v.descarta.l': 'Descarta · LR− ≤ 0.2',
      'v.ajusta.l': 'Ajusta la probabilidad', 'v.debil.l': 'Cambio mínimo · LR entre 0.5 y 2',
      'v.nulo.l': 'No discrimina · ambos IC 95 % cruzan 1', 'v.na.l': 'Sin razón de verosimilitud publicada',
      'f.full': 'Con cifras', 'f.ep': 'Con epónimo', 'f.mn': 'Con maniobra', 'f.limpiar': 'Limpiar',
      'or.full': 'Cifras', 'or.idx': 'Índice',
      'sel.dom': 'Todas las regiones', 'sel.cond': 'Todas las condiciones',
      'cuenta': '{n} de {t} hallazgos', 'vacio': 'Sin resultados. Pruebe otro término o limpie los filtros.',
      'mas': 'Mostrar {n} más', 'ficha.vacia': 'Seleccione un hallazgo de la lista para ver su ficha.',
      'm.sn': 'Sensibilidad', 'm.sp': 'Especificidad', 'm.lp': 'LR+', 'm.ln': 'LR−',
      'm.vpp': 'VPP', 'm.vpn': 'VPN',
      'm.vpnota': 'VPP: probabilidad de tener la condición si el signo está presente. VPN: probabilidad de no tenerla si está ausente. Ambos dependen de la prevalencia (aquí, la del estudio citado); para su paciente use la calculadora con la LR.',
      'b.maniobra': 'Cómo se busca', 'b.patron': 'Patrón de referencia', 'b.poblacion': 'Población estudiada',
      'b.cita': 'Cita textual de la fuente', 'b.loc': 'Dónde consultar la cifra', 'b.region': 'Región',
      'b.calc': 'Qué hace en este paciente', 'b.pre': 'Preprueba',
      'b.si_esta': 'Si el signo está', 'b.no_esta': 'Si el signo no está',
      'idx.aviso': 'Las cifras de este hallazgo (sensibilidad, especificidad y razones de verosimilitud) provienen de la compilación de <i>Evidence-Based Physical Diagnosis</i> de McGee y no se reproducen aquí por respeto a los derechos de la obra. Este registro funciona como índice: le dice que el signo <b>sí ha sido medido</b>, cómo se busca, contra qué patrón de referencia y en qué página exacta encontrarlo.',
      'idx.ver': 'Consultar la obra ↗', 'pmid.ver': 'Ver en PubMed ↗', 'doi.ver': 'Ver el artículo ↗',
      'nc.A': 'Nivel A · cifra localizada en la fuente primaria',
      'nc.B': 'Nivel B · verificable en McGee 3e con caja y página',
      'nc.C': 'Nivel C · cita verificada, cifras no localizadas en el resumen',
      'nc.D': 'Nivel D · contradicha por la fuente',
      'calc.titulo': 'De la probabilidad preprueba a la posprueba',
      'calc.intro': 'Un mismo hallazgo no significa lo mismo en todos los pacientes. Mueva los deslizadores: con la razón de verosimilitud fija, cambiar el punto de partida cambia por completo la conclusión. Esa es la razón por la que la sensibilidad y la especificidad no bastan para interpretar un resultado individual.',
      'calc.pre': 'Probabilidad preprueba', 'calc.lr': 'Razón de verosimilitud (LR)',
      'calc.pre_corto': 'Preprueba', 'calc.post_corto': 'Posprueba', 'calc.marca': '▲ preprueba',
      'calc.nomo': 'Nomograma de Fagan', 'calc.nomo_pie': 'La línea recta que une la probabilidad preprueba con la razón de verosimilitud corta el eje derecho en la probabilidad posprueba. Fagan TJ. N Engl J Med. 1975;293(5):257.',
      'calc.cambio': 'cambio absoluto',
      'guia.tit': 'Cómo se lee este material',
      'pie': 'Propedéutica médica basada en evidencia · Cuerpo Académico UDG-CA-1190, Universidad de Guadalajara (CUTlajomulco). {full} hallazgos con cifras verificadas contra el resumen de su fuente primaria y {idx} entradas de índice que remiten a la obra de referencia. Este material tiene fines docentes y no sustituye el juicio clínico.',
      'ir.buscar': 'Ir al buscador'
    },
    en: {
      'tab.buscar': 'Sign finder', 'tab.calc': 'Probability calculator', 'tab.guia': 'How to read it',
      'buscar.ph': 'Search a sign, eponym, target condition or maneuver… (Homans, Murphy, egophony, pneumonia)',
      'col.signo': 'Sign · target condition', 'col.veredicto': 'Verdict', 'col.fuente': 'Source',
      'v.confirma': 'Rules in', 'v.descarta': 'Rules out', 'v.ajusta': 'Shifts',
      'v.debil': 'Minimal change', 'v.nulo': 'Does not discriminate', 'v.na': 'No LR published',
      'v.confirma.l': 'Rules in · LR+ ≥ 5', 'v.descarta.l': 'Rules out · LR− ≤ 0.2',
      'v.ajusta.l': 'Shifts the probability', 'v.debil.l': 'Minimal change · LR between 0.5 and 2',
      'v.nulo.l': 'Does not discriminate · both 95% CIs cross 1', 'v.na.l': 'No likelihood ratio published',
      'f.full': 'With figures', 'f.ep': 'With eponym', 'f.mn': 'With maneuver', 'f.limpiar': 'Clear',
      'or.full': 'Figures', 'or.idx': 'Index',
      'sel.dom': 'All regions', 'sel.cond': 'All conditions',
      'cuenta': '{n} of {t} findings', 'vacio': 'No results. Try another term or clear the filters.',
      'mas': 'Show {n} more', 'ficha.vacia': 'Select a finding from the list to see its full record.',
      'm.sn': 'Sensitivity', 'm.sp': 'Specificity', 'm.lp': 'LR+', 'm.ln': 'LR−',
      'm.vpp': 'PPV', 'm.vpn': 'NPV',
      'm.vpnota': 'PPV: probability of having the condition when the sign is present. NPV: probability of not having it when absent. Both depend on prevalence (here, the cited study’s); for your patient use the calculator with the LR.',
      'b.maniobra': 'How it is elicited', 'b.patron': 'Reference standard', 'b.poblacion': 'Population studied',
      'b.cita': 'Verbatim quote from the source', 'b.loc': 'Where to find the figure', 'b.region': 'Region',
      'b.calc': 'What it does in this patient', 'b.pre': 'Pre-test',
      'b.si_esta': 'If the sign is present', 'b.no_esta': 'If the sign is absent',
      'idx.aviso': 'The figures for this finding (sensitivity, specificity and likelihood ratios) come from the compilation in McGee’s <i>Evidence-Based Physical Diagnosis</i> and are not reproduced here out of respect for the rights in that work. This record works as an index: it tells you the sign <b>has been measured</b>, how it is elicited, against which reference standard, and on exactly which page to find it.',
      'idx.ver': 'Consult the source ↗', 'pmid.ver': 'View on PubMed ↗', 'doi.ver': 'View the article ↗',
      'nc.A': 'Level A · figure located in the primary source',
      'nc.B': 'Level B · verifiable in McGee 3e with box and page',
      'nc.C': 'Level C · citation verified, figures not located in the abstract',
      'nc.D': 'Level D · contradicted by the source',
      'calc.titulo': 'From pre-test to post-test probability',
      'calc.intro': 'The same finding does not mean the same thing in every patient. Move the sliders: with the likelihood ratio held constant, changing the starting point changes the conclusion entirely. That is why sensitivity and specificity alone cannot interpret an individual result.',
      'calc.pre': 'Pre-test probability', 'calc.lr': 'Likelihood ratio (LR)',
      'calc.pre_corto': 'Pre-test', 'calc.post_corto': 'Post-test', 'calc.marca': '▲ pre-test',
      'calc.nomo': 'Fagan nomogram', 'calc.nomo_pie': 'A straight line joining the pre-test probability to the likelihood ratio crosses the right-hand axis at the post-test probability. Fagan TJ. N Engl J Med. 1975;293(5):257.',
      'calc.cambio': 'absolute change',
      'guia.tit': 'How to read this material',
      'pie': 'Evidence-based physical diagnosis · UDG-CA-1190 Research Group, University of Guadalajara (CUTlajomulco). {full} findings with figures verified against the abstract of their primary source, and {idx} index entries pointing to the reference work. This material is for teaching purposes and does not replace clinical judgement.',
      'ir.buscar': 'Go to the finder'
    }
  };
  function t(k) { return (T[LANG] && T[LANG][k]) || (T.es[k] || k); }

  /* ══════════ Utilidades ══════════ */
  function norm(s) {
    return (s == null ? '' : String(s)).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var LOC = LANG === 'en' ? 'en-US' : 'es-MX';
  function nfmt(n) { return Number(n).toLocaleString(LOC); }
  function fmtLr(v) { return v >= 10 ? v.toFixed(0) : (v >= 1 ? v.toFixed(1) : v.toFixed(2)); }
  function fmtPc(p) { return (p * 100).toFixed(1).replace(/\.0$/, '') + ' %'; }
  function rango(v) { return Array.isArray(v) ? v[0] + '–' + v[1] : (v == null ? '—' : v); }
  var odds = function (p) { return p / (1 - p); };
  var prob = function (o) { return o / (1 + o); };
  function post(pre, lr) { return prob(odds(pre) * lr); }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ══════════ Altura para el contenedor ══════════ */
  var ultima = 0;
  function reportarAltura() {
    if (!EMBED) return;
    var h = Math.ceil(document.documentElement.scrollHeight);
    if (Math.abs(h - ultima) < 12) return;
    ultima = h;
    try { parent.postMessage({ type: 'pebm-height', height: h }, '*'); } catch (e) {}
  }
  if (EMBED) {
    document.documentElement.style.overflow = 'hidden';
    if (window.ResizeObserver) new ResizeObserver(reportarAltura).observe(document.documentElement);
    addEventListener('load', reportarAltura);
    setInterval(reportarAltura, 900);
  }

  /* ══════════ Estado ══════════ */
  var BD = null, R = [], DOM = {}, META = {};
  var est = { q: '', dom: '', cond: '', v: {}, g: {}, sel: null, tope: 80 };

  /* ══════════ Arranque ══════════ */
  fetch('./data/signos.json')
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (d) {
      BD = d; R = d.r; META = d.meta; DOM = d.meta.dom;
      R.forEach(function (r) {
        r._b = norm([r.s, r.se, r.c, r.ce, r.ep, r.mn, r.loc,
          (DOM[r.d] || [])[0], (DOM[r.d] || [])[1]].filter(Boolean).join(' '));
      });
      iniciar();
    })
    .catch(function (e) {
      $('#cargando').innerHTML = '<p style="color:#a61e12;font-size:.875rem;padding:24px">' +
        (LANG === 'en' ? 'The dataset could not be loaded.' : 'No se pudo cargar la base de datos.') +
        ' (' + esc(e.message) + ')</p>';
    });

  function iniciar() {
    $('#cargando').remove();
    $('#app').hidden = false;
    aplicarTextos();
    montarSelectores();
    montarEventos();
    montarCalculadora();
    montarGuia();
    $('#cuentaGlobal').textContent = nfmt(META.n) + ' ' + (LANG === 'en' ? 'findings' : 'hallazgos');
    $('#pieTexto').innerHTML = t('pie')
      .replace('{full}', '<b>' + nfmt(META.n_full) + '</b>')
      .replace('{idx}', '<b>' + nfmt(META.n_idx) + '</b>');

    var q0 = P.get('q'); if (q0) { est.q = q0; $('#q').value = q0; }
    pintar();
    var s0 = P.get('signo');
    if (s0 != null) {
      var r0 = R.filter(function (r) { return String(r.i) === String(s0); })[0];
      if (r0) { est.sel = r0.i; pintar(); ficha(r0); }
    } else ficha(null);
    reportarAltura();
  }

  function aplicarTextos() {
    $$('[data-i]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i')); });
    $$('[data-i-ph]').forEach(function (el) { el.placeholder = t(el.getAttribute('data-i-ph')); });
  }

  /* ══════════ Selectores ══════════ */
  function nombreDom(d) { var a = DOM[d]; return a ? (LANG === 'en' ? (a[1] || a[0]) : a[0]) : d; }
  function nombreCond(r) { return LANG === 'en' ? (r.ce || r.c) : (r.c || r.ce); }
  function nombreSigno(r) { return LANG === 'en' ? (r.se || r.s) : (r.s || r.se); }

  function montarSelectores() {
    var ds = {}; R.forEach(function (r) { if (r.d) ds[r.d] = (ds[r.d] || 0) + 1; });
    var lista = Object.keys(ds).sort(function (a, b) { return nombreDom(a).localeCompare(nombreDom(b), LOC); });
    $('#fDom').innerHTML = '<option value="">' + esc(t('sel.dom')) + ' (' + nfmt(R.length) + ')</option>' +
      lista.map(function (d) {
        return '<option value="' + esc(d) + '">' + esc(nombreDom(d)) + ' (' + ds[d] + ')</option>';
      }).join('');

    var cs = {};
    R.forEach(function (r) { var c = nombreCond(r); if (c) cs[c] = (cs[c] || 0) + 1; });
    var cls = Object.keys(cs).sort(function (a, b) { return a.localeCompare(b, LOC); });
    $('#fCond').innerHTML = '<option value="">' + esc(t('sel.cond')) + ' (' + nfmt(cls.length) + ')</option>' +
      cls.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('');
  }

  /* ══════════ Filtro y lista ══════════ */
  var ORDEN = { confirma: 0, descarta: 1, ajusta: 2, debil: 3, nulo: 4 };
  function filtrar() {
    var toks = est.q ? norm(est.q).split(' ').filter(Boolean) : [];
    var vAct = Object.keys(est.v).filter(function (k) { return est.v[k]; });
    var gAct = Object.keys(est.g).filter(function (k) { return est.g[k]; });
    return R.filter(function (r) {
      if (est.dom && r.d !== est.dom) return false;
      if (est.cond && nombreCond(r) !== est.cond) return false;
      if (vAct.length && vAct.indexOf(r.v || 'na') < 0) return false;
      for (var i = 0; i < gAct.length; i++) {
        var g = gAct[i];
        if (g === 'full') { if (r.f !== 'full') return false; }
        else if (!r[g]) return false;
      }
      for (var j = 0; j < toks.length; j++) if (r._b.indexOf(toks[j]) < 0) return false;
      return true;
    }).sort(function (a, b) {
      var d = (ORDEN[a.v] == null ? 9 : ORDEN[a.v]) - (ORDEN[b.v] == null ? 9 : ORDEN[b.v]);
      if (d) return d;
      if (a.f !== b.f) return a.f === 'full' ? -1 : 1;
      return nombreSigno(a).localeCompare(nombreSigno(b), LOC);
    });
  }
  function pillV(v) {
    var k = v || 'na';
    return '<span class="pill pill--' + k + '">' + esc(t('v.' + k)) + '</span>';
  }
  function pintar() {
    var res = filtrar();
    $('#cuenta').textContent = t('cuenta').replace('{n}', nfmt(res.length)).replace('{t}', nfmt(R.length));
    var cont = $('#filas');
    if (!res.length) { cont.innerHTML = '<div class="vacio">' + esc(t('vacio')) + '</div>'; reportarAltura(); return; }
    var vista = res.slice(0, est.tope);
    cont.innerHTML = vista.map(function (r) {
      return '<button class="fila' + (est.sel === r.i ? ' is-sel' : '') + '" data-i="' + r.i + '">' +
        '<span><span class="fila__s">' + esc(nombreSigno(r)) +
          (r.ep ? ' <em style="font-style:normal;color:#90303a">· ' + esc(r.ep) + '</em>' : '') + '</span>' +
        '<span class="fila__c">' + esc(nombreCond(r) || '—') +
          (r.d ? ' · ' + esc(nombreDom(r.d)) : '') + '</span></span>' +
        '<span>' + pillV(r.v) + '</span>' +
        '<span class="fila__f">' + esc(t('or.' + r.f)) + '</span>' +
        '</button>';
    }).join('') +
      (res.length > est.tope
        ? '<div class="mas"><button class="chip" id="mas">' +
            esc(t('mas').replace('{n}', nfmt(Math.min(200, res.length - est.tope)))) + '</button></div>'
        : '');
    reportarAltura();
  }

  /* ══════════ Ficha ══════════ */
  function ficha(r) {
    var el = $('#ficha');
    if (!r) { el.innerHTML = '<p class="ficha__vacia">' + esc(t('ficha.vacia')) + '</p>'; reportarAltura(); return; }
    var h = '<h3>' + esc(nombreSigno(r)) + '</h3>';
    if (r.ep) h += '<p class="ficha__ep">' + esc(r.ep) + '</p>';
    h += '<p class="ficha__cond">' + esc(nombreCond(r) || '—') + '</p>';

    h += '<div class="ficha__pills">' + pillV(r.v);
    if (r.nc) h += '<span class="pill pill--' + esc(r.nc) + '" title="' + esc(t('nc.' + r.nc)) + '">' +
      (LANG === 'en' ? 'Level ' : 'Nivel ') + esc(r.nc) + '</span>';
    h += '</div>';
    h += '<p class="nota" style="margin:0 0 8px">' + esc(t('v.' + (r.v || 'na') + '.l')) +
         (r.nc ? ' · ' + esc(t('nc.' + r.nc)) : '') + '</p>';

    if (r.f === 'full') {
      h += '<div class="met">' +
        celda(t('m.sn'), r.sn == null ? '—' : rango(r.sn) + ' %', r.snic) +
        celda(t('m.sp'), r.sp == null ? '—' : rango(r.sp) + ' %', r.spic) +
        celda(t('m.lp'), r.lp == null ? '—' : fmtLr(r.lp), r.lpic) +
        celda(t('m.ln'), r.ln == null ? '—' : fmtLr(r.ln), r.lnic) +
        ((r.vpp != null || r.vpn != null)
          ? celda(t('m.vpp'), r.vpp == null ? '—' : rango(r.vpp) + ' %') +
            celda(t('m.vpn'), r.vpn == null ? '—' : rango(r.vpn) + ' %')
          : '') +
        '</div>';
      if (r.vpp != null || r.vpn != null)
        h += '<p class="nota" style="margin:0 0 8px">' + esc(t('m.vpnota')) + '</p>';
    } else {
      h += '<div class="aviso-idx">' + t('idx.aviso') + '</div>';
    }

    if (r.d) h += bloque(t('b.region'), esc(nombreDom(r.d)));
    if (r.mn) h += bloque(t('b.maniobra'), esc(r.mn));
    var pr = LANG === 'en' ? (r.pre || r.pr) : (r.pr || r.pre);
    if (pr) h += bloque(t('b.patron'), esc(pr));
    if (r.pob) h += bloque(t('b.poblacion'), esc(r.pob) +
      (r.n ? ' · n = ' + nfmt(r.n) : '') +
      (r.ne ? ' · ' + r.ne + (LANG === 'en' ? ' studies' : ' estudios') : ''));
    if (r.cit) h += '<div class="bloque"><div class="t">' + esc(t('b.cita')) +
      '</div><div class="x cita">' + esc(r.cit) + '</div></div>';
    if (r.calc) h += '<div class="bloque"><div class="t">' +
      (LANG === 'en' ? 'Note on the figures' : 'Nota sobre las cifras') +
      '</div><div class="x">' + esc(LANG === 'en'
        ? 'Figures calculated by the project from the published frequencies/counts in the quote.'
        : 'Cifras calculadas por el proyecto a partir de las frecuencias o conteos publicados en la cita.') +
      '</div></div>';

    if (r.loc || r.pmid || r.doi) {
      h += '<div class="loc"><div class="t">' + esc(t('b.loc')) + '</div><div class="x">';
      if (r.loc) h += esc(r.loc);
      if (r.pmid) h += (r.loc ? '<br>' : '') + 'PMID ' + esc(r.pmid);
      if (r.doi) h += '<br>doi:' + esc(r.doi);
      h += '</div>';
      if (r.pmid) h += '<a href="https://pubmed.ncbi.nlm.nih.gov/' + encodeURIComponent(r.pmid) +
        '/" target="_blank" rel="noopener">' + esc(t('pmid.ver')) + '</a> ';
      if (r.doi) h += '<a href="https://doi.org/' + encodeURIComponent(r.doi) +
        '" target="_blank" rel="noopener">' + esc(t('doi.ver')) + '</a>';
      if (r.f === 'idx') h += '<a href="https://www.sciencedirect.com/book/9781437722079/evidence-based-physical-diagnosis" target="_blank" rel="noopener">' +
        esc(t('idx.ver')) + '</a>';
      h += '</div>';
    }

    var lrp = (r.f === 'full' && r.lp != null) ? r.lp : null;
    var lrn = (r.f === 'full' && r.ln != null) ? r.ln : null;
    if (lrp || lrn) {
      h += '<div class="minicalc"><div class="t">' + esc(t('b.calc')) + '</div>' +
        '<div class="row"><span>' + esc(t('b.pre')) + '</span>' +
        '<input type="range" id="mcPre" min="1" max="95" step="1" value="25"><b id="mcPreV">25 %</b></div>' +
        (lrp ? '<div class="fl"><span>' + esc(t('b.si_esta')) + ' <span class="mono">(LR+ ' + fmtLr(lrp) + ')</span></span><b id="mcPos">—</b></div>' : '') +
        (lrn ? '<div class="fl"><span>' + esc(t('b.no_esta')) + ' <span class="mono">(LR− ' + fmtLr(lrn) + ')</span></span><b id="mcNeg">—</b></div>' : '') +
        '</div>';
    }

    el.innerHTML = h;
    el.scrollTop = 0;
    var mp = $('#mcPre');
    if (mp) {
      var upd = function () {
        var pre = +mp.value / 100;
        $('#mcPreV').textContent = mp.value + ' %';
        if ($('#mcPos')) $('#mcPos').textContent = fmtPc(post(pre, lrp));
        if ($('#mcNeg')) $('#mcNeg').textContent = fmtPc(post(pre, lrn));
      };
      mp.addEventListener('input', upd); upd();
    }
    reportarAltura();
  }
  function celda(e, v, ic) {
    return '<div><div class="e">' + esc(e) + '</div><div class="v">' + esc(v) + '</div>' +
      (ic ? '<div class="ic">IC 95 % ' + esc(ic) + '</div>' : '') + '</div>';
  }
  function bloque(tt, x) {
    return '<div class="bloque"><div class="t">' + esc(tt) + '</div><div class="x">' + x + '</div></div>';
  }

  /* ══════════ Eventos ══════════ */
  function montarEventos() {
    var timer;
    $('#q').addEventListener('input', function (e) {
      clearTimeout(timer);
      var v = e.target.value;
      timer = setTimeout(function () { est.q = v; est.tope = 80; pintar(); }, 120);
    });
    $('#fDom').addEventListener('change', function (e) { est.dom = e.target.value; est.tope = 80; pintar(); });
    $('#fCond').addEventListener('change', function (e) { est.cond = e.target.value; est.tope = 80; pintar(); });

    $('.filtros').addEventListener('click', function (e) {
      var c = e.target.closest('.chip'); if (!c) return;
      if (c.id === 'limpiar') {
        est = { q: '', dom: '', cond: '', v: {}, g: {}, sel: est.sel, tope: 80 };
        $('#q').value = ''; $('#fDom').value = ''; $('#fCond').value = '';
        $$('.filtros .chip').forEach(function (x) { x.classList.remove('is-on'); });
        pintar(); return;
      }
      var v = c.getAttribute('data-v'), g = c.getAttribute('data-g');
      if (v) est.v[v] = !est.v[v];
      if (g) est.g[g] = !est.g[g];
      c.classList.toggle('is-on');
      est.tope = 80; pintar();
    });

    $('#filas').addEventListener('click', function (e) {
      if (e.target.id === 'mas') { est.tope += 200; pintar(); return; }
      var f = e.target.closest('.fila'); if (!f) return;
      est.sel = +f.getAttribute('data-i');
      pintar();
      ficha(R.filter(function (r) { return r.i === est.sel; })[0]);
      if (innerWidth <= 1000) $('#ficha').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    $('.tabs').addEventListener('click', function (e) {
      var b = e.target.closest('.tab'); if (!b) return;
      var id = b.getAttribute('data-tab');
      $$('.tab').forEach(function (x) {
        var on = x === b;
        x.classList.toggle('is-on', on); x.setAttribute('aria-selected', String(on));
      });
      $$('.panel').forEach(function (p) { p.classList.toggle('is-on', p.id === 'p-' + id); });
      reportarAltura();
    });
  }

  /* ══════════ Calculadora ══════════ */
  function lrDeSlider(v) { return Math.round(Math.pow(10, -2 + (v / 60) * 4) * 100) / 100; }
  function sliderDeLr(lr) {
    return Math.round(((Math.log(Math.max(0.01, Math.min(100, lr))) / Math.LN10) + 2) / 4 * 60);
  }
  function montarCalculadora() {
    var sPre = $('#cPre'), sLr = $('#cLr'), exacto = 4.1;
    var PRE = LANG === 'en'
      ? [['Egophony · pneumonia', 25, 4.1], ['Visible peristalsis · SBO', 4, 18.8],
         ['Asymmetric chest expansion', 25, 44.1], ['Crackles · pneumonia', 25, 1.8],
         ['Murphy · cholecystitis', 40, 3.2], ['Uninformative test (LR = 1)', 30, 1]]
      : [['Egofonía · neumonía', 25, 4.1], ['Peristalsis visible · obstrucción', 4, 18.8],
         ['Expansibilidad asimétrica', 25, 44.1], ['Crepitantes · neumonía', 25, 1.8],
         ['Murphy · colecistitis', 40, 3.2], ['Prueba sin valor (LR = 1)', 30, 1]];
    $('#presets').innerHTML = PRE.map(function (p) {
      return '<button class="chip" data-pre="' + p[1] + '" data-lr="' + p[2] + '">' + esc(p[0]) + '</button>';
    }).join('');
    $('#presets').addEventListener('click', function (e) {
      var b = e.target.closest('[data-pre]'); if (!b) return;
      sPre.value = b.getAttribute('data-pre');
      exacto = +b.getAttribute('data-lr');
      sLr.value = sliderDeLr(exacto);
      $$('#presets .chip').forEach(function (x) { x.classList.toggle('is-on', x === b); });
      render();
    });
    sPre.addEventListener('input', render);
    sLr.addEventListener('input', function () {
      exacto = null;
      $$('#presets .chip').forEach(function (x) { x.classList.remove('is-on'); });
      render();
    });

    function render() {
      var pre = +sPre.value / 100;
      var lr = exacto != null ? exacto : lrDeSlider(+sLr.value);
      var po = post(pre, lr), om = odds(pre), op = om * lr, dif = (po - pre) * 100;
      $('#cPreV').textContent = sPre.value + ' %';
      $('#cLrV').textContent = fmtLr(lr);
      $('#vPre').textContent = sPre.value + ' %';
      $('#vLr').textContent = fmtLr(lr);
      $('#vPost').textContent = fmtPc(po);
      $('#tBarra').style.width = (po * 100) + '%';
      $('#tMarca').style.left = (pre * 100) + '%';
      $('#cuentaMat').innerHTML =
        (LANG === 'en' ? 'pre-test odds' : 'momios preprueba') + '  = ' + pre.toFixed(2) + ' / ' + (1 - pre).toFixed(2) + ' = <b>' + om.toFixed(3) + '</b>\n' +
        (LANG === 'en' ? 'post-test odds' : 'momios posprueba') + ' = ' + om.toFixed(3) + ' × ' + fmtLr(lr) + ' = <b>' + op.toFixed(3) + '</b>\n' +
        (LANG === 'en' ? 'post-test prob.' : 'probabilidad post') + ' = ' + op.toFixed(3) + ' / (1 + ' + op.toFixed(3) + ') = <b>' + fmtPc(po) + '</b>\n' +
        t('calc.cambio') + ': ' + (dif >= 0 ? '+' : '') + dif.toFixed(1) + (LANG === 'en' ? ' percentage points' : ' puntos porcentuales');
      dibujarFagan(pre, lr, po);
      reportarAltura();
    }
    sLr.value = sliderDeLr(4.1);
    $$('#presets .chip')[0].classList.add('is-on');
    render();
  }

  /* Nomograma de Fagan.
     Los ejes exteriores van en sentidos OPUESTOS: la preprueba crece hacia abajo y
     la posprueba hacia arriba. Solo así la escala central de LR es fija y la recta
     que une preprueba con posprueba corta el eje del LR en su valor exacto.
       y_pre(u)  = T + ((u+3)/6)·H       u = log10(momios preprueba)
       y_post(v) = T + ((3−v)/6)·H       v = u + log10(LR)
       y_lr(w)   = T + ((6−w)/12)·H      punto medio de los dos anteriores  */
  function dibujarFagan(pre, lr, po) {
    var W = 320, H0 = 460, T = 40, B = H0 - 30, H = B - T;
    var xL = 60, xM = 160, xR = 260;
    var L10 = Math.LN10;
    function yPre(p)  { return T + ((Math.log(odds(p)) / L10 + 3) / 6) * H; }
    function yPost(p) { return T + ((3 - Math.log(odds(p)) / L10) / 6) * H; }
    function yLr(v)   { return T + ((6 - Math.log(v) / L10) / 12) * H; }

    var pTicks = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 30, 50, 70, 80, 90, 95, 99];
    var lTicks = [0.001, 0.01, 0.1, 0.2, 0.5, 1, 2, 5, 10, 100, 1000];
    var s = '';
    [xL, xM, xR].forEach(function (x) {
      s += '<line x1="' + x + '" y1="' + T + '" x2="' + x + '" y2="' + B +
           '" stroke="#c3c9d4" stroke-width="1.2"/>';
    });
    pTicks.forEach(function (v) {
      var p = v / 100, y1 = yPre(p), y2 = yPost(p);
      s += '<line x1="' + (xL - 4) + '" y1="' + y1 + '" x2="' + xL + '" y2="' + y1 + '" stroke="#6b7585"/>' +
           '<text x="' + (xL - 7) + '" y="' + (y1 + 3.2) + '" text-anchor="end" font-size="9" ' +
           'fill="#6b7585" font-family="monospace">' + v + '</text>';
      s += '<line x1="' + xR + '" y1="' + y2 + '" x2="' + (xR + 4) + '" y2="' + y2 + '" stroke="#6b7585"/>' +
           '<text x="' + (xR + 7) + '" y="' + (y2 + 3.2) + '" font-size="9" ' +
           'fill="#6b7585" font-family="monospace">' + v + '</text>';
    });
    lTicks.forEach(function (v) {
      var y = yLr(v);
      s += '<line x1="' + (xM - 4) + '" y1="' + y + '" x2="' + (xM + 4) + '" y2="' + y + '" stroke="#6b7585"/>' +
           '<text x="' + (xM + 8) + '" y="' + (y + 3.2) + '" font-size="9" ' +
           'fill="#6b7585" font-family="monospace">' + v + '</text>';
    });
    var et = [[xL, LANG === 'en' ? 'Pre-test %' : 'Preprueba %'], [xM, 'LR'],
              [xR, LANG === 'en' ? 'Post-test %' : 'Posprueba %']];
    et.forEach(function (e) {
      s += '<text x="' + e[0] + '" y="' + (T - 16) + '" text-anchor="middle" font-size="9.5" ' +
           'fill="#27334F" font-weight="600">' + e[1] + '</text>';
    });
    var y1 = yPre(pre), y2 = yLr(lr), y3 = yPost(po);
    s += '<line x1="' + xL + '" y1="' + y1 + '" x2="' + xR + '" y2="' + y3 +
         '" stroke="#90303a" stroke-width="1.8"/>';
    s += '<circle cx="' + xL + '" cy="' + y1 + '" r="4" fill="#90303a"/>';
    s += '<circle cx="' + xM + '" cy="' + y2 + '" r="4.5" fill="#8a5c0a" stroke="#fff" stroke-width="1.2"/>';
    s += '<circle cx="' + xR + '" cy="' + y3 + '" r="4.5" fill="#27334F"/>';
    document.getElementById('fagan').innerHTML = s;
  }

  /* ══════════ Guía ══════════ */
  function montarGuia() {
    $('#guia').innerHTML = LANG === 'en' ? GUIA_EN : GUIA_ES;
    $('#guia').addEventListener('click', function (e) {
      var b = e.target.closest('[data-goto]'); if (!b) return;
      $('.tab[data-tab="buscador"]').click();
      $('#q').value = b.getAttribute('data-goto');
      est.q = b.getAttribute('data-goto'); est.tope = 80; pintar();
    });
  }

  var GUIA_ES = [
'<h3>Qué es una razón de verosimilitud</h3>',
'<p>Una razón de verosimilitud (LR) responde una sola pregunta: <b>cuánto cambia la probabilidad de enfermedad cuando encuentro (o no encuentro) este hallazgo</b>. Su virtud decisiva es que, a diferencia del valor predictivo positivo, <b>no depende de la prevalencia</b>. Por eso es la cifra que conviene memorizar y la única que puede transferirse de un escenario a otro con cierta seguridad.</p>',
'<table><tr><th>LR+</th><th>Efecto</th><th>LR−</th><th>Efecto</th></tr>',
'<tr class="destaca"><td class="n">&gt; 10</td><td>Confirma casi por sí solo</td><td class="n">&lt; 0.1</td><td>Descarta casi por sí solo</td></tr>',
'<tr><td class="n">5 – 10</td><td>Cambio importante</td><td class="n">0.1 – 0.2</td><td>Cambio importante</td></tr>',
'<tr><td class="n">2 – 5</td><td>Cambio moderado</td><td class="n">0.2 – 0.5</td><td>Cambio moderado</td></tr>',
'<tr><td class="n">1 – 2</td><td>Cambio mínimo</td><td class="n">0.5 – 1</td><td>Cambio mínimo</td></tr>',
'<tr class="mala"><td class="n">= 1</td><td colspan="3"><b>Inútil: el hallazgo no modifica nada</b></td></tr></table>',
'<p class="fuente">Jaeschke R, Guyatt GH, Sackett DL. <i>JAMA</i>. 1994;271(9):703-707 · Deeks JJ, Altman DG. <i>BMJ</i>. 2004;329:168-169.</p>',

'<h3>La regla del 15–30–45</h3>',
'<p>Para estimar de cabeza, sin calculadora ni nomograma, en el rango de probabilidades intermedias:</p>',
'<table><tr><th>Si el signo está</th><th class="n"></th><th>Si el signo no está</th><th class="n"></th></tr>',
'<tr><td class="n">LR+ 2</td><td class="n">+15 puntos</td><td class="n">LR− 0.5</td><td class="n">−15 puntos</td></tr>',
'<tr><td class="n">LR+ 5</td><td class="n">+30 puntos</td><td class="n">LR− 0.2</td><td class="n">−30 puntos</td></tr>',
'<tr><td class="n">LR+ 10</td><td class="n">+45 puntos</td><td class="n">LR− 0.1</td><td class="n">−45 puntos</td></tr></table>',
'<p class="fuente">Valores intermedios: LR 3 → +20 · LR 4 → +25 · LR 6 → +35 · LR 8 → +40. McGee S. <i>Simplifying likelihood ratios</i>. <i>J Gen Intern Med</i>. 2002;17(8):646-649. PMID 12213147.</p>',

'<h3>Qué significa «no discrimina»</h3>',
'<p>Cuando el intervalo de confianza del 95 % de una razón de verosimilitud <b>contiene el 1</b>, los datos disponibles no permiten afirmar que el hallazgo modifique la probabilidad en ninguna dirección. <b>No es un dato faltante: es el resultado.</b> En este buscador esos registros aparecen etiquetados como <span class="pill pill--nulo">No discrimina</span>.</p>',
'<div class="callout"><p>Una especificidad alta acompañada de un LR+ no significativo suele indicar <b>pocos eventos</b>: el intervalo se abre tanto que el estimador puntual deja de sostenerse. Conviene desconfiar de las cifras espectaculares que vienen con intervalos de tres órdenes de magnitud.</p></div>',
'<p>Pruebe con <button class="chip" data-goto="Homans">Homans</button> <button class="chip" data-goto="Blumberg">Blumberg</button> <button class="chip" data-goto="Kernig">Kernig</button> para ver ejemplos clásicos.</p>',

'<h3>La otra mitad de la pregunta: la concordancia entre observadores</h3>',
'<p>Un signo con una razón de verosimilitud excelente pero que dos exploradores no ven igual es <b>inservible a la cabecera del paciente</b>. El coeficiente κ mide el acuerdo entre observadores corrigiendo el que se obtendría por azar: κ = 0 equivale a lanzar una moneda; κ = 1, a acuerdo perfecto. Por convención, valores por debajo de 0.2 se leen como acuerdo leve; 0.2–0.4 aceptable; 0.4–0.6 moderado; 0.6–0.8 sustancial; ≥ 0.8 casi perfecto.</p>',
'<p><b>Reproducibilidad y validez son dos preguntas distintas.</b> Existen signos en los que dos médicos coinciden casi perfectamente y que, sin embargo, no discriminan nada; y signos con razones de verosimilitud altas que solo funcionan si quien explora sabe hacerlo.</p>',

'<h3>El patrón de referencia tampoco es perfecto</h3>',
'<p>Antes de exigirle exactitud a la exploración física conviene mirar contra qué se la juzga. El infiltrado en la radiografía de tórax —el estándar contra el que se miden casi todos los signos de neumonía— tiene una concordancia entre radiólogos que apenas alcanza la banda «aceptable». <b>Cuando el estándar de referencia es borroso, la razón de verosimilitud del signo clínico se subestima:</b> parte de lo que llamamos «error del explorador» es, en realidad, error del radiólogo.</p>',
'<p>Por eso cada registro de este buscador declara <b>su patrón de referencia como campo visible</b>, no como nota al pie. Un signo validado contra tomografía y otro validado contra «impresión clínica del adscrito» no son comparables.</p>',

'<h3>Por qué el rendimiento cae al pasar del artículo a la cama del paciente</h3>',
'<table><tr><th>Sesgo</th><th>En qué consiste</th><th>Efecto</th></tr>',
'<tr><td><b>De espectro</b></td><td>Se comparan enfermos graves contra sanos, no el espectro real de la consulta.</td><td>Infla Sn y Sp</td></tr>',
'<tr><td><b>De verificación</b></td><td>Solo se confirma con el patrón de oro a quienes tuvieron el signo positivo.</td><td>Infla Sn, desinfla Sp</td></tr>',
'<tr><td><b>De revisión</b></td><td>Quien interpreta el patrón de oro conoce el resultado de la exploración, o al revés.</td><td>Infla todo</td></tr>',
'<tr><td><b>De incorporación</b></td><td>El signo forma parte del propio patrón de oro.</td><td>Infla todo, circularmente</td></tr></table>',
'<p class="fuente">Lijmer JG, et al. <i>JAMA</i>. 1999;282(11):1061-1066. PMID 10493205 · Whiting PF, et al. QUADAS-2. <i>Ann Intern Med</i>. 2011;155(8):529-536. PMID 22007046.</p>',
'<div class="callout"><p><b>Advertencia de fecha.</b> Buena parte de esta evidencia se generó entre 1980 y 2010. La prevalencia, la población y los patrones de referencia de entonces no son los de hoy: un signo validado contra gammagrafía hepatobiliar en 1990 se comporta distinto en un servicio donde el ultrasonido está disponible en diez minutos.</p></div>',

'<h3>Cómo está construida esta base</h3>',
'<p>Reúne dos cuerpos de evidencia con reglas distintas, y el buscador los distingue siempre:</p>',
'<table><tr><th>Origen</th><th>Qué contiene</th></tr>',
'<tr><td><b>Cifras</b></td><td>Investigación propia del Cuerpo Académico: búsqueda en PubMed por dominio, recuperación del resumen de cada PMID declarado y verificación de cada cifra contra el texto real del resumen. Se publican sensibilidad, especificidad, razones de verosimilitud, intervalos, población y la cita textual que respalda el dato.</td></tr>',
'<tr><td><b>Índice</b></td><td>Entradas cuyo rendimiento diagnóstico está compilado en <i>Evidence-Based Physical Diagnosis</i> de Steven McGee. Se publica la nomenclatura en español, la descripción de la maniobra, el patrón de referencia, la clasificación cualitativa y el localizador exacto —caja y página—, pero <b>no las cifras</b>: la compilación es obra protegida de su autor y su editorial. El registro le dice que el signo <i>ha sido medido</i> y dónde leer el número.</td></tr></table>',
'<p>El nivel de confianza de cada registro es <b>calculado, nunca declarado</b>: A si la cifra se localizó literalmente en la fuente primaria, C si la cita se verificó pero las cifras no pudieron anclarse al resumen. Ninguna cifra fue escrita a mano y ninguna referencia fue redactada sin resolverse antes contra Crossref o PubMed.</p>',
'<p class="fuente">Fuente de referencia del índice: McGee S. <i>Evidence-Based Physical Diagnosis</i>. 3rd ed. Philadelphia: Elsevier Saunders; 2012. Marco conceptual: Fagan TJ. <i>N Engl J Med</i>. 1975;293(5):257 · Pauker SG, Kassirer JP. <i>N Engl J Med</i>. 1980;302:1109-1117 · Jaeschke R, Guyatt GH, Sackett DL. <i>JAMA</i>. 1994;271(9):703-707.</p>'
  ].join('');

  var GUIA_EN = [
'<h3>What a likelihood ratio is</h3>',
'<p>A likelihood ratio (LR) answers a single question: <b>how much does the probability of disease change when I find (or fail to find) this sign?</b> Its decisive virtue is that, unlike the positive predictive value, <b>it does not depend on prevalence</b>. That is why it is the figure worth memorising and the only one that transfers between settings with reasonable safety.</p>',
'<table><tr><th>LR+</th><th>Effect</th><th>LR−</th><th>Effect</th></tr>',
'<tr class="destaca"><td class="n">&gt; 10</td><td>Almost rules in on its own</td><td class="n">&lt; 0.1</td><td>Almost rules out on its own</td></tr>',
'<tr><td class="n">5 – 10</td><td>Substantial change</td><td class="n">0.1 – 0.2</td><td>Substantial change</td></tr>',
'<tr><td class="n">2 – 5</td><td>Moderate change</td><td class="n">0.2 – 0.5</td><td>Moderate change</td></tr>',
'<tr><td class="n">1 – 2</td><td>Minimal change</td><td class="n">0.5 – 1</td><td>Minimal change</td></tr>',
'<tr class="mala"><td class="n">= 1</td><td colspan="3"><b>Useless: the finding changes nothing</b></td></tr></table>',
'<p class="fuente">Jaeschke R, Guyatt GH, Sackett DL. <i>JAMA</i>. 1994;271(9):703-707 · Deeks JJ, Altman DG. <i>BMJ</i>. 2004;329:168-169.</p>',

'<h3>The 15–30–45 rule</h3>',
'<p>For mental arithmetic, with no calculator or nomogram, in the mid-range of probabilities:</p>',
'<table><tr><th>If the sign is present</th><th class="n"></th><th>If the sign is absent</th><th class="n"></th></tr>',
'<tr><td class="n">LR+ 2</td><td class="n">+15 points</td><td class="n">LR− 0.5</td><td class="n">−15 points</td></tr>',
'<tr><td class="n">LR+ 5</td><td class="n">+30 points</td><td class="n">LR− 0.2</td><td class="n">−30 points</td></tr>',
'<tr><td class="n">LR+ 10</td><td class="n">+45 points</td><td class="n">LR− 0.1</td><td class="n">−45 points</td></tr></table>',
'<p class="fuente">Intermediate values: LR 3 → +20 · LR 4 → +25 · LR 6 → +35 · LR 8 → +40. McGee S. <i>Simplifying likelihood ratios</i>. <i>J Gen Intern Med</i>. 2002;17(8):646-649. PMID 12213147.</p>',

'<h3>What “does not discriminate” means</h3>',
'<p>When the 95% confidence interval of a likelihood ratio <b>contains 1</b>, the available data do not support the claim that the finding shifts the probability in either direction. <b>This is not missing data: it is the result.</b> In this finder those records are labelled <span class="pill pill--nulo">Does not discriminate</span>.</p>',
'<div class="callout"><p>A high specificity paired with a non-significant LR+ usually signals <b>few events</b>: the interval widens so much that the point estimate no longer holds. Be sceptical of spectacular figures that come with intervals spanning three orders of magnitude.</p></div>',
'<p>Try <button class="chip" data-goto="Homans">Homans</button> <button class="chip" data-goto="Blumberg">Blumberg</button> <button class="chip" data-goto="Kernig">Kernig</button> for the classic examples.</p>',

'<h3>The other half of the question: interobserver agreement</h3>',
'<p>A sign with an excellent likelihood ratio that two examiners do not see the same way is <b>useless at the bedside</b>. The κ coefficient measures agreement between observers after correcting for the agreement expected by chance: κ = 0 is a coin toss; κ = 1 is perfect agreement. By convention, values below 0.2 read as slight agreement; 0.2–0.4 fair; 0.4–0.6 moderate; 0.6–0.8 substantial; ≥ 0.8 almost perfect.</p>',
'<p><b>Reproducibility and validity are two different questions.</b> There are signs on which two physicians agree almost perfectly and which nonetheless discriminate nothing; and signs with high likelihood ratios that only work if the examiner knows how to elicit them.</p>',

'<h3>The reference standard is not perfect either</h3>',
'<p>Before demanding accuracy from the physical examination, it is worth looking at what it is being judged against. The infiltrate on chest radiography — the standard against which nearly every sign of pneumonia is measured — shows interobserver agreement that barely reaches the “fair” band. <b>When the reference standard is blurred, the likelihood ratio of the clinical sign is underestimated:</b> part of what we call “examiner error” is in fact radiologist error.</p>',
'<p>That is why every record in this finder states <b>its reference standard as a visible field</b>, not a footnote. A sign validated against computed tomography and one validated against “the attending’s clinical impression” are not comparable.</p>',

'<h3>Why performance drops from the paper to the bedside</h3>',
'<table><tr><th>Bias</th><th>What it is</th><th>Effect</th></tr>',
'<tr><td><b>Spectrum</b></td><td>Severely ill patients are compared with healthy controls rather than the real clinical spectrum.</td><td>Inflates Sn and Sp</td></tr>',
'<tr><td><b>Verification</b></td><td>Only those with a positive sign are confirmed with the gold standard.</td><td>Inflates Sn, deflates Sp</td></tr>',
'<tr><td><b>Review</b></td><td>Whoever reads the gold standard knows the examination result, or vice versa.</td><td>Inflates everything</td></tr>',
'<tr><td><b>Incorporation</b></td><td>The sign is itself part of the gold standard.</td><td>Inflates everything, circularly</td></tr></table>',
'<p class="fuente">Lijmer JG, et al. <i>JAMA</i>. 1999;282(11):1061-1066. PMID 10493205 · Whiting PF, et al. QUADAS-2. <i>Ann Intern Med</i>. 2011;155(8):529-536. PMID 22007046.</p>',
'<div class="callout"><p><b>A caveat on dates.</b> Much of this evidence was generated between 1980 and 2010. The prevalence, populations and reference standards of that era are not today’s: a sign validated against hepatobiliary scintigraphy in 1990 behaves differently in a service where ultrasound is available within ten minutes.</p></div>',

'<h3>How this database is built</h3>',
'<p>It brings together two bodies of evidence with different rules, and the finder always keeps them apart:</p>',
'<table><tr><th>Source</th><th>What it contains</th></tr>',
'<tr><td><b>Figures</b></td><td>Original research by the Research Group: PubMed searches by domain, retrieval of the abstract for every declared PMID, and verification of every figure against the actual text of that abstract. Sensitivity, specificity, likelihood ratios, intervals, population and the verbatim quote supporting the datum are all published.</td></tr>',
'<tr><td><b>Index</b></td><td>Entries whose diagnostic performance is compiled in Steven McGee’s <i>Evidence-Based Physical Diagnosis</i>. We publish the Spanish nomenclature, the description of the maneuver, the reference standard, the qualitative classification and the exact locator — box and page — but <b>not the figures</b>: the compilation is protected work belonging to its author and publisher. The record tells you the sign <i>has been measured</i> and where to read the number.</td></tr></table>',
'<p>The confidence level of each record is <b>computed, never asserted</b>: A when the figure was located verbatim in the primary source, C when the citation was verified but the figures could not be anchored to the abstract. No figure was hand-entered and no reference was written without first being resolved against Crossref or PubMed.</p>',
'<p class="fuente">Reference work for the index: McGee S. <i>Evidence-Based Physical Diagnosis</i>. 3rd ed. Philadelphia: Elsevier Saunders; 2012. Conceptual framework: Fagan TJ. <i>N Engl J Med</i>. 1975;293(5):257 · Pauker SG, Kassirer JP. <i>N Engl J Med</i>. 1980;302:1109-1117 · Jaeschke R, Guyatt GH, Sackett DL. <i>JAMA</i>. 1994;271(9):703-707.</p>'
  ].join('');
})();
