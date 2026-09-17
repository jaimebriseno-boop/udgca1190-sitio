/**
 * Calculadora A1 · Rendimiento de una prueba diagnóstica (tabla 2×2).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/prueba-diagnostica-2x2.yml.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  FilaIC,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { bandaLrNeg, bandaLrPos } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { METODOS_IC_2X2, SALIDAS_2X2, diagnostico2x2, hayCeldaCero } from '../metodos/diagnostico.ts';
import type { MetodoIc2x2 } from '../metodos/diagnostico.ts';
import { CORRECCIONES } from '../metodos/razones.ts';
import type { Correccion } from '../metodos/razones.ts';

export interface EntradasDx2x2 extends Entradas {
  vp: number;
  fp: number;
  fn: number;
  vn: number;
  nivel: number;
  /** Método del IC de las proporciones (selector). */
  metodo: string;
  /** 0 | 0.5 (Haldane-Anscombe), solo para las razones. */
  corr: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_2X2;
export const CELDAS = ['vp', 'fp', 'fn', 'vn'] as const;

/** Medidas que son proporciones (celdas en %, IC del método elegido). */
const PROPORCIONES = ['sn', 'sp', 'vpp', 'vpn', 'prev', 'exactitud'] as const;
/** Razones (LR±, DOR): pista `lr`, IC logarítmico o «no definido». */
const RAZONES = ['lr_pos', 'lr_neg', 'dor'] as const;

/** Referencias que cita el párrafo de Métodos según el método de IC elegido. */
const REFS_METODO: Record<MetodoIc2x2, readonly string[]> = {
  wilson: ['wilson1927', 'newcombe1998'],
  'clopper-pearson': ['clopper1934'],
  'agresti-coull': ['agresti1998'],
  jeffreys: ['brown2001'],
  wald: ['altman2000'],
};

function esMetodo(m: unknown): m is MetodoIc2x2 {
  return typeof m === 'string' && (METODOS_IC_2X2 as readonly string[]).includes(m);
}

function esCorreccion(c: unknown): c is Correccion {
  return typeof c === 'number' && (CORRECCIONES as readonly number[]).includes(c);
}

export function calcular(e: EntradasDx2x2, nivel: number): Resultado<'prueba-diagnostica-2x2'> {
  const { vp, fp, fn, vn } = e;
  const metodo: MetodoIc2x2 = esMetodo(e.metodo) ? e.metodo : 'wilson';
  const corr: Correccion = esCorreccion(e.corr) ? e.corr : 0;
  const v = diagnostico2x2(vp, fp, fn, vn, { nivel, metodo, corr });

  const avisos: Resultado['avisos'] = [];
  if (hayCeldaCero(vp, fp, fn, vn) && corr === 0) avisos.push({ codigo: 'celda_cero', severidad: 'aviso' });
  if (corr === 0.5) avisos.push({ codigo: 'haldane_aplicado', severidad: 'info' });
  if (vp + fn < 10 || fp + vn < 10) {
    avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { enfermos: vp + fn, sanos: fp + vn } });
  }
  if (v.prev.valor < 0.05 || v.prev.valor > 0.95) avisos.push({ codigo: 'prev_extrema', severidad: 'info' });
  if (metodo === 'wald' && (vp < 5 || fp < 5 || fn < 5 || vn < 5)) {
    avisos.push({ codigo: 'wald_no_recomendado', severidad: 'aviso' });
  }
  if (v.lr_pos.valor < 1 || v.lr_neg.valor > 1) avisos.push({ codigo: 'tabla_invertida', severidad: 'aviso' });

  return {
    calculadora: 'prueba-diagnostica-2x2',
    version: 1,
    entradas: { vp, fp, fn, vn, nivel, metodo, corr },
    valores: { ...v },
    bandas: { lr_pos: bandaLrPos(v.lr_pos.valor), lr_neg: bandaLrNeg(v.lr_neg.valor) },
    avisos,
  };
}

/** ¿El intervalo existe y es finito? (las razones con celda 0 quedan sin intervalo). */
function icDefinido(est: Estimacion): est is Estimacion & { ic: [number, number] } {
  return est.ic !== undefined && Number.isFinite(est.ic[0]) && Number.isFinite(est.ic[1]);
}

export function presentar(s: Resultado, e: EntradasDx2x2, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const { vp, fp, fn, vn } = e;
  const nivel = s.valores.sn.nivel ?? ctx.nivel;
  const metodo: MetodoIc2x2 = esMetodo(e.metodo) ? e.metodo : 'wilson';
  const corr: Correccion = esCorreccion(e.corr) ? e.corr : 0;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });

  /** «IC 95 %: 7.75 a 37.3» o «IC no definido». */
  const icRazon = (est: Estimacion): string => (icDefinido(est) ? `${icNivel}: ${fmt.ic(est.ic, 'lr')}` : ui.sin_ic);
  const refsMetodo = `[${REFS_METODO[metodo].map((k) => {
    const n = ctx.refs[k];
    if (n === undefined) throw new Error(`prueba-diagnostica-2x2: la referencia ${k} no está en la lista del YAML`);
    return n;
  }).join(',')}]`;

  const vars: Record<string, string | number> = {
    vp: fmt.entero(vp),
    fp: fmt.entero(fp),
    fn: fmt.entero(fn),
    vn: fmt.entero(vn),
    n: fmt.entero(s.valores.n.valor),
    nivel: fmt.nivel(nivel),
    youden: fmt.num(s.valores.youden.valor, 'dec2'),
    youden_ic: fmt.ic(s.valores.youden.ic, 'dec2'),
    metodo_nombre: textos.etiquetas[`metodo.${metodo}`] ?? metodo,
    metodo_refs: refsMetodo,
    nota_corr: corr === 0.5 ? ' ' + rellenar(textos.interpretacion.metodos_haldane, {}, ctx.refs) : '',
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  for (const k of PROPORCIONES) {
    vars[k] = fmt.num(s.valores[k].valor, 'pct1');
    vars[`${k}_ic`] = fmt.ic(s.valores[k].ic, 'pct1');
  }
  for (const k of RAZONES) {
    vars[k] = fmt.num(s.valores[k].valor, 'lr');
    vars[`${k}_ic`] = icRazon(s.valores[k]);
  }

  const celdas: Presentacion['celdas'] = {
    n: { valor: fmt.entero(s.valores.n.valor) },
  };
  for (const k of PROPORCIONES) {
    celdas[k] = {
      valor: fmt.num(s.valores[k].valor, 'pct1'),
      ic: fmt.ic(s.valores[k].ic, 'pct1'),
      nota: `${icNivel} · ${textos.etiquetas[`metodo.${metodo}`] ?? metodo}`,
    };
  }
  celdas.sn.clase = 'destacada';
  celdas.sp.clase = 'destacada';
  celdas.youden = {
    valor: fmt.num(s.valores.youden.valor, 'dec2'),
    ic: fmt.ic(s.valores.youden.ic, 'dec2'),
    nota: `${icNivel} · ${textos.etiquetas.nota_youden}`,
  };
  for (const k of RAZONES) {
    const est = s.valores[k];
    celdas[k] = icDefinido(est)
      ? { valor: fmt.num(est.valor, 'lr'), ic: fmt.ic(est.ic, 'lr'), nota: `${icNivel} · ${textos.etiquetas[k === 'dor' ? 'nota_dor' : 'nota_lr']}` }
      : { valor: fmt.num(est.valor, 'lr'), nota: ui.sin_ic };
  }

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, celdas[k].ic ?? '']);

  // 0 y ∞ (celda en 0 sin corrección) no tienen intervalo ni lectura como «veces mayores».
  const dorDefinido = Number.isFinite(s.valores.dor.valor) && s.valores.dor.valor > 0;
  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`lr_pos.${s.bandas.lr_pos}`], vars),
    rellenar(textos.interpretacion[`lr_neg.${s.bandas.lr_neg}`], vars),
    rellenar(textos.interpretacion.predictivos, vars),
    rellenar(textos.interpretacion[dorDefinido ? 'dor' : 'dor.indefinido'], vars),
  ];

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((a) => a.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, _e: EntradasDx2x2, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const fila = (k: string, destacada = false): FilaIC => ({
    id: k,
    etiqueta: textos.etiquetas[k],
    valor: s.valores[k].valor,
    lo: s.valores[k].ic?.[0],
    hi: s.valores[k].ic?.[1],
    destacada,
  });
  return {
    tipo: 'ic-forest',
    titulo: textos.grafica_titulo ?? textos.etiquetas.sn,
    resumen: `${textos.etiquetas.sn}: ${fmt.num(s.valores.sn.valor, 'pct1')} (${fmt.ic(s.valores.sn.ic, 'pct1')}); ${textos.etiquetas.sp}: ${fmt.num(s.valores.sp.valor, 'pct1')} (${fmt.ic(s.valores.sp.ic, 'pct1')}); ${textos.etiquetas.lr_pos}: ${fmt.num(s.valores.lr_pos.valor, 'lr')}; ${textos.etiquetas.lr_neg}: ${fmt.num(s.valores.lr_neg.valor, 'lr')}`,
    filas: [fila('sn', true), fila('sp', true), fila('vpp'), fila('vpn'), fila('exactitud')],
    dominio: [0, 1],
    escala: 'lineal',
    pista: 'pct0',
    paneles: [
      {
        rotulo: textos.etiquetas.grafica_razones,
        filas: [fila('lr_pos', true), fila('lr_neg', true), fila('dor')],
        escala: 'log',
        referencia: 1,
        pista: 'lr',
      },
    ],
  };
}

export const definicion: Definicion<EntradasDx2x2> = {
  id: 'prueba-diagnostica-2x2',
  motor: 'ts',
  claves: [
    'resumen',
    'lr_pos.grande',
    'lr_pos.moderado',
    'lr_pos.pequeno',
    'lr_pos.minimo',
    'lr_pos.nulo',
    'lr_neg.grande',
    'lr_neg.moderado',
    'lr_neg.pequeno',
    'lr_neg.minimo',
    'lr_neg.nulo',
    'predictivos',
    'dor',
    'dor.indefinido',
    'metodos_haldane',
  ],
  avisos: ['celda_cero', 'haldane_aplicado', 'n_pequeno', 'prev_extrema', 'wald_no_recomendado', 'tabla_invertida'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of CELDAS) {
      if (!Number.isInteger(e[k]) || e[k] < 0) err[k] = 'err_entero';
    }
    if (Object.keys(err).length === 0) {
      // Sin denominador no hay proporción: cada fila (positivos, negativos) y
      // cada columna (enfermos, sanos) debe tener al menos una observación.
      if (e.vp + e.fn === 0) err.vp = err.fn = 'err_columna_vacia';
      if (e.fp + e.vn === 0) err.fp = err.vn = 'err_columna_vacia';
      if (e.vp + e.fp === 0) err.vp = err.fp = 'err_fila_vacia';
      if (e.fn + e.vn === 0) err.fn = err.vn = 'err_fila_vacia';
    }
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    if (!esMetodo(e.metodo)) err.metodo = 'err_opcion';
    if (!esCorreccion(e.corr)) err.corr = 'err_opcion';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
