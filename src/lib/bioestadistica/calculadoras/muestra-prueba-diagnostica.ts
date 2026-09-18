/**
 * Calculadora C6 · Tamaño de muestra para estimar la sensibilidad y la
 * especificidad de una prueba diagnóstica (Buderer 1996).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/muestra-prueba-diagnostica.yml.
 */
import type {
  Contexto,
  Curva,
  DatosGrafica,
  Definicion,
  Entradas,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { techo } from '../metodos/muestra-comun.ts';
import {
  PREVALENCIA_ALTA,
  PREVALENCIA_BAJA,
  PROPORCION_EXTREMA,
  SALIDAS_BUDERER,
  W_GRANDE,
  W_MAXIMO,
  W_MINIMO,
  mandaEn,
  muestraDiagnostica,
  totalParaSn,
  totalParaSp,
} from '../metodos/muestra-diagnostica.ts';

export interface EntradasMuestraDiagnostica extends Entradas {
  sn: number;
  sp: number;
  prev: number;
  /** Semiamplitud del intervalo (precisión absoluta). */
  w: number;
  nivel: number;
  /** Pérdidas previstas; vacío = 0. */
  perdidas: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_BUDERER;

/**
 * Tamaños de muestra: el techo va en el titular y el valor exacto en la nota.
 * Dos decimales, no uno: con un decimal, 195.96 se escribiría «196.0», idéntico
 * al techo, y el detalle dejaría de explicar de dónde sale. Por debajo de 1, dos
 * decimales dirían «0.00» y harían creer que no hace falta nadie, así que ahí
 * mandan las cifras significativas. Convenio común a las siete calculadoras del
 * grupo `muestra`.
 */
const TAMANOS = ['n_d', 'n_sn', 'n_nd', 'n_sp', 'n_total', 'n_ajustado'] as const;

/** Prevalencias que recorre la gráfica: de 0.02 a 0.98 en pasos de 0.01 (97 puntos). */
const PREV_MINIMA_CURVA = 0.02;
const PREV_MAXIMA_CURVA = 0.98;
const PASO_CURVA = 0.01;

/**
 * Altura del eje vertical, en múltiplos del total recomendado. Las dos curvas
 * son hipérbolas que se disparan cerca de 0 y de 1: sin recorte, una sola
 * prevalencia extrema aplastaría el resto de la gráfica contra el eje.
 */
const FACTOR_EJE_Y = 3;

/**
 * Techo de presentación de un tamaño de muestra, en participantes. `techo()`
 * tolera 1e-9 absoluto para que 322.00000000001 no suba a 323, y esa tolerancia
 * hunde a 0 un tamaño positivo pero diminuto: con Sn = 1e-12 salen 6.6e-12
 * enfermos. Ni un estudio se hace con 0 participantes ni `ceiling()` de R
 * devuelve 0 ahí, así que el suelo de la presentación es 1. Mismo helper que
 * `muestra-una-proporcion` y `muestra-una-media`.
 */
function participantes(n: number): number {
  const redondeado = techo(n);
  return n > 0 && redondeado < 1 ? 1 : redondeado;
}

/** ¿Es una proporción estrictamente entre 0 y 1? (en 0 o en 1 la varianza es 0 y el diseño no existe). */
function proporcionEstricta(v: unknown): v is number {
  return typeof v === 'number' && v > 0 && v < 1;
}

export function calcular(e: EntradasMuestraDiagnostica, nivel: number): Resultado<'muestra-prueba-diagnostica'> {
  const perdidas = typeof e.perdidas === 'number' ? e.perdidas : 0;
  const nivelUsado = typeof e.nivel === 'number' ? e.nivel : nivel;
  const v = muestraDiagnostica({ sn: e.sn, sp: e.sp, prev: e.prev, w: e.w, nivel: nivelUsado, perdidas });

  const avisos: Resultado['avisos'] = [{ codigo: 'supuestos', severidad: 'info' }];
  if (e.sn >= PROPORCION_EXTREMA || e.sp >= PROPORCION_EXTREMA) {
    avisos.push({ codigo: 'wald_subestima', severidad: 'aviso' });
  }
  if (e.prev < PREVALENCIA_BAJA) avisos.push({ codigo: 'prevalencia_baja', severidad: 'aviso' });
  if (e.prev > PREVALENCIA_ALTA) avisos.push({ codigo: 'prevalencia_alta', severidad: 'aviso' });
  if (e.w >= W_GRANDE) avisos.push({ codigo: 'w_grande', severidad: 'aviso' });

  return {
    calculadora: 'muestra-prueba-diagnostica',
    version: 1,
    entradas: { sn: e.sn, sp: e.sp, prev: e.prev, w: e.w, nivel: nivelUsado, perdidas },
    valores: {
      z: { valor: v.z, metodo: 'normal' },
      n_d: { valor: v.n_d, metodo: 'buderer' },
      n_sn: { valor: v.n_sn, metodo: 'buderer' },
      n_nd: { valor: v.n_nd, metodo: 'buderer' },
      n_sp: { valor: v.n_sp, metodo: 'buderer' },
      n_total: { valor: v.n_total, metodo: 'buderer' },
      n_ajustado: { valor: v.n_ajustado, metodo: 'buderer' },
    },
    bandas: { manda: mandaEn(v), perdidas: perdidas > 0 ? 'con' : 'sin' },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasMuestraDiagnostica, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const v = s.valores;
  const perdidas = typeof e.perdidas === 'number' ? e.perdidas : 0;
  const nivel = typeof e.nivel === 'number' ? e.nivel : ctx.nivel;

  /** El techo se aplica UNA sola vez, aquí: la biblioteca nunca redondea. */
  const conTecho = (k: (typeof TAMANOS)[number]): string => fmt.entero(participantes(v[k].valor));
  /** Nota de la celda: el valor sin redondear, para que se vea de dónde sale el techo. */
  const exacto = (k: (typeof TAMANOS)[number]): string =>
    rellenar(textos.etiquetas.exacto, { valor: fmt.num(v[k].valor, v[k].valor < 1 ? 'sig3' : 'dec2') });

  const vars: Record<string, string | number> = {
    sn: fmt.num(e.sn, 'pct1'),
    sp: fmt.num(e.sp, 'pct1'),
    prev: fmt.num(e.prev, 'pct1'),
    // La semiamplitud se lee «±0.05», no «±0.050»: dos cifras significativas
    // cubren desde 0.005 hasta 0.5 sin decimales de relleno.
    w: fmt.num(e.w, 'sig2'),
    nivel: fmt.nivel(nivel),
    perdidas: fmt.num(perdidas, 'pct0'),
    z: fmt.num(v.z.valor, 'dec3'),
    n_d_techo: conTecho('n_d'),
    n_sn_techo: conTecho('n_sn'),
    n_nd_techo: conTecho('n_nd'),
    n_sp_techo: conTecho('n_sp'),
    n_total_techo: conTecho('n_total'),
    n_ajustado_techo: conTecho('n_ajustado'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // El párrafo de Métodos cambia según se prevean pérdidas o no.
  vars.metodos_perdidas = rellenar(textos.interpretacion[`metodos_perdidas.${s.bandas.perdidas}`], vars);

  // El orden de inserción es el de SALIDAS: la página pinta las celdas en el
  // orden del objeto, y ese orden es el del JSON de R y el de las etiquetas.
  const celdas: Presentacion['celdas'] = { z: { valor: fmt.num(v.z.valor, 'dec3') } };
  const mandante = s.bandas.manda === 'sp' ? 'n_sp' : 'n_sn';
  for (const k of TAMANOS) {
    const destacada = k === 'n_total' || k === 'n_ajustado' || k === mandante;
    celdas[k] = {
      valor: conTecho(k),
      nota: exacto(k),
      ...(destacada ? { clase: 'destacada' as const } : {}),
    };
  }
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`manda.${s.bandas.manda}`], vars),
    rellenar(textos.interpretacion[`perdidas.${s.bandas.perdidas}`], vars),
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

/**
 * Pacientes a reclutar frente a la prevalencia: una curva para la sensibilidad
 * (n_D/P, que se dispara cuando la enfermedad es rara) y otra para la
 * especificidad (n_D̄/(1 − P), que se dispara cuando es casi universal). Los
 * puntos por encima del dominio del eje se omiten en vez de aplastarse contra
 * el borde: la curva se dibuja hasta donde cabe y se ve dónde se sale.
 */
export function grafica(s: Resultado, e: EntradasMuestraDiagnostica, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const v = s.valores;
  const z = v.z.valor;
  const yMax = FACTOR_EJE_Y * v.n_total.valor;

  const puntos = (f: (prev: number) => number): Array<[number, number]> => {
    const salida: Array<[number, number]> = [];
    const pasos = Math.round((PREV_MAXIMA_CURVA - PREV_MINIMA_CURVA) / PASO_CURVA);
    for (let i = 0; i <= pasos; i += 1) {
      const p = PREV_MINIMA_CURVA + i * PASO_CURVA;
      const y = f(p);
      if (y <= yMax) salida.push([p, y]);
    }
    return salida;
  };

  const curvas: Curva[] = [
    {
      id: 'n_sn',
      etiqueta: textos.etiquetas.curva_sn,
      puntos: puntos((p) => totalParaSn(e.sn, p, e.w, z)),
      destacada: true,
    },
    {
      id: 'n_sp',
      etiqueta: textos.etiquetas.curva_sp,
      puntos: puntos((p) => totalParaSp(e.sp, p, e.w, z)),
    },
  ];

  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.n_total,
    resumen: `${textos.etiquetas.marcador_prev} ${fmt.num(e.prev, 'pct1')}: ${textos.etiquetas.curva_sn} ${fmt.entero(participantes(v.n_sn.valor))} ${textos.etiquetas.personas}, ${textos.etiquetas.curva_sp} ${fmt.entero(participantes(v.n_sp.valor))} ${textos.etiquetas.personas}.`,
    curvas,
    ejeX: { etiqueta: textos.etiquetas.eje_prev, dominio: [0, 1], pista: 'pct0' },
    ejeY: { etiqueta: textos.etiquetas.eje_n, dominio: [0, yMax], pista: 'int' },
    marcador: {
      x: e.prev,
      etiqueta: fmt.num(e.prev, 'pct1'),
      valores: { n_sn: v.n_sn.valor, n_sp: v.n_sp.valor },
    },
    referenciaY: { valor: v.n_total.valor, etiqueta: textos.etiquetas.ref_total },
  };
}

export const definicion: Definicion<EntradasMuestraDiagnostica> = {
  id: 'muestra-prueba-diagnostica',
  motor: 'ts',
  claves: [
    'resumen',
    'manda.sn',
    'manda.sp',
    'perdidas.con',
    'perdidas.sin',
    'metodos_perdidas.con',
    'metodos_perdidas.sin',
  ],
  avisos: ['supuestos', 'wald_subestima', 'prevalencia_baja', 'prevalencia_alta', 'w_grande'],
  salidas: SALIDAS,
  // Unas pérdidas vacías valen 0: así el snippet de R siempre tiene su marcador
  // y la URL conserva lo capturado.
  derivar(e) {
    return { perdidas: typeof e.perdidas === 'number' ? e.perdidas : 0 };
  },
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of ['sn', 'sp', 'prev'] as const) {
      const valor = e[k];
      if (!(typeof valor === 'number' && valor >= 0 && valor <= 1)) err[k] = 'err_proporcion';
      // En 0 y en 1 la varianza binomial es 0 y la fórmula devolvería n = 0:
      // no es un extremo del rango, es un diseño que no existe.
      else if (!proporcionEstricta(valor)) err[k] = 'err_rango';
    }
    if (!(typeof e.w === 'number' && e.w >= W_MINIMO && e.w <= W_MAXIMO)) err.w = 'err_rango';
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    if (!(typeof e.perdidas === 'number' && e.perdidas >= 0 && e.perdidas <= 0.5)) err.perdidas = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
