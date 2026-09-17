/**
 * Calculadora B3 · Proporciones pareadas: prueba de McNemar.
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/mcnemar.yml.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Estimacion,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { decisionP } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import { METODOS_DELTA, SALIDAS_MCNEMAR, agrestiMinRecortado, mcnemar } from '../metodos/pareadas.ts';
import type { MetodoDelta } from '../metodos/pareadas.ts';

export interface EntradasMcNemar extends Entradas {
  /** Pares concordantes positivos: (+,+). */
  a: number;
  /** Discordantes a favor de la prueba A: (+,−). */
  b: number;
  /** Discordantes a favor de la prueba B: (−,+). */
  c: number;
  /** Pares concordantes negativos: (−,−). */
  d: number;
  /** Método del IC de la diferencia pareada (selector): 'wald' | 'agresti-min'. */
  metodo_delta: string;
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_MCNEMAR;
export const CELDAS = ['a', 'b', 'c', 'd'] as const;

/** A partir de 25 pares discordantes la aproximación χ² es la que se reporta (ESPECIFICACION B3, casos límite). */
export const MIN_DISCORDANTES = 25;

/** Salidas que son valores p (pista de formato `p`, «< 0.001» por debajo del umbral). */
const VALORES_P = ['p_chi2', 'p_edwards', 'p_exacta'] as const;

/** Referencias que cita el párrafo de Métodos según el método de IC de la diferencia. */
const CLAVE_METODO_DELTA: Record<MetodoDelta, string> = {
  wald: 'metodos_delta.wald',
  'agresti-min': 'metodos_delta.agresti-min',
};

function esMetodoDelta(m: unknown): m is MetodoDelta {
  return typeof m === 'string' && (METODOS_DELTA as readonly string[]).includes(m);
}

export function calcular(e: EntradasMcNemar, nivel: number): Resultado<'mcnemar'> {
  const { a, b, c, d } = e;
  const metodo: MetodoDelta = esMetodoDelta(e.metodo_delta) ? e.metodo_delta : 'wald';
  const v = mcnemar(a, b, c, d, { nivel, metodo });
  const nDisc = b + c;
  const n = a + b + c + d;

  // Con menos de 25 pares discordantes la binomial exacta es la prueba de
  // referencia; por encima, la χ² con corrección de continuidad de Edwards.
  const principal = nDisc < MIN_DISCORDANTES ? 'exacta' : 'edwards';
  const pPrincipal = principal === 'exacta' ? v.p_exacta.valor : v.p_edwards.valor;

  const avisos: Resultado['avisos'] = [];
  if (nDisc === 0) avisos.push({ codigo: 'sin_discordantes', severidad: 'aviso' });
  if (nDisc > 0 && nDisc < MIN_DISCORDANTES) {
    avisos.push({ codigo: 'pocos_discordantes', severidad: 'info', params: { n_disc: nDisc } });
  }
  if (metodo === 'agresti-min' && agrestiMinRecortado(b, c, n, nivel)) {
    avisos.push({ codigo: 'agresti_min_recortado', severidad: 'info' });
  }
  // Sin discordantes no hay nada que recordar sobre ellos: lo dice `sin_discordantes`.
  if (nDisc > 0) avisos.push({ codigo: 'solo_discordantes', severidad: 'info', params: { n_disc: nDisc } });

  return {
    calculadora: 'mcnemar',
    version: 1,
    entradas: { a, b, c, d, metodo_delta: metodo, nivel },
    valores: { ...v },
    bandas: {
      principal,
      // Sin pares discordantes no hay prueba que rechazar ni dejar de rechazar.
      decision: nDisc === 0 ? 'sin_discordantes' : decisionP(pPrincipal),
      direccion: b > c ? 'a_mayor' : c > b ? 'b_mayor' : 'igual',
    },
    avisos,
  };
}

/** ¿El intervalo existe y no es «no definido»? (∞ SÍ es un límite legítimo del OR pareado). */
function icDefinido(est: Estimacion): est is Estimacion & { ic: [number, number] } {
  return est.ic !== undefined && !Number.isNaN(est.ic[0]) && !Number.isNaN(est.ic[1]);
}

export function presentar(s: Resultado, e: EntradasMcNemar, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const { a, b, c, d } = e;
  const nivel = s.valores.delta.nivel ?? ctx.nivel;
  const metodo: MetodoDelta = esMetodoDelta(e.metodo_delta) ? e.metodo_delta : 'wald';
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const principal = s.bandas.principal === 'edwards' ? 'edwards' : 'exacta';
  const pPrincipal = principal === 'exacta' ? s.valores.p_exacta.valor : s.valores.p_edwards.valor;

  /** «IC 95 %: 1.04 a 10.6» o «IC no definido». */
  const icRazon = (est: Estimacion): string => (icDefinido(est) ? `${icNivel}: ${fmt.ic(est.ic, 'lr')}` : ui.sin_ic);
  /** La diferencia pareada se lee en puntos porcentuales: ×100 sin el signo %. */
  const puntos = (x: number): string => fmt.num(x * 100, 'dec1');
  const puntosIc = (ic: [number, number] | undefined): string =>
    ic ? fmt.ic([ic[0] * 100, ic[1] * 100], 'dec1') : ui.sin_ic;

  const vars: Record<string, string | number> = {
    a: fmt.entero(a),
    b: fmt.entero(b),
    c: fmt.entero(c),
    d: fmt.entero(d),
    n: fmt.entero(s.valores.n.valor),
    n_disc: fmt.entero(s.valores.n_disc.valor),
    nivel: fmt.nivel(nivel),
    p_a: fmt.num(s.valores.p_a.valor, 'pct1'),
    p_b: fmt.num(s.valores.p_b.valor, 'pct1'),
    chi2: fmt.num(s.valores.chi2.valor, 'dec3'),
    chi2_edwards: fmt.num(s.valores.chi2_edwards.valor, 'dec3'),
    delta: puntos(s.valores.delta.valor),
    delta_ic: puntosIc(s.valores.delta.ic),
    or: fmt.num(s.valores.or_pareado.valor, 'lr'),
    or_ic: icRazon(s.valores.or_pareado),
    p: fmt.num(pPrincipal, 'p'),
    prueba_nombre: textos.etiquetas[`prueba.${principal}`],
    metodo_delta_frase: rellenar(textos.interpretacion[CLAVE_METODO_DELTA[metodo]], {}, ctx.refs),
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  for (const k of VALORES_P) vars[k] = fmt.num(s.valores[k].valor, 'p');

  const celdas: Presentacion['celdas'] = {
    n: { valor: fmt.entero(s.valores.n.valor) },
    n_disc: { valor: fmt.entero(s.valores.n_disc.valor), nota: textos.etiquetas.nota_discordantes },
    p_a: { valor: fmt.num(s.valores.p_a.valor, 'pct1') },
    p_b: { valor: fmt.num(s.valores.p_b.valor, 'pct1') },
    chi2: { valor: fmt.num(s.valores.chi2.valor, 'dec3'), nota: textos.etiquetas.nota_chi2 },
    p_chi2: { valor: fmt.num(s.valores.p_chi2.valor, 'p'), nota: textos.etiquetas.nota_chi2 },
    chi2_edwards: { valor: fmt.num(s.valores.chi2_edwards.valor, 'dec3'), nota: textos.etiquetas.nota_edwards },
    p_edwards: { valor: fmt.num(s.valores.p_edwards.valor, 'p'), nota: textos.etiquetas.nota_edwards },
    p_exacta: { valor: fmt.num(s.valores.p_exacta.valor, 'p'), nota: textos.etiquetas.nota_exacta },
    // En puntos porcentuales, igual que la interpretación: la unidad va en la etiqueta.
    delta: {
      valor: puntos(s.valores.delta.valor),
      ic: puntosIc(s.valores.delta.ic),
      nota: `${icNivel} · ${textos.etiquetas[`metodo_delta.${metodo}`] ?? metodo}`,
      clase: 'destacada',
    },
    or_pareado: icDefinido(s.valores.or_pareado)
      ? {
          valor: fmt.num(s.valores.or_pareado.valor, 'lr'),
          ic: fmt.ic(s.valores.or_pareado.ic, 'lr'),
          nota: `${icNivel} · ${textos.etiquetas.nota_or}`,
        }
      : { valor: fmt.num(s.valores.or_pareado.valor, 'lr'), nota: ui.sin_ic },
  };
  celdas[principal === 'exacta' ? 'p_exacta' : 'p_edwards'].clase = 'destacada';

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [textos.etiquetas[k], celdas[k].valor, celdas[k].ic ?? '']);

  // 0, ∞ y «no definido» no se leen como «tantas veces más frecuentes».
  const orDefinido = Number.isFinite(s.valores.or_pareado.valor) && s.valores.or_pareado.valor > 0;
  const interpretacion = [rellenar(textos.interpretacion.resumen, vars)];
  if (s.bandas.decision === 'sin_discordantes') {
    interpretacion.push(rellenar(textos.interpretacion.sin_discordantes, vars));
    interpretacion.push(rellenar(textos.interpretacion['or_pareado.indefinido'], vars));
  } else {
    interpretacion.push(rellenar(textos.interpretacion[`direccion.${s.bandas.direccion}`], vars));
    interpretacion.push(rellenar(textos.interpretacion[`prueba.${principal}`], vars));
    interpretacion.push(rellenar(textos.interpretacion[`decision.${s.bandas.decision}`], vars));
    interpretacion.push(rellenar(textos.interpretacion[orDefinido ? 'or_pareado' : 'or_pareado.indefinido'], vars));
    interpretacion.push(rellenar(textos.interpretacion.comparacion, vars));
  }

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((av) => av.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(_s: Resultado, e: EntradasMcNemar, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const { b, c } = e;
  return {
    tipo: 'barras',
    titulo: textos.grafica_titulo ?? textos.etiquetas.n_disc,
    resumen: `${textos.etiquetas.grafica_b}: ${fmt.entero(b)}; ${textos.etiquetas.grafica_c}: ${fmt.entero(c)}; ${textos.etiquetas.grafica_h0}: ${fmt.num((b + c) / 2, 'dec1')}`,
    series: [{ id: 'disc', etiqueta: textos.etiquetas.grafica_serie, destacada: true }],
    categorias: [
      { id: 'b', etiqueta: textos.etiquetas.grafica_b, valores: [b] },
      { id: 'c', etiqueta: textos.etiquetas.grafica_c, valores: [c] },
    ],
    ejeY: { etiqueta: textos.etiquetas.eje_frecuencia, dominio: [0, Math.max(b, c)], pista: 'int' },
    referencia: { valor: (b + c) / 2, etiqueta: textos.etiquetas.grafica_h0 },
  };
}

export const definicion: Definicion<EntradasMcNemar> = {
  id: 'mcnemar',
  motor: 'ts',
  claves: [
    'resumen',
    'direccion.a_mayor',
    'direccion.b_mayor',
    'direccion.igual',
    'prueba.exacta',
    'prueba.edwards',
    'decision.rechaza',
    'decision.no_rechaza',
    'sin_discordantes',
    'or_pareado',
    'or_pareado.indefinido',
    'comparacion',
    'metodos_delta.wald',
    'metodos_delta.agresti-min',
  ],
  avisos: ['sin_discordantes', 'pocos_discordantes', 'solo_discordantes', 'agresti_min_recortado'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of CELDAS) {
      if (!Number.isInteger(e[k]) || e[k] < 0) err[k] = 'err_entero';
    }
    // Sin pares no hay nada que comparar; b + c = 0 SÍ se admite (prueba indefinida con aviso).
    if (Object.keys(err).length === 0 && e.a + e.b + e.c + e.d === 0) {
      for (const k of CELDAS) err[k] = 'err_rango';
    }
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    if (!esMetodoDelta(e.metodo_delta)) err.metodo_delta = 'err_opcion';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
