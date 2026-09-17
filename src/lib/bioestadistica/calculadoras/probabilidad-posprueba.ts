/**
 * Calculadora A2 · Probabilidad posprueba (teorema de Bayes, nomograma de Fagan).
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/probabilidad-posprueba.yml.
 */
import type { Contexto, DatosGrafica, Definicion, Entradas, Presentacion, Resultado } from '../nucleo/tipos.ts';
import { bandaLrNeg, bandaLrPos } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { momios, posprueba, validarPosprueba } from '../metodos/bayes.ts';

export interface EntradasPosprueba extends Entradas {
  /** Probabilidad preprueba (0–1). */
  pre: number;
  lr_pos: number;
  lr_neg: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = [
  'post_pos',
  'post_neg',
  'ganancia_pos',
  'ganancia_neg',
  'momios_pre',
  'momios_post_pos',
  'momios_post_neg',
] as const;

export function calcular(e: EntradasPosprueba, _nivel: number): Resultado<'probabilidad-posprueba'> {
  const { pre, lr_pos, lr_neg } = e;
  validarPosprueba(pre, lr_pos);
  validarPosprueba(pre, lr_neg);
  const momiosPre = momios(pre);
  const postPos = posprueba(pre, lr_pos);
  const postNeg = posprueba(pre, lr_neg);

  const avisos: Resultado['avisos'] = [];
  if (pre === 0 || pre === 1) avisos.push({ codigo: 'certeza', severidad: 'aviso' });
  else if (pre <= 0.01 || pre >= 0.99) avisos.push({ codigo: 'extremo', severidad: 'info' });
  if (lr_pos === 1 || lr_neg === 1) avisos.push({ codigo: 'lr_nulo', severidad: 'aviso' });
  if (lr_pos < 1 || lr_neg > 1) avisos.push({ codigo: 'lr_invertido', severidad: 'aviso' });

  return {
    calculadora: 'probabilidad-posprueba',
    version: 1,
    entradas: { pre, lr_pos, lr_neg },
    valores: {
      post_pos: { valor: postPos, metodo: 'puntual' },
      post_neg: { valor: postNeg, metodo: 'puntual' },
      ganancia_pos: { valor: postPos - pre, metodo: 'puntual' },
      ganancia_neg: { valor: pre - postNeg, metodo: 'puntual' },
      momios_pre: { valor: momiosPre, metodo: 'puntual' },
      momios_post_pos: { valor: momiosPre * lr_pos, metodo: 'puntual' },
      momios_post_neg: { valor: momiosPre * lr_neg, metodo: 'puntual' },
    },
    bandas: { lr_pos: bandaLrPos(lr_pos), lr_neg: bandaLrNeg(lr_neg) },
    avisos,
  };
}

/** Puntos porcentuales con signo: 0.581 → «+58.1», −0.237 → «−23.7»; un cambio que redondea a cero va sin signo («0.0»). */
function puntos(x: number, fmt: Contexto['fmt']): string {
  if (!Number.isFinite(x)) return fmt.num(x, 'dec1');
  const magnitud = fmt.num(Math.abs(x) * 100, 'dec1');
  if (magnitud === fmt.num(0, 'dec1')) return magnitud;
  return (x < 0 ? '−' : '+') + magnitud;
}

export function presentar(s: Resultado, e: EntradasPosprueba, ctx: Contexto): Presentacion {
  const { fmt, textos } = ctx;
  const v = s.valores;
  const vars: Record<string, string | number> = {
    pre: fmt.num(e.pre, 'pct1'),
    lr_pos: fmt.num(e.lr_pos, 'lr'),
    lr_neg: fmt.num(e.lr_neg, 'lr'),
    post_pos: fmt.num(v.post_pos.valor, 'pct1'),
    post_neg: fmt.num(v.post_neg.valor, 'pct1'),
    ganancia_pos: puntos(v.ganancia_pos.valor, fmt),
    ganancia_neg: puntos(-v.ganancia_neg.valor, fmt),
    momios_pre: fmt.num(v.momios_pre.valor, 'lr'),
    momios_post_pos: fmt.num(v.momios_post_pos.valor, 'lr'),
    momios_post_neg: fmt.num(v.momios_post_neg.valor, 'lr'),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };

  const celdas: Presentacion['celdas'] = {
    post_pos: { valor: fmt.num(v.post_pos.valor, 'pct1'), nota: `${textos.etiquetas.lr_pos}: ${vars.lr_pos}`, clase: 'destacada' },
    post_neg: { valor: fmt.num(v.post_neg.valor, 'pct1'), nota: `${textos.etiquetas.lr_neg}: ${vars.lr_neg}`, clase: 'destacada' },
    ganancia_pos: { valor: puntos(v.ganancia_pos.valor, fmt), nota: textos.etiquetas.puntos },
    ganancia_neg: { valor: puntos(-v.ganancia_neg.valor, fmt), nota: textos.etiquetas.puntos },
    momios_pre: { valor: fmt.num(v.momios_pre.valor, 'lr') },
    momios_post_pos: { valor: fmt.num(v.momios_post_pos.valor, 'lr') },
    momios_post_neg: { valor: fmt.num(v.momios_post_neg.valor, 'lr') },
  };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`lr_pos.${s.bandas.lr_pos}`], vars),
    rellenar(textos.interpretacion[`lr_neg.${s.bandas.lr_neg}`], vars),
    rellenar(textos.interpretacion.umbral, vars),
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

export function grafica(s: Resultado, e: EntradasPosprueba, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  return {
    tipo: 'fagan',
    titulo: textos.grafica_titulo ?? 'Fagan',
    resumen: `${textos.etiquetas.pre}: ${fmt.num(e.pre, 'pct1')}. ${textos.etiquetas.linea_pos} (${textos.etiquetas.lr_pos} ${fmt.num(e.lr_pos, 'lr')}): ${fmt.num(s.valores.post_pos.valor, 'pct1')}. ${textos.etiquetas.linea_neg} (${textos.etiquetas.lr_neg} ${fmt.num(e.lr_neg, 'lr')}): ${fmt.num(s.valores.post_neg.valor, 'pct1')}.`,
    pre: e.pre,
    lineas: [
      { id: 'pos', etiqueta: textos.etiquetas.linea_pos, lr: e.lr_pos, post: s.valores.post_pos.valor, destacada: true },
      { id: 'neg', etiqueta: textos.etiquetas.linea_neg, lr: e.lr_neg, post: s.valores.post_neg.valor },
    ],
    ejes: { pre: textos.etiquetas.eje_pre, lr: textos.etiquetas.eje_lr, post: textos.etiquetas.eje_post },
  };
}

export const definicion: Definicion<EntradasPosprueba> = {
  id: 'probabilidad-posprueba',
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
    'umbral',
  ],
  avisos: ['certeza', 'extremo', 'lr_nulo', 'lr_invertido'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    if (!(typeof e.pre === 'number' && e.pre >= 0 && e.pre <= 1)) err.pre = 'err_proporcion';
    if (!(typeof e.lr_pos === 'number' && Number.isFinite(e.lr_pos) && e.lr_pos >= 0)) err.lr_pos = 'err_min';
    if (!(typeof e.lr_neg === 'number' && Number.isFinite(e.lr_neg) && e.lr_neg >= 0)) err.lr_neg = 'err_min';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
