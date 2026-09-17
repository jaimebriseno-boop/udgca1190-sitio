/**
 * Calculadora A3 · Valores predictivos a partir de Sn, Sp y prevalencia.
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/valores-predictivos.yml.
 */
import type { Contexto, Curva, DatosGrafica, Definicion, Entradas, Presentacion, Resultado } from '../nucleo/tipos.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { valoresPredictivos, vpnDe, vppDe } from '../metodos/predictivos.ts';

export interface EntradasPredictivos extends Entradas {
  sn: number;
  sp: number;
  prev: number;
  /** Enfermos y sanos del estudio de validación; 0 = no disponible (sin IC). */
  n_d: number;
  n_nd: number;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = ['vpp', 'vpn', 'lr_pos', 'lr_neg', 'vp_mil', 'fp_mil', 'fn_mil', 'vn_mil'] as const;

/** Frecuencias naturales por 1,000: celdas enteras con la nota «de cada 1,000». */
const FRECUENCIAS = ['vp_mil', 'fp_mil', 'fn_mil', 'vn_mil'] as const;

/** Puntos de las curvas VPP/VPN frente a la prevalencia (paso de 1 %). */
const PASOS_CURVA = 100;

export function calcular(e: EntradasPredictivos, nivel: number): Resultado<'valores-predictivos'> {
  const { sn, sp, prev } = e;
  const nD = e.n_d ?? 0;
  const nND = e.n_nd ?? 0;
  const v = valoresPredictivos(sn, sp, prev, { nivel, nD, nND });

  const avisos: Resultado['avisos'] = [];
  const conIc = nD > 0 && nND > 0;
  if (!conIc && (nD > 0 || nND > 0)) avisos.push({ codigo: 'sin_n', severidad: 'aviso' });
  if (v.ajustado) avisos.push({ codigo: 'logit_ajustado', severidad: 'info' });
  if (prev === 0 || prev === 1) avisos.push({ codigo: 'certeza', severidad: 'aviso' });
  if (sn === 1 && sp === 1) avisos.push({ codigo: 'prueba_perfecta', severidad: 'info' });

  return {
    calculadora: 'valores-predictivos',
    version: 1,
    entradas: { sn, sp, prev, n_d: nD, n_nd: nND, nivel },
    valores: {
      vpp: v.vpp,
      vpn: v.vpn,
      lr_pos: v.lr_pos,
      lr_neg: v.lr_neg,
      vp_mil: v.vp_mil,
      fp_mil: v.fp_mil,
      fn_mil: v.fn_mil,
      vn_mil: v.vn_mil,
    },
    bandas: { ic: !conIc ? 'sin' : v.ajustado ? 'ajustado' : 'con' },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasPredictivos, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const v = s.valores;
  const nivel = v.vpp.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const entero = (x: number): string => fmt.entero(Math.round(x));

  const vars: Record<string, string | number> = {
    sn: fmt.num(e.sn, 'pct1'),
    sp: fmt.num(e.sp, 'pct1'),
    prev: fmt.num(e.prev, 'pct1'),
    n_d: fmt.entero(e.n_d ?? 0),
    n_nd: fmt.entero(e.n_nd ?? 0),
    nivel: fmt.nivel(nivel),
    vpp: fmt.num(v.vpp.valor, 'pct1'),
    vpn: fmt.num(v.vpn.valor, 'pct1'),
    vpp_ic: fmt.ic(v.vpp.ic, 'pct1'),
    vpn_ic: fmt.ic(v.vpn.ic, 'pct1'),
    lr_pos: fmt.num(v.lr_pos.valor, 'lr'),
    lr_neg: fmt.num(v.lr_neg.valor, 'lr'),
    vp_mil: entero(v.vp_mil.valor),
    fp_mil: entero(v.fp_mil.valor),
    fn_mil: entero(v.fn_mil.valor),
    vn_mil: entero(v.vn_mil.valor),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  // El párrafo de Métodos cambia según haya o no intervalo (y de qué variante).
  vars.metodos_ic = rellenar(textos.interpretacion[`metodos_ic.${s.bandas.ic}`], vars, ctx.refs);

  const notaIc = v.vpp.ic
    ? `${icNivel} · ${textos.etiquetas[v.vpp.metodo === 'logit-mercaldo-ajustado' ? 'nota_logit_ajustado' : 'nota_logit']}`
    : textos.etiquetas.nota_sin_ic;
  const celdas: Presentacion['celdas'] = {
    // Sin tamaños de validación no hay intervalo: la celda va sin `ic`, no con
    // una cadena vacía (la misma convención que las razones con celda 0 en A1).
    vpp: { valor: fmt.num(v.vpp.valor, 'pct1'), ...(v.vpp.ic ? { ic: fmt.ic(v.vpp.ic, 'pct1') } : {}), nota: notaIc, clase: 'destacada' },
    vpn: { valor: fmt.num(v.vpn.valor, 'pct1'), ...(v.vpn.ic ? { ic: fmt.ic(v.vpn.ic, 'pct1') } : {}), nota: notaIc, clase: 'destacada' },
    lr_pos: { valor: fmt.num(v.lr_pos.valor, 'lr') },
    lr_neg: { valor: fmt.num(v.lr_neg.valor, 'lr') },
  };
  for (const k of FRECUENCIAS) celdas[k] = { valor: entero(v[k].valor), nota: textos.etiquetas.por_mil };
  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, celdas[k].ic ?? '']);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`ic.${s.bandas.ic}`], vars),
    rellenar(textos.interpretacion.lr, vars),
    rellenar(textos.interpretacion.prevalencia, vars),
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

export function grafica(s: Resultado, e: EntradasPredictivos, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const puntos = (f: (sn: number, sp: number, p: number) => number): Array<[number, number]> => {
    const salida: Array<[number, number]> = [];
    for (let i = 0; i <= PASOS_CURVA; i += 1) {
      const p = i / PASOS_CURVA;
      salida.push([p, f(e.sn, e.sp, p)]);
    }
    return salida;
  };
  const curvas: Curva[] = [
    { id: 'vpp', etiqueta: textos.etiquetas.vpp, puntos: puntos(vppDe), destacada: true },
    { id: 'vpn', etiqueta: textos.etiquetas.vpn, puntos: puntos(vpnDe) },
  ];
  return {
    tipo: 'curvas',
    titulo: textos.grafica_titulo ?? textos.etiquetas.vpp,
    resumen: `${textos.etiquetas.eje_prev} ${fmt.num(e.prev, 'pct1')}: ${textos.etiquetas.vpp} ${fmt.num(s.valores.vpp.valor, 'pct1')}, ${textos.etiquetas.vpn} ${fmt.num(s.valores.vpn.valor, 'pct1')}.`,
    curvas,
    ejeX: { etiqueta: textos.etiquetas.eje_prev, dominio: [0, 1], pista: 'pct0' },
    ejeY: { etiqueta: textos.etiquetas.eje_valor, dominio: [0, 1], pista: 'pct0' },
    marcador: {
      x: e.prev,
      etiqueta: fmt.num(e.prev, 'pct1'),
      valores: { vpp: s.valores.vpp.valor, vpn: s.valores.vpn.valor },
    },
  };
}

export const definicion: Definicion<EntradasPredictivos> = {
  id: 'valores-predictivos',
  motor: 'ts',
  claves: ['resumen', 'ic.con', 'ic.sin', 'ic.ajustado', 'lr', 'prevalencia', 'metodos_ic.con', 'metodos_ic.sin', 'metodos_ic.ajustado'],
  avisos: ['sin_n', 'logit_ajustado', 'certeza', 'prueba_perfecta'],
  salidas: SALIDAS,
  // Un tamaño vacío vale 0 («no disponible»): así el snippet de R siempre tiene
  // sus marcadores y la URL conserva lo capturado.
  derivar(e) {
    return { n_d: typeof e.n_d === 'number' ? e.n_d : 0, n_nd: typeof e.n_nd === 'number' ? e.n_nd : 0 };
  },
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of ['sn', 'sp', 'prev'] as const) {
      if (!(typeof e[k] === 'number' && e[k] >= 0 && e[k] <= 1)) err[k] = 'err_proporcion';
    }
    for (const k of ['n_d', 'n_nd'] as const) {
      if (!Number.isInteger(e[k]) || e[k] < 0) err[k] = 'err_entero';
    }
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
