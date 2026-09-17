/**
 * Calculadora D4 · Intervalo de confianza de una media (t de Student) y de la
 * desviación estándar (χ²), a partir del resumen media/DE/n.
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/ic-media.yml.
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
import { eemDe, icDesviacion, icMediaResumen, limitesDe, tCritico } from '../metodos/medias.ts';
import { rellenar } from '../nucleo/plantillas.ts';

export interface EntradasIcMedia extends Entradas {
  media: number;
  de: number;
  n: number;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = ['media', 'eem', 'de', 't_crit'] as const;
export type SalidaIcMedia = (typeof SALIDAS)[number];

/** Por debajo de 30 observaciones el intervalo de la media depende del supuesto de normalidad. */
export const N_NORMALIDAD = 30;

/** Por debajo de 5 observaciones la desviación estándar estimada es muy inestable. */
export const N_MUY_PEQUENO = 5;

/** Formato de las cantidades en las unidades de la variable (media, DE, EEM, límites). */
const PISTA_VALOR = 'dec2';

export function calcular(e: EntradasIcMedia, nivel: number): Resultado<'ic-media'> {
  const { media, de, n } = e;
  const valores: Record<string, Estimacion> = {
    media: icMediaResumen(media, de, n, nivel),
    eem: { valor: eemDe(de, n), metodo: 'puntual' },
    de: icDesviacion(de, n, nivel),
    t_crit: { valor: tCritico(n, nivel), metodo: 'puntual' },
  };

  const avisos: Resultado['avisos'] = [];
  if (n < N_NORMALIDAD) avisos.push({ codigo: 'n_pequeno', severidad: 'info', params: { n } });
  if (n < N_MUY_PEQUENO) avisos.push({ codigo: 'n_muy_pequeno', severidad: 'aviso', params: { n } });
  if (de === 0) avisos.push({ codigo: 'de_cero', severidad: 'aviso' });

  return {
    calculadora: 'ic-media',
    version: 1,
    entradas: { media, de, n, nivel },
    valores,
    bandas: {
      n: n < N_NORMALIDAD ? 'pequeno' : 'adecuado',
      de: de === 0 ? 'cero' : 'positiva',
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasIcMedia, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  const nivel = v.media.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  // Media ± 2 DE: el rango donde caen los datos individuales, no las medias.
  const [limInf, limSup] = limitesDe(e.media, e.de, 2);

  const vars: Record<string, string | number> = {
    media: fmt.num(e.media, PISTA_VALOR),
    de: fmt.num(e.de, PISTA_VALOR),
    n: fmt.entero(e.n),
    nivel: fmt.nivel(nivel),
    media_ic: fmt.ic(v.media.ic, PISTA_VALOR),
    de_ic: fmt.ic(v.de.ic, PISTA_VALOR),
    eem: fmt.num(v.eem.valor, PISTA_VALOR),
    t_crit: fmt.num(v.t_crit.valor, 'dec3'),
    lim_inf: fmt.num(limInf, PISTA_VALOR),
    lim_sup: fmt.num(limSup, PISTA_VALOR),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };

  const celdas: Presentacion['celdas'] = {
    media: {
      valor: fmt.num(v.media.valor, PISTA_VALOR),
      ic: fmt.ic(v.media.ic, PISTA_VALOR),
      nota: `${icNivel} · ${textos.etiquetas.nota_t}`,
      clase: 'destacada',
    },
    eem: { valor: fmt.num(v.eem.valor, PISTA_VALOR), nota: textos.etiquetas.nota_eem },
    de: {
      valor: fmt.num(v.de.valor, PISTA_VALOR),
      ic: fmt.ic(v.de.ic, PISTA_VALOR),
      nota: `${icNivel} · ${textos.etiquetas.nota_chi2}`,
    },
    t_crit: {
      valor: fmt.num(v.t_crit.valor, 'dec3'),
      nota: `${textos.etiquetas.nota_gl}: ${fmt.entero(e.n - 1)}`,
    },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, celdas[k].ic ?? '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion.contraste, vars),
    rellenar(textos.interpretacion.de, vars),
    rellenar(textos.interpretacion.t, vars),
    rellenar(textos.interpretacion[`n.${s.bandas.n}`], vars),
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
 * Bosque de tres filas sobre el mismo eje: el intervalo de confianza de la
 * media (lo que se estima) frente a media ± 1 DE y media ± 2 DE (donde caen los
 * datos). Ver los tres a la misma escala es la forma más rápida de no confundir
 * precisión con dispersión. Sin línea de referencia: no hay valor nulo que
 * contrastar, y el dominio lo fija `svg.ts` con las propias filas.
 */
export function grafica(s: Resultado, e: EntradasIcMedia, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const ic = s.valores.media.ic;
  const filas: FilaIC[] = [
    {
      id: 'media',
      etiqueta: textos.etiquetas.media,
      valor: s.valores.media.valor,
      lo: ic?.[0],
      hi: ic?.[1],
      destacada: true,
    },
    {
      id: 'de1',
      etiqueta: textos.etiquetas.grafica_de1,
      valor: e.media,
      lo: e.media - e.de,
      hi: e.media + e.de,
    },
    {
      id: 'de2',
      etiqueta: textos.etiquetas.grafica_de2,
      valor: e.media,
      lo: e.media - 2 * e.de,
      hi: e.media + 2 * e.de,
    },
  ];
  return {
    tipo: 'ic-forest',
    titulo: textos.grafica_titulo ?? textos.etiquetas.media,
    resumen: `${textos.etiquetas.media}: ${fmt.num(s.valores.media.valor, PISTA_VALOR)} (${fmt.ic(ic, PISTA_VALOR)}); ${textos.etiquetas.grafica_de2}: ${fmt.ic(limitesDe(e.media, e.de, 2), PISTA_VALOR)}.`,
    filas,
    escala: 'lineal',
    pista: 'dec1',
  };
}

export const definicion: Definicion<EntradasIcMedia> = {
  id: 'ic-media',
  motor: 'ts',
  claves: ['resumen', 'contraste', 'de', 't', 'n.pequeno', 'n.adecuado'],
  avisos: ['n_pequeno', 'n_muy_pequeno', 'de_cero'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    if (typeof e.media !== 'number' || !Number.isFinite(e.media)) err.media = 'err_numero';
    if (typeof e.de !== 'number' || !Number.isFinite(e.de)) err.de = 'err_numero';
    else if (e.de < 0) err.de = 'err_min';
    if (!Number.isInteger(e.n)) err.n = 'err_entero';
    else if (e.n < 2) err.n = 'err_min';
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
