/**
 * Calculadora D3 · Intervalo de confianza de una proporción (seis métodos).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/ic-proporcion.yml.
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
import { amplitud, icProporcionTodos } from '../metodos/proporciones.ts';
import { rellenar } from '../nucleo/plantillas.ts';

export interface EntradasIcProporcion extends Entradas {
  x: number;
  n: number;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = ['p', 'wilson', 'wilson_cc', 'clopper_pearson', 'agresti_coull', 'jeffreys', 'wald'] as const;
export type SalidaIcProporcion = (typeof SALIDAS)[number];

const METODOS: ReadonlyArray<Exclude<SalidaIcProporcion, 'p'>> = [
  'wilson',
  'wilson_cc',
  'clopper_pearson',
  'agresti_coull',
  'jeffreys',
  'wald',
];

/** ¿Wald degenerado (x = 0 o x = n): amplitud 0, no reportable? */
export function waldInvalido(x: number, n: number): boolean {
  return x === 0 || x === n;
}

export function calcular(e: EntradasIcProporcion, nivel: number): Resultado<'ic-proporcion'> {
  const { x, n } = e;
  const r = icProporcionTodos(x, n, nivel);
  const valores: Record<string, Estimacion> = {
    p: { valor: x / n, metodo: 'puntual' },
    wilson: r.wilson,
    wilson_cc: r['wilson-cc'],
    clopper_pearson: r['clopper-pearson'],
    agresti_coull: r['agresti-coull'],
    jeffreys: r.jeffreys,
    wald: r.wald,
  };
  const avisos: Resultado['avisos'] = [];
  if (waldInvalido(x, n)) avisos.push({ codigo: 'wald_invalido', severidad: 'aviso' });
  else if (x < 5 || n - x < 5) avisos.push({ codigo: 'wald_no_recomendado', severidad: 'aviso' });
  if (n < 40) avisos.push({ codigo: 'n_pequeno', severidad: 'info', params: { n } });
  // Con n ≥ 40 y al menos 5 casos en cada categoría los métodos son casi
  // intercambiables (Brown, Cai y DasGupta 2001); en otro caso difieren.
  const comparacion = n >= 40 && x >= 5 && n - x >= 5 ? 'similares' : 'difieren';
  return {
    calculadora: 'ic-proporcion',
    version: 1,
    entradas: { x, n, nivel },
    valores,
    bandas: { comparacion },
    avisos,
  };
}

/** Amplitudes (como proporción) de los métodos comparables; excluye Wald cuando es degenerado. */
function amplitudes(s: Resultado, x: number, n: number): number[] {
  return METODOS.filter((m) => !(m === 'wald' && waldInvalido(x, n))).map((m) => amplitud(s.valores[m]));
}

export function presentar(s: Resultado, e: EntradasIcProporcion, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const { x, n } = e;
  const nivel = s.valores.wilson.nivel ?? ctx.nivel;
  const wilson = s.valores.wilson;
  const amp = amplitudes(s, x, n);
  const vars: Record<string, string | number> = {
    x: fmt.entero(x),
    n: fmt.entero(n),
    p: fmt.num(s.valores.p.valor, 'pct1'),
    nivel: fmt.nivel(nivel),
    wilson_lo: fmt.num(wilson.ic ? wilson.ic[0] : NaN, 'pct1'),
    wilson_hi: fmt.num(wilson.ic ? wilson.ic[1] : NaN, 'pct1'),
    amplitud_min: fmt.num(Math.min(...amp), 'pct1'),
    amplitud_max: fmt.num(Math.max(...amp), 'pct1'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };

  const celdas: Presentacion['celdas'] = {
    p: { valor: fmt.num(s.valores.p.valor, 'pct1') },
  };
  const resumen: Presentacion['resumen'] = [[textos.etiquetas.p, celdas.p.valor, '']];
  for (const m of METODOS) {
    const est = s.valores[m];
    const invalido = m === 'wald' && waldInvalido(x, n);
    const ancho = est.ic ? est.ic[1] - est.ic[0] : NaN;
    const celda: Presentacion['celdas'][string] = {
      valor: fmt.num(est.valor, 'pct1'),
      ic: fmt.ic(est.ic, 'pct1'),
      nota: invalido ? ctx.ui['invalido'] : `${textos.etiquetas.amplitud}: ${fmt.num(ancho, 'pct1')}`,
    };
    if (m === 'wilson') celda.clase = 'destacada';
    if (invalido) celda.clase = 'invalida';
    celdas[m] = celda;
    resumen.push([textos.etiquetas[m], celda.valor, celda.ic ?? '']);
  }

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`comparacion.${s.bandas.comparacion}`], vars),
  ];
  if (waldInvalido(x, n)) interpretacion.push(rellenar(textos.interpretacion.extremo, vars));

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((a) => a.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, e: EntradasIcProporcion, ctx: Contexto): DatosGrafica | null {
  const { textos } = ctx;
  const filas: FilaIC[] = METODOS.map((m) => ({
    id: m,
    etiqueta: textos.etiquetas[m],
    valor: s.valores[m].valor,
    lo: s.valores[m].ic?.[0],
    hi: s.valores[m].ic?.[1],
    destacada: m === 'wilson',
  }));
  // Dominio ceñido a los datos con holgura (no [0, 1]): lo que interesa ver es
  // en qué difieren los seis intervalos, no su posición absoluta. Los límites
  // que se salen de [0, 1] (Wald, Agresti-Coull) se conservan a la vista.
  const extremos = filas.flatMap((f) => [f.lo, f.hi]).filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const lo = Math.min(...extremos);
  const hi = Math.max(...extremos);
  const holgura = Math.max((hi - lo) * 0.08, 0.005);
  const dominio: [number, number] = [lo < 0 ? lo - holgura : Math.max(0, lo - holgura), hi > 1 ? hi + holgura : Math.min(1, hi + holgura)];
  return {
    tipo: 'ic-forest',
    titulo: textos.grafica_titulo ?? textos.etiquetas.p,
    resumen: `${textos.etiquetas.p}: ${ctx.fmt.num(s.valores.p.valor, 'pct1')} (${textos.etiquetas.wilson}: ${ctx.fmt.ic(s.valores.wilson.ic, 'pct1')})`,
    filas,
    dominio,
    escala: 'lineal',
    pista: 'pct0',
  };
}

export const definicion: Definicion<EntradasIcProporcion> = {
  id: 'ic-proporcion',
  motor: 'ts',
  claves: ['resumen', 'comparacion.similares', 'comparacion.difieren', 'extremo'],
  avisos: ['wald_invalido', 'wald_no_recomendado', 'n_pequeno'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    if (!Number.isInteger(e.x) || e.x < 0) err.x = 'err_entero';
    if (!Number.isInteger(e.n) || e.n < 1) err.n = 'err_entero';
    if (!err.x && !err.n && e.x > e.n) err.x = 'err_x_mayor_n';
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
