/**
 * Calculadora B2 · Pruebas de independencia en una tabla 2×2 (χ² de Pearson,
 * corrección de Yates acotada como en R, variante N−1 de Campbell, prueba
 * exacta de Fisher bilateral, coeficiente φ y razón de momios condicional).
 *
 * Módulo puro: corre igual en build (SSR), navegador y `node --test`.
 * Contenido bilingüe en data/bioestadistica/calculadoras/chi-cuadrada-fisher.yml.
 */
import type {
  Contexto,
  DatosGrafica,
  Definicion,
  Entradas,
  Presentacion,
  Resultado,
} from '../nucleo/tipos.ts';
import { bandaCohen, decisionP } from '../nucleo/bandas.ts';
import { rellenar } from '../nucleo/plantillas.ts';
import {
  SALIDAS_INDEPENDENCIA,
  independencia2x2,
  orEnBorde,
  pruebaRecomendada,
  sentidoPhi,
} from '../metodos/independencia.ts';

export interface EntradasChi2Fisher extends Entradas {
  a: number;
  b: number;
  c: number;
  d: number;
  /** Nivel del IC de la razón de momios condicional (no afecta a ningún valor p). */
  nivel: number;
}

/** Ids de salida = claves del JSON de R = claves de `etiquetas` = claves de `esperado` del fixture. */
export const SALIDAS = SALIDAS_INDEPENDENCIA;
export const CELDAS = ['a', 'b', 'c', 'd'] as const;

/** Frecuencias esperadas: celdas con dos decimales y sin intervalo. */
const ESPERADAS = ['e_a', 'e_b', 'e_c', 'e_d', 'e_min'] as const;
/** Estadísticos χ² (Pearson, Yates, N−1). */
const ESTADISTICOS = ['chi2', 'chi2_yates', 'chi2_n1'] as const;
/** Valores p de las cuatro pruebas. */
const VALORES_P = ['p_chi2', 'p_yates', 'p_n1', 'p_fisher'] as const;

/** Nota de método de cada celda (clave de `etiquetas` del YAML). */
const NOTA: Record<string, string> = {
  e_a: 'nota_esperado',
  e_b: 'nota_esperado',
  e_c: 'nota_esperado',
  e_d: 'nota_esperado',
  e_min: 'nota_esperado_min',
  chi2: 'nota_pearson',
  p_chi2: 'nota_pearson',
  chi2_yates: 'nota_yates',
  p_yates: 'nota_yates',
  chi2_n1: 'nota_n1',
  p_n1: 'nota_n1',
  p_fisher: 'nota_fisher',
  phi: 'nota_phi',
};

export function calcular(e: EntradasChi2Fisher, nivel: number): Resultado<'chi-cuadrada-fisher'> {
  const { a, b, c, d } = e;
  const v = independencia2x2(a, b, c, d, { nivel });
  const n = v.n.valor;
  const eMin = v.e_min.valor;
  const prueba = pruebaRecomendada(n, eMin);
  const pRecomendada = prueba === 'fisher' ? v.p_fisher.valor : v.p_chi2.valor;

  const avisos: Resultado['avisos'] = [];
  if (eMin < 5) {
    // Se trunca (no se redondea) a dos decimales: el aviso se interpola en la
    // interfaz sin formateador y 4.999 no debe leerse «es 5, menor de 5».
    avisos.push({ codigo: 'esperados_bajos', severidad: 'aviso', params: { e_min: Math.floor(eMin * 100) / 100 } });
  }
  if (n < 20) avisos.push({ codigo: 'n_pequeno', severidad: 'aviso', params: { n } });
  // Criterio exacto en enteros: la corrección acotada anula el estadístico
  // cuando |ad − bc| < n/2. No se mira `chi2_yates === 0` porque R (y esta
  // biblioteca) pueden dejar un residuo de ~1e-29 si las cuatro |O − E|
  // difieren en un ulp.
  if (Math.abs(a * d - b * c) < n / 2) avisos.push({ codigo: 'yates_cero', severidad: 'info' });
  if (orEnBorde({ a, b, c, d })) avisos.push({ codigo: 'or_cond_borde', severidad: 'info' });

  return {
    calculadora: 'chi-cuadrada-fisher',
    version: 1,
    entradas: { a, b, c, d, nivel },
    valores: { ...v },
    bandas: {
      prueba,
      decision: decisionP(pRecomendada),
      phi: bandaCohen(v.phi.valor),
      sentido: sentidoPhi(v.phi.valor),
    },
    avisos,
  };
}

export function presentar(s: Resultado, e: EntradasChi2Fisher, ctx: Contexto): Presentacion {
  const { fmt, textos, ui } = ctx;
  const { a, b, c, d } = e;
  const nivel = s.valores.or_cond.nivel ?? ctx.nivel;
  const icNivel = rellenar(ui.ic_nivel ?? 'IC {nivel}', { nivel: fmt.nivel(nivel) });
  const prueba = s.bandas.prueba === 'fisher' ? 'fisher' : 'pearson';
  const pRecomendada = prueba === 'fisher' ? s.valores.p_fisher.valor : s.valores.p_chi2.valor;

  const vars: Record<string, string | number> = {
    n: fmt.entero(s.valores.n.valor),
    p1: fmt.num(a / (a + b), 'pct1'),
    p0: fmt.num(c / (c + d), 'pct1'),
    p: fmt.num(pRecomendada, 'p'),
    phi: fmt.num(s.valores.phi.valor, 'dec3'),
    sentido: textos.etiquetas[`sentido.${s.bandas.sentido}`] ?? s.bandas.sentido,
    or_cond: fmt.num(s.valores.or_cond.valor, 'lr'),
    or_cond_ic: fmt.ic(s.valores.or_cond.ic, 'lr'),
    nivel: fmt.nivel(nivel),
    e_min: fmt.num(s.valores.e_min.valor, 'dec2'),
    factor: textos.etiquetas['tabla.filas'],
    desenlace: textos.etiquetas['tabla.columnas'],
    prueba_nombre: textos.etiquetas[`nombre_${prueba}`],
    titulo_corto: textos.titulo_corto,
    url: ctx.url,
  };
  for (const k of ESTADISTICOS) vars[k] = fmt.num(s.valores[k].valor, 'dec3');
  for (const k of VALORES_P) vars[k] = fmt.num(s.valores[k].valor, 'p');

  const nota = (k: string): string | undefined => {
    const clave = NOTA[k];
    return clave === undefined ? undefined : textos.etiquetas[clave];
  };

  const celdas: Presentacion['celdas'] = { n: { valor: fmt.entero(s.valores.n.valor) } };
  for (const k of ESPERADAS) celdas[k] = { valor: fmt.num(s.valores[k].valor, 'dec2'), nota: nota(k) };
  for (const k of ESTADISTICOS) celdas[k] = { valor: fmt.num(s.valores[k].valor, 'dec3'), nota: nota(k) };
  for (const k of VALORES_P) celdas[k] = { valor: fmt.num(s.valores[k].valor, 'p'), nota: nota(k) };
  celdas.or_cond = {
    valor: fmt.num(s.valores.or_cond.valor, 'lr'),
    ic: fmt.ic(s.valores.or_cond.ic, 'lr'),
    nota: `${icNivel} · ${textos.etiquetas.nota_or_cond}`,
  };
  celdas.phi = { valor: fmt.num(s.valores.phi.valor, 'dec3'), nota: nota('phi'), clase: 'destacada' };
  // La celda destacada es la del valor p de la prueba que recomienda Cochran.
  celdas[prueba === 'fisher' ? 'p_fisher' : 'p_chi2'].clase = 'destacada';

  const resumen: Presentacion['resumen'] = SALIDAS.map((k) => [
    textos.etiquetas[k],
    celdas[k].valor,
    celdas[k].ic ?? '',
  ]);

  const interpretacion = [
    rellenar(textos.interpretacion.resumen, vars),
    rellenar(textos.interpretacion[`prueba.${prueba}`], vars),
    rellenar(textos.interpretacion[`decision.${s.bandas.decision}`], vars),
    rellenar(textos.interpretacion[`phi.${s.bandas.phi}`], vars),
    rellenar(textos.interpretacion.or_cond, vars),
    rellenar(textos.interpretacion.comparacion, vars),
  ];

  return {
    celdas,
    interpretacion,
    avisos: s.avisos.map((av) => av.codigo),
    metodos: rellenar(textos.metodos, vars, ctx.refs),
    resumen,
    grafica: grafica(s, e, ctx) ?? undefined,
  };
}

export function grafica(s: Resultado, e: EntradasChi2Fisher, ctx: Contexto): DatosGrafica | null {
  const { textos, fmt } = ctx;
  const celdas = [
    { id: 'a', obs: e.a, esp: s.valores.e_a.valor },
    { id: 'b', obs: e.b, esp: s.valores.e_b.valor },
    { id: 'c', obs: e.c, esp: s.valores.e_c.valor },
    { id: 'd', obs: e.d, esp: s.valores.e_d.valor },
  ];
  let maximo = 0;
  for (const x of celdas) maximo = Math.max(maximo, x.obs, x.esp);
  const categorias = celdas.map((x) => ({
    id: x.id,
    etiqueta: textos.etiquetas[`celda.${x.id}`],
    valores: [x.obs, x.esp],
  }));
  const detalle = categorias
    .map((cat, i) => `${cat.etiqueta}: ${fmt.entero(celdas[i].obs)} / ${fmt.num(celdas[i].esp, 'dec1')}`)
    .join('; ');
  return {
    tipo: 'barras',
    titulo: textos.grafica_titulo ?? textos.etiquetas.observado,
    resumen: `${textos.etiquetas.observado} / ${textos.etiquetas.esperado} — ${detalle}`,
    series: [
      { id: 'obs', etiqueta: textos.etiquetas.observado, destacada: true },
      { id: 'esp', etiqueta: textos.etiquetas.esperado },
    ],
    categorias,
    ejeY: { etiqueta: textos.etiquetas.eje_frecuencia, dominio: [0, maximo], pista: 'dec1' },
  };
}

export const definicion: Definicion<EntradasChi2Fisher> = {
  id: 'chi-cuadrada-fisher',
  motor: 'ts',
  claves: [
    'resumen',
    'prueba.pearson',
    'prueba.fisher',
    'decision.rechaza',
    'decision.no_rechaza',
    'phi.trivial',
    'phi.pequeno',
    'phi.mediano',
    'phi.grande',
    'or_cond',
    'comparacion',
  ],
  avisos: ['esperados_bajos', 'n_pequeno', 'yates_cero', 'or_cond_borde'],
  salidas: SALIDAS,
  validar(e) {
    const err: Record<string, string> = {};
    for (const k of CELDAS) {
      if (!Number.isInteger(e[k]) || e[k] < 0) err[k] = 'err_entero';
    }
    if (Object.keys(err).length === 0) {
      // Con un margen en 0 las frecuencias esperadas de esa fila o columna son
      // 0, χ² y φ quedan en 0/0 y no hay independencia que contrastar.
      if (e.a + e.b === 0) err.a = err.b = 'err_fila_vacia';
      if (e.c + e.d === 0) err.c = err.d = 'err_fila_vacia';
      if (e.a + e.c === 0) err.a = err.c = 'err_columna_vacia';
      if (e.b + e.d === 0) err.b = err.d = 'err_columna_vacia';
    }
    if (!(e.nivel >= 0.8 && e.nivel <= 0.999)) err.nivel = 'err_rango';
    return Object.keys(err).length ? err : null;
  },
  calcular,
  presentar,
  grafica,
};
