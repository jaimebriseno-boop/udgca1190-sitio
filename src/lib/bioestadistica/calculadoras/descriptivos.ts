/**
 * Calculadora D6 · Descriptivos de una variable pegada.
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/descriptivos.yml.
 *
 * Es la primera calculadora cuya entrada principal es una columna (`tipo:
 * columna`): `x` llega como `number[]` y viaja entera al snippet de R, que la
 * interpola como `c(...)`.
 */
import type {
  BinHistograma,
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { bandaAsimetria } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import {
  K_TUKEY,
  N_MIN_COLUMNA,
  SALIDAS_DESCRIPTIVOS,
  binsSturges,
  cajaTukey,
  cercasTukey,
  descriptivos,
} from '../metodos/descriptivos.ts';
import { N_MAX_SHAPIRO } from '../metodos/shapiro.ts';

export interface EntradasDescriptivos extends Entradas {
  /** Columna pegada: al menos dos números finitos. */
  x: number[];
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_DESCRIPTIVOS;

/** n a partir del cual Shapiro-Wilk detecta desviaciones sin importancia práctica. */
export const N_GRANDE = 1000;

/** Medidas en las unidades de la variable: cuatro cifras significativas. */
const EN_UNIDADES = ['media', 'de', 'eem', 'mediana', 'q1', 'q3', 'iqr', 'min', 'max', 'rango', 'media_geom'] as const;

/** ¿La entrada es una columna utilizable (al menos dos números finitos)? */
function esColumna(v: unknown): v is number[] {
  return Array.isArray(v) && v.length >= N_MIN_COLUMNA && v.every((q) => typeof q === 'number' && Number.isFinite(q));
}

export function calcular(e: EntradasDescriptivos, nivel: number): Resultado<'descriptivos'> {
  const x = e.x;
  const v = descriptivos(x, { nivel });
  const n = x.length;

  const avisos: Resultado['avisos'] = [];
  // Un solo código para los dos umbrales: n < 3 deja fuera G1 y Shapiro-Wilk, n < 4 deja fuera G2.
  if (n < 4) avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n } });
  if (v.de.valor === 0) avisos.push({ codigo: 'constante', severidad: 'aviso' });
  if (Number.isNaN(v.media_geom.valor)) avisos.push({ codigo: 'no_positivos', severidad: 'info' });
  if (v.n_atipicos.valor > 0) {
    avisos.push({ codigo: 'atipicos', severidad: 'info', params: { n_atipicos: v.n_atipicos.valor, k: K_TUKEY } });
  }
  if (n > N_MAX_SHAPIRO) avisos.push({ codigo: 'sw_n_grande', severidad: 'info' });
  // `n_grande` advierte de cómo leer un valor p pequeño, así que solo tiene
  // sentido cuando hay valor p: por encima de 5,000 manda `sw_n_grande` y los
  // dos juntos se contradirían.
  if (n >= N_GRANDE && n <= N_MAX_SHAPIRO) avisos.push({ codigo: 'n_grande', severidad: 'info', params: { n } });

  const p = v.sw_p.valor;
  return {
    calculadora: 'descriptivos',
    version: 1,
    entradas: { x, nivel },
    valores: { ...v },
    bandas: {
      asimetria: bandaAsimetria(v.g1.valor),
      normalidad: Number.isNaN(p) ? 'no_aplica' : p < 0.05 ? 'evidencia' : 'sin_evidencia',
      n: n >= N_GRANDE ? 'grande' : 'normal',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasDescriptivos, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  const nivel = v.media.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const cercas = cercasTukey(v.q1.valor, v.q3.valor);

  const vars: Record<string, string | number> = {
    n: fmt.entero(v.n.valor),
    nivel: fmt.nivel(nivel),
    media_ic: fmt.ic(v.media.ic, 'sig4'),
    cv: fmt.num(v.cv.valor, 'pct1'),
    g1: fmt.num(v.g1.valor, 'dec2'),
    g2: fmt.num(v.g2.valor, 'dec2'),
    sw_w: fmt.num(v.sw_w.valor, 'dec3'),
    sw_p: fmt.num(v.sw_p.valor, 'p'),
    n_atipicos: fmt.entero(v.n_atipicos.valor),
    k: fmt.num(K_TUKEY, 'dec1'),
    cerca_inf: fmt.num(cercas.inferior, 'sig4'),
    cerca_sup: fmt.num(cercas.superior, 'sig4'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  for (const k of EN_UNIDADES) vars[k] = fmt.num(v[k].valor, 'sig4');

  const celdas: Presentacion['celdas'] = {
    n: { valor: fmt.entero(v.n.valor) },
    media: {
      valor: fmt.num(v.media.valor, 'sig4'),
      ic: fmt.ic(v.media.ic, 'sig4'),
      nota: `${icNivel} · ${textos.etiquetas.nota_t}`,
      clase: 'destacada',
    },
    de: { valor: fmt.num(v.de.valor, 'sig4'), clase: 'destacada' },
    eem: { valor: fmt.num(v.eem.valor, 'sig4') },
    mediana: { valor: fmt.num(v.mediana.valor, 'sig4'), nota: textos.etiquetas.nota_cuantil, clase: 'destacada' },
    q1: { valor: fmt.num(v.q1.valor, 'sig4'), nota: textos.etiquetas.nota_cuantil },
    q3: { valor: fmt.num(v.q3.valor, 'sig4'), nota: textos.etiquetas.nota_cuantil },
    iqr: { valor: fmt.num(v.iqr.valor, 'sig4'), nota: textos.etiquetas.nota_cuantil, clase: 'destacada' },
    min: { valor: fmt.num(v.min.valor, 'sig4') },
    max: { valor: fmt.num(v.max.valor, 'sig4') },
    rango: { valor: fmt.num(v.rango.valor, 'sig4') },
    cv: { valor: fmt.num(v.cv.valor, 'pct1') },
    g1: { valor: fmt.num(v.g1.valor, 'dec2'), nota: textos.etiquetas.nota_joanes },
    g2: { valor: fmt.num(v.g2.valor, 'dec2'), nota: textos.etiquetas.nota_joanes },
    media_geom: { valor: fmt.num(v.media_geom.valor, 'sig4') },
    sw_w: { valor: fmt.num(v.sw_w.valor, 'dec3'), nota: textos.etiquetas.nota_shapiro },
    sw_p: { valor: fmt.num(v.sw_p.valor, 'p'), nota: textos.etiquetas.nota_shapiro },
    n_atipicos: { valor: fmt.entero(v.n_atipicos.valor), nota: textos.etiquetas.nota_tukey },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, celdas[k].ic ?? '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`asimetria.${s.bandas.asimetria}`], vars),
    rellenar(textos.interpretacion[`normalidad.${s.bandas.normalidad}`], vars),
    rellenar(textos.interpretacion.resumen_recomendado, vars),
    rellenar(textos.interpretacion[v.n_atipicos.valor > 0 ? 'atipicos.con' : 'atipicos.sin'], vars),
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

export function grafica(s: Resultado, e: EntradasDescriptivos, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const v = s.valores;
  const bins = binsSturges(e.x);
  const primero = bins[0] as BinHistograma;
  const ultimo = bins[bins.length - 1] as BinHistograma;
  const caja = cajaTukey(e.x);
  const de = v.de.valor;

  const resumen = [
    `${textos.etiquetas.n}: ${fmt.entero(v.n.valor)}`,
    `${textos.etiquetas.media}: ${fmt.num(v.media.valor, 'sig4')}`,
    `${textos.etiquetas.de}: ${fmt.num(de, 'sig4')}`,
    `${textos.etiquetas.mediana}: ${fmt.num(v.mediana.valor, 'sig4')} (${fmt.ic([v.q1.valor, v.q3.valor], 'sig4')})`,
    `${textos.etiquetas.rango}: ${fmt.ic([v.min.valor, v.max.valor], 'sig4')}`,
    `${textos.etiquetas.n_atipicos}: ${fmt.entero(v.n_atipicos.valor)}`,
  ].join('; ');

  const datos: DatosGrafica = {
    tipo: 'histograma-boxplot',
    titulo: textos.grafica_titulo ?? textos.etiquetas.eje_x,
    resumen,
    // `sig4` sirve tanto para recuentos de plaquetas (150) como para
    // proporciones pegadas (0.25): siempre cuatro cifras significativas.
    ejeX: { etiqueta: textos.etiquetas.eje_x, dominio: [primero.desde, ultimo.hasta], pista: 'sig4' },
    bins,
    etiquetaFrecuencia: textos.etiquetas.eje_frecuencia,
    caja,
    marcadores: [{ id: 'media', etiqueta: textos.etiquetas.grafica_media, x: v.media.valor, destacada: true }],
  };
  // Sin dispersión no hay campana que dibujar.
  if (de > 0) datos.normal = { media: v.media.valor, de, etiqueta: textos.etiquetas.grafica_normal };
  return datos;
}

export const definicion: Definicion<EntradasDescriptivos> = {
  id: 'descriptivos',
  motor: 'ts',
  claves: [
    'resumen',
    'asimetria.simetrica',
    'asimetria.derecha',
    'asimetria.izquierda',
    'normalidad.sin_evidencia',
    'normalidad.evidencia',
    'normalidad.no_aplica',
    'resumen_recomendado',
    'atipicos.con',
    'atipicos.sin',
  ],
  avisos: ['n_pequeno', 'constante', 'no_positivos', 'atipicos', 'sw_n_grande', 'n_grande'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    if (!Array.isArray(e.x) || e.x.length < N_MIN_COLUMNA) err.x = 'err_n_min';
    else if (!esColumna(e.x)) err.x = 'err_numero';
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
